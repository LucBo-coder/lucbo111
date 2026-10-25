import { expect, test, type Page } from '@playwright/test';

// The real online path: WebRTC through the public PeerJS broker (needs internet). Skipped when the broker
// can't be reached, so offline runs of the suite stay green; the local transport is covered by v15_online.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

test('PeerJS (WebRTC): create a room, join by code, exchange messages, measure ping', async ({ browser }) => {
  test.setTimeout(90_000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage(), b = await ctx.newPage();
  for (const p of [a, b]) {
    await p.goto('/?debug');
    await p.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  }
  const code = await ev<string>(a, `window.__net.host('peer').catch(e => 'ERR ' + e.message)`);
  test.skip(code.startsWith('ERR'), `PeerJS broker unreachable: ${code}`);
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  const joined = await ev<string>(b, `window.__net.join('${code}', 'peer').then(() => 'ok', e => 'ERR ' + e.message)`);
  expect(joined).toBe('ok');
  await a.waitForFunction(() => (window as Win).__net.connected, undefined, { timeout: 20_000 });
  await a.waitForFunction(() => (window as Win).__net.pongs > 0, undefined, { timeout: 10_000 });
  console.log(`[peerjs] room ${code}, ping ${await ev(a, 'window.__net.rtt')} ms`);
  // a wrong code fails with a readable message
  const bad = await ev<string>(b, `window.__net.join('ZZZZZZ', 'peer').then(() => 'ok', e => e.message)`);
  expect(bad).not.toBe('ok');
  console.log(`[peerjs] wrong code → "${bad}"`);
  await ctx.close();
});
