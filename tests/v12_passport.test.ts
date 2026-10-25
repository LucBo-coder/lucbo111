import { describe, expect, it } from 'vitest';
import { passportPages, stampVisit, VN_PROVINCES } from '../src/adventure/passport';
import { migrate, newAdventure } from '../src/systems/saveSchema';
import vnQuests from '../src/data/vietnam/quests.json';

const QUEST_IDS = (vnQuests as { id: string }[]).map((q) => q.id);

describe('Journey Passport (Vietnam Odyssey)', () => {
  it('a new journey has only Cà Mau visited, nothing done', () => {
    const adv = newAdventure('vietnam');
    const [cm, ag] = passportPages(adv, QUEST_IDS);
    expect(cm.visited).toBe(true);
    expect(cm.completion).toBe(0);
    expect(cm.quests.total).toBe(QUEST_IDS.filter((q) => q.startsWith('vn-cm-')).length);
    expect(cm.boss?.defeated).toBe(false);
    expect(ag.visited).toBe(false);
    expect(ag.unlocked).toBe(false);
  });

  it('progress is read from flags, chests, areas and quests', () => {
    const adv = newAdventure('vietnam');
    adv.flags.push('badge:ca-mau', 'boss:seviper', 'beat:cm-youngster', 'landmark:mui-ca-mau');
    adv.chests.push('chest-cm-cape');
    adv.areas.push('cm-town', 'cm-cape');
    adv.quests['vn-cm-1'] = { status: 'completed', step: 0, progress: 0 };
    const [cm, ag] = passportPages(adv, QUEST_IDS);
    expect(cm.badge).toBe(true);
    expect(cm.boss?.defeated).toBe(true);
    expect(cm.trainers).toEqual({ done: 1, total: 5 });
    expect(cm.chests.done).toBe(1);
    expect(cm.areas.done).toBe(2);
    expect(cm.quests.done).toBe(1);
    expect(cm.landmarks[0].got).toBe(true);
    expect(cm.completion).toBeGreaterThan(0);
    expect(cm.completion).toBeLessThan(100);
    expect(ag.unlocked).toBe(true);
  });

  it('first visits are stamped once; classic maps never are', () => {
    const adv = newAdventure('vietnam');
    expect(stampVisit(adv, 'an-giang', 1000)).toBe(true);
    expect(stampVisit(adv, 'an-giang', 2000)).toBe(false);
    expect(adv.visited!['an-giang']).toBe(1000);
    expect(stampVisit(adv, 'starter-valley')).toBe(false);
    expect(passportPages(adv, QUEST_IDS)[1]).toMatchObject({ visited: true, firstVisit: 1000 });
  });

  it('old saves without stamps still count explored provinces as visited', () => {
    const old = newAdventure('vietnam') as unknown as Record<string, unknown>;
    delete old.visited;
    (old.discoveredBy as Record<string, number[]>)['an-giang'] = [3, 4];
    const save = migrate({ version: 6, adventure: old });
    const ag = passportPages(save.adventure!, QUEST_IDS)[1];
    expect(ag.visited).toBe(true);
    expect(ag.firstVisit).toBe(0);
  });

  it('every province has a quest prefix, a badge and a unique id', () => {
    expect(new Set(VN_PROVINCES.map((p) => p.id)).size).toBe(VN_PROVINCES.length);
    for (const p of VN_PROVINCES) { expect(p.questPrefix).toMatch(/^vn-[a-z]+-$/); expect(p.badge).toBeTruthy(); }
  });
});
