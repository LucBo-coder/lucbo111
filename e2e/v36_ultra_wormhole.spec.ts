import { expect, test, type Page } from '@playwright/test';

// Ultra Wormhole (adventure/UltraWormholeController.ts): on an open map it leads into Không Gian Ultra
// (data/world/ultra-space.json); there small rifts bring Gen 5–9 legendaries; its own wormhole leads back home.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;

/** Finish the dialogue's text, then pick choice 1. */
async function choose(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const choices = await ev<boolean>(page, `(() => { const d = ${ui}.dialogueLayer; return !!d && d.list.length > 6; })()`);
    if (choices) { await page.keyboard.press('1'); return; }
    await page.keyboard.press('e');
    await page.waitForTimeout(200);
  }
  throw new Error('no dialogue choices');
}

const onMap = (page: Page, id: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__phaser.scene.isActive('AdvUI'), id, { timeout: 20_000 });

test('an Ultra Wormhole leads into Ultra Space, its rifts bring legendaries, and it leads back home', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await onMap(page, 'ca-mau');
  for (let i = 0; i < 20 && (await ev<boolean>(page, `!!${ui}.dialogueLayer`)); i++) { await ev(page, `window.__adv.interact()`); await page.waitForTimeout(150); }
  await ev(page, `(() => { const a = window.__adv; a.state.setFlag('boss:mega-venusaur'); const p = a.state.addPokemon('garchomp', 60, 'wild'); if (!a.state.inParty(p.uid)) a.state.togglePartyMember(p.uid); a.applyParty();
    for (const e of a.world.enemies) a.world.removeEnemy(e); })()`);

  // on an open map: a wormhole with nobody behind it — it is a way in
  expect(await ev<boolean>(page, `window.__adv.wormholes.openNear()`)).toBe(true);
  expect(await ev(page, `window.__adv.wormholes.waiting`)).toBe(null);
  const home = await ev<{ x: number; y: number }>(page, `(() => { const a = window.__adv, h = a.interactables.get('ultra-wormhole'); a.world.teleport(h.x, h.y + 40); return { x: Math.floor(a.world.trainer.x / 48), y: Math.floor(a.world.trainer.y / 48) }; })()`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: info.outputPath('wormhole-open.png') });
  void ev(page, `window.__adv.interact()`);
  await choose(page);
  await onMap(page, 'ultra-space');
  expect(await ev(page, `window.__adv.state.adv.ultraReturn`)).toEqual({ region: 'ca-mau', ...home });
  for (let i = 0; i < 20 && (await ev<boolean>(page, `!!${ui}.dialogueLayer`)); i++) { await ev(page, `window.__adv.interact()`); await page.waitForTimeout(150); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('ultra-space.png') });
  // the trees take the alien ground's colours
  expect(await ev<boolean>(page, `window.__adv.children.list.some((o) => o.texture && o.texture.key.startsWith('ultra:'))`)).toBe(true);

  // an Ultra Beast's site: nothing there until its world is stirred (12 wild Pokémon beaten in Biển Sâu Ultra)
  const site = `window.__adv.regionDef.legendaries.find((l) => l.id === 'nihilego')`;
  const goSite = `(() => { const a = window.__adv, l = ${site}; for (const e of a.world.enemies) a.world.removeEnemy(e); a.world.teleport((l.x + 0.5) * 48, (l.y + 3.5) * 48); })()`;
  await ev(page, goSite);
  await page.waitForTimeout(1500);
  expect(await ev(page, `!!(window.__adv.world.boss && window.__adv.world.boss.alive)`)).toBe(false);
  await page.screenshot({ path: info.outputPath('ultra-site-asleep.png') });
  const woke = await ev<(string | null)[]>(page, `(() => { const a = window.__adv, l = ${site}, out = [];
    for (let i = 0; i < 12; i++) out.push(a.wormholes.stir((l.x + 3.5) * 48, (l.y + 3.5) * 48)); return out; })()`);
  expect(woke.slice(0, 11).every((x) => x === null)).toBe(true);
  expect(woke[11]).toBe('nihilego');
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('ultra-site-awake.png') });
  await ev(page, goSite);
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.alive && (window as Win).__adv.world.boss.defId === 'nihilego', undefined, { timeout: 8000 });
  await page.screenshot({ path: info.outputPath('ultra-site-boss.png') });
  await ev(page, `(() => { const a = window.__adv; for (const e of a.world.enemies) a.world.removeEnemy(e); a.world.teleport((a.regionDef.spawn.x + 0.5) * 48, (a.regionDef.spawn.y + 0.5) * 48); })()`);
  await page.waitForTimeout(300);

  // inside: a rift with a legendary behind it
  await ev(page, `(() => { const a = window.__adv; for (const e of a.world.enemies) a.world.removeEnemy(e); })()`);
  expect(await ev<boolean>(page, `window.__adv.wormholes.openNear('terapagos')`)).toBe(true);
  expect(await ev(page, `window.__adv.wormholes.waiting`)).toBe('terapagos');
  await ev(page, `(() => { const a = window.__adv, h = a.interactables.get('ultra-wormhole'); a.world.teleport(h.x, h.y + 40); })()`);
  await page.waitForTimeout(500); // the E prompt follows the trainer on the next frames
  await ev(page, `window.__adv.interact()`);
  await page.waitForTimeout(1500);
  expect(await ev(page, `window.__adv.world.boss && window.__adv.world.boss.alive && window.__adv.world.boss.defId`)).toBe('terapagos');
  expect(await ev(page, `window.__adv.world.boss.tag`)).toBe('wormhole');
  await page.screenshot({ path: info.outputPath('rift-boss.png') });
  await ev(page, `(() => { const a = window.__adv; a.wormholes.cleanup(); for (const e of a.world.enemies) a.world.removeEnemy(e); })()`);
  expect(await ev<boolean>(page, `window.__adv.wormholes.open`)).toBe(false);

  // Ultra Space's own wormhole: back to the spot the trainer came through
  await ev(page, `(() => { const a = window.__adv, p = a.regionDef.portals.find((q) => q.id === 'ultra-home'); a.world.teleport((p.x + 0.5) * 48, (p.y - 0.5) * 48); void a.usePortal(p); })()`);
  await choose(page);
  await onMap(page, 'ca-mau');
  const back = await ev<{ x: number; y: number }>(page, `({ x: Math.floor(window.__adv.world.trainer.x / 48), y: Math.floor(window.__adv.world.trainer.y / 48) })`);
  expect(back).toEqual(home);
  expect(await ev(page, `window.__adv.state.adv.ultraReturn`)).toBeUndefined();
  expect(errors).toEqual([]);
});
