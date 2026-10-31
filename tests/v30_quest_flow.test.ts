import { describe, expect, it } from 'vitest';
import { QuestManager, type ObjectiveDef, type QuestDef } from '../src/core/quests';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { STORIES } from '../src/core/storyData';
import vnQuests from '../src/data/vietnam/quests.json';

// V30 — mạch nhiệm vụ of the Việt Nam Odyssey, played start to end through the quest engine the way a player can:
// a giver / talk target must be standing on the map (showIf / hideIf), a guardian can only be fought once its arena
// opens (worldBoss.requires), and each guardian pays its badge. In every province the order must read as a story:
// arrive (local guide) → Linh's investigation of the Bình Minh device → the guardian → badge → next province.

const defs = [...(vnQuests as unknown as QuestDef[]), ...STORIES.vietnam.quests];
const byId = new Map(defs.map((q) => [q.id, q]));
const people = new Map<string, { showIf?: string[]; hideIf?: string[] }>();
const guardian = new Map<string, { region: string; requires: string[]; badge: string }>();
for (const [rid, r] of Object.entries(REGION_DEFS)) {
  for (const n of [...r.npcs, ...r.trainers]) people.set(n.id, n);
  if (r.worldBoss?.rewards) guardian.set(r.worldBoss.id, { region: rid, requires: r.worldBoss.requires ?? [], badge: r.worldBoss.rewards.flag });
}

function playMainLine() {
  const flags = new Set<string>();
  const order: string[] = [];
  const blocked: string[] = [];
  const qm = new QuestManager(defs, {}, () => flags, (o) => (o.type === 'boss' && flags.has('boss:' + o.target)) || (o.type === 'trainer' && flags.has('beat:' + o.target)) ? 1 : 0);
  // every quest the main line needs: main quests and everything they require
  const need = new Set<string>();
  const add = (id: string) => { if (need.has(id) || !byId.has(id)) return; need.add(id); for (const r of byId.get(id)!.requires ?? []) add(r); };
  for (const q of defs) if (q.kind === 'main') add(q.id);
  const visible = (id: string) => { const p = people.get(id); return !!p && (p.showIf ?? []).every((f) => flags.has(f)) && !(p.hideIf ?? []).some((f) => flags.has(f)); };
  const finish = (id: string) => { order.push(id); for (const f of qm.rewardsOf(id).flags ?? []) flags.add(f); };
  const settle = () => { qm.refresh(); for (const id of qm.takeAutoDone()) finish(id); qm.refresh(); };
  const act = (id: string, o: ObjectiveDef): boolean => {
    const t = o.target ?? '*';
    if ((o.type === 'talk' || o.type === 'choose' || o.type === 'trainer') && !visible(t)) { blocked.push(`${id}: ${o.type} ${t} không có trên bản đồ`); return false; }
    if (o.type === 'boss') {
      const g = guardian.get(t);
      if (g && !g.requires.every((f) => flags.has(f))) { blocked.push(`${id}: boss ${t} chưa mở (${g.requires.join(', ')})`); return false; }
      flags.add('boss:' + t); if (g) flags.add(g.badge);
    }
    if (o.type === 'trainer') flags.add('beat:' + t);
    if (o.type === 'puzzle') flags.add('puzzle:' + t);
    if (o.type === 'rescue') flags.add('rescued:' + t);
    if (o.type === 'choose') qm.choose(id, o.options![0].id);
    else for (let k = 0; k < o.count; k++) for (const u of qm.notify({ type: o.type, target: t })) if (u.completed) finish(u.questId);
    settle();
    return true;
  };
  for (let moved = true, guard = 0; moved && guard < 5000; guard++) {
    moved = false; blocked.length = 0;
    for (const id of need) {
      const st = qm.states[id], q = byId.get(id)!;
      if (st.status === 'available') {
        if (!q.giver || visible(q.giver)) { qm.start(id); settle(); moved = true; } else blocked.push(`${id}: người giao ${q.giver} không có mặt`);
        continue;
      }
      if (st.status !== 'active') continue;
      const o = qm.currentObjective(id);
      if (o && act(id, o)) moved = true;
    }
  }
  return { flags, order, blocked, left: [...need].filter((id) => qm.states[id].status !== 'completed') };
}

describe('mạch nhiệm vụ Việt Nam (V30)', () => {
  const run = playMainLine();

  it('the whole main line can be played from Đất Mũi to the ending, nothing left stuck', () => {
    expect(run.left, run.blocked.join('\n')).toEqual([]);
    expect(run.flags.has('mn:end')).toBe(true);
  });

  it('every province reads in order: arrival → Linh\'s investigation → guardian → next province', () => {
    const at = (id: string) => run.order.indexOf(id);
    let checked = 0;
    for (const [boss, g] of guardian) {
      const code = STORIES.vietnam.quests.find((q) => q.requiresFlags?.includes(`badge:${g.region}`) && q.id.startsWith('mn-') && q.kind === 'main');
      const fight = defs.find((q) => q.objectives.some((o) => o.type === 'boss' && o.target === boss));
      if (!fight || !REGION_DEFS[g.region] || !g.badge.startsWith('badge:')) continue;
      if (!byId.has(`vn-${fight.id.split('-')[1]}-1`)) continue; // classic campaign maps
      const intro = `vn-${fight.id.split('-')[1]}-1`;
      // the story quest(s) of the province that come before the guardian
      const storyHere = STORIES.vietnam.quests.filter((q) => q.kind === 'main' && q.requires?.includes(intro));
      expect(storyHere.length, g.region).toBeGreaterThan(0);
      for (const s of storyHere) expect(at(intro), `${intro} trước ${s.id}`).toBeLessThan(at(s.id));
      if (!fight.id.startsWith('mn-')) for (const s of storyHere) expect(at(s.id), `${s.id} trước ${fight.id}`).toBeLessThan(at(fight.id));
      // the next province opens only after this guardian's badge
      if (code) expect(at(fight.id), `${fight.id} trước ${code.id}`).toBeLessThan(at(code.id));
      checked++;
    }
    expect(checked).toBe(36); // every province of the route
  });

  it('An Giang does not start before the Cà Mau badge', () => {
    const qm = new QuestManager(defs, {}, () => new Set());
    expect(qm.states['vn-ag-1'].status).toBe('locked');
  });
});

describe('save v9 → v10 (mạch nhiệm vụ)', () => {
  it('half-done quests keep their place; reworked epilogues and early quests wait for their gates', async () => {
    const { migrate } = await import('../src/systems/saveSchema');
    const quests = {
      'mn-sg-2': { status: 'active', step: 1, progress: 0 }, // device destroyed, boss next
      'vn-cm-3': { status: 'active', step: 1, progress: 0 },
      'vn-sg-3': { status: 'completed', step: 2, progress: 0 },
      'vn-ag-1': { status: 'active', step: 0, progress: 0 },
      'vn-cm-2': { status: 'available', step: 0, progress: 0 },
    };
    const s = migrate({ version: 9, collection: [], adventure: { campaign: 'vietnam', party: [], flags: [], quests } });
    const q = s.adventure!.quests;
    expect(q['mn-sg-2']).toMatchObject({ status: 'active', step: 2 });
    expect(byId.get('mn-sg-2')!.objectives[2].type).toBe('boss');
    expect(q['vn-cm-3'].status).toBe('locked');
    expect(q['vn-sg-3'].status).toBe('completed');
    expect(q['vn-ag-1'].status).toBe('locked');
    expect(q['vn-cm-2'].status).toBe('locked');
  });
});
