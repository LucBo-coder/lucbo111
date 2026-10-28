import { expect, test, type Page } from '@playwright/test';

// Thế giới online = the full Vietnam Odyssey campaign, the account's save on the server, other players on the map.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

async function open(page: Page) {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.evaluate(() => { (window as Win).__phaser.scene.getScene('Menu').scene.start('ServerWorld'); });
  await page.getByLabel('Máy chủ', { exact: true }).fill(process.env.SERVER_WS || 'ws://127.0.0.1:8789/ws');
}

const inCampaign = (page: Page) => page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__adv.online && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 30_000 });

async function signIn(page: Page, name: string, register: boolean) {
  await page.getByLabel('Tên đăng nhập', { exact: true }).fill(name);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('secret123');
  await page.getByRole('button', { name: register ? 'Tạo tài khoản' : 'Đăng nhập', exact: true }).click();
  if (register) {
    // one-time recovery code shown at registration, before entering the world
    await expect(page.locator('[data-recovery-code]')).toHaveAttribute('data-recovery-code', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
    await page.getByRole('button', { name: /Tôi đã lưu mã/ }).click();
  }
  await inCampaign(page);
}

/** The professor's Gen 1–9 starter picker, as in the offline campaign. */
async function pickStarter(page: Page, key: string) {
  const layer = () => ev<number>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return d ? d.list.length : 0; })()`);
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.npcs.find(x => x.id === 'vn-prof'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 40 && (await layer()) < 20; i++) { await page.keyboard.press('e'); await page.waitForTimeout(160); }
  await page.keyboard.press(key);
  await page.waitForFunction(() => (window as Win).__adv.state.party().length > 0, undefined, { timeout: 5000 });
  for (let i = 0; i < 20 && (await layer()); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}

test('two accounts play the Vietnam Odyssey online: starter, presence, chat, saved on the server, offline slot untouched', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const a = await browser.newPage(), b = await browser.newPage();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message)); b.on('pageerror', (e) => errors.push(e.message));
  const suffix = Date.now().toString(36);
  const nameA = 'an_' + suffix, nameB = 'binh_' + suffix;
  await open(a); await open(b);
  const offlineSlot = await ev<string>(a, `JSON.stringify({ c: window.__save.data.collection.length, v: window.__save.data.vnCoins, s: window.__save.slot })`);

  await signIn(a, nameA, true);
  // a new account: the campaign before its starter, at Cà Mau
  expect(await ev(a, `window.__adv.state.adv.campaign`)).toBe('vietnam');
  expect(await ev(a, `window.__adv.regionDef.id`)).toBe('ca-mau');
  expect(await ev(a, `window.__save.online`)).toBe(true);
  await pickStarter(a, '2'); // Hoenn tab first: 2 = Torchic
  expect(await ev(a, `window.__adv.state.party().map(p => p.species)`)).toEqual(['torchic']);

  await signIn(b, nameB, true);
  await ev(b, `(() => { window.__world.on(m => { if (m.t === 'saved' || m.t === 'error') (window.__dbg ??= []).push(m); }); const q = window.__world.queue.bind(window.__world); window.__world.queue = (s, u) => { (window.__dbg ??= []).push('queue ' + !!window.__world.account); q(s, u); }; })()`);
  await pickStarter(b, '1');
  await b.waitForTimeout(12000);
  console.log('DBG', await ev(b, `JSON.stringify({ online: window.__save.online, d: window.__dbg, synced: window.__world.synced, active: window.__adv.state.adv.activeUid, party: window.__adv.state.adv.party })`));
  // both on the Cà Mau map, next to each other: each sees the other's trainer + lead Pokémon
  await ev(b, `(() => { const t = window.__adv.world.trainer; window.__adv.world.teleport(t.x + 60, t.y); })()`);
  await expect.poll(() => ev<number>(a, `window.__adv.online.remotes.size`), { timeout: 10_000 }).toBe(1);
  await expect.poll(() => ev<number>(b, `window.__adv.online.remotes.size`), { timeout: 10_000 }).toBe(1);
  await expect(a.locator('[data-pill]')).toHaveText('🌐 2 người ở đây');
  await expect.poll(() => ev(a, `[...window.__adv.online.remotes.values()][0].data.species`), { timeout: 15_000 }).toBe('treecko');
  await a.screenshot({ path: info.outputPath('1-two-players.png') });

  // chat: Enter opens the drawer; typing must not move the trainer
  const before = await ev<{ x: number }>(a, `({ x: window.__adv.world.trainer.x })`);
  await a.keyboard.press('Enter');
  await a.keyboard.type('dddd xin chào Cà Mau');
  await a.keyboard.press('Enter');
  await expect(b.locator('[data-mini]')).toContainText('xin chào Cà Mau');
  expect((await ev<{ x: number }>(a, `({ x: window.__adv.world.trainer.x })`)).x).toBe(before.x);
  await a.keyboard.press('Escape');
  await b.screenshot({ path: info.outputPath('2-chat.png') });

  // player card: E next to the other trainer → friend request → accepted
  await a.waitForTimeout(300);
  await ev(a, `window.__adv.online.openCard([...window.__adv.online.remotes.keys()][0])`);
  await a.locator('[data-card]').getByRole('button', { name: 'Kết bạn' }).click();
  await b.locator('[data-pill]').click();
  await b.getByRole('tab', { name: 'Bạn bè' }).click();
  await b.locator('[data-friends]').getByRole('button', { name: 'Chấp nhận' }).click();
  await expect(a.locator('[data-friends]')).toContainText(nameB);

  // progress made in the campaign reaches the server
  await ev(a, `(() => { const a = window.__adv; a.state.save.vnCoins = 777; a.state.adv.flags.push('e2e:online'); a.persist(); })()`);
  await expect.poll(() => ev(a, `window.__world.synced`), { timeout: 20_000 }).toBe(true);
  // back to the menu: the offline slot is the same as before signing in
  await ev(a, `window.__adv.exitToMenu()`);
  await a.waitForFunction(() => (window as Win).__phaser.scene.isActive('Menu') && !(window as Win).__save.online, undefined, { timeout: 10_000 });
  expect(await ev<string>(a, `JSON.stringify({ c: window.__save.data.collection.length, v: window.__save.data.vnCoins, s: window.__save.slot })`)).toBe(offlineSlot);
  await expect.poll(() => ev<number>(b, `window.__adv.online.remotes.size`), { timeout: 10_000 }).toBe(0);

  // signing in again (another device would be the same): the campaign continues where it was
  await a.reload();
  await open(a);
  await signIn(a, nameA, false);
  expect(await ev(a, `window.__save.data.vnCoins`)).toBe(777);
  expect(await ev(a, `window.__adv.state.adv.flags.includes('e2e:online')`)).toBe(true);
  expect(await ev(a, `window.__adv.state.party().map(p => p.species)`)).toEqual(['torchic']);

  // closing the page right after progress (no upload yet): the rescue copy brings it back on the next sign-in
  await ev(a, `(() => { const a = window.__adv; a.state.save.vnCoins = 888; })()`);
  await a.reload();
  await open(a);
  await signIn(a, nameA, false);
  expect(await ev(a, `window.__save.data.vnCoins`)).toBe(888);
  expect(errors).toEqual([]);
});
