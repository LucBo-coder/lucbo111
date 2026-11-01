import { expect, test, type Page } from '@playwright/test';
import { closeDialogues } from './bossHelpers';

// V38: each legendary fights with its own mechanics — Mew's copies (Ảo ảnh), Diancie's crystal shield, shown on screen.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });

async function fight(page: Page, id: string) {
  await ev(page, `(() => { const w = window.__adv.world, t = w.trainer; for (const e of w.enemies) if (e.alive) w.removeEnemy(e);
    t.maxHp = 1e9; t.hp = 1e9; window.__b = w.spawnBoss('${id}', 40, false, { x: t.x + 240, y: t.y }); })()`);
}
const castName = `window.__b?.boss?.cast?.name`;

test('legendaries fight with their own mechanics: Mew splits into copies, Diancie raises a crystal shield', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'classic')`);
  await ready(page, 'starter-valley');
  await closeDialogues(page);

  await fight(page, 'mew');
  await page.waitForFunction((c) => (window as Win).eval(c) === 'Ảo ảnh', castName, { timeout: 40_000 });
  await page.waitForTimeout(400);
  const clones = await ev<number>(page, `window.__b.boss.mech.adds.filter((u) => u.alive && u.defId === 'mew').length`);
  expect(clones).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath('mew-clones.png') });
  await ev(page, `window.__adv.world.removeEnemy(window.__b)`);
  await page.waitForTimeout(300);
  expect(await ev<number>(page, `window.__adv.world.enemies.filter((u) => u.alive && (u.tag === 'boss-add' || u.tag === 'boss-clone')).length`)).toBe(0);

  await fight(page, 'diancie');
  await page.waitForFunction((c) => (window as Win).eval(c) === 'Lá chắn tinh thể', castName, { timeout: 40_000 });
  await page.waitForTimeout(400);
  expect(await ev<boolean>(page, `window.__b.boss.mech.shieldOn`)).toBe(true);
  await page.screenshot({ path: info.outputPath('diancie-crystals.png') });
  const hp = await ev<number>(page, `window.__b.hp`);
  await ev(page, `window.__adv.world.applyDamage(window.__b, 300, window.__adv.world.trainer)`);
  expect(await ev<number>(page, `window.__b.hp`)).toBe(hp);
  await ev(page, `(() => { const w = window.__adv.world; for (const c of window.__b.boss.mech.crystals) w.applyDamage(c, c.hp + 10, w.trainer); })()`);
  await page.waitForTimeout(300);
  expect(await ev<boolean>(page, `window.__b.boss.mech.shieldOn`)).toBe(false);
  expect(errors).toEqual([]);
});
