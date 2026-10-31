import { expect, test } from '@playwright/test';
type Win = Record<string, any>;
test('Tera raid crystal, capture traits, rewards and party details', async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await page.evaluate(() => { void (window as Win).__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam'); });
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'ca-mau' && (window as Win).__phaser.scene.isActive('AdvUI'));
  for (let i = 0; i < 20; i++) {
    if (!await page.evaluate(() => !!(window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer)) break;
    await page.keyboard.press('e'); await page.waitForTimeout(200);
  }
  const raid = await page.evaluate(() => {
    const a = (window as Win).__adv;
    a.worldEvents.cleanupAll();
    const region = a.worldEvents.unlockedRegions()[0];
    const ev = a.worldEvents.force('teraRaid', region.id);
    const boss = a.world.enemies.find((u: Win) => u.tag === 'event:' + ev.uid && u.alive);
    if (!boss) throw new Error('Tera raid boss missing');
    a.world.teleport(boss.x + 160, boss.y + 100);
    (window as Win).__raid = boss;
    return { type: boss.tera.type, pick: boss.teraPick, blocked: boss.noCapture, view: a.worldEvents.views()[0].name };
  });
  expect(raid.type).toBe(raid.pick); expect(raid.blocked).toBe(true); expect(raid.view).toContain('Tera Raid');
  await page.waitForTimeout(400);
  await page.screenshot({ path: test.info().outputPath('tera-raid.png') });
  const caught = await page.evaluate(() => {
    const a = (window as Win).__adv, u = (window as Win).__raid;
    u.hp = u.maxHp * 0.1; a.worldEvents.update(0);
    if (u.noCapture || u.tera) throw new Error('Tera shield did not break');
    const before = a.state.item('tera-shard');
    a.captureFx = { target: u, ballId: 'pokeball', ball: a.add.rectangle(u.x, u.y, 10, 10, 0xffffff) };
    a.world.beginCapture(u); a.finishCapture(true); a.worldEvents.update(0);
    const p = a.state.save.collection.at(-1);
    (window as Win).__caught = p;
    return { type: p.teraType, slot: p.abilitySlot, bossSlot: u.abilitySlot, shards: a.state.item('tera-shard') - before, active: a.worldEvents.views().filter((e: Win) => e.type === 'teraRaid').length };
  });
  expect(caught.type).toBe(raid.type); expect(caught.slot).toBe(caught.bossSlot);
  expect(caught.shards).toBe(10); expect(caught.active).toBe(0);
  await page.evaluate(() => {
    const a = (window as Win).__adv, p = (window as Win).__caught;
    a.state.adv.party = [p.uid]; a.state.adv.activeUid = p.uid; a.state.adv.recalled = []; a.applyParty();
    a.ui.openMenu('party');
  });
  await page.waitForTimeout(500);
  const text = await page.evaluate(() => {
    const ui = (window as Win).__phaser.scene.getScene('AdvUI');
    const collect = (x: Win): string[] => [typeof x.text === 'string' ? x.text : '', ...(x.list ?? []).flatMap(collect)];
    return ui.children.list.flatMap(collect).join('\n');
  });
  expect(text).toContain('Ability:'); expect(text).toContain('Tera:');
  await page.screenshot({ path: test.info().outputPath('pokemon-traits.png') });
  expect(errors).toEqual([]);
});
