import { expect, test } from '@playwright/test';

type Win = Record<string, any>;
const species = ['caterpie', 'pikachu', 'snorlax', 'articuno', 'zapdos', 'rayquaza', 'rotom', 'rayquaza-mega'];

test('ground alignment, padding, actions, forms and depth in the actual renderer', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?debug&visualDebug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.evaluate(() => (window as Win).__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam'));
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await page.evaluate((ids) => {
    const a = (window as Win).__adv, w = a.world, t = w.trainer;
    w.teleport(72 * 48, 92 * 48);
    t.hp = t.maxHp = 1e6;
    // Freeze simulation only in this test; scene render/asset loading continue normally.
    w.step = () => {};
    a.__visualUnits = ids.map((id, i) => {
      const u = w.spawnWild(id, 20, t.x - 240 + (i % 4) * 160, t.y - 100 + Math.floor(i / 4) * 180, {});
      u.vx = u.vy = 0;
      u.hp = u.maxHp * 0.6; // Keep field health bars visible in the visual review screenshot.
      return u;
    });
  }, species);
  await page.waitForFunction(() => {
    const a = (window as Win).__adv;
    return a.__visualUnits.slice(0, 7).every((u: any) => a.renderer_.views.get(u.id)?.body.texture.key.startsWith('pmd:'));
  }, undefined, { timeout: 40_000 });
  const checks = await page.evaluate(() => {
    const a = (window as Win).__adv, r = a.renderer_, output: any[] = [];
    a.scene.pause();
    for (const u of a.__visualUnits) {
      const radius = u.radius, x = u.x, y = u.y;
      for (const state of ['idle', 'walk', 'attack', 'cast', 'hit', 'faint']) {
        const v = r.views.get(u.id);
        v.body.anims.stop(); v.anim = ''; v.pmove = state === 'walk';
        u.vx = state === 'walk' ? 80 : 0; u.vy = 0;
        u.dash = state === 'attack' ? {} : null;
        u.castSlot = state === 'cast' ? 0 : -1; u.animCast = state === 'cast' ? 1 : 0;
        u.hitFlash = state === 'hit' ? 0.2 : 0; u.fainted = state === 'faint';
        r.syncUnit(u);
        output.push({ species: u.defId, state, shadow: [v.shadow.x-x, v.shadow.y-y], depth: v.body.depth-y,
          ground: [u.x-x, u.y-y, u.radius-radius], offset: [v.body.x-x, v.body.y-y],
          pivot: [v.body.displayOriginX-v.body.frame.realWidth/2, v.body.displayOriginY-v.body.frame.realHeight/2],
          pmd: v.body.texture.key.startsWith('pmd:') });
      }
      u.fainted = false; u.hitFlash = 0; u.castSlot = -1; u.animCast = 0; u.dash = null;
      const v = r.views.get(u.id); v.body.anims.stop(); v.anim = ''; v.pmove = false; v.pdir = 0;
      r.syncUnit(u);
    }
    r.render(0);
    return output;
  });
  for (const check of checks) {
    expect(check.shadow, `${check.species}/${check.state}`).toEqual([0, 0]);
    expect(check.ground).toEqual([0, 0, 0]);
    expect(check.depth).toBe(0);
    expect(check.offset[0]).toBe(0);
    expect(check.offset[1]).toBe(['articuno', 'zapdos'].includes(check.species) ? -24 : check.species === 'rayquaza' ? -30 : check.species === 'rayquaza-mega' ? -32 : check.species === 'rotom' ? -12 : 0);
  }
  for (const id of species.slice(0, 7)) {
    const states = checks.filter(c => c.species === id);
    for (const row of states) {
      expect(row.pivot[0]).toBeCloseTo(states[0].pivot[0], 8);
      expect(row.pivot[1]).toBeCloseTo(states[0].pivot[1], 8);
    }
  }
  const depthChecks = await page.evaluate(() => {
    const a = (window as Win).__adv, r = a.renderer_, u = a.__visualUnits[3];
    const tree = a.children.list.find((o: any) => o.texture?.key === 'ow_tiles' && o.originY === 1 && o.scaleX === 3);
    const x = u.x, y = u.y, result: boolean[] = [];
    for (const target of [r.views.get(a.world.trainer.id).body, tree].filter(Boolean)) {
      for (const dy of [-1, 1]) {
        u.y = target.depth + dy;
        const body = r.syncUnit(u).body;
        a.sys.depthSort();
        result.push(dy < 0 ? a.children.list.indexOf(body) < a.children.list.indexOf(target)
          : a.children.list.indexOf(body) > a.children.list.indexOf(target));
      }
    }
    u.x = x; u.y = y;
    const v = r.views.get(u.id), pivots: number[] = [];
    for (let dir = 0; dir < 8; dir++) {
      v.pdir = dir; v.anim = ''; v.body.anims.stop(); r.syncUnit(u);
      pivots.push(v.body.displayOriginY - v.body.frame.realHeight / 2);
    }
    r.render(0);
    return { result, tree: !!tree, pivots };
  });
  expect(depthChecks.tree).toBe(true);
  expect(depthChecks.result).toEqual([true, true, true, true]);
  for (const pivot of depthChecks.pivots) expect(pivot).toBeCloseTo(depthChecks.pivots[0], 8);
  await page.screenshot({ path: info.outputPath('ground-overlay.png') });
  await page.evaluate(() => { (window as Win).__adv.scene.resume(); });
  await page.keyboard.press('F8');
  expect(await page.evaluate(() => (window as Win).__adv.renderer_.debugVisuals)).toBe(false);
  expect(errors).toEqual([]);
});
