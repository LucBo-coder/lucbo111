import { expect, test, type Page } from '@playwright/test';

// PokemonSummonManager: recall keeps HP (no healing in the ball), summon animation then the Pokémon is back,
// locked actions (no double recall / summon mid-animation), switch, mouse + keyboard, persistence across reload.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const inAdventure = (page: Page) => page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 15_000 });

test('summon / recall / switch: animations, locks, HP kept, input, save', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1)`);
  await inAdventure(page);
  await ev(page, `(() => { const a = window.__adv; ['pikachu', 'bulbasaur', 'squirtle'].forEach((s) => a.state.addPokemon(s, 20, 'gift')); a.applyParty(); })()`);
  const uids = await ev<string[]>(page, `window.__adv.state.adv.party.slice()`);
  expect(await ev(page, `window.__adv.world.allies.length`)).toBe(3);

  // hurt Bulbasaur to 40 %, then recall it (slot 2)
  await ev(page, `(() => { const u = window.__adv.world.allies.find((x) => x.ownerUid === '${uids[1]}'); u.hp = Math.round(u.maxHp * 0.4); })()`);
  expect(await ev(page, `window.__adv.summons.toggleSlot(1)`)).toBe('ok');
  // removed from the field at once (cannot be hit mid-recall), locked: a second action is refused
  expect(await ev(page, `window.__adv.world.allies.some((x) => x.ownerUid === '${uids[1]}')`)).toBe(false);
  expect(await ev(page, `window.__adv.summons.toggleSlot(1)`)).toBe('busy');
  expect(await ev(page, `window.__adv.summons.toggleSlot(0)`)).toBe('busy');
  await page.waitForTimeout(700);
  expect(await ev(page, `window.__adv.state.adv.recalled`)).toEqual([uids[1]]);
  expect(await ev<number>(page, `window.__adv.state.owned('${uids[1]}').hpFrac`)).toBeCloseTo(0.4, 1);
  expect(await ev(page, `window.__adv.summons.toggleSlot(1)`)).toBe('cooldown');
  await page.waitForTimeout(900);

  // summon by mouse: click its row in the party list
  const row = await ev<{ x: number; y: number }>(page, `(() => { const ui = window.__phaser.scene.getScene('AdvUI'); const z = ui.partyRows[1].zone; return { x: z.x + z.width / 2, y: z.y + z.height / 2 }; })()`);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(350);
  await page.screenshot({ path: info.outputPath('summon-mid.png') });
  await page.waitForFunction((u) => (window as Win).__adv.world.allies.some((x: { ownerUid: string }) => x.ownerUid === u), uids[1], { timeout: 5000 });
  const back = await ev<number>(page, `(() => { const u = window.__adv.world.allies.find((x) => x.ownerUid === '${uids[1]}'); return u.hp / u.maxHp; })()`);
  expect(back).toBeCloseTo(0.4, 1); // not healed by the ball
  await page.waitForTimeout(900);

  // keyboard: Shift+3 recalls Squirtle
  await page.keyboard.down('Shift'); await page.keyboard.press('3'); await page.keyboard.up('Shift');
  await page.waitForTimeout(700);
  expect(await ev(page, `window.__adv.state.adv.recalled`)).toEqual([uids[2]]);
  await page.waitForTimeout(900);

  // switch Pikachu ↔ Squirtle: one locked action
  expect(await ev(page, `window.__adv.summons.switchTo('${uids[0]}', '${uids[2]}')`)).toBe('ok');
  expect(await ev(page, `window.__adv.summons.toggleSlot(1)`)).toBe('busy');
  await page.waitForFunction((u) => (window as Win).__adv.world.allies.some((x: { ownerUid: string }) => x.ownerUid === u) && !(window as Win).__adv.summons.isBusy(), uids[2], { timeout: 5000 });
  expect(await ev(page, `window.__adv.state.adv.recalled`)).toEqual([uids[0]]);
  // the last Pokémon on the field can't be recalled on its own
  await page.waitForTimeout(900);
  await ev(page, `window.__adv.summons.toggleSlot(1)`);
  await page.waitForTimeout(1700);
  expect(await ev(page, `window.__adv.summons.toggleSlot(2)`)).toBe('last');

  // persistence: reload → Load Game → the recalled ones are still in their balls
  await ev(page, `window.__adv.exitToMenu()`);
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1)`);
  await inAdventure(page);
  const rec = await ev<string[]>(page, `window.__adv.state.adv.recalled.slice().sort()`);
  expect(rec).toEqual([uids[0], uids[1]].sort());
  expect(await ev(page, `window.__adv.world.allies.map((x) => x.ownerUid)`)).toEqual([uids[2]]);
  await page.screenshot({ path: info.outputPath('party-after-reload.png') });
  expect(errors).toEqual([]);
});
