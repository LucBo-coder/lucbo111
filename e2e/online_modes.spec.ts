import { expect, test, type Page } from '@playwright/test';
async function hub(page: Page, slot: string) {
  await page.goto('/?net=local&debug');
  await page.waitForFunction(() => (window as any).__phaser?.scene.isActive('Menu'));
  await page.evaluate(() => { (window as any).__modes.start((window as any).__phaser.scene.getScene('Menu'), 'online', { entry: 'OnlineHub' }); });
  await page.locator('[data-slot]').selectOption(slot);
}
for (const mode of ['survivor', 'classic', 'vietnam']) {
  test(`online hub: ${mode}, shared challenge and rewards`, async ({ browser }, info) => {
    test.setTimeout(90000);
    const ctx = await browser.newContext(), host = await ctx.newPage(), guest = await ctx.newPage();
    const errors: string[] = [];
    for (const p of [host, guest]) p.on('pageerror', (e) => errors.push(e.message));
    try {
      await hub(host, '1'); await hub(guest, '2');
      await host.locator(`[data-host="${mode}"]`).click();
      const scene = mode === 'survivor' ? 'Game' : 'Adventure';
      await host.waitForFunction((key) => !!(window as any).__phaser.scene.getScene(key).coopHost, scene);
      const code = await host.evaluate(() => (window as any).__net.code);
      expect(code).toHaveLength(6);
      await guest.getByLabel('Mã phòng co-op', { exact: true }).fill(code);
      await guest.getByRole('button', { name: 'Vào phòng co-op', exact: true }).click();
      await guest.waitForFunction(() => !!(window as any).__coopGuest?.snapshot?.challenge);
      const mapId = await guest.evaluate(() => (window as any).__coopGuest.snapshot.map.id);
      expect(mapId).toBe(mode === 'survivor' ? 'survivor' : mode === 'vietnam' ? 'ca-mau' : 'starter-valley');
      expect(await guest.evaluate(() => (window as any).__coopGuest.snapshot.challenge.id)).toBe('hunt');
      const beforeHost = await host.evaluate(() => (window as any).__save.data.currency);
      const beforeGuest = await guest.evaluate(() => (window as any).__save.data.currency);
      await host.evaluate((key) => {
        const g = (window as any).__phaser.scene.getScene(key), w = g.world;
        for (let i = 0; i < 15; i++) {
          const e = w.spawnWild('rattata', 1, w.trainer.x + 80, w.trainer.y, { hostile: true });
          w.applyDamage(e, 100000, w.allies[0]);
        }
        w.state = 'playing'; g.paused = false; g.modal = false;
      }, scene);
      await guest.waitForFunction(() => (window as any).__coopGuest.snapshot.challenge.status === 'completed');
      await expect.poll(() => guest.evaluate(() => (window as any).__save.data.currency)).toBe(beforeGuest + 250);
      expect(await host.evaluate(() => (window as any).__save.data.currency)).toBeGreaterThanOrEqual(beforeHost + 250);
      await guest.screenshot({ path: info.outputPath(`${mode}-coop.png`) });
      await guest.evaluate(() => { (window as any).__coopGuest.exit(); });
      await guest.waitForFunction(() => (window as any).__phaser.scene.isActive('Menu'));
      await host.waitForFunction((key) => !(window as any).__phaser.scene.getScene(key).world.companion, scene);
      expect(errors).toEqual([]);
    } finally { await ctx.close(); }
  });
}

test('online hub fits mobile and does not overwrite an occupied campaign slot', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await hub(page, '1');
  await page.evaluate(async () => {
    const save = (window as any).__save;
    save.data.adventure = { ...save.data.adventure, campaign: 'classic', started: true };
    save.data.currency = 123; await save.save();
  });
  await page.locator('[data-host=vietnam]').click();
  await expect(page.getByRole('status')).toContainText('hành trình khác');
  expect(await page.evaluate(() => (window as any).__save.data.currency)).toBe(123);
  expect(await page.locator('main').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('online-hub-mobile.png'), fullPage: true });
});
