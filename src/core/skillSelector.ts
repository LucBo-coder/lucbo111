import { effectiveness } from './typeChart';
import { PokeType, SkillDef } from './types';

/** Snapshot of everything the selector needs; built by the world, trivially faked in tests. */
export interface SelectorContext {
  selfTypes: readonly PokeType[];
  selfHpFrac: number;
  energy: number;
  /** Enemies within 90px of self */
  threatsNearSelf: number;
  hasShield: boolean;
  target: { types: readonly PokeType[]; dist: number; radius: number; hasStatus: (k: string) => boolean } | null;
  /** Number of enemies that would be inside an area of `radius` centred on the target */
  enemiesAroundTarget: (radius: number) => number;
  /** Most injured ally (trainer included) within reach */
  lowestAlly: { hpFrac: number; dist: number } | null;
  teamBuffActive: boolean;
}

export interface SkillSlotView {
  def: SkillDef;
  cooldownLeft: number;
}

export interface SkillChoice {
  slot: number;
  score: number;
  reason: string;
}

/**
 * Deterministic utility-scoring skill choice. Criteria (in spec order):
 * range, cooldown, energy, type advantage, enemies in area, ally needs support, self danger.
 */
export function chooseSkill(slots: readonly SkillSlotView[], ctx: SelectorContext, areaMult = 1): SkillChoice | null {
  let best: SkillChoice | null = null;
  const inDanger = ctx.selfHpFrac < 0.4 && ctx.threatsNearSelf > 0;

  slots.forEach((slot, i) => {
    const s = slot.def;
    if (slot.cooldownLeft > 0) return;
    if (ctx.energy < s.energyCost) return;

    let score = 0;
    let reason = '';
    switch (s.kind) {
      case 'heal': {
        const a = ctx.lowestAlly;
        if (!a || a.hpFrac > 0.65 || a.dist > s.range) return;
        // Urgency dominates: a critically hurt ally beats any damage option
        score = 80 + (1 - a.hpFrac) * 260 + (a.hpFrac < 0.35 ? 320 : 0);
        reason = 'ally-hurt';
        break;
      }
      case 'shield': {
        const pressure = ctx.threatsNearSelf;
        if (ctx.hasShield || (pressure < 2 && !inDanger)) return;
        score = 50 + pressure * 18 + (inDanger ? 320 : 0);
        reason = inDanger ? 'danger' : 'pressure';
        break;
      }
      case 'buff': {
        if (ctx.teamBuffActive || !ctx.target) return;
        score = 75;
        reason = 'buff-team';
        break;
      }
      case 'debuff': {
        const t = ctx.target;
        if (!t || t.dist > s.range + t.radius) return;
        if (s.status && t.hasStatus(s.status.kind)) return;
        score = 55 + ctx.enemiesAroundTarget(80) * 4;
        reason = 'debuff';
        break;
      }
      default: {
        const t = ctx.target;
        if (!t) return;
        if (t.dist > s.range + t.radius) return;
        if (s.power <= 0) {
          // Status-only area skills (Poison Powder): value = spreading the status to a group
          if (!s.status || t.hasStatus(s.status.kind)) return;
          score = 45 + ctx.enemiesAroundTarget((s.radius ?? 60) * areaMult) * 12;
          reason = 'status-area';
          break;
        }
        const eff = effectiveness(s.type, t.types);
        if (eff === 0) return;
        const stab = ctx.selfTypes.includes(s.type) ? 1.5 : 1;
        let hits = 1;
        if (s.kind === 'aoe' || s.kind === 'field') hits = Math.max(1, ctx.enemiesAroundTarget((s.radius ?? 60) * areaMult));
        else if (s.kind === 'cone') hits = Math.max(1, Math.min(4, ctx.enemiesAroundTarget(90 * areaMult)));
        else if (s.kind === 'projectile' && s.projectile) hits = Math.min(s.projectile.count, 1 + 0.5 * (s.projectile.count - 1));
        const fieldTicks = s.kind === 'field' && s.field ? Math.min(4, s.field.duration / s.field.tick) * 0.5 : 1;
        score = s.power * stab * eff * fieldTicks * (1 + 0.65 * (hits - 1));
        // Spending energy has an opportunity cost; free skills slightly preferred at equal value.
        score *= 1 - s.energyCost / 220;
        // Melee while in danger is risky for fragile roles; caller handles kiting, we just discount.
        if (inDanger && s.kind === 'melee') score *= 0.7;
        reason = eff > 1 ? 'super-effective' : hits > 1 ? 'multi-hit' : 'damage';
      }
    }
    if (!best || score > best.score) best = { slot: i, score, reason };
  });
  return best;
}
