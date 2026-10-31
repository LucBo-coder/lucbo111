import { describe, expect, it } from 'vitest';
import { QuestDef, QuestManager } from '../src/core/quests';
import vnQuests from '../src/data/vietnam/quests.json';
import story from '../src/data/story/vietnam.json';

// V29 had the guardians of Cà Mau, Sài Gòn and Hà Nội in two quests at once (province chain + story). V30: one quest
// fights the guardian, the other is its epilogue (opens on the boss:<id> flag).
const defs = [...(vnQuests as unknown as QuestDef[]), ...(story.quests as unknown as QuestDef[])];

describe('a guardian is fought in one quest only (Chúa Rừng U Minh fought once)', () => {
  it('no boss appears in two quests of the Vietnam main line', () => {
    const seen = new Map<string, string>();
    for (const q of defs) for (const o of q.objectives) {
      if (o.type !== 'boss' || !o.target) continue;
      expect(seen.get(o.target), `${o.target}: ${seen.get(o.target)} + ${q.id}`).toBeUndefined();
      seen.set(o.target, q.id);
    }
  });

  it('Cà Mau: Seviper belongs to the story quest; "Rừng U Minh bình yên" opens once it is calmed', () => {
    const flags = new Set<string>();
    const qm = new QuestManager(defs, Object.fromEntries(['vn-cm-1', 'mn-cm-1', 'mn-cm-2', 'vn-cm-2'].map((id) => [id, { status: 'completed' as const, step: 9, progress: 0 }])), () => flags);
    expect(qm.states['vn-cm-3'].status).toBe('locked');
    qm.start('mn-cm-3');
    for (const ev of [{ type: 'trainer', target: 'cm-forest-trainer' }, { type: 'destroy', target: 'mn-cm-3:destroy' }] as const) qm.notify(ev);
    flags.add('boss:seviper');
    qm.notify({ type: 'boss', target: 'seviper' });
    qm.refresh();
    expect(qm.states['vn-cm-3'].status).toBe('active');
    expect(qm.currentObjective('vn-cm-3')).toMatchObject({ type: 'talk', target: 'cm-ranger' });
  });

  it('a quest whose only step is an already-beaten boss finishes and is queued for its rewards', () => {
    const q: QuestDef = { id: 'x', kind: 'boss', title: 'x', description: '', autoStart: true, objectives: [{ type: 'boss', target: 'seviper', count: 1, text: '' }], rewards: {}, dialogue: { offer: [], complete: [] } };
    const qm = new QuestManager([q], {}, () => new Set(['boss:seviper']));
    expect(qm.states.x.status).toBe('completed');
    expect(qm.takeAutoDone()).toEqual(['x']);
    expect(qm.takeAutoDone()).toEqual([]);
  });
});
