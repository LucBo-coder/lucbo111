import { expect, test, type Page } from '@playwright/test';

// V20: active skills (keyboard Q, click a slot, right-click to keep a slot), the Pokémon Center nurse, walking
// villagers and the Training Camp, played in the real game through input; state read through window.__adv.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const T = 48; // tile size in world px
const SHOTS = process.env.V20_SHOTS;

async function dialogueOpen(page: Page) {
  return ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
}
async function closeDialogues(page: Page) {
  for (let i = 0; i < 30 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}
/** Game-canvas pixel (UI scene coordinates) → page coordinates. */
async function toPage(page: Page, x: number, y: number) {
  return ev<{ x: number; y: number }>(page, `(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return { x: r.left + ${x} * r.width / c.width, y: r.top + ${y} * r.height / c.height }; })()`);
}

test('active skills, nurse, walking villagers and the Training Camp', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await page.waitForTimeout(500);
  // deterministic party: one Charmander Lv20 from the collection, quest 1 finished, noon
  await ev(page, `(() => { const a = window.__adv; const s = a.state;
    s.save.collection.length = 0; s.adv.party.length = 0;
    const p = s.addPokemon('charmander', 20, 'starter');
    s.notify({ type: 'talk', target: 'prof' }); s.notify({ type: 'capture', target: 'pidgey' });
    for (const q of s.notify({ type: 'talk', target: 'prof' })) s.grant(q.rewards);
    s.adv.clock = 12 * 60; a.applyParty(); })()`);
  await page.waitForTimeout(400);

  // ── active skills ──
  await ev(page, `window.__adv.world.teleport(81.5*${T}, 70*${T})`);
  await page.waitForTimeout(300);
  await ev(page, `(() => { const w = window.__adv.world, t = w.trainer; w.spawnWild('bulbasaur', 18, t.x + 110, t.y, { hostile: true }); })()`);
  await page.waitForTimeout(250);
  await ev(page, `(() => { const u = window.__adv.focusAlly(); for (const s of u.skills) s.cd = 0; u.energy = u.maxEnergy; u.castSlot = -1; window.__adv.world.home.manualCd = 0; })()`);
  await page.keyboard.press('q');
  await page.waitForTimeout(120);
  const afterQ = await ev<{ cds: number; gcd: number; queued: number }>(page, `(() => { const u = window.__adv.focusAlly(); return { cds: u.skills.filter(s => s.cd > 0).length, gcd: window.__adv.world.home.manualCd, queued: u.queuedSlot }; })()`);
  expect(afterQ.gcd).toBeGreaterThan(0); // the request was accepted
  expect(afterQ.cds + (afterQ.queued >= 0 ? 1 : 0)).toBeGreaterThan(0);

  // click the second slot of the bar
  await page.waitForTimeout(1400);
  // a fresh opponent (the first one may already be beaten) and a ready kit
  await ev(page, `(() => { const w = window.__adv.world, t = w.trainer; w.spawnWild('bulbasaur', 18, t.x + 100, t.y + 20, { hostile: true }); })()`);
  await page.waitForTimeout(250);
  // slot 2 kept for the player (otherwise the AI may spend it in the frames before the click)
  await ev(page, `(() => { const a = window.__adv, u = a.focusAlly(); if (!a.isReserved(u, 1)) a.toggleReserved(1); for (const s of u.skills) s.cd = 0; u.energy = u.maxEnergy; u.castSlot = -1; a.world.home.manualCd = 0; })()`);
  await page.waitForTimeout(100);
  const bar = await ev<{ x: number; y: number; sq: number; gap: number }>(page, `window.__phaser.scene.getScene('AdvUI').skillBar.bounds`);
  const slot1 = await toPage(page, bar.x + bar.sq + bar.gap + bar.sq / 2, bar.y + bar.sq / 2);
  await page.mouse.click(slot1.x, slot1.y);
  await page.waitForTimeout(120);
  expect(await ev<number>(page, `window.__adv.world.home.manualCd`)).toBeGreaterThan(0);
  expect(await ev<number>(page, `window.__adv.focusAlly().skills[1].cd + (window.__adv.focusAlly().queuedSlot === 1 ? 1 : 0)`)).toBeGreaterThan(0);

  // right-click the first slot: kept for the player
  const slot0 = await toPage(page, bar.x + bar.sq / 2, bar.y + bar.sq / 2);
  await page.mouse.click(slot0.x, slot0.y, { button: 'right' });
  await page.waitForTimeout(150);
  expect(await ev<number>(page, `window.__adv.focusAlly().reserved & 1`)).toBe(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/v20_skillbar.png` });
  // kept slots survive a re-summon (units are rebuilt)
  await ev(page, `window.__adv.applyParty()`);
  await page.waitForTimeout(300);
  expect(await ev<number>(page, `window.__adv.focusAlly().reserved & 1`)).toBe(1);

  // ── Pokémon Center nurse heals ──
  await ev(page, `(() => { const w = window.__adv.world; for (const e of w.enemies) { e.alive = false; } w.trainer.hp = 5; for (const a of w.allies) a.hp = 1; })()`);
  await ev(page, `window.__adv.world.teleport(96.5*${T}, 91.4*${T})`);
  await page.waitForTimeout(500);
  expect(await ev<string>(page, `window.__adv.nearest?.id`)).toBe('nurse');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  await closeDialogues(page);
  const hp = await ev<{ t: number; a: number }>(page, `(() => { const w = window.__adv.world; return { t: w.trainer.hp / w.trainer.maxHp, a: Math.min(...w.allies.map(a => a.hp / a.maxHp)) }; })()`);
  expect(hp.t).toBe(1);
  expect(hp.a).toBe(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/v20_center.png` });

  // ── walking villagers move by day ──
  await ev(page, `window.__adv.world.teleport(81.5*${T}, 104*${T})`);
  await page.waitForTimeout(600);
  const p0 = await ev<{ x: number; y: number }>(page, `(() => { const i = window.__adv.interactables.get('sv-granny'); return { x: i.x, y: i.y }; })()`);
  await page.waitForTimeout(6500);
  const p1 = await ev<{ x: number; y: number }>(page, `(() => { const i = window.__adv.interactables.get('sv-granny'); return { x: i.x, y: i.y }; })()`);
  expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeGreaterThan(4);
  // stays around its home spot (tile 86,111: interactable sits 24 px below the sprite centre)
  expect(Math.hypot(p1.x - 86.5 * T, p1.y - (111.5 * T + 24))).toBeLessThan(5 * T);

  // ── Training Camp: enter the area, accept the first lesson from the coach ──
  await ev(page, `window.__adv.world.teleport(46*${T}, 83.5*${T})`);
  await page.waitForTimeout(700);
  expect(await ev<string[]>(page, `window.__adv.state.adv.areas`)).toContain('camp');
  await ev(page, `window.__adv.world.teleport(49.5*${T}, 81.6*${T})`);
  await page.waitForTimeout(500);
  expect(await ev<string>(page, `window.__adv.nearest?.id`)).toBe('camp-coach');
  await page.keyboard.press('e');
  for (let i = 0; i < 20; i++) {
    const choices = await ev<boolean>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return !!d && d.list.length > 6; })()`);
    if (choices) break;
    await page.keyboard.press('e');
    await page.waitForTimeout(160);
  }
  await page.keyboard.press('1');
  await closeDialogues(page);
  const camp = await ev<string>(page, `window.__adv.state.quests.states['q-camp-1'].status`);
  // the coach may first finish the board quest's talk step; then the lesson is offered on the next talk
  if (camp !== 'active') {
    await page.keyboard.press('e');
    for (let i = 0; i < 20; i++) {
      const choices = await ev<boolean>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return !!d && d.list.length > 6; })()`);
      if (choices) break;
      await page.keyboard.press('e');
      await page.waitForTimeout(160);
    }
    await page.keyboard.press('1');
    await closeDialogues(page);
  }
  expect(await ev<string>(page, `window.__adv.state.quests.states['q-camp-1'].status`)).toBe('active');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/v20_camp.png` });

  expect(errors).toEqual([]);
});

test.describe('phone portrait', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('skill bar fits beside the touch buttons and a tap uses a skill', async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/?debug');
    await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
    await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(true)`);
    await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
    await page.waitForTimeout(500);
    await ev(page, `(() => { const a = window.__adv, s = a.state; s.save.collection.length = 0; s.adv.party.length = 0; s.addPokemon('squirtle', 20, 'starter'); s.adv.clock = 720; a.applyParty(); })()`);
    await page.waitForTimeout(400);
    // no interactive HUD element overlaps the bar
    const overlap = await ev<string[]>(page, `(() => {
      const ui = window.__phaser.scene.getScene('AdvUI'), b = ui.skillBar.bounds, w = 4 * b.sq + 3 * b.gap;
      const bar = new Phaser.Geom.Rectangle(b.x, b.y, w, b.sq);
      const zones = new Set(ui.skillBar.zones);
      const hits = [];
      for (const o of ui.children.list) {
        if (zones.has(o) || !o.input?.enabled || !o.getBounds) continue;
        const r = o.getBounds();
        if (Phaser.Geom.Rectangle.Overlaps(bar, r) && r.width < ui.scale.width * 0.9) hits.push(o.type + '@' + Math.round(r.x) + ',' + Math.round(r.y));
      }
      return hits;
    })()`);
    expect(overlap).toEqual([]);
    await ev(page, `(() => { const w = window.__adv.world, t = w.trainer; w.spawnWild('charmander', 18, t.x + 90, t.y, { hostile: true }); })()`);
    await page.waitForTimeout(300);
    await ev(page, `(() => { const a = window.__adv, u = a.focusAlly(); if (!a.isReserved(u, 0)) a.toggleReserved(0); for (const s of u.skills) s.cd = 0; u.energy = u.maxEnergy; u.castSlot = -1; a.world.home.manualCd = 0; })()`);
    await page.waitForTimeout(100);
    const bar = await ev<{ x: number; y: number; sq: number }>(page, `window.__phaser.scene.getScene('AdvUI').skillBar.bounds`);
    const p = await toPage(page, bar.x + bar.sq / 2, bar.y + bar.sq / 2);
    await page.touchscreen.tap(p.x, p.y);
    await page.waitForTimeout(150);
    expect(await ev<number>(page, `window.__adv.world.home.manualCd`)).toBeGreaterThan(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/v20_phone.png` });
  });
});
