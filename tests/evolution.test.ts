import { describe, expect, it } from 'vitest';
import { beatBossTo } from './bossHelpers';
import { FIELD } from '../src/core/fieldRules';
import { POKEMON, validateData } from '../src/core/data';
import { canMega, evolutionLine, evolutionsOf, ITEM_DEFS, itemEvolution, levelEvolution, megaFormsOf } from '../src/core/evolution';
import { rollOffers, emptyMods } from '../src/core/upgrades';
import { Rng } from '../src/core/rng';
import { STEP, World } from '../src/core/world';
import { unlockedSkills } from '../src/core/learnset';
import { makeWildState } from '../src/core/wildAI';
import { AdventureState } from '../src/adventure/AdventureState';
import { defaultSave } from '../src/systems/saveSchema';
import { convertPixels } from '../src/render/spriteRegistry';

describe('evolution rules (PokéAPI chains)', () => {
  it('level evolutions follow the real min levels', () => {
    expect(levelEvolution('charmander', 15)).toBeNull();
    expect(levelEvolution('charmander', 16)?.to).toBe('charmeleon');
    expect(levelEvolution('charmeleon', 36)?.to).toBe('charizard');
    expect(levelEvolution('caterpie', 7)?.to).toBe('metapod');
    expect(levelEvolution('diglett', 26)?.to).toBe('dugtrio');
    expect(evolutionLine('bulbasaur')).toEqual(['ivysaur', 'venusaur']);
  });
  it('stone evolutions need the right stone', () => {
    expect(levelEvolution('pikachu', 99)).toBeNull();
    expect(itemEvolution('pikachu', 'thunder-stone')?.to).toBe('raichu');
    expect(itemEvolution('pikachu', 'leaf-stone')).toBeNull();
    expect(itemEvolution('gloom', 'leaf-stone')?.to).toBe('vileplume');
  });
  it('unsupported conditions are reported, never silently allowed', () => {
    // trade evolutions → Linking Cord
    expect(itemEvolution('graveler', 'linking-cord')?.to).toBe('golem');
    expect(itemEvolution('kadabra', 'linking-cord')?.to).toBe('alakazam');
    expect(levelEvolution('graveler', 99)).toBeNull();
    // friendship (Golbat → Crobat) and held-item trade (Onix + Metal Coat → Steelix) are real rules now
    const crobat = evolutionsOf('golbat').find((e) => e.to === 'crobat')!;
    expect(crobat.unsupported).toBeNull();
    expect(levelEvolution('golbat', 40, { friendship: 100 })).toBeNull();
    expect(levelEvolution('golbat', 40, { friendship: 160 })?.to).toBe('crobat');
    expect(itemEvolution('onix', 'linking-cord')).toBeNull();
    expect(itemEvolution('onix', 'linking-cord', { heldItem: 'metal-coat' })?.to).toBe('steelix');
    // conditions that can't exist here are reported, never silently allowed
    expect(evolutionsOf('eevee').find((e) => e.to === 'glaceon' && e.rule.location)!.unsupported).toMatch(/địa điểm|chưa có/);
    expect(evolutionsOf('farfetchd').find((e) => e.to === 'sirfetchd')!.unsupported).toMatch(/chưa hỗ trợ/);
    expect(levelEvolution('gulpin', 26)?.to).toBe('swalot');
    expect(itemEvolution('eevee', 'water-stone')?.to).toBe('vaporeon');
    expect(itemEvolution('eevee', 'fire-stone')?.to).toBe('flareon');
  });
  it('every evolvable target has data + is valid', () => {
    expect(validateData()).toEqual([]);
    for (const p of POKEMON.values()) for (const e of evolutionsOf(p.id)) if (!e.unsupported) expect(POKEMON.has(e.to)).toBe(true);
  });
});

describe('mega rules', () => {
  it('needs Key Stone + matching stone, one at a time, cooldown', () => {
    expect(megaFormsOf('charizard').map((m) => m.form).sort()).toEqual(['charizard-mega-x', 'charizard-mega-y']);
    expect(canMega('charizard', 'charizardite-x', false, false, 0).ok).toBe(false);
    expect(canMega('charizard', 'charcoal', true, false, 0).ok).toBe(false);
    expect(canMega('charizard', 'charizardite-y', true, false, 0)).toEqual({ ok: true, form: 'charizard-mega-y' });
    expect(canMega('charizard', 'charizardite-x', true, true, 0).ok).toBe(false);
    expect(canMega('charizard', 'charizardite-x', true, false, 30).reason).toMatch(/hồi/);
    expect(canMega('pikachu', 'charizardite-x', true, false, 0).ok).toBe(false);
  });
  it('mega forms use PokéAPI mega stats and abilities', () => {
    const x = POKEMON.get('charizard-mega-x')!;
    expect(x.types).toEqual(['fire', 'dragon']);
    expect(x.baseStats.atk).toBe(130);
    expect(x.passive.kind).toBe('meleeBoost');
    expect(POKEMON.get('venusaur-mega')!.passive.kind).toBe('typeResist');
  });
});

describe('World: transform, equipment, mega', () => {
  const world = () => new World({ mode: 'adventure', seed: 3, width: 4000, height: 4000 });
  it('transformAlly evolves in place keeping level and HP ratio', () => {
    const w = world();
    const u = w.addPokemon('charmander', { level: 20 });
    u.hp = Math.round(u.maxHp / 2);
    const before = u.maxHp;
    w.transformAlly(u, 'charmeleon');
    expect(u.defId).toBe('charmeleon');
    expect(u.level).toBe(20);
    expect(u.maxHp).toBeGreaterThan(before);
    expect(u.hp / u.maxHp).toBeCloseTo(0.5, 1);
    // Adventure kits unlock by level (learnset): Lv20 knows the first three slots
    expect(u.skills.map((s) => s.def.id)).toEqual(unlockedSkills('charmeleon', 20));
  });
  it('mega transforms and reverts', () => {
    const w = world();
    const u = w.addPokemon('charizard', { level: 40, held: 'charizardite-x' });
    w.transformAlly(u, 'charizard-mega-x', { mega: true });
    expect(u.megaFrom).toBe('charizard');
    expect(u.types).toContain('dragon');
    w.revertMega(u);
    expect(u.defId).toBe('charizard');
    expect(u.megaFrom).toBeNull();
    expect(u.heldId).toBe('charizardite-x');
  });
  it('held items change real combat numbers', () => {
    const dmgWith = (held: string | null) => {
      const w = new World({ mode: 'adventure', seed: 9, width: 4000, height: 4000 });
      const a = w.addPokemon('charmander', { level: 30, held });
      const e = w.spawnWild('caterpie', 10, a.x + 200, a.y, { hostile: true, hpMult: 50, wild: makeWildState(a.x + 200, a.y, 'neutral', { aggroR: 1 }) });
      e.moveSpeed = 0;
      for (let i = 0; i < 60 * 6; i++) w.step(STEP);
      return a.damageDealt;
    };
    const plain = dmgWith(null), charcoal = dmgWith('charcoal');
    expect(charcoal).toBeGreaterThan(plain * 1.08);
  });
  it('Leftovers regenerates, Focus Band can save from a lethal hit', () => {
    const w = world();
    const u = w.addPokemon('squirtle', { level: 20, held: 'leftovers' });
    u.hp = 10;
    for (let i = 0; i < 120; i++) w.step(STEP);
    expect(u.hp).toBeGreaterThan(10);
    let saved = 0;
    for (let i = 0; i < 60; i++) {
      const w2 = new World({ mode: 'adventure', seed: i, width: 4000, height: 4000 });
      const v = w2.addPokemon('squirtle', { level: 20, held: 'focus-band' });
      w2.applyDamage(v, 99999, null);
      if (!v.fainted) saved++;
    }
    expect(saved).toBeGreaterThan(3);
    expect(saved).toBeLessThan(25);
  });
});

describe('Survivor evolution & Mega cards (run-only)', () => {
  const view = (defId: string, level: number, mega = false) => ({ mods: emptyMods(), party: [{ uid: 1, defId, name: defId, level, mega, skills: [] }], recruitable: [] });
  it('offers evolution at the PokéAPI level', () => {
    expect(rollOffers(view('charmander', 15), new Rng(1)).some((o) => o.kind === 'evolve')).toBe(false);
    const offers = rollOffers(view('charmander', 16), new Rng(1));
    const evo = offers.find((o) => o.kind === 'evolve');
    expect(evo && evo.kind === 'evolve' && evo.to).toBe('charmeleon');
  });
  it('offers Mega for final forms from Lv32, only once', () => {
    const o = rollOffers(view('charizard', 40), new Rng(4));
    expect(o.some((x) => x.kind === 'evolve' && x.mega)).toBe(true);
    expect(rollOffers(view('charizard-mega-x', 40, true), new Rng(4)).some((x) => x.kind === 'evolve')).toBe(false);
  });
  it('choosing the card transforms the ally inside the run only', () => {
    const w = new World({ starter: 'charmander', seed: 2 });
    w.gainExp(3000);
    w.state = 'levelup';
    w.currentOffers = [{ kind: 'evolve', key: 'k', unitUid: w.allies[0].id, to: 'charmeleon', mega: false, rarity: 'epic', title: '', description: '', icon: '', preview: '' }];
    w.pendingLevelUps = 1;
    w.chooseOffer(0);
    expect(w.allies[0].defId).toBe('charmeleon');
  });
});

describe('AdventureState: equipment, evolution, shop', () => {
  it('equip / unequip moves items between bag and Pokémon', () => {
    const st = new AdventureState(defaultSave());
    const p = st.addPokemon('pikachu', 10, 'wild');
    st.addItems({ magnet: 1, 'scope-lens': 1 });
    expect(st.equip(p.uid, 'magnet')).toBe(true);
    expect(st.item('magnet')).toBe(0);
    expect(st.equip(p.uid, 'scope-lens')).toBe(true);
    expect(st.item('magnet')).toBe(1);
    expect(st.unequip(p.uid)).toBe(true);
    expect(st.item('scope-lens')).toBe(1);
    expect(st.equip(p.uid, 'potion')).toBe(false);
  });
  it('evolves permanently only when conditions are met', () => {
    const st = new AdventureState(defaultSave());
    const c = st.addPokemon('charmander', 15, 'starter');
    expect(st.pendingEvolution(c.uid)).toBeNull();
    expect(st.evolve(c.uid, 'charmeleon')).toBe(false);
    st.gainExp([c.uid], 100000);
    expect(st.pendingEvolution(c.uid)).toBe('charmeleon');
    st.declineEvolution(c.uid);
    expect(st.pendingEvolution(c.uid)).toBeNull();
    expect(st.evolve(c.uid, 'charmeleon')).toBe(true);
    expect(st.owned(c.uid)!.species).toBe('charmeleon');
    expect(st.save.pokedex.caught).toContain('charmeleon');
    const pika = st.addPokemon('pikachu', 5, 'wild');
    expect(st.stoneEvolution(pika.uid, 'thunder-stone')).toBe('raichu');
    expect(st.evolve(pika.uid, 'raichu', 'thunder-stone')).toBe(false); // no stone in bag
    st.addItems({ 'thunder-stone': 1 });
    expect(st.evolve(pika.uid, 'raichu', 'thunder-stone')).toBe(true);
    expect(st.item('thunder-stone')).toBe(0);
  });
  it('shop spends money', () => {
    const st = new AdventureState(defaultSave());
    expect(st.buy('pokeball', 200)).toBe(false);
    st.earn(500);
    expect(st.buy('pokeball', 200)).toBe(true);
    expect(st.money).toBe(300);
    expect(st.item('pokeball')).toBe(1);
  });
  it('every item definition is complete', () => {
    for (const it of ITEM_DEFS.values()) {
      if (it.kind === 'held') expect(it.effect, it.id).toBeTruthy();
      if (it.kind === 'megaStone') expect(POKEMON.has(it.form!), it.id).toBe(true);
    }
  });
});

describe('IcyEthics sprite conversion', () => {
  it('trims, downsamples 2x keeping outlines, builds a palette grid', () => {
    const W = 8, H = 8;
    const data = new Uint8ClampedArray(W * H * 4);
    const set = (x: number, y: number, c: number[]) => data.set([...c, 255], (y * W + x) * 4);
    for (let y = 2; y < 6; y++) for (let x = 2; x < 6; x++) set(x, y, [200, 60, 60]);
    for (let x = 2; x < 6; x++) set(x, 5, [10, 10, 10]); // dark bottom outline row
    const g = convertPixels(data, W, H);
    expect(g.rows.length).toBe(2);
    expect(g.rows[0].length).toBe(2);
    expect(Object.values(g.pal)).toContain('#c83c3c');
    expect(g.rows.join('')).not.toContain('.');
  });
});

describe('World boss: Mega Venusaur', () => {
  it('spawns with its own AI, enters 3 phases and the shade circles protect', () => {
    const w = new World({ mode: 'adventure', seed: 7, width: 6000, height: 6000 });
    w.addPokemon('caterpie', { level: 5 }); // weak partner: phases are driven by the test
    const t = w.trainer;
    const b = w.spawnBoss('mega-venusaur', 24, false, { x: t.x + 260, y: t.y });
    t.maxHp = t.hp = 1e9; // a KO'd trainer ends the world (gameover) mid-test; the boss mechanics are what's tested
    expect(b.boss!.def.ai).toBe('venusaur');
    expect(b.boss!.phase).toBe(1);
    for (let i = 0; i < 60 * 10; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); }
    expect(w.zones.some((z) => z.owner === b) || b.lastSkill).toBeTruthy();
    const before = w.enemies.length;
    w.applyDamage(b, Math.ceil(b.hp - b.maxHp * 0.49), null); // just under the 50 % threshold, no reliance on the partner's hits
    const spawnedNow = () => w.enemies.filter((e) => e.tag === 'boss-add').length;
    w.step(STEP);
    expect(b.boss!.phase).toBe(2);
    // Oddish guards: one per trainer in the fight (one Pokémon per trainer — the boss defines up to 4)
    expect(spawnedNow()).toBe(FIELD.bossAddsPerTrainer);
    expect(w.enemies.length).toBeGreaterThan(before);
    beatBossTo(w, b, 0.2); // waits out the phase-2 cinematic (invulnerable) first
    expect(b.boss!.phase).toBe(3);
    // force a sunburst and stand in a shade circle
    let sun = null;
    for (let i = 0; i < 60 * 30 && !sun; i++) { w.trainer.hp = w.trainer.maxHp; w.step(STEP); sun = w.zones.find((z) => z.active && z.safe); }
    expect(sun).toBeTruthy();
    const spot = sun!.safe![0];
    w.teleport(spot.x, spot.y);
    const hp0 = w.trainer.hp;
    let hitBySun = false;
    for (let i = 0; i < 60 * 3; i++) {
      w.teleport(spot.x, spot.y);
      const before = w.trainer.hp;
      w.step(STEP);
      if (!sun!.active && before - w.trainer.hp > hp0 * 0.5) hitBySun = true;
    }
    expect(hitBySun).toBe(false);
  });
});
