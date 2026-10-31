import { expect, test } from '@playwright/test';
type Win = Record<string, any>;
// Players can read how every Pokémon evolves: Pokédex list + party detail + the "Cách tiến hóa" dialogue.
test('evolution conditions are shown in the Pokédex and the party detail', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.evaluate(() => { void (window as Win).__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam'); });
  await page.waitForFunction(() => (window as Win).__adv?.map && (window as Win).__phaser.scene.isActive('AdvUI'));
  for (let i = 0; i < 20; i++) {
    if (!await page.evaluate(() => !!(window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer)) break;
    await page.keyboard.press('e'); await page.waitForTimeout(200);
  }
  const uiText = () => page.evaluate(() => {
    const ui = (window as Win).__phaser.scene.getScene('AdvUI');
    const collect = (x: Win): string[] => [typeof x.text === 'string' ? x.text : '', ...(x.list ?? []).flatMap(collect)];
    return ui.children.list.flatMap(collect).join('\n');
  });

  await page.evaluate(() => {
    const a = (window as Win).__adv, ui = (window as Win).__phaser.scene.getScene('AdvUI');
    const p = a.state.addPokemon('eevee', 20, 'wild');
    a.state.save.pokedex.seen.push('eevee');
    ui.selected.party = p.uid; ui.selected.dex = 'eevee';
    ui.openMenu('party');
  });
  await page.waitForTimeout(500);
  let text = await uiText();
  expect(text).toContain('Espeon');
  expect(text).toContain('chạm để xem cách tiến hóa');
  
  await page.screenshot({ path: test.info().outputPath('party-detail.png') });

  await page.evaluate(() => (window as Win).__phaser.scene.getScene('AdvUI').openMenu('dex'));
  await page.waitForTimeout(500);
  text = await uiText();
  expect(text).toContain('Tiến hóa thành Vaporeon, Jolteon');
  expect(text).not.toMatch(/eevee → vaporeon/);
  await page.screenshot({ path: test.info().outputPath('pokedex.png') });

  await page.evaluate(() => { const ui = (window as Win).__phaser.scene.getScene('AdvUI'); void ui.showEvoGuide('eevee', 'dex', ui.selected.party); });
  await page.waitForTimeout(800);
  const pages: string[] = [];
  for (let i = 0; i < 24; i++) {
    await page.waitForTimeout(1500); // let the typewriter finish the page
    const t = await page.evaluate(() => (window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer?.list.map((x: Win) => x.text ?? '').join('\n') ?? null);
    if (t == null) break;
    pages.push(t);
    if (i === 3) await page.screenshot({ path: test.info().outputPath('guide-page.png') });
    await page.keyboard.press('e'); await page.waitForTimeout(300);
  }
  const all = pages.join('\n');
  expect(all).toContain('Còn thiếu: Water Stone trong Túi');
  expect(all).toContain('Mua Water Stone ở cửa hàng');
  expect(errors).toEqual([]);
});
