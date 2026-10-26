import { expect, test, type Page } from '@playwright/test';
import { beatBossTo, catchWeakenedLegend } from './bossHelpers';

// V3 world systems in the real game: encounter system, world events (gameplay + cleanup + journal),
// shiny persistence, roaming legendary HP persistence, non-combat legendary meeting.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  return errors;
};
async function start(page: Page) {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await ev(page, `(() => { const a = window.__adv; a.state.save.collection.length = 0; a.state.adv.party.length = 0; ['blastoise', 'charizard', 'venusaur'].forEach((s) => a.state.addPokemon(s, 40, 'gift')); a.applyParty(); const t = a.world.trainer; t.maxHp = t.hp = 1e7; })()`);
}

test('world events: outbreak, alpha, treasure, weather anomaly — gameplay, rewards, cleanup, journal', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = errorsOf(page);
  await start(page);
  await ev(page, `window.__adv.world.teleport(44.5*48, 66*48)`);
  await page.waitForTimeout(600);

  // Outbreak: a herd of one species appears, the event has a goal and a countdown
  const ob = await ev<Win>(page, `(() => { const e = window.__adv.worldEvents.force('outbreak', 'starter-valley'); return { uid: e.uid, species: e.data.species, goal: e.goal, end: e.end, start: e.start }; })()`);
  expect(ob.goal).toBe(6);
  expect(ob.end - ob.start).toBe(240);
  const herd = await ev<number>(page, `window.__adv.world.enemies.filter(e => e.alive && e.tag === 'event:${ob.uid}').length`);
  expect(herd).toBeGreaterThanOrEqual(3);
  expect(await ev(page, `window.__adv.worldEvents.views().length`)).toBe(1);
  // completing the goal: defeat 6 of the species → reward and the herd is cleaned up
  for (let i = 0; i < 6; i++) {
    await ev(page, `(() => { const w = window.__adv.world, t = w.trainer; let u = w.enemies.find(e => e.alive && e.defId === '${ob.species}'); if (!u) u = w.spawnWild('${ob.species}', 8, t.x + 200, t.y, { hostile: false }); w.applyDamage(u, 1e7, w.allies[0]); })()`);
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => (window as Win).__adv.worldEvents.views().length === 0, null, { timeout: 5000 });
  expect(await ev<number>(page, `window.__adv.world.enemies.filter(e => e.alive && e.tag === 'event:${ob.uid}').length`)).toBe(0);
  expect(await ev<number>(page, `window.__adv.state.item('greatball')`)).toBeGreaterThanOrEqual(5);
  expect(await ev(page, `window.__adv.state.adv.events.history[0].outcome`)).toBe('completed');

  // Alpha: bigger, stronger, rewards on defeat
  const al = await ev<Win>(page, `(() => { const e = window.__adv.worldEvents.force('alpha', 'starter-valley'); const u = window.__adv.world.enemies.find(x => x.tag === 'event:' + e.uid); return { uid: e.uid, alpha: u.alpha, level: u.level, elite: u.elite }; })()`);
  expect(al.alpha).toBe(true);
  expect(al.level).toBeGreaterThanOrEqual(12);
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/v3-alpha.png' });
  const money0 = await ev<number>(page, `window.__adv.state.money`);
  await ev(page, `(() => { const w = window.__adv.world; const u = w.enemies.find(x => x.alive && x.alpha); w.applyDamage(u, 1e8, w.allies[0]); })()`);
  await page.waitForFunction(() => !(window as Win).__adv.worldEvents.views().some((v: Win) => v.type === 'alpha'), null, { timeout: 5000 });
  expect(await ev<number>(page, `window.__adv.state.money`)).toBeGreaterThan(money0 + 1000);

  // Treasure: chest guarded — can't open until the guards fall, then E opens it
  const tr = await ev<Win>(page, `(() => { const e = window.__adv.worldEvents.force('treasure', 'starter-valley'); return { uid: e.uid, x: e.data.x, y: e.data.y, loot: e.data.loot }; })()`);
  expect(await ev(page, `window.__adv.interactables.has('evchest-${tr.uid}')`)).toBe(true);
  expect(await ev(page, `window.__adv.worldEvents.openTreasure(${tr.uid})`)).toBe(false);
  await ev(page, `(() => { const w = window.__adv.world; for (const u of w.enemies) if (u.alive && u.tag === 'event:${tr.uid}') w.applyDamage(u, 1e8, w.allies[0]); })()`);
  await ev(page, `window.__adv.world.teleport(${tr.x}, ${tr.y} + 30)`);
  await page.waitForTimeout(500);
  const before = await ev<number>(page, `window.__adv.state.item('${tr.loot}')`);
  await page.keyboard.press('e');
  await page.waitForFunction((loot) => (window as Win).__adv.state.item(loot) > 0, tr.loot, { timeout: 5000 });
  expect(await ev<number>(page, `window.__adv.state.item('${tr.loot}')`)).toBe(before + 1);
  expect(await ev(page, `window.__adv.interactables.has('evchest-${tr.uid}')`)).toBe(false);

  // Weather anomaly overrides the sky and the combat modifiers, then restores them
  await ev(page, `window.__adv.world.teleport(120*48, 40*48)`);
  await page.waitForTimeout(500);
  const wx = await ev<Win>(page, `(() => { const e = window.__adv.worldEvents.force('weather', 'rocky-highlands'); return { kind: e.data.kind, sky: window.__adv.effectiveWeather(), mods: window.__adv.world.weatherMods }; })()`);
  expect(wx.sky).toBe(wx.kind);
  expect(Object.keys(wx.mods).length).toBeGreaterThan(0);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/v3-weather.png' });
  await ev(page, `(() => { const d = window.__adv.worldEvents.director; const e = d.active.find(x => x.type === 'weather'); e.end = 0; })()`);
  await page.waitForFunction(() => (window as Win).__adv.effectiveWeather() !== 'thunderstorm' && Object.keys((window as Win).__adv.world.weatherMods).length === 0, null, { timeout: 5000 });

  // Event Journal tab renders with history
  await page.keyboard.press('v');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'test-results/v3-journal.png' });
  expect(await ev<number>(page, `window.__adv.state.adv.events.history.length`)).toBeGreaterThanOrEqual(4);
  await page.keyboard.press('Escape');
  expect(errors).toEqual([]);
});

test('shiny capture persists; roaming legendary keeps its HP; Celebi meeting at dawn', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = errorsOf(page);
  await start(page);

  // Shiny: a shiny wild Pokémon captured stays shiny in the collection + Pokédex
  await ev(page, `(() => { const a = window.__adv, w = a.world, t = w.trainer; const u = w.spawnWild('pidgey', 5, t.x + 160, t.y, { hostile: false }); u.shiny = true; a.state.addPokemon(u.defId, u.level, 'wild', u.shiny); a.persist(); })()`);
  expect(await ev(page, `window.__adv.state.save.collection.some(p => p.species === 'pidgey' && p.shiny)`)).toBe(true);
  expect(await ev(page, `window.__adv.state.save.pokedex.shiny.includes('pidgey')`)).toBe(true);

  // Roaming Raikou: appears, flees with its HP saved, reappears with the same HP
  await ev(page, `window.__adv.world.teleport(44.5*48, 66*48); window.__adv.state.setFlag('boss:mega-venusaur')`);
  await page.waitForTimeout(500);
  const hp1 = await ev<number>(page, `(() => { const m = window.__adv.legendsMgr; const u = m.appear(m.roamers().find(l => l.id === 'raikou')); window.__adv.world.applyDamage(u, Math.round(u.maxHp * 0.4), window.__adv.world.allies[0]); return u.hp / u.maxHp; })()`);
  expect(await ev(page, `window.__adv.state.adv.legends.raikou`)).toBe('active');
  await ev(page, `window.__adv.legendsMgr.flee()`);
  const saved = await ev<number>(page, `window.__adv.state.adv.legendHp.raikou`);
  expect(Math.abs(saved - hp1)).toBeLessThan(0.05);
  const hp2 = await ev<number>(page, `(() => { const m = window.__adv.legendsMgr; const u = m.appear(m.roamers().find(l => l.id === 'raikou')); return u.hp / u.maxHp; })()`);
  expect(Math.abs(hp2 - saved)).toBeLessThan(0.02);
  // beaten through its phases → weakened → caught: joins once, state caught, no further appearances
  await beatBossTo(page, 0);
  await catchWeakenedLegend(page);
  await page.waitForFunction(() => (window as Win).__adv.state.adv.legends.raikou === 'caught', null, { timeout: 5000 });
  expect(await ev<number>(page, `window.__adv.state.save.collection.filter(p => p.species === 'raikou').length`)).toBe(1);
  for (let i = 0; i < 6 && (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(200); }

  // Celebi: no fight — appears at its grove shrine in Emerald Woods (since the V22 shrines) at dawn, the player invites it
  await ev(page, `window.__adv.travelTo('emerald-woods', 23, 76)`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'emerald-woods' && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), null, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await ev(page, `(() => { const a = window.__adv; a.spawns.maxActive = 0; for (const e of a.world.enemies) e.alive = false; a.state.adv.bossDefeatedAt['mega-venusaur'] = a.state.adv.playTime; a.state.adv.clock = 6 * 60; a.world.teleport(23.5*48, 70*48); })()`);
  for (let i = 0; i < 40 && !(await ev<boolean>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return !!d && d.list.length > 6; })()`)); i++) {
    if (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)) await page.keyboard.press('e');
    await page.waitForTimeout(200);
  }
  await page.keyboard.press('1');
  await page.waitForFunction(() => (window as Win).__adv.state.adv.legends.celebi === 'caught', null, { timeout: 5000 });
  expect(await ev(page, `window.__adv.state.save.collection.some(p => p.species === 'celebi')`)).toBe(true);
  expect(errors).toEqual([]);
});

test('new shrine with a weather condition: Lugia waits for rain, then fights with the legendary AI', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await start(page);
  // since 0.17 the shrine stands in its themed region: travel there first (bypasses the portal gate)
  await ev(page, `window.__adv.travelTo('coral-coast', 66, 20)`);
  await page.waitForFunction((r) => (window as Win).__adv?.map?.id === r && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), 'coral-coast', { timeout: 15_000 });
  await ev(page, `(() => { const a = window.__adv; ['mega-venusaur', 'articuno', 'zapdos', 'moltres'].forEach((b) => a.state.setFlag('boss:' + b)); a.weather = { kind: 'clear', t: 999 }; const t = a.world.trainer; t.maxHp = t.hp = 1e7; a.world.teleport(88.5*48, 28*48); })()`);
  await page.waitForTimeout(2500);
  expect(await ev(page, `!!window.__adv.worldBoss`)).toBe(false); // clear sky: Lugia stays hidden
  await ev(page, `window.__adv.weather = { kind: 'rain', t: 999 }`);
  await page.waitForFunction(() => (window as Win).__adv.worldBoss?.alive, null, { timeout: 10_000 });
  expect(await ev(page, `window.__adv.worldBoss.defId`)).toBe('lugia');
  expect(await ev(page, `window.__adv.world.boss.boss.def.ai`)).toBe('legendary');
  expect(await ev(page, `window.__adv.state.adv.legends.lugia`)).toBe('active');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/v3-lugia.png' });
  await beatBossTo(page, 0);
  await catchWeakenedLegend(page);
  await page.waitForFunction(() => (window as Win).__adv.state.adv.legends.lugia === 'caught', null, { timeout: 8000 });
  expect(await ev(page, `window.__adv.state.save.collection.filter(p => p.species === 'lugia').length`)).toBe(1);
  expect(await ev(page, `window.__adv.state.hasFlag('boss:lugia')`)).toBe(true); // unlocks Latias / Latios (story flag)
  expect(errors).toEqual([]);
});
