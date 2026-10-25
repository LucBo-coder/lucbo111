import { expect, test, type Page } from '@playwright/test';

/** E2E_NET=cloud=<ws url> runs this spec through the Cloudflare room relay instead of BroadcastChannel */
const NET_KIND = process.env.E2E_NET ? 'relay' : 'local';
type Win = Record<string, any>;
const ev = <T = unknown>(p: Page, fn: string) => p.evaluate(fn) as Promise<T>;
async function start(p: Page, slot: number, campaign = 'classic') {
  await p.goto(`/?debug&${process.env.E2E_NET || 'net=local'}`);
  await p.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(p, `void window.__phaser.scene.getScene('Menu').startAdventure(true, ${slot}, '${campaign}')`);
  await p.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await ev(p, `(() => { const a = window.__adv; a.state.addPokemon('pikachu', 30, 'gift'); a.applyParty(); a.world.trainer.hp = a.world.trainer.maxHp = 100000; })()`);
}
async function clickText(p: Page, scene: string, label: string) {
  const point = await p.evaluate(({ scene, label }) => {
    const find = (items: any[]): any => {
      for (const o of items) { if (o.text === label && o.visible) return o; if (o.list) { const f = find(o.list); if (f) return f; } }
    };
    const t = find((window as Win).__phaser.scene.getScene(scene).children.list);
    if (!t) throw new Error('Missing button: ' + label);
    const r = t.getBounds(); return { x: r.centerX, y: r.centerY };
  }, { scene, label });
  await p.bringToFront();
  await p.mouse.move(point.x, point.y);
  await p.waitForTimeout(200);
  await p.mouse.click(point.x, point.y, { delay: 100 });
  await p.waitForTimeout(250);
}

test('co-op menus, shared combat, revival, map travel and safe guest exit', async ({ browser }, info) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage(), b = await ctx.newPage();
  a.setDefaultTimeout(15000); b.setDefaultTimeout(15000);
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', e => errors.push(String(e)));
  await start(a, 1); await start(b, 2);
  // two devices would have their own profile: override before the room is created
  await ev(a, `(() => { window.__save.profile.avatar = 'ninja'; window.__net.myAvatar = 'ninja'; window.__adv.world.trainer.avatar = 'ninja'; })()`);
  await ev(b, `(() => { window.__save.profile.avatar = 'lass'; window.__net.myAvatar = 'lass'; window.__adv.world.trainer.avatar = 'lass'; })()`);
  const before = await ev(b, 'JSON.stringify(window.__adv.state.save.collection)');
  for (const p of [a, b]) {
    await ev(p, `window.__adv.ui.openMenu('settings')`);
    await clickText(p, 'AdvUI', 'Co-op: cùng đánh quái');
  }
  await clickText(a, 'AdvUI', 'Tạo phòng co-op trên bản đồ này');
  await a.screenshot({ path: info.outputPath('coop-room-menu.png') });
  await a.waitForFunction(() => (window as Win).__net.status === 'hosting');
  const code = await ev<string>(a, 'window.__net.code');
  await clickText(b, 'AdvUI', 'Tham gia co-op bằng mã');
  await b.locator('input').fill(code); await b.locator('input').press('Enter');
  await b.waitForFunction(() => !!(window as Win).__coopGuest?.snapshot, undefined, { timeout: 15000 });
  await clickText(a, 'AdvUI', 'Đóng');
  await ev(a, 'window.__adv.ui.closeMenu()');
  await a.waitForFunction(() => !!(window as Win).__adv.world.companion);
  expect(await ev(a, 'window.__adv.world.companion.allies[0].defId')).toBe('pikachu');
  // Both sides see the other player's chosen avatar (and their own) on the animated sheets.
  await a.waitForFunction(() => {
    const w = (window as Win).__adv.world, v = (window as Win).__adv.renderer_.views;
    return w.companion && v.get(w.trainer.id)?.body.texture.key === 'avt-ninja_sheet' && v.get(w.companion.trainer.id)?.body.texture.key === 'avt-lass_sheet';
  }, undefined, { timeout: 8000 });
  expect(await ev(a, `window.__adv.world.companion.trainer.avatar`)).toBe('lass');
  expect(await ev(b, `(() => { const g = window.__coopGuest, m = g.mirror?.world, v = g.renderer_.views;
    return { own: v.get(m.trainer.id)?.body.texture.key, peer: v.get(m.companion.trainer.id)?.body.texture.key, peerAvatar: m.companion.trainer.avatar }; })()`))
    .toEqual({ own: 'avt-lass_sheet', peer: 'avt-ninja_sheet', peerAvatar: 'ninja' });
  // Remote movement is simulated by host and comes back in snapshots.
  const x = await ev<number>(a, 'window.__adv.world.companion.trainer.x');
  await b.keyboard.down('d'); await b.waitForTimeout(600); await b.keyboard.up('d');
  expect(await ev<number>(a, 'window.__adv.world.companion.trainer.x')).toBeGreaterThan(x + 10);
  // Loot sharing: drops accepted by the host land in the guest's own save.
  const beforeCur = await ev<number>(b, 'window.__save.data.currency');
  const beforePotion = await ev<number>(b, 'window.__save.data.inventory.potion ?? 0');
  await ev(a, `window.__adv.coopHost.grant({ currency: 125, items: { potion: 2 }, pokemon: { species: 'eevee', level: 12 }, note: 'Rương báu' })`);
  await b.waitForFunction((cur: number) => (window as Win).__save.data.currency === cur + 125, beforeCur, { timeout: 10000 });
  expect(await ev<number>(b, 'window.__save.data.inventory.potion ?? 0')).toBe(beforePotion + 2);
  expect(await ev<boolean>(b, `window.__save.data.collection.some(c => c.species === 'eevee')`)).toBe(true);
  expect(await ev<boolean>(b, `window.__save.data.pokedex.caught.includes('eevee')`)).toBe(true);
  // Both parties fight a single enemy with one HP value and one death.
  const id = await ev<number>(a, `(() => { const w = window.__adv.world; const e = w.spawnWild('snorlax', 30, w.trainer.x + 100, w.trainer.y, {hostile: true, hpMult: 10}); w.setCommand('attack', e); w.setCommand('attack', e, w.companion); return e.id; })()`);
  await b.waitForFunction(id => (window as Win).__coopGuest.snapshot.enemies.some((e: any) => e.id === id), id);
  await a.waitForFunction(() => (window as Win).__adv.world.allies[0].damageDealt > 0 && (window as Win).__adv.world.companion.allies[0].damageDealt > 0, undefined, { timeout: 15000 });
  // Cast/attack pose travels both ways: each client animates the other side's units, not just its own.
  const castIds = await ev<number[]>(a, `(() => { const w = window.__adv.world; const ids = [];
    window.__castTimer = setInterval(() => { for (const u of [w.allies[0], w.companion?.allies[0]]) if (u) { u.animCast = 5; u.lastSkill = 'water_gun'; u.castSlot = -1; u.hitFlash = 0; u.iframes = 10; } }, 50);
    for (const u of [w.allies[0], w.companion?.allies[0]]) if (u) ids.push(u.id);
    return ids; })()`);
  // derived sheets use ':cast', the optional PMD pack uses ':Shoot:' — either proves the shared cast state is drawn
  await a.waitForFunction(`(ids) => ids.every(id => { const v = window.__adv.renderer_.views.get(id); const a = v && v.anim;
    return !!a && (/:(cast|attack)$/.test(a) || /:(Shoot|Attack):/.test(a)); })`, castIds, { timeout: 8000 });
  await b.waitForFunction(`(ids) => ids.every(id => { const v = window.__coopGuest.renderer_.views.get(id); const a = v && v.anim;
    return !!a && (/:(cast|attack)$/.test(a) || /:(Shoot|Attack):/.test(a)); })`, castIds, { timeout: 8000 });
  await ev(a, `clearInterval(window.__castTimer)`);
  await ev(a, `(() => { const w = window.__adv.world; w.applyDamage(w.enemies.find(e => e.id === ${id}), 1e9, w.companion.allies[0]); })()`);
  await b.waitForFunction(id => !(window as Win).__coopGuest.snapshot.enemies.some((e: any) => e.id === id), id);
  // Downed trainer is revived while the host stands nearby.
  await ev(a, `(() => { const w = window.__adv.world; const t = w.companion.trainer; t.x = w.trainer.x; t.y = w.trainer.y; t.hp = 0; t.reviveT = 3; })()`);
  await a.waitForFunction(() => (window as Win).__adv.world.companion.trainer.hp > 0, undefined, { timeout: 8000 });
  await b.screenshot({ path: info.outputPath('coop-guest.png') });
  // Host travels; guest automatically receives a fresh map and party.
  await ev(a, `(() => { window.__adv.scene.restart({map: 'dungeon', dungeonId: 'ancient-cave', difficulty: 'normal'}); return 'restarting'; })()`);
  await b.waitForFunction(() => (window as Win).__coopGuest.snapshot?.map.kind === 'dungeon', undefined, { timeout: 15000 });
  expect(await ev(b, 'window.__coopGuest.snapshot.map.id')).toBe('ancient-cave');
  await ev(b, 'window.__coopGuest.exit()');
  await b.waitForFunction(() => (window as Win).__phaser.scene.isActive('Adventure'));
  // The guest keeps the shared loot (Eevee) but nothing else changed on its own save.
  const after = JSON.parse(await ev<string>(b, 'JSON.stringify(window.__adv.state.save.collection)')) as { species: string }[];
  const beforeList = JSON.parse(before) as { species: string }[];
  expect(after.length).toBe(beforeList.length + 1);
  expect(after.some(c => c.species === 'eevee')).toBe(true);
  await a.waitForFunction(() => !(window as Win).__adv.world.companion);
  expect(errors).toEqual([]);
  await ctx.close();
});

for (const mode of ['survivor', 'vietnam']) test(`co-op supports ${mode} and disconnect`, async ({ browser }) => {
  test.setTimeout(90000);
  const ctx = await browser.newContext(), a = await ctx.newPage(), b = await ctx.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', e => errors.push(String(e)));
  await start(a, 1, mode === 'vietnam' ? 'vietnam' : 'classic'); await start(b, 2);
  if (mode === 'survivor') {
    await ev(a, `window.__modes.start(window.__adv, 'survivor', {starter: 'pikachu'})`);
    await a.waitForFunction(() => (window as Win).__phaser.scene.isActive('UI'));
  }
  const host = mode === 'survivor' ? 'window.__game' : 'window.__adv';
  const code = await ev<string>(a, `window.__net.host('${NET_KIND}')`);
  await ev(a, `${host}.startCoopHost()`);
  await ev(b, `window.__net.join('${code}', '${NET_KIND}')`);
  await ev(b, `window.__modes.start(window.__adv, 'online', {entry: 'CoopGuest', party: [{species:'squirtle', level:30}], returnTo:'adventure'})`);
  await b.waitForFunction(() => !!(window as Win).__coopGuest?.snapshot, undefined, { timeout: 15000 });
  expect(await ev(b, 'window.__coopGuest.snapshot.map.id')).toBe(mode === 'survivor' ? 'survivor' : 'ca-mau');
  await ev(a, 'window.__net.leave()');
  await b.waitForFunction(() => (window as Win).__coopGuest.ended);
  expect(errors).toEqual([]);
  await ctx.close();
});
