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

async function imageBounds(page: Page, key: string) {
  return page.evaluate((key) => {
    const find = (items: any[]): any => {
      for (const o of items) {
        if (o.texture?.key === key && o.visible) return o;
        if (o.list) { const f = find(o.list); if (f) return f; }
      }
    };
    const i = find((window as Win).__phaser.scene.getScene('Menu').children.list);
    if (!i) return null;
    const r = i.getBounds();
    return { x: r.x, y: r.y, w: r.width, h: r.height, cx: r.centerX, cy: r.centerY };
  }, key);
}

test('main lobby: profile card, rename and avatar, persisted device-wide', async ({ page }) => {
  await openMenu(page);
  expect(await page.evaluate(() => (window as Win).__save.playerName)).toBe('Huấn luyện viên');
  expect(await page.evaluate(() => (window as Win).__save.avatar)).toBe('trainer');
  expect(await textBounds(page, 'Huấn luyện viên')).not.toBeNull();
  // the card shows the active slot summary, not just the name
  expect(await textBounds(page, 'Ô 1 · 0 Pokémon · Pokédex 0 · 0 ngọc')).not.toBeNull();
  expect(await imageBounds(page, 'avt-trainer')).not.toBeNull();

  await clickMenuText(page, '✎ Hồ sơ');
  expect(await textBounds(page, 'HỒ SƠ NGƯỜI CHƠI')).not.toBeNull();
  // all avatar choices are visible in the modal
  for (const name of ['Huấn luyện viên', 'Cô bé', 'Nhà leo núi', 'Nhà nghiên cứu', 'Kiểm lâm', 'Bơi lội', 'Cựu binh', 'Ninja']) {
    expect(await textBounds(page, name), name).not.toBeNull();
  }

  await clickMenuText(page, '✎ Đổi tên');
  const input = page.locator('#lobby-input input');
  await input.waitFor();
  await input.fill('  Bo   Hồng ');
  await page.locator('#lobby-input button[type=submit]').click();
  await page.waitForFunction(() => (window as Win).__save.playerName === 'Bo Hồng');
  expect(await page.evaluate(() => (window as Win).__save.data.playerName)).toBe('Bo Hồng');
  expect(await page.evaluate(() => (window as Win).__net.myName)).toBe('Bo Hồng');

  // pick another avatar: saved immediately, modal stays open with the new selection
  await clickMenuText(page, 'Ninja');
  await page.waitForFunction(() => (window as Win).__save.avatar === 'ninja');
  expect(await page.evaluate(() => (window as Win).__save.profile.avatar)).toBe('ninja');
  expect(await textBounds(page, 'HỒ SƠ NGƯỜI CHƠI')).not.toBeNull();

  await clickMenuText(page, 'Đóng');
  await page.waitForFunction(() => !(window as Win).__phaser.scene.getScene('Menu').children.list.some((o: any) => o.text === 'HỒ SƠ NGƯỜI CHƠI'));
  expect(await imageBounds(page, 'avt-ninja')).not.toBeNull();
  expect(await textBounds(page, 'Bo Hồng')).not.toBeNull();

  // device profile → survives a reload (the slot is empty / never written)
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  expect(await page.evaluate(() => (window as Win).__save.playerName)).toBe('Bo Hồng');
  expect(await page.evaluate(() => (window as Win).__save.avatar)).toBe('ninja');
  expect(await textBounds(page, 'Bo Hồng')).not.toBeNull();
  expect(await imageBounds(page, 'avt-ninja')).not.toBeNull();
});

test('portrait phone: player card and profile picker fit the screen', async ({ browser }) => {
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

  // tapping the avatar opens the profile picker (2 columns × 4 rows on a phone)
  const avatar = await imageBounds(page, 'avt-trainer');
  expect(avatar).not.toBeNull();
  await page.touchscreen.tap(avatar!.cx, avatar!.cy);
  await page.waitForTimeout(300);
  expect(await textBounds(page, 'HỒ SƠ NGƯỜI CHƠI')).not.toBeNull();
  const ninja = await textBounds(page, 'Ninja');
  expect(ninja).not.toBeNull();
  expect(ninja!.y + ninja!.h).toBeLessThan(844);
  const close = await textBounds(page, 'Đóng');
  expect(close).not.toBeNull();
  expect(close!.y + close!.h).toBeLessThan(844);
  await page.screenshot({ path: 'test-results/07-mobile-profile.png' });
  await ctx.close();
});
