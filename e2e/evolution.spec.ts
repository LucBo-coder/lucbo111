import { expect, test, type Page } from '@playwright/test';
import { beatBossTo, catchWeakenedLegend } from './bossHelpers';

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const errorsOf = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  return errors;
};
async function startAdventure(page: Page) {
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await ev(page, `(() => { const a = window.__adv; a.state.save.collection.length = 0; a.state.adv.party.length = 0; a.state.save.inventory = {}; a.state.save.currency = 0; a.applyParty(); })()`);
}
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
async function waitChoices(page: Page) {
  for (let i = 0; i < 40; i++) {
    if (await ev<boolean>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return !!d && d.list.length > 6; })()`)) return;
    await page.keyboard.press('e');
    await page.waitForTimeout(150);
  }
  throw new Error('no dialogue choices');
}

test.describe.configure({ mode: 'serial' });

test('IcyEthics sprites are converted into game atlases', async ({ page }) => {
  const errors = errorsOf(page);
  await startAdventure(page);
  for (const k of ['diglett', 'gulpin', 'hoothoot', 'paras', 'canight', 'perropello', 'dugtrio']) {
    expect(await ev(page, `window.__phaser.textures.exists('${k}_sheet') && window.__phaser.anims.exists('${k}:walk')`), k).toBe(true);
  }
  for (const k of ['charizard', 'charizard-mega-x', 'venusaur-mega', 'magneton']) expect(await ev(page, `window.__phaser.textures.exists('${k}_sheet')`), k).toBe(true);
  expect(errors).toEqual([]);
});

test('shop, level-up evolution prompt, equipment and Mega Evolution', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = errorsOf(page);
  await startAdventure(page);

  // Shop: talk with E, buy item #1 (Poké Ball) with the number key
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('charmander', 15, 'starter'); a.applyParty(); a.state.earn(1000); a.world.teleport(93.5*48, 103.5*48); })()`);
  await page.waitForTimeout(500);
  await page.keyboard.press('e');
  await waitChoices(page);
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.state.item('pokeball')`)).toBe(1);
  expect(await ev(page, `window.__adv.state.money`)).toBe(800);
  await waitChoices(page);
  await page.keyboard.press('Escape'); // leave the shop (Escape cancels a choice menu)
  await page.waitForTimeout(300);
  expect(await dialogueOpen(page)).toBe(false);

  // Level-up → evolution prompt appears out of combat → accept with "1" → animation → Charmeleon
  await ev(page, `window.__adv.world.teleport(81.5*48, 75*48)`);
  await ev(page, `(() => { const a = window.__adv; const p = a.state.party()[0]; const ups = a.state.gainExp([p.uid], 3000); for (const u of ups) a.evoQueue.add(u.uid); })()`);
  await waitChoices(page);
  await page.keyboard.press('1');
  // the evolution scene can be skipped (any key: reveal, then close the stat card) — exercise that too
  for (let i = 0; i < 40 && (await ev<string>(page, `window.__adv.state.party()[0].species`)) !== 'charmeleon'; i++) {
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
  }
  await page.waitForFunction(() => (window as Win).__adv.state.party()[0].species === 'charmeleon', null, { timeout: 15_000 });
  expect(await ev(page, `window.__adv.world.allies[0].defId`)).toBe('charmeleon');
  expect(await ev(page, `window.__adv.state.save.pokedex.caught.includes('charmeleon')`)).toBe(true);

  // Equipment: equip Charcoal, the field unit gets the effect immediately
  await ev(page, `(() => { const a = window.__adv; a.state.addItems({ charcoal: 1 }); a.equipItem(a.state.party()[0].uid, 'charcoal'); })()`);
  expect(await ev(page, `window.__adv.world.allies[0].heldId`)).toBe('charcoal');
  expect(await ev(page, `window.__adv.state.item('charcoal')`)).toBe(0);

  // Mega: Charizard + Charizardite X + Key Stone, press G in combat
  await ev(page, `(() => { const a = window.__adv; const p = a.state.addPokemon('charizard', 40, 'gift'); a.state.addItems({ 'key-stone': 1, 'charizardite-x': 1 }); a.equipItem(p.uid, 'charizardite-x'); a.applyParty(); })()`);
  await page.keyboard.press('g');
  await page.waitForTimeout(200);
  expect(await ev(page, `window.__adv.megaUnit`)).toBeNull(); // not in combat → refused
  await ev(page, `(() => { const w = window.__adv.world, t = w.trainer; const e = w.spawnWild('rattata', 30, t.x + 200, t.y, { hostile: true, hpMult: 80, wild: { mode: 'chase', t: 0, homeX: t.x + 200, homeY: t.y, homeR: 10, leash: 900, temperament: 'aggressive', aggroR: 600, nocturnal: false, wanderX: 0, wanderY: 0, lastAttacker: null, threat: null, lodT: 0, fled: false, calmT: 0 } }); window.__foe = e; })()`);
  await page.waitForTimeout(300);
  await page.keyboard.press('g');
  await page.waitForFunction(() => (window as Win).__adv.megaUnit?.defId === 'charizard-mega-x', null, { timeout: 5000 });
  expect(await ev(page, `window.__adv.megaUnit.types`)).toEqual(['fire', 'dragon']);
  await page.screenshot({ path: 'test-results/e-mega.png' });
  // combat ends → reverts after the idle timer, cooldown starts
  await ev(page, `window.__adv.world.removeEnemy(window.__foe)`);
  await page.waitForFunction(() => !(window as Win).__adv.megaUnit, null, { timeout: 20_000 });
  expect(await ev(page, `window.__adv.world.allies.some(a => a.defId === 'charizard')`)).toBe(true);
  expect(await ev<number>(page, `window.__adv.megaCd`)).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('world boss Mega Venusaur spawns in its grove and drops the Key Stone', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await startAdventure(page);
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('charizard', 35, 'gift'); a.state.addPokemon('pidgeot', 35, 'gift'); a.applyParty(); a.world.teleport(44.5*48, 30*48); })()`);
  await page.waitForFunction(() => (window as Win).__adv.worldBoss?.alive, null, { timeout: 10_000 });
  expect(await ev(page, `window.__adv.world.boss.boss.def.ai`)).toBe('venusaur');
  // its own AI telegraphs attacks (beam lines / rings / spore fields)
  await page.waitForFunction(() => { const w = (window as Win).__adv.world; return w.zones.some((z: Win) => z.active && z.owner === w.boss); }, null, { timeout: 10_000 });
  await beatBossTo(page, 0); // phase by phase (one hit never skips a phase)
  await page.waitForFunction(() => (window as Win).__adv.state.item('key-stone') === 1, null, { timeout: 10_000 });
  expect(await ev(page, `window.__adv.state.item('venusaurite')`)).toBe(1);
  expect(await ev(page, `window.__adv.state.hasFlag('boss:mega-venusaur')`)).toBe(true);
  // respawn timer: boss does not come back immediately
  await page.waitForTimeout(1500);
  expect(await ev(page, `!!window.__adv.worldBoss`)).toBe(false);
  expect(errors).toEqual([]);
});

test('legendary shrines: sealed until the story flag, then Articuno fights and joins the party', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = errorsOf(page);
  await startAdventure(page);
  // the trainer is made sturdy: this test checks the shrine mechanics, not whether a Lv1 trainer survives a Lv38 legendary
  // (a knocked-out trainer respawns in the village and the boss resets, which made the test flaky on slow machines)
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('blastoise', 40, 'gift'); a.state.addPokemon('charizard', 40, 'gift'); a.applyParty(); a.world.trainer.maxHp = a.world.trainer.hp = 1e7; a.world.teleport(144.5*48, 61*48); })()`);
  // sealed: no boss without the Mega Venusaur flag
  await page.waitForTimeout(2500);
  expect(await ev(page, `!!window.__adv.worldBoss`)).toBe(false);
  // story flag set → Articuno descends at its shrine with the legendary AI
  await ev(page, `window.__adv.state.setFlag('boss:mega-venusaur')`);
  await page.waitForFunction(() => (window as Win).__adv.worldBoss?.alive, null, { timeout: 10_000 });
  expect(await ev(page, `window.__adv.worldBoss.defId`)).toBe('articuno');
  expect(await ev(page, `window.__adv.world.boss.boss.def.ai`)).toBe('legendary');
  await page.waitForFunction(() => { const w = (window as Win).__adv.world; return w.zones.some((z: Win) => z.active && z.owner === w.boss); }, null, { timeout: 12_000 });
  await page.screenshot({ path: 'test-results/legendary-articuno.png' });
  await beatBossTo(page, 0);
  // every phase cleared → story flag at once (progress never depends on a capture roll), then the capture window
  await page.waitForFunction(() => (window as Win).__adv.state.hasFlag('boss:articuno'), null, { timeout: 10_000 });
  expect(await ev(page, `window.__adv.state.save.collection.some(p => p.species === 'articuno')`)).toBe(false);
  await catchWeakenedLegend(page);
  expect(await ev(page, `window.__adv.state.save.collection.filter(p => p.species === 'articuno').length`)).toBe(1);
  expect(await ev(page, `window.__adv.state.item('wise-glasses')`)).toBe(1);
  // Mewtwo stays sealed until all three birds acknowledged the trainer
  await ev(page, `window.__adv.world.teleport(62.5*48, 43*48)`);
  await page.waitForTimeout(2500);
  expect(await ev(page, `!!window.__adv.worldBoss`)).toBe(false);
  expect(errors).toEqual([]);
});

test('Survivor: evolution card appears at the PokéAPI level and transforms the ally (run only)', async ({ page }) => {
  const errors = errorsOf(page);
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__phaser.scene.getScene('Menu').startSurvivor()`);
  await page.waitForFunction(() => (window as Win).__game?.world);
  await ev(page, `(() => { const w = window.__game.world; while (w.allies[0].level < 16) w.gainExp(w.expNext); })()`);
  await page.waitForFunction(() => (window as Win).__game.world.state === 'levelup');
  const firstKind = await ev<string>(page, `window.__game.world.currentOffers[0].kind`);
  expect(firstKind).toBe('evolve');
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test-results/e-survivor-evolve-card.png' });
  await page.keyboard.press('1');
  await page.waitForFunction(() => (window as Win).__game.world.allies[0].defId === 'charmeleon', null, { timeout: 5000 });
  expect(await ev(page, `window.__game.world.allies[0].defId`)).toBe('charmeleon');
  expect(errors).toEqual([]);
});
