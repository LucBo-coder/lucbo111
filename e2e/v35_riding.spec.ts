import { expect, test, type Page } from '@playwright/test';

// Riding (core/riding.ts, adventure/RideController.ts): Z climbs on the party's mount, the trainer sits on its back
// and moves at the species' speed; a flyer crosses the river and can't be left over the water; Z again = off.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;

test('ride a runner, then a flyer over the river', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'ca-mau' && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
  for (let i = 0; i < 20 && (await ev<boolean>(page, `!!${ui}.dialogueLayer`)); i++) { await ev(page, `window.__adv.interact()`); await page.waitForTimeout(150); }
  const uids = await ev<Record<string, string>>(page, `(() => { const s = window.__adv.state, out = {};
    for (const sp of ['rapidash', 'charizard']) { const p = s.addPokemon(sp, 40, 'wild'); out[sp] = p.uid; if (!s.inParty(p.uid)) s.togglePartyMember(p.uid); }
    window.__adv.applyParty(); return out; })()`);
  // no wild Pokémon around to start a fight
  await ev(page, `(() => { const w = window.__adv.world; for (const e of w.enemies) w.removeEnemy(e); })()`);

  // runner: Rapidash picked with Shift+Z, Z climbs on
  await ev(page, `window.__adv.state.adv.rideUid = '${uids.rapidash}'`);
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect(await ev(page, `window.__adv.world.ride && window.__adv.world.ride.species`)).toBe('rapidash');
  expect(await ev(page, `window.__adv.world.ride.mode`)).toBe('run');
  expect(await ev<boolean>(page, `!!${ui}.gimmicks.viewOf('ride')`)).toBe(true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: info.outputPath('ride-rapidash.png') });
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect(await ev(page, `window.__adv.world.ride`)).toBeNull();

  // flyer over the nearest water tile: can't get off there
  await ev(page, `window.__adv.state.adv.rideUid = '${uids.charizard}'`);
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect(await ev(page, `window.__adv.world.ride.mode`)).toBe('fly');
  const water = await ev<{ x: number; y: number } | null>(page, `(() => { const a = window.__adv, m = a.map, t = a.world.trainer, T = 48;
    const tx = Math.floor(t.x / T), ty = Math.floor(t.y / T);
    for (let r = 1; r < 120; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = (tx + dx + 0.5) * T, y = (ty + dy + 0.5) * T;
      if (m.terrainAt(tx + dx, ty + dy) === 5 && a.world.terrain.isWater(x, y) && !a.world.terrain.blocksFly(x, y)) return { x, y };
    }
    return null; })()`);
  expect(water).not.toBeNull();
  await ev(page, `window.__adv.world.teleport(${water!.x}, ${water!.y})`);
  await page.waitForTimeout(400);
  expect(await ev<boolean>(page, `window.__adv.world.terrain.isWater(window.__adv.world.trainer.x, window.__adv.world.trainer.y)`)).toBe(true);
  await page.screenshot({ path: info.outputPath('ride-charizard-river.png') });
  await page.keyboard.press('z');
  await page.waitForTimeout(200);
  expect(await ev(page, `window.__adv.world.ride && window.__adv.world.ride.species`)).toBe('charizard');
  // a save on the mount resumes on its back
  expect(await ev(page, `window.__adv.state.adv.ride`)).toBe(uids.charizard);
  expect(errors).toEqual([]);
});
