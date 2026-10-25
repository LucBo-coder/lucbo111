import { expect, test, type Page } from '@playwright/test';

// EV training in the real game: a vitamin used from the bag (dialogue target picker), EVs from a real defeat
// with a Power item, the field unit's stats follow, the detail screen shows the spread, and it all survives a reload.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const inAdventure = (page: Page) => page.waitForFunction(() => (window as Win).__adv?.world && !(window as Win).__adv.modal && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 15_000 });

test('EVs: vitamin from the bag, Power item training in a real fight, detail screen, reload', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1)`);
  await inAdventure(page);
  await ev(page, `(() => { const a = window.__adv; a.state.save.collection.length = 0; a.state.adv.party.length = 0; a.state.addPokemon('machop', 20, 'gift'); a.applyParty();
    a.state.addItems({ protein: 2, 'power-bracer': 1 }); const t = a.world.trainer; t.maxHp = t.hp = 1e6; })()`);
  const uid = await ev<string>(page, `window.__adv.state.adv.party[0]`);
  const atk0 = await ev<number>(page, `window.__adv.world.allies[0].stats.atk`);

  // bag → Protein → "Dùng" → pick the Pokémon in the dialogue
  await page.keyboard.press('i');
  await page.waitForTimeout(400);
  await ev(page, `void window.__phaser.scene.getScene('AdvUI').pickEvTarget('protein')`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: info.outputPath('1-vitamin-target.png') });
  for (let i = 0; i < 16 && (await ev<number>(page, `window.__adv.state.owned('${uid}').evs?.atk ?? 0`)) === 0; i++) { await page.keyboard.press(i % 2 ? '1' : 'e'); await page.waitForTimeout(250); }
  expect(await ev(page, `window.__adv.state.owned('${uid}').evs.atk`)).toBe(10);
  expect(await ev(page, `window.__adv.state.item('protein')`)).toBe(1);

  // hold the Power Bracer, beat a real wild Pokémon with the real combat loop
  await ev(page, `window.__phaser.scene.getScene('AdvUI').closeMenu()`);
  await ev(page, `window.__adv.equipItem('${uid}', 'power-bracer')`);
  const before = await ev<number>(page, `window.__adv.state.owned('${uid}').evs.atk`);
  await ev(page, `(() => { const a = window.__adv, w = a.world, t = w.trainer; const e = w.spawnWild('rattata', 5, t.x + 120, t.y, { hostile: true }); e.hp = 1; })()`);
  await page.waitForFunction((b) => (window as Win).__adv.state.owned((window as Win).__adv.state.adv.party[0]).evs.atk > b, before, { timeout: 20_000 });
  const evs = await ev<Record<string, number>>(page, `window.__adv.state.owned('${uid}').evs`);
  expect(evs.atk - before).toBe(8); // Rattata yields Speed; the Power Bracer adds +8 Attack
  expect(evs.spe).toBe(1);
  expect(await ev<number>(page, `window.__adv.world.allies[0].stats.atk`)).toBeGreaterThanOrEqual(atk0);

  // detail screen shows the spread
  await ev(page, `(() => { const ui = window.__phaser.scene.getScene('AdvUI'); ui.selected.party = '${uid}'; ui.openMenu('party'); })()`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('2-detail-ev.png') });

  // persisted
  await ev(page, `window.__adv.exitToMenu()`);
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1)`);
  await inAdventure(page);
  expect(await ev(page, `window.__adv.state.owned('${uid}').evs`)).toEqual(evs);
  expect(errors).toEqual([]);
});
