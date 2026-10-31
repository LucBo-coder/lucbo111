import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventure/AdventureState';
import { QuestManager, type QuestDef } from '../src/core/quests';
import { cutscenePages, holdSeconds, npcVisible, type StoryDef } from '../src/core/story';
import { defaultSave } from '../src/systems/saveSchema';
import classicJson from '../src/data/story/classic.json';

// V30: the chapter-4 choice of Quần Đảo Khởi Nguyên changes what comes later — shards given to the lighthouse keeper
// light the lamp and Thiết, seeing it, does not fight in chapter 6; shards kept by the survey make the scanner keep
// the core's rhythm, so the last hold of chapter 7 is shorter. Cutscenes say the echo of the choice.
const classic = classicJson as unknown as StoryDef;
const q = (id: string) => classic.quests.find((x) => x.id === id)!;
const cut = (id: string) => classic.cutscenes.find((x) => x.id === id)!;
const text = (id: string, flags: string[]) => cutscenePages(cut(id), (w) => w, (f) => flags.includes(f)).flatMap((p) => p.lines).join('\n');

describe('engine pieces', () => {
  it('skipIf: an objective made unneeded by an earlier choice is passed at once', () => {
    const defs: QuestDef[] = [{ id: 'a', kind: 'main', title: 'A', giver: 'x', description: '', dialogue: { offer: [], complete: [] }, rewards: {},
      objectives: [{ type: 'trainer', target: 't', count: 1, text: '', skipIf: ['f'] }, { type: 'talk', target: 'x', count: 1, text: '' }] } as QuestDef];
    const flags = new Set<string>();
    const plain = new QuestManager(defs, {}, () => flags);
    plain.start('a');
    expect(plain.currentObjective('a')?.type).toBe('trainer');
    flags.add('f');
    const skipped = new QuestManager(defs, {}, () => flags);
    skipped.start('a');
    expect(skipped.currentObjective('a')?.type).toBe('talk');
  });

  it('cutscene lines with if / unless follow the flags', () => {
    const c = { id: 'c', title: 'C', chapter: 'x', lines: [{ who: 'a', text: '1' }, { who: 'a', text: '2', if: 'f' }, { who: 'a', text: '3', unless: 'f' }] };
    expect(cutscenePages(c, (w) => w).flatMap((p) => p.lines)).toEqual(['1', '3']);
    expect(cutscenePages(c, (w) => w, (f) => f === 'f').flatMap((p) => p.lines)).toEqual(['1', '2']);
  });

  it('holdSeconds: the default, the authored time, the time a flag gives', () => {
    expect(holdSeconds({}, () => false)).toBe(45);
    expect(holdSeconds({ seconds: 60, secondsIf: { flag: 'f', seconds: 40 } }, () => false)).toBe(60);
    expect(holdSeconds({ seconds: 60, secondsIf: { flag: 'f', seconds: 40 } }, (f) => f === 'f')).toBe(40);
  });
});

describe('chapter 4 choice of Quần Đảo Khởi Nguyên', () => {
  const opts = q('ck-4').objectives.find((o) => o.type === 'choose')!.options!;
  const flagOf = (id: string) => opts.find((o) => o.id === id)!.rewards!.flags![0];

  it('each path sets its own flag', () => {
    expect(flagOf('trao')).toBe('ck:lamp-early');
    expect(flagOf('giu')).toBe('ck:survey-scan');
  });

  it('given to the keeper: Thiết does not fight — chapter 6 starts at the drill, he stands aside, his words change', () => {
    const save = defaultSave();
    const st = new AdventureState(save);
    for (const id of ['q-main-1', 'ck-1a', 'ck-1b', 'ck-2', 'ck-3', 'ck-4', 'ck-5']) st.quests.states[id] = { status: 'completed', step: 9, progress: 0 };
    for (const f of ['ck:shard-5', 'ck:lamp-early', 'boss:articuno', 'boss:zapdos', 'boss:moltres']) st.setFlag(f);
    st.quests.refresh();
    expect(st.quests.states['ck-6'].status).toBe('available');
    st.quests.start('ck-6');
    expect(st.quests.currentObjective('ck-6')).toMatchObject({ type: 'destroy' });
    const has = (f: string) => st.hasFlag(f);
    const fighter = classic.trainers.find((t) => t.id === 'ck-thiet')!;
    const calm = classic.npcs.find((n) => n.id === 'ck-thiet-calm')!;
    expect(npcVisible(fighter, has)).toBe(false);
    expect(npcVisible(calm, has)).toBe(true);
    expect(text('ck-c-6', ['ck:lamp-early'])).toContain('le lói');
    expect(text('ck-c-6', ['ck:lamp-early'])).not.toContain('Ta thua');
    expect(text('ck-c-end', ['ck:lamp-early'])).toContain('làm Thiết đổi ý');
  });

  it('kept by the survey: Thiết fights as before, the last hold is shorter and Khuê says why', () => {
    const has = (f: string) => ['ck:shard-5', 'ck:survey-scan'].includes(f);
    expect(npcVisible(classic.trainers.find((t) => t.id === 'ck-thiet')!, has)).toBe(true);
    expect(npcVisible(classic.npcs.find((n) => n.id === 'ck-thiet-calm')!, has)).toBe(false);
    expect(q('ck-6').objectives[0]).toMatchObject({ type: 'trainer', target: 'ck-thiet' });
    expect(text('ck-c-6', ['ck:survey-scan'])).toContain('Ta thua');
    const hold = q('ck-7a').objectives.find((o) => o.type === 'hold')!.encounter!;
    expect(holdSeconds(hold, (f) => f === 'ck:survey-scan')).toBe(40);
    expect(holdSeconds(hold, (f) => f === 'ck:lamp-early')).toBe(60);
    expect(text('ck-c-7', ['ck:survey-scan'])).toContain('giữ nhịp');
    expect(text('ck-c-end', ['ck:survey-scan'])).toContain('máy dò');
    expect(text('ck-c-end', ['ck:survey-scan'])).not.toContain('làm Thiết đổi ý');
  });
});
