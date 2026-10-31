import { describe, expect, it } from 'vitest';
import { QuestManager, type QuestDef } from '../src/core/quests';
import { allyStrike, type StoryDef } from '../src/core/story';
import vnQuests from '../src/data/vietnam/quests.json';
import story from '../src/data/story/vietnam.json';

// V30: in the finale of Mạch Nguồn, Torterra — calmed — fights on the player's side to cut the cables (a story ally of
// a 'destroy' encounter), and the Hà Nội epilogue waits for that.
const vn = story as unknown as StoryDef;
const defs = [...(vnQuests as unknown as QuestDef[]), ...vn.quests];
const hn3 = vn.quests.find((q) => q.id === 'mn-hn-3')!;

describe('Torterra, the ally of the finale', () => {
  it('allyStrike: a share of the foe\'s max HP, a third of it on the device, at least 1', () => {
    const a = { species: 'torterra', level: 100, name: 'T', move: 'M', dx: 0, dy: 0, power: 0.3 };
    expect(allyStrike(a, { maxHp: 1000 }, false)).toBe(300);
    expect(allyStrike(a, { maxHp: 1000 }, true)).toBe(100);
    expect(allyStrike(a, { maxHp: 1 }, true)).toBe(1);
    expect(allyStrike({ ...a, power: undefined }, { maxHp: 100 }, false)).toBe(30);
  });

  it('mn-hn-3: calm Torterra first, then cut the cables with it at your side', () => {
    const types = hn3.objectives.map((o) => o.type);
    const iBoss = types.indexOf('boss'), iCables = hn3.objectives.findIndex((o) => o.target === 'mn-hn-3:cables');
    expect(hn3.objectives[iBoss].target).toBe('torterra');
    expect(iCables).toBe(iBoss + 1);
    const enc = hn3.objectives[iCables].encounter!;
    expect(enc.kind).toBe('destroy');
    expect(enc.device).toBeDefined();
    expect(enc.ally).toMatchObject({ species: 'torterra', move: 'Địa Chấn' });
    // the strike reaches the device from where Torterra stands
    expect(Math.hypot(enc.ally!.dx, enc.ally!.dy)).toBeLessThan(enc.ally!.radius ?? 6);
    expect(vn.cutscenes.find((c) => c.id === 'mn-c-finale')!.lines[0].text).toContain('Torterra');
  });

  it('"Thần Kim Quy trở về" opens only once the cables are cut, not right after the boss', () => {
    const flags = new Set<string>();
    const done = ['vn-hn-1', 'vn-hn-2', 'mn-hn-1', 'mn-hn-2'];
    const qm = new QuestManager(defs, Object.fromEntries(done.map((id) => [id, { status: 'completed' as const, step: 9, progress: 0 }])), () => flags);
    qm.start('mn-hn-3');
    for (const ev of [{ type: 'trainer', target: 'hn-gate-t' }, { type: 'destroy', target: 'mn-hn-3:destroy' }, { type: 'hold', target: 'mn-hn-3:hold' }] as const) qm.notify(ev);
    flags.add('boss:torterra');
    qm.notify({ type: 'boss', target: 'torterra' });
    qm.refresh();
    expect(qm.currentObjective('mn-hn-3')?.target).toBe('mn-hn-3:cables');
    expect(qm.states['vn-hn-3'].status).toBe('locked');
    qm.notify({ type: 'destroy', target: 'mn-hn-3:cables' });
    qm.notify({ type: 'talk', target: 'mn-linh-ha-noi' });
    qm.refresh();
    expect(qm.states['mn-hn-3'].status).toBe('completed');
    expect(qm.states['vn-hn-3'].status).toBe('active');
  });
});
