import { expect, test, type Page } from '@playwright/test';

// V22 map design in the real game — Cà Mau and An Giang after the Cần Thơ sample: Ngư dân Tư Sáu's rod (mangrove
// snails), fishing on a mangrove creek, the mangrove-roots nook; Đồng Nước Nổi's flooded paddies, fishing on a plot,
// melaleuca honey and điên điển flowers for Cô Sáu's flood-season harvest; the cracked rock in Thất Sơn.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const T = 48;
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const SHOTS = process.env.V22_SHOTS;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
async function closeDialogues(page: Page, pick?: string) {
  for (let i = 0; i < 12 && (await dialogueOpen(page)); i++) { await page.keyboard.press(pick ?? 'e'); await page.waitForTimeout(180); if (pick) await page.keyboard.press('e'); }
}
async function standAt(page: Page, x: number, y: number, id: string) {
  await ev(page, `window.__adv.world.teleport(${x}*${T}, ${y}*${T})`);
  await page.waitForFunction((i) => (window as Win).__adv.nearest?.id === i, id, { timeout: 5000 });
}
const read = (page: Page) => ev<string[]>(page, `(() => { const out = []; const walk = (o) => { if (o.type === 'Text') out.push(o.text); (o.list ?? []).forEach(walk); }; const l = window.__phaser.scene.getScene('AdvUI').dialogueLayer; if (l) walk(l); return out; })()`);
const clearWild = (page: Page) => ev(page, `(() => { for (const e of window.__adv.world.enemies) e.alive = false; })()`);
async function gather(page: Page, id: string, x: number, y: number) {
  await standAt(page, x + 0.5, y + 0.9, id);
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await clearWild(page); // a hidden Pokémon may jump out
}
async function fish(page: Page, id: string, x: number, y: number) {
  await standAt(page, x + 0.5, y + 0.6, id);
  await page.waitForTimeout(1100);
  await page.keyboard.press('e');
  await page.waitForTimeout(150);
  const bob = await ev<Win>(page, `(() => { const f = window.__adv.fishing; return f && { water: window.__adv.map.terrainAt(Math.floor(f.wx / 48), Math.floor(f.wy / 48)) === 5 }; })()`);
  expect(bob?.water, id).toBe(true);
  await page.waitForFunction(() => /KÉO CÂU/.test((window as Win).__phaser.scene.getScene('AdvUI').texts.prompt.text), undefined, { timeout: 8000, polling: 16 });
  await page.keyboard.press('e');
  await page.waitForTimeout(250);
  expect(await ev<number>(page, `window.__adv.state.adv.nodes['${id}']`)).toBeGreaterThanOrEqual(0);
  await clearWild(page);
}
async function openNook(page: Page, region: string, field: string, fx: number, fy: number, chest: string, cx: number, cy: number, species: string) {
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('${species}', 20, 'gift'); a.applyParty(); })()`);
  await standAt(page, fx + 1.4, fy + 0.6, 'field:' + field);
  await page.keyboard.press('e');
  // one Pokémon per trainer: the member able to do it comes out of its ball first
  await page.waitForFunction((f) => (window as Win).__adv.state.hasFlag(f), `field:${region}:${field}`, { timeout: 5000 });
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.hasFlag('field:${region}:${field}')`)).toBe(true);
  await page.waitForFunction((c) => (window as Win).__adv.interactables.has(c), chest, { timeout: 5000 });
  await standAt(page, cx + 0.5, cy + 0.9, chest);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.adv.chests.includes('${chest}')`), chest).toBe(true);
}

test('Cà Mau & An Giang: rod, creek and paddy fishing, honey, flood harvest, nooks', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await page.waitForTimeout(600);
  await ev(page, `(() => { const a = window.__adv, s = a.state, t = a.world.trainer; t.maxHp = t.hp = 1e7; a.spawns.maxActive = 0;
    for (const id of ['vn-cm-1']) s.quests.states[id] = { status: 'completed', step: 9, progress: 0 };
    s.save.collection.length = 0; s.adv.party.length = 0; s.addPokemon('pidgey', 20, 'gift'); a.applyParty(); s.quests.refresh(); s.adv.clock = 12 * 60; })()`);

  // a creek without a rod: who has one
  await standAt(page, 40.5, 47.6, 'cm-fish-2');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  let said = (await read(page)).join(' ');
  await page.keyboard.press('e');
  await page.waitForTimeout(250);
  said += ' ' + (await read(page)).join(' ');
  expect(said).toContain('Ngư dân Tư Sáu');
  await closeDialogues(page);

  // Tư Sáu's rod: two snail beds in the mangroves, back to him
  await standAt(page, 46.5, 98.6, 'cm-fisher');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await closeDialogues(page, '1');
  expect(await ev(page, `window.__adv.state.quests.states['vn-cm-rod'].status`)).toBe('active');
  await gather(page, 'cm-snail-1', 8, 46);
  await gather(page, 'cm-snail-2', 24, 60);
  expect(await ev(page, `window.__adv.state.quests.currentObjective('vn-cm-rod')?.type`)).toBe('talk');
  await standAt(page, 46.5, 98.6, 'cm-fisher');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.hasFlag('tool:rod')`)).toBe(true);
  await fish(page, 'cm-fish-2', 40, 47);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/camau-creek.png` });

  // the mangrove-roots nook
  await openNook(page, 'ca-mau', 'cm-roots', 38, 66, 'chest-cm-roots-nook', 34, 66, 'treecko');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/camau-nook.png` });

  // An Giang: the flooded paddies
  await ev(page, `window.__adv.travelTo('an-giang', 86, 104)`);
  await ready(page, 'an-giang');
  await page.waitForTimeout(600);
  await ev(page, `(() => { const a = window.__adv, s = a.state, t = a.world.trainer; t.maxHp = t.hp = 1e7; a.spawns.maxActive = 0;
    s.quests.states['vn-ag-1'] = { status: 'completed', step: 9, progress: 0 }; s.quests.refresh(); })()`);
  const look = await ev<Win>(page, `(() => { const m = window.__adv.map; let water = 0; for (let y = 64; y < 100; y++) for (let x = 98; x < 122; x++) if (m.terrainAt(x, y) === 5) water++; return { water }; })()`);
  expect(look.water).toBeGreaterThan(250);
  await ev(page, `window.__adv.world.teleport(110.5 * 48, 80.5 * 48)`);
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/angiang-paddies.png` });

  // Cô Sáu's flood-season harvest: flowers, honey, a catch
  await standAt(page, 76.5, 72.6, 'ag-sugar-palm');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await closeDialogues(page, '1');
  expect(await ev(page, `window.__adv.state.quests.states['vn-ag-flood-harvest'].status`)).toBe('active');
  await gather(page, 'ag-honey-1', 64, 90);
  await gather(page, 'ag-flower-1', 104, 74);
  await gather(page, 'ag-flower-2', 116, 86);
  expect(await ev(page, `window.__adv.state.quests.currentObjective('vn-ag-flood-harvest')?.target`)).toBe('fish');
  await fish(page, 'ag-fish-1', 110, 68);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/angiang-paddy-fishing.png` });
  expect(await ev(page, `window.__adv.state.quests.currentObjective('vn-ag-flood-harvest')?.type`)).toBe('talk');
  await standAt(page, 76.5, 72.6, 'ag-sugar-palm');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.quests.states['vn-ag-flood-harvest'].status`)).toBe('completed');

  // the cracked rock in Thất Sơn
  await openNook(page, 'an-giang', 'ag-cracked', 81, 30, 'chest-ag-that-son-nook', 77, 30, 'geodude');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/angiang-nook.png` });
  expect(errors).toEqual([]);
});
