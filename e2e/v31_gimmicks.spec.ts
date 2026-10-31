import { expect, test, type Page } from '@playwright/test';

// V31 in the real game: Terastal (key Y — crystal coat + Tera crown, same size), Gigantamax (key B — the animated
// body grows to its official height ratio, red clouds) and the Primal Reversion of Kyogre (automatic with the Blue Orb).

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!${ui}.dialogueLayer`);
const closeDialogues = async (page: Page) => { for (let i = 0; i < 20 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(200); } };
const lead = `window.__adv.world.allies.find(a => a.kind === 'pokemon' && !a.fainted)`;
const view = `window.__adv.renderer_.views.get(${lead}.id)`;

/** a sturdy hostile dummy next to the trainer: the party is "in combat" for as long as the test needs */
const dummy = `(() => { const a = window.__adv, t = a.world.trainer;
  const e = a.world.spawnEnemy('geodude', 5, false, t.x + 140, t.y);
  e.hostile = true; e.maxHp = e.hp = 1e9; e.moveSpeed = 0; e.contactPower = 0; e.skills = []; return !!e; })()`;

async function setActive(page: Page, species: string) {
  await ev(page, `(() => { const a = window.__adv, st = a.state;
    const p = st.save.collection.find(c => c.species === '${species}');
    if (!st.adv.party.includes(p.uid)) st.adv.party.unshift(p.uid);
    st.adv.activeUid = p.uid; st.adv.recalled = st.adv.recalled.filter(u => u !== p.uid); a.applyParty(); })()`);
  await page.waitForFunction((sp) => (window as Win).__adv.world.allies.some((u: Win) => u.defId.startsWith(sp)), species);
}

test('Terastal, Gigantamax and Primal Reversion in the field', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await ready(page, 'ca-mau');
  await closeDialogues(page);
  // two bosses beaten → the Tera Orb, four → the Dynamax Band (handed out by the scene itself)
  await ev(page, `(() => { const st = window.__adv.state; ['boss:a', 'boss:b', 'boss:c', 'boss:d'].forEach(f => st.setFlag(f));
    const c = st.addPokemon('charizard', 60, 'gift'); c.gmax = true; st.addPokemon('kyogre', 70, 'gift'); st.addItems({ 'blue-orb': 1 }); })()`);
  await page.waitForFunction(() => { const st = (window as Win).__adv.state; return st.item('tera-orb') > 0 && st.item('dynamax-band') > 0; }, undefined, { timeout: 10_000 });
  await closeDialogues(page);
  await ev(page, `${ui}.closeMenu?.()`);
  // let the "new items" notice go before the screenshots
  await page.waitForTimeout(4500);
  await setActive(page, 'charizard');
  expect(await ev(page, dummy)).toBe(true);

  // Terastal: Fire Tera Type, crystal sheen + crown overlays, the body keeps its normal size
  await page.waitForTimeout(400);
  const scale0 = await ev<number>(page, `${view}.body.scaleY`);
  await page.keyboard.press('y');
  await page.waitForFunction(() => !!(window as Win).__adv.teraUnit);
  expect(await ev(page, `(() => { const u = ${lead}; return [u.types, u.tera.from]; })()`)).toEqual([['fire'], ['fire', 'flying']]);
  await page.waitForTimeout(500);
  expect(await ev(page, `(() => { const v = ${view}; return !!v.fx && !!v.fx.crown && !!v.fx.sheen && v.fx.sheen.frame.name === v.body.frame.name; })()`)).toBe(true);
  expect(await ev<number>(page, `${view}.body.scaleY`)).toBeCloseTo(scale0, 1);
  expect(await ev(page, `${ui}.texts.tera.text`)).toContain('TERA');
  await page.screenshot({ path: test.info().outputPath('tera.png') });
  await ev(page, `window.__adv.endTera(false)`);

  // Gigantamax: HP ×2, the animated body grows to G-Max Charizard's height (28 m → ×4.48), red clouds above it
  const hp0 = await ev<number>(page, `${lead}.maxHp`);
  await page.keyboard.press('b');
  await page.waitForFunction(() => !!(window as Win).__adv.dynaUnit);
  expect(await ev(page, `${lead}.dyna.gmax`)).toBe(true);
  expect(await ev<number>(page, `${lead}.maxHp`)).toBe(hp0 * 2);
  await page.waitForFunction((v) => Math.abs(eval(v + '.grow') - 4.48) < 0.02, view, { timeout: 5000 });
  expect(await ev<number>(page, `${view}.body.scaleY`) / scale0).toBeCloseTo(4.48, 1);
  expect(await ev<number>(page, `${view}.fx.clouds.length`)).toBe(12);
  expect(await ev(page, `${view}.body.anims.isPlaying`)).toBe(true);
  expect(await ev(page, `${ui}.texts.dyna.text`)).toContain('GIGANTAMAX');
  await page.screenshot({ path: test.info().outputPath('gigantamax.png') });
  await ev(page, `window.__adv.endDynamax(false)`);
  await page.waitForFunction((v) => Math.abs(eval(v + '.grow') - 1) < 0.02, view, { timeout: 5000 });
  expect(await ev<number>(page, `${lead}.maxHp`)).toBe(hp0);

  // Primal Reversion: Kyogre with the Blue Orb in the bag reverts on its own in the fight, drawn 9.8 / 4.5 its size
  await setActive(page, 'kyogre');
  await page.waitForFunction(() => (window as Win).__adv.world.allies.some((u: Win) => u.defId === 'kyogre-primal'), undefined, { timeout: 5000 });
  expect(await ev(page, `${lead}.name`)).toBe('Primal Kyogre');
  await page.waitForTimeout(600);
  await page.screenshot({ path: test.info().outputPath('primal-kyogre.png') });
  // the fight ends → back to Kyogre after the idle delay
  await ev(page, `window.__adv.world.enemies.forEach(e => { e.alive = false; })`);
  await page.waitForFunction(() => (window as Win).__adv.world.allies.some((u: Win) => u.defId === 'kyogre'), undefined, { timeout: 20_000 });
  expect(errors).toEqual([]);
});
