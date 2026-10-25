import { describe, expect, it } from 'vitest';
import { STEP, World, Unit } from '../src/core/world';
import { getSkill } from '../src/core/data';
import { makeWildState } from '../src/core/wildAI';
import { ITEM_DEFS } from '../src/core/evolution';
import { SHOP } from '../src/adventure/AdventureState';

const NEW_HELD = ['life-orb', 'choice-band', 'choice-specs', 'choice-scarf', 'assault-vest', 'rocky-helmet', 'eviolite', 'sitrus-berry', 'focus-sash'];

const arena = (seed = 7) => new World({ mode: 'adventure', seed, width: 4000, height: 4000 });
function dummy(w: World, a: Unit, sp = 'caterpie', lv = 10): Unit {
  const e = w.spawnWild(sp, lv, a.x + 200, a.y, { hostile: true, hpMult: 50, wild: makeWildState(a.x + 200, a.y, 'neutral', { aggroR: 1 }) });
  e.moveSpeed = 0;
  return e;
}
/** One direct hit with a fixed skill (same seed → same rolls, so only the held item differs). */
function hitOnce(w: World, src: Unit, dst: Unit, skill: string): number {
  const before = dst.hp;
  (w as unknown as { hit(s: Unit, d: Unit, slot: unknown, m: number): void }).hit(src, dst, { def: getSkill(skill), cd: 0, level: 1, powerBonus: 0 }, 1);
  return before - dst.hp;
}

describe('held items: Life Orb / Choice / Assault Vest / Rocky Helmet / Eviolite / Sitrus / Focus Sash', () => {
  it('all exist with an effect and are sold in the shop', () => {
    for (const id of NEW_HELD) {
      expect(ITEM_DEFS.get(id)?.effect, id).toBeTruthy();
      expect(SHOP.some((s) => s.id === id), id).toBe(true);
    }
  });

  it('Life Orb: +30% damage, recoil throttled and never self-KOs', () => {
    const run = (held: string | null) => {
      const w = arena(9);
      const a = w.addPokemon('charmander', { level: 30, held });
      dummy(w, a);
      let minHp = a.hp;
      for (let i = 0; i < 60 * 6; i++) { w.step(STEP); minHp = Math.min(minHp, a.hp); }
      return { dealt: a.damageDealt, a, minHp };
    };
    const plain = run(null), orb = run('life-orb');
    expect(orb.dealt).toBeGreaterThan(plain.dealt * 1.15);
    expect(orb.minHp).toBeLessThan(orb.a.maxHp);
    expect(orb.minHp).toBeGreaterThanOrEqual(1);
    expect(orb.a.fainted).toBe(false);
  });

  it('Choice Band locks the holder into its first attacking skill until the fight ends', () => {
    const w = arena(3);
    const a = w.addPokemon('charmander', { level: 30, held: 'choice-band' });
    expect(a.skills.filter((s) => s.def.power > 0).length).toBeGreaterThan(1);
    const used = new Set<string>();
    const orig = w.beginCast.bind(w);
    w.beginCast = (u, i) => { if (u === a && u.skills[i].def.power > 0) used.add(u.skills[i].def.id); orig(u, i); };
    const e = dummy(w, a);
    for (let i = 0; i < 60 * 8; i++) { e.hostile = true; w.step(STEP); }
    expect(used.size).toBe(1);
    expect(a.choiceLock).toBe([...used][0]);
    // fight over (target gone) → unlocked after the idle delay
    e.alive = false;
    for (let i = 0; i < 60 * 3; i++) w.step(STEP);
    expect(a.choiceLock).toBeNull();
    // a physical skill gets +50%, a special one is unchanged
    const band = arena(1), plain = arena(1);
    const s1 = band.addPokemon('charmander', { level: 30, held: 'choice-band' }), s2 = plain.addPokemon('charmander', { level: 30 });
    const phys = hitOnce(band, s1, dummy(band, s1), 'metal_claw') / hitOnce(plain, s2, dummy(plain, s2), 'metal_claw');
    expect(phys).toBeGreaterThan(1.35);
    expect(phys).toBeLessThan(1.65);
  });

  it('Choice Scarf: +50% move speed', () => {
    const w = arena();
    const a = w.addPokemon('pikachu', { level: 20 });
    const base = w.speedFactor(a);
    w.setHeld(a, 'choice-scarf');
    expect(w.speedFactor(a)).toBeCloseTo(base * 1.5);
  });

  it('Assault Vest cuts special damage only and forbids status moves', () => {
    const vest = arena(2), plain = arena(2);
    const v = vest.addPokemon('squirtle', { level: 20, held: 'assault-vest' }), p = plain.addPokemon('squirtle', { level: 20 });
    const ev = dummy(vest, v, 'butterfree', 25), ep = dummy(plain, p, 'butterfree', 25);
    const special = hitOnce(vest, ev, v, 'silver_wind') / hitOnce(plain, ep, p, 'silver_wind');
    expect(special).toBeGreaterThan(0.55);
    expect(special).toBeLessThan(0.8);
    v.hp = v.maxHp; p.hp = p.maxHp;
    expect(hitOnce(vest, ev, v, 'metal_claw')).toBe(hitOnce(plain, ep, p, 'metal_claw'));
    expect((vest as unknown as { heldBlocks(u: Unit, s: unknown): boolean }).heldBlocks(v, getSkill('growl'))).toBe(true);
    expect((vest as unknown as { heldBlocks(u: Unit, s: unknown): boolean }).heldBlocks(v, getSkill('metal_claw'))).toBe(false);
  });

  it('Eviolite only helps species that can still evolve', () => {
    const ratio = (sp: string) => {
      const a = arena(4), b = arena(4);
      const u = a.addPokemon(sp, { level: 40, held: 'eviolite' }), v = b.addPokemon(sp, { level: 40 });
      return hitOnce(a, dummy(a, u, 'scyther', 40), u, 'metal_claw') / hitOnce(b, dummy(b, v, 'scyther', 40), v, 'metal_claw');
    };
    expect(ratio('bulbasaur')).toBeLessThan(0.8);
    expect(ratio('venusaur')).toBe(1);
  });

  it('Rocky Helmet hurts contact attackers (1/6 max HP, once per second)', () => {
    const w = arena();
    const a = w.addPokemon('onix', { level: 30, held: 'rocky-helmet' });
    const e = dummy(w, a, 'rattata', 20);
    const hp0 = e.hp;
    hitOnce(w, e, a, 'metal_claw');
    expect(hp0 - e.hp).toBeCloseTo(e.maxHp / 6, 0);
    const hp1 = e.hp;
    hitOnce(w, e, a, 'metal_claw');
    expect(e.hp).toBe(hp1);
    hitOnce(w, e, a, 'silver_wind');
    expect(e.hp).toBe(hp1);
  });

  it('Sitrus Berry heals 25% under half HP, then regrows after 45 s', () => {
    const w = arena();
    const a = w.addPokemon('squirtle', { level: 20, held: 'sitrus-berry' });
    w.applyDamage(a, a.maxHp * 0.6, null);
    expect(a.hp / a.maxHp).toBeGreaterThan(0.6);
    const after = a.hp;
    w.applyDamage(a, a.maxHp * 0.2, null);
    expect(a.hp).toBeLessThan(after);
    expect(a.berryCd).toBeGreaterThan(40);
  });

  it('Focus Sash survives one lethal hit from full HP only', () => {
    const w = arena();
    const a = w.addPokemon('abra', { level: 10, held: 'focus-sash' });
    w.applyDamage(a, 99999, null);
    expect(a.hp).toBe(1);
    expect(a.fainted).toBe(false);
    w.applyDamage(a, 99999, null);
    expect(a.fainted).toBe(true);
  });
});
