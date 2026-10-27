/**
 * NPC looks: small pixel characters (16×16, same style and animation as the player avatars) instead of the
 * official trainer pictures. Every NPC gets a body from its `sprite` kind (and gender, read from its Vietnamese
 * title: Cô / Chị / Bà… or Ông / Chú / Anh…) plus its own colours for hat, hair, top, trousers and skin, all picked
 * from a hash of its id — the same NPC always looks the same, two neighbours rarely match.
 *
 * Drawing letters are roles, not colours: k dark (outline, eyes, shoes) · w white · s skin · h/H hair · a/A hat ·
 * c/C top · p/P trousers or skirt · y accent · r mouth. Upper case is the shade of the lower case role.
 */

export type Gender = 'm' | 'f' | 'any';

export interface NpcBody {
  id: string;
  gender: Gender;
  rows: string[];
  /** Roles drawn in a fixed colour (a straw nón lá, a white lab coat…) */
  fixed?: Record<string, string>;
  /** Hair colours this body may get (elders: grey / white) */
  hair?: string[];
}

const BODIES: NpcBody[] = [
  { id: 'cap', gender: 'm', rows: [
    '................',
    '.....aaaaaa.....',
    '....aaawwaaa....',
    '....aaaaaaaaAA..',
    '....hhsssshh....',
    '....hskssksh....',
    '.....ssssss.....',
    '......ssss......',
    '....cccccccc....',
    '...scccyyccccs..',
    '...s.cccccc.s...',
    '.....CCCCCC.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '....kkk..kkk....',
    '................',
  ] },
  { id: 'lass', gender: 'f', rows: [
    '................',
    '....aaaaaaaa....',
    '...aaaaaaaaaa...',
    '..aaAAAAAAAAaa..',
    '....hssssssh....',
    '...hhsksskshh...',
    '...h.ssssss.h...',
    '....ssssssss....',
    '...cccccccccc...',
    '..scccwwwwcccs..',
    '..s.cccccccc.s..',
    '....CCCCCCCC....',
    '.....ss..ss.....',
    '....ppp..ppp....',
    '....kkk..kkk....',
    '................',
  ] },
  { id: 'hiker', gender: 'm', rows: [
    '................',
    '....aaaaaaaa....',
    '...aaaaaaaaaa...',
    '..aaaaaaaaaaaa..',
    '....ssssssss....',
    '....skssssks....',
    '....ssssssss....',
    '....hHHHHHHh....',
    '...cchHHHHhcc...',
    '..sccccccccccs..',
    '..scccwwcccccs..',
    '....cccccccc....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '....kkk..kkk....',
    '................',
  ] },
  { id: 'scientist', gender: 'any', fixed: { w: '#f0f0f8', W: '#c8c8d8' }, rows: [
    '................',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhhsssshhh...',
    '...hhwksskwhh...',
    '....ssssssss....',
    '.....ssssss.....',
    '....wwwwwwww....',
    '...swwccccwws...',
    '...swwccccwws...',
    '...s.wwwwww.s...',
    '.....WWWWWW.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '....kkk..kkk....',
    '................',
  ] },
  { id: 'ranger', gender: 'm', rows: [
    '................',
    '....aaaaaaaa....',
    '...aaaaaaaaaa...',
    '..aaAAAAAAAAaa..',
    '....ssssssss....',
    '....skssssks....',
    '....ssssssss....',
    '....cccccccc....',
    '...scccyycccs...',
    '...sccccccccs...',
    '...s.CCCCCC.s...',
    '.....pppppp.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '....kkk..kkk....',
    '................',
  ] },
  { id: 'veteran', gender: 'm', hair: ['#c8c8d0', '#e8e8f0', '#8a8a90'], rows: [
    '................',
    '....hhhhhhhh....',
    '...hhhhhhhhhh...',
    '...hhsssssshh...',
    '...hssksskssh...',
    '....ssssrsss....',
    '.....ssssss.....',
    '......ssss......',
    '....cccccccc....',
    '...sccyccyccs...',
    '...s.cccccc.s...',
    '.....CCCCCC.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '....kkk..kkk....',
    '................',
  ] },
  // Mekong farmers: the conical straw hat (nón lá)
  { id: 'nonla-man', gender: 'm', fixed: { a: '#e8d090', A: '#b89c58' }, rows: [
    '.......aa.......',
    '.....aaaaaa.....',
    '...aaaaaaaaaa...',
    '.AAAAAAAAAAAAAA.',
    '....hssssssh....',
    '....skssssks....',
    '.....ssssss.....',
    '......ssss......',
    '....cccccccc....',
    '...scccccccccs..',
    '...s.cccccc.s...',
    '.....CCCCCC.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '.....ss..ss.....',
    '................',
  ] },
  { id: 'nonla-woman', gender: 'f', fixed: { a: '#e8d090', A: '#b89c58' }, rows: [
    '.......aa.......',
    '.....aaaaaa.....',
    '...aaaaaaaaaa...',
    '.AAAAAAAAAAAAAA.',
    '...hhssssssh....',
    '...hskssssksh...',
    '...hh.ssss.hh...',
    '....h.ssss.h....',
    '....cccccccc....',
    '...scccccccccs..',
    '...s.cccccc.s...',
    '.....CCCCCC.....',
    '.....pppppp.....',
    '.....pp..pp.....',
    '.....ss..ss.....',
    '................',
  ] },
  { id: 'man', gender: 'm', rows: [
    '................',
    '................',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....hssssssh....',
    '....skssssks....',
    '.....ssssss.....',
    '......ssss......',
    '....cccccccc....',
    '...scccccccccs..',
    '...s.cccccc.s...',
    '.....cccccc.....',
    '.....pp..pp.....',
    '.....pp..pp.....',
    '....kkk..kkk....',
    '................',
  ] },
  { id: 'woman', gender: 'f', rows: [
    '................',
    '................',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '...hhssssssh....',
    '...hskssssksh...',
    '...hhssssssshh..',
    '...hh.ssss..h...',
    '...hcccccccc....',
    '...scccwwcccs...',
    '...s.cccccc.s...',
    '....pppppppp....',
    '....PPPPPPPP....',
    '.....ss..ss.....',
    '....kkk..kkk....',
    '................',
  ] },
  // áo dài: long tunic over loose trousers
  { id: 'aodai', gender: 'f', rows: [
    '................',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....hssssssh....',
    '...hhkssssksh...',
    '...hh.ssss.hh...',
    '...hh..ss..hh...',
    '....hcccccch....',
    '...sccccccccs...',
    '...sccccccccs...',
    '...s.cccccc.s...',
    '.....cCccCc.....',
    '.....cCccCc.....',
    '.....pp..pp.....',
    '.....ww..ww.....',
    '................',
  ] },
  { id: 'kid', gender: 'any', rows: [
    '................',
    '................',
    '................',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....hskssksh....',
    '....ssssssss....',
    '.....ssrrss.....',
    '.....cccccc.....',
    '....sccyyccs....',
    '....s.cccc.s....',
    '......pppp......',
    '......p..p......',
    '......s..s......',
    '.....kk..kk.....',
    '................',
  ] },
  { id: 'elder', gender: 'm', hair: ['#e8e8f0', '#c8c8d0', '#a8a8b0'], rows: [
    '................',
    '................',
    '.....hhhhhh.....',
    '....hssssssh....',
    '....skssssks....',
    '....ssssssss....',
    '.....hhhhhh.....',
    '......hhhh......',
    '....cccccccc...k',
    '...scccccccccsk.',
    '...s.cccccc.s.k.',
    '.....cccccc...k.',
    '.....pp..pp...k.',
    '.....pp..pp...k.',
    '....kkk..kkk..k.',
    '................',
  ] },
  { id: 'grandma', gender: 'f', hair: ['#e8e8f0', '#c8c8d0', '#a8a8b0'], rows: [
    '................',
    '......hhhh......',
    '.....hhhhhh.....',
    '....hhhhhhhh....',
    '....hssssssh....',
    '....skssssks....',
    '.....ssssss.....',
    '......ssss......',
    '....cccccccc....',
    '...scccccccccs..',
    '...s.cccccc.s...',
    '....pppppppp....',
    '....pppppppp....',
    '.....ss..ss.....',
    '....kkk..kkk....',
    '................',
  ] },
  // scholar / sage: long robe and a turban (khăn đóng)
  { id: 'robe', gender: 'm', rows: [
    '................',
    '....aaaaaaaa....',
    '....aAaAaAaA....',
    '....ssssssss....',
    '....skssssks....',
    '....ssssssss....',
    '.....shhhhs.....',
    '......hhhh......',
    '...cccccccccc...',
    '..sccccyycccccs.',
    '..s.cccccccc.s..',
    '....cccccccc....',
    '....cccccccc....',
    '....CCCCCCCC....',
    '....kkk..kkk....',
    '................',
  ] },
];

export const NPC_BODIES: ReadonlyMap<string, NpcBody> = new Map(BODIES.map((b) => [b.id, b]));

const SKIN = ['#f8c898', '#f0b080', '#e0a070', '#c88858'];
const HAIR = ['#2a2018', '#3a2a20', '#4a3020', '#6a3c18', '#8a5a30'];
const TOP = ['#d04848', '#3070d0', '#3a8a4a', '#e0a030', '#8a50b0', '#e070a0', '#40a8b0', '#f0e8d8', '#606870', '#c06830', '#5060a0', '#9ab040', '#a03050', '#2a7070'];
const HAT = ['#e83030', '#f8d878', '#3070d0', '#3a7a4a', '#c8a050', '#f0f0f0', '#8a50b0', '#303038', '#e07030'];
const BOTTOM = ['#283048', '#3a3020', '#504838', '#2f5f24', '#603030', '#40404a', '#1e2a40', '#6a5040'];

/** Bodies offered for an NPC `sprite` kind; Mekong maps swap in the nón lá and the áo dài. */
const BY_SPRITE: Record<string, string[]> = {
  villager: ['man', 'woman', 'kid', 'cap', 'lass'],
  girl: ['woman', 'lass', 'aodai'],
  farmer: ['hiker', 'cap', 'nonla-man', 'nonla-woman'],
  elder: ['elder', 'grandma', 'veteran'],
  wizard: ['robe', 'scientist'],
  youngster: ['cap', 'kid', 'man'],
  ranger: ['ranger', 'hiker'],
  knight: ['veteran', 'ranger'],
  viking: ['hiker', 'veteran'],
  bald: ['man', 'veteran'],
};
const MEKONG: Record<string, string[]> = {
  villager: ['man', 'woman', 'nonla-woman', 'nonla-man', 'kid'],
  girl: ['aodai', 'woman', 'nonla-woman', 'lass'],
  farmer: ['nonla-man', 'nonla-woman'],
};

/** Gender from the Vietnamese title in front of the name (null: the title says nothing). */
export function genderOf(name: string): 'm' | 'f' | null {
  const w = name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (['cô', 'chị', 'bà', 'mẹ', 'má', 'dì', 'mợ', 'thím', 'nàng', 'nữ'].includes(w)) return 'f';
  if (['ông', 'chú', 'anh', 'thầy', 'cậu', 'cụ', 'bố', 'cha'].includes(w)) return 'm';
  return null;
}

/** Stable 32-bit hash (FNV-1a) of an id. */
export function hashId(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function shadeOf(hex: string, f = 0.7): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * f).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

export interface NpcLook {
  /** Texture key of the look (static drawing; `<key>_sheet` is the animated sheet) */
  key: string;
  body: string;
  rows: string[];
  pal: Record<string, string>;
}

/**
 * The look of one NPC. `sprite` is the NPC's kind in the map data (villager, girl, farmer…); kinds that are not
 * people (board, light) and unknown kinds get null (they keep their tile).
 */
export function npcLook(id: string, sprite: string, name = '', opts: { mekong?: boolean; role?: string } = {}): NpcLook | null {
  let pool0 = (opts.mekong && MEKONG[sprite]) || BY_SPRITE[sprite];
  if (!pool0) return null;
  // the title also tells the age: Bé / Em / Cô bé / Cậu bé are children, Bà / Cụ are old
  const title = name.trim().toLowerCase();
  if (/^(bé|em|nhóc|cô bé|cậu bé)(\s|$)/.test(title)) pool0 = ['kid'];
  else if (/^bà(\s|$)/.test(title)) pool0 = ['grandma'];
  else if (/^cụ(\s|$)/.test(title)) pool0 = ['elder', 'grandma'];
  const gender = genderOf(name);
  const fit = gender ? pool0.filter((b) => NPC_BODIES.get(b)!.gender === gender || NPC_BODIES.get(b)!.gender === 'any') : pool0;
  const pool = fit.length ? fit : pool0;
  const body = NPC_BODIES.get(opts.role === 'nurse' ? 'woman' : pool[hashId(id) % pool.length])!;
  return paint(id, body, opts.role);
}

/** Look for a trainer that is not on the map (ambush rivals, travelling merchants): one of `bodies`, own colours. */
export function randomLook(seed: string, bodies: string[]): NpcLook {
  return paint(seed, NPC_BODIES.get(bodies[hashId(seed) % bodies.length])!);
}

function paint(id: string, body: NpcBody, role?: string): NpcLook {
  const pick = <T,>(list: readonly T[], salt: number) => list[hashId(id + ':' + salt) % list.length];
  const top = role === 'nurse' ? '#f8f8f8' : pick(TOP, 1);
  const hat = pick(HAT, 2), bottom = role === 'nurse' ? '#f090b0' : pick(BOTTOM, 3), hair = pick(body.hair ?? HAIR, 4), skin = pick(SKIN, 5);
  const pal: Record<string, string> = {
    k: '#302018', w: '#ffffff', r: '#a83030', y: '#f8d030',
    s: skin, h: hair, H: shadeOf(hair), a: hat, A: shadeOf(hat), c: top, C: shadeOf(top), p: bottom, P: shadeOf(bottom),
    ...body.fixed,
  };
  // one texture per distinct body + colours (NPCs that happen to match share it)
  const key = 'npc-' + body.id + '-' + hashId(body.id + Object.values(pal).join('')).toString(36);
  return { key, body: body.id, rows: body.rows, pal };
}
