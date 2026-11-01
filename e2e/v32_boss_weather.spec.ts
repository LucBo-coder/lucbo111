import { expect, test, type Page } from '@playwright/test';
import { closeDialogues, shrineHome, summonShrine } from './bossHelpers';

// V32: losing to a legendary in its shrine plane (no waypoint there) used to throw on every frame and loop the
// blackout forever, and the boss kept the HP it had; a Pokémon's weather ability changes the sky and the HUD.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });

test('losing to Rayquaza in the Sky Pillar: back on your feet, the fight starts over at full HP', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'classic')`);
  await ready(page, 'starter-valley');
  await closeDialogues(page);
  await ev(page, `(() => { const s = window.__adv.state; for (const sp of ['charizard', 'blastoise']) { const p = s.addPokemon(sp, 60, 'caught'); if (!s.inParty(p.uid)) s.togglePartyMember(p.uid); } })()`);
  const h = shrineHome('rayquaza');
  await ev(page, `window.__adv.travelTo('${h.region}', ${h.x}, ${h.y})`);
  await ready(page, h.region);
  await page.waitForTimeout(800);
  expect(await ev<number>(page, `window.__adv.regionDef.waypoints.length`)).toBe(0);
  await ev(page, `(() => { const a = window.__adv; ['boss:kyogre', 'boss:groudon'].forEach((f) => a.state.setFlag(f)); a.applyParty(); })()`);
  await summonShrine(page, 'rayquaza');
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.defId === 'rayquaza', undefined, { timeout: 20_000 });
  await page.waitForTimeout(2000);
  await ev(page, `(() => { const w = window.__adv.world, b = w.boss; w.applyDamage(b, b.maxHp * 0.2, null); window.__adv.persist(); })()`);
  expect(await ev<string[]>(page, `Object.keys(window.__adv.state.adv.bossFights)`)).toContain('rayquaza');
  // the whole party goes down
  for (let k = 0; k < 6 && (await ev<number>(page, `window.__adv.blackoutT`)) < 0; k++) {
    await ev(page, `(() => { const a = window.__adv, w = a.world; for (const x of w.allies) if (x.ownerUid && !x.fainted) w.applyDamage(x, 1e7, w.boss ?? null);
      const r = a.healthyReserves(); if (r[0] && !w.allies.some((x) => x.ownerUid && !x.fainted)) a.summons?.summon(r[0]); })()`);
    await page.waitForTimeout(1500);
  }
  await page.waitForFunction(() => (window as Win).__adv.blackoutT < 0 && (window as Win).__adv.world.state === 'playing', undefined, { timeout: 15_000 });
  const after = await ev<Win>(page, `(() => { const a = window.__adv, w = a.world; return { boss: !!w.boss?.alive, fights: Object.keys(a.state.adv.bossFights), hp: w.trainer.hp, max: w.trainer.maxHp,
    allies: w.allies.filter((x) => !x.fainted).length, x: w.trainer.x, y: w.trainer.y, sx: (a.regionDef.spawn.x + 0.5) * 48, sy: (a.regionDef.spawn.y + 0.5) * 48 }; })()`);
  await page.screenshot({ path: info.outputPath('after-blackout.png') });
  expect(after.boss).toBe(false);
  expect(after.fights).toEqual([]);
  expect(after.hp).toBe(after.max);
  expect(after.allies).toBe(1);
  expect(Math.hypot(after.x - after.sx, after.y - after.sy)).toBeLessThan(120); // woke up at the plane's entrance
  // still playable: walking works, and the rematch starts at full HP
  const x0 = after.x as number;
  await page.keyboard.down('d'); await page.waitForTimeout(700); await page.keyboard.up('d');
  expect(await ev<number>(page, `window.__adv.world.trainer.x`)).toBeGreaterThan(x0 + 20);
  await summonShrine(page, 'rayquaza');
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.alive, undefined, { timeout: 20_000 });
  expect(await ev<number>(page, `(() => { const b = window.__adv.world.boss; return b.hp / b.maxHp; })()`)).toBeGreaterThan(0.97);
  expect(errors).toEqual([]);
});

test('Pelipper calls rain when it joins a fight: banner, HUD timer, rain on screen', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await closeDialogues(page);
  await ev(page, `(() => { const a = window.__adv, s = a.state, w = a.world;
    const p = s.addPokemon('pelipper', 40, 'caught'); p.abilitySlot = 1; /* Drizzle (slot 0 Keen Eye, hidden Rain Dish) */
    if (!s.inParty(p.uid)) s.togglePartyMember(p.uid);
    s.adv.activeUid = p.uid; a.applyParty(); })()`);
  await page.waitForTimeout(800);
  // nothing to fight yet: no rain, but the call line offers it; key C calls it on command
  expect(await ev<unknown>(page, `window.__adv.world.battleWeather`)).toBeNull();
  await page.waitForTimeout(300);
  expect(await ev<string>(page, `${ui}.texts.wcall.text`)).toMatch(/\[C\] .*Gọi Mưa \(Pelipper\)/);
  await page.keyboard.press('c');
  await page.waitForFunction(() => (window as Win).__adv.world.battleWeather?.kind === 'rain', undefined, { timeout: 5_000 });
  await page.waitForTimeout(600);
  // the clock names the called weather (not the sky's), the line under it says who and how long
  expect(await ev<string>(page, `${ui}.texts.clock.text`)).toMatch(/Mưa/);
  expect(await ev<string>(page, `${ui}.texts.clock.text`)).not.toMatch(/Nắng/);
  expect(await ev<string>(page, `${ui}.texts.bweather.text`)).toMatch(/Mưa \(Pelipper\) \d+s/);
  expect(await ev<string>(page, `${ui}.texts.wcall.text`)).toBe('');
  await page.screenshot({ path: info.outputPath('call.png') });
  // the call is spent: a fight starting now does not call it again, so clear it to watch the automatic call
  await ev(page, `(() => { const w = window.__adv.world; w.endBattleWeather(); w.allies[0].weatherCalled = false; })()`);
  await ev(page, `(() => { const a = window.__adv, w = a.world, t = w.trainer; a.spawns && (a.spawns.maxActive = 0);
    const foe = w.spawnWild('geodude', 30, t.x + 160, t.y, { hostile: true }); foe.target = w.allies[0]; w.allies[0].target = foe; })()`);
  await page.waitForFunction(() => (window as Win).__adv.world.battleWeather?.kind === 'rain', undefined, { timeout: 10_000 });
  await page.waitForTimeout(1200);
  expect(await ev<string>(page, `${ui}.texts.bweather.text`)).toMatch(/Mưa \(Pelipper\) \d+s/);
  expect(await ev<boolean>(page, `!!window.__adv.rain?.emitting`)).toBe(true);
  await page.screenshot({ path: info.outputPath('rain.png') });
  // sand on screen too
  await ev(page, `window.__adv.world.setBattleWeather('sand', 20, null)`);
  await page.waitForTimeout(1500);
  expect(await ev<string>(page, `${ui}.texts.bweather.text`)).toMatch(/Bão cát/);
  expect(await ev<boolean>(page, `!!window.__adv.sandFx?.emitting`)).toBe(true);
  await page.screenshot({ path: info.outputPath('sand.png') });
  expect(errors).toEqual([]);
});
