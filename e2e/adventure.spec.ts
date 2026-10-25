import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const readJson = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const valleyJson = readJson('src/data/world/starter-valley.json');
const ecology: { id: string; biomes: string[]; legendary: boolean; mythical: boolean }[] = readJson('src/data/dex/ecology.json');

// End-to-end checks for the Open World mode (spec part IX). Game state is inspected through
// window.__adv; player actions go through real keyboard/mouse input wherever practical.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  return errors;
};
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

async function menu(page: Page) {
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
}
async function startAdventure(page: Page, fresh: boolean) {
  await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(${fresh})`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI') && (window as Win).__phaser.scene.isActive('Adventure'));
  await page.waitForTimeout(400);
}
async function dialogueOpen(page: Page) {
  return ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
}
async function closeDialogues(page: Page) {
  for (let i = 0; i < 30 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}
async function pickStarter(page: Page, n: number) {
  await ev(page, `window.__adv.world.teleport(71.5*48, 93*48)`);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  for (let i = 0; i < 30; i++) {
    const choices = await ev<boolean>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return !!d && d.list.length > 6; })()`);
    if (choices) break;
    await page.keyboard.press('e');
    await page.waitForTimeout(160);
  }
  await page.keyboard.press(String(n));
  await closeDialogues(page);
}

test.describe.configure({ mode: 'serial' });

test('open world: start, move, follow, auto-combat, spawns, capture, quests, save/load', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = errorsOf(page);
  await page.goto('/?debug');
  await menu(page);
  await startAdventure(page, true);
  // clean collection for a deterministic run (adventure fresh start keeps the collection by design)
  await ev(page, `(() => { const a = window.__adv; a.state.save.collection.length = 0; a.state.adv.party.length = 0; a.state.save.inventory = {}; a.state.save.pokedex = { seen: [], caught: [] }; a.applyParty(); })()`);

  // (2) Open World starts with the main quest active
  expect(await ev(page, `window.__adv.state.quests.states['q-main-1'].status`)).toBe('active');

  // (10) Quest + starter via real dialogue input
  await pickStarter(page, 3);
  expect(await ev(page, `window.__adv.state.party().map(p => p.species)`)).toEqual(['bulbasaur']);
  expect(await ev(page, `window.__adv.state.quests.states['q-main-1'].step`)).toBe(1);
  expect(await ev(page, `window.__adv.state.item('pokeball')`)).toBe(5);

  // (3) Trainer moves with WASD, (4) Pokémon follows
  await ev(page, `window.__adv.world.teleport(81.5*48, 75*48)`);
  await page.waitForTimeout(300);
  const before = await ev<{ x: number; y: number }>(page, `({ x: window.__adv.world.trainer.x, y: window.__adv.world.trainer.y })`);
  await page.keyboard.down('a');
  await page.waitForTimeout(1500);
  await page.keyboard.up('a');
  await page.waitForTimeout(900);
  const after = await ev<{ x: number; y: number; ax: number; ay: number }>(page, `(() => { const w = window.__adv.world; return { x: w.trainer.x, y: w.trainer.y, ax: w.allies[0].x, ay: w.allies[0].y }; })()`);
  expect(before.x - after.x).toBeGreaterThan(150);
  expect(Math.hypot(after.ax - after.x, after.ay - after.y)).toBeLessThan(140);

  // (7) Wild Pokémon spawn from habitat tables
  await ev(page, `window.__adv.world.teleport(44.5*48, 66*48)`);
  await page.waitForFunction(() => (window as Win).__adv.world.enemies.filter((e: Win) => e.alive && e.wild).length >= 3, null, { timeout: 30_000 });
  const species = await ev<string[]>(page, `window.__adv.world.enemies.filter(e => e.alive && e.wild).map(e => e.defId)`);
  // encounter system: ordinary wild species of a biome present on the map, never legendary (the spawn ring can
  // reach the neighbouring forest; exact region/level rules are unit-tested per spawn position)
  const onMap = new Set(['meadow', 'forest', 'farm', 'lake', 'rocky', 'ruins']);
  const wildOk = new Set(ecology.filter((e) => e.biomes.some((b) => onMap.has(b)) && !e.legendary && !e.mythical).map((e) => e.id));
  for (const s of species) expect(wildOk.has(s), s).toBe(true);
  void valleyJson;

  // (5)(6) Auto combat: make one wild hostile next to the party and check real skill damage lands
  const hostileId = await ev<number>(page, `(() => { const w = window.__adv.world; const t = w.trainer; const e = w.enemies.find(e => e.alive && e.wild); e.x = t.x + 130; e.y = t.y; e.wild.homeX = e.x; e.wild.homeY = e.y; e.hostile = true; e.wild.mode = 'chase'; return e.id; })()`);
  await page.waitForFunction((id) => { const e = (window as Win).__adv.world.enemies.find((u: Win) => u.id === id); return !e || !e.alive || e.hp < e.maxHp; }, hostileId, { timeout: 20_000 }).catch(async (err) => {
    console.log('FAILSTATE', await ev(page, `(() => { const w = window.__adv.world; const e = w.enemies.find(u => u.id === ${hostileId}); const a = w.allies[0]; return JSON.stringify({ e: e && { id: e.defId, lv: e.level, x: e.x|0, y: e.y|0, hp: e.hp, st: e.statuses.map(s=>s.kind), mode: e.wild && e.wild.mode, hostile: e.hostile }, a: { id: a.defId, x: a.x|0, y: a.y|0, hp: a.hp, st: a.statuses.map(s=>s.kind), dmg: a.damageDealt, fainted: a.fainted }, t: { x: w.trainer.x|0, y: w.trainer.y|0 }, cmd: w.command, dlg: !!window.__phaser.scene.getScene('AdvUI').dialogueLayer, paused: window.__adv.paused }); })()`));
    throw err;
  });
  expect(await ev<number>(page, `window.__adv.world.allies[0].damageDealt`)).toBeGreaterThan(0);

  // (8)(9) Capture through the real F key with mouse aim; Pokémon lands in Collection + Pokédex.
  // Tactical command "Đi theo" (key 3) stops the party attacking so it can't KO the 1-HP target.
  await page.keyboard.press('3');
  expect(await ev(page, `window.__adv.world.command`)).toBe('follow');
  await ev(page, `(() => { const w = window.__adv.world; for (const e of w.enemies) if (e.hostile) w.removeEnemy(e); })()`);
  await page.waitForTimeout(800);
  const targetPos = await ev<number[]>(page, `(() => { const a = window.__adv, w = a.world, t = w.trainer;
    const e = w.enemies.find(e => e.alive && e.wild && !e.noCapture && e.id !== ${hostileId}) || w.enemies.find(e => e.alive && e.wild && !e.noCapture);
    e.x = t.x + 160; e.y = t.y + 20; e.hp = 1; e.hostile = false; e.wild.mode = 'sleep'; e.wild.t = 60;
    // Gen 1 habitats include species with low catch rates (e.g. Farfetch'd 45): make the roll deterministic
    if (a.previewChance(e) < 1) e.defId = 'rattata';
    window.__capSpecies = e.defId;
    const c = a.cameras.main; return [(e.x - c.worldView.x) * c.zoom, (e.y - c.worldView.y) * c.zoom]; })()`);
  await page.mouse.move(targetPos[0], targetPos[1]);
  await page.waitForTimeout(250);
  await page.keyboard.press('f');
  await page.waitForFunction(() => !(window as Win).__adv.captureFx, null, { timeout: 15_000 });
  const capSpecies = await ev<string>(page, `window.__capSpecies`);
  // capture rate 255 (Rattata) + 1 HP + asleep ⇒ a ≥ 255 ⇒ guaranteed by the Gen III/IV formula
  expect(await ev<string[]>(page, `window.__adv.state.save.collection.map(p => p.species)`)).toContain(capSpecies);
  expect(await ev(page, `window.__adv.state.save.pokedex.caught.includes(window.__capSpecies)`)).toBe(true);
  expect(await ev(page, `window.__adv.state.quests.states['q-main-1'].step`)).toBe(2);
  await page.keyboard.press('Backquote');
  expect(await ev(page, `window.__adv.world.command`)).toBe('auto');

  // finish quest 1 at the professor → rewards & follow-up quests unlock
  await ev(page, `window.__adv.world.teleport(71.5*48, 93*48)`);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.quests.states['q-main-1'].status`)).toBe('completed');
  expect(await ev(page, `window.__adv.state.quests.states['q-main-2'].status`)).toBe('available');

  // (12) Save/Load: persist, reload the page, continue
  await ev(page, `window.__adv.persist()`);
  await page.waitForTimeout(600);
  const savedPos = await ev<{ x: number; y: number }>(page, `window.__adv.state.adv.pos`);
  await page.reload();
  await menu(page);
  await startAdventure(page, false);
  expect(await ev(page, `window.__adv.state.save.collection.length`)).toBe(2);
  expect(await ev(page, `window.__adv.state.quests.states['q-main-1'].status`)).toBe('completed');
  const pos = await ev<{ x: number; y: number }>(page, `({ x: window.__adv.world.trainer.x, y: window.__adv.world.trainer.y })`);
  expect(Math.abs(pos.x - savedPos.x)).toBeLessThan(5);
  expect(await ev(page, `window.__adv.world.allies.length`)).toBe(1); // single active partner
  await page.screenshot({ path: 'test-results/adv-after-load.png' });
  expect(errors).toEqual([]);
});

test('dungeon: Hang Đá Cổ completes and rewards are applied', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = errorsOf(page);
  await page.goto('/?debug');
  await menu(page);
  await startAdventure(page, false);
  await ev(page, `(() => { const a = window.__adv; ['squirtle', 'pikachu'].forEach(s => a.state.addPokemon(s, 18, 'gift')); a.applyParty(); a.persist(); window.__gm(a, { map: 'dungeon', difficulty: 'normal' }); })()`);
  await page.waitForFunction(() => (window as Win).__adv?.dungeon && (window as Win).__phaser.scene.isActive('AdvUI'));
  await page.waitForTimeout(500);
  // sturdy trainer: a KO would eject the party from the dungeon and make this flow test timing-dependent
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
  const ballsBefore = await ev<number>(page, `window.__adv.state.item('pokeball')`);
  // waves: walk in and let the party fight; finish stragglers so the test stays fast
  await ev(page, `window.__adv.world.teleport(15.5*48, 60*48)`);
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'waves');
  expect(await ev(page, `window.__adv.map.doorOpen('D')`)).toBe(false);
  for (let i = 0; i < 4; i++) {
    await page.waitForTimeout(1600);
    await ev(page, `(() => { const w = window.__adv.world; for (let k = 0; k < 2; k++) for (const u of window.__adv.dungeon.waveUnits) if (u.alive) w.applyDamage(u, 99999, w.allies[0]); })()`);
  }
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'hazard', null, { timeout: 15_000 });
  expect(await ev(page, `window.__adv.map.doorOpen('D')`)).toBe(true);
  // hazard corridor → falling rocks are telegraphed
  await ev(page, `window.__adv.world.teleport(15.5*48, 44*48)`);
  await page.waitForFunction(() => (window as Win).__adv.world.zones.some((z: Win) => z.active && z.slot.def.id.startsWith('hazard')), null, { timeout: 8000 });
  await page.screenshot({ path: 'test-results/dungeon-hazard.png' });
  // puzzle: memorise the lit order, then step on the plates
  await ev(page, `window.__adv.world.healParty(); window.__adv.world.teleport(15.5*48, 31.5*48)`);
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'puzzle');
  await page.waitForFunction(() => !(window as Win).__adv.dungeon.demoRunning, null, { timeout: 10_000 });
  const order = await ev<number[]>(page, `window.__adv.map.def.plateOrder`);
  for (const i of order) {
    await ev(page, `window.__adv.world.teleport(15.5*48, 24.5*48)`);
    await page.waitForTimeout(150);
    await ev(page, `(() => { const p = window.__adv.map.plates[${i}]; window.__adv.world.teleport((p.x + 0.5) * 48, (p.y + 0.5) * 48); })()`);
    await page.waitForTimeout(220);
  }
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'bossWait');
  // boss room locks behind you and Onix appears
  await ev(page, `window.__adv.world.healParty(); window.__adv.world.teleport(15.5*48, 11*48)`);
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'boss');
  expect(await ev(page, `window.__adv.map.doorOpen('Q')`)).toBe(false);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'test-results/dungeon-boss.png' });
  await ev(page, `(() => { const w = window.__adv.world; w.applyDamage(window.__adv.dungeon.boss, 1e7, w.allies[0]); })()`);
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'reward');
  // an evolution prompt may appear now that the dungeon is calm: answer "not now" (2)
  await page.waitForTimeout(600);
  for (let i = 0; i < 6 && (await dialogueOpen(page)); i++) {
    const choices = await ev<boolean>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return !!d && d.list.length > 6; })()`);
    await page.keyboard.press(choices ? '2' : 'e');
    await page.waitForTimeout(250);
  }
  // open reward chest with E, then leave through the portal with E
  const chest = await ev<{ x: number; y: number }>(page, `window.__adv.map.chest`);
  await ev(page, `window.__adv.world.teleport((${chest.x} + 0.5) * 48, (${chest.y} + 1.2) * 48)`);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForFunction(() => (window as Win).__adv.dungeon.phase === 'done');
  expect(await ev<number>(page, `window.__adv.state.item('pokeball')`)).toBe(ballsBefore + 3);
  expect(await ev<number>(page, `window.__adv.state.item('hard-stone')`)).toBeGreaterThanOrEqual(1); // first-clear reward
  expect(await ev(page, `window.__adv.state.dungeonCleared('ancient-cave', 'normal')`)).toBe(true);
  const exit = await ev<{ x: number; y: number }>(page, `window.__adv.map.bossExit`);
  await ev(page, `window.__adv.world.teleport((${exit.x} + 0.5) * 48, (${exit.y} + 1.3) * 48)`);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForFunction(() => (window as Win).__adv?.mapKind === 'valley' && (window as Win).__phaser.scene.isActive('Adventure'), null, { timeout: 10_000 }).catch(async (err) => {
    console.log('DBG', await ev(page, `JSON.stringify({ kind: window.__adv?.mapKind, phase: window.__adv?.dungeon?.phase, modal: window.__adv?.modal, dlg: !!window.__phaser.scene.getScene('AdvUI').dialogueLayer, dlgLen: window.__phaser.scene.getScene('AdvUI').dialogueLayer?.list?.length, evoBusy: window.__adv?.evoBusy, t: [window.__adv.world.trainer.x|0, window.__adv.world.trainer.y|0], exit: window.__adv.map.bossExit, inter: [...(window.__adv.interactables?.keys?.() ?? [])] })`));
    console.log('ERR', JSON.stringify(errors));
    throw err;
  });
  expect(errors).toEqual([]);
});

test('mode switching is clean and memory stays bounded', async ({ browser }) => {
  test.setTimeout(300_000);
  // dedicated browser with exposed GC so heap samples measure retained memory, not garbage
  const b = await (browser.browserType()).launch({ channel: 'msedge', args: ['--js-flags=--expose-gc'] });
  const page = await b.newPage({ baseURL: 'http://localhost:4173', viewport: { width: 1280, height: 720 } });
  const errors = errorsOf(page);
  await page.goto('/');
  await menu(page);
  const heap = async () => {
    await ev(page, `(async () => { for (let i = 0; i < 3; i++) { window.gc?.(); await new Promise(r => setTimeout(r, 100)); } })()`);
    return ev<number>(page, `performance.memory ? performance.memory.usedJSHeapSize : 0`);
  };
  const samples: number[] = [];
  for (let i = 0; i < 6; i++) {
    await startAdventure(page, false);
    await ev(page, `window.__adv.world.teleport(44.5*48, 66*48)`);
    await page.waitForTimeout(2500);
    await ev(page, `window.__adv.exitToMenu()`);
    await menu(page);
    await ev(page, `window.__phaser.scene.getScene('Menu').startSurvivor()`);
    await page.waitForFunction(() => (window as Win).__game?.world && (window as Win).__phaser.scene.isActive('Game'));
    await page.waitForTimeout(2500);
    await ev(page, `window.__modes.toMenu(window.__game)`);
    await menu(page);
    await page.waitForTimeout(300);
    // only one mode's scenes may ever be active
    expect(await ev<string[]>(page, `window.__phaser.scene.getScenes(true).map(s => s.scene.key)`)).toEqual(['Menu']);
    samples.push(await heap());
  }
  console.log('heap MB per cycle', samples.map((b) => (b / 1048576).toFixed(1)).join(', '));
  // after warm-up (textures, atlases, pools), retained heap must not keep growing per cycle
  if (samples[0] > 0) expect(samples[samples.length - 1] - samples[1]).toBeLessThan(12 * 1048576);
  expect(errors).toEqual([]);
  await b.close();
});

test('open world on a phone: touch joystick + buttons', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const errors = errorsOf(page);
  await page.goto('/');
  await menu(page);
  await startAdventure(page, false);
  await ev(page, `window.__adv.world.teleport(81.5*48, 75*48)`);
  await page.waitForTimeout(400);
  const x0 = await ev<number>(page, `window.__adv.world.trainer.x`);
  await page.mouse.move(150, 500);
  await page.mouse.down();
  await page.mouse.move(70, 500, { steps: 5 });
  await page.waitForTimeout(800);
  await page.mouse.up();
  const x1 = await ev<number>(page, `window.__adv.world.trainer.x`);
  expect(x0 - x1).toBeGreaterThan(60);
  await page.screenshot({ path: 'test-results/adv-mobile.png' });
  expect(errors).toEqual([]);
  await ctx.close();
});
