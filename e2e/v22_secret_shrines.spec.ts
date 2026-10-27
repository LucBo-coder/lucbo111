import { expect, test, type Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { secretOf, shrineHome } from './bossHelpers';

// Hidden shrines (LEGENDARY_SHRINES.md mục 8) in the real game: on the valley there is no shrine any more, only a cracked
// rock; a Pokémon that knows Rock Smash breaks it, the entrance appears (once, remembered), it stays sealed until the
// story allows, then leads into the valley's sanctum (Mew's pocket); the way back lands next to the entrance.
// Every dimension and sanctum loads without errors (V22_SHOTS=<dir> saves a screenshot of each).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const SHOTS = process.env.V22_SHOTS;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI') && !(window as Win).__adv.modal, map, { timeout: 20_000 });
const dialogueText = (page: Page) => ev<string>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return d ? d.list.map((o) => o.text ?? '').join(' ') : ''; })()`);
async function choose(page: Page, n: string): Promise<void> {
  for (let i = 0; i < 20 && !(await ev<boolean>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return !!d && d.list.length > 6; })()`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  await page.keyboard.press(n);
}
async function closeAll(page: Page): Promise<void> {
  for (let i = 0; i < 12 && (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}
function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  return errors;
}
async function start(page: Page): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'classic')`);
  await ready(page, 'starter-valley');
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('machamp', 30, 'gift'); a.applyParty(); a.spawns.maxActive = 0; for (const e of a.world.enemies) e.alive = false; const t = a.world.trainer; t.maxHp = t.hp = 1e9; })()`);
}

test('Mew\'s entrance: hidden behind a cracked rock, smashed open, sealed until Mewtwo, into the sanctum and back', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = errorsOf(page);
  await start(page);
  const gate = secretOf('mew');
  expect(gate.region).toBe('starter-valley');
  // nothing of a shrine on the map: no ritual spot, no entrance; only the obstacle
  expect(await ev(page, `window.__adv.map.def.legendaries?.length ?? 0`)).toBe(0);
  expect(await ev(page, `window.__adv.interactables.has('secret:to-mew')`)).toBe(false);
  expect(await ev(page, `window.__adv.interactables.has('field:secret-mew')`)).toBe(true);
  // walk up to the rock and press E: Machamp smashes it, the entrance opens
  await ev(page, `window.__adv.world.teleport(${(gate.x + 0.5) * 48}, ${(gate.y + 1.6) * 48})`);
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe('field:secret-mew');
  await page.keyboard.press('e');
  await page.waitForFunction(() => (window as Win).__adv.secrets.debug().found.includes('to-mew'), null, { timeout: 5000 });
  expect(await ev(page, `window.__adv.state.hasFlag('secret:starter-valley:to-mew')`)).toBe(true);
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/secret-mew-found.png` });
  await closeAll(page);
  // sealed: Mew's sanctum waits for Mewtwo's defeat
  await ev(page, `void window.__adv.secrets.interact('secret:to-mew')`);
  await page.waitForTimeout(300);
  expect(await dialogueText(page)).not.toMatch(/Đi vào/);
  await closeAll(page);
  await ev(page, `window.__adv.state.setFlag('boss:mewtwo')`);
  await ev(page, `void window.__adv.secrets.interact('secret:to-mew')`);
  await choose(page, '1');
  await ready(page, 'valley-hollow');
  // inside: Mew's pocket (its ritual spot right there), not Mesprit's
  const near = await ev<Record<string, number>>(page, `(() => { const a = window.__adv, t = a.world.trainer, d = (s) => { const p = a.shrines.spot(s); return Math.hypot(p.P.x - t.x, p.P.y - t.y) / 48; }; return { mew: d('mew'), mesprit: d('mesprit') }; })()`);
  expect(near.mew).toBeLessThan(25);
  expect(near.mesprit).toBeGreaterThan(near.mew);
  await page.waitForTimeout(600);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/secret-mew-sanctum.png` });
  // the way back lands next to the entrance on the valley
  const back = await ev<{ x: number; y: number }>(page, `(() => { const p = window.__adv.regionDef.portals.find((x) => x.id === 'back-mew'); return { x: p.x, y: p.y }; })()`);
  await ev(page, `window.__adv.world.teleport(${(back.x + 0.5) * 48}, ${(back.y + 1) * 48 + 16})`);
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe('back-mew');
  await page.keyboard.press('e');
  await choose(page, '1');
  await ready(page, 'starter-valley');
  const t = await ev<{ x: number; y: number }>(page, `({ x: window.__adv.world.trainer.x / 48, y: window.__adv.world.trainer.y / 48 })`);
  expect(Math.hypot(t.x - gate.x, t.y - gate.y)).toBeLessThan(4);
  // remembered: after a reload the entrance is still there
  await ev(page, `window.__adv.persist()`);
  await page.waitForTimeout(600);
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1, 'classic')`);
  await ready(page, 'starter-valley');
  await page.waitForTimeout(800);
  expect(await ev(page, `window.__adv.secrets.debug().found`)).toContain('to-mew');
  expect(await ev(page, `window.__adv.interactables.has('field:secret-mew')`)).toBe(false);
  expect(errors).toEqual([]);
});

test('every dimension and sanctum loads: its shrines stand there, no errors', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = errorsOf(page);
  await start(page);
  const planes = readdirSync('src/data/world').filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync('src/data/world/' + f, 'utf8')))
    .filter((d) => d.void && d.id !== 'abyssal-depths' && d.id !== 'origin-temple') as { id: string; legendaries: { id: string }[] }[];
  expect(planes.length).toBe(13);
  for (const p of planes) {
    const h = shrineHome(p.legendaries[0].id);
    await ev(page, `window.__adv.travelTo('${p.id}', ${h.x}, ${h.y})`);
    await ready(page, p.id);
    await page.waitForTimeout(500);
    const views = await ev<string[]>(page, `window.__adv.shrines.debug().views`);
    expect(views.sort(), p.id).toEqual(p.legendaries.map((l) => l.id).sort());
    expect(await ev(page, `window.__adv.map.solidAt(${h.x}, ${h.y})`), p.id).toBe(false);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/plane-${p.id}.png` });
  }
  expect(errors).toEqual([]);
});

test('quest guidance: the tracker leads to the hidden entrance (area ring), then the entrance, then the shrine', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await start(page);
  const gate = secretOf('zapdos');
  const objText = () => ev<string>(page, `window.__phaser.scene.getScene('AdvUI').texts.obj.text`);
  await ev(page, `window.__adv.travelTo('${gate.region}', ${gate.x}, ${gate.y + 6})`);
  await ready(page, gate.region);
  await ev(page, `(() => { const st = window.__adv.state; st.quests.states['q-legend-zapdos'] = { status: 'active', step: 0, progress: 0 }; st.trackedQuest = 'q-legend-zapdos'; })()`);
  await page.waitForTimeout(500);
  // not found yet: the map and the obstacle, a rough distance (~) — never the exact tile
  expect(await objText()).toMatch(/lối vào bí mật ở Bờ Biển San Hô.*Đập đá.*~\d+m/s);
  await ev(page, `window.__phaser.scene.getScene('AdvUI').openMenu('map')`);
  await page.waitForTimeout(400);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/quest-ring.png` });
  await ev(page, `window.__phaser.scene.getScene('AdvUI').openMenu('quests')`);
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // a villager's rumour: the area of the rock, no tile
  await ev(page, `(() => { const a = window.__adv, n = a.regionDef.npcs.find((x) => x.id === 'coast-old-sailor'); void a.talkTo(n, null); })()`);
  await page.waitForTimeout(400);
  let said = '';
  for (let i = 0; i < 8 && (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) { said += ' ' + (await dialogueText(page)); await page.keyboard.press('e'); await page.waitForTimeout(250); }
  expect(said).toMatch(/tảng đá nứt cứ lấp lánh.*Zapdos/s);
  await closeAll(page);
  // found: the entrance itself
  await ev(page, `window.__adv.state.setFlag('secret:${gate.region}:to-zapdos')`);
  await page.waitForTimeout(400);
  expect(await objText()).toMatch(/vào Bí Cảnh Bờ Biển qua/);
  // inside the sanctum: the shrine
  const h = shrineHome('zapdos');
  await ev(page, `window.__adv.travelTo('${h.region}', ${h.x}, ${h.y})`);
  await ready(page, h.region);
  await page.waitForTimeout(400);
  expect(await objText()).toMatch(/Đánh bại Zapdos \(Bí Cảnh Bờ Biển\)/);
  expect(errors).toEqual([]);
});
