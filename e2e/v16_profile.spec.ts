import { expect, test, type Page } from '@playwright/test';

type Win = Record<string, any>;

async function openMenu(page: Page) {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
}

/** Finds a Phaser text object by its content (buttons are containers with a text child). */
async function textBounds(page: Page, label: string) {
  return page.evaluate((label) => {
    const find = (items: any[]): any => {
      for (const o of items) {
        if (o.text === label && o.visible) return o;
        if (o.list) { const f = find(o.list); if (f) return f; }
      }
    };
    const t = find((window as Win).__phaser.scene.getScene('Menu').children.list);
    if (!t) return null;
    const r = t.getBounds();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.centerX, cy: r.centerY };
  }, label);
}

async function clickMenuText(page: Page, label: string) {
  const b = await textBounds(page, label);
  if (!b) throw new Error('Missing menu text: ' + label);
  await page.mouse.click(b.cx, b.cy);
  await page.waitForTimeout(250);
}

test('main lobby: player card and rename, persisted device-wide', async ({ page }) => {
  await openMenu(page);
  expect(await page.evaluate(() => (window as Win).__save.playerName)).toBe('Huấn luyện viên');
  expect(await textBounds(page, 'Huấn luyện viên')).not.toBeNull();
  // the card shows the active slot summary, not just the name
  expect(await textBounds(page, 'Ô 1 · 0 Pokémon · Pokédex 0 · 0 xu')).not.toBeNull();

  await clickMenuText(page, '✎ Đổi tên');
  const input = page.locator('#lobby-input input');
  await input.waitFor();
  await input.fill('  Bo   Hồng ');
  await page.locator('#lobby-input button[type=submit]').click();
  await page.waitForFunction(() => (window as Win).__save.playerName === 'Bo Hồng');

  expect(await page.evaluate(() => (window as Win).__save.data.playerName)).toBe('Bo Hồng');
  expect(await page.evaluate(() => (window as Win).__net.myName)).toBe('Bo Hồng');
  await page.waitForFunction(() => {
    const find = (items: any[]): any => {
      for (const o of items) {
        if (o.text === 'Bo Hồng' && o.visible) return o;
        if (o.list) { const f = find(o.list); if (f) return f; }
      }
    };
    return !!find((window as Win).__phaser.scene.getScene('Menu').children.list);
  });

  // device profile → survives a reload (the slot is empty / never written)
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  expect(await page.evaluate(() => (window as Win).__save.playerName)).toBe('Bo Hồng');
  expect(await textBounds(page, 'Bo Hồng')).not.toBeNull();
});

test('portrait phone: player card fits above the mode cards', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  const card = await textBounds(page, 'Huấn luyện viên');
  expect(card).not.toBeNull();
  expect(card!.y).toBeGreaterThan(100);
  expect(card!.y).toBeLessThan(180);
  expect(card!.x).toBeGreaterThan(20);
  expect(card!.x + card!.w).toBeLessThan(390);
  // the mode cards start below the player bar
  const survivor = await textBounds(page, 'SINH TỒN');
  expect(survivor!.y).toBeGreaterThan(card!.y + 20);
  await page.screenshot({ path: 'test-results/07-mobile-menu.png' });
  await ctx.close();
});
