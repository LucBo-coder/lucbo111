import { expect, test, type Page } from '@playwright/test';

// V21: Mega forms are drawn with their own art — SpriteCollab Mega sheets where they exist (fetch-pmd-megas.py),
// otherwise the Mega's official sprite — never with the base species' sheets.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const T = 48;

test('Mega forms show their own sprite on the field', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
  await ev(page, `(() => { const a = window.__adv; a.state.adv.clock = 12 * 60; a.world.teleport(81.5*${T}, 66*${T}); })()`);
  await page.waitForTimeout(300);
  const megas = ['charizard-mega-x', 'mewtwo-mega-y', 'venusaur-mega', 'scizor-mega'];
  await ev(page, `(() => { const w = window.__adv.world, t = w.trainer;
    ${JSON.stringify(megas)}.forEach((id, i) => { const e = w.spawnWild(id, 40, t.x - 180 + i * 120, t.y - 90, { hostile: false }); e.noCapture = true; });
    window.__adv.modal = true; /* a still picture: the simulation pauses, drawing goes on */ })()`);
  await page.waitForTimeout(3000);
  const tex = await ev<Record<string, string[]>>(page, `(() => { const keys = window.__phaser.textures.getTextureKeys();
    const out = {}; for (const id of ${JSON.stringify(megas)}) out[id] = keys.filter((k) => k.startsWith('pmd:' + id + ':') || k === id + '_sheet' || k === id);
    out.base = keys.filter((k) => k.startsWith('pmd:charizard:') || k.startsWith('pmd:venusaur:'));
    return out; })()`);
  // own SpriteCollab sheets
  expect(tex['charizard-mega-x'].some((k) => k.startsWith('pmd:charizard-mega-x:'))).toBe(true);
  expect(tex['mewtwo-mega-y'].some((k) => k.startsWith('pmd:mewtwo-mega-y:'))).toBe(true);
  // no SpriteCollab art: their own (official / generated) sheet, not the base species
  expect(tex['venusaur-mega']).toContain('venusaur-mega_sheet');
  expect(tex['scizor-mega']).toContain('scizor-mega_sheet');
  if (process.env.V21_SHOTS) await page.screenshot({ path: `${process.env.V21_SHOTS}/megas.png` });
  expect(errors).toEqual([]);
});
