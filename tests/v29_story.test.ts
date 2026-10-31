import { describe, expect, it } from 'vitest';
import { STORIES, storyOf } from '../src/core/storyData';
import { chapterStates, cutscenePages, holdTick, npcVisible, validateStory, waveDue, type EncounterDef } from '../src/core/story';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';
import { POKEMON } from '../src/core/data';
import { QuestManager, type QuestDef } from '../src/core/quests';
import { isMainQuest } from '../src/core/journal';
import { VN_PROVINCES } from '../src/adventure/passport';
import vnQuests from '../src/data/vietnam/quests.json';
import classicQuests from '../src/data/world/quests.json';
import { newAdventure } from '../src/systems/saveSchema';

// V29: "Mạch Nguồn" (Việt Nam Odyssey) and "Quần Đảo Khởi Nguyên" (Phiêu lưu) — story data and its pure logic.

const both = Object.values(STORIES);

describe('story data (data/story/*.json, scripts/gen-story.ts)', () => {
  it('both stories validate: ids, chapters, cutscenes, speakers, encounters', () => {
    for (const s of both) expect(validateStory(s), s.id).toEqual([]);
    expect(storyOf('vietnam').title).toBe('Mạch Nguồn');
    expect(storyOf('classic').title).toBe('Quần Đảo Khởi Nguyên');
    expect(storyOf(undefined)).toBe(STORIES.classic);
  });

  it('story quests have stable, campaign-specific ids that never collide with the authored quest books', () => {
    const vn = new Set((vnQuests as QuestDef[]).map((q) => q.id)), ck = new Set((classicQuests as QuestDef[]).map((q) => q.id));
    for (const q of STORIES.vietnam.quests) { expect(q.id).toMatch(/^mn-/); expect(vn.has(q.id)).toBe(false); }
    for (const q of STORIES.classic.quests) { expect(q.id).toMatch(/^ck-/); expect(ck.has(q.id)).toBe(false); }
  });

  it('Vietnam: a stage in every one of the 36 provinces, acts Mở đầu → I…V → Kết, Linh waiting in each', () => {
    const st = STORIES.vietnam;
    expect(st.chapters.map((c) => c.id)).toEqual(['mn-0', 'mn-1', 'mn-2', 'mn-3', 'mn-4', 'mn-5', 'mn-6']);
    const regions = new Set(st.chapters.flatMap((c) => c.regions));
    for (const p of VN_PROVINCES) {
      expect(regions.has(p.id), p.id).toBe(true);
      expect(st.npcs.some((n) => n.id === `mn-linh-${p.id}` && n.region === p.id), p.id).toBe(true);
    }
    // the objectives are varied: holds, devices, escorts, rival / boss battles, a branching choice
    const types = new Set(st.quests.flatMap((q) => q.objectives.map((o) => o.type)));
    for (const t of ['hold', 'destroy', 'escort', 'trainer', 'boss', 'choose', 'explore', 'talk']) expect(types.has(t as never), t).toBe(true);
  });

  it('Phiêu lưu: seven chapters over the seven maps of the islands', () => {
    const st = STORIES.classic;
    expect(st.chapters).toHaveLength(7);
    expect(new Set(st.chapters.flatMap((c) => c.regions))).toEqual(new Set(['starter-valley', 'emerald-woods', 'misty-swamp', 'coral-coast', 'frozen-mountains', 'volcanic-lands', 'legendary-sanctuary']));
  });

  it('every story person stands on a free, walkable tile of its map and joined the map data', () => {
    for (const s of both) {
      const byRegion = new Map<string, ValleyMap>();
      for (const p of [...s.npcs, ...s.trainers]) {
        const d = REGION_DEFS[p.region];
        expect(d, p.region).toBeTruthy();
        expect([...d.npcs, ...d.trainers].some((x) => x.id === p.id), p.id).toBe(true);
        let m = byRegion.get(p.region);
        if (!m) { m = new ValleyMap(d); byRegion.set(p.region, m); }
        expect(m.solidAt(p.x, p.y), `${p.id} @${p.region} ${p.x},${p.y}`).toBe(false);
      }
    }
  });

  it('encounters sit on walkable ground of their map, with known species and a marker', () => {
    for (const s of both) for (const q of s.quests) for (const o of q.objectives) {
      if (!o.encounter) continue;
      const e = o.encounter, m = new ValleyMap(REGION_DEFS[e.region]);
      expect(m.solidAt(e.x, e.y), `${q.id} ${o.type}`).toBe(false);
      expect(o.marker?.region).toBe(e.region);
      for (const w of e.waves ?? []) for (const [sp] of w) expect(POKEMON.has(sp), sp).toBe(true);
      if (e.device) expect(POKEMON.has(e.device.species)).toBe(true);
      if (e.kind === 'escort') { expect(e.npc).toBeTruthy(); expect(m.solidAt(e.npc!.fromX, e.npc!.fromY)).toBe(false); }
      if (e.kind === 'hold') expect(e.seconds).toBeGreaterThan(0);
    }
  });

  it('talk / trainer targets exist somewhere in the campaign', () => {
    const ids = (regions: string[]) => new Set(regions.flatMap((r) => [...REGION_DEFS[r].npcs, ...REGION_DEFS[r].trainers].map((n) => n.id)));
    const vn = ids(VN_PROVINCES.map((p) => p.id)), ck = ids(STORIES.classic.chapters.flatMap((c) => c.regions));
    for (const [s, known] of [[STORIES.vietnam, vn], [STORIES.classic, ck]] as const) for (const q of s.quests) {
      if (q.giver) expect(known.has(q.giver), `${q.id} giver ${q.giver}`).toBe(true);
      for (const o of q.objectives) if (['talk', 'trainer', 'choose'].includes(o.type)) expect(known.has(o.target!), `${q.id} ${o.type}:${o.target}`).toBe(true);
    }
  });

  it('the Vietnam story line can be played start to end through the quest engine', () => {
    const defs = [...(vnQuests as QuestDef[]), ...STORIES.vietnam.quests];
    const flags = new Set<string>();
    const qm = new QuestManager(defs, {}, () => flags);
    const play = (id: string) => {
      if (qm.states[id].status === 'locked') qm.refresh();
      expect(qm.states[id].status, id).not.toBe('locked');
      if (qm.states[id].status === 'available') qm.start(id);
      const q = qm.def(id)!;
      for (let guard = 0; qm.states[id].status === 'active' && guard < 40; guard++) {
        const o = qm.currentObjective(id)!;
        if (o.type === 'choose') { qm.choose(id, o.options![0].id); continue; }
        for (let k = 0; k < o.count; k++) qm.notify({ type: o.type, target: o.target ?? '*' });
      }
      expect(qm.states[id].status, id).toBe('completed');
      for (const f of qm.rewardsOf(id).flags ?? []) flags.add(f);
      void q;
    };
    // the story's first step needs the starter quest
    qm.start('vn-cm-1'); for (const o of qm.def('vn-cm-1')!.objectives) qm.notify({ type: o.type, target: o.target ?? '*' });
    expect(qm.states['vn-cm-1'].status).toBe('completed');
    // each province's badge comes from its guardian (world boss) — granted here once the province's story starts
    const regionOf = (id: string) => STORIES.vietnam.npcs.find((n) => n.id === qm.def(id)!.giver)?.region ?? 'ca-mau';
    for (const ch of STORIES.vietnam.chapters) for (const id of ch.quests) {
      play(id);
      flags.add(`badge:${regionOf(id)}`);
      qm.refresh();
    }
    expect(flags.has('mn:end')).toBe(true);
  });

  it('journal split: story chapters and main quests on "Chính", the rest on "Phụ"', () => {
    const q = STORIES.vietnam.quests.find((x) => x.id === 'mn-ag')!;
    expect(isMainQuest(q)).toBe(true);
    expect(isMainQuest(STORIES.vietnam.quests.find((x) => x.id === 'mn-post')!)).toBe(false);
    expect(isMainQuest((vnQuests as QuestDef[]).find((x) => x.id === 'vn-cm-board-1')!)).toBe(false);
  });
});

describe('story logic (core/story.ts)', () => {
  it('NPC gating by flags', () => {
    const has = (f: string) => ['badge:ca-mau'].includes(f);
    expect(npcVisible({}, has)).toBe(true);
    expect(npcVisible({ showIf: ['badge:ca-mau'] }, has)).toBe(true);
    expect(npcVisible({ showIf: ['badge:an-giang'] }, has)).toBe(false);
    expect(npcVisible({ showIf: ['badge:ca-mau'], hideIf: ['badge:ca-mau'] }, has)).toBe(false);
  });

  it('hold: progress inside, pause outside, reset after the grace time', () => {
    let st = { t: 0, out: 0 };
    let r = holdTick(st, 10, true, { seconds: 30 });
    expect(r.st.t).toBe(10); expect(r.done).toBe(false);
    st = r.st;
    r = holdTick(st, 5, false, { seconds: 30 });
    expect(r.st.t).toBe(10); expect(r.reset).toBe(false);
    r = holdTick(r.st, 4, false, { seconds: 30 });
    expect(r.reset).toBe(true); expect(r.st.t).toBe(0);
    st = { t: 25, out: 0 };
    r = holdTick(st, 6, true, { seconds: 30 });
    expect(r.done).toBe(true); expect(r.st.t).toBe(30);
  });

  it('waves come every `every` seconds and stop at the last one', () => {
    const def: EncounterDef = { kind: 'hold', x: 0, y: 0, region: 'x', every: 10, waves: [[['krabby', 5]], [['krabby', 6]], [['krabby', 7]]] };
    expect(waveDue(0, def)).toBe(0);
    expect(waveDue(9.9, def)).toBe(0);
    expect(waveDue(10, def)).toBe(1);
    expect(waveDue(500, def)).toBe(2);
    expect(waveDue(5, { ...def, waves: [] })).toBe(-1);
  });

  it('cutscene pages group consecutive lines of one speaker; chapter states follow the quests', () => {
    const c = { id: 'c', title: 'T', chapter: 'x', lines: [{ who: 'a', text: '1' }, { who: 'a', text: '2' }, { who: '', text: '3' }, { who: 'b', text: '4' }] };
    const pages = cutscenePages(c, (w) => w.toUpperCase());
    expect(pages).toEqual([{ speaker: 'A', lines: ['1', '2'] }, { speaker: '', lines: ['3'] }, { speaker: 'B', lines: ['4'] }]);
    const st = STORIES.vietnam;
    const s0 = chapterStates(st, () => 'locked');
    expect(Object.values(s0).every((v) => v === 'locked')).toBe(true);
    const s1 = chapterStates(st, (id) => (id.startsWith('mn-cm-') ? 'completed' : id === 'mn-ag' ? 'available' : 'locked'));
    expect(s1['mn-0']).toBe('done');
    expect(s1['mn-1']).toBe('current');
    expect(s1['mn-2']).toBe('locked');
  });

  it('every cutscene a quest names exists, and new saves start with none seen', () => {
    for (const s of both) {
      const ids = new Set(s.cutscenes.map((c) => c.id));
      for (const q of s.quests) for (const id of Object.values(q.cutscene ?? {})) expect(ids.has(id!), id).toBe(true);
    }
    expect(newAdventure().storySeen).toEqual([]);
  });
});
