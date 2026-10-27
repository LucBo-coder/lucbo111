import { expect, test, type Page } from '@playwright/test';
import { beatBossTo } from './bossHelpers';

// Vietnam Odyssey — Trà Vinh, played through the real game loop: Vĩnh Long gate (badge) → thành phố → Ao Bà Om (Ông Ba)
// → Chùa Hang (cò, múa Apsara, Ông Achar) → rừng dầu cổ thụ (người giữ rừng, Trevenant) → badge → biển Ba Động → passport.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && !(window as Win).__adv.modal && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const qStatus = (page: Page, id: string) => ev<string>(page, `window.__adv.state.quests.states['${id}']?.status ?? 'none'`);
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
const teleport = (page: Page, x: number, y: number) => ev(page, `window.__adv.world.teleport(${x} * 48 + 24, ${y} * 48 + 24)`);

async function closeDialogues(page: Page) {
  for (let i = 0; i < 12 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}
/** Stand next to an NPC / trainer and keep pressing E (or the choice key) until `done`. */
async function talk(page: Page, npc: string, done: string, choice = '1', tries = 60) {
  await ev(page, `(() => { const a = window.__adv; const n = [...a.regionDef.npcs, ...a.regionDef.trainers].find(x => x.id === '${npc}'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(350);
  for (let i = 0; i < tries; i++) {
    if (await ev<boolean>(page, done)) return;
    await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? choice : 'e');
    await page.waitForTimeout(180);
  }
  throw new Error(`talk ${npc}: condition never met: ${done}`);
}
async function usePortal(page: Page, id: string, done: string) {
  await ev(page, `(() => { const a = window.__adv; const p = a.regionDef.portals.find(x => x.id === '${id}'); a.world.teleport((p.x + 0.5) * 48, (p.y + 1.5) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 14 && !(await ev<boolean>(page, done)); i++) { await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? '1' : 'e'); await page.waitForTimeout(300); }
}
async function beatTrainer(page: Page, id: string) {
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.trainers.find(x => x.id === '${id}'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 20 && !(await ev<boolean>(page, `!!window.__adv.battle`)); i++) { await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? '1' : 'e'); await page.waitForTimeout(200); }
  expect(await ev(page, `!!window.__adv.battle`), id).toBe(true);
  for (let i = 0; i < 40 && !(await ev<boolean>(page, `window.__adv.state.hasFlag('beat:${id}')`)); i++) {
    await ev(page, `(() => { const w = window.__adv.world; for (const u of (window.__adv.battle?.units ?? [])) if (u.alive) w.applyDamage(u, u.maxHp, w.allies[0]); })()`);
    await page.waitForTimeout(400);
  }
  expect(await ev(page, `window.__adv.state.hasFlag('beat:${id}')`), id).toBe(true);
  await closeDialogues(page);
}
const area = (page: Page) => ev<string>(page, `window.__adv.areaName`);

test('Trà Vinh: Vĩnh Long gate → Ao Bà Om → Chùa Hang → Thần Cây Dầu → badge → Ba Động → passport', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  // skip the first four provinces (tested elsewhere): party + their badges, straight to Vĩnh Long's south-east road
  await ev(page, `(() => { const a = window.__adv; ['combusken', 'murkrow', 'marshtomp'].forEach(s => a.state.addPokemon(s, 32, 'gift')); a.applyParty();
    ['badge:ca-mau', 'badge:an-giang', 'badge:can-tho'].forEach(f => a.state.setFlag(f)); a.travelTo('vinh-long', 110, 104); })()`);
  await ready(page, 'vinh-long');
  expect(await qStatus(page, 'vn-tv-1')).toBe('locked');
  await usePortal(page, 'portal-vl-next', `window.__adv.map.id === 'tra-vinh'`);
  expect(await ev(page, `window.__adv.map.id`)).toBe('vinh-long');
  await closeDialogues(page);
  await ev(page, `window.__adv.state.setFlag('badge:vinh-long')`);
  expect(await qStatus(page, 'vn-tv-1')).toBe('active');
  await usePortal(page, 'portal-vl-next', `window.__adv.map.id === 'tra-vinh'`);
  await ready(page, 'tra-vinh');
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
  expect(await ev(page, `window.__adv.state.adv.visited['tra-vinh'] > 0`)).toBe(true);
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('1-arrival.png') });

  // vn-tv-1: Pokémon Center, Ao Bà Om, Ông Ba Thạch
  await teleport(page, 51, 45); await page.waitForTimeout(400);
  for (let i = 0; i < 10 && !(await ev<boolean>(page, `window.__adv.state.adv.waypoints.includes('wp-tra-vinh-center')`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  await closeDialogues(page);
  await page.screenshot({ path: info.outputPath('2-town.png') });
  await teleport(page, 38, 72); await page.waitForTimeout(900);
  expect(await area(page)).toBe('Ao Bà Om');
  await talk(page, 'tv-elder', `window.__adv.state.quests.states['vn-tv-1'].status === 'completed'`);
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:ao-ba-om')`)).toBe(true);
  await page.screenshot({ path: info.outputPath('3-ao-ba-om.png') });
  await talk(page, 'tv-elder', `window.__adv.state.quests.states['vn-tv-2'].status === 'active'`);
  await closeDialogues(page);

  // vn-tv-2: Chùa Hang — the stork watcher, the Apsara dancer, Ông Achar
  await teleport(page, 70, 62); await page.waitForTimeout(900);
  expect(await area(page)).toBe('Chùa Hang');
  await page.screenshot({ path: info.outputPath('4-chua-hang.png') });
  await talk(page, 'tv-stork', `window.__adv.state.quests.states['vn-tv-2'].step >= 2`);
  await closeDialogues(page);
  await beatTrainer(page, 'tv-dancer');
  await talk(page, 'tv-achar', `window.__adv.state.quests.states['vn-tv-2'].status === 'completed'`);
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:chua-hang')`)).toBe(true);
  await talk(page, 'tv-achar', `window.__adv.state.quests.states['vn-tv-3'].status === 'active'`);
  await closeDialogues(page);

  // vn-tv-3: the old dầu grove — Trevenant sleeps until the grove keeper is beaten
  await teleport(page, 20, 76); await page.waitForTimeout(1500);
  expect(await area(page)).toBe('Rừng dầu cổ thụ');
  expect(await ev(page, `window.__adv.world.boss?.defId ?? null`)).toBe(null);
  await beatTrainer(page, 'tv-keeper');
  await teleport(page, 14, 71);
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.defId === 'trevenant', undefined, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('5-trevenant.png') });
  expect(await ev(page, `window.__adv.world.boss.boss.pm.count`)).toBe(3);
  // world-level ups recompute the trainer's HP: keep the test trainer unbeatable for the boss fight
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
  await beatBossTo(page, 0);
  await page.waitForFunction(() => (window as Win).__adv.state.hasFlag('badge:tra-vinh'), undefined, { timeout: 15_000 });
  expect(await ev(page, `window.__adv.state.save.collection.some(p => p.species === 'trevenant')`)).toBe(false);
  await page.waitForTimeout(1200);
  await closeDialogues(page);
  await talk(page, 'tv-achar', `window.__adv.state.quests.states['vn-tv-3'].status === 'completed'`);
  await closeDialogues(page);
  expect(await qStatus(page, 'vn-tv-eco')).not.toBe('locked');

  // vn-tv-sea: biển Ba Động — the guide sends you, Cô Út's clam stall, chase 4 Pokémon off the nets
  await talk(page, 'tv-guide', `window.__adv.state.quests.states['vn-tv-sea'].status === 'active'`);
  await closeDialogues(page);
  await teleport(page, 102, 48); await page.waitForTimeout(900);
  expect(await area(page)).toBe('Biển Ba Động');
  await page.screenshot({ path: info.outputPath('6-ba-dong.png') });
  await talk(page, 'tv-seller', `window.__adv.state.quests.states['vn-tv-sea'].step >= 2`);
  await closeDialogues(page);
  // the same event the scene raises when a wild Pokémon is beaten
  for (let i = 0; i < 4; i++) await ev(page, `window.__adv.questEvent({ type: 'defeat', target: 'krabby' })`);
  await talk(page, 'tv-seller', `window.__adv.state.quests.states['vn-tv-sea'].status === 'completed'`);
  await closeDialogues(page);

  // passport: Trà Vinh stamped with its badge and its three landmarks
  const pages = await ev<{ id: string; visited: boolean; badge: boolean; landmarks: { got: boolean }[] }[]>(page,
    `window.__passport(window.__adv.state.adv, window.__adv.state.quests.defs.map(d => d.id)).map(p => ({ id: p.def.id, visited: p.visited, badge: p.badge, landmarks: p.landmarks }))`);
  expect(pages.find((p) => p.id === 'tra-vinh')).toMatchObject({ visited: true, badge: true });
  expect(pages.find((p) => p.id === 'tra-vinh')!.landmarks.every((l) => l.got)).toBe(true);
  await page.keyboard.press('p');
  await page.waitForTimeout(700);
  expect(await ev(page, `window.__phaser.scene.getScene('AdvUI').menuTab`)).toBe('passport');
  await page.screenshot({ path: info.outputPath('7-passport.png') });
  expect(errors).toEqual([]);
});
