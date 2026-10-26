import { expect, test, type Page } from '@playwright/test';

// V22 ecology in the real game (Adventure, Starter Valley): a territorial Tauros warns (red ring) before charging and
// gives up once the trainer leaves its ground; a pack arrives together with one leader and reacts together when one
// member is hit; a rare-condition spawn alerts the player and is remembered in the save.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const SHOTS = process.env.V22_SHOTS;
const HX = 44 * 48, HY = 70 * 48;

test('territory, packs and rare conditions', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1)`);
  await ready(page, 'starter-valley');
  await page.waitForTimeout(600);
  // a quiet field: no random spawns in the way, a sturdy trainer
  await ev(page, `(() => { const a = window.__adv; a.spawns.update = () => {}; for (const e of a.world.enemies) if (e.wild) a.world.removeEnemy(e);
    const t = a.world.trainer; t.maxHp = t.hp = 1e6; a.world.teleport(${HX} - 600, ${HY}); })()`);
  await page.waitForTimeout(300);

  // ── territory ──
  const r = await ev<number>(page, `(() => { const a = window.__adv;
    const u = a.spawns.spawnRolled({ species: 'tauros', level: 6, rarity: 'epic', shiny: false, temperament: 'neutral' }, ${HX}, ${HY});
    window.__bull = u; return u.wild.territory; })()`);
  expect(r).toBeGreaterThan(150);
  await page.waitForTimeout(800);
  expect(await ev(page, `window.__bull.hostile`)).toBe(false);
  await ev(page, `window.__adv.world.teleport(${HX} - ${r} * 0.6, ${HY})`);
  await page.waitForFunction(() => (window as Win).__bull.wild.mode === 'alert', undefined, { timeout: 3000 });
  expect(await ev(page, `window.__bull.hostile`)).toBe(false);
  await page.waitForTimeout(150);
  expect(await ev<boolean>(page, `!!window.__adv.territoryG && window.__adv.territoryG.commandBuffer.length > 0`)).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/eco-territory-warning.png` });
  await page.waitForFunction(() => (window as Win).__bull.hostile, undefined, { timeout: 4000 });
  // run far out of its ground: the chase ends
  await ev(page, `window.__adv.world.teleport(${HX} - ${r} * 2.4, ${HY})`);
  await page.waitForFunction(() => !(window as Win).__bull.hostile, undefined, { timeout: 8000 });
  await page.waitForTimeout(200);
  expect(await ev<boolean>(page, `window.__adv.territoryG.commandBuffer.length === 0`)).toBe(true);
  await ev(page, `window.__adv.world.removeEnemy(window.__bull)`);

  // ── a pack ──
  const pack = await ev<{ n: number; leaders: number; ids: string[]; same: boolean }>(page, `(() => { const a = window.__adv, sm = a.spawns;
    const roll = { species: 'poochyena', level: 16, rarity: 'common', shiny: false, temperament: 'neutral' };
    const first = sm.spawnRolled(roll, ${HX}, ${HY});
    sm.spawnPack(first, roll, { id: 'misty-swamp', level: [22, 32] }, 0);
    const m = a.world.enemies.filter(e => e.alive && e.wild && e.wild.pack === first.wild.pack);
    window.__pack = m;
    return { n: m.length, leaders: m.filter(e => e.wild.leader).length, ids: m.map(e => e.defId), same: m.every(e => Math.hypot(e.x - first.x, e.y - first.y) < 80) }; })()`);
  expect(pack.n).toBeGreaterThanOrEqual(2);
  expect(pack.leaders).toBe(1);
  expect(pack.ids).toContain('mightyena');
  expect(pack.same).toBe(true);
  await ev(page, `window.__adv.world.teleport(${HX} - 250, ${HY})`);
  await page.waitForTimeout(500);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/eco-pack.png` });
  await ev(page, `(() => { const w = window.__adv.world; const p = window.__pack.find(e => !e.wild.leader); w.applyDamage(p, 1, w.trainer); })()`);
  await page.waitForTimeout(400);
  expect(await ev<boolean>(page, `window.__pack.every(e => e.hostile)`)).toBe(true);
  await ev(page, `(() => { for (const e of window.__pack) window.__adv.world.removeEnemy(e); })()`);

  // ── rare condition: alert + remembered in the save ──
  await ev(page, `(() => { const a = window.__adv; const u = a.spawns.spawnRolled({ species: 'misdreavus', level: 18, rarity: 'epic', shiny: false, temperament: 'aggressive' }, ${HX} + 400, ${HY}, { rare: 'misdreavus-fog' });
    a.spawns.o.onRare(u, 'misdreavus-fog'); })()`);
  await page.waitForTimeout(300);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/eco-rare-alert.png` });
  expect(await ev(page, `window.__adv.state.adv.ecoSeen`)).toEqual(['misdreavus-fog']);
  expect(errors).toEqual([]);
});
