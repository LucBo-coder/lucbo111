import { expect, test, type Page } from '@playwright/test';
import { beatBossTo } from './bossHelpers';

// Vietnam Odyssey — first goal of Master Prompt V6, played through the real game loop:
// new game in Cà Mau → starter from Giáo sư An (dialogue) → capture a wild Pokémon (Poké Ball) → quests →
// trainer battle → regional boss (phases) → badge → save, reload, load → gate opens → An Giang.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const qStatus = (page: Page, id: string) => ev<string>(page, `window.__adv.state.quests.states['${id}']?.status ?? 'none'`);

/** Walk up to an NPC (teleport next to it) and keep the conversation going (E / choice key) until `done`. */
async function talk(page: Page, npc: string, done: string, choice = '1', tries = 60) {
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.npcs.find(x => x.id === '${npc}'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(350);
  for (let i = 0; i < tries; i++) {
    if (await ev<boolean>(page, done)) return;
    const open = await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
    await page.keyboard.press(open && i % 2 ? choice : 'e');
    await page.waitForTimeout(180);
  }
  throw new Error(`talk ${npc}: condition never met: ${done}`);
}
const teleport = (page: Page, x: number, y: number) => ev(page, `window.__adv.world.teleport(${x} * 48 + 24, ${y} * 48 + 24)`);

test('Việt Nam Odyssey: Cà Mau from the first step to the An Giang gate', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('0-menu.png') });

  // new Vietnam game in slot 1
  await ev(page, `window.__phaser.scene.getScene('Menu').openSlots('new', 'vietnam')`);
  await page.waitForTimeout(300);
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  expect(await ev(page, `window.__adv.state.adv.campaign`)).toBe('vietnam');
  expect(await ev(page, `window.__adv.state.save.collection.length`)).toBe(0);
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e6; })()`); // the test plays the story, not survival
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('1-dat-mui.png') });

  // 1) starter from Giáo sư An: choose Mudkip (3rd choice)
  await talk(page, 'vn-prof', `window.__adv.state.save.collection.some(p => p.species === 'mudkip')`, '3');
  for (let i = 0; i < 12 && (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  expect(await ev(page, `window.__adv.world.allies.map(a => a.defId)`)).toEqual(['mudkip']);
  expect(await ev<number>(page, `window.__adv.state.item('pokeball')`)).toBeGreaterThan(0);

  // 2) capture a real wild Pokémon with a Poké Ball on the cape / mangrove
  await ev(page, `window.__adv.state.addItems({ pokeball: 30 })`);
  await teleport(page, 70, 66);
  await page.waitForFunction(() => (window as Win).__adv.world.enemies.some((e: Win) => e.alive && e.wild && !e.tag), undefined, { timeout: 40_000 });
  let caught = false;
  for (let i = 0; i < 25 && !caught; i++) {
    await ev(page, `(() => { const a = window.__adv, w = a.world, t = w.trainer; if (a.captureFx) return;
      const e = w.enemies.filter(x => x.alive && x.wild && !x.tag && !x.captured).sort((p, q) => Math.hypot(p.x - t.x, p.y - t.y) - Math.hypot(q.x - t.x, q.y - t.y))[0]; if (!e) return;
      e.hp = Math.max(1, Math.round(e.maxHp * 0.05)); e.x = t.x + 90; e.y = t.y; e.vx = e.vy = 0;
      a.selectedBall = 'pokeball'; a.pointerWorld = { x: e.x, y: e.y, at: a.time.now }; a.throwBall(); })()`);
    await page.waitForTimeout(2600);
    caught = await ev<boolean>(page, `window.__adv.state.save.collection.length >= 2`);
  }
  expect(caught).toBe(true);
  await talk(page, 'vn-prof', `window.__adv.state.quests.states['vn-cm-1'].status === 'completed'`);
  // accept the next main quest from the professor
  await talk(page, 'vn-prof', `window.__adv.state.quests.states['vn-cm-2'].status === 'active'`);

  // 3) through the mangrove into U Minh, activate the ranger station, meet the ranger
  await ev(page, `(() => { const a = window.__adv; a.state.save.collection.forEach(p => { p.level = 14; }); a.world.allies.forEach(u => a.world.setAllyLevel(u, 14)); })()`);
  await teleport(page, 72, 60); await page.waitForTimeout(700);
  await teleport(page, 62, 38); await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath('2-u-minh.png') });
  await teleport(page, 66, 37); await page.waitForTimeout(400);
  for (let i = 0; i < 10 && !(await ev<boolean>(page, `window.__adv.state.adv.waypoints.includes('wp-cm-uminh')`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  for (let i = 0; i < 10 && (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  await talk(page, 'cm-ranger', `window.__adv.state.quests.states['vn-cm-2'].status === 'completed'`);
  await talk(page, 'cm-ranger', `window.__adv.state.quests.states['vn-cm-3'].status === 'active'`);

  // 4) the boss is sealed until the trainer test is passed
  await teleport(page, 28, 34); await page.waitForTimeout(1500);
  expect(await ev(page, `!!window.__adv.worldBoss`)).toBe(false);
  // trainer battle: accept the challenge, beat her team
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.trainers.find(x => x.id === 'cm-forest-trainer'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 20 && !(await ev<boolean>(page, `!!window.__adv.battle`)); i++) { const open = await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`); await page.keyboard.press(open && i % 2 ? '1' : 'e'); await page.waitForTimeout(200); }
  expect(await ev(page, `!!window.__adv.battle`)).toBe(true);
  for (let i = 0; i < 40 && !(await ev<boolean>(page, `window.__adv.state.hasFlag('beat:cm-forest-trainer')`)); i++) {
    await ev(page, `(() => { const w = window.__adv.world; for (const u of (window.__adv.battle?.units ?? [])) if (u.alive) w.applyDamage(u, u.maxHp, w.allies[0]); })()`);
    await page.waitForTimeout(400);
  }
  expect(await ev(page, `window.__adv.state.hasFlag('beat:cm-forest-trainer')`)).toBe(true);
  for (let i = 0; i < 10 && (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }

  // 5) regional boss: Seviper — Chúa Rừng U Minh (phases, real-time fight, no capture window)
  await teleport(page, 28, 34);
  await page.waitForTimeout(2000);
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.defId === 'seviper', undefined, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('3-seviper.png') });
  expect(await ev(page, `window.__adv.world.boss.boss.pm.count`)).toBe(3);
  await beatBossTo(page, 0);
  await page.waitForFunction(() => (window as Win).__adv.state.hasFlag('badge:ca-mau'), undefined, { timeout: 15_000 });
  expect(await ev(page, `window.__adv.state.save.collection.some(p => p.species === 'seviper')`)).toBe(false);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath('4-badge.png') });
  await talk(page, 'vn-prof', `window.__adv.state.quests.states['vn-cm-3'].status === 'completed'`);

  // 6) save → reload → Load Game → still Cà Mau with the badge
  await ev(page, `window.__adv.exitToMenu()`);
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('5-menu-continue.png') });
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1)`);
  await ready(page, 'ca-mau');
  expect(await ev(page, `window.__adv.state.hasFlag('badge:ca-mau')`)).toBe(true);
  expect(await ev(page, `window.__adv.state.quests.states['vn-cm-3'].status`)).toBe('completed');

  // 7) the northern gate is open now → An Giang
  await ev(page, `(() => { const a = window.__adv; const p = a.regionDef.portals.find(x => x.to === 'an-giang'); a.world.teleport((p.x + 0.5) * 48, (p.y + 2.5) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 12 && (await ev<string>(page, `window.__adv.map.id`)) === 'ca-mau'; i++) { const open = await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`); await page.keyboard.press(open && i % 2 ? '1' : 'e'); await page.waitForTimeout(300); }
  await ready(page, 'an-giang');
  expect(await qStatus(page, 'vn-ag-1')).toBe('active');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: info.outputPath('6-an-giang.png') });
  expect(errors).toEqual([]);
});

test('An Giang: rescue, temple seal puzzle, temple guardian, ferry to Phú Quốc', async ({ page }, info) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 2, 'vietnam')`);
  await ready(page, 'ca-mau');
  // skip Cà Mau (tested above): party + badge, travel north
  await ev(page, `(() => { const a = window.__adv; ['marshtomp', 'combusken', 'grovyle'].forEach(s => a.state.addPokemon(s, 22, 'gift')); a.applyParty(); a.state.setFlag('badge:ca-mau');
    const p = a.regionDef.portals.find(x => x.to === 'an-giang'); a.travelTo(p.to, p.toX, p.toY); })()`);
  await ready(page, 'an-giang');
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e6; })()`);
  // vn-ag-1: Pokémon Center, Bảy Núi, the survey leader
  await teleport(page, 73, 91); await page.waitForTimeout(400);
  for (let i = 0; i < 10 && !(await ev<boolean>(page, `window.__adv.state.adv.waypoints.includes('wp-an-giang-center')`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  for (let i = 0; i < 10 && (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  await teleport(page, 66, 48); await page.waitForTimeout(700);
  await talk(page, 'ag-researcher', `window.__adv.state.quests.states['vn-ag-1'].status === 'completed'`);
  await talk(page, 'ag-researcher', `window.__adv.state.quests.states['vn-ag-rescue'].status === 'active'`);
  // rescue Smeargle: beat the Geodude guards, then free it
  await teleport(page, 74, 33); await page.waitForTimeout(1200);
  for (let i = 0; i < 20 && (await ev<boolean>(page, `window.__adv.world.enemies.some(e => e.tag === 'rescue' && e.alive)`)); i++) {
    await ev(page, `(() => { const w = window.__adv.world; for (const e of w.enemies) if (e.tag === 'rescue' && e.alive) w.applyDamage(e, e.maxHp, w.allies[0]); })()`);
    await page.waitForTimeout(300);
  }
  await teleport(page, 74, 31); await page.waitForTimeout(400);
  for (let i = 0; i < 10 && !(await ev<boolean>(page, `window.__adv.state.hasFlag('rescued:ag-survey-smeargle')`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  expect(await ev(page, `window.__adv.state.hasFlag('rescued:ag-survey-smeargle')`)).toBe(true);
  await talk(page, 'ag-researcher', `window.__adv.state.quests.states['vn-ag-rescue'].status === 'completed'`);
  await talk(page, 'ag-researcher', `window.__adv.state.quests.states['vn-ag-temple'].status === 'active'`);
  // the guardian sleeps until the seal is solved: NƯỚC → RỪNG → NÚI (plates 1, 2, 0)
  await teleport(page, 64, 22); await page.waitForTimeout(1500);
  expect(await ev(page, `!!window.__adv.worldBoss`)).toBe(false);
  for (const [x, y] of [[64, 18], [72, 16], [56, 16]]) { await teleport(page, x, y); await page.waitForTimeout(500); }
  expect(await ev(page, `window.__adv.state.hasFlag('puzzle:ag-temple-seal')`)).toBe(true);
  await teleport(page, 64, 16);
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.defId === 'claydol', undefined, { timeout: 15_000 });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: info.outputPath('7-claydol.png') });
  await beatBossTo(page, 0);
  await page.waitForFunction(() => (window as Win).__adv.state.hasFlag('badge:an-giang'), undefined, { timeout: 15_000 });
  // ferry out to Phú Quốc and back
  await ev(page, `(() => { const a = window.__adv; const p = a.regionDef.portals.find(x => x.id === 'ag-ferry-out'); a.travelTo(p.to, p.toX, p.toY); })()`);
  // same map: wait for the scene to come back with the trainer on the island
  await page.waitForFunction(() => { const a = (window as Win).__adv; return a?.world && !a.modal && Math.abs(a.world.trainer.x / 48 - 22.5) < 2 && (window as Win).__phaser.scene.isActive('AdvUI'); }, undefined, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  expect(await ev<string>(page, `window.__adv.areaName`)).toBe('Đảo Phú Quốc');
  await page.screenshot({ path: info.outputPath('8-phu-quoc.png') });
  // the Passport tab (P) stamps both provinces and both badges
  const pages = await ev<{ id: string; visited: boolean; badge: boolean; firstVisit: number }[]>(page,
    `window.__passport(window.__adv.state.adv, window.__adv.state.quests.defs.map(d => d.id)).map(p => ({ id: p.def.id, visited: p.visited, badge: p.badge, firstVisit: p.firstVisit }))`);
  for (const id of ['ca-mau', 'an-giang']) expect(pages.find((p) => p.id === id)).toMatchObject({ visited: true, badge: true });
  expect(pages.find((p) => p.id === 'an-giang')!.firstVisit).toBeGreaterThan(0);
  await page.keyboard.press('p');
  await page.waitForTimeout(600);
  expect(await ev(page, `window.__phaser.scene.getScene('AdvUI').menuTab`)).toBe('passport');
  await page.screenshot({ path: info.outputPath('9-passport.png') });
  expect(errors).toEqual([]);
});
