import { expect, test, type Page } from '@playwright/test';

/** E2E_NET=cloud=<ws url> runs this spec through the Cloudflare room relay instead of BroadcastChannel */
const NET_KIND = process.env.E2E_NET ? 'relay' : 'local';

// Online duel between two real game pages of the same browser (BroadcastChannel transport, `?net=local`):
// lobby → room code → join → teams → ready → host-authoritative duel mirrored on the guest → orders from
// the guest reach the host → switch → forfeit → both results recorded. Plus the practice duel.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

async function openLobby(page: Page, name: string) {
  await page.goto(`/?debug&${process.env.E2E_NET || 'net=local'}`);
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__modes.start(window.__phaser.scene.getScene('Menu'), 'online')`);
  await page.waitForFunction(() => (window as Win).__phaser.scene.isActive('Lobby'));
  await ev(page, `(() => { window.__net.myName = '${name}'; })()`);
}
const inDuel = (page: Page) => page.waitForFunction(() => (window as Win).__phaser.scene.isActive('Duel') && (window as Win).__phaser.scene.isActive('DuelUI'), undefined, { timeout: 15_000 });

test('online duel: room code, teams, host simulation mirrored on the guest, guest orders, forfeit', async ({ browser }, info) => {
  test.setTimeout(150_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const host = await ctx.newPage(), guest = await ctx.newPage();
  const errors: string[] = [];
  for (const p of [host, guest]) p.on('pageerror', (e) => errors.push(String(e)));
  await openLobby(host, 'An');
  await openLobby(guest, 'Bình');

  const code = await ev<string>(host, `window.__lobby.createRoom('${NET_KIND}')`);
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await host.screenshot({ path: info.outputPath('1-host-room.png') });
  expect(await ev(guest, `window.__lobby.joinRoom('${code}', '${NET_KIND}')`)).toBe(true);
  await host.waitForFunction(() => (window as Win).__net.connected && (window as Win).__net.peerName === 'Bình');
  expect(await ev(guest, `window.__net.peerName`)).toBe('An');

  // teams: rental teams, both ready → the duel starts on both pages
  await ev(host, `window.__lobby.pickRental(0)`);
  await ev(guest, `window.__lobby.pickRental(1)`);
  await ev(guest, `window.__lobby.setReady(true)`);
  await host.waitForTimeout(300);
  await host.screenshot({ path: info.outputPath('2-host-ready-check.png') });
  await ev(host, `window.__lobby.setReady(true)`);
  await inDuel(host);
  await inDuel(guest);
  expect(await ev(host, `window.__duel.role`)).toBe('host');
  expect(await ev(guest, `window.__duel.role`)).toBe('guest');
  // the guest's own side (Hoenn rental) is "home" on its screen
  expect(await ev(guest, `window.__duel.world.allies.map(u => u.defId)`)).toEqual(['sceptile', 'blaziken', 'swampert']);
  expect(await ev(host, `window.__duel.world.rival.allies.map(u => u.defId)`)).toEqual(['sceptile', 'blaziken', 'swampert']);

  // after the countdown both sides really fight and the guest sees the host's numbers
  // the host runs the simulation: keep its tab in front (a background tab's game loop is throttled)
  await host.bringToFront();
  await host.waitForFunction(() => (window as Win).__duel.world.allies.some((u: Win) => u.hp < u.maxHp) && (window as Win).__duel.world.rival.allies.some((u: Win) => u.hp < u.maxHp), undefined, { timeout: 30_000 });
  // the guest draws the host's snapshots, one network trip behind: compare until they agree (instant on one machine)
  await expect.poll(async () => {
    const hpHost = await ev<number[]>(host, `window.__duel.world.rival.allies.map(u => u.hp)`);
    const hpGuest = await ev<number[]>(guest, `window.__duel.world.allies.map(u => u.hp)`);
    return hpHost.every((h, i) => Math.abs(h - hpGuest[i]) < Math.max(80, h * 0.35));
  }, { timeout: 10_000, intervals: [400, 200] }).toBe(true);
  await host.screenshot({ path: info.outputPath('3-host-duel.png') });
  await guest.screenshot({ path: info.outputPath('4-guest-duel.png') });

  // orders from the guest reach the host simulation
  // keyboard input goes to the focused page; a background tab also throttles its game loop
  await guest.bringToFront();
  await guest.keyboard.press('5'); // retreat
  await host.waitForFunction(() => (window as Win).__duel.world.rival.command === 'retreat', undefined, { timeout: 5000 });
  await guest.keyboard.press('Backquote');
  await host.waitForFunction(() => (window as Win).__duel.world.rival.command === 'auto', undefined, { timeout: 5000 });
  // the guest moves its trainer
  const tx0 = await ev<number>(host, `window.__duel.world.rival.trainer.x`);
  // (the guest sees a mirrored arena: pressing "left" moves it left on its screen = right in the host's world)
  // hold the key until the host has simulated it: the host is a background tab here, so its loop is throttled
  await guest.keyboard.down('a');
  await host.waitForFunction((x) => (window as Win).__duel.world.rival.trainer.x > x + 40, tx0, { timeout: 10_000 }).finally(() => guest.keyboard.up('a'));
  // switch: bench member 1 comes in
  await ev(guest, `window.__duel.switchIn(0)`);
  await host.waitForFunction(() => (window as Win).__duel.world.rival.allies.some((u: Win) => u.defId === 'gardevoir'), undefined, { timeout: 5000 });
  await guest.waitForFunction(() => (window as Win).__duel.world.allies.some((u: Win) => u.defId === 'gardevoir'), undefined, { timeout: 5000 });

  // the guest forfeits → host wins, both recorded
  await ev(guest, `window.__duel.forfeit()`);
  await host.waitForFunction(() => !!(window as Win).__duel.ended, undefined, { timeout: 5000 });
  expect(await ev(host, `window.__duel.ended.result`)).toBe('win');
  expect(await ev(guest, `window.__duel.ended.result`)).toBe('loss');
  await host.waitForTimeout(500);
  await host.screenshot({ path: info.outputPath('5-host-result.png') });
  expect(await ev(host, `window.__phaser.scene.getScene('Duel').scene.manager.keys.Lobby ? true : false`)).toBe(true);
  // back to the room, still connected
  await ev(host, `window.__duel.exit()`);
  await host.waitForFunction(() => (window as Win).__phaser.scene.isActive('Lobby'));
  expect(await ev(host, `window.__net.connected`)).toBe(true);
  await host.screenshot({ path: info.outputPath('6-back-in-room.png') });
  expect(errors).toEqual([]);
  await ctx.close();
});

test('practice duel against the computer runs to the end', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await openLobby(page, 'An');
  await ev(page, `(() => { const l = window.__lobby; l.go('practice'); l.pickRental(2); l.startPractice(); })()`);
  await inDuel(page);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: info.outputPath('practice.png') });
  // speed the end up: the home side finishes the rival party with real damage events
  await page.waitForFunction(() => (window as Win).__duel.world.time > 3, undefined, { timeout: 10_000 });
  await ev(page, `(() => { const w = window.__duel.world; for (const u of [...w.rival.allies, ...w.rival.bench]) w.applyDamage(u, 1e9, w.allies[0]); })()`);
  await page.waitForFunction(() => !!(window as Win).__duel.ended, undefined, { timeout: 15_000 });
  expect(await ev(page, `window.__duel.ended.result`)).toBe('win');
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('practice-result.png') });
  expect(await ev(page, `window.__phaser.scene.getScene('Duel').scene.isActive('DuelUI')`)).toBe(true);
  expect(errors).toEqual([]);
});
