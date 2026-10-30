import { readdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Vietnam Odyssey — every province made from a story spec (scripts/provinces), played through the real game loop:
// the gate of the previous province stays shut until its badge, opens, lands here; the first quest starts, the
// Pokémon Center's rest point lights up and the map renders without errors.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && !(window as Win).__adv.modal && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 30_000 });
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`);
async function closeDialogues(page: Page) {
  for (let i = 0; i < 12 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}

const provinces = JSON.parse(readFileSync('src/data/vietnam/provinces.json', 'utf8')) as { id: string; questPrefix: string }[];
const SPECS = readdirSync('scripts/provinces').filter((f) => f.endsWith('.ts') && f !== 'types.ts').map((f) => f.replace(/\.ts$/, ''));
const ROUTE = provinces.filter((p) => SPECS.includes(p.id));

test('provinces from story specs: gate, landing, first quest, rest point', async ({ page }, info) => {
  test.setTimeout(120_000 + ROUTE.length * 40_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  await ev(page, `(() => { const a = window.__adv; ['charizard', 'gyarados', 'tyranitar'].forEach(s => a.state.addPokemon(s, 60, 'gift')); a.applyParty(); })()`);

  const all = provinces;
  for (const p of ROUTE) {
    const prev = all[all.findIndex((x) => x.id === p.id) - 1].id;
    // every badge before the previous province's, then stand at the previous province's gate here
    await ev(page, `(() => { const a = window.__adv; ${JSON.stringify(all.slice(0, all.findIndex((x) => x.id === prev)).map((x) => 'badge:' + x.id))}.forEach(f => a.state.setFlag(f)); })()`);
    const spawn = (JSON.parse(readFileSync(`src/data/vietnam/${prev}.json`, 'utf8')) as { spawn: { x: number; y: number } }).spawn;
    if ((await ev(page, `window.__adv.map.id`)) !== prev) await ev(page, `window.__adv.travelTo('${prev}', ${spawn.x}, ${spawn.y})`);
    await ready(page, prev);
    await ev(page, `(() => { const t = window.__adv.world.trainer; t.maxHp = t.hp = 1e7; })()`);
    const gate = await ev<{ id: string; x: number; y: number }>(page, `window.__adv.regionDef.portals.find(x => x.to === '${p.id}')`);
    expect(gate, `${prev} → ${p.id}`).toBeTruthy();
    const stand = () => ev(page, `window.__adv.world.teleport((${gate.x} + 0.5) * 48, (${gate.y} + 1.5) * 48)`);
    // shut without the badge
    await stand(); await page.waitForTimeout(300);
    for (let i = 0; i < 4; i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
    await closeDialogues(page);
    expect(await ev(page, `window.__adv.map.id`), `${p.id} sealed`).toBe(prev);
    // open with it
    await ev(page, `window.__adv.state.setFlag('badge:${prev}')`);
    await stand(); await page.waitForTimeout(300);
    for (let i = 0; i < 14 && (await ev(page, `window.__adv.map.id`)) !== p.id; i++) { await page.keyboard.press((await dialogueOpen(page)) && i % 2 ? '1' : 'e'); await page.waitForTimeout(300); }
    await ready(page, p.id);
    expect(await ev(page, `window.__adv.state.quests.states['${p.questPrefix}1'].status`), p.id).toBe('active');
    // the rest point of the Pokémon Center
    const wp = await ev<{ id: string; x: number; y: number }>(page, `window.__adv.regionDef.waypoints[0]`);
    await ev(page, `window.__adv.world.teleport(${wp.x} * 48 + 24, ${wp.y} * 48 + 24)`); await page.waitForTimeout(400);
    for (let i = 0; i < 10 && !(await ev<boolean>(page, `window.__adv.state.adv.waypoints.includes('${wp.id}')`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
    await closeDialogues(page);
    expect(await ev(page, `window.__adv.state.adv.waypoints.includes('${wp.id}')`), wp.id).toBe(true);
    await page.waitForTimeout(600);
    await page.screenshot({ path: info.outputPath(`${p.id}.png`) });
  }
  expect(errors, errors.join('\n')).toEqual([]);
});
