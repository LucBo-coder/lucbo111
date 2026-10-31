import { expect, test, type Page } from '@playwright/test';

// In-game guide: K / F1 / the "?" HUD button open the "Hướng dẫn" tab (key table + how-to pages), on desktop and phones.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;

async function start(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'ca-mau' && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
  for (let i = 0; i < 20 && (await ev<boolean>(page, `!!${ui}.dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
}

test('K / F1 open the guide; every page renders', async ({ page }, info) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await start(page);
  await page.screenshot({ path: info.outputPath('hud.png') });
  await page.keyboard.press('k');
  expect(await ev(page, `${ui}.menuTab`)).toBe('help');
  for (let i = 0; i < 7; i++) { // HELP_PAGES
    await ev(page, `(() => { const u = ${ui}; u.helpPage = ${i}; u.openMenu('help'); })()`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: info.outputPath(`help-${i}.png`) });
  }
  await page.keyboard.press('k');
  expect(await ev(page, `${ui}.menuTab`)).toBe(null);
  await page.keyboard.press('F1');
  expect(await ev(page, `${ui}.menuTab`)).toBe('help');
  expect(errors).toEqual([]);
});

test.describe('phone (portrait)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('the "?" button opens the guide and the key table fits', async ({ page }, info) => {
    test.setTimeout(90_000);
    await start(page);
    await page.screenshot({ path: info.outputPath('hud-portrait.png') });
    await ev(page, `${ui}.toggleMenu('help')`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: info.outputPath('help-portrait-keys.png') });
    await ev(page, `(() => { const u = ${ui}; u.helpPage = 1; u.openMenu('help'); })()`);
    await page.waitForTimeout(150);
    await page.screenshot({ path: info.outputPath('help-portrait-touch.png') });
    expect(await ev(page, `${ui}.menuTab`)).toBe('help');
  });
});

test('O opens the PC; letters typed in a text box are not hotkeys', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await page.keyboard.press('o');
  expect(await ev(page, `${ui}.menuTab`)).toBe('pc');
  await ev(page, `(() => { const i = document.createElement('input'); i.id = 't-input'; document.body.appendChild(i); i.focus(); })()`);
  await page.keyboard.type('xjmio');
  expect(await ev(page, `${ui}.menuTab`)).toBe('pc');
  expect(await ev(page, `document.getElementById('t-input').value`)).toBe('xjmio');
  await ev(page, `document.getElementById('t-input').remove()`);
  await page.keyboard.press('x');
  expect(await ev(page, `${ui}.menuTab`)).toBe('dex');
});

test('journal: a later step done early shows ticked, a partial one its count', async ({ page }, info) => {
  test.setTimeout(90_000);
  await start(page);
  // "Vào rừng U Minh": the ranger station activated early → ticked while the quest is still on its first step
  await ev(page, `(() => { const a = window.__adv, s = a.state, qs = s.quests;
    for (const id of ['vn-cm-1', 'mn-cm-1', 'mn-cm-2']) qs.states[id] = { status: 'completed', step: 9, progress: 0 };
    qs.refresh(); s.startQuest('vn-cm-2'); s.trackedQuest = 'vn-cm-2';
    a.questEvent({ type: 'activate', target: 'wp-cm-uminh' }); })()`);
  expect(await ev(page, `window.__adv.state.quests.objectiveProgress('vn-cm-2', 2)`)).toBe(1);
  expect(await ev(page, `window.__adv.state.quests.states['vn-cm-2'].step`)).toBe(0);
  await ev(page, `(() => { const u = ${ui}; u.questFilter = 'all'; u.selected.quest = 'vn-cm-2'; u.openMenu('quests'); })()`);
  await page.waitForTimeout(300);
  const lines = await ev<string[]>(page, `${ui}.menu.list.filter(o => o.type === 'Text').map(o => o.text)`);
  expect(lines.some((t) => t.startsWith('☑') && t.includes('Trạm kiểm lâm U Minh'))).toBe(true);
  expect(lines.some((t) => t.startsWith('▶') && t.includes('Rừng Ngập Mặn'))).toBe(true);
  await page.screenshot({ path: info.outputPath('journal-early.png') });
});
