import { expect, test, type Page } from '@playwright/test';

// NPCs are animated pixel characters again (own body + colours), and the professor offers the starters of all
// nine generations in both Adventure campaigns.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page) => page.waitForFunction(() => (window as Win).__adv?.world && !(window as Win).__adv.modal && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
const layerSize = (page: Page) => ev<number>(page, `(() => { const d = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return d ? d.list.length : 0; })()`);
/** NPC sprites on screen: texture + current animation */
const npcSprites = (page: Page) => ev<{ tex: string; anim: string }[]>(page, `window.__adv.children.list
  .filter(o => o.texture && o.texture.key.startsWith('npc-')).map(o => ({ tex: o.texture.key, anim: o.anims?.currentAnim?.key ?? '' }))`);

async function openPicker(page: Page, npc: string) {
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.npcs.find(x => x.id === '${npc}'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(400);
  // the starter picker is the only layer with this many parts (tabs + cards)
  for (let i = 0; i < 40 && (await layerSize(page)) < 20; i++) { await page.keyboard.press('e'); await page.waitForTimeout(160); }
  expect(await layerSize(page)).toBeGreaterThanOrEqual(20);
}

test('classic: pixel NPCs in the village, the professor offers Gen 1–9 (pick Chimchar from Gen 4)', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1)`);
  await ready(page);
  await ev(page, `(() => { const a = window.__adv; a.state.save.collection.length = 0; a.state.adv.party.length = 0; a.applyParty(); })()`);
  // NPCs: animated pixel characters, several distinct looks, all breathing / walking
  await ev(page, `window.__adv.world.teleport(71.5 * 48, 90 * 48)`);
  await page.waitForTimeout(1500);
  const npcs = await npcSprites(page);
  expect(npcs.length).toBeGreaterThan(5);
  expect(new Set(npcs.map((n) => n.tex)).size).toBeGreaterThan(4);
  expect(npcs.every((n) => /^npc-.*:(idle|walk)$/.test(n.anim))).toBe(true);
  await page.screenshot({ path: info.outputPath('1-village-npcs.png') });

  await openPicker(page, 'prof');
  await page.screenshot({ path: info.outputPath('2-picker-gen1.png') });
  // ▶ three times: Gen 4 (Sinnoh), then key 2 = Chimchar
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('3-picker-gen4.png') });
  await page.keyboard.press('2');
  await page.waitForFunction(() => (window as Win).__adv.state.party().length > 0, undefined, { timeout: 5000 });
  expect(await ev(page, `window.__adv.state.party().map(p => p.species)`)).toEqual(['chimchar']);
  for (let i = 0; i < 20 && (await layerSize(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  expect(await ev(page, `window.__adv.state.quests.states['q-main-1'].step`)).toBe(1);
  // the key that picked the starter is not also a party command (2 = another order than "auto")
  expect(await ev(page, `window.__adv.world.command`)).toBe('auto');
  expect(errors).toEqual([]);
});

test('Vietnam Odyssey: nón lá in Cà Mau, the professor opens on Hoenn and offers every generation', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 2, 'vietnam')`);
  await ready(page);
  await page.waitForTimeout(1200);
  const npcs = await npcSprites(page);
  expect(npcs.length).toBeGreaterThan(2);
  await page.screenshot({ path: info.outputPath('4-ca-mau-npcs.png') });
  await openPicker(page, 'vn-prof');
  await page.screenshot({ path: info.outputPath('5-picker-hoenn.png') });
  // the first tab shown is Hoenn: key 3 would be Mudkip; ◀ three times wraps round to Gen 9: key 2 = Fuecoco
  for (let i = 0; i < 3; i++) { await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(200); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: info.outputPath('6-picker-gen9.png') });
  await page.keyboard.press('2');
  await page.waitForFunction(() => (window as Win).__adv.state.party().length > 0, undefined, { timeout: 5000 });
  expect(await ev(page, `window.__adv.state.party().map(p => p.species)`)).toEqual(['fuecoco']);
  expect(errors).toEqual([]);
});
