import { describe, expect, it } from 'vitest';
import vnQuests from '../src/data/vietnam/quests.json';
import caMau from '../src/data/vietnam/ca-mau.json';
import anGiang from '../src/data/vietnam/an-giang.json';
import canTho from '../src/data/vietnam/can-tho.json';
import { AdventureState, ITEMS } from '../src/adventure/AdventureState';
import { addRep, REP_REGIONS, REP_TIERS, repFlag, repGreeting, repTier } from '../src/core/reputation';
import {
  matchup, pickLead, pickSwitch, potionsFor, REMATCH_COOLDOWN, rematchPrize, rematchReady, rematchTeam, shouldHeal, threat,
} from '../src/core/trainerAI';
import { defaultSave, migrate } from '../src/systems/saveSchema';
import type { PokeType } from '../src/core/types';

const mon = (types: PokeType[], hp = 100, maxHp = 100) => ({ types, hp, maxHp });

describe('trainer AI: switching, leads, Potions', () => {
  it('reads type match-ups from the 18-type chart', () => {
    expect(threat(['water'], ['fire'])).toBe(2);
    expect(threat(['electric'], ['ground'])).toBe(0);
    expect(matchup(['grass'], ['water'])).toBeGreaterThan(matchup(['fire'], ['water']));
  });

  it('a hurt Pokémon at a disadvantage is swapped for a reserve that resists the player', () => {
    const foe: PokeType[] = ['water'];
    const hurtFire = mon(['fire'], 30);
    const reserves = [mon(['normal']), mon(['grass']), mon(['grass'], 0)];
    expect(pickSwitch(hurtFire, reserves, foe)).toBe(1); // the fainted grass one is never picked
  });

  it('no swap while healthy, without a disadvantage, or with nothing better on the bench', () => {
    expect(pickSwitch(mon(['fire'], 80), [mon(['grass'])], ['water'])).toBe(-1);
    expect(pickSwitch(mon(['normal'], 20), [mon(['grass'])], ['water'])).toBe(-1);
    expect(pickSwitch(mon(['fire'], 20), [mon(['fire']), mon(['rock'])], ['water'])).toBe(-1);
  });

  it('the next Pokémon out is picked for the match-up; any healthy one without a foe', () => {
    expect(pickLead([mon(['fire']), mon(['electric']), mon(['ground'])], ['water'])).toBe(1);
    expect(pickLead([mon(['fire'], 0), mon(['bug'], 50)], null)).toBe(1);
    expect(pickLead([mon(['fire'], 0)], ['water'])).toBe(-1);
  });

  it('Potions: only under 30% HP and only while some are left', () => {
    expect(shouldHeal(mon(['fire'], 20), 1)).toBe(true);
    expect(shouldHeal(mon(['fire'], 20), 0)).toBe(false);
    expect(shouldHeal(mon(['fire'], 50), 1)).toBe(false);
    expect(potionsFor(2, false)).toBe(1);
    expect(potionsFor(3, false)).toBe(2);
    expect(potionsFor(1, true)).toBe(2);
  });
});

describe('trainer rematches', () => {
  it('wait for the cooldown since the last win (old saves without a record may rematch)', () => {
    expect(rematchReady(undefined, undefined, 0)).toBe(true);
    expect(rematchReady({ at: 100, wins: 0 }, undefined, 100 + REMATCH_COOLDOWN - 1)).toBe(false);
    expect(rematchReady({ at: 100, wins: 0 }, undefined, 100 + REMATCH_COOLDOWN)).toBe(true);
  });

  it('levels follow the player but stay bounded; species and order are kept', () => {
    const team: [string, number][] = [['geodude', 12], ['machop', 13]];
    const low = rematchTeam(team, 10, 0);
    expect(low.map(([sp]) => sp)).toEqual(['geodude', 'machop']);
    expect(low[1][1]).toBe(16); // at least +3 over the original lead
    const high = rematchTeam(team, 60, 0);
    expect(high[1][1]).toBe(13 + 15 + 3 - 3); // never more than 15 over the original
    expect(rematchTeam(team, 20, 1)[1][1]).toBe(rematchTeam(team, 20, 0)[1][1] + 2);
    expect(Math.max(...rematchTeam([['mewtwo', 99]], 100, 9).map(([, l]) => l))).toBeLessThanOrEqual(100);
    expect(rematchPrize(0)).toBeLessThan(rematchPrize(3));
    expect(rematchPrize(99)).toBe(rematchPrize(5));
  });
});

describe('per-province reputation', () => {
  it('tier table is ordered, every gift item exists, VN provinces have greetings for every tier', () => {
    REP_TIERS.forEach((t, i) => { if (i) expect(t.at).toBeGreaterThan(REP_TIERS[i - 1].at); });
    for (const [id, r] of Object.entries(REP_REGIONS)) {
      for (const gift of Object.values(r.rewards ?? {})) for (const k of Object.keys(gift)) expect(ITEMS[k], `${id} → ${k}`).toBeTruthy();
    }
    for (const id of ['ca-mau', 'an-giang', 'can-tho']) for (let t = 0; t < REP_TIERS.length; t++) expect(REP_REGIONS[id].greet?.[String(t)], `${id} ${t}`).toBeTruthy();
  });

  it('points are kept per region; milestones set their flag once', () => {
    const s = { reputation: 0, flags: [] as string[] } as { reputation: number; repBy?: Record<string, number>; flags: string[] };
    expect(addRep(s, 'ca-mau', 10).newTiers).toEqual([]);
    const g = addRep(s, 'ca-mau', 35); // 45 → tiers 1 and 2 at once
    expect(g.newTiers).toEqual([1, 2]);
    expect(s.flags).toContain(repFlag('ca-mau', 2));
    expect(addRep(s, 'ca-mau', 1).newTiers).toEqual([]);
    expect(s.repBy).toEqual({ 'ca-mau': 46 });
    expect(addRep(s, 'can-tho', 5).tier).toBe(0); // Cần Thơ starts from nothing
    expect(s.reputation).toBe(51);
    expect(repTier(80)).toBe(3);
    expect(repGreeting('ca-mau', 46)).toBe(REP_REGIONS['ca-mau'].greet!['2']);
    expect(repGreeting('starter-valley', 99)).toBeNull();
  });

  it('AdventureState: quest reputation goes to the current province, the gift is paid once and survives a reload', () => {
    const save = defaultSave();
    const st = new AdventureState(save);
    st.adv.campaign = 'vietnam';
    st.adv.region = 'an-giang';
    const balls = st.save.inventory?.greatball ?? 0;
    const lines = st.grant({ reputation: 20 });
    expect(lines.join(' ')).toContain('An Giang');
    expect(st.adv.repBy?.['an-giang']).toBe(20);
    expect(st.save.inventory.greatball).toBe(balls + 2); // tier-1 gift
    const reloaded = new AdventureState(migrate(JSON.parse(JSON.stringify(st.save))));
    reloaded.adv.region = 'an-giang';
    reloaded.grant({ reputation: 1 });
    expect(reloaded.save.inventory.greatball).toBe(balls + 2); // not paid again
    expect(reloaded.adv.repBy?.['an-giang']).toBe(21);
    expect(reloaded.adv.repBy?.['ca-mau']).toBeUndefined();
  });

  it('province quests unlock with the "Được tin cậy" milestone and use real NPCs of that province', () => {
    const npcs: Record<string, string[]> = {
      'ca-mau': caMau.npcs.map((n) => n.id), 'an-giang': anGiang.npcs.map((n) => n.id), 'can-tho': canTho.npcs.map((n) => n.id),
    };
    const rep = (vnQuests as { id: string; giver: string; requiresFlags?: string[]; objectives: { type: string; target?: string; marker?: { region?: string } }[] }[]).filter((q) => q.id.endsWith('-rep'));
    expect(rep.length).toBe(3);
    for (const q of rep) {
      const region = q.requiresFlags![0].split(':')[1];
      expect(q.requiresFlags).toEqual([repFlag(region, 2)]);
      expect(npcs[region]).toContain(q.giver);
      for (const o of q.objectives) {
        expect(o.marker?.region).toBe(region);
        if (o.type === 'talk') expect(npcs[region]).toContain(o.target);
      }
    }
    // locked before the milestone, available after
    const st = new AdventureState(defaultSave());
    st.adv.campaign = 'vietnam';
    const vn = new AdventureState(st.save);
    vn.quests.states['vn-cm-1'] = { status: 'completed', step: 0, progress: 0 };
    vn.quests.states['vn-cm-2'] = { status: 'completed', step: 0, progress: 0 };
    vn.quests.refresh();
    expect(vn.quests.states['vn-cm-rep'].status).toBe('locked');
    vn.adv.region = 'ca-mau';
    vn.grant({ reputation: 40 });
    vn.quests.refresh();
    expect(vn.quests.states['vn-cm-rep'].status).toBe('available');
  });
});
