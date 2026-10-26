import { expect, test, type Page } from '@playwright/test';

// V22 performance in the real game: (1) memory — travelling between maps again and again must not pile up game
// objects, input / game listeners, timers or tweens (the scene restarts cleanly each time); (2) AI level of
// detail — with 150 calm wild Pokémon far away, they are throttled and the world step stays cheap.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const census = (page: Page) => ev<Record<string, number>>(page, `(() => {
  const g = window.__phaser, a = window.__adv, ui = g.scene.getScene('AdvUI');
  const n = (ee) => ee.eventNames().reduce((s, k) => s + ee.listenerCount(k), 0);
  return {
    objects: a.children.length, uiObjects: ui.children.length,
    gameListeners: n(g.events), keyListeners: n(a.input.keyboard) + n(ui.input.keyboard), scaleListeners: n(g.scale),
    timers: a.time._active.length + a.time._pendingInsertion.length, tweens: a.tweens.getTweens().length,
    enemies: a.world.enemies.length,
  };
})()`);

test('no leaks across map travel; far wild Pokémon are throttled', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  const trips: [string, number, number][] = [['an-giang', 82, 96], ['can-tho', 84, 72], ['ca-mau', 85, 97]];
  // warm up one full loop (first visits build caches / textures), then measure
  for (const [m, x, y] of trips) { await ev(page, `window.__adv.travelTo('${m}', ${x}, ${y})`); await ready(page, m); await page.waitForTimeout(400); }
  await page.waitForTimeout(1500);
  const base = await census(page);
  for (let loop = 0; loop < 3; loop++) {
    for (const [m, x, y] of trips) { await ev(page, `window.__adv.travelTo('${m}', ${x}, ${y})`); await ready(page, m); await page.waitForTimeout(400); }
  }
  await page.waitForTimeout(1500);
  const after = await census(page);
  console.log(JSON.stringify({ base, after }));
  // same map, same spot: listeners and timers identical, objects within normal churn (wild spawns, VFX)
  expect(after.gameListeners).toBe(base.gameListeners);
  expect(after.keyListeners).toBe(base.keyListeners);
  expect(after.scaleListeners).toBe(base.scaleListeners);
  expect(after.timers).toBeLessThanOrEqual(base.timers + 3);
  expect(after.tweens).toBeLessThanOrEqual(base.tweens + 10);
  expect(after.objects).toBeLessThan(base.objects * 1.25 + 40);
  expect(after.uiObjects).toBeLessThan(base.uiObjects * 1.25 + 20);

  // wild AI level of detail: 150 calm wild Pokémon 1100–1500px away think at a low rate and the step stays cheap
  const r = await ev<Win>(page, `(() => {
    const a = window.__adv, w = a.world, t = w.trainer; a.spawns.maxActive = 0;
    for (let i = 0; i < 150; i++) {
      const ang = i / 150 * Math.PI * 2, d = 1100 + (i % 5) * 100, x = t.x + Math.cos(ang) * d, y = t.y + Math.sin(ang) * d;
      w.spawnWild('rattata', 5, x, y, { wild: { mode: 'idle', t: 1, homeX: x, homeY: y, homeR: 140, leash: 520, temperament: 'neutral', aggroR: 90, nocturnal: false, wanderX: x, wanderY: y, lastAttacker: null, threat: null, lodT: 0, fled: false, calmT: 0 } });
    }
    for (let i = 0; i < 30; i++) w.step(1 / 60);
    const herd = w.enemies.filter(e => e.wild && !e.hostile && Math.hypot(e.x - t.x, e.y - t.y) > 1000);
    const t0 = performance.now(); for (let i = 0; i < 300; i++) w.step(1 / 60); const ms = (performance.now() - t0) / 300;
    return { herd: herd.length, throttled: herd.filter(e => e.wild.lodT > 0).length, ms };
  })()`);
  console.log(JSON.stringify(r));
  expect(r.herd).toBeGreaterThanOrEqual(140);
  expect(r.throttled).toBeGreaterThanOrEqual(r.herd * 0.9);
  expect(r.ms).toBeLessThan(4); // ms per world step with 150+ wild Pokémon on the map
  expect(errors).toEqual([]);
});
