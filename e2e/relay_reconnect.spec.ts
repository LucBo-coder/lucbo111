import { expect, test, type Page } from '@playwright/test';

// Cloudflare room relay in two real game pages: a dropped connection rejoins the same room on its own (reconnect
// token) and the session keeps working; leaving tells the other player. Runs only with E2E_NET=cloud=<ws url>.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

test('relay: drop → automatic rejoin of the same room, then leave', async ({ browser }) => {
  test.skip(!process.env.E2E_NET?.startsWith('cloud='), 'needs E2E_NET=cloud=<ws url>');
  const ctx = await browser.newContext();
  const a = await ctx.newPage(), b = await ctx.newPage();
  for (const p of [a, b]) {
    await p.goto(`/?debug&${process.env.E2E_NET}`);
    await p.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  }
  expect(await ev(a, `window.__net.kind`)).toBe('peer'); // default before a room exists
  const code = await ev<string>(a, `window.__net.host()`);
  expect(await ev(a, `window.__net.kind`)).toBe('relay');
  await ev(b, `window.__net.join('${code}')`);
  await a.waitForFunction(() => (window as Win).__net.connected);
  await b.waitForFunction(() => (window as Win).__net.pongs > 0);

  // the guest's network drops: it reconnects with its token, the link never closes, pings flow again
  const before = await ev<number>(b, `window.__net.pongs`);
  await ev(b, `window.__net.simulateDrop()`);
  await b.waitForFunction((n) => (window as Win).__net.pongs > n + 1, before, { timeout: 15_000 });
  expect(await ev(b, `window.__net.status`)).toBe('connected');
  expect(await ev(a, `window.__net.status`)).toBe('connected');

  // and the host's network drops too
  const hb = await ev<number>(a, `window.__net.pongs`);
  await ev(a, `window.__net.simulateDrop()`);
  await a.waitForFunction((n) => (window as Win).__net.pongs > n + 1, hb, { timeout: 15_000 });

  // a message sent by game code arrives on the other side
  await ev(a, `(() => { window.__got = []; window.__net.on((m) => { if (m.t === 'rules') window.__got.push(m); }); })()`);
  await ev(b, `window.__net.send({ t: 'rules', rules: { id: 'open' } })`);
  await a.waitForFunction(() => (window as Win).__got.length === 1);

  // leaving for good: the other player is told
  await ev(b, `window.__net.leave()`);
  await a.waitForFunction(() => (window as Win).__net.status === 'closed', undefined, { timeout: 10_000 });
  expect(await ev<string>(a, `window.__net.error`)).toContain('rời phòng');
});
