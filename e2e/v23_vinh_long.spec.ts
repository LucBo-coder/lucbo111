import { expect, test, type Page } from '@playwright/test';
import { beatBossTo } from './bossHelpers';

// Vietnam Odyssey — Vĩnh Long, played through the real game loop: Cần Thơ gate (badge) → Bến Vĩnh Long → Văn Thánh
// Miếu → boat to Cù lao An Bình (orchard trainer, Bác Hai) → lò gạch Mang Thít (potter, Torkoal) → badge → passport.

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
/** Challenge a trainer and win the battle at once. */
async function beatTrainer(page: Page, id: string) {
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.trainers.find(x => x.id === '${id}'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 20 && !(await ev<boolean>(page, `!!window.__adv.battle`)); i++) { await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? '1' : 'e'); await page.waitForTimeout(200); }
  expect(await ev(page, `!!window.__adv.battle`), id).toBe(true);
  for (let i = 0; i < 40 && !(await ev<boolean>(page, `window.__adv.state.hasFlag('beat:${id}')`)); i++) {
    await ev(page, `(() => { const w = window.__adv.world; for (const u of (window.__adv.battle?.units ?? [])) if (u.alive) w.applyDamage(u, u.maxHp, w.allies[0]); })()`);
    await page.waitForTimeout(400);
  }
  await closeDialogues(page);
}
const near = (x: number, y: number) => `(() => { const a = window.__adv; return !!a?.world && !a.modal && Math.hypot(a.world.trainer.x / 48 - ${x + 0.5}, a.world.trainer.y / 48 - ${y + 0.5}) < 2.5 && window.__phaser.scene.isActive('AdvUI'); })()`;

test('Vĩnh Long: Cần Thơ gate → Văn Thánh Miếu → Cù lao An Bình → Thần Lò Mang Thít → badge & passport', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  // skip the first three provinces (tested elsewhere): party + their badges, straight to Cần Thơ
  await ev(page, `(() => { const a = window.__adv; ['marshtomp', 'pelipper', 'grovyle'].forEach(s => a.state.addPokemon(s, 30, 'gift')); a.applyParty();
    ['badge:ca-mau', 'badge:an-giang'].forEach(f => a.state.setFlag(f)); a.travelTo('can-tho', 118, 64); })()`);
  await ready(page, 'can-tho');
  expect(await qStatus(page, 'vn-vl-1')).toBe('locked');
  // the road to Vĩnh Long is sealed without the Hậu River badge
  await usePortal(page, 'portal-ct-next', `window.__adv.map.id === 'vinh-long'`);
  expect(await ev(page, `window.__adv.map.id`)).toBe('can-tho');
  await closeDialogues(page);
  await ev(page, `window.__adv.state.setFlag('badge:can-tho')`);
  expect(await qStatus(page, 'vn-vl-1')).toBe('active');
  await usePortal(page, 'portal-ct-next', `window.__adv.map.id === 'vinh-long'`);
  await ready(page, 'vinh-long');
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
  expect(await ev(page, `window.__adv.state.adv.visited['vinh-long'] > 0`)).toBe(true);
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('1-arrival.png') });

  // vn-vl-1: Pokémon Center, Văn Thánh Miếu, the scholar
  await teleport(page, 69, 47); await page.waitForTimeout(400);
  for (let i = 0; i < 10 && !(await ev<boolean>(page, `window.__adv.state.adv.waypoints.includes('wp-vinh-long-center')`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  await closeDialogues(page);
  await teleport(page, 52, 49); await page.waitForTimeout(900);
  expect(await ev(page, `window.__adv.areaName`)).toBe('Văn Thánh Miếu');
  await page.screenshot({ path: info.outputPath('2-van-thanh.png') });
  await talk(page, 'vl-scholar', `window.__adv.state.quests.states['vn-vl-1'].status === 'completed'`);
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:van-thanh')`)).toBe(true);
  await talk(page, 'vl-scholar', `window.__adv.state.quests.states['vn-vl-2'].status === 'active'`);
  await closeDialogues(page);

  // vn-vl-2: the ferryman, boat to Cù lao An Bình, the orchard trainer, Bác Hai
  await talk(page, 'vl-ferryman', `window.__adv.state.quests.states['vn-vl-2'].step >= 1`);
  await closeDialogues(page);
  await usePortal(page, 'vl-boat-out', near(97, 8));
  await page.waitForFunction(near(97, 8), undefined, { timeout: 20_000 });
  await page.waitForTimeout(800);
  expect(await ev(page, `window.__adv.areaName`)).toBe('Cù lao An Bình');
  await page.screenshot({ path: info.outputPath('3-an-binh.png') });
  await beatTrainer(page, 'vl-orchard-girl');
  await talk(page, 'vl-host', `window.__adv.state.quests.states['vn-vl-2'].status === 'completed'`);
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:an-binh')`)).toBe(true);
  // V30: Thần Lò Mang Thít waits for the province's story (Linh and the Bình Minh device, played in v29_story.spec.ts)
  await ev(page, `(() => { const qs = window.__adv.state.quests; qs.states['mn-vl'] = { status: 'completed', step: 9, progress: 0 }; qs.refresh(); })()`);
  await talk(page, 'vl-host', `window.__adv.state.quests.states['vn-vl-3'].status === 'active'`);
  await closeDialogues(page);
  await usePortal(page, 'vl-boat-back', near(82, 25));
  await page.waitForFunction(near(82, 25), undefined, { timeout: 20_000 });

  // vn-vl-3: the brick kilns, the old potter, the kiln keeper, then Torkoal (sealed until the keeper is beaten)
  await teleport(page, 40, 85); await page.waitForTimeout(900);
  expect(await ev(page, `window.__adv.areaName`)).toBe('Lò gạch Mang Thít');
  await talk(page, 'vl-potter-master', `window.__adv.state.quests.states['vn-vl-3'].step >= 2`);
  await closeDialogues(page);
  await teleport(page, 24, 87); await page.waitForTimeout(1500);
  expect(await ev(page, `window.__adv.world.boss?.defId ?? null`)).toBe(null);
  await beatTrainer(page, 'vl-potter');
  await teleport(page, 24, 87);
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.defId === 'torkoal', undefined, { timeout: 30_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('4-torkoal.png') });
  expect(await ev(page, `window.__adv.world.boss.boss.pm.count`)).toBe(3);
  // world-level ups recompute the trainer's HP: keep the test trainer unbeatable for the boss fight
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
  await beatBossTo(page, 0);
  await page.waitForFunction(() => (window as Win).__adv.state.hasFlag('badge:vinh-long'), undefined, { timeout: 15_000 });
  expect(await ev(page, `window.__adv.state.save.collection.some(p => p.species === 'torkoal')`)).toBe(false);
  await page.waitForTimeout(1200);
  await closeDialogues(page);
  await talk(page, 'vl-potter-master', `window.__adv.state.quests.states['vn-vl-3'].status === 'completed'`);
  await closeDialogues(page);
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:mang-thit')`)).toBe(true);
  expect(await qStatus(page, 'vn-vl-eco')).not.toBe('locked');

  // passport: Vĩnh Long stamped with its badge and its three landmarks
  const pages = await ev<{ id: string; visited: boolean; badge: boolean; landmarks: { got: boolean }[] }[]>(page,
    `window.__passport(window.__adv.state.adv, window.__adv.state.quests.defs.map(d => d.id)).map(p => ({ id: p.def.id, visited: p.visited, badge: p.badge, landmarks: p.landmarks }))`);
  expect(pages.find((p) => p.id === 'vinh-long')).toMatchObject({ visited: true, badge: true });
  expect(pages.find((p) => p.id === 'vinh-long')!.landmarks.every((l) => l.got)).toBe(true);
  await page.keyboard.press('p');
  await page.waitForTimeout(700);
  expect(await ev(page, `window.__phaser.scene.getScene('AdvUI').menuTab`)).toBe('passport');
  await page.screenshot({ path: info.outputPath('5-passport.png') });
  expect(errors).toEqual([]);
});
