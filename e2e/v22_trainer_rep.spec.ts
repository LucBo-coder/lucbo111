import { expect, test, type Page } from '@playwright/test';

// V22 in the real game (Vietnam Odyssey, Cà Mau): a trainer fields two Pokémon and keeps the third in reserve, sends it
// out when a slot opens; the first win pays items once; after the cooldown a rematch at higher levels pays money only;
// reputation goes to Cà Mau and survives save → reload; NPCs greet by reputation tier.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
const SHOTS = process.env.V22_SHOTS;

async function closeDialogues(page: Page) {
  for (let i = 0; i < 12 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}

/** Walk up to the trainer and accept (E, then choice 1) until a battle is on. */
async function challenge(page: Page, id: string) {
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.trainers.find(x => x.id === '${id}'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(400);
  for (let i = 0; i < 20 && !(await ev<boolean>(page, `!!window.__adv.battle`)); i++) { await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? '1' : 'e'); await page.waitForTimeout(200); }
  expect(await ev(page, `!!window.__adv.battle`)).toBe(true);
}

const killField = (page: Page) => ev(page, `(() => { const w = window.__adv.world; for (const u of (window.__adv.battle?.units ?? [])) if (u.alive) w.applyDamage(u, u.maxHp, w.allies[0]); })()`);

test('trainer reserves, rematch and Cà Mau reputation', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await page.waitForTimeout(600);
  await ev(page, `(() => { const a = window.__adv, s = a.state; const t = a.world.trainer; t.maxHp = t.hp = 1e6;
    s.addPokemon('mudkip', 3, 'starter'); a.applyParty(); })()`);
  await page.waitForTimeout(500);

  // ── first battle: 3 Pokémon, only 2 on the field ──
  await challenge(page, 'cm-fisherman');
  const b0 = await ev<{ field: number; bench: number }>(page, `(() => { const b = window.__adv.battle; return { field: b.units.filter(u => u.alive).length, bench: b.bench.length }; })()`);
  expect(b0).toEqual({ field: 2, bench: 1 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/trainer-two-fielded.png` });
  await killField(page);
  // the reserve comes out after a short pause
  await page.waitForFunction(() => (window as Win).__adv.battle?.units.some((u: Win) => u.alive), undefined, { timeout: 5000 });
  expect(await ev(page, `window.__adv.battle.bench.length`)).toBe(0);
  const items = await ev<Record<string, number>>(page, `window.__adv.regionDef.trainers.find(t => t.id === 'cm-fisherman').rewards.items ?? {}`);
  for (let i = 0; i < 20 && !(await ev<boolean>(page, `window.__adv.state.hasFlag('beat:cm-fisherman')`)); i++) { await killField(page); await page.waitForTimeout(300); }
  expect(await ev(page, `window.__adv.state.hasFlag('beat:cm-fisherman')`)).toBe(true);
  expect(await ev<number>(page, `window.__adv.state.adv.repBy['ca-mau']`)).toBe(5);
  await closeDialogues(page);
  const firstItem = Object.keys(items)[0];
  const afterFirst = firstItem ? await ev<number>(page, `window.__adv.state.item('${firstItem}')`) : 0;

  // ── too early for a rematch ──
  await challenge(page, 'cm-fisherman').catch(() => undefined);
  expect(await ev(page, `!!window.__adv.battle`)).toBe(false);
  await closeDialogues(page);

  // ── after the cooldown: rematch with higher levels, money only ──
  await ev(page, `(() => { const a = window.__adv; a.state.adv.playTime += 601; a.state.save.collection.forEach(p => { p.level = 20; }); a.world.allies.forEach(u => a.world.setAllyLevel(u, 20)); })()`);
  const money0 = await ev<number>(page, `window.__adv.state.money`);
  await challenge(page, 'cm-fisherman');
  const lv = await ev<number[]>(page, `window.__adv.battle.units.filter(u => u.alive).map(u => u.level)`);
  expect(Math.min(...lv)).toBeGreaterThan(8); // original team is Lv6–8
  expect(await ev(page, `window.__adv.battle.rematch`)).toBe(true);
  for (let i = 0; i < 20 && (await ev<boolean>(page, `!!window.__adv.battle`)); i++) { await killField(page); await page.waitForTimeout(300); }
  expect(await ev(page, `!!window.__adv.battle`)).toBe(false);
  expect(await ev<number>(page, `window.__adv.state.money`)).toBeGreaterThan(money0);
  if (firstItem) expect(await ev<number>(page, `window.__adv.state.item('${firstItem}')`)).toBe(afterFirst);
  expect(await ev(page, `window.__adv.state.adv.rematch['cm-fisherman'].wins`)).toBe(1);
  await closeDialogues(page);

  // ── reputation milestone: gift + greeting, kept through save → reload ──
  await ev(page, `(() => { const a = window.__adv; a.state.adv.region = 'ca-mau'; a.state.grant({ reputation: 40 }); a.notifyRepTier(); a.persist(); })()`);
  expect(await ev(page, `window.__adv.state.hasFlag('rep:ca-mau:2')`)).toBe(true);
  await ev(page, `(() => { const a = window.__adv; const n = a.regionDef.npcs.find(x => x.id === 'cm-elder'); a.world.teleport((n.x + 0.5) * 48, (n.y + 1.6) * 48); })()`);
  await page.waitForTimeout(400);
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  const said = await ev<string>(page, `(() => { const l = window.__phaser.scene.getScene('AdvUI').dialogueLayer; return l ? l.list.filter(o => o.text).map(o => o.text).join(' | ') : ''; })()`);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/rep-greeting.png` });
  await closeDialogues(page);
  const rep = await ev<number>(page, `window.__adv.state.adv.repBy['ca-mau']`);
  await page.reload();
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(false, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  expect(await ev<number>(page, `window.__adv.state.adv.repBy['ca-mau']`)).toBe(rep);
  expect(await ev(page, `window.__adv.state.adv.rematch['cm-fisherman'].wins`)).toBe(1);
  expect(await ev(page, `window.__adv.state.quests.states['vn-cm-rep']?.status`)).not.toBe(undefined);
  expect(errors).toEqual([]);
  // the greeting check last, so a layout change in the dialogue box shows up as its own failure
  expect(said).toMatch(/Kiểm lâm U Minh nói con|xóm|con/);
});
