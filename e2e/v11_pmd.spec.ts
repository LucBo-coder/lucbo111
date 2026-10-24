import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// PMD animation pack (personal, git-ignored): real 8-direction animations replace the derived frames in the field.
// Runs only where the pack has been imported (scripts/import-pmd-sprites.py).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const SHOW = ['bulbasaur', 'pikachu', 'charizard', 'pikachu', 'gengar', 'lucario', 'greninja', 'mimikyu', 'dragapult', 'sprigatito', 'fuecoco', 'quaxly', 'tinkaton'];

test.skip(!existsSync('public/assets/pmd/index.json'), 'PMD pack not imported on this machine');

test('PMD pack: 8-direction animations in the field, shiny sheets, walking turns the sprite', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
  await ev(page, `(() => { const a = window.__adv, w = a.world, t = w.trainer; t.maxHp = t.hp = 1e6; w.teleport(72 * 48, 92 * 48);
    ['greninja', 'lucario', 'dragapult'].forEach((s) => a.state.addPokemon(s, 40, 'gift')); a.applyParty();
    ${JSON.stringify(SHOW)}.forEach((s, i) => { const u = w.spawnWild(s, 20, t.x - 330 + (i % 6) * 130, t.y - 170 + Math.floor(i / 6) * 330, {}); u.shiny = i === 0; if (u.wild) u.wild.mode = 'idle'; }); })()`);
  await page.waitForFunction(() => { const a = (window as Win).__adv; const views = a.renderer_.views; let n = 0; for (const u of a.world.enemies) if (views.get(u.id)?.body.texture.key.startsWith('pmd:')) n++; return n >= 10; }, undefined, { timeout: 30_000 });
  const keys = await ev<string[]>(page, `(() => { const a = window.__adv; return a.world.enemies.filter(e => e.alive).map(e => a.renderer_.views.get(e.id)?.body.texture.key ?? 'none'); })()`);
  expect(keys.filter((k) => k.startsWith('pmd:')).length).toBeGreaterThanOrEqual(10);
  expect(keys.some((k) => k.startsWith('pmd:bulbasaur:s:'))).toBe(true); // shiny sheet
  // timing: Phaser 3.88 ignores per-frame durations, so each drawing must be repeated for its SpriteCollab duration
  const t = await ev<{ ms: number; frames: number; expected: number }>(page, `(() => { const an = window.__adv.anims.get('pmd:pikachu:Idle:0'); const meta = window.__pmdMeta?.('pikachu', 'Idle');
    return { ms: an.msPerFrame, frames: an.frames.length, expected: meta ? meta.d.reduce((s, d) => s + Math.max(1, d), 0) : -1 }; })()`);
  expect(t.ms).toBeCloseTo((1000 / 60) * 1.5, 1);
  expect(t.frames).toBe(t.expected);
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('pmd-field.png') });

  // really walk the trainer around (keyboard): the ally following it turns to its smoothed heading
  const dirs = new Set<number>();
  for (const key of ['d', 's', 'a', 'w']) {
    await page.keyboard.down(key);
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(150);
      const d = await ev<number | null>(page, `(() => { const a = window.__adv; const u = a.world.allies[0]; return a.renderer_.views.get(u.id)?.pdir ?? null; })()`);
      if (d != null) dirs.add(d);
    }
    await page.keyboard.up(key);
  }
  expect(dirs.size).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
});
