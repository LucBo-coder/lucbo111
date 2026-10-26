import { describe, expect, it } from 'vitest';
import vnQuestsJson from '../src/data/vietnam/quests.json';
import { choiceFlag, QuestDef, QuestManager } from '../src/core/quests';
import { ITEMS } from '../src/adventure/AdventureState';

const VN = vnQuestsJson as unknown as QuestDef[];
const BRANCHING = ['vn-cm-trap', 'vn-ag-fishing', 'vn-ct-feud'];

/** A quest manager over the Vietnam book with every quest unlocked by its prerequisites given, and a flag set. */
function book(flags = new Set<string>()) {
  const saved: Record<string, { status: 'completed'; step: number; progress: number }> = {};
  for (const id of ['vn-cm-1', 'vn-ag-1', 'vn-ct-1']) saved[id] = { status: 'completed', step: 9, progress: 0 };
  return new QuestManager(VN, saved, () => flags);
}

describe('V22 branching quests: engine', () => {
  it('a choice waits for the player; picking a path skips the other path and adds its rewards', () => {
    const qs = book();
    expect(qs.start('vn-ct-feud')).toBe(true);
    qs.notify({ type: 'talk', target: 'ct-merchant' });
    qs.notify({ type: 'talk', target: 'ct-orchard-owner' });
    expect(qs.currentObjective('vn-ct-feud')?.type).toBe('choose');
    // talking to the NPC does not pass a choice
    expect(qs.notify({ type: 'talk', target: 'ct-ferry-girl' })).toEqual([]);
    expect(qs.choose('vn-ct-feud', 'nope')).toBeNull();
    expect(qs.choose('vn-ct-feud', 'chia-gio')?.completed).toBe(false);
    expect(qs.states['vn-ct-feud'].branch).toBe('chia-gio');
    // only the compromise path's two talks are left (in order); the other paths' talks never count
    expect(qs.pathObjectives('vn-ct-feud').map((p) => p.obj.branch ?? '')).toEqual(['', '', '', 'chia-gio', 'chia-gio']);
    expect(qs.currentObjective('vn-ct-feud')?.target).toBe('ct-orchard-owner');
    expect(qs.isLastStep('vn-ct-feud')).toBe(false);
    qs.notify({ type: 'talk', target: 'ct-orchard-owner' });
    expect(qs.isLastStep('vn-ct-feud')).toBe(true);
    const u = qs.notify({ type: 'talk', target: 'ct-merchant' });
    expect(u[0].completed).toBe(true);
    const r = qs.rewardsOf('vn-ct-feud');
    expect(r.reputation).toBe(15); // 5 + 10 of the compromise
    expect(r.worldExp).toBe(700);
    expect(qs.option('vn-ct-feud')?.complete?.[0]).toContain('Sáng tui');
  });

  it('a choice cannot be made twice or before its step; the pick survives a save', () => {
    const qs = book();
    qs.start('vn-cm-trap');
    expect(qs.choose('vn-cm-trap', 'khuyen-ut')).toBeNull(); // still exploring
    qs.notify({ type: 'explore', target: 'cm-uminh' });
    qs.notify({ type: 'talk', target: 'cm-elder' });
    expect(qs.choose('vn-cm-trap', 'khuyen-ut')?.completed).toBe(false);
    expect(qs.choose('vn-cm-trap', 'bao-kiem-lam')).toBeNull();
    const again = new QuestManager(VN, qs.serialize());
    expect(again.states['vn-cm-trap'].branch).toBe('khuyen-ut');
    expect(again.currentObjective('vn-cm-trap')?.target).toBe('cm-fisher-ut');
    // the ranger is not the one waiting any more
    expect(again.notify({ type: 'talk', target: 'cm-ranger-uminh' }).filter((u) => u.questId === 'vn-cm-trap')).toEqual([]);
    expect(again.notify({ type: 'talk', target: 'cm-fisher-ut' })[0].completed).toBe(true);
    expect(again.rewardsOf('vn-cm-trap').items).toEqual({ netball: 3 });
  });

  it('each choice opens its own follow-up and only that one', () => {
    for (const [quest, opt, follow, other] of [
      ['vn-cm-trap', 'bao-kiem-lam', 'vn-cm-patrol', 'vn-cm-new-trade'],
      ['vn-cm-trap', 'khuyen-ut', 'vn-cm-new-trade', 'vn-cm-patrol'],
      ['vn-ag-fishing', 'luoi-day', 'vn-ag-empty-field', 'vn-ag-fish-return'],
      ['vn-ag-fishing', 'cau-vua-du', 'vn-ag-fish-return', 'vn-ag-empty-field'],
      ['vn-ct-feud', 'theo-tu-hien', 'vn-ct-hien-cargo', 'vn-ct-tam-orchard'],
      ['vn-ct-feud', 'theo-chu-tam', 'vn-ct-tam-orchard', 'vn-ct-hien-cargo'],
    ]) {
      const flags = new Set([choiceFlag(quest, opt)]);
      const qs = book(flags);
      qs.states[quest] = { status: 'completed', step: 99, progress: 0, branch: opt };
      qs.refresh();
      expect(qs.states[follow].status, `${quest}:${opt}`).toBe('available');
      expect(qs.states[other].status, `${quest}:${opt}`).toBe('locked');
    }
  });
});

describe('V22 branching quests: content', () => {
  it('three provinces each have a crossroads with valid options, paths and rewards', () => {
    for (const id of BRANCHING) {
      const q = VN.find((d) => d.id === id)!;
      const choose = q.objectives.filter((o) => o.type === 'choose');
      expect(choose.length, id).toBe(1);
      const opts = choose[0].options!;
      expect(opts.length).toBeGreaterThanOrEqual(2);
      expect(new Set(opts.map((o) => o.id)).size).toBe(opts.length);
      for (const o of opts) {
        expect(q.objectives.some((x) => x.branch === o.id), `${id}:${o.id} has its own path`).toBe(true);
        expect(o.reply?.length && o.complete?.length).toBeTruthy();
        for (const k of Object.keys(o.rewards?.items ?? {})) expect(ITEMS[k], k).toBeTruthy();
      }
      // branch objectives come after the choice and name a real option
      const ci = q.objectives.indexOf(choose[0]);
      q.objectives.forEach((o, i) => { if (o.branch) { expect(i).toBeGreaterThan(ci); expect(opts.some((x) => x.id === o.branch)).toBe(true); } });
    }
    for (const q of VN) for (const k of Object.keys(q.rewards.items ?? {})) expect(ITEMS[k], `${q.id} ${k}`).toBeTruthy();
  });
});
