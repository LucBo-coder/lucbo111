// Signature mechanics of the legendary bosses (V38): every Legendary / Mythical / Ultra Beast fights with its own set of
// mechanics on top of the shared patterns (beam, volley, nova, field, ultimate) of World.legendaryThink — so no two
// fights play the same. A library of mechanics (each telegraphed: what the player sees is exactly what hits), and a
// table giving each legendary 2–3 of them, chosen from its lore. The first mechanic is used from phase 1, the second
// joins in phase 2, the third in phase 3: the fight escalates. Rayquaza keeps its own script (bosses/rayquaza.ts).

import type { StatusApply, StatusKind } from '../types';
import type { SkillSlot, Unit, World } from '../world';

export type MechId =
  | 'clones' | 'crystals' | 'heal' | 'stance' | 'charge' | 'pull' | 'mines' | 'sweep' | 'orbit' | 'waves' | 'rings'
  | 'grid' | 'meteor' | 'mark' | 'trail' | 'vanish' | 'quake' | 'enrage' | 'minions' | 'roots' | 'freeze' | 'drain';

export interface MechSpec {
  id: MechId;
  /** minions / crystals: the species that come (default: Carbink crystals) */
  species?: string[];
  /** how many (clones, crystals, minions, dashes, mines) */
  count?: number;
  /** status of mines / roots (default: the legend's field status, or a heavy slow for roots) */
  status?: StatusKind;
}

/** Name (HUD cast warning, banner) and the one-line way to beat it (Pokédex, help). */
export const MECH_INFO: Record<MechId, { name: string; how: string }> = {
  clones: { name: 'Ảo ảnh', how: 'tạo bản sao yếu và đổi chỗ với một bản — đánh vỡ bản sao để tìm bản thật' },
  crystals: { name: 'Lá chắn tinh thể', how: 'gọi tinh thể bảo vệ; còn tinh thể thì không gây sát thương được — phá chúng trước' },
  heal: { name: 'Hồi phục', how: 'đứng yên vận sức hồi máu — dồn sát thương để cắt ngang' },
  stance: { name: 'Thế phản đòn', how: 'thủ thế vài giây, đòn đánh vào bị dội ngược một nửa — ngừng tấn công lúc đó' },
  charge: { name: 'Lao tới', how: 'vạch một đường rồi lao theo — tránh khỏi đường vạch' },
  pull: { name: 'Hố hút', how: 'hút mọi thứ lại gần rồi nổ quanh mình — chạy ngược ra ngoài' },
  mines: { name: 'Bãi bẫy', how: 'rải bẫy nổ chậm khắp sân — đứng ở chỗ trống' },
  sweep: { name: 'Tia quét', how: 'tia quét một vòng quanh nó — chạy theo chiều quét ở phía sau tia' },
  orbit: { name: 'Quỹ đạo', how: 'các khối quay quanh nó — đứng sát hoặc thật xa' },
  waves: { name: 'Sóng tràn', how: 'những đợt sóng quét ngang sân, mỗi đợt có một khe — tìm khe' },
  rings: { name: 'Sóng xung kích', how: 'các vòng nổ lan dần ra ngoài — lùi vào giữa hai vòng' },
  grid: { name: 'Lưới sét', how: 'sân chia ô bàn cờ, hai đợt nổ xen kẽ — đổi ô kịp lúc' },
  meteor: { name: 'Mưa thiên thạch', how: 'thiên thạch rơi khắp sân, vài khối nhắm vào bạn — nhìn bóng mà tránh' },
  mark: { name: 'Đánh dấu', how: 'đánh dấu chỗ bạn đứng, nổ lớn sau vài giây — rời khỏi vòng' },
  trail: { name: 'Vệt cháy', how: 'lao quanh sân để lại vệt nguy hiểm — đừng đứng trên vệt' },
  vanish: { name: 'Ẩn mình', how: 'biến mất (không trúng đòn) rồi hiện ra ngay dưới chân bạn — nhìn vòng báo mà né' },
  quake: { name: 'Nứt đất', how: 'các đường nứt toả ra từ nó — đứng giữa hai đường' },
  enrage: { name: 'Tích nộ', how: 'mạnh dần theo thời gian — dồn sát thương lớn để chặn đà' },
  minions: { name: 'Gọi đồng bọn', how: 'gọi đồng bọn tới — dọn chúng hoặc kéo xa khỏi boss' },
  roots: { name: 'Trói chân', how: 'trói chân chỗ bạn đứng — di chuyển liên tục' },
  freeze: { name: 'Băng phong', how: 'những khối băng làm đóng băng — đừng đứng trong vòng' },
  drain: { name: 'Hút sinh lực', how: 'một lúc hồi máu theo sát thương gây ra — giữ khoảng cách' },
};

const M = (id: MechId, o: Omit<MechSpec, 'id'> = {}): MechSpec => ({ id, ...o });
const CELLS = ['carbink'];

/** Each legendary's own mechanics (first from phase 1, second from phase 2, third from phase 3). */
export const LEGEND_MECHS: Record<string, MechSpec[]> = {
  // Kanto birds and the psychic pair
  articuno: [M('freeze'), M('waves'), M('mark')],
  zapdos: [M('grid'), M('charge'), M('enrage')],
  moltres: [M('trail'), M('meteor'), M('rings')],
  mewtwo: [M('mark'), M('stance'), M('pull')],
  mew: [M('clones'), M('orbit'), M('mark')],
  // Johto
  raikou: [M('charge'), M('grid'), M('rings')],
  entei: [M('trail'), M('quake'), M('enrage')],
  suicune: [M('waves'), M('heal'), M('orbit')],
  lugia: [M('sweep'), M('waves'), M('vanish')],
  'ho-oh': [M('trail'), M('heal'), M('meteor')],
  celebi: [M('roots'), M('heal'), M('mark')],
  // Hoenn
  regirock: [M('quake'), M('crystals', { species: CELLS }), M('stance')],
  regice: [M('freeze'), M('crystals', { species: CELLS }), M('rings')],
  registeel: [M('stance'), M('sweep'), M('quake')],
  latias: [M('clones'), M('charge'), M('heal')],
  latios: [M('charge'), M('clones'), M('sweep')],
  kyogre: [M('waves'), M('pull'), M('minions', { species: ['carvanha', 'sharpedo'] })],
  groudon: [M('quake'), M('trail'), M('meteor')],
  jirachi: [M('mark'), M('orbit'), M('heal')],
  deoxys: [M('meteor'), M('charge'), M('clones')],
  // Sinnoh
  uxie: [M('mark'), M('clones'), M('stance')],
  mesprit: [M('clones'), M('heal'), M('orbit')],
  azelf: [M('clones'), M('charge'), M('enrage')],
  dialga: [M('mark'), M('sweep'), M('rings')],
  palkia: [M('vanish'), M('waves'), M('pull')],
  heatran: [M('trail'), M('mines', { status: 'burn' }), M('stance')],
  regigigas: [M('enrage'), M('quake'), M('minions', { species: ['regirock', 'regice', 'registeel'], count: 3 })],
  giratina: [M('vanish'), M('pull'), M('mark')],
  cresselia: [M('heal'), M('rings'), M('orbit')],
  phione: [M('waves'), M('heal'), M('mines')],
  manaphy: [M('waves'), M('heal'), M('clones')],
  darkrai: [M('vanish'), M('roots', { status: 'sleep' }), M('mark')],
  shaymin: [M('roots'), M('heal'), M('rings')],
  arceus: [M('grid'), M('meteor'), M('stance')],
  // Unova
  victini: [M('enrage'), M('trail'), M('mark')],
  cobalion: [M('charge'), M('stance'), M('rings')],
  terrakion: [M('charge'), M('quake'), M('crystals', { species: CELLS })],
  virizion: [M('charge'), M('roots'), M('sweep')],
  tornadus: [M('waves'), M('orbit'), M('charge')],
  thundurus: [M('grid'), M('charge'), M('mark')],
  landorus: [M('quake'), M('mines'), M('meteor')],
  reshiram: [M('trail'), M('sweep'), M('rings')],
  zekrom: [M('grid'), M('charge'), M('sweep')],
  kyurem: [M('freeze'), M('crystals', { species: CELLS }), M('sweep')],
  keldeo: [M('charge'), M('waves'), M('stance')],
  meloetta: [M('orbit'), M('rings'), M('clones')],
  genesect: [M('sweep'), M('mines'), M('charge')],
  // Kalos
  xerneas: [M('heal'), M('roots'), M('meteor')],
  yveltal: [M('drain'), M('vanish'), M('sweep')],
  zygarde: [M('quake'), M('pull'), M('enrage')],
  diancie: [M('crystals', { species: CELLS }), M('orbit'), M('stance')],
  hoopa: [M('vanish'), M('mines'), M('clones')],
  volcanion: [M('waves'), M('trail'), M('mines', { status: 'burn' })],
  // Alola
  'type-null': [M('charge'), M('stance'), M('enrage')],
  silvally: [M('charge'), M('grid'), M('orbit')],
  'tapu-koko': [M('grid'), M('orbit'), M('vanish')],
  'tapu-lele': [M('mark'), M('rings'), M('heal')],
  'tapu-bulu': [M('roots'), M('quake'), M('charge')],
  'tapu-fini': [M('waves'), M('pull'), M('heal')],
  solgaleo: [M('charge'), M('trail'), M('stance')],
  lunala: [M('vanish'), M('sweep'), M('orbit')],
  necrozma: [M('crystals', { species: ['minior'] }), M('sweep'), M('pull')],
  magearna: [M('sweep'), M('heal'), M('orbit')],
  marshadow: [M('vanish'), M('charge'), M('mark')],
  zeraora: [M('charge'), M('grid'), M('trail')],
  meltan: [M('minions', { species: ['meltan'] }), M('stance'), M('mines')],
  melmetal: [M('quake'), M('stance'), M('minions', { species: ['meltan'], count: 3 })],
  // Ultra Beasts
  nihilego: [M('mines', { status: 'poison' }), M('mark'), M('vanish')],
  buzzwole: [M('enrage'), M('charge'), M('quake')],
  pheromosa: [M('charge'), M('vanish'), M('enrage')],
  xurkitree: [M('grid'), M('roots', { status: 'paralysis' }), M('mines')],
  celesteela: [M('meteor'), M('charge'), M('mines')],
  kartana: [M('charge', { count: 3 }), M('sweep'), M('enrage')],
  guzzlord: [M('pull'), M('drain'), M('quake')],
  poipole: [M('mines', { status: 'poison' }), M('clones'), M('orbit')],
  naganadel: [M('sweep'), M('mines', { status: 'poison' }), M('trail')],
  stakataka: [M('crystals', { species: CELLS }), M('rings'), M('quake')],
  blacephalon: [M('mines', { status: 'burn' }), M('meteor'), M('trail')],
  // Galar
  zacian: [M('charge', { count: 3 }), M('sweep'), M('stance')],
  zamazenta: [M('stance'), M('charge'), M('crystals', { species: CELLS })],
  eternatus: [M('sweep'), M('pull'), M('meteor')],
  kubfu: [M('charge'), M('enrage'), M('rings')],
  urshifu: [M('enrage'), M('charge'), M('waves')],
  zarude: [M('roots'), M('enrage'), M('charge')],
  regieleki: [M('grid'), M('charge', { count: 3 }), M('crystals', { species: CELLS })],
  regidrago: [M('sweep'), M('crystals', { species: CELLS }), M('quake')],
  glastrier: [M('freeze'), M('charge'), M('quake')],
  spectrier: [M('vanish'), M('mark'), M('sweep')],
  calyrex: [M('roots'), M('mark'), M('orbit')],
  enamorus: [M('heal'), M('orbit'), M('meteor')],
  // Paldea
  'wo-chien': [M('roots'), M('drain'), M('mines')],
  'chien-pao': [M('freeze'), M('charge'), M('mines')],
  'ting-lu': [M('quake'), M('stance'), M('mines')],
  'chi-yu': [M('trail'), M('meteor'), M('mark')],
  koraidon: [M('charge'), M('trail'), M('quake')],
  miraidon: [M('grid'), M('sweep'), M('orbit')],
  okidogi: [M('enrage'), M('stance'), M('drain')],
  munkidori: [M('mark'), M('vanish'), M('drain')],
  fezandipiti: [M('orbit'), M('roots'), M('vanish')],
  ogerpon: [M('roots'), M('charge'), M('stance')],
  terapagos: [M('crystals', { species: CELLS }), M('stance'), M('rings')],
  pecharunt: [M('mines', { status: 'poison' }), M('clones'), M('drain')],
};

/** Per-boss runtime state of its mechanics. */
export interface MechState {
  cd: number[];
  next: number;
  adds: Unit[];
  crystals: Unit[];
  shieldOn: boolean;
  /** pending dash end-points */
  moves: { at: number; x: number; y: number }[];
  busyUntil: number;
  pull?: { until: number; x: number; y: number };
  trail?: { until: number; drop: number };
  heal?: { until: number; hp0: number };
  hidden?: { until: number; struck: boolean; x: number; y: number };
  stanceUntil: number;
  drainUntil: number;
  stacks: number;
  stackT: number;
  /** recent damage taken (enrage is broken by a burst) */
  hits: { t: number; dmg: number }[];
}

const COOLDOWN: Record<MechId, number> = {
  clones: 16, crystals: 22, heal: 18, stance: 14, charge: 8, pull: 13, mines: 12, sweep: 11, orbit: 11, waves: 12,
  rings: 10, grid: 11, meteor: 13, mark: 10, trail: 12, vanish: 12, quake: 9, enrage: 9, minions: 20, roots: 10,
  freeze: 10, drain: 15,
};
const MAX_ADDS = 4;

/** Is this boss hidden (Ẩn mình): drawn faded, untouchable. */
export function mechHidden(b: Unit): boolean {
  return !!b.boss?.mech?.hidden;
}

function state(b: Unit, n: number): MechState {
  const st = b.boss!;
  return (st.mech ??= { cd: Array.from({ length: n }, (_, i) => 3 + i * 2), next: 4, adds: [], crystals: [], shieldOn: false, moves: [],
    busyUntil: 0, stanceUntil: 0, drainUntil: 0, stacks: 0, stackT: 0, hits: [] });
}

/** HP the boss may heal up to: never back above the threshold of the phase it is in. */
function healCap(b: Unit): number {
  const st = b.boss!, def = st.def;
  const cap = st.phase === 1 ? 1 : st.phase === 2 ? def.phase2Threshold : def.phase3Threshold ?? 0.25;
  return b.maxHp * cap;
}

function healBoss(w: World, b: Unit, amount: number): void {
  const room = healCap(b) - b.hp;
  if (room > 0) w.heal(b, Math.min(room, amount));
}

/**
 * Runs the boss's mechanics for this tick. Returns true while one of them keeps the boss busy (the shared patterns of
 * legendaryThink wait).
 */
export function runLegendMechanics(w: World, b: Unit, t: Unit, dt: number): boolean {
  const st = b.boss!;
  const specs = LEGEND_MECHS[b.defId];
  if (!specs?.length || st.weakened || st.pm.state === 'WEAKENED') { if (st.mech) clearAdds(w, st.mech); return false; }
  const m = state(b, specs.length);
  const L = st.def.legend!;
  const pw = L.power ?? 1;
  m.adds = m.adds.filter((u) => u.alive);
  ongoing(w, b, t, m, dt, pw);
  if (w.time < m.busyUntil || m.moves.length || m.heal || m.hidden || m.pull) return true;
  for (let i = 0; i < m.cd.length; i++) m.cd[i] -= dt;
  m.next -= dt;
  if (m.next > 0) return false;
  const ready = specs.map((s, i) => ({ s, i })).filter(({ i }) => st.phase >= i + 1 && m.cd[i] <= 0);
  if (!ready.length) return false;
  const live = w.friendlyUnits().filter((a) => !a.fainted && a.hp > 0);
  if (!live.length) return false;
  const { s, i } = ready[Math.floor(w.rng.next() * ready.length)];
  const fast = st.phase === 1 ? 1 : st.phase === 2 ? 0.85 : 0.7;
  m.cd[i] = COOLDOWN[s.id] * fast;
  m.next = 3.2 * fast;
  st.cast = { name: MECH_INFO[s.id].name, at: w.time, windup: 1 };
  fire(w, b, t, m, s, live, pw);
  st.patternT = Math.max(st.patternT, 1.4);
  return true;
}

function slot(w: World, b: Unit, move: string, power: number, r: number, extra: Partial<SkillSlot['def']> = {}, key = move): SkillSlot {
  return w.bossSlot(b, move, { power, radius: r, kind: 'aoe', ...extra }, 'mech-' + key);
}

function spawnAdd(w: World, b: Unit, m: MechState, species: string, x: number, y: number, hpMult: number, level: number, tag = 'boss-add'): Unit | null {
  if (m.adds.filter((u) => u.alive).length >= MAX_ADDS) return null;
  if (w.blocked(x, y, 20)) { x = b.x; y = b.y; }
  try {
    const u = w.spawnWild(species, level, x, y, { hostile: true, tag, noCapture: true, hpMult });
    m.adds.push(u);
    w.emit({ t: 'vfx', name: 'poof', x, y });
    return u;
  } catch { return null; }
}

function clearAdds(w: World, m: MechState): void {
  for (const u of m.adds) if (u.alive) { w.emit({ t: 'vfx', name: 'poof', x: u.x, y: u.y }); w.removeEnemy(u); }
  m.adds = []; m.crystals = [];
}

/** A point around the arena centre, kept out of walls. */
function around(w: World, b: Unit, r0: number, r1: number): { x: number; y: number } {
  const st = b.boss!;
  for (let k = 0; k < 10; k++) {
    const a = w.rng.range(0, Math.PI * 2), r = w.rng.range(r0, r1);
    const x = st.homeX + Math.cos(a) * r, y = st.homeY + Math.sin(a) * r;
    if (!w.blocked(x, y, 24)) return { x, y };
  }
  return { x: st.homeX, y: st.homeY };
}

function fire(w: World, b: Unit, t: Unit, m: MechState, s: MechSpec, live: Unit[], pw: number): void {
  const st = b.boss!, L = st.def.legend!, now = w.time;
  const banner = (text: string, color = '#ffd080') => w.emit({ t: 'banner', text: `${st.def.name}: ${text}`, color });
  switch (s.id) {
    case 'clones': {
      const n = s.count ?? 2;
      const spots = Array.from({ length: n }, () => around(w, b, 140, 240));
      // the real one swaps places with one of its copies
      const swap = spots[Math.floor(w.rng.next() * n)];
      const ox = b.x, oy = b.y;
      b.x = b.lastX = swap.x; b.y = b.lastY = swap.y;
      swap.x = ox; swap.y = oy;
      // copies (tag boss-clone) are drawn like the boss: no name plate, no health bar to give them away
      for (const p of spots) { const u = spawnAdd(w, b, m, b.defId, p.x, p.y, 0.25, b.level, 'boss-clone'); if (u) u.name = st.def.name; }
      w.emit({ t: 'vfx', name: 'shield', x: b.x, y: b.y, r: 70 });
      banner('Ảo ảnh! Tìm bản thật!');
      break;
    }
    case 'crystals': {
      const sp = s.species ?? CELLS, n = s.count ?? 3;
      const a0 = w.rng.range(0, Math.PI * 2);
      for (let k = 0; k < n; k++) {
        const a = a0 + (k * Math.PI * 2) / n;
        const u = spawnAdd(w, b, m, sp[k % sp.length], st.homeX + Math.cos(a) * 210, st.homeY + Math.sin(a) * 210, 0.7, Math.max(5, b.level - 10));
        if (u) m.crystals.push(u);
      }
      if (m.crystals.length) { m.shieldOn = true; banner('Lá chắn tinh thể! Phá tinh thể trước!', '#a0e0ff'); }
      break;
    }
    case 'heal':
      m.heal = { until: now + 3, hp0: b.hp };
      st.cast = { name: 'Hồi phục', at: now, windup: 3 };
      w.emit({ t: 'vfx', name: 'heal', x: b.x, y: b.y });
      banner('vận sức hồi phục — dồn sát thương để cắt ngang!', '#80ff90');
      break;
    case 'stance':
      m.stanceUntil = now + 3;
      m.busyUntil = now + 1;
      w.emit({ t: 'vfx', name: 'shield', x: b.x, y: b.y, r: 90 });
      banner('Thế phản đòn — ngừng tấn công!', '#ffb0a0');
      break;
    case 'charge': {
      const n = s.count ?? (st.phase === 3 ? 2 : 1);
      const sl = slot(w, b, L.beam, 95 * pw, 46, {}, 'charge');
      let x = b.x, y = b.y, tx = t.x, ty = t.y;
      for (let k = 0; k < n; k++) {
        const tg = live[k % live.length];
        tx = tg.x + tg.vx * 0.4; ty = tg.y + tg.vy * 0.4;
        const a = Math.atan2(ty - y, tx - x);
        let len = 400;
        // stop short of walls and of the arena's edge
        while (len > 120 && (w.blocked(x + Math.cos(a) * len, y + Math.sin(a) * len, b.radius)
          || Math.hypot(x + Math.cos(a) * len - st.homeX, y + Math.sin(a) * len - st.homeY) > 380)) len -= 40;
        const delay = 0.85 + k * 0.75;
        w.addZone(b, sl, 'line', x, y, 46, a, len, delay, 0, 0, false);
        x += Math.cos(a) * len; y += Math.sin(a) * len;
        m.moves.push({ at: now + delay, x, y });
      }
      break;
    }
    case 'pull':
      m.pull = { until: now + 2.2, x: b.x, y: b.y };
      w.addZone(b, slot(w, b, L.nova, 110 * pw, 170), 'circle', b.x, b.y, 170, 0, 0, 2.2, 0, 0, false);
      banner('Hố hút! Chạy ra ngoài!', '#d0a0ff');
      break;
    case 'mines': {
      const n = s.count ?? 7;
      const status: StatusApply | undefined = s.status ? { kind: s.status, chance: 1, duration: 4, magnitude: s.status === 'poison' || s.status === 'burn' ? 0.03 : 0.5 } : L.fieldStatus;
      const sl = slot(w, b, L.volley, 75 * pw, 55, status ? { status } : {}, 'mines');
      for (let k = 0; k < n; k++) {
        const p = k < live.length ? { x: live[k].x, y: live[k].y } : around(w, b, 60, 320);
        w.addZone(b, sl, 'circle', p.x, p.y, 55, 0, 0, 3.4 + k * 0.12, 0, 0, false);
      }
      break;
    }
    case 'sweep': {
      const sl = slot(w, b, L.beam, 90 * pw, 30, {}, 'sweep');
      const dir = w.rng.next() < 0.5 ? 1 : -1, a0 = Math.atan2(t.y - b.y, t.x - b.x) - dir * 0.9;
      for (let k = 0; k < 16; k++) w.addZone(b, sl, 'line', b.x, b.y, 30, a0 + dir * k * 0.14, 560, 1.0 + k * 0.11, 0, 0, false);
      m.busyUntil = now + 2.8;
      break;
    }
    case 'orbit': {
      const sl = slot(w, b, L.volley, 70 * pw, 44, {}, 'orbit');
      const dir = w.rng.next() < 0.5 ? 1 : -1, a0 = w.rng.range(0, Math.PI * 2);
      for (let k = 0; k < 22; k++) for (const [r, off] of [[150, 0], [270, Math.PI]] as const) {
        const a = a0 + off + dir * k * 0.29;
        w.addZone(b, sl, 'circle', b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 44, 0, 0, 0.9 + k * 0.09, 0, 0, false);
      }
      m.busyUntil = now + 2.6;
      break;
    }
    case 'waves': {
      const sl = slot(w, b, L.volley, 80 * pw, 40, {}, 'waves');
      const axis = Math.floor(w.rng.next() * 4), ux = [1, -1, 0, 0][axis], uy = [0, 0, 1, -1][axis];
      for (let j = 0; j < 8; j++) {
        const gap = w.rng.range(-220, 220);
        for (let p = -330; p <= 330; p += 70) {
          if (Math.abs(p - gap) < 80) continue;
          const along = -330 + j * 90;
          w.addZone(b, sl, 'circle', st.homeX + ux * along + uy * p, st.homeY + uy * along + ux * p, 40, 0, 0, 1.2 + j * 0.38, 0, 0, false);
        }
      }
      banner('Sóng tràn! Tìm khe hở!', '#80c8ff');
      break;
    }
    case 'rings': {
      const sl = slot(w, b, L.nova, 85 * pw, 38, {}, 'rings');
      for (let k = 0; k < 3; k++) {
        const R = 90 + k * 115, n = Math.ceil((Math.PI * 2 * R) / 70);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          w.addZone(b, sl, 'circle', b.x + Math.cos(a) * R, b.y + Math.sin(a) * R, 38, 0, 0, 1.0 + k * 0.6, 0, 0, false);
        }
      }
      m.busyUntil = now + 2.4;
      break;
    }
    case 'grid': {
      const sl = slot(w, b, L.volley, 85 * pw, 52, {}, 'grid');
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) {
        const odd = (i + j) & 1;
        w.addZone(b, sl, 'circle', st.homeX + i * 105, st.homeY + j * 105, 52, 0, 0, odd ? 2.5 : 1.3, 0, 0, false);
      }
      banner('Lưới sét! Đổi ô!', '#fff080');
      break;
    }
    case 'meteor': {
      const sl = slot(w, b, L.ultimate, 100 * pw, 85, {}, 'meteor');
      for (let k = 0; k < 13; k++) {
        const p = k < live.length * 2 ? { x: live[k % live.length].x, y: live[k % live.length].y } : around(w, b, 0, 330);
        w.addZone(b, sl, 'circle', p.x, p.y, 85, 0, 0, 1.5 + k * 0.22, 0, 0, false);
      }
      w.emit({ t: 'shake', intensity: 0.01, duration: 600 });
      break;
    }
    case 'mark': {
      const sl = slot(w, b, L.beam, 120 * pw, 120, {}, 'mark');
      for (const tg of live.slice(0, 3)) w.addZone(b, sl, 'circle', tg.x, tg.y, 120, 0, 0, 2.4, 0, 0, false);
      banner('Đánh dấu! Rời khỏi vòng!', '#ff90c0');
      break;
    }
    case 'trail':
      m.trail = { until: now + 4, drop: 0 };
      banner('lao quanh sân!', '#ffb060');
      break;
    case 'vanish':
      m.hidden = { until: now + 2.1, struck: false, x: b.x, y: b.y };
      w.emit({ t: 'vfx', name: 'poof', x: b.x, y: b.y });
      banner('biến mất…', '#c0b0ff');
      break;
    case 'quake': {
      const sl = slot(w, b, L.nova, 90 * pw, 42, {}, 'quake');
      const a0 = st.phase === 3 ? Math.PI / 8 : 0, dirs = st.phase >= 2 ? 8 : 6;
      for (let d = 0; d < dirs; d++) {
        const a = a0 + (d * Math.PI * 2) / dirs;
        for (let k = 1; k <= 7; k++) w.addZone(b, sl, 'circle', b.x + Math.cos(a) * k * 60, b.y + Math.sin(a) * k * 60, 42, 0, 0, 0.8 + k * 0.12, 0, 0, false);
      }
      w.emit({ t: 'shake', intensity: 0.012, duration: 500 });
      m.busyUntil = now + 1.8;
      break;
    }
    case 'enrage':
      if (m.stacks < 5) m.stacks++;
      w.emit({ t: 'vfx', name: 'shield', x: b.x, y: b.y, r: 80 });
      banner(`nổi giận! (sát thương +${m.stacks * 15}%) — dồn sát thương để chặn đà`, '#ff6060');
      break;
    case 'minions': {
      const sp = s.species ?? CELLS, n = s.count ?? 2;
      for (let k = 0; k < n; k++) { const p = around(w, b, 80, 200); spawnAdd(w, b, m, sp[k % sp.length], p.x, p.y, 1.2, Math.max(5, b.level - 6)); }
      banner('gọi đồng bọn!', '#ffd080');
      break;
    }
    case 'roots': {
      const kind = s.status ?? 'slow';
      const status: StatusApply = kind === 'slow' ? { kind, chance: 1, duration: 1.2, magnitude: 0.85 } : { kind, chance: 0.6, duration: 2, magnitude: 0.5 };
      const sl = w.bossSlot(b, L.field, { power: 12 * pw, kind: 'field', radius: 70, status }, 'mech-roots');
      for (const tg of live.slice(0, 3)) w.addZone(b, sl, 'circle', tg.x + tg.vx * 0.3, tg.y + tg.vy * 0.3, 70, 0, 0, 0.8, 2.6, 0.4, false);
      break;
    }
    case 'freeze': {
      const sl = slot(w, b, L.volley, 70 * pw, 75, { status: { kind: 'freeze', chance: 0.5, duration: 1.4, magnitude: 1 } }, 'freeze');
      for (let k = 0; k < 6; k++) {
        const p = k < live.length ? { x: live[k].x + live[k].vx * 0.5, y: live[k].y + live[k].vy * 0.5 } : around(w, b, 60, 300);
        w.addZone(b, sl, 'circle', p.x, p.y, 75, 0, 0, 1.1 + k * 0.15, 0, 0, false);
      }
      break;
    }
    case 'drain':
      m.drainUntil = now + 5;
      for (const tg of live.slice(0, 3)) w.addZone(b, slot(w, b, L.volley, 75 * pw, 70, {}, 'drain'), 'circle', tg.x, tg.y, 70, 0, 0, 0.9, 0, 0, false);
      w.emit({ t: 'vfx', name: 'heal', x: b.x, y: b.y });
      banner('hút sinh lực! Giữ khoảng cách!', '#a0ff80');
      break;
  }
}

/** What keeps running between casts: dashes, the pull, the trail, the heal channel, vanishing, the crystal shield. */
function ongoing(w: World, b: Unit, t: Unit, m: MechState, dt: number, pw: number): void {
  const st = b.boss!, L = st.def.legend!, now = w.time;
  // dashes: the boss arrives at each end-point the moment its line fires
  while (m.moves.length && now >= m.moves[0].at) {
    const p = m.moves.shift()!;
    w.emit({ t: 'vfx', name: 'poof', x: b.x, y: b.y });
    b.x = b.lastX = p.x; b.y = b.lastY = p.y;
  }
  if (m.moves.length) { b.vx = 0; b.vy = 0; }
  if (m.pull) {
    b.x = b.lastX = m.pull.x; b.y = b.lastY = m.pull.y;
    for (const a of w.friendlyUnits()) {
      if (a.fainted || a.hp <= 0) continue;
      const dx = m.pull.x - a.x, dy = m.pull.y - a.y, d = Math.hypot(dx, dy);
      if (d < 40) continue;
      const nx = a.x + (dx / d) * 95 * dt, ny = a.y + (dy / d) * 95 * dt;
      if (!w.blocked(nx, ny, a.radius)) { a.x = nx; a.y = ny; }
    }
    if (now >= m.pull.until) m.pull = undefined;
  }
  if (m.trail) {
    const dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy) || 1, sp = b.moveSpeed * 1.7;
    const nx = b.x + (dx / d) * sp * dt, ny = b.y + (dy / d) * sp * dt;
    if (!w.blocked(nx, ny, b.radius) && Math.hypot(nx - st.homeX, ny - st.homeY) < 380) { b.x = nx; b.y = ny; }
    m.trail.drop -= dt;
    if (m.trail.drop <= 0) {
      m.trail.drop = 0.25;
      const sl = w.bossSlot(b, L.field, { power: 14 * pw, kind: 'field', radius: 50, status: L.fieldStatus ?? { kind: 'burn', chance: 0.5, duration: 3, magnitude: 0.03 } }, 'mech-trail');
      w.addZone(b, sl, 'circle', b.x, b.y, 50, 0, 0, 0.3, 3.5, 0.5, false);
    }
    if (now >= m.trail.until) m.trail = undefined;
  }
  if (m.heal) {
    b.x = b.lastX; b.y = b.lastY;
    if (m.heal.hp0 - b.hp >= b.maxHp * 0.06) {
      m.heal = undefined;
      w.emit({ t: 'banner', text: `${st.def.name} bị cắt ngang!`, color: '#80ff90' });
    } else if (now >= m.heal.until) {
      m.heal = undefined;
      healBoss(w, b, b.maxHp * 0.1);
      w.emit({ t: 'banner', text: `${st.def.name} hồi phục!`, color: '#80ff90' });
    }
  }
  if (m.hidden) {
    const h = m.hidden;
    b.x = b.lastX = h.x; b.y = b.lastY = h.y;
    if (!h.struck && now >= h.until - 0.9) {
      h.struck = true;
      const tx = t.x + t.vx * 0.3, ty = t.y + t.vy * 0.3;
      if (!w.blocked(tx, ty, b.radius)) { h.x = tx; h.y = ty; }
      w.addZone(b, slot(w, b, L.nova, 115 * pw, 130, {}, 'vanish'), 'circle', h.x, h.y, 130, 0, 0, 0.9, 0, 0, false);
    }
    if (now >= h.until) { m.hidden = undefined; w.emit({ t: 'vfx', name: 'poof', x: b.x, y: b.y }); }
  }
  if (m.shieldOn) {
    m.crystals = m.crystals.filter((u) => u.alive);
    if (!m.crystals.length) {
      m.shieldOn = false;
      w.emit({ t: 'banner', text: `Lá chắn của ${st.def.name} vỡ!`, color: '#a0e0ff' });
      w.emit({ t: 'vfx', name: 'shield', x: b.x, y: b.y, r: 110 });
    }
  }
  // enrage wears off by itself after a while too
  if (m.stacks > 0) { m.stackT += dt; if (m.stackT > 30) { m.stacks = 0; m.stackT = 0; } }
  m.hits = m.hits.filter((h) => now - h.t < 4);
}

/**
 * Hook on every hit (World.applyDamage): returns the damage that lands. The crystal shield and vanishing block it, the
 * counter stance halves it and sends half back, enrage raises what the boss deals, drain heals the boss from it, and a
 * big burst breaks enrage.
 */
export function legendMechOnHit(w: World, dst: Unit, src: Unit | null, dmg: number, dot: boolean): number {
  const dm = dst.boss?.mech;
  if (dm) {
    if (dm.hidden || dm.shieldOn) return 0;
    if (!dot && src && src.team !== dst.team && w.time < dm.stanceUntil) {
      if (src.alive && !src.fainted && src.kind !== 'boss') w.applyDamage(src, dmg * 0.5, null, false, 1, true);
      dmg *= 0.5;
    }
    if (dm.stacks > 0) {
      dm.hits.push({ t: w.time, dmg });
      if (dm.hits.reduce((s, h) => s + h.dmg, 0) >= dst.maxHp * 0.08) {
        dm.stacks = 0; dm.stackT = 0; dm.hits = [];
        w.emit({ t: 'banner', text: `${dst.boss!.def.name} bị chặn đà!`, color: '#80ff90' });
      }
    }
  }
  const sm = src?.boss?.mech;
  if (sm && src && dst.team !== src.team) {
    if (sm.stacks > 0) dmg *= 1 + sm.stacks * 0.15;
    if (w.time < sm.drainUntil) healBoss(w, src, dmg * 0.5);
  }
  return dmg;
}

/** The boss leaves (retreat, removed): its copies, crystals and minions go with it. */
export function legendMechCleanup(w: World, b: Unit): void {
  if (b.boss?.mech) clearAdds(w, b.boss.mech);
}
