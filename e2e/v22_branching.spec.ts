import { expect, test, type Page } from '@playwright/test';

// V22 branching quests in the real game (Vietnam Odyssey, Cần Thơ, "Hai ghe một bến"): accept from Cô lái đò,
// hear both sides, the ferry girl asks — the choice dialogue lists the three paths; pick "chia giờ"; the journal
// shows the pick and only that path's objectives; the pick survives a reload; finishing pays the base + path
// rewards and the path's own ending; a different path's follow-up quest stays locked.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const SHOTS = process.env.V22_SHOTS;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
const dialogueTexts = (page: Page) => ev<string[]>(page, `(() => { const l = window.__phaser.scene.getScene('AdvUI').dialogueLayer; const out = []; const walk = (o) => { if (o.type === 'Text') out.push(o.text); (o.list ?? []).forEach(walk); }; if (l) walk(l); return out; })()`);
const quest = (page: Page) => ev<Win>(page, `window.__adv.state.quests.states['vn-ct-feud']`);

/** Walks up to an NPC, presses E and reads through; `pick` answers the choice dialogue with that number key. */
const NPC: Record<string, [number, number]> = { 'ct-ferry-girl': [74, 70], 'ct-merchant': [118, 88], 'ct-orchard-owner': [40, 86] };
async function talk(page: Page, npc: string, pick?: string, shot?: string) {
  // walk over first (far NPCs stream in with their chunk), then stand right below them
  const [tx, ty] = NPC[npc];
  await ev(page, `window.__adv.world.teleport(${tx} * 48 + 24, ${ty} * 48 + 72)`);
  await page.waitForFunction((id) => (window as Win).__adv.interactables.has(id), npc, { timeout: 5000 });
  await ev(page, `(() => { const it = window.__adv.interactables.get('${npc}'); window.__adv.world.teleport(it.x, it.y + 40); })()`);
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe(npc);
  await page.keyboard.press('e');
  await page.waitForTimeout(250);
  for (let i = 0; i < 14 && (await dialogueOpen(page)); i++) {
    if (pick && (await dialogueTexts(page)).some((t) => /^1\. /.test(t))) {
      if (shot && SHOTS) await page.screenshot({ path: `${SHOTS}/${shot}.png` });
      await page.keyboard.press(pick);
    } else await page.keyboard.press('e');
    await page.waitForTimeout(200);
  }
}

test('Cần Thơ crossroads: Hai ghe một bến', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await ev(page, `window.__adv.travelTo('can-tho', 74, 72)`);
  await ready(page, 'can-tho');
  await page.waitForTimeout(600);
  await ev(page, `(() => { const a = window.__adv, t = a.world.trainer; t.maxHp = t.hp = 1e7; for (const id of ['vn-ct-1', 'vn-ct-boat', 'vn-ct-river']) a.state.quests.states[id] = { status: 'completed', step: 9, progress: 0 }; a.state.quests.refresh(); })()`);
  expect((await quest(page)).status).toBe('available');

  await talk(page, 'ct-ferry-girl', '1');
  expect((await quest(page)).status).toBe('active');
  await talk(page, 'ct-merchant');
  await talk(page, 'ct-orchard-owner');
  expect(await ev(page, `window.__adv.state.quests.currentObjective('vn-ct-feud').type`)).toBe('choose');
  // the ferry girl shows "?" while she waits for the decision
  await ev(page, `(() => { const it = window.__adv.interactables.get('ct-ferry-girl'); window.__adv.world.teleport(it.x + 200, it.y); })()`);
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.interactables.get('ct-ferry-girl').marker.text`)).toBe('?');

  await talk(page, 'ct-ferry-girl', '3', 'branch-choice');
  const st = await quest(page);
  expect(st.branch).toBe('chia-gio');
  expect(st.status).toBe('active');
  expect(await ev(page, `window.__adv.state.hasFlag('choice:vn-ct-feud:chia-gio')`)).toBe(true);
  expect(await ev(page, `window.__adv.state.quests.currentObjective('vn-ct-feud').target`)).toBe('ct-orchard-owner');

  // the journal: the pick, and only this path's objectives
  await ev(page, `(() => { const u = window.__phaser.scene.getScene('AdvUI'); u.questFilter = 'all'; u.selected.quest = 'vn-ct-feud'; u.openMenu('quests'); })()`);
  await page.waitForTimeout(300);
  const lines = await ev<string[]>(page, `window.__phaser.scene.getScene('AdvUI').menu.list.filter(o => o.type === 'Text').map(o => o.text)`);
  const journal = lines.join('\n');
  expect(journal).toContain('Phân xử chuyện bến ghe — Chia giờ');
  expect(journal).toContain('bến dành cho chú buổi chiều');
  expect(journal).not.toContain('Báo tin cho Chủ ghe Tư Hiền');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/branch-journal.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // reload mid-path: the pick is kept
  await ev(page, `(() => { const a = window.__adv; a.persist(); a.travelTo('can-tho', 40, 88); })()`);
  await ready(page, 'can-tho');
  await page.waitForTimeout(600);
  expect((await quest(page)).branch).toBe('chia-gio');

  const rep = await ev<number>(page, `window.__adv.state.adv.reputation`);
  await talk(page, 'ct-orchard-owner');
  await talk(page, 'ct-merchant');
  expect((await quest(page)).status).toBe('completed');
  expect(await ev<number>(page, `window.__adv.state.adv.reputation`)).toBeGreaterThanOrEqual(rep + 15);
  // the other paths' follow-ups never open
  expect(await ev(page, `window.__adv.state.quests.states['vn-ct-hien-cargo'].status`)).toBe('locked');
  expect(await ev(page, `window.__adv.state.quests.states['vn-ct-tam-orchard'].status`)).toBe('locked');
  expect(errors).toEqual([]);
});
