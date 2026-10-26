import { expect, test, type Page } from '@playwright/test';

// V22 regional events in the real game (Vietnam Odyssey): "Mùa cá linh về" (An Giang outbreak with its own
// species, announcement and extra Net Balls), "Lễ hội trái cây miệt vườn" (Cần Thơ market with fixed local goods
// and its own stall / shop title) and "Triều cường" (Cà Mau heavy rain).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const SHOTS = process.env.V22_SHOTS;

test('Mekong regional events', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');

  // An Giang: the fish-season outbreak
  await ev(page, `window.__adv.travelTo('an-giang', 104, 92)`);
  await ready(page, 'an-giang');
  await page.waitForTimeout(600);
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
  const o = await ev<Win>(page, `(() => { const w = window.__adv.worldEvents, e = w.force('outbreak', 'vn-ag-wetland', 'mua-ca-linh'); return { uid: e.uid, sp: e.data.species, variant: e.data.variant, x: e.data.x, y: e.data.y, name: w.views().find(v => v.uid === e.uid).name }; })()`);
  expect(o.variant).toBe('mua-ca-linh');
  expect(o.name).toBe('Mùa cá linh về');
  expect(['buizel', 'wooper', 'lotad']).toContain(o.sp);
  expect(await ev<number>(page, `(window.__adv.worldEvents.units.get(${o.uid}) ?? []).length`)).toBeGreaterThanOrEqual(4);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/regev-outbreak.png` });
  const nets = await ev<number>(page, `window.__adv.state.item('netball')`);
  await ev(page, `(() => { const w = window.__adv.worldEvents; for (let i = 0; i < 6; i++) w.onResolved(-1, '${o.sp}', ${o.x}, ${o.y}, false); })()`);
  expect(await ev(page, `window.__adv.worldEvents.views().some(v => v.uid === ${o.uid})`)).toBe(false);
  expect(await ev<number>(page, `window.__adv.state.item('netball')`)).toBe(nets + 3);

  // Cần Thơ: the fruit festival market
  await ev(page, `window.__adv.travelTo('can-tho', 40, 90)`);
  await ready(page, 'can-tho');
  await page.waitForTimeout(600);
  const m = await ev<Win>(page, `(() => { const e = window.__adv.worldEvents.force('merchant', 'vn-ct-orchard', 'le-hoi-trai-cay'); return { uid: e.uid, stock: e.data.stock }; })()`);
  expect(m.stock.map((s: Win) => s.id)).toEqual(['sitrus-berry', 'leaf-stone', 'miracle-seed', 'exp-candy-s']);
  for (const s of m.stock) expect(s.price).toBeLessThan(s.was);
  const id = `evmerchant-${m.uid}`;
  await ev(page, `(() => { const it = window.__adv.interactables.get('${id}'); window.__adv.world.teleport(it.x, it.y + 30); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 20 && !(await ev<boolean>(page, `!!window.__adv.ui.shop`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  expect(await ev(page, `window.__adv.ui.shop.opts.title`)).toBe('Sạp lễ hội trái cây');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/regev-market.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Cà Mau: spring tide
  await ev(page, `window.__adv.travelTo('ca-mau', 64, 42)`);
  await ready(page, 'ca-mau');
  await page.waitForTimeout(600);
  const w = await ev<Win>(page, `(() => { const w = window.__adv.worldEvents, e = w.force('weather', 'vn-cm-cape', 'trieu-cuong'); return { kind: e.data.kind, name: w.views().find(v => v.uid === e.uid).name }; })()`);
  expect(w).toEqual({ kind: 'heavyRain', name: 'Triều cường' });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/regev-tide.png` });
  expect(errors).toEqual([]);
});
