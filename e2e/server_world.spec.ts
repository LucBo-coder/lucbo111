import { expect, test, type Page } from '@playwright/test';

async function open(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__phaser?.scene.isActive('Menu'));
  await page.evaluate(() => { (window as any).__phaser.scene.getScene('Menu').scene.start('ServerWorld'); });
  await page.getByLabel('Máy chủ', { exact: true }).fill(process.env.SERVER_WS || 'ws://127.0.0.1:8789/ws');
}

/** Walks the real movement code along a BFS path over passable tiles until within `radius` of the goal. */
async function walkTo(page: Page, goal: { x: number; y: number }, radius: number) {
  const route = await page.evaluate(({ goal, radius }) => {
    const s = (window as any).__phaser.scene.getScene('ServerWorld');
    const start = [Math.floor(s.player.x / 48), Math.floor(s.player.y / 48)];
    const queue = [start], previous = new Map<string, number[] | null>([[start.join(','), null]]);
    let end: number[] | undefined;
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (Math.hypot((p[0] + 0.5) * 48 - goal.x, (p[1] + 0.5) * 48 - goal.y) < radius) { end = p; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [p[0] + dx, p[1] + dy], k = n.join(',');
        if (n[0] < 0 || n[1] < 0 || n[0] >= s.map.widthTiles || n[1] >= s.map.heightTiles || previous.has(k) || s.map.solidAt(n[0], n[1])) continue;
        previous.set(k, p); queue.push(n);
      }
    }
    const path: { x: number; y: number }[] = [];
    while (end) { path.unshift({ x: (end[0] + 0.5) * 48, y: (end[1] + 0.5) * 48 }); end = previous.get(end.join(',')) || undefined; }
    return path;
  }, { goal, radius });
  expect(route.length).toBeGreaterThan(0);
  for (const pos of route) {
    await page.evaluate((p) => { (window as any).__phaser.scene.getScene('ServerWorld').target = p; }, pos);
    await page.waitForFunction((p) => {
      const s = (window as any).__phaser.scene.getScene('ServerWorld');
      return Math.hypot(s.player.x - p.x, s.player.y - p.y) < 8;
    }, pos, { timeout: 5000 });
  }
}

test('two accounts: presence, chat, PC/candy and reconnect preserve offline save', async ({ browser }, info) => {
  test.setTimeout(120_000);
  const a = await browser.newPage(), b = await browser.newPage();
  const errors: string[] = [];
  a.on('pageerror', (e) => errors.push(e.message)); b.on('pageerror', (e) => errors.push(e.message));
  const suffix = Date.now().toString(36);
  try {
    await open(a); await open(b);
    const offline = await a.evaluate(() => JSON.stringify(localStorage));
    for (const [page, name] of [[a, 'an_' + suffix], [b, 'binh_' + suffix]] as const) {
      await page.getByLabel('Tên đăng nhập', { exact: true }).fill(name);
      await page.getByLabel('Mật khẩu', { exact: true }).fill('secret123');
      await page.getByRole('button', { name: 'Tạo tài khoản', exact: true }).click();
      await expect(page.locator('[data-play]')).toBeVisible();
      // one-time recovery code shown at registration
      await expect(page.locator('[data-recovery-code]')).toHaveAttribute('data-recovery-code', /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
      await page.getByRole('button', { name: 'Tôi đã lưu mã', exact: true }).click();
    }
    await expect.poll(() => a.evaluate(() => (window as any).__phaser.scene.getScene('ServerWorld').remotes.size)).toBe(1);
    await a.getByLabel('Tin nhắn', { exact: true }).fill('Xin chào Cà Mau!');
    await a.getByRole('button', { name: 'Gửi', exact: true }).click();
    await expect(b.getByRole('log')).toContainText('Xin chào Cà Mau!');
    // Exercise actual movement input, then walk over passable tiles to the shared boss.
    await a.bringToFront();
    await a.locator('canvas').click({ position: { x: 800, y: 350 } });
    const startX = await a.evaluate(() => (window as any).__phaser.scene.getScene('ServerWorld').player.x);
    await a.keyboard.down('d'); await a.waitForTimeout(300); await a.keyboard.up('d');
    await expect.poll(() => a.evaluate(() => (window as any).__phaser.scene.getScene('ServerWorld').player.x)).toBeGreaterThan(startX + 10);
    const alphaPos = await a.evaluate(() => { const al = (window as any).__phaser.scene.getScene('ServerWorld').alpha; return { x: al.x, y: al.y }; });
    await walkTo(a, alphaPos, 220);
    await a.getByRole('button', { name: 'Tấn công Alpha', exact: true }).click();
    await expect.poll(() => b.evaluate(() => {
      const alpha = (window as any).__phaser.scene.getScene('ServerWorld').alpha;
      return alpha.hp < alpha.maxHp;
    })).toBe(true);
    // PC storage is only reachable at a Pokémon Center / lab terminal (server-checked)
    const pcPos = await a.evaluate(() => { const t = (window as any).__phaser.scene.getScene('ServerWorld').map.pcTerminalTiles()[0]; return { x: t.x * 48, y: t.y * 48 }; });
    await walkTo(a, pcPos, 100);
    await expect(a.locator('[data-nearby]')).toContainText('Máy PC');
    await a.locator('canvas').focus();
    await a.keyboard.press('e');
    await expect(a.getByRole('dialog', { name: 'Máy PC Pokémon' })).toBeVisible();
    await a.getByLabel('Tìm Pokémon', { exact: true }).fill('pid');
    await a.getByRole('button', { name: 'Pidgey Lv4', exact: true }).click();
    await expect(a.locator('[data-pc-detail]')).toContainText('Trong PC');
    await a.screenshot({ path: info.outputPath('online-pc.png') });
    await a.getByRole('button', { name: 'Rút về đội', exact: true }).click();
    await expect(a.locator('[data-pc-detail]')).toContainText('Trong đội');
    await a.keyboard.press('Escape');
    await expect(a.getByRole('dialog', { name: 'Máy PC Pokémon' })).toBeHidden();
    await a.getByText('Đội Pokémon & PC', { exact: true }).click();
    await expect(a.locator('[data-roster]')).toContainText('pidgey · Lv4 · Đội');
    await a.setViewportSize({ width: 390, height: 844 });
    await a.screenshot({ path: info.outputPath('online-mobile.png') });
    expect(await a.locator('.server-panel').evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(390);
    // Candy dialog: type → quantity → preview → confirm; the server applies it.
    await a.getByRole('button', { name: 'Dùng kẹo', exact: true }).first().click();
    await a.getByLabel('Loại kẹo', { exact: true }).selectOption('rare-candy');
    await a.getByRole('button', { name: '×1', exact: true }).click();
    await expect(a.locator('[data-candy-preview]')).toContainText('Lv5 → Lv6');
    await a.getByRole('button', { name: 'Xác nhận dùng', exact: true }).click();
    await expect(a.locator('[data-roster]')).toContainText('charmander · Lv6');
    await expect(a.locator('[data-roster]')).toContainText('Rare Candy ×2');
    const remotePet = () => b.evaluate(() => {
      const r = [...(window as any).__phaser.scene.getScene('ServerWorld').remotes.values()][0] as any;
      return r?.pet.visible;
    });
    await a.getByRole('button', { name: 'Thu hồi', exact: true }).click();
    // the server enforces the switch cooldown, not only the UI: summon again as soon as our own recall is confirmed
    // (waiting for the other client first could outlast the 1.5 s cooldown over a real network)
    await a.getByRole('button', { name: 'Gọi ra', exact: true }).first().click();
    await expect(a.locator('[data-status]')).toContainText('rồi mới đổi Pokémon');
    await expect.poll(remotePet).toBe(false);
    await a.waitForTimeout(1600);
    await a.getByRole('button', { name: 'Gọi ra', exact: true }).first().click();
    await expect.poll(remotePet).toBe(true);
    // emote is shown above the trainer on the other client
    await a.getByText('Biểu cảm', { exact: true }).click();
    await a.getByRole('button', { name: '👋 Vẫy', exact: true }).click();
    await expect.poll(() => b.evaluate(() => {
      const r = [...(window as any).__phaser.scene.getScene('ServerWorld').remotes.values()][0] as any;
      return r?.bubble.visible && r.bubble.text;
    })).toContain('Chào');
    // party: invite by username → invitation card on the other client → accept
    await a.getByText('Bạn bè & nhóm', { exact: true }).click();
    await b.getByText('Bạn bè & nhóm', { exact: true }).click();
    await a.getByRole('button', { name: 'Tạo nhóm', exact: true }).click();
    await a.getByLabel('Tên đăng nhập của bạn', { exact: true }).fill('binh_' + suffix);
    await a.getByRole('button', { name: 'Mời vào nhóm', exact: true }).click();
    await b.getByRole('button', { name: 'Đồng ý', exact: true }).click();
    await expect(a.locator('[data-party-info]')).toContainText('(2/4)');
    await expect(b.locator('[data-party-info]')).toContainText('★ an_' + suffix);
    // network drop: the client resumes the same session by itself and keeps the world open
    await a.evaluate(() => (window as any).__phaser.scene.getScene('ServerWorld').client.simulateDrop());
    await expect(a.locator('[data-status]')).toContainText('Đã kết nối lại', { timeout: 10_000 });
    await expect(a.locator('[data-play]')).toBeVisible();
    await expect.poll(() => b.evaluate(() => (window as any).__phaser.scene.getScene('ServerWorld').remotes.size)).toBe(1);
    await a.screenshot({ path: info.outputPath('online-world.png') });
    await a.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
    await a.getByLabel('Tên đăng nhập', { exact: true }).fill('an_' + suffix);
    await a.getByLabel('Mật khẩu', { exact: true }).fill('secret123');
    await a.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await expect(a.locator('[data-play]')).toBeVisible();
    await a.getByText('Đội Pokémon & PC', { exact: true }).click();
    await expect(a.locator('[data-roster]')).toContainText('charmander · Lv6');
    await expect(a.locator('[data-roster]')).toContainText('pidgey · Lv4 · Đội');
    await a.getByRole('button', { name: '◀ Quay lại', exact: true }).click();
    await expect(a.locator('.server-world')).toHaveCount(0);
    await expect.poll(() => b.evaluate(() => (window as any).__phaser.scene.getScene('ServerWorld').remotes.size)).toBe(0);
    const after = await a.evaluate(() => { const copy = { ...localStorage }; delete copy['survivor.server.endpoint']; delete copy['survivor.server.username']; return JSON.stringify(copy); });
    const before = JSON.parse(offline); delete before['survivor.server.endpoint']; delete before['survivor.server.username'];
    expect(JSON.parse(after)).toEqual(before);
    expect(errors).toEqual([]);
  } finally { await a.close(); await b.close(); }
});
