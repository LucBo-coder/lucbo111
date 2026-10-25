import { expect, test, type Page } from '@playwright/test';

// Rayquaza at the Sky Pillar: boss HUD from the UI pack with live data, 3 phases (Mega form change with an
// invulnerable cinematic, enraged Sky Cataclysm), WEAKENED capture window, capture → joins once, checkpoint save.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const boss = `window.__adv.world.boss`;

/** Hits the boss down to `frac`, waiting out each invulnerable phase transition (one hit never skips a phase). */
async function beatTo(page: Page, frac: number) {
  for (let i = 0; i < 80; i++) {
    const r = await ev<{ hp: number; act: boolean; w: boolean }>(page, `(() => { const b = ${boss}; if (!b) return { hp: 0, act: false, w: true }; return { hp: b.hp / b.maxHp, act: b.boss.pm.canAct && !(b.boss.ray && b.boss.ray.air > 0.5), w: !!b.boss.weakened }; })()`);
    if (r.w || (r.hp <= frac + 1e-6 && r.act)) return;
    if (r.act) await ev(page, `(() => { const b = ${boss}; window.__adv.world.applyDamage(b, Math.ceil(b.hp - b.maxHp * ${frac}), null); })()`);
    await page.waitForTimeout(250);
  }
}

test('Rayquaza: HUD, 3 phases, Mega form, weakened capture, no duplicate', async ({ page }, info) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  // Font CDN access is optional and blocked in offline test environments.
  // Use the existing monospace fallback; keep reporting all game/asset errors.
  await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 15_000 });
  // since 0.17 the shrine stands in its themed region: travel there first (bypasses the portal gate)
  await ev(page, `window.__adv.travelTo('coral-coast', 14, 85)`);
  await page.waitForFunction((r) => (window as Win).__adv?.map?.id === r && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), 'coral-coast', { timeout: 15_000 });
  await ev(page, `(() => { const a = window.__adv; ['garchomp', 'metagross', 'salamence', 'tyranitar'].forEach((s) => a.state.addPokemon(s, 70, 'gift')); a.state.addItems({ ultraball: 10 }); a.selectedBall = 'ultraball'; ['boss:kyogre', 'boss:groudon'].forEach((f) => a.state.setFlag(f)); a.applyParty(); const t = a.world.trainer; t.maxHp = t.hp = 1e9; })()`);
  // walk into the Sky Pillar arena → the boss spawns there
  await ev(page, `(() => { const s = window.__adv.bossSites().find((x) => x.id === 'rayquaza'); window.__adv.world.teleport((s.x + 0.5) * 48, (s.y + 3.5) * 48); })()`);
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.defId === 'rayquaza', undefined, { timeout: 20_000 });
  await page.waitForTimeout(2500);
  expect(await ev(page, `window.__phaser.scene.getScene('AdvUI').bossHud.ok`)).toBe(true);
  expect(await ev(page, `${boss}.boss.pm.count`)).toBe(3);
  await page.screenshot({ path: info.outputPath('1-normal.png') });

  // → 70 %: Mega Evolution cinematic, invulnerable, then the Mega form
  await ev(page, `(() => { const b = ${boss}; window.__adv.world.applyDamage(b, b.hp, null); })()`);
  await page.waitForTimeout(150);
  expect(await ev<number>(page, `Math.round(${boss}.hp / ${boss}.maxHp * 100)`)).toBe(70);
  expect(await ev(page, `${boss}.boss.pm.invulnerable`)).toBe(true);
  await page.waitForTimeout(700);
  await page.screenshot({ path: info.outputPath('2-mega-cinematic.png') });
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.boss.pm.canAct, undefined, { timeout: 10_000 });
  expect(await ev(page, `${boss}.boss.form`)).toBe('rayquaza-mega');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: info.outputPath('3-mega.png') });

  // checkpoint: a save now, then the scene reloads the fight in the same phase with the same HP
  await ev(page, `window.__adv.persist()`);
  const saved = await ev<{ hpFrac: number; phase: { index: number } }>(page, `window.__adv.state.adv.bossFights.rayquaza`);
  expect(saved.phase.index).toBe(1);

  // → 30 %: enraged, Sky Cataclysm
  await beatTo(page, 0.29);
  expect(await ev(page, `${boss}.boss.pm.phase.kind`)).toBe('enrage');
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.lastSkill === 'sky_cataclysm', undefined, { timeout: 20_000 });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: info.outputPath('4-enraged-cataclysm.png') });

  // → weakened: capture window instead of death
  await page.waitForFunction(() => !(window as Win).__adv.world.boss?.boss.ray?.act, undefined, { timeout: 20_000 });
  await beatTo(page, 0);
  await page.waitForFunction(() => (window as Win).__adv.world.boss?.boss.weakened && (window as Win).__adv.legendCap, undefined, { timeout: 10_000 });
  expect(await ev(page, `${boss}.alive`)).toBe(true);
  expect(await ev(page, `window.__adv.state.hasFlag('boss:rayquaza')`)).toBe(true);
  expect(await ev(page, `window.__adv.state.save.collection.some((c) => c.species === 'rayquaza')`)).toBe(false);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath('5-weakened.png') });

  // throw: force the roll so the test is deterministic, aim at the boss
  await ev(page, `(() => { const a = window.__adv; a.legendCap.rule.minChance = 0.95; const b = ${boss}; a.pointerWorld = { x: b.x, y: b.y, at: a.time.now }; a.throwBall(); })()`);
  await page.waitForFunction(() => !(window as Win).__adv.captureFx, undefined, { timeout: 15_000 });
  let owned = await ev<number>(page, `window.__adv.state.save.collection.filter((c) => c.species === 'rayquaza').length`);
  if (owned === 0) {
    // the 5 % miss: exactly one throw used, the window stays open → throw again
    expect(await ev<number>(page, `window.__adv.legendCap ? window.__adv.legendCap.left : -1`)).toBe(3);
    await ev(page, `(() => { const a = window.__adv; const b = ${boss}; a.pointerWorld = { x: b.x, y: b.y, at: a.time.now }; a.throwBall(); })()`);
    await page.waitForFunction(() => !(window as Win).__adv.captureFx, undefined, { timeout: 15_000 });
    owned = await ev<number>(page, `window.__adv.state.save.collection.filter((c) => c.species === 'rayquaza').length`);
  }
  {
    expect(owned).toBe(1);
    expect(await ev(page, `window.__adv.state.save.collection.find((c) => c.species === 'rayquaza').ball`)).toBe('ultraball');
    expect(await ev(page, `window.__adv.state.adv.legends.rayquaza`)).toBe('caught');
    expect(await ev(page, `window.__adv.state.adv.bossFights.rayquaza`)).toBeUndefined();
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('6-after-capture.png') });
  expect(errors).toEqual([]);
});
