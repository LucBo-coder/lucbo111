import { expect, test, type Page } from '@playwright/test';
import { beatBossTo } from './bossHelpers';

// Vietnam Odyssey — Cần Thơ, played through the real game loop: An Giang gate (badge) → Ninh Kiều →
// Cô Út chèo đò → floating market (trainer) → boat to Cồn Sơn → Whiscash, Chúa Sông Hậu → badge → passport.

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
/** Use a portal / ferry (E, then accept) until `done`. */
async function usePortal(page: Page, id: string, done: string) {
  await ev(page, `(() => { const a = window.__adv; const p = a.regionDef.portals.find(x => x.id === '${id}'); a.world.teleport((p.x + 0.5) * 48, (p.y + 1.5) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 14 && !(await ev<boolean>(page, done)); i++) { await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? '1' : 'e'); await page.waitForTimeout(300); }
}
const near = (x: number, y: number) => `(() => { const a = window.__adv; return !!a?.world && !a.modal && Math.hypot(a.world.trainer.x / 48 - ${x + 0.5}, a.world.trainer.y / 48 - ${y + 0.5}) < 2.5 && window.__phaser.scene.isActive('AdvUI'); })()`;

test('Cần Thơ: An Giang gate → Ninh Kiều → floating market → Chúa Sông Hậu → badge & passport', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  // skip Cà Mau & An Giang (tested in v8_vietnam): party + both badges, go to An Giang
  await ev(page, `(() => { const a = window.__adv; ['grovyle', 'marshtomp', 'combusken'].forEach(s => a.state.addPokemon(s, 24, 'gift')); a.applyParty();
    a.state.setFlag('badge:ca-mau'); const p = a.regionDef.portals.find(x => x.to === 'an-giang'); a.travelTo(p.to, p.toX, p.toY); })()`);
  await ready(page, 'an-giang');
  expect(await qStatus(page, 'vn-ct-1')).toBe('locked');
  // the gate to Cần Thơ is sealed without the Bảy Núi badge
  await usePortal(page, 'portal-ag-ct', `window.__adv.map.id === 'can-tho'`);
  expect(await ev(page, `window.__adv.map.id`)).toBe('an-giang');
  await closeDialogues(page);
  await ev(page, `window.__adv.state.setFlag('badge:an-giang')`);
  expect(await qStatus(page, 'vn-ct-1')).toBe('active');
  await usePortal(page, 'portal-ag-ct', `window.__adv.map.id === 'can-tho'`);
  await ready(page, 'can-tho');
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e6; })()`);
  expect(await ev(page, `window.__adv.state.adv.visited['can-tho'] > 0`)).toBe(true);
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('1-arrival.png') });

  // vn-ct-1: Pokémon Center Ninh Kiều, Cô Út chèo đò
  await teleport(page, 81, 66); await page.waitForTimeout(400);
  for (let i = 0; i < 10 && !(await ev<boolean>(page, `window.__adv.state.adv.waypoints.includes('wp-can-tho-center')`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  await closeDialogues(page);
  await page.screenshot({ path: info.outputPath('2-ninh-kieu.png') });
  await talk(page, 'ct-boatwoman', `window.__adv.state.quests.states['vn-ct-1'].status === 'completed'`);
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:ninh-kieu')`)).toBe(true);
  await talk(page, 'ct-boatwoman', `window.__adv.state.quests.states['vn-ct-2'].status === 'active'`);
  await closeDialogues(page);

  // vn-ct-2: across the bridge to the floating market, the merchant, then the vendor's challenge
  await teleport(page, 112, 90); await page.waitForTimeout(900);
  expect(await ev(page, `window.__adv.areaName`)).toBe('Chợ nổi Cái Răng');
  await page.screenshot({ path: info.outputPath('3-cai-rang.png') });
  await talk(page, 'ct-merchant', `window.__adv.state.quests.states['vn-ct-2'].step >= 2`);
  await closeDialogues(page);
  // the boss is sealed until the vendor is beaten
  await teleport(page, 104, 12); await page.waitForTimeout(1500);
  expect(await ev(page, `window.__adv.world.boss?.defId ?? null`)).toBe(null);
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.trainers.find(x => x.id === 'ct-vendor'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 20 && !(await ev<boolean>(page, `!!window.__adv.battle`)); i++) { await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? '1' : 'e'); await page.waitForTimeout(200); }
  expect(await ev(page, `!!window.__adv.battle`)).toBe(true);
  for (let i = 0; i < 40 && !(await ev<boolean>(page, `window.__adv.state.hasFlag('beat:ct-vendor')`)); i++) {
    await ev(page, `(() => { const w = window.__adv.world; for (const u of (window.__adv.battle?.units ?? [])) if (u.alive) w.applyDamage(u, u.maxHp, w.allies[0]); })()`);
    await page.waitForTimeout(400);
  }
  await closeDialogues(page);
  await page.waitForFunction(() => (window as Win).__adv.state.quests.states['vn-ct-2'].status === 'completed', undefined, { timeout: 10_000 });
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:cai-rang')`)).toBe(true);
  // V30: Chúa Sông Hậu waits for Cần Thơ's story (the Cồn Sơn pump, played in v29_story.spec.ts)
  await ev(page, `(() => { const qs = window.__adv.state.quests; for (const id of ['mn-ct']) qs.states[id] = { status: 'completed', step: 9, progress: 0 }; qs.refresh(); })()`);
  await talk(page, 'ct-merchant', `window.__adv.state.quests.states['vn-ct-3'].status === 'active'`);
  await closeDialogues(page);

  // vn-ct-3: boat to Cồn Sơn, Whiscash — Chúa Sông Hậu (3 phases, no capture), boat back
  await usePortal(page, 'ct-boat-out', near(104, 13));
  await page.waitForFunction(near(104, 13), undefined, { timeout: 20_000 });
  await page.waitForTimeout(800);
  expect(await ev(page, `window.__adv.areaName`)).toBe('Cồn Sơn');
  // sturdy trainer: with a single active partner the boss focuses the trainer, and a KO would send them back to Ninh Kiều
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
  await teleport(page, 104, 12);
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.defId === 'whiscash', undefined, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('4-whiscash.png') });
  expect(await ev(page, `window.__adv.world.boss.boss.pm.count`)).toBe(3);
  await beatBossTo(page, 0);
  await page.waitForFunction(() => (window as Win).__adv.state.hasFlag('badge:can-tho'), undefined, { timeout: 15_000 });
  expect(await ev(page, `window.__adv.state.save.collection.some(p => p.species === 'whiscash')`)).toBe(false);
  await page.waitForTimeout(1200);
  await closeDialogues(page);
  await usePortal(page, 'ct-boat-back', near(96, 43));
  await page.waitForFunction(near(96, 43), undefined, { timeout: 20_000 });
  await talk(page, 'ct-boatwoman', `window.__adv.state.quests.states['vn-ct-3'].status === 'completed'`);
  await closeDialogues(page);

  // passport: three provinces, Cần Thơ stamped with its badge and both landmarks
  const pages = await ev<{ id: string; visited: boolean; badge: boolean; landmarks: { got: boolean }[] }[]>(page,
    `window.__passport(window.__adv.state.adv, window.__adv.state.quests.defs.map(d => d.id)).map(p => ({ id: p.def.id, visited: p.visited, badge: p.badge, landmarks: p.landmarks }))`);
  expect(pages.find((p) => p.id === 'can-tho')).toMatchObject({ visited: true, badge: true });
  expect(pages.find((p) => p.id === 'can-tho')!.landmarks.every((l) => l.got)).toBe(true);
  await page.keyboard.press('p');
  await page.waitForTimeout(700);
  expect(await ev(page, `window.__phaser.scene.getScene('AdvUI').menuTab`)).toBe('passport');
  await page.screenshot({ path: info.outputPath('5-passport.png') });
  expect(errors).toEqual([]);
});
