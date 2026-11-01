import { expect, test, type Page } from '@playwright/test';

// Battle-feature buttons (Mega / Tera / Dynamax / weather call) in the bottom-right corner, on a desktop, a portrait
// and a landscape phone: a square with an icon per feature, ready / in use (time left) / recharging, click or tap = use.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;
for (const v of [{ name: 'desktop', viewport: { width: 1280, height: 720 }, m: false }, { name: 'portrait', viewport: { width: 390, height: 844 }, m: true }, { name: 'landscape', viewport: { width: 844, height: 390 }, m: true }]) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport, hasTouch: v.m, isMobile: v.m });
    test('gimmick bar', async ({ page }, info) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
      await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
      await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'ca-mau' && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
      for (let i = 0; i < 20 && (await ev<boolean>(page, `!!${ui}.dialogueLayer`)); i++) { await ev(page, `window.__adv.interact()`); await page.waitForTimeout(150); }
      await ev(page, `(() => { const a = window.__adv, s = a.state; s.addItems({ 'key-stone': 1, 'tera-orb': 1, 'dynamax-band': 1 });
        const p = s.addPokemon('pelipper', 40, 'caught'); p.abilitySlot = 1;
        if (!s.inParty(p.uid)) s.togglePartyMember(p.uid); s.adv.activeUid = p.uid; a.applyParty(); })()`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: info.outputPath('ready.png') });
      // click / tap the weather square: Pelipper calls rain
      const box = await ev<{ x: number; y: number }>(page, `(() => { const b = ${ui}.gimmicks.bounds('weather'), cv = window.__phaser.canvas, r = cv.getBoundingClientRect();
        return { x: r.left + (b.x + b.w / 2) * r.width / cv.width, y: r.top + (b.y + b.h / 2) * r.height / cv.height }; })()`);
      if (v.m) await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y);
      await page.waitForFunction(() => (window as Win).__adv.world.battleWeather?.kind === 'rain', undefined, { timeout: 5000 });
      await ev(page, `(() => { const a = window.__adv; a.megaCd = 70;
        const w = a.world, t = w.trainer; const foe = w.spawnWild('geodude', 30, t.x + 160, t.y, { hostile: true }); foe.target = w.allies[0]; w.allies[0].target = foe; })()`);
      await page.waitForTimeout(600);
      await ev(page, `window.__adv.tryTera()`);
      await page.waitForTimeout(1500);
      expect(await ev(page, `${ui}.gimmicks.viewOf('tera')?.state`)).toBe('active');
      expect(await ev(page, `${ui}.gimmicks.viewOf('mega')?.state`)).toBe('cooldown');
      expect(await ev(page, `${ui}.gimmicks.viewOf('weather')?.state`)).toBe('active');
      // all four squares on screen, none covering another
      const rects = await ev<{ x: number; y: number; w: number; h: number }[]>(page, `['mega','tera','dyna','weather'].map((id) => ${ui}.gimmicks.bounds(id))`);
      const [W, H] = await ev<[number, number]>(page, `[${ui}.scale.width, ${ui}.scale.height]`);
      for (const r of rects) expect(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H).toBe(true);
      for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
      await page.screenshot({ path: info.outputPath('active.png') });
      expect(errors).toEqual([]);
    });
  });
}
