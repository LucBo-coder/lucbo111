import cache from '../data/pokeapi/pokeapi-cache.json';
import fakemon from '../data/fakemon.json';
import { POKEMON } from './data';
import type { PassiveDef } from './types';

type AbilityEntry = { name: string; hidden: boolean };
const species = { ...cache.species, ...fakemon } as unknown as Record<string, { abilities?: AbilityEntry[] }>;
/** Slots 0/1 = ordinary abilities; 2 = Hidden Ability. Slots survive evolution. */
export function abilityOptions(id: string): { slot: number; id: string; hidden: boolean }[] {
  const list = species[id]?.abilities;
  if (!list?.length) return [{ slot: 0, id: POKEMON.get(id)?.passive.id ?? 'keen-eye', hidden: false }];
  let normal = 0;
  return list.map(a => ({ slot: a.hidden ? 2 : normal++, id: a.name, hidden: a.hidden }));
}
export function rollAbilitySlot(id: string, random: () => number = Math.random, hidden = false): number {
  const all = abilityOptions(id), rare = all.find(a => a.hidden);
  if (hidden && rare && random() < 0.2) return 2;
  const pool = all.filter(a => !a.hidden);
  return (pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? all[0]).slot;
}
export function abilityOf(id: string, slot = 0): { slot: number; id: string; hidden: boolean } {
  const all = abilityOptions(id);
  return all.find(a => a.slot === slot) ?? all[0];
}
// Reuse the game's authored real-time effects for every ability already represented in the dex.
const effects = new Map<string, PassiveDef>();
for (const p of POKEMON.values()) if (!effects.has(p.passive.id)) effects.set(p.passive.id, p.passive);
const title = (id: string) => id.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
export function abilityEffect(speciesId: string, slot = 0): PassiveDef {
  const { id } = abilityOf(speciesId, slot);
  const base = { id, name: title(id) };
  const absorb: Record<string, PassiveDef['type']> = { 'water-absorb': 'water', 'dry-skin': 'water', 'volt-absorb': 'electric' };
  if (absorb[id]) return { ...base, kind: 'typeAbsorb', type: absorb[id], value: 0.25, description: 'Miễn sát thương hệ tương ứng, hồi 25% HP (hồi chiêu 3 giây).' };
  const immune: Record<string, PassiveDef['type']> = { levitate: 'ground', 'lightning-rod': 'electric', 'motor-drive': 'electric', 'storm-drain': 'water', 'flash-fire': 'fire', 'sap-sipper': 'grass', 'earth-eater': 'ground' };
  if (immune[id]) return { ...base, kind: 'typeResist', types: [immune[id]!], mult: 0, description: `Miễn sát thương hệ ${immune[id]}.` };
  if (id === 'static') return { ...base, kind: 'contactStatus', status: { kind: 'paralysis', chance: 0.3, duration: 3, magnitude: 0.4 }, description: 'Đòn tiếp xúc có 30% khiến kẻ tấn công bị tê liệt.' };
  if (id === 'huge-power' || id === 'pure-power') return { ...base, kind: 'physicalBoost', mult: 2, description: 'Sát thương vật lý nhân đôi.' };
  if (id === 'technician') return { ...base, kind: 'weakMoveBoost', mult: 1.5, description: 'Chiêu có sức mạnh không quá 60 gây thêm 50% sát thương.' };
  if (id === 'adaptability') return { ...base, kind: 'stabBoost', mult: 4 / 3, description: 'Tăng thêm 33% sát thương chiêu cùng hệ đang được hưởng STAB.' };
  if (id === 'battle-armor' || id === 'shell-armor') return { ...base, kind: 'critImmune', description: 'Không nhận đòn chí mạng.' };
  const effect = effects.get(id);
  if (effect) return { ...effect };
  return { ...base, kind: 'critBonus', value: 0.05, description: 'Hiệu ứng quy đổi trong chiến đấu thời gian thực: +5% chí mạng.' };
}
