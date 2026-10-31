import { effectiveness } from './typeChart';
import { Category, PokeType } from './types';
import { teraPower, teraStab } from './gimmicks';

export interface DamageInput {
  level: number;
  power: number;
  category: Category;
  skillType: PokeType;
  attackerTypes: readonly PokeType[];
  defenderTypes: readonly PokeType[];
  atk: number;
  spa: number;
  def: number;
  spd: number;
  /** 0..1 roll used for crit check */
  critRoll: number;
  critRate: number;
  /** 0..1 roll mapped to 0.85..1.00 variance */
  varianceRoll: number;
  /** Combined buff/debuff/upgrade multiplier */
  modifier: number;
  /** Terastallized attacker: its Tera Type (attackerTypes stay its original types) */
  teraType?: PokeType | null;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
  effectiveness: number;
  stab: boolean;
}

export const CRIT_MULT = 1.5;
export const STAB_MULT = 1.5;

/**
 * Main-series style damage:
 * ((2L/5 + 2) * Power * A/D / 50 + 2) * STAB * Type * Crit * Random * Modifier
 */
export function computeDamage(i: DamageInput): DamageResult {
  const eff = effectiveness(i.skillType, i.defenderTypes);
  const stabMult = i.teraType ? teraStab(i.attackerTypes, i.teraType, i.skillType) : i.attackerTypes.includes(i.skillType) ? STAB_MULT : 1;
  const stab = stabMult > 1;
  const crit = i.critRoll < i.critRate;
  if (eff === 0 || i.power <= 0) return { amount: 0, crit: false, effectiveness: eff, stab };
  const a = i.category === 'special' ? i.spa : i.atk;
  const d = Math.max(1, i.category === 'special' ? i.spd : i.def);
  const power = teraPower(i.power, i.skillType, i.teraType);
  const base = (((2 * i.level) / 5 + 2) * power * (a / d)) / 50 + 2;
  const variance = 0.85 + 0.15 * i.varianceRoll;
  const raw = base * stabMult * eff * (crit ? CRIT_MULT : 1) * variance * i.modifier;
  return { amount: Math.max(1, Math.floor(raw)), crit, effectiveness: eff, stab };
}
