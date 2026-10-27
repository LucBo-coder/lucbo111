import { expect, test, type Page } from '@playwright/test';

// A frame that throws no longer freezes the game, and closing / reloading the page keeps the latest progress.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page) => page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 30_000 });

test('a throwing frame keeps the game running; a reload right after progress keeps it', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page);

  // one frame of the Adventure scene throws (Phaser calls sys.sceneUpdate, bound when the scene started)
  await ev(page, `(() => { const a = window.__adv; const up = a.sys.sceneUpdate; let once = true;
    a.sys.sceneUpdate = function (t, d) { if (once) { once = false; throw new Error('test frame error'); } up.call(this, t, d); }; })()`);
  const t0 = await ev<number>(page, `window.__phaser.loop.frame`);
  await page.waitForTimeout(1000);
  // the loop is still running (before: the frame loop stopped for good and the screen froze)
  expect(await ev<number>(page, `window.__phaser.loop.frame`)).toBeGreaterThan(t0 + 10);
  // the error is still reported, and no recovery panel for a single error
  expect(errors.some((e) => e.includes('test frame error'))).toBe(true);
  expect(await page.locator('#crash-panel').count()).toBe(0);

  // progress made a moment ago (no autosave since), then the page is reloaded
  await ev(page, `(() => { const a = window.__adv; a.state.save.vnCoins = 4321; a.world.teleport(a.world.trainer.x + 96, a.world.trainer.y); })()`);
  const pos = await ev<{ x: number; y: number }>(page, `({ x: Math.round(window.__adv.world.trainer.x), y: Math.round(window.__adv.world.trainer.y) })`);
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  expect(await ev(page, `window.__save.data.vnCoins`)).toBe(4321);
  expect(await ev(page, `window.__save.data.adventure.pos`)).toEqual(pos);

  // a frame error that keeps repeating: progress is saved and the recovery panel is offered
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false)`);
  await ready(page);
  await ev(page, `(() => { const a = window.__adv; a.state.save.vnCoins = 5555; a.sys.sceneUpdate = () => { throw new Error('test stuck'); }; })()`);
  await expect(page.locator('#crash-panel')).toBeVisible({ timeout: 10_000 });
  expect(await ev(page, `window.__save.data.vnCoins`)).toBe(5555);
  await page.locator('#crash-panel button', { hasText: 'Lưu và tải lại' }).click();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  expect(await ev(page, `window.__save.data.vnCoins`)).toBe(5555);
});
