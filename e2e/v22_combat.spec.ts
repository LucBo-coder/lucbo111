import { expect, test, type Page } from '@playwright/test';

// V22 combat & companions in the real game (Adventure, starter valley): with nothing to fight, a party Pokémon
// runs to a ripe berry bush near the trainer and picks it (item in the bag, the bush starts refilling); a wild
// Pokémon turning hostile calls it back. Elemental combos go off in Adventure and show their name.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const SHOTS = process.env.V22_SHOTS;

test('companion fetches berries; combos in Adventure', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await ev(page, `(() => { const a = window.__adv; a.state.adv.party.length = 0; a.state.addPokemon('bulbasaur', 20, 'gift'); a.applyParty(); const t = a.world.trainer; t.maxHp = t.hp = 1e7; a.spawns.maxActive = 0; for (const e of a.world.enemies) { e.alive = false; } })()`);
  await page.waitForTimeout(300);

  // a forage bush (streamed in once we stand next to it)
  const bushes = await ev<Win[]>(page, `window.__adv.regionDef.nodes?.filter(n => n.table && /berry|forage|bush/.test(n.table)) ?? []`);
  const all = await ev<Win[]>(page, `window.__adv.regionDef.nodes ?? []`);
  const b = bushes[0] ?? all.find((n: Win) => !/fish|lake|pond/.test(n.table));
  expect(b).toBeTruthy();
  await ev(page, `window.__adv.world.teleport(${b.x} * 48 + 24 + 150, ${b.y} * 48 + 24)`);
  await page.waitForFunction(() => [...(window as Win).__adv.interactables.values()].some((i: Win) => i.kind === 'node'), null, { timeout: 5000 });
  const id = b.id as string;
  const bag = await ev<number>(page, `Object.values(window.__adv.state.save.inventory).reduce((s, n) => s + n, 0)`);
  // the bulbasaur walks over and picks it (or startles a hidden Pokémon out of it)
  await page.waitForFunction((nid) => ((window as Win).__adv.state.adv.nodes ?? {})[nid] != null, id, { timeout: 15_000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/combat-fetch.png` });
  const after = await ev<number>(page, `Object.values(window.__adv.state.save.inventory).reduce((s, n) => s + n, 0)`);
  const jumped = await ev<number>(page, `window.__adv.world.enemies.filter(e => e.alive && e.hostile).length`);
  expect(after > bag || jumped > 0).toBe(true);
  expect(await ev(page, `window.__adv.world.allies.some(a => a.errand)`)).toBe(false);

  // a fight calls an errand off
  await ev(page, `(() => { const a = window.__adv, w = a.world, t = w.trainer; for (const e of w.enemies) e.alive = false; w.allies[0].errand = { x: t.x + 200, y: t.y }; w.spawnWild('rattata', 5, t.x - 120, t.y, { hostile: true }); })()`);
  await page.waitForTimeout(800);
  expect(await ev(page, `window.__adv.world.allies[0].errand ?? null`)).toBeNull();

  // an elemental combo in Adventure: burned target, water hit → "Hơi Nước"
  const combo = await ev<string[]>(page, `(() => { const w = window.__adv.world, t = w.trainer; w.drainEvents && 0; const e = w.spawnWild('rattata', 5, t.x + 100, t.y, { hostile: true }); e.maxHp = e.hp = 1e6;
    w.applyStatus(e, { kind: 'burn', chance: 1, duration: 10, magnitude: 0 }, null); const a = w.allies[0];
    const before = w.events.length; w.hit(a, e, { ...a.skills[0], def: { ...a.skills[0].def, type: 'water', power: 40, accuracy: 100 }, cd: 0 }, 1);
    return w.events.slice(before).filter(x => x.t === 'combo').map(x => x.name); })()`);
  expect(combo).toEqual(['Hơi Nước']);
  await page.waitForTimeout(150);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/combat-combo.png` });
  expect(errors).toEqual([]);
});
