import { expect, test, type Page } from '@playwright/test';

type W = { __game?: { world: { time: number; kills: number; state: string; level: number; allies: unknown[]; currentOffers: unknown[]; trainer: { x: number; y: number; hp: number } }; paused: boolean } };

async function startRun(page: Page, errors: string[]) {
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('fonts.g')) errors.push(m.text()); });
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __phaser?: { scene: { isActive(k: string): boolean } } }).__phaser?.scene.isActive('Menu'));
  await page.screenshot({ path: 'test-results/01-menu.png' });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!(window as unknown as W).__game?.world);
}

test('menu → run: pokemon fight, exp, level-up cards, movement', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  await startRun(page, errors);

  const startX = await page.evaluate(() => (window as unknown as W).__game!.world.trainer.x);
  await page.keyboard.down('d');
  await page.waitForTimeout(800);
  await page.keyboard.up('d');
  const movedX = await page.evaluate(() => (window as unknown as W).__game!.world.trainer.x);
  expect(movedX).toBeGreaterThan(startX + 50);

  // Let auto-combat run; pick cards whenever they appear (as a player would via keys).
  // At least 30 beats; keep playing (max 70) until the first level-up so a loaded CI machine
  // (fewer sim steps per wall-clock beat) cannot flake the EXP → level check.
  for (let i = 0; i < 70; i++) {
    if (i >= 30 && (await page.evaluate(() => (window as unknown as W).__game!.world.level)) > 1) break;
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => (window as unknown as W).__game!.world.state);
    if (st === 'levelup') {
      await page.screenshot({ path: 'test-results/03-levelup.png' });
      await page.waitForTimeout(350);
      await page.keyboard.press('1');
    }
    // steer toward the nearest gem with real key presses, like a keyboard player would
    const dir = await page.evaluate(() => {
      const g = (window as unknown as { __game: { world: { trainer: { x: number; y: number }; gems: { active: boolean; x: number; y: number }[] } } }).__game;
      const t = g.world.trainer;
      let best: { x: number; y: number } | null = null, bd = 1e9;
      for (const gem of g.world.gems) if (gem.active) { const d = Math.hypot(gem.x - t.x, gem.y - t.y); if (d < bd) { bd = d; best = gem; } }
      return best ? { x: best.x - t.x, y: best.y - t.y } : { x: 0, y: 0 };
    });
    const keys = [dir.x > 10 ? 'd' : dir.x < -10 ? 'a' : '', dir.y > 10 ? 's' : dir.y < -10 ? 'w' : ''].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(300);
    for (const k of keys) await page.keyboard.up(k);
  }
  await page.screenshot({ path: 'test-results/02-combat.png' });
  const w = await page.evaluate(() => {
    const g = (window as unknown as W).__game!.world;
    return { time: g.time, kills: g.kills, level: g.level, state: g.state, party: g.allies.length };
  });
  expect(w.time).toBeGreaterThan(10);
  expect(w.kills).toBeGreaterThan(5);
  expect(w.level).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});

test('pause menu and boss fight render', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as unknown as { __phaser?: { scene: { isActive(k: string): boolean } } }).__phaser?.scene.isActive('Menu'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!(window as unknown as W).__game?.world);
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => (window as unknown as W).__game!.paused)).toBe(true);
  await page.screenshot({ path: 'test-results/04-pause.png' });
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as W).__game!.paused)).toBe(false);

  await page.keyboard.press('b');
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'test-results/05-boss.png' });
  expect(errors).toEqual([]);
});

test('mobile portrait layout + touch joystick', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  await startRun(page, errors);
  await page.screenshot({ path: 'test-results/06-mobile.png' });
  const x0 = await page.evaluate(() => (window as unknown as W).__game!.world.trainer.x);
  // drag to the right with a mouse-equivalent pointer (joystick listens to pointer events)
  await page.mouse.move(200, 600);
  await page.mouse.down();
  await page.mouse.move(280, 600, { steps: 5 });
  await page.waitForTimeout(700);
  await page.mouse.up();
  const x1 = await page.evaluate(() => (window as unknown as W).__game!.world.trainer.x);
  expect(x1).toBeGreaterThan(x0 + 40);
  expect(errors).toEqual([]);
  await ctx.close();
});
