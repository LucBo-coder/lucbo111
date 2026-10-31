import { describe, expect, it } from 'vitest';
import { AdventureState } from '../src/adventure/AdventureState';
import { QuestManager, type QuestDef } from '../src/core/quests';
import { CONSERVATION, siteFlag } from '../src/core/conservation';
import { defaultSave } from '../src/systems/saveSchema';

// V30: objectives whose event fires once per save (waypoint, trainer, chest, puzzle, field obstacle, restoration
// sites, a boss) catch up when the quest reaches them after the fact — no quest waits forever on a past event.

function vn(): AdventureState {
  const save = defaultSave();
  const st = new AdventureState(save);
  st.adv.campaign = 'vietnam';
  return new AdventureState(save);
}
const done = (st: AdventureState, ids: string[]) => { for (const id of ids) st.quests.states[id] = { status: 'completed', step: 9, progress: 0 }; st.quests.refresh(); };

describe('quest catch-up (V30)', () => {
  it('Vào rừng U Minh: the ranger station activated before the quest still counts', () => {
    const st = vn();
    done(st, ['vn-cm-1', 'mn-cm-1', 'mn-cm-2']);
    st.adv.waypoints.push('wp-cm-uminh');
    st.quests.start('vn-cm-2');
    st.notify({ type: 'explore', target: 'cm-mangrove' });
    st.notify({ type: 'explore', target: 'cm-uminh' });
    // the 'activate' step was already done: straight on to the ranger
    expect(st.quests.currentObjective('vn-cm-2')).toMatchObject({ type: 'talk', target: 'cm-ranger' });
  });

  it('explore: accepting the quest while standing in the area counts at once', () => {
    const st = vn();
    done(st, ['vn-cm-1', 'mn-cm-1', 'mn-cm-2']);
    st.currentArea = 'cm-mangrove';
    st.quests.start('vn-cm-2');
    expect(st.quests.currentObjective('vn-cm-2')?.target).toBe('cm-uminh');
  });

  it('a trainer beaten before the quest asked for them', () => {
    const st = vn();
    done(st, ['vn-cm-1', 'mn-cm-1', 'mn-cm-2', 'vn-cm-2']);
    st.setFlag('beat:cm-forest-trainer');
    st.quests.start('mn-cm-3');
    expect(st.quests.currentObjective('mn-cm-3')?.type).toBe('destroy');
  });

  it('restoration sites planted before taking the ranger\'s quest count, and the quest pays out through the drain', () => {
    const st = vn();
    done(st, ['vn-cm-1', 'mn-cm-1', 'mn-cm-2', 'vn-cm-2', 'mn-cm-3', 'vn-cm-3']);
    const sites = CONSERVATION['ca-mau'].sites;
    for (const s of sites.slice(0, 4)) st.setFlag(siteFlag(s.id));
    st.quests.start('vn-cm-eco');
    expect(st.quests.states['vn-cm-eco'].progress).toBe(4);
    for (const s of sites.slice(4)) st.adv.flags.push(siteFlag(s.id)); // set outside any quest event
    const finished = st.catchUpQuests().map((q) => q.id);
    const eco = st.quests.def('vn-cm-eco')!;
    if (eco.objectives.length === 1) expect(finished).toContain('vn-cm-eco');
    else expect(st.quests.states['vn-cm-eco'].step).toBe(1);
  });

  it('old saves: an active quest past its last objective is pulled back instead of stuck', () => {
    const q: QuestDef = { id: 'q', kind: 'side', title: '', description: '', objectives: [{ type: 'talk', target: 'a', count: 1, text: '' }], rewards: {}, dialogue: { offer: [], complete: [] } };
    const qm = new QuestManager([q], { q: { status: 'active', step: 3, progress: 0 } });
    expect(qm.currentObjective('q')?.target).toBe('a');
  });

  it('repeatable events never catch up (fishing, a wild capture, talking)', () => {
    const st = vn();
    expect(st.alreadyDone({ type: 'collect', target: 'fish', count: 1, text: '' })).toBe(0);
    expect(st.alreadyDone({ type: 'capture', target: '*', count: 1, text: '' })).toBe(0);
    expect(st.alreadyDone({ type: 'talk', target: 'vn-prof', count: 1, text: '' })).toBe(0);
  });

  describe('order only binds where it means something', () => {
    const o = (type: string, target: string, count = 1, extra: object = {}) => ({ type, target, count, text: `${type} ${target}`, ...extra }) as QuestDef['objectives'][number];
    const quest = (objectives: QuestDef['objectives']): QuestDef => ({ id: 'q', kind: 'side', title: '', description: '', objectives, rewards: {}, dialogue: { offer: [], complete: [] } });
    const run = (objectives: QuestDef['objectives']) => { const qm = new QuestManager([quest(objectives)], { q: { status: 'active', step: 0, progress: 0 } }); return qm; };

    it('catching / fighting done early counts when the quest gets there', () => {
      const qm = run([o('explore', 'forest'), o('capture', 'oddish', 2), o('defeat', '*', 3), o('talk', 'ranger')]);
      qm.notify({ type: 'capture', target: 'oddish' });
      for (let i = 0; i < 3; i++) qm.notify({ type: 'defeat', target: 'rattata' });
      expect(qm.objectiveProgress('q', 1)).toBe(1);
      expect(qm.objectiveProgress('q', 2)).toBe(3);
      qm.notify({ type: 'explore', target: 'forest' });
      expect(qm.states.q).toMatchObject({ step: 1, progress: 1 }); // 1 of 2 Oddish already
      qm.notify({ type: 'capture', target: 'oddish' });
      // the 3 knock-outs were already done: straight to the report
      expect(qm.currentObjective('q')?.type).toBe('talk');
    });

    it('a report never counts early, so the quest cannot finish before the work is done', () => {
      const qm = run([o('capture', '*'), o('talk', 'prof')]);
      qm.notify({ type: 'talk', target: 'prof' });
      expect(qm.states.q).toMatchObject({ step: 0, progress: 0 });
      expect(qm.objectiveProgress('q', 1)).toBe(0);
    });

    it('story encounters and choices wait their turn; an unpicked branch collects nothing', () => {
      const qm = run([o('talk', 'a'), o('destroy', 'q:destroy'), o('choose', 'a', 1, { options: [{ id: 'x', label: 'x' }, { id: 'y', label: 'y' }] }), o('defeat', 'ekans', 1, { branch: 'x' })]);
      qm.notify({ type: 'destroy', target: 'q:destroy' });
      qm.notify({ type: 'defeat', target: 'ekans' });
      expect(qm.states.q.pre).toBeUndefined();
    });

    it('the last objective done early completes the quest as soon as the steps before it are done', () => {
      const qm = run([o('trainer', 'vy'), o('boss', 'seviper')]);
      const r1 = qm.notify({ type: 'boss', target: 'seviper' });
      expect(r1[0].completed).toBe(false);
      qm.notify({ type: 'trainer', target: 'vy' });
      expect(qm.states.q.status).toBe('completed');
      expect(qm.takeAutoDone()).toEqual(['q']);
      expect(qm.states.q.pre).toBeUndefined();
    });
  });
});
