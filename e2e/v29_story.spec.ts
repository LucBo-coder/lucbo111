import { expect, test, type Page } from '@playwright/test';

// V29 story in the real game (Việt Nam Odyssey, Cà Mau): a quest's cutscene plays at a calm moment and can be
// skipped (and is kept for the journal), story people appear / leave with flags, a 'hold' encounter runs on the
// map and reports to the quest, a 'destroy' device breaks, and the journal's story page lists it all.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ready = (page: Page, map: string) => page.waitForFunction((m) => (window as Win).__adv?.map?.id === m && (window as Win).__adv.world && (window as Win).__phaser.scene.isActive('AdvUI'), map, { timeout: 20_000 });
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!${ui}.dialogueLayer`);
const dialogueTexts = (page: Page) => ev<string[]>(page, `(() => { const l = ${ui}.dialogueLayer; const out = []; const walk = (o) => { if (o.type === 'Text') out.push(o.text); (o.list ?? []).forEach(walk); }; if (l) walk(l); return out; })()`);
const menuTexts = (page: Page) => ev<string[]>(page, `${ui}.menu.list.filter(o => o.type === 'Text').map(o => o.text)
  .concat(${ui}.menu.list.filter(o => o.type === 'Container').flatMap(o => o.list.filter(x => x.type === 'Text').map(x => x.text)))`);
const SHOTS = process.env.V29_SHOTS;

test('Mạch Nguồn: cutscene, gated people, hold & destroy encounters, story journal', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await ready(page, 'ca-mau');
  await page.waitForTimeout(600);
  // a strong partner and a sturdy trainer (the test is about the story, not the fights)
  await ev(page, `(() => { const a = window.__adv; a.state.addPokemon('blaziken', 60, 'gift'); a.applyParty(); a.world.trainer.maxHp = a.world.trainer.hp = 1e7; })()`);
  expect(await ev(page, `window.__adv.story.story.title`)).toBe('Mạch Nguồn');

  // ── the first story quest: its cutscene opens by itself, "Bỏ qua cảnh" skips it ──
  await ev(page, `(() => { const s = window.__adv.state; s.quests.states['vn-cm-1'] = { status: 'completed', step: 3, progress: 0 }; s.quests.refresh(); s.startQuest('mn-cm-1'); })()`);
  await page.waitForFunction(() => !!(window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer, undefined, { timeout: 8000 });
  expect((await dialogueTexts(page)).join('\n')).toContain('Mạch Nguồn'); // narration: the cutscene's title
  // read the first page; the next / skip choice follows it
  for (let i = 0; i < 6 && !(await dialogueTexts(page)).some((t) => t.includes('Bỏ qua cảnh')); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  const first = (await dialogueTexts(page)).join('\n');
  expect(first).toContain('Bỏ qua cảnh');
  expect(first).toContain('Tiếp');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/story-cutscene.png` });
  await page.keyboard.press('2');
  await page.waitForTimeout(300);
  expect(await dialogueOpen(page)).toBe(false);
  expect(await ev(page, `window.__adv.state.adv.storySeen`)).toContain('mn-c-prologue');

  // ── story people: Khải stands near the town centre until the Cà Mau stage is over ──
  const khai = await ev<{ x: number; y: number }>(page, `(() => { const t = window.__adv.regionDef.trainers.find(t => t.id === 'mn-khai-ca-mau'); return { x: t.x, y: t.y }; })()`);
  await ev(page, `window.__adv.world.teleport(${khai.x} * 48 + 24, ${khai.y} * 48 + 120)`);
  await page.waitForFunction(() => (window as Win).__adv.interactables.has('mn-khai-ca-mau'), undefined, { timeout: 5000 });
  await ev(page, `window.__adv.state.adv.flags.push('mn:done:ca-mau')`);
  await page.waitForFunction(() => !(window as Win).__adv.interactables.has('mn-khai-ca-mau'), undefined, { timeout: 5000 });
  await ev(page, `(() => { const f = window.__adv.state.adv.flags; f.splice(f.indexOf('mn:done:ca-mau'), 1); })()`);
  await page.waitForFunction(() => (window as Win).__adv.interactables.has('mn-khai-ca-mau'), undefined, { timeout: 5000 });

  // ── 'hold' (mn-cm-2): stand in the ring with a Pokémon out; the waves come; holding long enough ends it ──
  await ev(page, `(() => { const s = window.__adv.state; s.quests.states['mn-cm-1'] = { status: 'completed', step: 4, progress: 0 }; s.adv.storySeen.push('mn-c-station', 'mn-c-nets', 'mn-c-amp'); s.quests.refresh(); s.startQuest('mn-cm-2'); s.quests.states['mn-cm-2'].step = 1; })()`);
  const hold = await ev<{ x: number; y: number }>(page, `window.__adv.state.quests.def('mn-cm-2').objectives[1].encounter`);
  await ev(page, `window.__adv.world.teleport(${hold.x} * 48 + 24, ${hold.y} * 48 + 24)`);
  await page.waitForFunction(() => (window as Win).__adv.story.run?.def.kind === 'hold', undefined, { timeout: 5000 });
  await page.waitForFunction(() => (window as Win).__adv.story.run.hold.t > 0.5 && (window as Win).__adv.story.run.spawned.length > 0, undefined, { timeout: 8000 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/story-hold.png` });
  await ev(page, `(() => { const r = window.__adv.story.run; r.hold.t = r.def.seconds - 0.5; })()`);
  await page.waitForFunction(() => (window as Win).__adv.state.quests.states['mn-cm-2'].step === 2, undefined, { timeout: 8000 });
  expect(await ev(page, `window.__adv.story.run`)).toBe(null);

  // ── 'destroy' (mn-cm-3): the device appears when close, breaking it advances the quest ──
  await ev(page, `(() => { const s = window.__adv.state; s.quests.states['mn-cm-2'] = { status: 'completed', step: 3, progress: 0 }; s.quests.states['vn-cm-2'] = { status: 'completed', step: 4, progress: 0 }; s.quests.refresh(); s.startQuest('mn-cm-3'); s.quests.states['mn-cm-3'].step = 1; })()`);
  const dev = await ev<{ x: number; y: number }>(page, `window.__adv.state.quests.def('mn-cm-3').objectives[1].encounter`);
  await ev(page, `window.__adv.world.teleport(${dev.x} * 48 + 24, ${dev.y} * 48 + 140)`);
  await page.waitForFunction(() => !!(window as Win).__adv.story.run?.device, undefined, { timeout: 8000 });
  expect(await ev(page, `window.__adv.story.run.device.name`)).toBe('Bộ khuếch đại Bình Minh');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/story-device.png` });
  // the Pokémon on the field fights it; the test lands the blows itself so a slow (software-WebGL, busy) machine
  // does not turn the fight into a timeout — breaking it must still go through the real "unit down" path
  for (let i = 0; i < 40 && (await ev<number>(page, `window.__adv.state.quests.states['mn-cm-3'].step`)) !== 2; i++) {
    await ev(page, `(() => { const a = window.__adv, d = a.story.run?.device; if (d?.alive) a.world.applyDamage(d, Math.ceil(d.maxHp / 3), a.world.allies[0]); })()`);
    await page.waitForTimeout(400);
  }
  expect(await ev(page, `window.__adv.state.quests.states['mn-cm-3'].step`)).toBe(2);

  // ── journal: "Chính" lists the story quests, the story page shows the acts and the cutscenes to watch again ──
  await ev(page, `(() => { const u = ${ui}; u.questFilter = 'main'; u.openMenu('quests'); })()`);
  await page.waitForTimeout(300);
  expect((await menuTexts(page)).join('\n')).toContain('Khu làm tổ của Seviper');
  await ev(page, `(() => { const u = ${ui}; u.questFilter = 'story'; u.openMenu('quests'); })()`);
  await page.waitForTimeout(300);
  const story = (await menuTexts(page)).join('\n');
  expect(story).toContain('MẠCH NGUỒN');
  expect(story).toContain('Mở đầu — Đất Mũi');
  expect(story).toContain('Mạch Nguồn'); // the prologue cutscene, ready to watch again
  expect(story).toContain('Linh');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/story-journal.png` });
  // watching again from the journal opens it without touching progress
  await ev(page, `(() => { ${ui}.closeMenu(); void window.__adv.story.play('mn-c-prologue', true); })()`);
  await page.waitForFunction(() => !!(window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer, undefined, { timeout: 4000 });
  for (let i = 0; i < 6 && (await dialogueOpen(page)); i++) { await page.keyboard.press((await dialogueTexts(page)).some((t) => t.includes('Bỏ qua cảnh')) ? '2' : 'e'); await page.waitForTimeout(250); }
  expect(await dialogueOpen(page)).toBe(false);
  expect(errors).toEqual([]);
});

test('Quần Đảo Khởi Nguyên: the survey chief waits in the valley and the first chapter starts', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1)`);
  await ready(page, 'starter-valley');
  await page.waitForTimeout(600);
  expect(await ev(page, `window.__adv.story.story.title`)).toBe('Quần Đảo Khởi Nguyên');
  await ev(page, `(() => { const s = window.__adv.state; s.quests.states['q-main-1'] = { status: 'completed', step: 3, progress: 0 }; s.quests.refresh(); })()`);
  expect(await ev(page, `window.__adv.state.quests.states['ck-1a'].status`)).toBe('available');
  const k = await ev<{ x: number; y: number }>(page, `(() => { const n = window.__adv.regionDef.npcs.find(n => n.id === 'ck-khue-starter-valley'); return { x: n.x, y: n.y }; })()`);
  await ev(page, `window.__adv.world.teleport(${k.x} * 48 + 24, ${k.y} * 48 + 120)`);
  await page.waitForFunction(() => (window as Win).__adv.interactables.has('ck-khue-starter-valley'), undefined, { timeout: 5000 });
  await ev(page, `(() => { const it = window.__adv.interactables.get('ck-khue-starter-valley'); window.__adv.world.teleport(it.x, it.y + 40); })()`);
  await page.waitForTimeout(300);
  expect(await ev(page, `window.__adv.nearest?.id`)).toBe('ck-khue-starter-valley');
  await page.keyboard.press('e');
  await page.waitForTimeout(300);
  // read the offer, accept (choice 1); the chapter's cutscene follows
  for (let i = 0; i < 8 && (await ev(page, `window.__adv.state.quests.states['ck-1a'].status`)) !== 'active'; i++) {
    await page.keyboard.press((await dialogueTexts(page)).some((t) => /Nhận nhiệm vụ/.test(t)) ? '1' : 'e');
    await page.waitForTimeout(250);
  }
  expect(await ev(page, `window.__adv.state.quests.states['ck-1a'].status`)).toBe('active');
  await page.waitForFunction(() => (window as Win).__adv.state.adv.storySeen.includes('ck-c-1'), undefined, { timeout: 8000 });
  for (let i = 0; i < 10 && (await dialogueOpen(page)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(250); }
  expect(errors).toEqual([]);
});
