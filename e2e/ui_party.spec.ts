import { expect, test, type Page } from '@playwright/test';

// Party screen: only the 6 travelling Pokémon (the rest stays in the PC), Tera Type badge in the details, and an
// evolution strip with a "Tiến hóa" button when the Pokémon meets its conditions. Desktop, portrait and landscape.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const menuTexts = `(() => { const out = []; const walk = (o) => { if (!o || !o.visible) return; if (o.type === 'Text' && o.text.trim()) out.push(o.text); if (o.list) o.list.forEach(walk); }; walk(${ui}.menu); return out; })()`;

for (const v of [
  { name: 'desktop', viewport: { width: 1280, height: 720 }, m: false },
  { name: 'portrait', viewport: { width: 390, height: 844 }, m: true },
  { name: 'landscape', viewport: { width: 844, height: 390 }, m: true },
]) {
  test.describe(v.name, () => {
    test.use({ viewport: v.viewport, hasTouch: v.m, isMobile: v.m });
    test('party shows the team of 6, Tera badge and the evolution strip', async ({ page }, info) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(String(e)));
      await page.goto('/');
      await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
      await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 1, 'vietnam')`);
      await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'ca-mau' && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
      for (let i = 0; i < 20 && (await ev<boolean>(page, `!!${ui}.dialogueLayer`)); i++) { await ev(page, `window.__adv.interact()`); await page.waitForTimeout(150); }
      const evoUid = await ev<string>(page, `(() => { const s = window.__adv.state; let evo = null;
        for (const [sp, lv] of [['bulbasaur', 20], ['pikachu', 30], ['geodude', 22], ['pelipper', 40], ['eevee', 18], ['magikarp', 12], ['rattata', 9]]) {
          const p = s.addPokemon(sp, lv, 'caught'); if (sp === 'bulbasaur') evo = p.uid;
          if (!s.inParty(p.uid) && s.party().length < 6) s.togglePartyMember(p.uid);
        }
        window.__adv.applyParty(); return evo; })()`);
      expect(await ev<number>(page, `window.__adv.state.party().length`)).toBe(6);
      expect(await ev<boolean>(page, `window.__adv.state.inParty('${evoUid}')`)).toBe(true);
      await ev(page, `(() => { const u = ${ui}; u.selected.party = '${evoUid}'; u.openMenu('party'); })()`);
      await page.waitForTimeout(500);
      const texts = await ev<string[]>(page, menuTexts);
      // the 7th and 8th Pokémon (Magikarp, Rattata) are in the PC, not on the party screen
      expect(texts.some((t) => /Đội hình 6\/6 · \d+ Pokémon trong PC/.test(t))).toBe(true);
      expect(texts.some((t) => t.includes('Rattata'))).toBe(false);
      expect(texts.some((t) => t === 'Tera')).toBe(true);
      expect(texts.some((t) => t.includes('Đủ điều kiện tiến hóa') && t.includes('Ivysaur'))).toBe(true);
      expect(texts.filter((t) => t === '▲ Tiến hóa').length).toBeGreaterThanOrEqual(1);
      await page.screenshot({ path: info.outputPath('party.png') });
      // the button runs the evolution (dialogue choice, then the animation)
      void ev(page, `(() => { ${ui}.closeMenu(); return window.__adv.evolveFromMenu('${evoUid}'); })()`);
      await page.waitForFunction(() => !!(window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer, undefined, { timeout: 5000 });
      // finish the text, pick the first choice (key 1), then skip through the animation
      for (let i = 0; i < 20 && !(await ev<boolean>(page, `(() => { const d = ${ui}.dialogueLayer; return !!d && d.list.length > 6; })()`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(150); }
      await page.keyboard.press('1');
      for (let i = 0; i < 40 && (await ev<string>(page, `window.__adv.state.owned('${evoUid}').species`)) !== 'ivysaur'; i++) { await page.keyboard.press('e'); await page.waitForTimeout(300); }
      expect(await ev<string>(page, `window.__adv.state.owned('${evoUid}').species`)).toBe('ivysaur');
      expect(errors).toEqual([]);
    });
  });
}
