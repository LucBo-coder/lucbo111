import { expect, test, type Page } from '@playwright/test';

/** E2E_NET=cloud=<ws url> runs this spec through the Cloudflare room relay instead of BroadcastChannel */
const NET_KIND = process.env.E2E_NET ? 'relay' : 'local';

// Shared open world: two players (two pages, two save slots) in the same online session see each other
// walking on the same map, one walks up and challenges with E, the other accepts, both duel, both return.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const inAdventure = (page: Page) => page.waitForFunction(() => (window as Win).__adv?.world && !(window as Win).__adv.modal && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);

async function start(page: Page, slot: number, name: string, avatar: string, team: string[]) {
  await page.goto(`/?debug&${process.env.E2E_NET || 'net=local'}`);
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, ${slot})`);
  await inAdventure(page);
  await ev(page, `(() => { const a = window.__adv; ${JSON.stringify(team)}.forEach(s => a.state.addPokemon(s, 30, 'gift')); a.applyParty(); a.world.trainer.maxHp = a.world.trainer.hp = 1e6;
    window.__save.profile.avatar = '${avatar}'; window.__net.myAvatar = '${avatar}'; window.__adv.world.trainer.avatar = '${avatar}'; window.__net.myName = '${name}'; })()`);
}

test('shared open world: see each other, challenge with E, duel, back to the world', async ({ browser }, info) => {
  test.setTimeout(180_000);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const a = await ctx.newPage(), b = await ctx.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', (e) => errors.push(String(e)));
  await start(a, 1, 'An', 'ninja', ['charmander', 'pidgey']);
  await start(b, 2, 'Bình', 'lass', ['squirtle', 'rattata']);

  const code = await ev<string>(a, `window.__net.host('${NET_KIND}')`);
  await ev(b, `window.__net.join('${code}', '${NET_KIND}')`);
  await a.waitForFunction(() => (window as Win).__net.connected);
  await ev(a, `window.__adv.startPresence()`);
  await ev(b, `window.__adv.startPresence()`);

  // B walks next to A: each sees the other on the same map
  const pa = await ev<{ x: number; y: number }>(a, `({ x: window.__adv.world.trainer.x, y: window.__adv.world.trainer.y })`);
  await ev(b, `window.__adv.world.teleport(${pa.x + 60}, ${pa.y})`);
  await a.waitForFunction(() => (window as Win).__adv.presence?.visible() && (window as Win).__adv.interactables.has('remote-player'), undefined, { timeout: 10_000 });
  await b.waitForFunction(() => (window as Win).__adv.presence?.visible(), undefined, { timeout: 10_000 });
  // (over a real network the position arrives after the round trip: poll instead of a fixed wait)
  await expect.poll(async () => {
    const seen = await ev<{ x: number; y: number }>(a, `({ x: window.__adv.presence.x, y: window.__adv.presence.y })`);
    return Math.hypot(seen.x - (pa.x + 60), seen.y - pa.y);
  }, { timeout: 8000 }).toBeLessThan(30);
  expect(await ev(a, `window.__adv.nearest?.kind`)).toBe('remote');
  // each side draws the other player with the avatar they picked (not the generic trainer sprite)
  await a.waitForFunction(() => (window as Win).__adv.presence.body?.texture.key === 'avt-lass_sheet', undefined, { timeout: 8000 });
  await b.waitForFunction(() => (window as Win).__adv.presence.body?.texture.key === 'avt-ninja_sheet', undefined, { timeout: 8000 });
  // B's lead casting is animated on A's screen in the shared world
  expect(await ev<string>(a, `window.__adv.presence.pet?.texture.key`)).toContain('squirtle');
  await ev(b, `(() => { const u = window.__adv.world.allies[0]; u.animCast = 5; u.lastSkill = 'water_gun'; })()`);
  await a.waitForFunction(() => {
    const p = (window as Win).__adv.presence;
    return p.remote?.leadAnim === 'cast' && p.pet?.anims?.currentAnim?.key?.endsWith(':cast');
  }, undefined, { timeout: 8000 });
  await ev(b, `(() => { const u = window.__adv.world.allies[0]; u.animCast = 0; })()`);
  await a.screenshot({ path: info.outputPath('1-shared-world.png') });

  // A presses E → confirm → B is asked → accepts
  for (let i = 0; i < 40 && !(await ev<boolean>(b, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) {
    await a.keyboard.press((await dialogueOpen(a)) && i % 2 ? '1' : 'e');
    await a.waitForTimeout(250);
  }
  await b.screenshot({ path: info.outputPath('2-challenged.png') });
  for (let i = 0; i < 40 && !(await ev<boolean>(b, `window.__phaser.scene.isActive('Duel')`)); i++) {
    await b.keyboard.press(i % 2 ? '1' : 'e');
    await b.waitForTimeout(250);
  }
  await a.waitForFunction(() => (window as Win).__phaser.scene.isActive('Duel'), undefined, { timeout: 15_000 });
  await b.waitForFunction(() => (window as Win).__phaser.scene.isActive('Duel'), undefined, { timeout: 15_000 });
  expect(await ev(a, `window.__duel.role`)).toBe('host');
  expect(await ev(a, `window.__duel.start.rules.id`)).toBe('open');
  // real levels from the adventure party
  expect(await ev(a, `window.__duel.world.allies.map(u => u.defId + u.level)`)).toEqual(['charmander30', 'pidgey30']);
  expect(await ev(b, `window.__duel.world.allies.map(u => u.defId + u.level)`)).toEqual(['squirtle30', 'rattata30']);
  // in the arena both trainers keep the avatar the other player saw in the open world
  await a.waitForFunction(() => {
    const d = (window as Win).__duel, v = d.renderer_.views;
    return v.get(d.world.trainer.id)?.body.texture.key === 'avt-ninja_sheet' && v.get(d.world.rival.trainer.id)?.body.texture.key === 'avt-lass_sheet';
  }, undefined, { timeout: 8000 });
  await b.waitForFunction(() => {
    const d = (window as Win).__duel, v = d.renderer_.views;
    return v.get(d.world.trainer.id)?.body.texture.key === 'avt-lass_sheet' && v.get(d.world.rival.trainer.id)?.body.texture.key === 'avt-ninja_sheet';
  }, undefined, { timeout: 8000 });
  await a.waitForTimeout(4500);
  await a.screenshot({ path: info.outputPath('3-world-duel.png') });

  // B forfeits; both go back into their own world, still connected and visible to each other
  await ev(b, `window.__duel.forfeit()`);
  await a.waitForFunction(() => !!(window as Win).__duel.ended, undefined, { timeout: 5000 });
  await ev(a, `window.__duel.exit()`);
  await ev(b, `window.__duel.exit()`);
  await inAdventure(a);
  await inAdventure(b);
  expect(await ev(a, `window.__net.connected`)).toBe(true);
  await a.waitForFunction(() => (window as Win).__adv.presence?.visible(), undefined, { timeout: 10_000 });
  expect(await ev(a, `window.__adv.state.save.pvp.wins`)).toBe(1);
  expect(await ev(b, `window.__adv.state.save.pvp.losses`)).toBe(1);
  await a.screenshot({ path: info.outputPath('4-back-in-world.png') });

  // leaving the room removes the other player from the map
  await ev(b, `window.__net.leave()`);
  await a.waitForFunction(() => !(window as Win).__adv.interactables.has('remote-player'), undefined, { timeout: 8000 });
  expect(errors).toEqual([]);
  await ctx.close();
});
