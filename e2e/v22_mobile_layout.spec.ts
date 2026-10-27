import { expect, test, type Page } from '@playwright/test';

// V22 phone layout: on a 390×844 portrait phone and an 844×390 landscape one, the buttons of the main menu stay on
// screen and never overlap, every button label fits its button, the HUD texts stay inside their boxes and the
// map tab's region list does not draw one line over another.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

/** Button problems in a scene: off screen, overlapping another button, or a label wider than its button. */
const BUTTONS = (scene: string) => `(() => {
  const sc = window.__phaser.scene.getScene('${scene}'), W = sc.scale.width, H = sc.scale.height, out = [];
  const btns = [];
  const walk = (list) => { for (const o of list) {
    if (o.type === 'Container' && o.visible) {
      const zone = o.list.find((c) => c.type === 'Zone'), label = o.list.find((c) => c.type === 'Text');
      if (zone && label && o.list.length === 3) btns.push({ r: zone.getBounds(), label });
      else walk(o.list);
    }
  } };
  walk(sc.children.list);
  for (const b of btns) {
    const n = b.label.text, r = b.r;
    if (r.x < -1 || r.right > W + 1 || r.y < -1 || r.bottom > H + 1) out.push('off screen: ' + n);
    if (b.label.width > r.width + 1) out.push('label wider than button: ' + n);
  }
  for (let i = 0; i < btns.length; i++) for (let j = i + 1; j < btns.length; j++) {
    const a = btns[i].r, b = btns[j].r;
    const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x), iy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
    if (ix > 2 && iy > 2) out.push('overlap: ' + btns[i].label.text + ' / ' + btns[j].label.text);
  }
  return { n: btns.length, out };
})()`;

for (const [name, viewport] of [['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]] as const) {
  test.describe(`phone ${name}`, () => {
    test.use({ viewport, hasTouch: true, isMobile: true });

    test('main menu and starter select: buttons on screen, apart, labels fit', async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto('/?debug');
      await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
      await page.waitForTimeout(800); // slide-in tweens
      const home = await ev<{ n: number; out: string[] }>(page, BUTTONS('Menu'));
      expect(home.n).toBeGreaterThanOrEqual(8);
      expect(home.out).toEqual([]);
      await ev(page, `window.__phaser.scene.getScene('Menu').go('survivor')`);
      await page.waitForTimeout(800);
      expect((await ev<{ out: string[] }>(page, BUTTONS('Menu'))).out).toEqual([]);
    });

    test('adventure HUD texts stay in their boxes; the map tab list does not overlap', async ({ page }) => {
      test.setTimeout(90_000);
      await page.goto('/?debug');
      await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
      await ev(page, `window.__phaser.scene.getScene('Menu').startAdventure(true)`);
      await page.waitForFunction(() => (window as Win).__adv?.world && (window as Win).__phaser.scene.isActive('AdvUI'));
      await ev(page, `(() => { const a = window.__adv; for (const s of ['charizard', 'pikachu', 'bulbasaur']) a.state.addPokemon(s, 30, 'gift'); a.applyParty(); })()`);
      await page.waitForTimeout(800);
      const hud = await ev<string[]>(page, `(() => {
        const ui = window.__phaser.scene.getScene('AdvUI'), s = ui.s, right = 12 * s + 210 * s, out = [];
        for (const [k, t] of Object.entries(ui.texts)) if ((k === 'hp' || /^p\\d$/.test(k)) && t.getBounds().right > right + 1) out.push(k + ': ' + t.text);
        return out;
      })()`);
      expect(hud).toEqual([]);
      expect((await ev<{ out: string[] }>(page, BUTTONS('AdvUI'))).out).toEqual([]);
      // map tab: the region names and their hints are stacked without overlapping and inside the panel
      await ev(page, `window.__phaser.scene.getScene('AdvUI').openMenu('map')`);
      await page.waitForTimeout(400);
      const list = await ev<string[]>(page, `(() => {
        const ui = window.__phaser.scene.getScene('AdvUI'), H = ui.scale.height, out = [];
        const all = [];
        const walk = (l) => { for (const o of l) { if (o.type === 'Container') walk(o.list); else if (o.type === 'Text' && o.visible && o.text) all.push(o); } };
        walk(ui.menu.list);
        const i = all.findIndex((t) => t.text === 'CÁC VÙNG' || t.text === 'HÀNH TRÌNH VIỆT NAM');
        const rows = all.slice(i).filter((t) => t.x < ui.scale.width).sort((a, b) => a.getBounds().y - b.getBounds().y);
        for (let k = 1; k < rows.length; k++) if (rows[k].getBounds().y < rows[k - 1].getBounds().bottom - 2 && Math.abs(rows[k].x - rows[k - 1].x) < 30) out.push('overlap: ' + rows[k].text.slice(0, 30));
        for (const t of rows) if (t.getBounds().bottom > H) out.push('below the screen: ' + t.text.slice(0, 30));
        return out;
      })()`);
      expect(list).toEqual([]);
    });
  });
}
