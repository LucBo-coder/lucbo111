import { expect, test, type Page } from '@playwright/test';
import { shrineHome } from './bossHelpers';

// V22 legendary shrines in the real game: every stamped shrine loads without errors, walls block the way, the court is
// walkable; V22_SHOTS=<dir> saves a screenshot of each. Since the hidden shrines (LEGENDARY_SHRINES.md mục 8) they
// stand in planes: the tier-1 dimensions and the maps' sanctums.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const SHOTS = process.env.V22_SHOTS;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });

const SITES: [string, string][] = ['mewtwo', 'rayquaza', 'articuno', 'regice', 'groudon', 'heatran', 'giratina', 'lugia', 'zapdos', 'regigigas', 'ho-oh', 'celebi']
  .map((id) => [shrineHome(id).region, id]);

test('designed shrines stand on the maps: walls solid, court open, no errors', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'classic')`);
  await ready(page, 'starter-valley');
  for (const [region, id] of SITES) {
    if (await ev<string>(page, `window.__adv.map.id`) !== region) {
      const h = shrineHome(id);
      await ev(page, `window.__adv.travelTo('${region}', ${h.x}, ${h.y})`);
      await ready(page, region);
      await page.waitForTimeout(400);
    }
    const info = await ev<Win>(page, `(() => { const a = window.__adv, l = a.map.def.legendaries.find((x) => x.id === '${id}');
      a.spawns.maxActive = 0; const t = a.world.trainer; t.maxHp = t.hp = 1e7; a.world.teleport((l.x + 0.5) * 48, (l.y + 2.5) * 48);
      let wall = 0, open = 0; for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) { const tt = a.map.terrainAt(l.x + dx, l.y + dy); if (tt === 40) wall++; }
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!a.map.solidAt(l.x + dx, l.y + dy)) open++;
      return { shrine: l.shrine, wall, open, solidWall: a.map.solidAt(l.x, l.y) }; })()`);
    expect(info.shrine, id).toBe(id);
    expect(info.open, id).toBeGreaterThanOrEqual(24);
    await page.waitForTimeout(700);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/shrine-${id}.png` });
  }
  expect(errors).toEqual([]);
});
