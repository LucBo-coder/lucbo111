// Quest book audit (pure): finds holes in authored quest data before a player does — targets that do not exist,
// quests nobody can give, prerequisites that never complete, objectives that can never progress, NPCs hidden at the
// moment a quest needs them. tests/v30_quest_audit.test.ts keeps both campaigns at zero errors.

import type { ObjectiveDef, QuestDef } from './quests';
import type { RegionDef } from './map/valley';

export interface AuditWorld {
  regions: Record<string, RegionDef>;
  /** regional / world boss ids + legendary ids */
  bosses: Set<string>;
  species: Set<string>;
  /** gathering table kinds ('fish', 'forage', …) */
  gatherKinds: Set<string>;
  /** legend ids with clues ('clue:<legend>' explore targets) */
  legends: Set<string>;
}

export interface AuditIssue { quest: string; level: 'error' | 'warn'; msg: string }

/** Objective types whose event fires once in a save (a second chance only comes from QuestManager's satisfied check). */
export const ONE_SHOT = new Set(['activate', 'trainer', 'boss', 'puzzle', 'rescue']);

export function auditQuests(quests: QuestDef[], w: AuditWorld): AuditIssue[] {
  const out: AuditIssue[] = [];
  const err = (quest: string, msg: string) => out.push({ quest, level: 'error', msg });
  const warn = (quest: string, msg: string) => out.push({ quest, level: 'warn', msg });
  const regs = Object.values(w.regions);
  const ids = new Map<string, QuestDef>();
  for (const q of quests) {
    if (ids.has(q.id)) err(q.id, 'id trùng');
    ids.set(q.id, q);
  }
  const people = new Map<string, { region: string; showIf?: string[]; hideIf?: string[]; trainer: boolean }>();
  for (const [rid, r] of Object.entries(w.regions)) {
    for (const n of r.npcs) people.set(n.id, { region: rid, showIf: n.showIf, hideIf: n.hideIf, trainer: false });
    for (const t of r.trainers) people.set(t.id, { region: rid, showIf: t.showIf, hideIf: t.hideIf, trainer: true });
  }
  const has = (pick: (r: RegionDef) => { id: string }[] | undefined, id: string) => regs.some((r) => (pick(r) ?? []).some((x) => x.id === id));
  const isArea = (id: string) => has((r) => r.areas, id);
  const isChest = (id: string) => has((r) => r.chests, id);

  // flags quests hand out (rewards + choices): a requiresFlag nothing produces is a lock with no key
  const rewardFlags = new Map<string, string[]>();
  for (const q of quests) {
    const fl = [...(q.rewards.flags ?? [])];
    for (const o of q.objectives) for (const op of o.options ?? []) fl.push(`choice:${q.id}:${op.id}`, ...(op.rewards?.flags ?? []));
    rewardFlags.set(q.id, fl);
  }
  const producedByQuest = new Set([...rewardFlags.values()].flat());
  /** flags set by the game itself (prefix patterns), not by quest rewards */
  const gameFlag = (f: string) => /^(badge|boss|beat|puzzle|rescued|field|rep|eco|legend|clue|mn|thriving|story|cut|seen|dock|met|visit|region|portal|choice):/.test(f);

  // transitive prerequisites (quest ids) — used to know which flags are surely set when a quest runs
  const before = new Map<string, Set<string>>();
  const pre = (id: string, seen = new Set<string>()): Set<string> => {
    if (before.has(id)) return before.get(id)!;
    if (seen.has(id)) return new Set();
    seen.add(id);
    const s = new Set<string>();
    for (const r of ids.get(id)?.requires ?? []) { s.add(r); for (const x of pre(r, seen)) s.add(x); }
    before.set(id, s);
    return s;
  };

  // reachability: a quest is reachable when all its requires are (cycles / unknown ids never are)
  const reach = new Map<string, boolean>();
  const reachable = (id: string, stack = new Set<string>()): boolean => {
    if (reach.has(id)) return reach.get(id)!;
    const q = ids.get(id);
    if (!q || stack.has(id)) return false;
    stack.add(id);
    const ok = (q.requires ?? []).every((r) => reachable(r, stack));
    stack.delete(id);
    reach.set(id, ok);
    return ok;
  };

  for (const q of quests) {
    for (const r of q.requires ?? []) if (!ids.has(r)) err(q.id, `requires quest không tồn tại: ${r}`);
    if (!reachable(q.id)) err(q.id, 'không bao giờ mở được (requires vòng lặp / không tồn tại)');
    for (const f of q.requiresFlags ?? []) if (!producedByQuest.has(f) && !gameFlag(f)) warn(q.id, `requiresFlags "${f}" không thấy nguồn nào đặt cờ này`);
    for (const f of q.requiresFlags ?? []) {
      const m = /^choice:([^:]+):(.+)$/.exec(f);
      if (m && !rewardFlags.get(m[1])?.includes(f)) err(q.id, `requiresFlags "${f}": nhiệm vụ / lựa chọn không tồn tại`);
    }
    // the giver: the player must be able to find them (or the quest starts on its own)
    if (!q.autoStart) {
      if (!q.giver) err(q.id, 'không autoStart và không có người giao');
      else if (!people.has(q.giver)) err(q.id, `người giao "${q.giver}" không có trên bản đồ nào`);
      else hiddenCheck(q, q.giver, 'người giao', true);
    }
    if (!q.objectives.length) err(q.id, 'không có mục tiêu');
    q.objectives.forEach((o, i) => checkObjective(q, o, i));
    // two consecutive one-shot objectives on the same target can never both fire
    const seen = new Set<string>();
    for (const o of q.objectives) {
      if (!ONE_SHOT.has(o.type) || o.branch) continue;
      const k = `${o.type}:${o.target}`;
      if (seen.has(k)) err(q.id, `mục tiêu một-lần lặp lại trong cùng nhiệm vụ: ${k}`);
      seen.add(k);
      if (o.count > 1 && o.target && o.target !== '*' && !o.target.startsWith('eco:')) err(q.id, `${k} cần ${o.count} lần nhưng sự kiện chỉ xảy ra 1 lần`);
    }
    // branch objectives must belong to an option of the quest
    const opts = new Set(q.objectives.flatMap((o) => (o.options ?? []).map((x) => x.id)));
    for (const o of q.objectives) if (o.branch && !opts.has(o.branch)) err(q.id, `mục tiêu nhánh "${o.branch}" không có lựa chọn tương ứng`);
  }

  /** NPC hidden (hideIf already set / showIf never set) at the time the quest needs them. */
  function hiddenCheck(q: QuestDef, who: string, role: string, giving: boolean, skipIf: string[] = []): void {
    const p = people.get(who);
    if (!p) return;
    const sure = new Set([...(q.requiresFlags ?? []), ...[...pre(q.id)].flatMap((r) => rewardFlags.get(r) ?? [])]);
    // the quest's own reward flags hide them only after completion — fine; but a flag set before it runs is a dead end
    // a flag that also skips the objective (skipIf) is fine: the step is passed when the person leaves
    for (const f of p.hideIf ?? []) if (sure.has(f) && !skipIf.includes(f)) err(q.id, `${role} "${who}" đã bị ẩn (hideIf ${f}) khi nhiệm vụ cần`);
    if (giving) return;
    void p.showIf;
  }

  function checkObjective(q: QuestDef, o: ObjectiveDef, i: number): void {
    const t = o.target ?? '*', at = `mục tiêu #${i + 1} (${o.type} ${t})`;
    if (!(o.count >= 1)) err(q.id, `${at}: count không hợp lệ`);
    if (o.marker?.region && !w.regions[o.marker.region]) err(q.id, `${at}: marker ở bản đồ không tồn tại ${o.marker.region}`);
    if (o.marker?.region && w.regions[o.marker.region]) {
      const r = w.regions[o.marker.region];
      if (o.marker.x < 0 || o.marker.y < 0 || o.marker.x >= r.width || o.marker.y >= r.height) err(q.id, `${at}: marker (${o.marker.x},${o.marker.y}) nằm ngoài bản đồ ${r.id}`);
    }
    if (t === '*') {
      if (['talk', 'trainer', 'activate', 'puzzle', 'rescue', 'choose'].includes(o.type)) err(q.id, `${at}: thiếu target`);
      return;
    }
    switch (o.type) {
      case 'talk': case 'choose':
        if (!people.has(t)) err(q.id, `${at}: không có NPC này`);
        else hiddenCheck(q, t, 'NPC', false, o.skipIf);
        if (o.type === 'choose' && !o.options?.length) err(q.id, `${at}: lựa chọn rỗng`);
        break;
      case 'trainer':
        if (!people.get(t)?.trainer) err(q.id, `${at}: không có huấn luyện viên này`);
        else hiddenCheck(q, t, 'HLV', false, o.skipIf);
        break;
      case 'explore':
        if (t.startsWith('dock:')) { if (!has((r) => r.docks, t.slice(5))) err(q.id, `${at}: không có bến này`); }
        else if (t.startsWith('clue:')) { if (!w.legends.has(t.slice(5))) err(q.id, `${at}: không có huyền thoại này`); }
        else if (!isArea(t)) err(q.id, `${at}: không có khu vực này`);
        break;
      case 'activate':
        if (t.startsWith('field:')) { if (!has((r) => r.field as { id: string }[] | undefined, t.slice(6))) err(q.id, `${at}: không có chướng ngại này`); }
        else if (t.startsWith('eco:')) break;
        else if (!has((r) => r.waypoints, t)) err(q.id, `${at}: không có trạm này`);
        break;
      case 'boss':
        if (!w.bosses.has(t)) err(q.id, `${at}: không có boss này`);
        break;
      case 'collect':
        if (!isChest(t) && !w.gatherKinds.has(t) && t !== 'market') err(q.id, `${at}: không có rương / loại thu thập này`);
        break;
      case 'rescue':
        if (!regs.some((r) => r.rescue?.id === t)) err(q.id, `${at}: không có điểm giải cứu này`);
        break;
      case 'puzzle':
        if (!has((r) => r.puzzles, t)) err(q.id, `${at}: không có câu đố này`);
        break;
      case 'dungeon':
        if (!has((r) => r.dungeons, t.split(':')[0])) err(q.id, `${at}: không có hầm ngục này`);
        break;
      case 'capture': case 'defeat': case 'evolve':
        if (!w.species.has(t)) err(q.id, `${at}: không có loài này`);
        break;
      case 'hold': case 'destroy': case 'escort':
        if (!o.encounter) err(q.id, `${at}: thiếu encounter`);
        break;
    }
  }
  return out;
}
