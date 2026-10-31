import { expect, test, type Page } from '@playwright/test';

// V30: villagers follow the story — once Cà Mau's guardian (Seviper) is calmed they talk about the forest at peace
// (data/vietnam/peace.json) instead of the trouble.

type Win = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;
const ui = `window.__phaser.scene.getScene('AdvUI')`;
const dialogueOpen = (page: Page) => ev<boolean>(page, `!!${ui}.dialogueLayer`);
const dialogueTexts = (page: Page) => ev<string[]>(page, `(() => { const l = ${ui}.dialogueLayer; const out = []; const walk = (o) => { if (o.type === 'Text') out.push(o.text); (o.list ?? []).forEach(walk); }; if (l) walk(l); return out; })()`);

/** Talk to a villager (no quest for or from them) and collect every page of what they say. */
async function hear(page: Page, id: string): Promise<string> {
  void ev(page, `(() => { const a = window.__adv; const n = a.regionDef.npcs.find(x => x.id === '${id}'); a.talk({ obj: { data: { ...n } } }); })()`);
  await page.waitForFunction(() => !!(window as Win).__phaser.scene.getScene('AdvUI').dialogueLayer, undefined, { timeout: 4000 });
  const seen: string[] = [];
  for (let i = 0; i < 12 && (await dialogueOpen(page)); i++) {
    seen.push(...(await dialogueTexts(page)));
    await page.keyboard.press('e');
    await page.waitForTimeout(250);
  }
  return seen.join('\n');
}

test('Cà Mau villagers talk about the forest at peace once Seviper is calmed', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/?debug');
  await page.waitForFunction(() => (window as Win).__phaser?.scene.isActive('Menu'));
  await ev(page, `void window.__phaser.scene.getScene('Menu').startAdventure(true, 3, 'vietnam')`);
  await page.waitForFunction(() => (window as Win).__adv?.map?.id === 'ca-mau' && (window as Win).__phaser.scene.isActive('AdvUI'), undefined, { timeout: 20_000 });
  // close the opening cutscene, if any
  for (let i = 0; i < 20 && (await dialogueOpen(page)); i++) { await page.keyboard.press((await dialogueTexts(page)).some((t) => t.includes('Bỏ qua cảnh')) ? '2' : 'e'); await page.waitForTimeout(250); }
  // a villager with nothing to offer and no running quest about them (so they only chat)
  const id = await ev<string>(page, `(() => { const a = window.__adv; const qs = a.state.quests;
    const about = new Set(qs.active().flatMap(q => [q.giver, ...q.objectives.map(o => o.target)]));
    return a.regionDef.npcs.find(n => !n.role && !n.id.endsWith('-guide') && !n.id.startsWith('mn-') && n.phases && !about.has(n.id)
      && !qs.forGiver(n.id).some(q => ['available', 'active'].includes(qs.states[q.id].status)))?.id; })()`);
  expect(id).toBeTruthy();
  const own = await ev<string>(page, `window.__adv.regionDef.npcs.find(n => n.id === '${id}').lines[0]`);
  expect(await hear(page, id)).toContain(own);
  await ev(page, `window.__adv.state.setFlag('boss:seviper')`);
  const after = await hear(page, id);
  expect(after).not.toContain(own);
  const town = await ev<string[]>(page, `window.__adv.regionDef.npcs.find(n => n.id === '${id}').phases.at(-1).lines`);
  expect(after).toContain(town[0].slice(0, 30));
  expect(errors).toEqual([]);
});
