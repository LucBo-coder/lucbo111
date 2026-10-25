import { expect, test, type Page } from '@playwright/test';

// PokemonSummonManager: recall keeps HP (no healing in the ball), summon animation then the Pokémon is back,
// locked actions (no double recall / summon mid-animation), single active partner (summoning another = switch), mouse + keyboard, persistence across reload.

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
  // single active rule: only one partner is outside its ball
  expect(await ev(page, `window.__adv.world.allies.length`)).toBe(1);
  const first = await ev<string>(page, `window.__adv.world.allies[0].ownerUid`);
  const fi = uids.indexOf(first);
  expect(await ev(page, `window.__adv.state.adv.activeUid`)).toBe(first);

  // hurt the active one to 40 %, then recall it (the field may be empty in Adventure)
  await ev(page, `(() => { const u = window.__adv.world.allies[0]; u.hp = Math.round(u.maxHp * 0.4); })()`);
  expect(await ev(page, `window.__adv.summons.toggleSlot(${fi})`)).toBe('ok');
  // removed from the field at once (cannot be hit mid-recall), locked: a second action is refused
  expect(await ev(page, `window.__adv.world.allies.length`)).toBe(0);
  expect(await ev(page, `window.__adv.summons.toggleSlot(${fi})`)).toBe('busy');
  await page.waitForTimeout(700);
  expect(await ev(page, `window.__adv.state.adv.recalled.slice().sort()`)).toEqual(uids.slice().sort());
  expect(await ev<number>(page, `window.__adv.state.owned('${first}').hpFrac`)).toBeCloseTo(0.4, 1);
  expect(await ev(page, `window.__adv.summons.toggleSlot(${fi})`)).toBe('cooldown');
  await page.waitForTimeout(900);

  // summon by mouse: click its row in the party list
  const row = await ev<{ x: number; y: number }>(page, `(() => { const ui = window.__phaser.scene.getScene('AdvUI'); const z = ui.partyRows[${fi}].zone; return { x: z.x + z.width / 2, y: z.y + z.height / 2 }; })()`);
  await page.mouse.click(row.x, row.y);
  await page.waitForTimeout(350);
  await page.screenshot({ path: info.outputPath('summon-mid.png') });
  await page.waitForFunction((u) => (window as Win).__adv.world.allies.some((x: { ownerUid: string }) => x.ownerUid === u) && !(window as Win).__adv.summons.isBusy(), first, { timeout: 5000 });
  const back = await ev<number>(page, `(() => { const u = window.__adv.world.allies.find((x) => x.ownerUid === '${first}'); return u.hp / u.maxHp; })()`);
  expect(back).toBeCloseTo(0.4, 1); // not healed by the ball
  await page.waitForTimeout(900);

  // keyboard: Shift+N on another slot switches (one locked action), never two on the field
  const ti = (fi + 1) % 3, target = uids[ti];
  await page.keyboard.down('Shift'); await page.keyboard.press(String(ti + 1)); await page.keyboard.up('Shift');
  expect(await ev(page, `window.__adv.summons.toggleSlot(${(ti + 1) % 3})`)).toBe('busy');
  await page.waitForFunction((u) => (window as Win).__adv.world.allies.some((x: { ownerUid: string }) => x.ownerUid === u) && !(window as Win).__adv.summons.isBusy(), target, { timeout: 5000 });
  expect(await ev(page, `window.__adv.world.allies.map((x) => x.ownerUid)`)).toEqual([target]);
  expect(await ev(page, `window.__adv.state.adv.activeUid`)).toBe(target);
  expect(await ev(page, `window.__adv.state.adv.recalled.includes('${target}')`)).toBe(false);
  await page.waitForTimeout(900);

  // explicit switchTo
  const last = uids[(ti + 1) % 3];
  expect(await ev(page, `window.__adv.summons.switchTo('${target}', '${last}')`)).toBe('ok');
  await page.waitForFunction((u) => (window as Win).__adv.world.allies.some((x: { ownerUid: string }) => x.ownerUid === u) && !(window as Win).__adv.summons.isBusy(), last, { timeout: 5000 });
  expect(await ev(page, `window.__adv.world.allies.length`)).toBe(1);
  await page.waitForTimeout(900);

  // persistence: reload → Load Game → the recalled ones are still in their balls
  await ev(page, `window.__adv.exitToMenu()`);
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1)`);
  await inAdventure(page);
  const rec = await ev<string[]>(page, `window.__adv.state.adv.recalled.slice().sort()`);
  expect(rec).toEqual(uids.filter((u) => u !== last).sort());
  expect(await ev(page, `window.__adv.world.allies.map((x) => x.ownerUid)`)).toEqual([last]);
  await page.screenshot({ path: info.outputPath('party-after-reload.png') });
  expect(errors).toEqual([]);
});
