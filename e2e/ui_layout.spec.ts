import { expect, test, type Page } from '@playwright/test';

// Menu layout audit: every tab of the Adventure menu on a desktop, a portrait phone and a landscape phone, with a
// full party and a bag holding every item. Text must stay inside the menu panel and two labels must not cover each
// other. Screenshots of every tab go to the test output folder.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;

async function start(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'ca-mau' && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
  for (let i = 0; i < 20 && (await ev<boolean>(page, `!!${ui}.dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
  await ev(page, `(() => { const s = window.__adv.state;
    const all = {}; for (const k of Object.keys(window.__advItems ?? {})) all[k] = 3;
    s.addItems(all);
    for (const [sp, lv] of [['charizard', 62], ['blastoise', 58], ['venusaur', 55], ['pikachu', 30], ['crobat', 47]]) {
      const p = s.addPokemon(sp, lv, 'caught'); if (!s.inParty(p.uid) && s.party().length < 6) s.togglePartyMember(p.uid);
    } })()`);
}

/** Visible menu texts in canvas pixels; overflow = outside the panel, overlap = two texts covering each other. */
const AUDIT = `(() => {
  const u = ${ui}, out = [], overlaps = [];
  const W = u.scale.width, H = u.scale.height;
  const texts = [];
  const walk = (o, vis) => {
    if (!o || !o.visible || o.alpha === 0) return;
    if (o.type === 'Text' && o.text.trim()) { const b = o.getBounds(); texts.push({ t: o.text.slice(0, 40), x: b.x, y: b.y, w: b.width, h: b.height }); }
    if (o.list) for (const ch of o.list) walk(ch, vis);
  };
  walk(u.menu);
  for (const a of texts) if (a.x < -1 || a.y < -1 || a.x + a.w > W + 1 || a.y + a.h > H + 1) out.push(a.t);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    // stroke padding makes neighbours touch; a real overlap covers a good part of the smaller label
    if (ix > 4 && iy > Math.min(a.h, b.h) * 0.45) overlaps.push(a.t + ' ⟷ ' + b.t);
  }
  return { out, overlaps };
})()`;

const TABS = ['party', 'pc', 'dex', 'bag', 'quests', 'events', 'map', 'passport', 'help', 'settings'];
const VIEWS = [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, mobile: false },
  { name: 'portrait', viewport: { width: 390, height: 844 }, mobile: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, mobile: true },
];

for (const v of VIEWS) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport, hasTouch: v.mobile, isMobile: v.mobile });
    test(`menu tabs fit (${v.name})`, async ({ page }, info) => {
      test.setTimeout(150_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await start(page);
      await page.screenshot({ path: info.outputPath('hud.png') });
      const report: Record<string, { out: string[]; overlaps: string[] }> = {};
      const tabs = [...TABS, 'bag:1', 'bag:2', 'bag:3', 'bag:4', 'bag:5', 'party:detail'];
      for (const t of tabs) {
        const [tab, arg] = t.split(':');
        await ev(page, `(() => { const u = ${ui};
          if ('${tab}' === 'bag' && '${arg ?? ''}') u.bagCat = u.bagCats()[${Number(arg) || 0}].id;
          if ('${arg}' === 'detail') u.selected.party = window.__adv.state.party()[0]?.uid;
          u.openMenu('${tab}'); })()`);
        await page.waitForTimeout(200);
        await page.screenshot({ path: info.outputPath(`${t.replace(':', '-')}.png`) });
        report[t] = await ev(page, AUDIT);
      }
      await info.attach('layout.json', { body: JSON.stringify(report, null, 1), contentType: 'application/json' });
      const bad = Object.entries(report).filter(([, r]) => r.out.length || r.overlaps.length);
      console.log(`[${v.name}]`, JSON.stringify(Object.fromEntries(bad), null, 1));
      expect(errors).toEqual([]);
      expect(bad.map(([t, r]) => `${t}: ${[...r.out.map((o) => 'tràn ' + o), ...r.overlaps].join(' | ')}`)).toEqual([]);
    });
  });
}
