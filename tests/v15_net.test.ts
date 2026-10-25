import { describe, expect, it } from 'vitest';
import { POKEMON } from '../src/core/data';
import { STEP } from '../src/core/world';
import { buildDuel, DuelMirror, isLegendary, packSnapshot, RENTAL_TEAMS, RULESETS, shareableEvents, validateParty } from '../src/net/duel';
import type { DuelMon, NetMsg } from '../src/net/protocol';
import { DuelHandshake, DuelStart, NetSession } from '../src/net/session';
import { hostRoom, joinRoom, normalizeCode, newRoomCode } from '../src/net/transport';

const until = async (cond: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!cond()) { if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 10)); }
};

describe('online: rules & team checks', () => {
  it('rental teams are valid under the standard rules', () => {
    for (const t of RENTAL_TEAMS) expect(validateParty(t.party, RULESETS.standard), t.name).toEqual([]);
  });
  it('rejects impossible or illegal parties', () => {
    const ok: DuelMon = { species: 'pikachu', level: 50 };
    expect(validateParty([], RULESETS.standard)).not.toEqual([]);
    expect(validateParty([{ ...ok, species: 'missingno' }], RULESETS.standard).join()).toContain('Loài');
    expect(validateParty([{ ...ok, level: 101 }], RULESETS.standard).join()).toContain('cấp');
    expect(validateParty([{ ...ok, ivs: { hp: 40, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } }], RULESETS.standard).join()).toContain('IV');
    expect(validateParty([{ ...ok, evs: { hp: 252, atk: 252, def: 252, spa: 0, spd: 0, spe: 0 } }], RULESETS.standard).join()).toContain('EV');
    expect(validateParty([{ ...ok, held: 'master-sword' }], RULESETS.standard).join()).toContain('vật phẩm');
    expect(validateParty([ok, ok], RULESETS.standard).join()).toContain('Trùng');
    expect(validateParty([ok, ok], RULESETS.open)).toEqual([]);
    expect(validateParty([{ species: 'mewtwo', level: 70 }], RULESETS.standard).join()).toContain('huyền thoại');
    expect(validateParty([{ species: 'mewtwo', level: 70 }], RULESETS.legends)).toEqual([]);
    expect(validateParty([{ species: 'charizard-mega-x', level: 50 }], RULESETS.open).join()).toContain('Mega');
    expect(validateParty(Array(7).fill(0).map((_, i) => ({ species: ['pikachu', 'eevee', 'snorlax', 'onix', 'abra', 'gastly', 'zubat'][i], level: 5 })), RULESETS.standard).join()).toContain('Tối đa 6');
  });
  it('legendaries of every generation are recognised', () => {
    for (const id of ['mewtwo', 'rayquaza', 'arceus', 'zekrom', 'xerneas', 'solgaleo', 'zacian', 'koraidon']) if (POKEMON.has(id)) expect(isLegendary(id), id).toBe(true);
    expect(isLegendary('pikachu')).toBe(false);
  });
  it('room codes: 6 unambiguous characters', () => {
    for (let i = 0; i < 50; i++) expect(newRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(normalizeCode(' ab-c 23x ')).toBe('ABC23X');
  });
});

describe('online: host simulation mirrored on the guest', () => {
  const host = RENTAL_TEAMS[0].party, guest = RENTAL_TEAMS[1].party;

  it('the guest rebuilds the same duel with its own side as "home" and follows the host snapshot', () => {
    const b = buildDuel(42, RULESETS.standard, host, guest);
    const mirror = new DuelMirror(42, RULESETS.standard, host, guest, b.roster);
    const w = b.world;
    let n = 0, sent = 0;
    for (let i = 0; i < 60 * 20; i++) {
      w.step(STEP);
      shareableEvents(w.drainEvents());
      if (i % 3 === 2) {
        const snap = JSON.parse(JSON.stringify(packSnapshot(w, ++n))); // through the wire
        sent += JSON.stringify(snap).length;
        mirror.push(snap, i * 16.7);
        mirror.interpolate(i * 16.7 + 50);
      }
    }
    // guest's own side (host's rival) is home in the mirror
    const hostRival = w.rival!.allies.map((u) => [u.defId, u.hp, u.fainted]);
    const mirrorHome = mirror.world.allies.map((u) => [u.defId, u.hp, u.fainted]);
    expect(mirrorHome).toEqual(hostRival);
    expect(mirror.world.rival!.allies.map((u) => u.hp)).toEqual(w.allies.map((u) => u.hp));
    // positions match the newest snapshot (within one snapshot of movement)
    const a = w.allies[0], ma = mirror.unit(a.id)!;
    expect(Math.hypot(a.x - mirror.mx(ma.x), a.y - ma.y)).toBeLessThan(40);
    // mirrored: the guest's own trainer stands on the left of its screen
    expect(mirror.world.trainer.x).toBeLessThan(mirror.world.rival!.trainer.x);
    // bandwidth: snapshots at 20 Hz stay small
    const perSecond = sent / 20;
    console.info(`[net] snapshot traffic ≈ ${(perSecond / 1024).toFixed(1)} KB/s`);
    expect(perSecond).toBeLessThan(40 * 1024);
  });

  it('events are flipped into the guest perspective', () => {
    const b = buildDuel(1, RULESETS.standard, host, guest);
    const mirror = new DuelMirror(1, RULESETS.standard, host, guest, b.roster);
    const ev = mirror.flipEvents([{ t: 'dmg', x: 0, y: 0, amount: 5, crit: false, eff: 1, victimTeam: 'ally' }, { t: 'faint', id: b.world.allies[0].id, name: 'x' }]);
    expect(ev[0]).toMatchObject({ victimTeam: 'enemy' });
    expect(ev[1]).toMatchObject({ id: mirror.unit(b.world.allies[0].id)!.id });
  });
});

describe('online: link + handshake (BroadcastChannel, like two tabs)', () => {
  it('host and guest connect, exchange parties, the host validates and both get the same start', async () => {
    const a = new NetSession(), b = new NetSession();
    a.myName = 'An'; b.myName = 'Bình';
    const code = await a.host('local');
    await b.join(code, 'local');
    await until(() => a.connected && b.connected && a.peerName === 'Bình' && b.peerName === 'An');
    let sa: DuelStart | null = null, sb: DuelStart | null = null;
    const ha = new DuelHandshake((s) => (sa = s), () => {}, a), hb = new DuelHandshake((s) => (sb = s), () => {}, b);
    // an illegal guest party is rejected by the host
    hb.setTeam([{ species: 'mewtwo', level: 50 }], true);
    // (the guest's own check already refuses it)
    expect(hb.myReady).toBe(false);
    b.send({ t: 'team', party: [{ species: 'mewtwo', level: 50 }], ready: true } as NetMsg);
    ha.setTeam(RENTAL_TEAMS[0].party, true);
    await until(() => hb.rejected !== '');
    expect(hb.rejected).toContain('huyền thoại');
    hb.setTeam(RENTAL_TEAMS[2].party, true);
    await until(() => !!sa && !!sb);
    expect(sb!.seed).toBe(sa!.seed);
    expect(sb!.roster).toEqual(sa!.roster);
    expect(sb!.guest.map((m) => m.species)).toEqual(RENTAL_TEAMS[2].party.map((m) => m.species));
    // ping
    await until(() => a.pongs > 0 && b.pongs > 0, 4000);
    ha.dispose(); hb.dispose();
    b.leave();
    await until(() => a.status === 'closed');
    expect(a.error).toContain('rời');
    a.leave();
  }, 15_000);

  it('a second guest is refused; a wrong code fails', async () => {
    const h = await hostRoom('local');
    const g1 = await joinRoom(h.code, 'local');
    await expect(joinRoom(h.code, 'local', 1500)).rejects.toThrow(/đủ người/);
    await expect(joinRoom('ZZZZZZ', 'local', 600)).rejects.toThrow(/Không tìm thấy/);
    g1.close();
  });
});
