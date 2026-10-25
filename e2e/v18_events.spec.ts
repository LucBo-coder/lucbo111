import { expect, test, type Page } from '@playwright/test';

// 0.18 world events in the real game: the Travelling Merchant (discounted shop window with limited stock)
// and the Meteor Shower (star shards to pick up with E), with rewards and cleanup.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  return errors;
};
async function start(page: Page) {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await ev(page, `(() => { const a = window.__adv; a.state.save.collection.length = 0; a.state.adv.party.length = 0; a.state.addPokemon('charizard', 40, 'gift'); a.applyParty(); const t = a.world.trainer; t.maxHp = t.hp = 1e7; a.state.save.inventory = {}; a.state.save.currency = 0; })()`);
}
async function pressNear(page: Page, id: string, until: string) {
  await ev(page, `(() => { const it = window.__adv.interactables.get('${id}'); window.__adv.world.teleport(it.x, it.y + 30); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 20 && !(await ev<boolean>(page, until)); i++) {
    await page.keyboard.press('e');
    await page.waitForTimeout(250);
  }
  expect(await ev<boolean>(page, until), id).toBe(true);
}

test('Travelling Merchant: discounted limited stock, sells out, leaves', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = errorsOf(page);
  await start(page);
  await ev(page, `window.__adv.world.teleport(44.5*48, 66*48)`);
  await page.waitForTimeout(500);
  const m = await ev<Win>(page, `(() => { const e = window.__adv.worldEvents.force('merchant', 'starter-valley'); return { uid: e.uid, stock: e.data.stock }; })()`);
  expect(m.stock.length).toBe(6);
  for (const o of m.stock) expect(o.price).toBeLessThan(o.was);
  expect(await ev(page, `window.__adv.interactables.has('evmerchant-${m.uid}')`)).toBe(true);
  const total = m.stock.reduce((s: number, o: Win) => s + o.price * o.stock, 0);
  await ev(page, `window.__adv.state.earn(${total + 500})`);

  await pressNear(page, `evmerchant-${m.uid}`, `!!window.__adv.ui.shop`);
  expect(await ev(page, `window.__adv.ui.shop.visible().length`)).toBe(6); // no shelves: one list of all goods
  // buying more than the stock is impossible; buy everything with "Tối đa"
  for (const o of m.stock) {
    await ev(page, `window.__adv.ui.shop.select('${o.id}')`);
    expect(await ev(page, `window.__adv.ui.shop.maxQty()`)).toBe(o.stock);
    await ev(page, `window.__adv.ui.shop.setQty(99)`);
    expect(await ev(page, `window.__adv.ui.shop.qty`)).toBe(o.stock);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    expect(await ev(page, `window.__adv.state.item('${o.id}')`), o.id).toBe(o.stock);
  }
  await page.keyboard.press('Escape');
  // sold out → event completes, stall removed, thank-you gift
  await page.waitForFunction(() => !(window as Win).__adv.worldEvents.views().some((v: Win) => v.type === 'merchant'), null, { timeout: 5000 });
  expect(await ev(page, `window.__adv.interactables.has('evmerchant-${m.uid}')`)).toBe(false);
  expect(await ev(page, `window.__adv.state.money`)).toBe(500);
  expect(await ev(page, `window.__adv.state.item('ultraball')`)).toBeGreaterThanOrEqual(2);
  await page.waitForTimeout(300);
  for (let i = 0; i < 6 && await ev<boolean>(page, `window.__adv.modal`); i++) { await page.keyboard.press('Space'); await page.waitForTimeout(300); }

  // time stands still while the shop is open; once closed, an unsold merchant leaves when the event expires
  const m2 = await ev<number>(page, `(() => { window.__adv.worldEvents.director.save.readyAt.merchant = 0; return window.__adv.worldEvents.force('merchant', 'starter-valley').uid; })()`);
  await pressNear(page, `evmerchant-${m2}`, `!!window.__adv.ui.shop`);
  await ev(page, `(() => { const e = window.__adv.worldEvents.director.active.find(x => x.uid === ${m2}); e.end = 0; })()`);
  await page.waitForTimeout(400);
  expect(await ev(page, `window.__adv.worldEvents.views().some(v => v.type === 'merchant')`)).toBe(true);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !(window as Win).__adv.worldEvents.views().some((v: Win) => v.type === 'merchant'), null, { timeout: 5000 });
  expect(await ev(page, `window.__adv.interactables.has('evmerchant-${m2}')`)).toBe(false);
  expect(errors).toEqual([]);
});

test('Meteor Shower: star shards picked with E, reward, unpicked shards vanish on expiry', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = errorsOf(page);
  await start(page);
  await ev(page, `window.__adv.world.teleport(44.5*48, 66*48)`);
  await page.waitForTimeout(500);
  const mt = await ev<Win>(page, `(() => { const e = window.__adv.worldEvents.force('meteor', 'starter-valley'); return { uid: e.uid, goal: e.goal }; })()`);
  expect(mt.goal).toBeGreaterThanOrEqual(3);
  expect(await ev(page, `window.__adv.worldEvents.spawnInfo().boosted.some(b => ['clefairy','cleffa','minior','lunatone','solrock','staryu'].includes(b.species))`)).toBe(true);
  for (let i = 0; i < mt.goal; i++) await pressNear(page, `evshard-${mt.uid}-${i}`, `!window.__adv.interactables.has('evshard-${mt.uid}-${i}')`);
  await page.waitForFunction(() => !(window as Win).__adv.worldEvents.views().some((v: Win) => v.type === 'meteor'), null, { timeout: 5000 });
  expect(await ev<number>(page, `window.__adv.state.money`)).toBeGreaterThanOrEqual(1500);
  expect(await ev<number>(page, `['moon-stone','shiny-stone','dusk-stone','dawn-stone','sun-stone','ice-stone'].reduce((s, k) => s + window.__adv.state.item(k), 0)`)).toBe(1);
  for (let i = 0; i < 6 && await ev<boolean>(page, `window.__adv.modal`); i++) { await page.keyboard.press('Space'); await page.waitForTimeout(300); }

  // second shower: pick one shard, let it expire → partial pay, the rest disappear
  const mt2 = await ev<Win>(page, `(() => { const w = window.__adv.worldEvents; w.director.save.readyAt.meteor = 0; const e = w.force('meteor', 'starter-valley'); return { uid: e.uid, goal: e.goal }; })()`);
  const money = await ev<number>(page, `window.__adv.state.money`);
  await pressNear(page, `evshard-${mt2.uid}-0`, `!window.__adv.interactables.has('evshard-${mt2.uid}-0')`);
  await ev(page, `(() => { const e = window.__adv.worldEvents.director.active.find(x => x.uid === ${mt2.uid}); e.end = 0; })()`);
  await page.waitForFunction(() => !(window as Win).__adv.worldEvents.views().some((v: Win) => v.type === 'meteor'), null, { timeout: 5000 });
  expect(await ev<number>(page, `window.__adv.state.money`)).toBe(money + 250);
  expect(await ev<number>(page, `[...window.__adv.interactables.keys()].filter(k => k.startsWith('evshard-')).length`)).toBe(0);
  expect(errors).toEqual([]);
});
