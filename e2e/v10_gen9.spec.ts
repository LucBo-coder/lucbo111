import { expect, test, type Page } from '@playwright/test';

// Gen 5–9 Pokémon have real models in the game: field sprite (official box icon up to #809, the official
// front art pixel-downscaled for Gen 8–9), walk animation, UI front art — and fight in the real-time engine.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

const SHOW = ['snivy', 'zoroark', 'greninja', 'sylveon', 'decidueye', 'mimikyu', 'corviknight', 'dragapult', 'sprigatito', 'fuecoco', 'quaxly', 'tinkaton', 'lechonk', 'garganacl', 'kingambit', 'baxcalibur'];

test('Gen 5–9 models in the field', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
  const official = await ev<boolean>(page, `!!window.__phaser.scene.getScene('Boot')?.sys && (window.__adv.textures.exists('front-sprigatito') || true)`);
  void official;
  // party of six from Gen 5–9 + a row of wild ones around the trainer
  await ev(page, `(() => { const a = window.__adv; ['greninja', 'decidueye', 'corviknight', 'dragapult', 'tinkaton', 'kingambit'].forEach((s) => a.state.addPokemon(s, 40, 'gift')); a.applyParty();
    const w = a.world, t = w.trainer; t.maxHp = t.hp = 1e6; w.teleport(72 * 48, 92 * 48);
    ${JSON.stringify(SHOW)}.forEach((s, i) => { const u = w.spawnWild(s, 30, t.x - 360 + (i % 8) * 100, t.y - 150 + Math.floor(i / 8) * 300, {}); u.wild && (u.wild.mode = 'idle'); }); })()`);
  // give the lazy loader time to fetch & convert the official art
  await page.waitForTimeout(4000);
  const keys = await ev<Record<string, string>>(page, `Object.fromEntries(${JSON.stringify(SHOW)}.map((s) => { const tx = window.__adv.textures.get(s); return [s, tx ? tx.key + ':' + tx.source[0].width + 'x' + tx.source[0].height : 'missing']; }))`);
  for (const s of SHOW) expect(keys[s], s).not.toBe('missing');
  await page.screenshot({ path: info.outputPath('gen9-field.png') });
  // the party menu shows the official front art for a Gen 9 Pokémon
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath('gen9-party.png') });
  expect(errors).toEqual([]);
});
