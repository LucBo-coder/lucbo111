import { describe, expect, it } from 'vitest';
import { QuestManager, choiceFlag, type QuestDef } from '../src/core/quests';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { legendQuests } from '../src/core/legends';
import { storyOf } from '../src/core/storyData';
import worldQuests from '../src/data/world/quests.json';
import vnQuests from '../src/data/vietnam/quests.json';

// V30: plays every quest book to the end — start whatever is available, do its current step (a choice takes every
// path's flags, a boss gives its badge), repeat — and expects every quest, side chains and branches included, to
// finish. A quest that can never open or never end shows up here.
const books: Record<string, QuestDef[]> = {
  classic: [...(worldQuests as unknown as QuestDef[]), ...legendQuests(worldQuests as unknown as QuestDef[]), ...storyOf('classic').quests],
  vietnam: [...(vnQuests as unknown as QuestDef[]), ...storyOf('vietnam').quests],
};
const badgeOf = new Map<string, string>();
for (const r of Object.values(REGION_DEFS)) if (r.worldBoss?.rewards?.flag) badgeOf.set(r.worldBoss.id, r.worldBoss.rewards.flag);
function playAll(defs: QuestDef[]): string[] {
  const flags = new Set<string>();
  // what the world gives without quests: every map visited, every referenced non-story game flag
  for (const id of Object.keys(REGION_DEFS)) flags.add('region:' + id);
  for (const q of defs) for (const f of q.requiresFlags ?? []) if (/^(field|rep|eco|legend|clue|thriving|dock|met|visit|portal|landmark|puzzle|rescued|beat):/.test(f)) flags.add(f);
  const qm = new QuestManager(defs, {}, () => flags);
  for (let round = 0; round < 400; round++) {
    let moved = false;
    qm.refresh();
    for (const d of defs) {
      const st = qm.states[d.id];
      if (st.status === 'available') { qm.start(d.id); moved = true; }
      if (qm.states[d.id].status !== 'active') continue;
      const o = qm.currentObjective(d.id);
      if (!o) continue;
      if (o.type === 'choose') { for (const op of o.options ?? []) { flags.add(choiceFlag(d.id, op.id)); for (const f of op.rewards?.flags ?? []) flags.add(f); } qm.choose(d.id, o.options![0].id); }
      else {
        const t = o.target ?? '*';
        if (o.type === 'boss') { flags.add('boss:' + t); const b = badgeOf.get(t); if (b) flags.add(b); }
        if (o.type === 'trainer') flags.add('beat:' + t);
        for (let i = 0; i < (o.count ?? 1); i++) qm.notify({ type: o.type, target: t } as never);
      }
      if (qm.states[d.id].status === 'completed') for (const f of d.rewards.flags ?? []) flags.add(f);
      moved = true;
    }
    for (const id of qm.takeAutoDone()) for (const f of defs.find((x) => x.id === id)!.rewards.flags ?? []) flags.add(f);
    if (!moved) break;
  }
  const stuck = defs.filter((d) => qm.states[d.id].status !== 'completed').map((d) => `${d.id} (${qm.states[d.id].status})`);
  return stuck;
}

describe('every quest can be reached and finished (V30)', () => {
  for (const [name, defs] of Object.entries(books)) {
    it(`${name}: all ${defs.length} quests finish`, () => expect(playAll(defs)).toEqual([]));
  }
  it('a quest waiting on a flag nothing sets is caught', () => {
    const broken = { ...books.vietnam[0], id: 'x-broken', requires: [], requiresFlags: ['nowhere:flag'] } as QuestDef;
    expect(playAll([...books.vietnam, broken])).toEqual(['x-broken (locked)']);
  });
});
