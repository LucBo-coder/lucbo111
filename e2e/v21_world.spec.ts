import { expect, test, type Page } from '@playwright/test';

// V21 in the real game, through input: fishing at Hồ Pha Lê (cast, wait for the bite, reel in with E), picking a berry
// bush, the gate to Rừng Ngọc Lục Bảo, and the skill bar + Q in a practice duel. State read through window.__adv / __duel.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const T = 48;
const SHOTS = process.env.V21_SHOTS;

async function dialogueOpen(page: Page) {
  return ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
}

test('fishing, foraging and the Rừng Ngọc Lục Bảo gate', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await page.waitForTimeout(500);
  await ev(page, `(() => { const a = window.__adv, s = a.state;
    s.save.collection.length = 0; s.adv.party.length = 0; s.addPokemon('charmander', 20, 'starter');
    s.notify({ type: 'talk', target: 'prof' }); s.notify({ type: 'capture', target: 'pidgey' });
    for (const q of s.notify({ type: 'talk', target: 'prof' })) s.grant(q.rewards);
    s.adv.clock = 12 * 60; a.applyParty(); })()`);

  // ── foraging: walk up to a meadow bush and press E ──
  // (the companions' berry errands are paused here, or a party Pokémon picks the bush before the player does)
  await ev(page, `window.__adv.errandT = 1e9`);
  await ev(page, `window.__adv.world.teleport(42.5*${T}, 56.6*${T})`);
  await page.waitForTimeout(500);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe('bush-2');
  const bagBefore = await ev<number>(page, `Object.values(window.__adv.state.save.inventory ?? {}).reduce((n, v) => n + v, 0)`);
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  const used = await ev<number | undefined>(page, `window.__adv.state.adv.nodes?.['bush-2']`);
  expect(used).toBeGreaterThanOrEqual(0);
  const bagAfter = await ev<number>(page, `Object.values(window.__adv.state.save.inventory ?? {}).reduce((n, v) => n + v, 0)`);
  const wildOut = await ev<number>(page, `window.__adv.world.enemies.filter(e => e.alive && e.hostile).length`);
  expect(bagAfter > bagBefore || wildOut > 0).toBe(true); // an item, or a Pokémon jumped out
  await page.keyboard.press('e'); // again at once: still refilling
  await page.waitForTimeout(200);
  expect(await ev(page, `window.__adv.state.adv.nodes['bush-2']`)).toBe(used);
  await ev(page, `(() => { for (const e of window.__adv.world.enemies) e.alive = false; })()`);

  // ── fishing without a rod: told where to get one ──
  await ev(page, `window.__adv.world.teleport(112.5*${T}, 70.6*${T})`);
  await page.waitForTimeout(500);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe('fish-west');
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  expect(await dialogueOpen(page)).toBe(true);
  for (let i = 0; i < 6 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(200); }
  expect(await ev(page, `window.__adv.fishing`)).toBeNull();

  // ── with the rod: too early → the fish swims off (spot not used) ──
  await ev(page, `window.__adv.state.setFlag('tool:rod')`);
  await page.waitForTimeout(1100); // ripples come back on the next node refresh
  await page.keyboard.press('e');
  await page.waitForTimeout(150);
  expect(await ev(page, `!!window.__adv.fishing`)).toBe(true);
  // the trainer does not walk away while the line is out
  const x0 = await ev<number>(page, `window.__adv.world.trainer.x`);
  await page.keyboard.down('d'); await page.waitForTimeout(250); await page.keyboard.up('d');
  expect(Math.abs((await ev<number>(page, `window.__adv.world.trainer.x`)) - x0)).toBeLessThan(2);
  await page.keyboard.press('e');
  await page.waitForTimeout(150);
  expect(await ev(page, `window.__adv.fishing`)).toBeNull();
  expect(await ev(page, `window.__adv.state.adv.nodes?.['fish-west'] ?? null`)).toBeNull();

  // ── cast again, wait for the bite ("!"), reel in on time ──
  await page.keyboard.press('e');
  // the bite: the HUD prompt turns into "KÉO CÂU NGAY!" — reel in as soon as it shows
  await page.waitForFunction(() => /KÉO CÂU/.test((window as Win).__phaser.scene.getScene('AdvUI').texts.prompt.text), undefined, { timeout: 8000, polling: 16 });
  await page.keyboard.press('e');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fishing-bite.png` });
  await page.waitForTimeout(250);
  expect(await ev(page, `window.__adv.fishing`)).toBeNull();
  expect(await ev<number>(page, `window.__adv.state.adv.nodes['fish-west']`)).toBeGreaterThanOrEqual(0);
  // a hooked Pokémon stays in the water (aquatic) — or an item went to the bag
  const caught = await ev<{ aquatic: boolean; id: string } | null>(page, `(() => { const e = window.__adv.world.enemies.find(e => e.alive && e.hostile); return e ? { aquatic: e.aquatic, id: e.defId } : null; })()`);
  if (caught && ['magikarp', 'goldeen', 'feebas', 'horsea'].includes(caught.id)) expect(caught.aquatic).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fishing-result.png` });
  await ev(page, `(() => { for (const e of window.__adv.world.enemies) e.alive = false; })()`);

  // ── the gate to Rừng Ngọc Lục Bảo: locked first, then opens with the story flag ──
  await ev(page, `(() => { const a = window.__adv; a.state.setFlag('region:emerald-forest'); a.travelTo('starter-valley', 64, 14); })()`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI') && !(window as Win).__adv.modal, undefined, { timeout: 15_000 });
  await page.waitForTimeout(600);
  await ev(page, `window.__adv.world.teleport(64.5*${T}, 14*${T})`);
  await page.waitForTimeout(400);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe('portal-emerald');
  for (let i = 0; i < 12 && (await ev<string>(page, `window.__adv.map?.id`)) !== 'emerald-woods'; i++) {
    await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? '1' : 'e');
    await page.waitForTimeout(350);
  }
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'emerald-woods' && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const here = await ev<{ area: string; x: number; y: number }>(page, `(() => { const a = window.__adv, t = a.world.trainer; return { area: a.map.areaAt(Math.floor(t.x/48), Math.floor(t.y/48))?.id, x: t.x/48, y: t.y/48 }; })()`);
  expect(here.area).toBe('emerald-trail');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/emerald-woods.png` });
  expect(errors).toEqual([]);
});

test('practice duel: Q and the skill bar cast the focused Pokémon\'s move', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug&net=local');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__modes.start(window.__phaser.scene.getScene('Menu'), 'online')`);
  await page.waitForFunction(() => (window as Win).__phaser.scene.isActive('Lobby'));
  await ev(page, `(() => { const l = window.__lobby; l.go('practice'); l.pickRental(2); l.startPractice(); })()`);
  await page.waitForFunction(() => (window as Win).__phaser.scene.isActive('DuelUI') && (window as Win).__duel?.countdown <= 0, undefined, { timeout: 20_000 });
  await page.waitForTimeout(400);
  await ev(page, `(() => { const d = window.__duel, u = d.focusAlly(); for (const s of u.skills) s.cd = 0; u.energy = u.maxEnergy; d.mine.manualCd = 0; })()`);
  await page.keyboard.press('q');
  await page.waitForTimeout(100);
  const r = await ev<{ gcd: number; busy: boolean }>(page, `(() => { const d = window.__duel, u = d.focusAlly(); return { gcd: d.mine.manualCd, busy: u.queuedSlot >= 0 || u.castSlot >= 0 || u.skills.some(s => s.cd > 0) }; })()`);
  expect(r.gcd).toBeGreaterThan(0);
  expect(r.busy).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/duel-skillbar.png` });
  expect(errors).toEqual([]);
});
