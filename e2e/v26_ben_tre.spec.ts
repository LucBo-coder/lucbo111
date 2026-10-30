import { expect, test, type Page } from '@playwright/test';

// Vietnam Odyssey — Bến Tre, played through the real game loop: Trà Vinh → Cây Dầu badge → cầu Cổ Chiên → trung tâm
// Pokémon → làng kẹo dừa (Ông Sáu Sóc) → vườn dừa Thới Sơn (Hái dừa Tám).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && !(window as Win).__adv.modal && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 30_000 });
const qStatus = (page: Page, id: string) => ev<string>(page, `window.__adv.state.quests.states['${id}']?.status ?? 'none'`);
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
const teleport = (page: Page, x: number, y: number) => ev(page, `window.__adv.world.teleport(${x} * 48 + 24, ${y} * 48 + 24)`);
const area = (page: Page) => ev<string>(page, `window.__adv.areaName`);

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

test('Bến Tre: Cây Dầu badge → cầu Cổ Chiên → trung tâm → làng kẹo dừa → vườn dừa', async ({ page }, info) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  // the first provinces are tested elsewhere: party + their badges, straight to Trà Vinh
  await ev(page, `(() => { const a = window.__adv; ['combusken', 'murkrow', 'marshtomp'].forEach(s => a.state.addPokemon(s, 36, 'gift')); a.applyParty();
    ['badge:ca-mau', 'badge:an-giang', 'badge:can-tho', 'badge:vinh-long'].forEach(f => a.state.setFlag(f)); a.travelTo('tra-vinh', 8, 52); })()`);
  await ready(page, 'tra-vinh');
  await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);

  // the road south is sealed until the Cây Dầu badge (the Trevenant fight is tested in v23 / v26 unit tests)
  await ev(page, `window.__adv.state.setFlag('badge:tra-vinh')`);
  await usePortal(page, 'portal-tv-next', `window.__adv.map.id === 'ben-tre'`);
  await ready(page, 'ben-tre');
  expect(await ev(page, `window.__adv.map.id`)).toBe('ben-tre');
  expect(await qStatus(page, 'vn-bt-1')).toBe('active');
  await page.waitForTimeout(900);
  await page.screenshot({ path: info.outputPath('1-arrival.png') });

  // vn-bt-1: Trung tâm Pokémon, làng kẹo dừa, Ông Sáu Sóc
  await teleport(page, 51, 41); await page.waitForTimeout(400);
  for (let i = 0; i < 10 && !(await ev<boolean>(page, `window.__adv.state.adv.waypoints.includes('wp-ben-tre-center')`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  await closeDialogues(page);
  await teleport(page, 16, 50); await page.waitForTimeout(900);
  expect(await area(page)).toBe('Làng kẹo dừa');
  await talk(page, 'bt-elder', `window.__adv.state.quests.states['vn-bt-1'].status === 'completed'`);
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:keo-dua')`)).toBe(true);
  await page.screenshot({ path: info.outputPath('2-keo-dua.png') });
  await closeDialogues(page);

  // vn-bt-2: vườn dừa Thới Sơn — Hái dừa Tám, then Chú Tư Dừa
  // the next quest is offered by the guide in town: accept it there
  await talk(page, 'bt-guide', "window.__adv.state.quests.states['vn-bt-2'].status === 'active'");
  await closeDialogues(page);
  await teleport(page, 112, 40); await page.waitForTimeout(900);
  expect(await area(page)).toBe('Vườn dừa Thới Sơn');
  await beatTrainer(page, 'bt-coconut-climber');
  await talk(page, 'bt-coco', `window.__adv.state.quests.states['vn-bt-2'].status === 'completed'`);
  expect(await ev(page, `window.__adv.state.hasFlag('landmark:cau-co-chien')`)).toBe(true);
  await page.screenshot({ path: info.outputPath('3-vuon-dua.png') });

  expect(errors, errors.join('\n')).toEqual([]);
});
