import { expect, test, type Page } from '@playwright/test';

// V22 map design in the real game — Cần Thơ, the sample region: Miệt vườn Phong Điền is an orchard (fruit-tree beds,
// canals with plank crossings); Ông Sáu's bamboo rod (pick two fruit bushes, the canal spot says who has a rod);
// fishing on a canal (the bobber lands on the canal); the hidden thicket nook with its chest.

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

test('Cần Thơ orchard: canals, fruit bushes, bamboo rod, canal fishing, hidden nook', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await ev(page, `window.__adv.travelTo('can-tho', 37, 98)`);
  await ready(page, 'can-tho');
  await page.waitForTimeout(600);
  await ev(page, `(() => { const a = window.__adv, s = a.state, t = a.world.trainer; t.maxHp = t.hp = 1e7; a.spawns.maxActive = 0;
    for (const id of ['vn-ct-1', 'vn-ct-boat', 'vn-ct-river', 'vn-ct-feud']) s.quests.states[id] = { status: 'completed', step: 9, progress: 0 };
    s.save.collection.length = 0; s.adv.party.length = 0; s.addPokemon('pidgey', 20, 'gift'); a.applyParty(); s.quests.refresh(); s.adv.clock = 12 * 60; })()`);

  // the orchard: rows of fruit trees and a canal right here (it was an empty field)
  const look = await ev<Win>(page, `(() => { const m = window.__adv.map; let water = 0, trees = 0;
    for (let x = 20; x < 60; x++) { if (m.terrainAt(x, 93) === 5) water++; }
    for (const s of window.__adv.children.list) if (s.texture?.key === 'ow_tiles' && s.y > 88 * 48 && s.y < 98 * 48 && s.x > 20 * 48 && s.x < 60 * 48) trees++;
    return { water, trees }; })()`);
  expect(look.water).toBeGreaterThan(15);
  expect(look.trees).toBeGreaterThan(10);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cantho-orchard.png` });

  // canal spot without a rod: who has one
  await standAt(page, 56.5, 91.6, 'ct-fish-2');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  const read = () => ev<string[]>(page, `(() => { const out = []; const walk = (o) => { if (o.type === 'Text') out.push(o.text); (o.list ?? []).forEach(walk); }; const l = window.__phaser.scene.getScene('AdvUI').dialogueLayer; if (l) walk(l); return out; })()`);
  let said = (await read()).join(' ');
  await page.keyboard.press('e');
  await page.waitForTimeout(250);
  said += ' ' + (await read()).join(' ');
  expect(said).toContain('Ông Sáu nhà vườn');
  await closeDialogues(page);

  // Ông Sáu's quest: pick two fruit bushes, bring them back → the rod
  await standAt(page, 37.5, 97, 'ct-gardener');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await closeDialogues(page, '1');
  expect(await ev(page, `window.__adv.state.quests.states['vn-ct-rod'].status`)).toBe('active');
  for (const [id, x, y] of [['ct-bush-3', 18.5, 91.9], ['ct-bush-1', 12.5, 77.9]] as const) {
    await standAt(page, x, y, id);
    await page.keyboard.press('e');
    await page.waitForTimeout(300);
    await ev(page, `(() => { for (const e of window.__adv.world.enemies) e.alive = false; })()`); // a hidden Pokémon may jump out
  }
  expect(await ev(page, `window.__adv.state.quests.currentObjective('vn-ct-rod')?.type`)).toBe('talk');
  await standAt(page, 37.5, 97, 'ct-gardener');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.hasFlag('tool:rod')`)).toBe(true);

  // fishing on the canal: the bobber lands on canal water; the bite, reel in
  await standAt(page, 56.5, 91.6, 'ct-fish-2');
  await page.waitForTimeout(1100);
  await page.keyboard.press('e');
  await page.waitForTimeout(150);
  const bob = await ev<Win>(page, `(() => { const f = window.__adv.fishing; return f && { wx: f.wx, wy: f.wy, water: window.__adv.map.terrainAt(Math.floor(f.wx / 48), Math.floor(f.wy / 48)) === 5 }; })()`);
  expect(bob?.water).toBe(true);
  await page.waitForFunction(() => /KÉO CÂU/.test((window as Win).__phaser.scene.getScene('AdvUI').texts.prompt.text), undefined, { timeout: 8000, polling: 16 });
  await page.keyboard.press('e');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cantho-fishing.png` });
  await page.waitForTimeout(250);
  expect(await ev<number>(page, `window.__adv.state.adv.nodes['ct-fish-2']`)).toBeGreaterThanOrEqual(0);
  await ev(page, `(() => { for (const e of window.__adv.world.enemies) e.alive = false; })()`);

  // the thicket nook: sealed, a Grass Pokémon cuts it, the chest inside
  await standAt(page, 65.4, 105.6, 'field:ct-thicket');
  await page.keyboard.down('a'); await page.waitForTimeout(900); await page.keyboard.up('a');
  expect(await ev<number>(page, `window.__adv.world.trainer.x / 48`)).toBeGreaterThan(63.5); // stopped at the thicket, not inside
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('treecko', 18, 'gift'); a.applyParty(); })()`);
  await standAt(page, 65.4, 105.6, 'field:ct-thicket');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cantho-thicket.png` });
  await page.keyboard.press('e');
  // one Pokémon per trainer: Treecko first comes out of its ball
  await page.waitForFunction(() => (window as Win).__adv.state.hasFlag('field:can-tho:ct-thicket'), undefined, { timeout: 5000 });
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.hasFlag('field:can-tho:ct-thicket')`)).toBe(true);
  await page.keyboard.down('a'); await page.waitForTimeout(1300); await page.keyboard.up('a');
  expect(await ev<number>(page, `window.__adv.world.trainer.x / 48`)).toBeLessThan(63.5); // inside the nook
  await page.waitForFunction(() => (window as Win).__adv.interactables.has('chest-ct-orchard-nook'), undefined, { timeout: 5000 });
  const seeds = await ev<number>(page, `window.__adv.state.item('miracle-seed')`);
  await standAt(page, 60.5, 105.9, 'chest-ct-orchard-nook');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await closeDialogues(page);
  expect(await ev<number>(page, `window.__adv.state.item('miracle-seed')`)).toBe(seeds + 1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/cantho-nook.png` });
  expect(errors).toEqual([]);
});
