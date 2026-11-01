import { expect, test, type Page } from '@playwright/test';

// Lore weather in the real game: Zapdos raises a thunderstorm (dark sky, rain, lightning bolts, GIÔNG button),
// Tornadus a gale (wind streaks), Rayquaza calms the sky (YÊN button clears the weather).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;

async function start(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'ca-mau' && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
  for (let i = 0; i < 20 && (await ev<boolean>(page, `!!${ui}.dialogueLayer`)); i++) { await ev(page, `window.__adv.interact()`); await page.waitForTimeout(150); }
  await ev(page, `window.__adv.spawns && (window.__adv.spawns.maxActive = 0)`);
  return errors;
}
async function sendOut(page: Page, species: string): Promise<void> {
  await ev(page, `(() => { const a = window.__adv, s = a.state; const p = s.addPokemon('${species}', 60, 'wild');
    if (!s.inParty(p.uid)) s.togglePartyMember(p.uid); s.adv.activeUid = p.uid; a.applyParty(); })()`);
  await page.waitForTimeout(800);
}
async function fight(page: Page): Promise<void> {
  await ev(page, `(() => { const w = window.__adv.world, t = w.trainer; const foe = w.spawnWild('magikarp', 5, t.x + 170, t.y, { hostile: true });
    foe.maxHp = foe.hp = 1e6; foe.target = w.allies[0]; w.allies[0].target = foe; })()`);
}

test('Zapdos raises a thunderstorm with lightning; it ends when Zapdos goes back', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors = await start(page);
  await sendOut(page, 'zapdos');
  expect(await ev(page, `${ui}.gimmicks.viewOf('weather')`)).toMatchObject({ label: 'GIÔNG', icon: 'wx-thunderstorm', state: 'ready' });
  await fight(page);
  await page.waitForFunction(() => (window as Win).__adv.world.battleWeather?.kind === 'thunderstorm', undefined, { timeout: 8000 });
  expect(await ev<string>(page, `${ui}.texts.clock.text`)).toMatch(/Giông bão/);
  // a bolt within a few seconds (one every 3 s)
  await ev(page, `(() => { window.__bolts = 0; const w = window.__adv.world, emit = w.emit.bind(w); w.emit = (e) => { if (e.t === 'lightning') window.__bolts++; emit(e); }; })()`);
  await page.waitForFunction(() => (window as Win).__bolts > 0, undefined, { timeout: 8000 });
  expect(await ev<boolean>(page, `!!window.__adv.rain?.emitting`)).toBe(true);
  await page.screenshot({ path: info.outputPath('zapdos-storm.png') });
  // recall Zapdos: the storm goes with it
  await ev(page, `(() => { const a = window.__adv; a.state.recallActive(); a.applyParty(); })()`);
  await page.waitForFunction(() => !(window as Win).__adv.world.battleWeather, undefined, { timeout: 5000 });
  expect(errors).toEqual([]);
});

test('Tornadus: gale streaks · Rayquaza: the YÊN button calms the sky', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors = await start(page);
  await sendOut(page, 'tornadus');
  await fight(page);
  await page.waitForFunction(() => (window as Win).__adv.world.battleWeather?.kind === 'wind', undefined, { timeout: 8000 });
  await page.waitForTimeout(1200);
  expect(await ev<boolean>(page, `!!window.__adv.windFx?.emitting`)).toBe(true);
  await page.screenshot({ path: info.outputPath('tornadus-wind.png') });
  // Rayquaza comes out under the gale: its entry calms it
  await sendOut(page, 'rayquaza');
  await fight(page);
  await page.waitForFunction(() => !(window as Win).__adv.world.battleWeather, undefined, { timeout: 8000 });
  expect(await ev(page, `${ui}.gimmicks.viewOf('weather')`)).toMatchObject({ label: 'YÊN', icon: 'wx-calm' });
  // a new rain, then key C: Rayquaza calms it on command once its cooldown is over
  await ev(page, `(() => { const w = window.__adv.world; w.allies[0].weatherCallAt = -999; w.setBattleWeather('rain', 30, null); })()`);
  await page.waitForTimeout(300);
  await page.keyboard.press('c');
  await page.waitForFunction(() => !(window as Win).__adv.world.battleWeather, undefined, { timeout: 5000 });
  await page.screenshot({ path: info.outputPath('rayquaza-calm.png') });
  expect(errors).toEqual([]);
});
