import { expect, test, type Page } from '@playwright/test';

// V22 journal in the real game (Vietnam Odyssey, Cà Mau): filter tabs of the quest journal, the reputation board,
// dock markers on the fog-of-war map.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const SHOTS = process.env.V22_SHOTS;
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const menuTexts = (page: Page) => ev<string[]>(page, `${ui}.menu.list.filter(o => o.type === 'Text').map(o => o.text)
  .concat(${ui}.menu.list.filter(o => o.type === 'Container').flatMap(o => o.list.filter(x => x.type === 'Text').map(x => x.text)))`);

test('quest filters, reputation board, map markers', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await page.waitForTimeout(600);
  await ev(page, `(() => { const a = window.__adv; a.state.addReputation(25, 'ca-mau'); a.state.addReputation(5, 'an-giang'); })()`);

  // ── reputation board ──
  await ev(page, `(() => { const u = ${ui}; u.questFilter = 'rep'; u.openMenu('quests'); })()`);
  await page.waitForTimeout(300);
  const rep = (await menuTexts(page)).join('\n');
  expect(rep).toContain('▶ Cà Mau — Quen mặt');
  expect(rep).toContain('An Giang — Người lạ');
  expect(rep).toContain('Cần Thơ');
  expect(rep).toContain('Còn 15 điểm tới "Được tin cậy"');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/journal-rep.png` });

  // ── "this map" filter: only Cà Mau quests ──
  await ev(page, `(() => { const u = ${ui}; u.questFilter = 'here'; u.openMenu('quests'); })()`);
  await page.waitForTimeout(200);
  const ids = await ev<string[]>(page, `(() => { const qs = window.__adv.state.quests; return qs.defs.filter(d => ['active', 'available', 'completed'].includes(qs.states[d.id].status)).map(d => d.id); })()`);
  expect(ids.length).toBeGreaterThan(0);
  const shown = (await menuTexts(page)).join('\n');
  const titles = await ev<Record<string, string>>(page, `Object.fromEntries(window.__adv.state.quests.defs.map(d => [d.id, d.title]))`);
  for (const id of ids) if (id.startsWith('vn-ct-')) expect(shown).not.toContain(titles[id]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/journal-here.png` });

  // ── map: docks once their chunk is discovered ──
  await ev(page, `(() => { const a = window.__adv; const k = a.regionDef.docks[0]; a.world.teleport((k.x + 0.5) * 48, (k.y + 0.5) * 48); })()`);
  await page.waitForTimeout(800);
  await ev(page, `(() => { const u = ${ui}; u.closeMenu(); u.openMenu('map'); })()`);
  await page.waitForTimeout(300);
  const mapTexts = (await ev<string[]>(page, `${ui}.menu.list.filter(o => o.type === 'Container').flatMap(o => o.list.flatMap(x => x.type === 'Container' ? x.list : [x])).filter(x => x.type === 'Text').map(x => x.text)`)).join('\n');
  expect(mapTexts).toContain('⚓');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/journal-map.png` });
  expect(errors).toEqual([]);
});
