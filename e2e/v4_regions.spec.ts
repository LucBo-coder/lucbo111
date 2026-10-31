import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Regions beyond the valley: portals are story-gated, travel restarts the scene on the new map, wild Pokémon
// come from that region's biome pool at its level range, and the way back works.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ecology: { id: string; biomes: string[] }[] = JSON.parse(readFileSync('src/data/dex/ecology.json', 'utf8'));
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  return errors;
};
const waitMap = (page: Page, id: string) => page.waitForFunction((r) => (window as Win).__adv?.map?.id === r && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), id, { timeout: 15_000 });

test('portals: locked until the story flag, travel to the three regions, region spawns, way back', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = errorsOf(page);
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await waitMap(page, 'starter-valley');
  await ev(page, `(() => { const a = window.__adv; a.state.save.collection.length = 0; a.state.adv.party.length = 0; ['garchomp', 'infernape', 'empoleon'].forEach((s) => a.state.addPokemon(s, 70, 'gift')); a.applyParty(); a.persist(); })()`);

  // locked: without the flag the portal only explains what is needed
  await ev(page, `window.__adv.world.teleport(140.5*48, 9.5*48)`);
  await page.waitForTimeout(600);
  await ev(page, `void window.__adv.usePortal(window.__adv.regionDef.portals.find(p => p.to === 'frozen-mountains'))`);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  expect(await ev(page, `window.__adv.regionDef.id`)).toBe('starter-valley');

  for (const [to, biome, flags] of [['frozen-mountains', 'snow', ['boss:mega-venusaur']], ['volcanic-lands', 'volcano', ['boss:articuno', 'boss:zapdos']], ['legendary-sanctuary', 'sanctuary', ['boss:rayquaza']]] as const) {
    await ev(page, `(() => { const a = window.__adv; ${JSON.stringify(flags)}.forEach(f => a.state.setFlag(f)); const p = a.regionDef.portals.find(x => x.to === '${to}'); a.travelTo(p.to, p.toX, p.toY); })()`);
    await waitMap(page, to);
    await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
    // wild Pokémon of the region's biome appear around the player
    await page.waitForFunction(() => (window as Win).__adv.world.enemies.filter((e: Win) => e.alive && e.wild && !e.tag).length >= 2, null, { timeout: 40_000 });
    const wild = await ev<{ id: string; lv: number }[]>(page, `window.__adv.world.enemies.filter(e => e.alive && e.wild && !e.tag).map(e => ({ id: e.defId, lv: e.level }))`);
    const ok = new Set(ecology.filter((e) => e.biomes.includes(biome)).map((e) => e.id));
    for (const w of wild) expect(ok.has(w.id), `${to}: ${w.id}`).toBe(true);
    const min = { 'frozen-mountains': 32, 'volcanic-lands': 42, 'legendary-sanctuary': 65 }[to];
    for (const w of wild) expect(w.lv, `${to}: ${w.id}`).toBeGreaterThanOrEqual(min);
    await page.waitForTimeout(800);
    await page.screenshot({ path: `test-results/v4-${to}.png` });
    // back to the valley through that region's portal
    await ev(page, `(() => { const a = window.__adv; const p = a.regionDef.portals.find(x => x.to === 'starter-valley'); a.travelTo(p.to, p.toX, p.toY); })()`);
    await waitMap(page, 'starter-valley');
  }
  // exploration is tracked per map
  expect(await ev<number>(page, `Object.keys(window.__adv.state.adv.discoveredBy).length`)).toBe(3);
  expect(errors).toEqual([]);
});
