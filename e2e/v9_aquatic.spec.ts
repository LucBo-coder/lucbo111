import { expect, test, type Page } from '@playwright/test';

// Fish & sea creatures spawn in water and stay there; land Pokémon stay on land (real spawns, real AI).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });

/** Stand on the bank closest to a big stretch of open water. */
const toShore = (page: Page) => ev(page, `(() => { const a = window.__adv, m = a.map, t = a.world.trainer; let best = null, bd = 1e9;
  for (let y = 6; y < m.heightTiles - 6; y++) for (let x = 6; x < m.widthTiles - 6; x++) {
    if (m.solidAt(x, y) || m.terrainAt(x + 4, y) !== 5 || m.terrainAt(x + 8, y) !== 5 || m.terrainAt(x + 8, y + 4) !== 5 || m.terrainAt(x + 8, y - 4) !== 5) continue;
    const d = Math.hypot(x * 48 - t.x, y * 48 - t.y); if (d < bd) { bd = d; best = [x, y]; } }
  if (best) a.world.teleport(best[0] * 48 + 24, best[1] * 48 + 24); return best; })()`);

const check = (page: Page) => ev<{ fish: number; land: number; bad: string[] }>(page, `(() => { const a = window.__adv, m = a.map; const out = { fish: 0, land: 0, bad: [] };
  for (const e of a.world.enemies) { if (!e.alive || !e.wild || e.tag) continue;
    const water = m.terrainAt(Math.floor(e.x / 48), Math.floor(e.y / 48)) === 5;
    // land units stand on their feet (the same point the walk collision checks): on a shore the body may overlap the water
    const feetWet = m.terrainAt(Math.floor(e.x / 48), Math.floor((e.y + 6) / 48)) === 5;
    if (e.aquatic) { out.fish++; if (!water) out.bad.push(e.defId + ' (cá trên cạn)'); }
    else { out.land++; if (feetWet) out.bad.push(e.defId + ' (trên mặt nước)'); if (['magikarp','goldeen','barboach','tentacool','finneon','wailmer','remoraid','carvanha','luvdisc','horsea','chinchou'].includes(e.defId)) out.bad.push(e.defId + ' (cá không phải aquatic)'); } }
  return out; })()`);

for (const [mode, map] of [['vietnam', 'ca-mau'], ['classic', 'coral-coast']] as const) {
  test(`fish stay in the water — ${map}`, async ({ page }, info) => {
    test.setTimeout(150_000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/?debug');
    await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
    await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, '${mode}')`);
    await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
    await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('pikachu', 30, 'gift'); a.applyParty(); a.world.trainer.maxHp = a.world.trainer.hp = 1e6; })()`);
    if (map === 'coral-coast') {
      await ev(page, `(() => { const a = window.__adv; a.state.setFlag('region:coral-coast'); const p = a.regionDef.portals.find(x => x.to === 'coral-coast'); a.travelTo(p.to, p.toX, p.toY); })()`);
      await ready(page, 'coral-coast');
    } else await ready(page, 'ca-mau');
    // the shore search can run before the new map's terrain answers; retry until a bank is found
    await expect.poll(() => toShore(page), { timeout: 10_000 }).not.toBeNull();
    // wait for a few real spawns, then watch them move for a while. A single active partner kills slowly, so land
    // Pokémon can fill the spawn cap (14): clear them while waiting so a fish gets a slot.
    await expect.poll(() => ev<boolean>(page, `(() => { const w = window.__adv.world; if (w.enemies.some((e) => e.alive && e.aquatic)) return true;
      for (const e of w.enemies) if (e.alive && e.wild && !e.tag) w.applyDamage(e, e.maxHp * 10, null); return false; })()`), { timeout: 90_000, intervals: [3000] }).toBe(true);
    let fish = 0;
    for (let i = 0; i < 16; i++) {
      const r = await check(page);
      expect(r.bad, JSON.stringify(r)).toEqual([]);
      fish = Math.max(fish, r.fish);
      await page.waitForTimeout(500);
    }
    expect(fish).toBeGreaterThan(0);
    // walk to the bank next to the nearest fish and look at it (ripple instead of a ground shadow)
    await ev(page, `(() => { const a = window.__adv, m = a.map, t = a.world.trainer; const f = a.world.enemies.filter(e => e.alive && e.aquatic).sort((p, q) => Math.hypot(p.x - t.x, p.y - t.y) - Math.hypot(q.x - t.x, q.y - t.y))[0];
      const fx = Math.floor(f.x / 48), fy = Math.floor(f.y / 48); let best = null, bd = 1e9;
      for (let y = fy - 20; y <= fy + 20; y++) for (let x = fx - 20; x <= fx + 20; x++) if (!m.solidAt(x, y)) { const d = Math.hypot(x - fx, y - fy); if (d < bd) { bd = d; best = [x, y]; } }
      a.world.teleport(best[0] * 48 + 24, best[1] * 48 + 24); })()`);
    await page.waitForTimeout(900);
    expect((await check(page)).bad).toEqual([]);
    await page.screenshot({ path: info.outputPath(`${map}-shore.png`) });
    expect(errors).toEqual([]);
  });
}
