import { expect, test, type Page } from '@playwright/test';

// V22 conservation in the real game (Vietnam Odyssey, Cà Mau): no sites before Seviper's story is done; when the
// story quest completes the six mangrove sites appear at once; E on each plants a sapling (it stays on the map),
// the epilogue quest counts them, ecosystem health climbs to "Trù phú" and pays its gift once; after a reload the
// saplings are still there and no site is left.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const SHOTS = process.env.V22_SHOTS;
const sites = (page: Page) => ev<{ id: string; x: number; y: number }[]>(page, `[...window.__adv.interactables.values()].filter(i => i.kind === 'eco').map(i => ({ id: i.id, x: i.x, y: i.y }))`);
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);

test('Cà Mau mangrove restoration', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await page.waitForTimeout(600);
  expect(await sites(page)).toEqual([]);

  // Seviper's story ends: complete the last objective for real
  await ev(page, `(() => { const a = window.__adv, qs = a.state.quests; for (const id of ['vn-cm-1', 'mn-cm-1', 'mn-cm-2', 'vn-cm-2', 'mn-cm-3']) qs.states[id] = { status: 'completed', step: 9, progress: 0 };
    a.state.setFlag('boss:seviper'); a.questEvent({ type: 'talk', target: 'cm-ranger' }); })()`);
  await page.waitForTimeout(300);
  for (let i = 0; i < 6 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  expect(await ev(page, `window.__adv.state.quests.states['vn-cm-3'].status`)).toBe('completed');
  expect((await sites(page)).length).toBe(6);
  await ev(page, `(() => { const a = window.__adv; a.state.quests.refresh(); a.state.quests.start('vn-cm-eco'); a.world.trainer.maxHp = a.world.trainer.hp = 1e6; })()`);

  const list = await sites(page);
  const before = await ev<number>(page, `window.__adv.state.item('miracle-seed')`);
  for (const [i, s] of list.entries()) {
    await ev(page, `window.__adv.world.teleport(${s.x}, ${s.y} + 30)`);
    await page.waitForTimeout(250);
    expect(await ev(page, `window.__adv.nearest?.id`)).toBe(s.id);
    if (i === 0 && SHOTS) await page.screenshot({ path: `${SHOTS}/eco-site.png` });
    await page.keyboard.press('e');
    await page.waitForTimeout(250);
    for (let k = 0; k < 6 && (await dialogueOpen(page)); k++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  }
  expect(await sites(page)).toEqual([]);
  expect(await ev(page, `window.__adv.state.hasFlag('eco:ca-mau:thriving')`)).toBe(true);
  expect(await ev<number>(page, `window.__adv.state.item('miracle-seed')`)).toBe(before + 1);
  expect(await ev(page, `window.__adv.state.quests.currentObjective('vn-cm-eco')?.type`)).toBe('talk');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/eco-planted.png` });

  // reload: saplings stay, no site left, the gift is not paid twice
  await ev(page, `(() => { const a = window.__adv; a.persist(); a.travelTo('ca-mau', ${Math.round(list[0].x / 48)}, ${Math.round(list[0].y / 48) + 2}); })()`);
  await ready(page, 'ca-mau');
  await page.waitForTimeout(500);
  expect(await sites(page)).toEqual([]);
  expect(await ev<number>(page, `window.__adv.state.item('miracle-seed')`)).toBe(before + 1);
  // the reputation board shows the province's ecosystem
  await ev(page, `(() => { const u = window.__phaser.scene.getScene('AdvUI'); u.questFilter = 'rep'; u.openMenu('quests'); })()`);
  await page.waitForTimeout(300);
  const texts = await ev<string[]>(page, `window.__phaser.scene.getScene('AdvUI').menu.list.filter(o => o.type === 'Text').map(o => o.text)`);
  expect(texts.join('\n')).toContain('Sinh thái: Trù phú 100/100');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/eco-board.png` });
  expect(errors).toEqual([]);
});
