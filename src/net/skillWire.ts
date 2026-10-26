import { getSkill } from '../core/data';
import type { ActiveSkillResult, Unit } from '../core/world';
import type { SkillWire } from './protocol';

// Active skills over the network: the host packs the skill bar of the Pokémon a guest commands (duel / co-op),
// the guest copies it onto its render-only units so its bar shows real cooldowns, kept slots and the queued move.

const r1 = (v: number) => Math.round(v * 10) / 10;

export function packSkills(u: Unit, id = u.id): SkillWire {
  return [id, u.reserved, u.queuedSlot, u.skills.map((s) => s.def.id), u.skills.map((s) => r1(Math.max(0, s.cd))), u.skills.map((s) => r1(s.cdMax ?? 0))];
}

/** Guest: the host's skill bar state onto a mirror unit (skills rebuilt when they differ, e.g. after Mega Evolution). */
export function applySkills(u: Unit, w: SkillWire): void {
  const [, mask, queued, ids, cds, maxes] = w;
  if (!Array.isArray(ids) || !Array.isArray(cds)) return;
  if (u.skills.length !== ids.length || u.skills.some((s, i) => s.def.id !== ids[i])) {
    u.skills = ids.map((id) => ({ def: getSkill(id), cd: 0, level: 1, powerBonus: 0 }));
  }
  u.skills.forEach((s, i) => { s.cd = Number(cds[i]) || 0; s.cdMax = Number(maxes?.[i]) || s.cdMax; });
  u.reserved = Number(mask) | 0;
  u.queuedSlot = Number.isInteger(queued) ? queued : -1;
}

/** Valid slot of a remote request (index into the unit's skills, or the AI's pick). */
export function remoteSlot(u: Unit, slot: unknown): number | 'best' | null {
  if (slot === 'best') return 'best';
  return Number.isInteger(slot) && (slot as number) >= 0 && (slot as number) < u.skills.length ? (slot as number) : null;
}

/** Banner text for an active skill that did not go off (null when it was cast or queued). */
export function skillFailText(r: ActiveSkillResult, unit: string, skill: string): string | null {
  const msg: Partial<Record<ActiveSkillResult, string>> = {
    cooldown: `${skill || 'Mọi chiêu'} đang hồi`,
    energy: `${unit} không đủ năng lượng`,
    noTarget: 'Không có mục tiêu trong tầm',
    immune: 'Mục tiêu miễn nhiễm chiêu này',
    global: 'Chờ một chút trước lệnh kế tiếp',
    fainted: `${unit} đã kiệt sức`,
    blocked: `${skill} đang bị khóa (vật phẩm cầm)`,
  };
  return msg[r] ?? null;
}
