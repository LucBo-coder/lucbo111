import { expect, test, type Page } from '@playwright/test';

// Save slots: progress lives in its own slot, Load Game restores it after a reload,
// and NEW GAME wipes everything of that slot (nothing carried over) while other slots stay intact.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const menu = (page: Page) => page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
const inAdventure = (page: Page) => page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 15_000 });

test('slots: independent progress, load after reload, new game wipes everything', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await menu(page);

  // slot 1: some progress
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1)`);
  await inAdventure(page);
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('pikachu', 20, 'gift'); a.state.save.currency = 999; a.state.addItems({ ultraball: 7 }); a.state.setFlag('boss:mega-venusaur'); a.persist(); })()`);
  await ev(page, `window.__adv.exitToMenu()`);
  await menu(page);

  // slot 2: different progress
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 2)`);
  await inAdventure(page);
  const fresh2 = await ev<{ coll: number; money: number; flags: number }>(page, `({ coll: window.__adv.state.save.collection.length, money: window.__adv.state.save.currency, flags: window.__adv.state.adv.flags.length })`);
  expect(fresh2).toEqual({ coll: 0, money: 0, flags: 0 }); // a new game starts empty
  await ev(page, `(() => { const a = window.__adv; a.state.save.currency = 42; a.persist(); })()`);
  await ev(page, `window.__adv.exitToMenu()`);
  await menu(page);

  // reload the page → Load Game shows both slots
  await page.reload();
  await menu(page);
  await ev(page, `window.__phaser.scene.getScene('Menu').openSlots('load')`);
  await page.waitForTimeout(400);
  const slots = await ev<({ money: number; collection: number } | null)[]>(page, `window.__save.listSlots()`);
  expect(slots[0]?.money).toBe(999);
  expect(slots[0]?.collection).toBe(1);
  expect(slots[1]?.money).toBe(42);
  expect(slots[2]).toBeNull();
  await page.screenshot({ path: info.outputPath('load-game.png') });

  // load slot 1
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1)`);
  await inAdventure(page);
  expect(await ev(page, `window.__adv.state.save.collection.map(c => c.species)`)).toEqual(['pikachu']);
  expect(await ev(page, `window.__adv.state.save.inventory.ultraball`)).toBe(7);
  await ev(page, `window.__adv.exitToMenu()`);
  await menu(page);

  // NEW GAME over slot 1 → nothing left
  await ev(page, `window.__phaser.scene.getScene('Menu').openSlots('new')`);
  await page.waitForTimeout(300);
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1)`);
  await inAdventure(page);
  const wiped = await ev<Record<string, unknown>>(page, `(() => { const s = window.__adv.state.save; return { coll: s.collection.length, caught: s.pokedex.caught.length, money: s.currency, inv: Object.keys(s.inventory).length, flags: s.adventure.flags.length, legends: Object.keys(s.adventure.legends).length, runs: s.stats.runs }; })()`);
  expect(wiped).toEqual({ coll: 0, caught: 0, money: 0, inv: 0, flags: 0, legends: 0, runs: 0 });
  const after = await ev<({ money: number } | null)[]>(page, `window.__save.listSlots()`);
  expect(after[1]?.money).toBe(42); // slot 2 untouched
  expect(errors).toEqual([]);
});
