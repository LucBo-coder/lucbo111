import { expect, test, type Page } from '@playwright/test';

// Main menu "Có gì mới" (data/whatsnew.json): a button in the top-right corner that stays clear of the title, the
// subtitle and the player card on desktop and phones; a red count of unread notes; the list opens, scrolls, every
// note title is there; once opened the count is gone, also after a reload.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

/** The What's-new button, the title / subtitle texts it must not cover, and the red count (if any). */
const CORNER = `(() => {
  const sc = window.__phaser.scene.getScene('Menu'), W = sc.scale.width, H = sc.scale.height;
  const r = (o) => { const b = o.getBounds(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom }; };
  let btn = null; const texts = [];
  const walk = (list) => { for (const o of list) {
    if (o.type === 'Container') {
      const label = o.list.find((c) => c.type === 'Text'), zone = o.list.find((c) => c.type === 'Zone');
      if (label && zone && /✨/.test(label.text)) btn = r(zone); else walk(o.list);
    } else if (o.type === 'Text') texts.push({ t: o.text, b: r(o) });
  } };
  walk(sc.children.list);
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
  const covered = btn ? texts.filter((t) => /POKÉMON SURVIVOR|Auto-Battle|Ô \\d/.test(t.t) && hit(btn, t.b)).map((t) => t.t) : [];
  const count = texts.find((t) => /^\\d+$/.test(t.t) && btn && hit(btn, t.b));
  return { W, H, btn, covered, count: count ? Number(count.t) : 0 };
})()`;

for (const [name, viewport] of [['desktop', { width: 1280, height: 720 }], ['portrait', { width: 390, height: 844 }], ['landscape', { width: 844, height: 390 }]] as const) {
  test(`what's new (${name}): top-right button clear of the title, unread count, list scrolls, read after opening`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize(viewport);
    await page.goto('/?debug');
    await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
    await page.waitForTimeout(900);
    const c = await ev<{ W: number; H: number; btn: { x: number; y: number; right: number; bottom: number } | null; covered: string[]; count: number }>(page, CORNER);
    expect(c.btn).not.toBeNull();
    // in the top-right corner, on screen
    expect(c.btn!.right).toBeLessThanOrEqual(c.W + 1);
    expect(c.btn!.y).toBeGreaterThanOrEqual(-1);
    expect(c.btn!.x).toBeGreaterThan(c.W / 2);
    expect(c.btn!.bottom).toBeLessThan(c.H / 4);
    expect(c.covered).toEqual([]);
    expect(c.count).toBeGreaterThan(0);
    await page.screenshot({ path: test.info().outputPath(`menu-${name}.png`) });

    // open: every note title is listed, the newest are tagged MỚI
    await page.mouse.click((c.btn!.x + c.btn!.right) / 2, (c.btn!.y + c.btn!.bottom) / 2);
    await page.waitForFunction(() => (window as Win).__phaser.scene.getScene('Menu').view === 'whatsnew');
    const list = await ev<{ titles: string[]; fresh: number }>(page, `(() => {
      const sc = window.__phaser.scene.getScene('Menu'), all = [];
      const walk = (l) => { for (const o of l) { if (o.type === 'Container') walk(o.list); else if (o.type === 'Text') all.push(o.text); } };
      walk(sc.children.list);
      return { titles: all, fresh: all.filter((t) => t === 'MỚI').length };
    })()`);
    for (const t of ['Đền huyền thoại', 'Giao diện điện thoại', 'Việt Nam Odyssey 2.0']) expect(list.titles).toContain(t);
    expect(list.fresh).toBe(c.count);
    await page.screenshot({ path: test.info().outputPath(`whatsnew-${name}.png`) });
    // the list is longer than the frame: scrolling moves it, never past either end
    const y0 = await ev<number>(page, `(() => { const sc = window.__phaser.scene.getScene('Menu'); return sc.children.list.find((o) => o.type === 'Container' && o.mask).y; })()`);
    expect(y0).toBe(0);
    await ev(page, `window.__phaser.scene.getScene('Menu').scrollList?.(300)`);
    const y1 = await ev<number>(page, `window.__phaser.scene.getScene('Menu').children.list.find((o) => o.type === 'Container' && o.mask).y`);
    expect(y1).toBeLessThan(0);
    await ev(page, `window.__phaser.scene.getScene('Menu').scrollList?.(-99999)`);
    expect(await ev<number>(page, `window.__phaser.scene.getScene('Menu').children.list.find((o) => o.type === 'Container' && o.mask).y`)).toBe(0);

    // back home: no count any more, also after a reload
    await page.keyboard.press('Escape');
    await page.waitForTimeout(900);
    expect((await ev<{ count: number }>(page, CORNER)).count).toBe(0);
    await page.reload();
    await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
    await page.waitForTimeout(900);
    expect((await ev<{ count: number }>(page, CORNER)).count).toBe(0);
  });
}
