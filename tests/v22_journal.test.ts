import { describe, expect, it } from 'vitest';
import questsJson from '../src/data/world/quests.json';
import vnQuestsJson from '../src/data/vietnam/quests.json';
import { questInRegion, repBoard, repRow } from '../src/core/journal';
import { addRep } from '../src/core/reputation';
import type { QuestDef } from '../src/core/quests';

const VN = vnQuestsJson as unknown as QuestDef[];
const CLASSIC = questsJson as unknown as QuestDef[];
const save = () => ({ reputation: 0, repBy: {} as Record<string, number>, flags: [] as string[] });

describe('V22 journal: quests of this map', () => {
  it('every Vietnam quest belongs to at least one province; Cần Thơ quests are not listed in Cà Mau', () => {
    for (const q of VN) expect(['ca-mau', 'an-giang', 'can-tho'].some((r) => questInRegion(q, r)), q.id).toBe(true);
    const ct = VN.find((q) => q.id === 'vn-ct-market')!;
    expect(questInRegion(ct, 'can-tho')).toBe(true);
    expect(questInRegion(ct, 'ca-mau')).toBe(false);
    expect(questInRegion(VN.find((q) => q.id === 'vn-cm-boat')!, 'ca-mau')).toBe(true);
  });

  it('classic quests without a region on their markers count as the valley', () => {
    const inValley = CLASSIC.filter((q) => questInRegion(q, 'starter-valley'));
    expect(inValley.length).toBeGreaterThan(3);
    expect(CLASSIC.filter((q) => questInRegion(q, 'ca-mau'))).toEqual([]);
  });
});

describe('V22 journal: reputation board', () => {
  it('rows show tier, progress inside the tier, points to the next tier and its gift', () => {
    const s = save();
    expect(repRow(s, 'ca-mau')).toMatchObject({ name: 'Cà Mau', points: 0, tier: 0, tierName: 'Người lạ', progress: 0, toNext: 15, nextName: 'Quen mặt' });
    expect(repRow(s, 'ca-mau').nextReward).toEqual({ oranberry: 3, greatball: 2 });
    addRep(s, 'ca-mau', 25);
    const r = repRow(s, 'ca-mau');
    expect(r).toMatchObject({ tier: 1, tierName: 'Quen mặt', toNext: 15, nextName: 'Được tin cậy' });
    expect(r.progress).toBeCloseTo(10 / 25);
    addRep(s, 'ca-mau', 100);
    expect(repRow(s, 'ca-mau')).toMatchObject({ tier: 3, progress: 1, toNext: null, nextName: null, nextReward: null });
  });

  it('the board lists only regions with a reputation table, per campaign', () => {
    const s = save();
    addRep(s, 'an-giang', 5);
    expect(repBoard(s, ['ca-mau', 'an-giang', 'can-tho']).map((r) => [r.region, r.points])).toEqual([['ca-mau', 0], ['an-giang', 5], ['can-tho', 0]]);
    expect(repBoard(s, ['frozen-mountains'])).toEqual([]);
  });
});
