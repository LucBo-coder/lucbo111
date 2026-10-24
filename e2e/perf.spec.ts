import { expect, test } from '@playwright/test';

test('stress: 250 enemies stays within frame budget', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __phaser?: { scene: { isActive(k: string): boolean } } }).__phaser?.scene.isActive('Menu'));
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !!(window as unknown as { __game?: unknown }).__game);
  const result = await page.evaluate(async () => {
    type G = { world: { addPokemon(id: string): void; spawnEnemy(id: string, l: number, e: boolean, x: number, y: number): unknown; trainer: { x: number; y: number; hp: number; maxHp: number }; enemies: unknown[]; state: string; chooseOffer(i: number): void }; perf: { fps: number; frameMs: number; simMs: number; entities: number } };
    const g = (window as unknown as { __game: G }).__game;
    g.world.addPokemon('squirtle');
    g.world.addPokemon('bulbasaur');
    const ids = ['rattata', 'magnemite', 'geodude'];
    for (let i = 0; i < 250; i++) {
      const a = Math.random() * Math.PI * 2, d = 250 + Math.random() * 450;
      g.world.spawnEnemy(ids[i % 3], 10, false, g.world.trainer.x + Math.cos(a) * d, g.world.trainer.y + Math.sin(a) * d);
    }
    const samples: { frame: number; sim: number; fps: number; ent: number }[] = [];
    for (let i = 0; i < 10; i++) {
      g.world.trainer.hp = g.world.trainer.maxHp; // keep the run alive for measurement
      if (g.world.state === 'levelup') g.world.chooseOffer(0);
      await new Promise((r) => setTimeout(r, 400));
      samples.push({ frame: g.perf.frameMs, sim: g.perf.simMs, fps: g.perf.fps, ent: g.perf.entities });
    }
    return samples;
  });
  console.log(JSON.stringify(result));
  const avgSim = result.reduce((a, s) => a + s.sim, 0) / result.length;
  expect(avgSim).toBeLessThan(8);
});

test('open world streaming: chunks load/unload, frame budget, bounded objects', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.waitForFunction(() => (window as any).__phaser?.scene.isActive('Menu'));
  await page.evaluate(() => (window as any).__phaser.scene.getScene('Menu').startAdventure(false));
  await page.waitForFunction(() => (window as any).__adv?.world && (window as any).__phaser.scene.isActive('AdvUI'));
  // fly across the whole valley: forces chunk streaming in every region
  const route = [[81, 100], [44, 66], [20, 30], [70, 20], [120, 20], [140, 70], [100, 110], [40, 110], [81, 100]];
  const samples: any[] = [];
  for (const [x, y] of route) {
    await page.evaluate(([tx, ty]) => (window as any).__adv.world.teleport((tx + 0.5) * 48, (ty + 0.5) * 48), [x, y]);
    await page.waitForTimeout(1200);
    samples.push(await page.evaluate(() => {
      const a = (window as any).__adv;
      return { frame: a.perf.frameMs, sim: a.perf.simMs, fps: a.perf.fps, chunks: a.chunks.loaded.size, loads: a.chunks.loadsTotal, unloads: a.chunks.unloadsTotal,
        objects: a.children.list.length, obstacles: a.world.obstacles.length, wild: a.world.enemies.length,
        heapMB: (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) : 0 };
    }));
  }
  console.log(JSON.stringify(samples));
  const last = samples[samples.length - 1];
  const total = 10 * 8;
  expect(last.unloads).toBeGreaterThan(20); // chunks really are released
  expect(Math.max(...samples.map((s) => s.chunks))).toBeLessThan(total / 2); // never the whole world
  expect(Math.max(...samples.map((s) => s.sim))).toBeLessThan(6);
  expect(Math.max(...samples.map((s) => s.objects))).toBeLessThan(2500);
});
