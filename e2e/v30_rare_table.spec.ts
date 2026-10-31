import { expect, test, type Page } from '@playwright/test';

// V30: the Pokédex (X) has a table of rare conditions; the row that holds where the player stands lights up
// (Cà Mau, Rừng Tràm U Minh Hạ, a rainy night: Seviper).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!${ui}.dialogueLayer`);
const closeDialogues = async (page: Page) => { for (let i = 0; i < 20 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(200); } };
const menuTexts = (page: Page) => ev<string[]>(page, `(() => { const out = []; const walk = (o) => { if (o.type === 'Text') out.push(o.text); (o.list ?? []).forEach(walk); }; const m = ${ui}.menu; if (m) walk(m); return out; })()`);

test('Pokédex: the rare-condition table, with the one that holds here lit', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  await closeDialogues(page);
  // U Minh, 22:00, rain
  await ev(page, `(() => { const a = window.__adv; a.world.teleport(60 * 48, 20 * 48); a.state.adv.clock = 22 * 60; a.weather = { kind: 'rain', t: 999 }; })()`);
  await page.waitForTimeout(400);
  expect(await ev<string[]>(page, `[...window.__adv.spawns.rareNow()]`)).toContain('seviper-uminh');
  await page.keyboard.press('x');
  await page.waitForFunction(() => (window as Win).__phaser.scene.getScene('AdvUI').menuTab === 'dex', undefined, { timeout: 5000 });
  expect((await menuTexts(page)).join('\n')).toContain('Điều kiện hiếm');
  await ev(page, `(() => { const u = ${ui}; u.dexRare = true; u.openMenu('dex'); })()`);
  await page.waitForTimeout(300);
  const t = (await menuTexts(page)).join('\n');
  expect(t).toContain('Danh sách loài');
  expect(t).toContain('Rừng Tràm U Minh Hạ');
  expect(t).toContain('Đang thỏa ở đây');
  expect(t).toContain('05:00–08:00'); // Chatot at dawn
  await page.screenshot({ path: test.info().outputPath('rare-table.png') });
  expect(errors).toEqual([]);
});
