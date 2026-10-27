import { expect, test, type Page } from '@playwright/test';
import { closeDialogues } from './bossHelpers';

// V22 legendary shrines, steps 2–6 in the real game (LEGENDARY_SHRINES.md §2.2 / §5): walking into a shrine never
// starts a fight; E on the ritual spot runs the ritual, then a cutscene and the fight in a sealed arena with its
// hazards; leaving resets the fight; a save mid-fight reloads with the fight reset and the relics kept. Roaming
// triggers wake roamers, the Kyogre gate leads into Vực Nguyên Hải.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI') && !(window as Win).__adv.modal, map, { timeout: 20_000 });

function errorsOf(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  return errors;
}

async function start(page: Page, region: string, x: number, y: number): Promise<void> {
  await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'classic')`);
  await ready(page, 'starter-valley');
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('blastoise', 45, 'gift'); a.applyParty(); })()`);
  if (region !== 'starter-valley') {
    await ev(page, `window.__adv.travelTo('${region}', ${x}, ${y})`);
    await ready(page, region);
  }
  await ev(page, `(() => { const a = window.__adv; a.spawns.maxActive = 0; for (const e of a.world.enemies) if (e.tag !== 'worldboss') e.alive = false; const t = a.world.trainer; t.maxHp = t.hp = 1e9; })()`);
}

const atSpot = (site: string) => `(() => { const a = window.__adv, s = a.shrines.spot('${site}'); a.world.teleport(s.P.x, s.P.y); })()`;
const run = (page: Page) => ev<{ site: string; step: number; kind?: string; lit: number; done: number } | null>(page, `window.__adv.shrines.debug().run`);

test('Articuno: walking in does nothing; the pillar ritual, cutscene, sealed arena, hazards, leaving resets', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = errorsOf(page);
  await start(page, 'frozen-mountains', 19, 50);
  await ev(page, `window.__adv.state.setFlag('boss:mega-venusaur')`);
  // standing in the middle of the arena with every condition met: nothing for a while
  await ev(page, `(() => { const a = window.__adv, s = a.shrines.spot('articuno'); a.world.teleport(s.spawn.x, s.spawn.y + 60); })()`);
  await page.waitForTimeout(3000);
  expect(await ev(page, `!!window.__adv.worldBoss`)).toBe(false);
  // E on the ritual spot: four crystal pillars ring one after another; touch the ringing one
  await ev(page, atSpot('articuno'));
  await ev(page, `void window.__adv.shrines.open('articuno')`);
  let r = await run(page);
  expect(r).toMatchObject({ site: 'articuno', kind: 'sequence', done: 0 });
  // a wrong pillar restarts the count
  await ev(page, `void window.__adv.shrines.interact('x', { site: 'articuno', part: 'O', i: (${r!.lit} + 1) % 4 })`);
  expect((await run(page))!.done).toBe(0);
  for (let k = 0; k < 4; k++) {
    r = await run(page);
    await ev(page, `void window.__adv.shrines.interact('x', { site: 'articuno', part: 'O', i: ${r!.lit} })`);
  }
  expect(await run(page)).toBeNull();
  expect(await ev(page, `window.__adv.state.adv.rites`)).toContain('articuno');
  // cutscene (controls locked), then the boss
  expect(await ev(page, `window.__adv.modal`)).toBe(true);
  await page.waitForFunction(() => (window as Win).__adv.worldBoss?.alive && !(window as Win).__adv.modal, null, { timeout: 10_000 });
  expect(await ev(page, `window.__adv.worldBoss.defId`)).toBe('articuno');
  expect(await ev(page, `window.__adv.shrines.debug().fight`)).toBe('articuno');
  // the seal: a trainer pushed far away is held inside the arena
  const held = await ev<{ d: number; R: number }>(page, `(() => { const a = window.__adv, s = a.shrines.spot('articuno'), t = a.world.trainer; t.x = s.spawn.x + s.R * 3; t.y = s.spawn.y; a.shrines.update(0.016); return { d: Math.hypot(t.x - s.spawn.x, t.y - s.spawn.y), R: s.R }; })()`);
  expect(held.d).toBeLessThanOrEqual(held.R);
  // arena hazards strike (telegraphed hazard zones of the shrine)
  await page.waitForFunction(() => (window as Win).__adv.world.zones.some((z: Win) => z.active && z.owner?.defId === 'hazard'), null, { timeout: 15_000 });
  await page.screenshot({ path: test.info().outputPath('articuno-fight.png') });
  // E on the ritual spot again: leave → the fight resets (no boss, no checkpoint)
  await ev(page, `void window.__adv.shrines.open('articuno')`);
  // the line first, then the choices (Rời trận / Chiến tiếp)
  for (let i = 0; i < 30 && !(await ev<boolean>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return !!d && d.list.length > 6; })()`)); i++) {
    if (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)) await page.keyboard.press('e');
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('1');
  await page.waitForFunction(() => !(window as Win).__adv.worldBoss, null, { timeout: 5000 });
  expect(await ev(page, `window.__adv.state.adv.bossFights.articuno`)).toBeUndefined();
  expect(await ev(page, `window.__adv.shrines.debug().fight`)).toBeNull();
  // a rematch needs only E (the ritual is remembered)
  await ev(page, `void window.__adv.shrines.open('articuno')`);
  expect(await run(page)).toBeNull();
  await page.waitForFunction(() => (window as Win).__adv.worldBoss?.alive, null, { timeout: 10_000 });
  expect(errors).toEqual([]);
});

test('Groudon: a missing relic stops the ritual; with the Red Orb, standing still summons it; save mid-fight → reset, relic kept', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = errorsOf(page);
  await start(page, 'volcanic-lands', 89, 40);
  await ev(page, `(() => { const a = window.__adv; ['mega-venusaur', 'lugia', 'ho-oh'].forEach((f) => a.state.setFlag('boss:' + f)); a.weather = { kind: 'clear', t: 999 }; })()`);
  await ev(page, atSpot('groudon'));
  await ev(page, `void window.__adv.shrines.open('groudon')`);
  expect(await run(page)).toBeNull(); // no Red Orb: the ritual stops at once
  await ev(page, `window.__adv.state.addItems({ 'red-orb': 1 })`);
  await ev(page, `void window.__adv.shrines.open('groudon')`);
  expect((await run(page))?.kind).toBe('still');
  // moving resets the count
  await page.waitForTimeout(1500);
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.x += 6; })()`);
  await page.waitForTimeout(100);
  expect(await ev<number>(page, `window.__adv.shrines.debug().run ? 1 : 0`)).toBe(1);
  await page.waitForFunction(() => (window as Win).__adv.worldBoss?.alive && !(window as Win).__adv.modal, null, { timeout: 15_000 });
  expect(await ev(page, `window.__adv.worldBoss.defId`)).toBe('groudon');
  // save in the middle of the fight, reload
  await ev(page, `window.__adv.persist()`);
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1, 'classic')`);
  await ready(page, 'volcanic-lands');
  await page.waitForTimeout(1500);
  expect(await ev(page, `!!window.__adv.worldBoss`)).toBe(false);
  expect(await ev(page, `window.__adv.state.item('red-orb')`)).toBe(1);
  expect(await ev(page, `window.__adv.state.adv.rites`)).toContain('groudon');
  expect(errors).toEqual([]);
});

test('roaming trigger and shrine plane: Mesprit\'s stone wakes it; the Kyogre gate leads into Vực Nguyên Hải', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = errorsOf(page);
  await start(page, 'starter-valley', 0, 0);
  await ev(page, `window.__adv.state.setFlag('boss:mewtwo')`);
  await ev(page, atSpot('mesprit'));
  await ev(page, `void window.__adv.shrines.open('mesprit')`);
  await page.waitForFunction(() => (window as Win).__adv.state.hasFlag('roam:mesprit'), null, { timeout: 5000 });
  await closeDialogues(page);
  // the coast's whirlpool: Lugia + Ho-Oh beaten, rain, the Blue Orb → the plane
  await ev(page, `window.__adv.travelTo('coral-coast', 79, 66)`);
  await ready(page, 'coral-coast');
  await ev(page, `(() => { const a = window.__adv; ['lugia', 'ho-oh'].forEach((f) => a.state.setFlag('boss:' + f)); a.state.addItems({ 'blue-orb': 1 }); a.weather = { kind: 'rain', t: 999 }; })()`);
  await ev(page, atSpot('kyogre-gate'));
  await ev(page, `void window.__adv.shrines.open('kyogre-gate')`);
  await ready(page, 'abyssal-depths');
  expect(await ev(page, `window.__adv.shrines.debug().views`)).toEqual(['kyogre']);
  // inside: the ritual (Blue Orb on the altar, stand still) → Kyogre
  await ev(page, `(() => { const a = window.__adv; a.spawns.maxActive = 0; const t = a.world.trainer; t.maxHp = t.hp = 1e9; })()`);
  await ev(page, atSpot('kyogre'));
  await ev(page, `void window.__adv.shrines.open('kyogre')`);
  await page.waitForFunction(() => (window as Win).__adv.worldBoss?.defId === 'kyogre', null, { timeout: 15_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: test.info().outputPath('kyogre-abyss.png') });
  expect(errors).toEqual([]);
});
