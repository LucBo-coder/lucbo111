import { expect, test, type Page } from '@playwright/test';

// V22 Dungeon 2.0 in the real game (Hang Đá Cổ): the variant of the day (day 4, normal = "Hang tối") darkens the
// cave unless a party Pokémon can use Flash; a floor trap fires once; Rock Smash opens the secret room and its chest
// pays once per run.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, kind: string) => page.waitForFunction((k) => (window as Win).__adv?.mapKind === k && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), kind, { timeout: 15_000 });
const SHOTS = process.env.V22_SHOTS;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);

async function enterCave(page: Page) {
  await ev(page, `(() => { const a = window.__adv; a.persist(); window.__modes.start(a, 'adventure', { map: 'dungeon', difficulty: 'normal', dungeonId: 'ancient-cave' }); })()`);
  await ready(page, 'dungeon');
  await page.waitForTimeout(2600); // variant + Flash banners
}

test('dark variant, Flash, traps, secret room', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true)`);
  await ready(page, 'valley');
  await ev(page, `(() => { const a = window.__adv; a.state.adv.day = 4; a.state.addPokemon('geodude', 20, 'gift'); a.applyParty(); })()`);

  // ── no Flash user: pitch dark ──
  await enterCave(page);
  expect(await ev(page, `window.__adv.dungeon.mods.map(m => m.id)`)).toEqual(['dark']);
  expect(await ev(page, `window.__adv.flashLit`)).toBe(false);
  expect(await ev<number>(page, `window.__adv.dark.fillAlpha`)).toBeGreaterThan(0.9);
  expect(await ev<string>(page, `window.__phaser.scene.getScene('AdvUI').texts.area.text`)).toContain('Hang tối');
  await ev(page, `(() => { const a = window.__adv; a.world.trainer.maxHp = a.world.trainer.hp = 1e7; })()`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/dungeon-dark.png` });

  // ── a floor trap ──
  const trap = await ev<{ x: number; y: number }>(page, `window.__adv.dungeon.traps[0]`);
  await ev(page, `window.__adv.world.teleport(${(trap.x + 0.5) * 48}, ${(trap.y + 0.5) * 48})`);
  await page.waitForFunction(() => !(window as Win).__adv.dungeon.traps[0].armed, undefined, { timeout: 3000 });

  // ── the secret room: Rock Smash (Geodude Lv 20) ──
  await ev(page, `window.__adv.world.teleport(8.5 * 48, 28.5 * 48)`);
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe('dungeon-crack');
  expect(await ev(page, `window.__adv.map.solidAt(7, 28)`)).toBe(true);
  await page.keyboard.press('e');
  await page.waitForFunction(() => !(window as Win).__adv.map.solidAt(7, 28), undefined, { timeout: 3000 });
  // walk through the opened wall to the chest
  for (let i = 0; i < 40 && (await ev<number>(page, `window.__adv.world.trainer.x`)) > 5.2 * 48; i++) { await page.keyboard.down('a'); await page.waitForTimeout(60); }
  await page.keyboard.up('a');
  expect(await ev<number>(page, `window.__adv.world.trainer.x`)).toBeLessThan(5.5 * 48);
  await page.waitForTimeout(200);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe('dungeon-secret');
  const before = await ev<number>(page, `window.__adv.state.item('greatball')`);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  expect(await ev<number>(page, `window.__adv.state.item('greatball')`)).toBe(before + 2);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/dungeon-secret.png` });
  for (let i = 0; i < 6 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  expect(await ev<number>(page, `window.__adv.state.item('greatball')`)).toBe(before + 2); // once per run

  // ── with a Flash user the cave is lit ──
  await ev(page, `window.__adv.leaveDungeon(false)`);
  await ready(page, 'valley');
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('pikachu', 12, 'gift'); a.applyParty(); })()`);
  await enterCave(page);
  expect(await ev(page, `window.__adv.flashLit`)).toBe(true);
  expect(await ev<number>(page, `window.__adv.dark.fillAlpha`)).toBeLessThan(0.8);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/dungeon-flash.png` });
  expect(errors).toEqual([]);
});
