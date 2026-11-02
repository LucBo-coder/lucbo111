import { expect, test, type Page } from '@playwright/test';

// Chơi chung (co-op room, up to 4): each tab plays its own save; same map → shared fights, last hit takes the reward.
// E2E_NET=cloud=<ws url> runs it through the Cloudflare PartyDO instead of BroadcastChannel.
type Win = Record<string, any>;
// both tabs keep their game loop running (a hidden tab's requestAnimationFrame is throttled to ~1 fps)
test.use({ launchOptions: { args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] } });
const ev = <T = unknown>(p: Page, fn: string) => p.evaluate(fn) as Promise<T>;
async function start(p: Page, slot: number, campaign = 'classic') {
  await p.goto(`/?debug&${process.env.E2E_NET || 'net=local'}`);
  await p.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(p, `void window.__phaser.scene.getScene('Menu').startAdventure(true, ${slot}, '${campaign}')`);
  await p.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await ev(p, `(() => { const a = window.__adv; a.state.addPokemon('pikachu', 30, 'gift'); a.state.addPokemon('eevee', 12, 'gift'); a.applyParty(); a.world.trainer.hp = a.world.trainer.maxHp = 100000; })()`);
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
  await p.mouse.click(point.x, point.y, { delay: 100 });
  await p.waitForTimeout(250);
}

test('chơi chung: room, same-map play, shared enemy, last-hit reward, chat and trade', async ({ browser }, info) => {
  test.setTimeout(240000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage(), b = await ctx.newPage();
  a.setDefaultTimeout(20000); b.setDefaultTimeout(20000);
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(String(e)));
  await start(a, 1); await start(b, 2);
  await ev(a, `window.__save.profile.name = 'An'`);
  await ev(b, `window.__save.profile.name = 'Bình'`);

  // A opens Chơi chung from the game menu and creates the room; B joins with the code
  await expect(a.locator('[data-pill]')).toBeHidden(); // outside a room the way in is the menu
  await ev(a, `window.__adv.ui.openMenu('settings')`);
  await clickText(a, 'AdvUI', 'Chơi chung (tối đa 4 người)');
  await a.locator('[data-create]').click();
  await a.waitForFunction(() => (window as Win).__party.active);
  const code = await ev<string>(a, 'window.__party.code');
  expect(code).toMatch(/^[A-Z2-9]{6}$/);
  await b.bringToFront();
  await ev(b, `(() => { window.__adv.ui.closeMenu(); window.__adv.partyPanel.show(); })()`);
  await b.locator('[name=code]').fill(code);
  await b.locator('[data-join] button').click();
  await b.waitForFunction(() => (window as Win).__party.active && (window as Win).__party.members.size === 1).catch(async (e) => { throw new Error(`${e}
${await ev(b, 'window.__party.status + " " + window.__party.error')}`); });
  await a.waitForFunction(() => [...(window as Win).__party.members.values()].some((m: any) => m.known && m.name === 'Bình'));
  await a.screenshot({ path: info.outputPath('party-room.png') });

  // same map: each sees the other's trainer + Pokémon (puppets) and the label with their name
  for (const p of [a, b]) {
    await ev(p, `(() => { const t = window.__adv.world.trainer; t.x = 1200; t.y = 1000; window.__adv.ui.closeMenu(); })()`);
    await p.locator('[data-close]').click();
  }
  await a.waitForFunction(() => (window as Win).__adv.world.puppets.some((u: any) => u.kind === 'trainer' && u.name === 'Bình'));
  await b.waitForFunction(() => (window as Win).__adv.world.puppets.some((u: any) => u.kind === 'trainer' && u.name === 'An'));
  // B moves: A sees B's trainer move
  await ev(b, `(() => { const t = window.__adv.world.trainer; t.x += 140; })()`);
  await b.waitForTimeout(300);
  const bx = await ev<number>(b, 'window.__adv.world.trainer.x');
  expect(bx).toBeGreaterThan(1250);
  await a.waitForFunction((x) => Math.abs((window as Win).__adv.world.puppets.find((u: any) => u.kind === 'trainer').x - x) < 20, bx);

  // only the first member spawns wild Pokémon here
  expect(await ev(a, 'window.__adv.shared.spawnsHere()')).toBe(true);
  expect(await ev(b, 'window.__adv.shared.spawnsHere()')).toBe(false);

  // A's enemy shows up on B; B's hits take its HP on A; B lands the last hit → B gets the EXP, A does not
  const id = await ev<number>(a, `(() => { const w = window.__adv.world; for (const e of w.enemies) w.removeEnemy(e); const e = w.spawnWild('rattata', 20, 1320, 1000, { hostile: true }); e.maxHp = e.hp = 400; return e.id; })()`);
  await b.waitForFunction((rid) => (window as Win).__adv.world.enemies.some((e: any) => e.net?.rid === rid), id);
  await b.screenshot({ path: info.outputPath('party-shared-enemy.png') });
  await ev(b, `(() => { const w = window.__adv.world; const e = w.enemies.find(x => x.net?.rid === ${id}); w.applyDamage(e, 150, w.allies[0]); })()`);
  await a.waitForFunction((eid) => { const e = (window as Win).__adv.world.enemies.find((x: any) => x.id === eid); return e && e.hp <= 250 && e.lastHitBy; }, id);
  const expA = await ev<number>(a, `window.__adv.state.party().reduce((s, p) => s + p.exp + p.level * 1e6, 0)`);
  const expB = await ev<number>(b, `window.__adv.state.party().reduce((s, p) => s + p.exp + p.level * 1e6, 0)`);
  await ev(b, `(() => { const w = window.__adv.world; const e = w.enemies.find(x => x.net?.rid === ${id}); w.applyDamage(e, 9999, w.allies[0]); })()`);
  await a.waitForFunction((eid) => !(window as Win).__adv.world.enemies.some((x: any) => x.id === eid), id);
  await b.waitForFunction((before) => (window as Win).__adv.state.party().reduce((s: number, p: any) => s + p.exp + p.level * 1e6, 0) > before, expB);
  expect(await ev<number>(a, `window.__adv.state.party().reduce((s, p) => s + p.exp + p.level * 1e6, 0)`)).toBe(expA);
  await b.waitForFunction((rid) => !(window as Win).__adv.world.enemies.some((e: any) => e.net?.rid === rid), id);

  // A's enemy hits B's trainer: the damage lands in B's game
  const hpB = await ev<number>(b, 'window.__adv.world.trainer.hp');
  await ev(a, `(() => { const w = window.__adv.world; const p = w.puppets.find(u => u.kind === 'trainer'); w.applyDamage(p, 77, null); })()`);
  await b.waitForFunction((hp) => (window as Win).__adv.world.trainer.hp <= hp - 70, hpB);

  // A rides: B draws the mount under A's trainer; A climbs off → gone on B
  expect(await ev(a, `window.__adv.world.startRide('arcanine', { level: 50, shiny: true })`)).toBe(true);
  await b.waitForFunction(() => [...(window as Win).__adv.world.puppetMounts.values()].some((m: any) => m.defId === 'arcanine' && m.shiny));
  await b.screenshot({ path: info.outputPath('party-mount.png') });
  await ev(a, `window.__adv.world.stopRide(true)`);
  await b.waitForFunction(() => (window as Win).__adv.world.puppetMounts.size === 0);

  // world events, time of day and weather come from the map host (A): B shows A's event and A's sky
  await ev(b, `(() => { const s = window.__adv; s.state.adv.clock = 100; s.weather.kind = 'fog'; })()`);
  const evUid = await ev<number>(a, `(() => { const s = window.__adv; s.state.adv.clock = 700; s.weather.kind = 'rain'; const r = s.worldEvents.unlockedRegions()[0].id; return s.worldEvents.force('weather', r).uid; })()`);
  await b.waitForFunction((u) => (window as Win).__adv.worldEvents.views().some((v: any) => v.uid === u && v.type === 'weather'), evUid);
  expect(Math.abs(await ev<number>(b, 'window.__adv.state.adv.clock') - 700)).toBeLessThan(20);
  expect(await ev(b, 'window.__adv.weather.kind')).toBe('rain');
  expect(await ev(b, 'window.__adv.worldEvents.weatherOverride()')).toBe(await ev(a, 'window.__adv.worldEvents.weatherOverride()'));
  expect(await ev(b, 'window.__adv.worldEvents.director.active.length')).toBe(0);
  // it runs out on A → over on B too
  await ev(a, `(() => { const e = window.__adv.worldEvents.director.active.find(x => x.uid === ${evUid}); e.end = 0; })()`);
  await b.waitForFunction((u) => !(window as Win).__adv.worldEvents.views().some((v: any) => v.uid === u), evUid);

  // chat
  await a.bringToFront();
  await a.locator('[data-pill]').click();
  await a.locator('[data-tab=chat]').click();
  await a.locator('[name=body]').fill('Xin chào!');
  await a.locator('[data-chat-form] button').click();
  await b.waitForFunction(() => document.querySelector('[data-log]')?.textContent?.includes('An: Xin chào!') && document.querySelector('[data-tab=chat]')?.textContent?.startsWith('Chat ('));

  // trade: A gives Eevee + 2 Poké Balls, B gives 1 Potion
  await ev(a, `window.__adv.state.save.inventory.pokeball = 5`);
  await ev(b, `window.__adv.state.save.inventory.potion = 3`);
  await a.locator('[data-tab=room]').click();
  await a.locator('[data-trade]').first().click();
  await b.waitForFunction(() => !!document.querySelector('[data-panel=trade] [data-yes]'));
  await b.bringToFront();
  await b.locator('[data-yes]').click();
  await a.bringToFront();
  await a.waitForFunction(() => !!document.querySelector('[data-mon]'));
  const eevee = await ev<string>(a, `window.__adv.state.party().find(p => p.species === 'eevee').uid`);
  await a.locator('[data-mon]').selectOption(eevee);
  await a.locator('[data-item]').selectOption('pokeball');
  await a.locator('[data-qty]').fill('2');
  await a.locator('[data-add]').click();
  await b.bringToFront();
  await b.waitForFunction(() => document.querySelector('[data-panel=trade]')?.textContent?.includes('Eevee'));
  await b.locator('[data-item]').selectOption('potion');
  await b.locator('[data-add]').click();
  await a.bringToFront();
  await a.waitForFunction(() => document.querySelector('[data-panel=trade]')?.textContent?.includes('×1'));


  await a.screenshot({ path: info.outputPath('party-trade.png') });
  await a.locator('[data-confirm]').click();
  await b.bringToFront();
  await b.locator('[data-confirm]').click();
  await b.waitForFunction(() => (window as Win).__adv.state.save.inventory.pokeball === 2 && (window as Win).__adv.state.save.collection.filter((p: any) => p.species === 'eevee').length === 2);
  await a.waitForFunction(() => !(window as Win).__adv.state.save.collection.some((p: any) => p.species === 'eevee'));
  expect(await ev(a, 'window.__adv.state.save.inventory.pokeball')).toBe(3);
  expect(await ev(b, 'window.__adv.state.save.inventory.pokeball')).toBe(2);
  expect(await ev(a, 'window.__adv.state.save.inventory.potion')).toBe(1);
  expect(await ev(b, 'window.__adv.state.save.inventory.potion')).toBe(2);

  // B travels to another map: A no longer draws B; B leaves the room; A's room stays
  // (a dungeon is private: nobody else is drawn there)
  await ev(b, `(() => { window.__adv.scene.restart({ map: 'dungeon', dungeonId: 'ancient-cave', difficulty: 'normal' }); })()`);
  await b.waitForFunction(() => (window as Win).__adv?.mapKind === 'dungeon' && (window as Win).__adv.shared && (window as Win).__party.active);
  await a.waitForFunction(() => [...(window as Win).__party.members.values()].some((m: any) => m.map === 'dungeon:ancient-cave'));
  await a.waitForFunction(() => !(window as Win).__adv.world.puppets.length);
  await a.locator('[data-tab=room]').click();
  await expect(a.locator('[data-panel=room]')).toContainText('trong hầm ngục');
  await ev(b, `window.__party.leave()`);
  await a.waitForFunction(() => (window as Win).__party.members.size === 0 && (window as Win).__party.active);
  expect(errors).toEqual([]);
  await ctx.close();
});

test('chơi chung in Việt Nam Odyssey: same province → see each other; other campaign → never mixed', async ({ browser }) => {
  test.setTimeout(180000);
  const ctx = await browser.newContext();
  const a = await ctx.newPage(), b = await ctx.newPage(), c = await ctx.newPage();
  const errors: string[] = [];
  for (const p of [a, b, c]) { p.setDefaultTimeout(20000); p.on('pageerror', (e) => errors.push(String(e))); }
  await start(a, 1, 'vietnam'); await start(b, 2, 'vietnam'); await start(c, 3, 'classic');
  const code = await ev<string>(a, 'window.__party.create()');
  await ev(b, `window.__party.join('${code}')`);
  await ev(c, `window.__party.join('${code}')`);
  for (const p of [a, b, c]) await p.waitForFunction(() => (window as Win).__party.members.size === 2 && [...(window as Win).__party.members.values()].every((m: any) => m.known));
  // same province of the same campaign: drawn; the classic player is on another campaign's map
  await a.waitForFunction(() => (window as Win).__adv.world.puppets.some((u: any) => u.kind === 'trainer'));
  await b.waitForFunction(() => (window as Win).__adv.world.puppets.some((u: any) => u.kind === 'trainer'));
  expect(await ev(a, `window.__adv.world.puppets.filter(u => u.kind === 'trainer').length`)).toBe(1);
  expect(await ev(c, 'window.__adv.world.puppets.length')).toBe(0);
  expect(await ev(a, `window.__party.sameMap().length`)).toBe(1);
  expect(await ev(b, 'window.__adv.shared.spawnsHere()')).toBe(false);
  if (process.env.E2E_NET) {
    // relay: a dropped socket keeps its place in the room and reconnects; the others see it come back
    await ev(b, 'window.__party.simulateDrop()');
    await b.waitForTimeout(2500);
    expect(await ev(b, 'window.__party.active')).toBe(true);
    expect(await ev(b, 'window.__party.members.size')).toBe(2);
    // and B's moves still reach A
    await ev(b, `(() => { const t = window.__adv.world.trainer; t.x += 60; })()`);
    await b.waitForTimeout(300);
    const bx = await ev<number>(b, 'window.__adv.world.trainer.x');
    await a.waitForFunction((x) => Math.abs((window as Win).__adv.world.puppets.find((u: any) => u.kind === 'trainer')?.x - x) < 20, bx, { timeout: 30000 });
  }
  expect(errors).toEqual([]);
  await ctx.close();
});
