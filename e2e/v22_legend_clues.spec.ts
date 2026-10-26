import { expect, test, type Page } from '@playwright/test';

// V22 legendary investigation in the real game (Coral Coast, Lugia): no clues before the story unlocks Lugia; after
// it, three glimmers on the map; E on each shows the clue and counts it; the third completes the investigation
// (conditions revealed, +1 capture throw); found clues stay gone after reload.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
const SHOTS = process.env.V22_SHOTS;
const clueIds = (page: Page) => ev<string[]>(page, `[...window.__adv.interactables.keys()].filter(k => k.startsWith('clue:lugia'))`);

async function closeDialogues(page: Page) {
  for (let i = 0; i < 12 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}

test('Lugia investigation: clues, completion, capture bonus, reload', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1)`);
  await ready(page, 'starter-valley');
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('pikachu', 40, 'gift'); a.applyParty(); a.state.setFlag('boss:mega-venusaur'); a.travelTo('coral-coast', 40, 30); })()`);
  await ready(page, 'coral-coast');
  await page.waitForTimeout(500);
  expect(await clueIds(page)).toEqual([]); // Lugia still locked: no clues

  await ev(page, `(() => { const a = window.__adv; for (const f of ['boss:articuno', 'boss:zapdos', 'boss:moltres']) a.state.setFlag(f); a.travelTo('coral-coast', 40, 30); })()`);
  await ready(page, 'coral-coast');
  await page.waitForTimeout(500);
  expect((await clueIds(page)).sort()).toEqual(['clue:lugia-1', 'clue:lugia-2', 'clue:lugia-3']);

  const clues = await ev<{ id: string; x: number; y: number }[]>(page, `window.__adv.interactables && [...window.__adv.interactables.values()].filter(i => i.id.startsWith('clue:lugia')).map(i => ({ id: i.id, x: i.obj.x, y: i.obj.y })).sort((a, b) => a.id < b.id ? -1 : 1)`);
  for (const [i, c] of clues.entries()) {
    await ev(page, `(() => { const t = window.__adv.world; t.trainer.maxHp = t.trainer.hp = 1e6; t.teleport(${(c.x + 0.5) * 48}, ${(c.y + 0.5) * 48 + 40}); })()`);
    await page.waitForTimeout(300);
    expect(await ev(page, `window.__adv.nearest?.id`)).toBe(c.id);
    if (i === 0 && SHOTS) await page.screenshot({ path: `${SHOTS}/clue-glimmer.png` });
    await page.keyboard.press('e');
    await page.waitForFunction(() => (window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer, undefined, { timeout: 3000 });
    if (i === 2 && SHOTS) {
      for (let k = 0; k < 2; k++) { await page.keyboard.press('e'); await page.waitForTimeout(200); }
      await page.screenshot({ path: `${SHOTS}/clue-complete.png` });
    }
    await closeDialogues(page);
    expect(await ev(page, `window.__adv.state.hasFlag('clue:${c.id.slice(5)}')`)).toBe(true);
  }
  expect(await clueIds(page)).toEqual([]);

  // capture window: one extra throw
  const left = await ev<number>(page, `(() => { const a = window.__adv; const u = a.world.spawnBoss('lugia', 50, false, { x: a.world.trainer.x + 300, y: a.world.trainer.y });
    u.boss.weakened = true; a.openLegendCapture('lugia', 50); return a.legendCap?.left; })()`);
  const base = await ev<number>(page, `5`);
  expect(left).toBe(base + 1);

  // reload: found clues stay found
  await ev(page, `(() => { const a = window.__adv; a.legendCap = null; for (const e of a.world.enemies) if (e.kind === 'boss') a.world.removeEnemy(e); a.persist(); })()`);
  await ev(page, `window.__adv.travelTo('coral-coast', 40, 30)`);
  await ready(page, 'coral-coast');
  await page.waitForTimeout(400);
  expect(await clueIds(page)).toEqual([]);
  expect(errors).toEqual([]);
});
