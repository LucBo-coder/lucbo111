import { expect, test, type Page } from '@playwright/test';

// V30: every province has a shopkeeper; at Người nhà the mart takes 15 % off and opens the "Đặc sản" shelf with the
// guardian's type items (Huế: Aegislash, steel / ghost).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!${ui}.dialogueLayer`);
const closeDialogues = async (page: Page) => { for (let i = 0; i < 20 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(200); } };
const openShop = (page: Page) => ev(page, `(() => { const a = window.__adv; const n = a.regionDef.npcs.find(x => x.id === 'shopkeeper'); void a.talk({ obj: { data: { ...n } } }); })()`);
const offers = (page: Page) => ev<{ id: string; category: string; price: number; was?: number }[]>(page, `${ui}.shop.opts.offers.map(o => ({ id: o.id, category: o.category, price: o.price, was: o.was }))`);

test('Huế: the mart follows the reputation — usual prices for a stranger, Đặc sản and −15 % for family', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  await closeDialogues(page);
  await ev(page, `window.__adv.travelTo('hue', 54, 40)`);
  await ready(page, 'hue');
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.regionDef.npcs.some(n => n.id === 'shopkeeper')`)).toBe(true);

  // a stranger: the usual catalogue, no specialty shelf
  await openShop(page);
  await page.waitForFunction(() => !!(window as Win).__phaser.scene.getScene('AdvUI').shop, undefined, { timeout: 5000 });
  let o = await offers(page);
  expect(o.some((x) => x.category === 'local')).toBe(false);
  expect(o.find((x) => x.id === 'ultraball')).toMatchObject({ price: 1200 });
  await ev(page, `${ui}.shop.close()`);
  await page.waitForTimeout(300);

  // family of Huế
  await ev(page, `(() => { const adv = window.__adv.state.adv; adv.repBy = { ...(adv.repBy ?? {}), hue: 100 }; })()`);
  await openShop(page);
  await page.waitForFunction(() => !!(window as Win).__phaser.scene.getScene('AdvUI').shop, undefined, { timeout: 5000 });
  o = await offers(page);
  const local = o.filter((x) => x.category === 'local').map((x) => x.id);
  expect(local).toEqual(expect.arrayContaining(['metal-coat', 'reaper-cloth', 'dusk-stone']));
  expect(o.find((x) => x.id === 'ultraball')).toMatchObject({ price: 1000, was: 1200 });
  // buying a specialty charges its shelf price
  await ev(page, `window.__adv.state.earn(100000)`);
  const before = await ev<number>(page, `window.__adv.state.money`);
  const mc = o.find((x) => x.id === 'metal-coat')!;
  await ev(page, `(() => { const s = ${ui}.shop; s.sel = 'metal-coat'; s.cat = 'local'; s.qty = 1; s.buy(); })()`);
  expect(before - (await ev<number>(page, `window.__adv.state.money`))).toBe(mc.price);
  await page.screenshot({ path: test.info().outputPath('hue-shop.png') });
  expect(errors).toEqual([]);
});
