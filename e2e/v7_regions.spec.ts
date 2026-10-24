import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// 0.9.0 regions: gates locked by story flags, travel, region biome spawns, swamp toxic puddles, way back.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ecology: { id: string; biomes: string[] }[] = JSON.parse(readFileSync('src/data/dex/ecology.json', 'utf8'));
const waitMap = (page: Page, id: string) => page.waitForFunction((r) => (window as Win).__adv?.map?.id === r && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), id, { timeout: 15_000 });

test('Đầm Lầy & Bờ Biển: gates, wild pools, toxic puddles, way back', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await waitMap(page, 'starter-valley');
  await ev(page, `(() => { const a = window.__adv; ['infernape', 'empoleon', 'torterra'].forEach((s) => a.state.addPokemon(s, 35, 'gift')); a.applyParty(); a.persist(); })()`);
  // locked without the flag
  await ev(page, `void window.__adv.usePortal(window.__adv.regionDef.portals.find(p => p.to === 'misty-swamp'))`);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.regionDef.id`)).toBe('starter-valley');

  for (const [to, biome, flag] of [['misty-swamp', 'swamp', 'region:emerald-forest'], ['coral-coast', 'coast', 'region:coral-coast']] as const) {
    await ev(page, `(() => { const a = window.__adv; a.state.setFlag('${flag}'); const p = a.regionDef.portals.find(x => x.to === '${to}'); a.travelTo(p.to, p.toX, p.toY); })()`);
    await waitMap(page, to);
    await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
    await page.waitForFunction(() => (window as Win).__adv.world.enemies.filter((e: Win) => e.alive && e.wild).length >= 3, undefined, { timeout: 30_000 });
    const wild = await ev<string[]>(page, `window.__adv.world.enemies.filter(e => e.alive && e.wild && !e.tag).map(e => e.defId)`);
    const ok = new Set(ecology.filter((e) => e.biomes.includes(biome) || e.biomes.includes('rocky')).map((e) => e.id));
    expect(wild.length).toBeGreaterThan(0);
    expect(wild.filter((s) => !ok.has(s)), `${to}: ${wild.join()}`).toEqual([]);
    expect(await ev(page, `window.__adv.musicMood()`)).toBe(biome);
    await page.waitForTimeout(800);
    await page.screenshot({ path: info.outputPath(`${to}.png`) });
    if (to === 'misty-swamp') {
      // stand on a toxic puddle with a non-poison party: someone gets poisoned
      await ev(page, `(() => { const a = window.__adv, m = a.map, t = a.world.trainer; let best = null, bd = 1e9; const tx = t.x / 48, ty = t.y / 48;
        for (let y = 4; y < m.heightTiles - 4; y++) for (let x = 4; x < m.widthTiles - 4; x++) if (m.terrainAt(x, y) === 38 && m.terrainAt(x, y + 1) === 38 && m.terrainAt(x + 1, y) === 38) { const d = Math.hypot(x - tx, y - ty); if (d < bd) { bd = d; best = [x, y]; } }
        a.world.teleport(best[0] * 48 + 24, best[1] * 48 + 10); a.__bog = best; })()`);
      let poisoned = false;
      for (let i = 0; i < 40 && !poisoned; i++) {
        await ev(page, `(() => { const a = window.__adv; a.world.teleport(a.__bog[0] * 48 + 24, a.__bog[1] * 48 + 10); })()`);
        await page.waitForTimeout(250);
        poisoned = await ev<boolean>(page, `window.__adv.world.hasStatus(window.__adv.world.trainer, 'poison')`);
      }
      expect(poisoned).toBe(true);
      // back to the valley, then on to the coast through its gate
      await ev(page, `(() => { const a = window.__adv; const p = a.regionDef.portals.find(x => x.to === 'starter-valley'); a.travelTo(p.to, p.toX, p.toY); })()`);
      await waitMap(page, 'starter-valley');
    }
  }
  expect(errors).toEqual([]);
});
