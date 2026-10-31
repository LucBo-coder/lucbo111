import { expect, test, type Page } from '@playwright/test';

// V30: the finale of Mạch Nguồn in the real game — Torterra, calmed, stands next to the cables' pylon and strikes it
// and the Bình Minh waves with Earthquake; it cannot be hurt or caught, and it leaves with the encounter.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!${ui}.dialogueLayer`);
const closeDialogues = async (page: Page) => { for (let i = 0; i < 20 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(200); } };

test('Torterra fights on the player\'s side to cut the cables, then the finale goes on', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  await closeDialogues(page);
  await ev(page, `(() => { const a = window.__adv; ['torterra', 'groudon', 'dragonite'].forEach(s => a.state.addPokemon(s, 100, 'gift')); a.applyParty(); a.travelTo('ha-noi', 24, 26); })()`);
  await ready(page, 'ha-noi');
  await closeDialogues(page);
  // straight to the last step of the finale: Torterra calmed, the cables still up
  await ev(page, `(() => { const a = window.__adv, st = a.state, qs = st.quests;
    st.setFlag('boss:torterra');
    st.adv.storySeen = qs.defs.flatMap(q => [q.cutscene?.start, q.cutscene?.complete]).filter(Boolean);
    for (const id of ['vn-hn-1', 'vn-hn-2', 'mn-hn-1', 'mn-hn-2']) qs.states[id] = { status: 'completed', step: 9, progress: 0 };
    qs.states['mn-hn-3'] = { status: 'active', step: 4, progress: 0 };
    qs.refresh(); })()`);
  expect(await ev(page, `window.__adv.state.quests.currentObjective('mn-hn-3').target`)).toBe('mn-hn-3:cables');
  // the encounter starts next to the pylon: device + ally
  await page.waitForFunction(() => !!(window as Win).__adv.story.run?.ally, undefined, { timeout: 15_000 });
  const ally = await ev<{ name: string; hostile: boolean; noCapture: boolean; full: boolean }>(page,
    `(() => { const u = window.__adv.story.run.ally; return { name: u.name, hostile: u.hostile, noCapture: u.noCapture, full: u.hp === u.maxHp }; })()`);
  expect(ally).toEqual({ name: 'Torterra (đồng minh)', hostile: false, noCapture: true, full: true });
  // hits on it change nothing (it is never a foe)
  await ev(page, `(() => { const a = window.__adv, u = a.story.run.ally; a.world.applyDamage(u, 999999, a.world.allies[0]); })()`);
  await page.waitForTimeout(300);
  expect(await ev(page, `(() => { const u = window.__adv.story.run.ally; return u.alive && !u.hostile && u.hp === u.maxHp; })()`)).toBe(true);
  // Earthquake: the pylon loses HP even with the party called back
  await ev(page, `window.__adv.summons?.recallAll?.()`);
  const before = await ev<number>(page, `window.__adv.story.run.device.hp`);
  await page.waitForFunction((b) => { const d = (window as Win).__adv.story.run?.device; return !d || d.hp < b; }, before, { timeout: 12_000 });
  await page.screenshot({ path: test.info().outputPath('torterra-ally.png') });
  // the pylon falls: the step is done, Torterra leaves with the encounter
  await ev(page, `(() => { const a = window.__adv, d = a.story.run?.device; if (d?.alive) a.world.applyDamage(d, d.maxHp * 2, a.world.allies[0]); })()`);
  await page.waitForFunction(() => (window as Win).__adv.state.quests.currentObjective('mn-hn-3')?.type === 'talk', undefined, { timeout: 10_000 });
  expect(await ev(page, `window.__adv.world.enemies.some(e => e.alive && e.tag === 'story-ally')`)).toBe(false);
  expect(errors).toEqual([]);
});
