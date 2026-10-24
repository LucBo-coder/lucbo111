import { expect, test, type Page } from '@playwright/test';

// New dungeons: entrance on its region map, own waves / boss / hazard / tint, Challenge clock, exit back to that region.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, kind: string) => page.waitForFunction((k) => (window as Win).__adv?.mapKind === k && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), kind, { timeout: 15_000 });

test('Hang Băng & Tháp Thử Thách: entrance, waves, timer, exit to the right region', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await ready(page, 'valley');
  await ev(page, `(() => { const a = window.__adv; ['mamoswine', 'infernape'].forEach((s) => a.state.addPokemon(s, 45, 'gift')); a.applyParty(); a.state.setFlag('boss:mega-venusaur'); const p = a.regionDef.portals.find(x => x.to === 'frozen-mountains'); a.travelTo(p.to, p.toX, p.toY); })()`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'frozen-mountains' && (window as Win).__adv.world, undefined, { timeout: 15_000 });
  // the entrance object exists on the frozen map
  expect(await ev(page, `window.__adv.regionDef.dungeons.map(d => d.id)`)).toEqual(['ice-cave']);

  await ev(page, `window.__modes.start(window.__adv, 'adventure', { map: 'dungeon', difficulty: 'normal', dungeonId: 'ice-cave' })`);
  await ready(page, 'dungeon');
  expect(await ev(page, `window.__adv.map.id`)).toBe('ice-cave');
  expect(await ev(page, `window.__adv.map.def.boss.id`)).toBe('mamoswine');
  // walk into the wave room: the first wave is the ice cave's own
  await ev(page, `(() => { const a = window.__adv; a.world.trainer.maxHp = a.world.trainer.hp = 1e7; a.world.teleport(15.5 * 48, 60.5 * 48); })()`);
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'waves', undefined, { timeout: 10_000 });
  const species = await ev<string[]>(page, `window.__adv.dungeon.waveUnits.map(u => u.defId)`);
  expect(species.every((s) => ['snorunt', 'swinub'].includes(s))).toBe(true);
  await page.waitForTimeout(600);
  await page.screenshot({ path: info.outputPath('ice-cave.png') });
  await ev(page, `window.__adv.leaveDungeon(false)`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'frozen-mountains' && (window as Win).__adv.world, undefined, { timeout: 15_000 });
  const pos = await ev<{ x: number; y: number }>(page, `({ x: window.__adv.world.trainer.x / 48, y: window.__adv.world.trainer.y / 48 })`);
  expect(Math.abs(pos.x - 70.5)).toBeLessThan(2);
  expect(Math.abs(pos.y - 90.5)).toBeLessThan(2);

  // Challenge: the clock starts with the first wave and is on the HUD
  await ev(page, `window.__modes.start(window.__adv, 'adventure', { map: 'dungeon', difficulty: 'normal', dungeonId: 'trial-tower' })`);
  await ready(page, 'dungeon');
  await ev(page, `(() => { const a = window.__adv; a.world.trainer.maxHp = a.world.trainer.hp = 1e7; a.world.teleport(15.5 * 48, 60.5 * 48); })()`);
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'waves', undefined, { timeout: 10_000 });
  await page.waitForTimeout(1500);
  const left = await ev<number>(page, `window.__adv.dungeon.timeLeft`);
  expect(left).toBeLessThan(300);
  expect(left).toBeGreaterThan(280);
  expect(await ev<string>(page, `window.__phaser.scene.getScene('AdvUI').texts.area.text`)).toContain('⏱');
  await page.screenshot({ path: info.outputPath('trial-tower.png') });
  // time runs out → thrown out, no reward
  await ev(page, `window.__adv.dungeon.timeLeft = 0.05`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'legendary-sanctuary' && (window as Win).__adv.world, undefined, { timeout: 15_000 });
  expect(await ev(page, `window.__adv.state.dungeonCleared('trial-tower', 'normal')`)).toBe(false);
  expect(errors).toEqual([]);
});
