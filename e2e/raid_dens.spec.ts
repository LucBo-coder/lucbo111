import { expect, test } from '@playwright/test';
type Win = Record<string, any>;
// V32: random raid dens — a den with its light column, a G-Max raid with a barrier shield, the catch phase and the
// rewards; then a raid lost on time. Screenshots: the den, the fight, the Gigantamax art.
test('raid dens: G-Max raid won and caught, Tera raid lost on time', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.evaluate(() => { void (window as Win).__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam'); });
  await page.waitForFunction(() => (window as Win).__adv?.raidDens && (window as Win).__phaser.scene.isActive('AdvUI'));
  for (let i = 0; i < 20; i++) {
    if (!await page.evaluate(() => !!(window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer)) break;
    await page.keyboard.press('e'); await page.waitForTimeout(200);
  }
  const den = await page.evaluate(() => {
    const a = (window as Win).__adv, t = a.world.trainer;
    a.worldEvents.cleanupAll();
    a.raidDens.cleanup();
    a.state.addItems({ 'dynamax-band': 1 });
    const d = a.raidDens.spawnDen({ stars: 4, kind: 'gmax', species: 'charizard', x: t.x + 150, y: t.y - 40 });
    (window as Win).__den = d;
    return { stars: d.stars, kind: d.kind, markers: a.raidDens.markers().length, interact: !!a.interactables.get('raidden-' + d.id) };
  });
  expect(den).toEqual({ stars: 4, kind: 'gmax', markers: 1, interact: true });
  await page.waitForTimeout(600);
  await page.screenshot({ path: test.info().outputPath('raid-den.png') });

  const fight = await page.evaluate(() => {
    const a = (window as Win).__adv, d = (window as Win).__den;
    a.raidDens.start(d);
    const u = d.boss;
    return { gmax: u.dyna?.gmax, hostile: u.hostile, noCapture: u.noCapture, state: d.state, hud: a.raidDens.hudLine() };
  });
  expect(fight.gmax).toBe(true); expect(fight.hostile).toBe(true); expect(fight.noCapture).toBe(true);
  expect(fight.state).toBe('fight'); expect(fight.hud).toContain('RAID');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: test.info().outputPath('raid-fight.png') });

  const phases = await page.evaluate(() => {
    const a = (window as Win).__adv, d = (window as Win).__den, u = d.boss;
    u.hp = u.maxHp * 0.55; a.raidDens.update(0.05);
    const shield = { up: u.shield > 0, idx: d.shieldIdx };
    u.shield = 0; u.hp = u.maxHp * 0.2; a.raidDens.update(0.05);
    return { shield, state: d.state, noCapture: u.noCapture, dyna: !!u.dyna };
  });
  expect(phases).toEqual({ shield: { up: true, idx: 1 }, state: 'catch', noCapture: false, dyna: false });

  const won = await page.evaluate(() => {
    const a = (window as Win).__adv, d = (window as Win).__den, u = d.boss;
    const soup = a.state.item('max-soup'), money = a.state.money;
    a.captureFx = { target: u, ballId: 'pokeball', ball: a.add.rectangle(u.x, u.y, 10, 10, 0xffffff) };
    a.world.beginCapture(u); a.finishCapture(true);
    const p = a.state.save.collection.at(-1);
    return { species: p.species, gmax: p.gmax, soup: a.state.item('max-soup') - soup, paid: a.state.money > money, dens: a.raidDens.list().length };
  });
  expect(won).toEqual({ species: 'charizard', gmax: true, soup: 1, paid: true, dens: 0 });

  // the caught Charizard Gigantamaxes with its own G-Max art
  for (let i = 0; i < 20; i++) {
    if (!await page.evaluate(() => !!(window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer)) break;
    await page.keyboard.press('e'); await page.waitForTimeout(200);
  }
  await page.evaluate(() => {
    const a = (window as Win).__adv, p = a.state.save.collection.at(-1);
    p.shiny = false; a.state.adv.party = [p.uid]; a.state.adv.activeUid = p.uid; a.state.adv.recalled = []; a.applyParty();
    const u = a.world.allies.find((x: Win) => x.ownerUid === p.uid);
    a.world.dynamax(u, true);
  });
  await page.waitForTimeout(1500);
  const art = await page.evaluate(() => (window as Win).__phaser.textures.exists('gmax-charizard'));
  expect(art).toBe(true);
  // its animation sheet (idle / attack / hurt) is drawn from the picture and plays on the field
  const anim = await page.evaluate(() => {
    const a = (window as Win).__adv, p = a.state.save.collection.at(-1);
    const u = a.world.allies.find((x: Win) => x.ownerUid === p.uid);
    const v = a.renderer_.views.get(u.id);
    const g = (window as Win).__phaser;
    return { idle: g.anims.exists('gmax-charizard-anim:idle'), attack: g.anims.exists('gmax-charizard-anim:attack'), frames: g.textures.get('gmax-charizard-anim').frameTotal, playing: v?.fx?.art?.anims.currentAnim?.key };
  });
  expect(anim).toEqual({ idle: true, attack: true, frames: 15, playing: 'gmax-charizard-anim:idle' });
  await page.waitForTimeout(2800); // the reward panel fades out
  await page.screenshot({ path: test.info().outputPath('gmax-art.png') });
  await page.evaluate(() => {
    const a = (window as Win).__adv, p = a.state.save.collection.at(-1);
    const u = a.world.allies.find((x: Win) => x.ownerUid === p.uid);
    a.renderer_.views.get(u.id).fx.art.play('gmax-charizard-anim:attack', true);
    a.renderer_.views.get(u.id).fx.art.anims.pause();
    a.renderer_.views.get(u.id).fx.art.anims.setCurrentFrame(a.renderer_.views.get(u.id).fx.art.anims.currentAnim.frames[2]);
  });
  await page.waitForTimeout(100);
  await page.screenshot({ path: test.info().outputPath('gmax-attack.png') });
  await page.evaluate(() => {
    const a = (window as Win).__adv, p = a.state.save.collection.at(-1);
    const u = a.world.allies.find((x: Win) => x.ownerUid === p.uid);
    a.renderer_.views.get(u.id).fx.art.anims.resume();
  });

  const lost = await page.evaluate(() => {
    const a = (window as Win).__adv, t = a.world.trainer;
    const d = a.raidDens.spawnDen({ stars: 2, kind: 'tera', x: t.x - 150, y: t.y + 40 });
    a.raidDens.start(d);
    const boss = d.boss;
    d.left = 0.01; a.raidDens.update(0.05);
    return { dens: a.raidDens.list().length, bossGone: !a.world.enemies.includes(boss) || !boss.alive };
  });
  expect(lost).toEqual({ dens: 0, bossGone: true });
  expect(errors).toEqual([]);
});
