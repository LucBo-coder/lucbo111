import { expect, test, type Page } from '@playwright/test';

// V22 in the real game, through the keyboard: exploration obstacles in Thung Lũng (thicket, cracked rock, boulder to
// push into its hole — each opening a hidden nook with a chest) and a boat trip on the Hậu River in Cần Thơ
// (board at Ninh Kiều, paddle to the river islet, land, save → reload on the river resumes in the boat).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const T = 48;
const SHOTS = process.env.V22_SHOTS;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
async function closeDialogues(page: Page) {
  for (let i = 0; i < 12 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const near = (page: Page) => ev<string | null>(page, `window.__adv.nearest?.id ?? null`);
const flag = (page: Page, f: string) => ev<boolean>(page, `window.__adv.state.hasFlag('${f}')`);

test('valley: thicket, cracked rock and boulder open their hidden nooks', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await ready(page, 'starter-valley');
  await page.waitForTimeout(500);
  await ev(page, `(() => { const a = window.__adv, s = a.state; const t = a.world.trainer; t.maxHp = t.hp = 1e6;
    s.save.collection.length = 0; s.adv.party.length = 0; s.addPokemon('pidgey', 30, 'starter');
    s.notify({ type: 'talk', target: 'prof' }); s.adv.clock = 12 * 60; a.applyParty(); })()`);
  await page.waitForTimeout(400);

  // ── the thicket: nobody can cut it yet → hint; with a Grass Pokémon it goes ──
  await ev(page, `window.__adv.world.teleport(100.6*${T}, 32.6*${T})`);
  await page.waitForTimeout(500);
  expect(await near(page)).toBe('field:sv-thicket');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  expect(await dialogueOpen(page)).toBe(true);
  await closeDialogues(page);
  expect(await flag(page, 'field:starter-valley:sv-thicket')).toBe(false);
  // the glade is sealed: walking east into the gap stops at the thicket
  await page.keyboard.down('d'); await page.waitForTimeout(900); await page.keyboard.up('d');
  expect(await ev<number>(page, `window.__adv.world.trainer.x / 48`)).toBeLessThan(101.5); // stopped at the thicket, not past it
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('treecko', 12, 'gift'); a.applyParty(); })()`);
  await ev(page, `window.__adv.world.teleport(100.6*${T}, 32.6*${T})`);
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/thicket.png` });
  await page.keyboard.press('e');
  // one Pokémon per trainer: Treecko first comes out of its ball (recall + summon), then cuts
  await page.waitForFunction(() => (window as unknown as { __adv: { state: { hasFlag(f: string): boolean } } }).__adv.state.hasFlag('field:starter-valley:sv-thicket'), null, { timeout: 5000 });
  expect(await flag(page, 'field:starter-valley:sv-thicket')).toBe(true);
  expect(await ev(page, `window.__adv.world.allies.map((a) => a.defId)`)).toEqual(['treecko']);
  // walk in and open the chest
  await page.keyboard.down('d'); await page.waitForTimeout(1300); await page.keyboard.up('d');
  expect(await ev<number>(page, `window.__adv.world.trainer.x / 48`)).toBeGreaterThan(102);
  await ev(page, `window.__adv.world.teleport(104.5*${T}, 33.4*${T})`);
  await page.waitForTimeout(300);
  expect(await near(page)).toBe('chest-sv-glade');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.adv.chests.includes('chest-sv-glade')`)).toBe(true);

  // ── the cracked rock (Machop) ──
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('machop', 15, 'gift'); a.applyParty(); })()`);
  await ev(page, `window.__adv.world.teleport(146.7*${T}, 28.6*${T})`);
  await page.waitForTimeout(500);
  expect(await near(page)).toBe('field:sv-cracked');
  await page.keyboard.press('e');
  await page.waitForFunction(() => (window as unknown as { __adv: { state: { hasFlag(f: string): boolean } } }).__adv.state.hasFlag('field:starter-valley:sv-cracked'), null, { timeout: 5000 });
  expect(await flag(page, 'field:starter-valley:sv-cracked')).toBe(true);

  // ── the boulder: push it east from the west side, one tile per press, into its hole ──
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('makuhita', 20, 'gift'); a.applyParty(); })()`);
  await ev(page, `window.__adv.world.teleport(20.7*${T}, 66.6*${T})`);
  await page.waitForTimeout(1200); // the switch cooldown after Machop came out
  expect(await near(page)).toBe('field:sv-boulder');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/boulder-before.png` });
  await page.keyboard.press('e');
  await page.waitForFunction(() => (window as unknown as { __adv: { state: { hasFlag(f: string): boolean } } }).__adv.state.hasFlag('field:starter-valley:sv-boulder'), null, { timeout: 5000 });
  expect(await flag(page, 'field:starter-valley:sv-boulder')).toBe(true);
  expect(await ev(page, `window.__adv.state.adv.boulders?.['sv-boulder'] ?? null`)).toBeNull();
  await page.keyboard.down('d'); await page.waitForTimeout(1300); await page.keyboard.up('d');
  expect(await ev<number>(page, `window.__adv.world.trainer.x / 48`)).toBeGreaterThan(22.5);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/boulder-after.png` });

  // ── reload: everything stays cleared ──
  await ev(page, `window.__adv.persist()`);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(false)`);
  await ready(page, 'starter-valley');
  await page.waitForTimeout(500);
  for (const id of ['sv-thicket', 'sv-cracked', 'sv-boulder']) expect(await ev(page, `window.__adv.interactables.has('field:${id}')`)).toBe(false);
  expect(errors).toEqual([]);
});

test('Cần Thơ: the boat — locked, board at Ninh Kiều, paddle to the islet, land, resume on the river after reload', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('mudkip', 20, 'starter'); a.applyParty(); a.state.setFlag('badge:an-giang'); a.travelTo('can-tho', 97, 46); })()`);
  await ready(page, 'can-tho');
  await page.waitForTimeout(1000);
  await ev(page, `(() => { const a = window.__adv, t = a.world.trainer; t.maxHp = t.hp = 1e6; a.state.adv.clock = 12 * 60; for (const e of a.world.enemies) e.alive = false; })()`);

  // no boat yet → the hint
  await ev(page, `window.__adv.world.teleport(98.5*${T}, 46.5*${T})`);
  await page.waitForTimeout(400);
  expect(await near(page)).toBe('dock:ct-dock-ninhkieu');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  expect(await dialogueOpen(page)).toBe(true);
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.boating`)).toBe(false);

  // with the boat: board, the trainer is on the water
  await ev(page, `window.__adv.state.setFlag('vehicle:ghe')`);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  expect(await ev(page, `window.__adv.boating`)).toBe(true);
  const onWater = `(() => { const a = window.__adv, t = a.world.trainer; return a.map.terrainAt(Math.floor(t.x/48), Math.floor(t.y/48)); })()`;
  expect(await ev<number>(page, onWater)).toBe(5);
  // the current pushes the boat downstream while idle
  const y0 = await ev<number>(page, `window.__adv.world.trainer.y`);
  await page.waitForTimeout(1200);
  expect(await ev<number>(page, `window.__adv.world.trainer.y`)).toBeGreaterThan(y0 + 5);
  // paddling onto the bank is not possible: pressing east from the west side of the channel keeps us on water
  await page.keyboard.down('a'); await page.waitForTimeout(800); await page.keyboard.up('a');
  expect(await ev<number>(page, onWater)).toBe(5);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/boat.png` });

  // save on the river, reload → still in the boat
  await ev(page, `window.__adv.world.teleport(78.5*${T}, 17.5*${T})`);
  await page.waitForTimeout(300);
  await ev(page, `window.__adv.persist()`);
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1, 'vietnam')`);
  await ready(page, 'can-tho');
  await page.waitForTimeout(800);
  expect(await ev(page, `window.__adv.boating`)).toBe(true);
  expect(await ev<number>(page, onWater)).toBe(5);

  // paddle up to the islet dock with the keyboard and land
  await ev(page, `window.__adv.world.teleport(78.5*${T}, 16.4*${T})`);
  await page.waitForTimeout(300);
  expect(await near(page)).toBe('dock:ct-dock-baibo');
  expect(await ev<string>(page, `window.__phaser.scene.getScene('AdvUI').texts.prompt.text`)).toContain('Lên bờ');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  expect(await ev(page, `window.__adv.boating`)).toBe(false);
  expect(await ev<number>(page, onWater)).not.toBe(5);
  await page.keyboard.down('w'); await page.waitForTimeout(500); await page.keyboard.up('w');
  await ev(page, `window.__adv.world.teleport(78.5*${T}, 10.9*${T})`);
  await page.waitForTimeout(300);
  expect(await near(page)).toBe('chest-ct-baibo');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/islet.png` });
  expect(errors).toEqual([]);
});

test('Chợ nổi Cái Răng: boats at dawn, limited stock per market day, gone after 9:00', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('mudkip', 20, 'starter'); a.applyParty(); a.state.adv.clock = 12 * 60; a.travelTo('can-tho', 111, 92); })()`);
  await ready(page, 'can-tho');
  await page.waitForTimeout(800);
  await ev(page, `(() => { const a = window.__adv, t = a.world.trainer; t.maxHp = t.hp = 1e6; for (const e of a.world.enemies) e.alive = false; a.state.earn(20000); })()`);
  // midday: no market
  expect(await ev(page, `window.__adv.interactables.has('market:fm-medicine')`)).toBe(false);
  // dawn: the boats gather
  await ev(page, `window.__adv.state.adv.clock = 5 * 60 + 10`);
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.interactables.has('market:fm-medicine')`)).toBe(true);
  // from the bank, E opens the boat's shop
  await ev(page, `window.__adv.world.teleport(110.6*${T}, 92.5*${T})`);
  await page.waitForTimeout(400);
  expect(await near(page)).toBe('market:fm-medicine');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/floating-market.png` });
  await page.keyboard.press('e');
  await page.waitForFunction(() => !!(window as Win).__adv.ui.shop, undefined, { timeout: 5000 });
  await ev(page, `window.__adv.ui.shop.select('superpotion')`);
  expect(await ev(page, `window.__adv.ui.shop.maxQty()`)).toBe(3);
  await ev(page, `window.__adv.ui.shop.setQty(99)`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  expect(await ev(page, `window.__adv.state.item('superpotion')`)).toBe(3);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // same day: sold out
  await page.keyboard.press('e');
  await page.waitForFunction(() => !!(window as Win).__adv.ui.shop, undefined, { timeout: 5000 });
  await ev(page, `window.__adv.ui.shop.select('superpotion')`);
  expect(await ev(page, `window.__adv.ui.shop.maxQty()`)).toBe(0);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.state.adv.market.bought['fm-medicine:superpotion']`)).toBe(3);
  // 9:00: the market breaks up
  await ev(page, `window.__adv.state.adv.clock = 9 * 60 + 1`);
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.interactables.has('market:fm-medicine')`)).toBe(false);
  // next day at dawn: restocked
  await ev(page, `(() => { const a = window.__adv.state.adv; a.day = (a.day ?? 0) + 1; a.clock = 5 * 60 + 5; })()`);
  await page.waitForTimeout(300);
  await page.keyboard.press('e');
  await page.waitForFunction(() => !!(window as Win).__adv.ui.shop, undefined, { timeout: 5000 });
  await ev(page, `window.__adv.ui.shop.select('superpotion')`);
  expect(await ev(page, `window.__adv.ui.shop.maxQty()`)).toBe(3);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});
