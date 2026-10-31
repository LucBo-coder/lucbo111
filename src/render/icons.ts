import Phaser from 'phaser';
import type { PokeType, SkillDef, StatusKind } from '../core/types';

// Pixel-art icon library (original art, drawn from character maps at load time — no image files, no emoji).
//  • 18 type icons     'type-<type>'        11×11 round badge, type colour + white glyph
//  • status icons      'status-<kind>'       9×9 dark tile + coloured glyph
//  • skill icons       'skill-<id>'          16×16: hand-drawn art for signature moves, otherwise
//                                            composed from kind glyph + type palette + category frame + power/status/multi-hit marks
//  • item icons        'item-<id>'           10×10
//  • projectiles       'proj-<type>'         per-type projectile sprites
// Registries: TypeIconRegistry / SkillIconRegistry / StatusIconRegistry below; MoveAssetRegistry in moveAssets.ts.

export const TYPE_COLOR_HEX: Record<PokeType, string> = {
  normal: '#a8a878', fire: '#f08030', water: '#6890f0', electric: '#f8d030', grass: '#78c850', ice: '#98d8d8',
  fighting: '#c03028', poison: '#a040a0', ground: '#e0c068', flying: '#a890f0', psychic: '#f85888', bug: '#a8b820',
  rock: '#b8a038', ghost: '#705898', dragon: '#7038f8', dark: '#705848', steel: '#b8b8d0', fairy: '#ee99ac',
};
export const ALL_TYPES = Object.keys(TYPE_COLOR_HEX) as PokeType[];

// 7×7 glyphs: '#' = glyph colour, 'o' = inner shade
const TYPE_GLYPH: Record<PokeType, string[]> = {
  normal: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'],
  fire: ['...#...', '...##..', '..###..', '.##o##.', '.#ooo#.', '##ooo##', '.#####.'],
  water: ['...#...', '..###..', '..###..', '.#####.', '##o####', '##oo###', '.#####.'],
  electric: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'],
  grass: ['....###', '..#####', '.###o##', '.##o###', '.#o####', '#o###..', '#......'],
  ice: ['...#...', '.#.#.#.', '..###..', '#######', '..###..', '.#.#.#.', '...#...'],
  fighting: ['.####..', '#o#o##.', '#######', '#######', '.######', '..####.', '..####.'],
  poison: ['..###..', '.#####.', '##o#o##', '#######', '.##o##.', '..#.#..', '.#...#.'],
  ground: ['.......', '...#...', '..###..', '.#####.', '#######', 'o.o.o.o', '#######'],
  flying: ['#......', '##.....', '###....', '####...', '#####..', '.######', '...####'],
  psychic: ['..###..', '.#...#.', '#..#..#', '#.#.#.#', '#..##.#', '.#....#', '..####.'],
  bug: ['.#...#.', '..#.#..', '.#####.', '##o#o##', '#######', '##o#o##', '.#####.'],
  rock: ['..###..', '.##o##.', '###o###', '##o####', '#######', '.#####.', '.......'],
  ghost: ['..###..', '.#####.', '#o#o###', '#######', '#######', '##.#.##', '#...#.#'],
  dragon: ['#.....#', '##...##', '.#####.', '##o#o##', '.#####.', '..###..', '..#.#..'],
  dark: ['..####.', '.##..#.', '##.....', '##.....', '##.....', '.##..#.', '..####.'],
  steel: ['..###..', '.#####.', '##ooo##', '##o.o##', '##ooo##', '.#####.', '..###..'],
  fairy: ['...#...', '...#...', '.#####.', '..###..', '.##.##.', '.#...#.', '.......'],
};

const STATUS_ICON: Record<StatusKind, { c: string; d?: string; rows: string[] }> = {
  burn: { c: '#ff7020', d: '#ffe060', rows: ['...#...', '..##...', '..###.#', '.##o##.', '##ooo##', '#ooooo#', '.#####.'] },
  poison: { c: '#b050d0', d: '#e8b0ff', rows: ['...#...', '..###..', '.#####.', '##o####', '#######', '#######', '.#####.'] },
  badPoison: { c: '#7a1aa0', d: '#ffffff', rows: ['..###..', '.#####.', '#o#o###', '#######', '.##o##.', '..###..', '.#.#.#.'] },
  paralysis: { c: '#f8d030', rows: ['....##.', '...##..', '..##...', '.#####.', '...##..', '..##...', '.##....'] },
  sleep: { c: '#c8d8ff', rows: ['.####..', '...#...', '..#....', '.####..', '....###', '.....#.', '....###'] },
  freeze: { c: '#a0e8ff', d: '#ffffff', rows: ['...#...', '.#.o.#.', '..###..', '#o###o#', '..###..', '.#.o.#.', '...#...'] },
  confusion: { c: '#e0a0ff', rows: ['.#####.', '#.....#', '#.###.#', '#.#.#.#', '#.#...#', '#.####.', '#......'] },
  flinch: { c: '#ff6060', d: '#ffffff', rows: ['..###..', '..#o#..', '..#o#..', '..#o#..', '..###..', '.......', '..###..'] },
  slow: { c: '#80b0ff', rows: ['...#...', '...#...', '...#...', '#######', '.#####.', '..###..', '...#...'] },
  stun: { c: '#ffe060', rows: ['...#...', '.#.#.#.', '..###..', '###.###', '..###..', '.#.#.#.', '...#...'] },
  atkUp: { c: '#ff5040', rows: ['...#...', '..###..', '.#####.', '#######', '..###..', '..###..', '..###..'] },
  defDown: { c: '#5080ff', rows: ['..###..', '..###..', '..###..', '#######', '.#####.', '..###..', '...#...'] },
  leech: { c: '#60d050', d: '#a06030', rows: ['..#.#..', '...#...', '..###..', '.#ooo#.', '.#ooo#.', '..###..', '.......'] },
  taunt: { c: '#ff4040', rows: ['##...##', '#.#.#.#', '..#.#..', '.......', '..#.#..', '#.#.#.#', '##...##'] },
};

// 8×8 kind glyphs for composed skill icons: '#' light, 'o' type colour, 'w' white
const KIND_GLYPH: Record<string, string[]> = {
  projectile: ['........', '.....oo.', '....owwo', '.#.#owwo', '#.#.oooo', '.#.#.oo.', '........', '........'],
  beam: ['........', 'o.......', 'oo######', 'oowwwwww', 'oowwwwww', 'oo######', 'o.......', '........'],
  melee: ['......#.', '.....#..', '..#.#..#', '.#.#..#.', '#.#..#..', '.#..#...', '#..#....', '..#.....'],
  dash: ['........', '.....#..', '#.#.###.', '.#.#####', '#.#.###.', '.....#..', '........', '........'],
  aoe: ['...#....', '.#.#.#..', '..ooo...', '#oowoo#.', '..ooo...', '.#.#.#..', '...#....', '........'],
  field: ['........', '..#..#..', '.#.##.#.', '........', '.oooooo.', 'oowwwwoo', '.oooooo.', '........'],
  heal: ['...ww...', '...ww...', '.wwwwww.', '.wwwwww.', '...ww...', '...ww...', '........', '........'],
  shield: ['.######.', '.#oooo#.', '.#owwo#.', '.#oooo#.', '..#oo#..', '...##...', '........', '........'],
  buff: ['...ww...', '..wwww..', '.wwwwww.', '...ww...', '...ww...', '...ww...', '........', '........'],
  debuff: ['...##...', '...##...', '...##...', '.######.', '..####..', '...##...', '........', '........'],
  cone: ['........', '.....ooo', '...oo#oo', 'w.o##ooo', 'ww###ooo', 'w.o##ooo', '...oo#oo', '.....ooo'],
  summon: ['..o..o..', '.ooo.ooo', '.owo.owo', '.ooo.ooo', '..o..o..', '........', '........', '........'],
};

// Hand-drawn 12×12 art for signature moves (palette letters per icon)
const BESPOKE: Record<string, { pal: Record<string, string>; rows: string[] }> = {
  ember: { pal: { r: '#e83010', o: '#ff8020', y: '#ffe060' }, rows: ['............', '.....r......', '....rr......', '....ror.....', '...rooor....', '...royor..r.', '..rooyyor.r.', '..royyyor...', '..royyyor...', '...royor....', '....rrr.....', '............'] },
  flamethrower: { pal: { r: '#e83010', o: '#ff8020', y: '#ffe060' }, rows: ['............', '.........rr.', '......rrroor', '...rrroooyyo', '.rroooyyyyyo', 'rooyyyyyyyyo', '.rroooyyyyyo', '...rrroooyyo', '......rrroor', '.........rr.', '............', '............'] },
  fire_blast: { pal: { r: '#e83010', o: '#ff8020', y: '#ffe060' }, rows: ['.....rr.....', '.....oo.....', 'r...royr...r', '.r..oyyo..r.', '..rroyyorr..', 'rooyyyyyyoor', '..rroyyorr..', '...royyor...', '..ro.yy.or..', '.ro..oo..or.', 'ro...rr...or', '............'] },
  thunderbolt: { pal: { y: '#ffe040', w: '#ffffff', k: '#906800' }, rows: ['.......yyk..', '......yyk...', '.....yyk....', '....yyk.....', '...yyyyyyk..', '.....wyk....', '....wyk.....', '...wyk......', '..yyk.......', '.yk.........', 'yk..........', '............'] },
  thunder_wave: { pal: { y: '#ffe040', w: '#ffffff' }, rows: ['............', '..y......y..', '.y..y..y..y.', 'y..y.ww.y..y', 'y.y.w..w.y.y', 'y.y.w..w.y.y', 'y..y.ww.y..y', '.y..y..y..y.', '..y......y..', '............', '...y.y.y.y..', '............'] },
  water_gun: { pal: { b: '#2860c0', l: '#60a8ff', w: '#e0f4ff' }, rows: ['............', '............', '.........b..', 'bbbbbbbbllb.', 'lllllllwwlb.', 'wwwwwwwwwwlb', 'lllllllwwlb.', 'bbbbbbbbllb.', '.........b..', '..b...b.....', '............', '............'] },
  hydro_pump: { pal: { b: '#2860c0', l: '#60a8ff', w: '#e0f4ff' }, rows: ['....bb..bb..', '...bllbbllb.', '..blwwllwwlb', 'bbblwwwwwwlb', 'llllwwwwwwwl', 'wwwwwwwwwwwl', 'llllwwwwwwwl', 'bbblwwwwwwlb', '..blwwllwwlb', '...bllbbllb.', '....bb..bb..', '............'] },
  razor_leaf: { pal: { g: '#2a8a30', l: '#90e060' }, rows: ['......gg....', '....ggllg...', '...gllllg...', '..glllg.....', '.glg........', '.g....gg....', '.....gllg...', '....gllllg..', '...glllgg...', '..glg.......', '..g.........', '............'] },
  solar_beam: { pal: { o: '#f0a020', y: '#ffe040', w: '#ffffff' }, rows: ['.y...y...y..', '..y.ooo.y...', '...oyyyo....', '.yoywwyoy...', '...oyyyo....', '..y.ooo.y...', '.y...y...y..', '....yy......', '....wwwwwwww', '....yyyyyyyy', '....wwwwwwww', '............'] },
  shadow_ball: { pal: { k: '#201830', p: '#7050a0', v: '#c0a0ff' }, rows: ['....pppp....', '..ppkkkkpp..', '.pkkkppkkkp.', '.pkkpvvpkkp.', 'pkkpvvvvpkkp', 'pkkpvvvvpkkp', 'pkkkpvvpkkkp', '.pkkkppkkkp.', '.pkkkkkkkkp.', '..ppkkkkpp..', '....pppp....', '............'] },
  ice_beam: { pal: { c: '#a0e8ff', l: '#60b0e0', w: '#ffffff' }, rows: ['............', '.c.......c..', '..c.....c...', '...ccccc....', 'lllllllllll.', 'wwwwwwwwwwwl', 'lllllllllll.', '...ccccc....', '..c.....c...', '.c.......c..', '............', '............'] },
  dragon_rage: { pal: { p: '#4020b0', v: '#8050ff', w: '#e0c0ff' }, rows: ['......pp....', '.....pvp....', '....pvvp....', '...pvwvp..p.', '..pvwwvp.pp.', '..pvwwvvpvp.', '.pvvwwwvvvp.', '.pvvwwwwvvp.', '..pvvwwvvp..', '...pvvvvp...', '....pppp....', '............'] },
  earthquake: { pal: { y: '#c0a050', b: '#5a4020' }, rows: ['............', '............', '....b.b.....', '...b...b....', '............', 'yyyyyyyyyyyy', 'yybyyyyyybyy', 'ybbbyyybbyyb', 'bbyybbbbybbb', 'byyyybyyyyyb', 'yyyybbbyyyyy', '............'] },
  psychic: { pal: { p: '#f85888', w: '#ffffff' }, rows: ['....pppp....', '..pp....pp..', '.p..pppp..p.', '.p.p....p.p.', 'p.p..pp..p.p', 'p.p.pwwp.p.p', 'p.p.pwwp.p.p', 'p.p..pp..p.p', '.p.p....p.p.', '.p..pppp..p.', '..pp....pp..', '....pppp....'] },
  vine_whip: { pal: { g: '#2a8a30', l: '#90e060' }, rows: ['..........gg', '.........gl.', '........gl..', '.......gl...', '......gl....', '.....gl.....', '....gl......', '..ggl.......', '.gllg.......', 'glg.lg......', 'gg...l......', '............'] },
  thunder: { pal: { s: '#808898', w: '#d0d8e8', y: '#ffe040' }, rows: ['..ssss......', '.swwwwss....', 'swwwwwwws...', 'ssssssssss..', '.....yy.....', '....yy......', '...yyyyy....', '.....yy.....', '....yy......', '...yy.......', '..y.........', '............'] },
  blizzard: { pal: { c: '#a0e8ff', l: '#70b8e8', w: '#ffffff' }, rows: ['.c.......c..', 'ccc.....ccc.', '.c..l.l..c..', '....lwl.....', '..llwwwll...', '....lwl.....', '.c..l.l..c..', 'ccc.....ccc.', '.c..........', '.....lll....', '...lllllll..', '............'] },
  bite: { pal: { k: '#501820', w: '#ffffff' }, rows: ['kkkkkkkkkkkk', 'kwwkwwkwwkwk', 'kwkkwkkwkkwk', 'k.k..k..k..k', '............', '............', 'k..k..k..k.k', 'kwkkwkkwkkwk', 'kwwkwwkwwkwk', 'kkkkkkkkkkkk', '............', '............'] },
  hyper_beam: { pal: { o: '#f07020', y: '#ffd040', w: '#ffffff' }, rows: ['............', '.oo.........', 'oyyo........', 'oyyyoooooooo', 'yywwyyyyyyyy', 'ywwwwwwwwwww', 'yywwyyyyyyyy', 'oyyyoooooooo', 'oyyo........', '.oo.........', '............', '............'] },
  sludge_bomb: { pal: { p: '#602070', v: '#b050d0', w: '#f0c0ff' }, rows: ['....pppp....', '..ppvvvvpp..', '.pvvwvvvvvp.', '.pvwvvvvvvp.', 'pvvvvvvvvvvp', 'pvvvvvvvvvvp', '.pvvvvvvvvp.', '..ppvpvvpp..', '....p.vp....', '......p.....', '....p.......', '............'] },
  gust: { pal: { w: '#d8ecff', b: '#90b0e0' }, rows: ['............', '.wwwwww.....', '......ww....', '.......w....', '.bbbb..w....', '.....b.w....', '..ww.b.w....', '.....b.ww...', '.wwwwww..ww.', '...........w', '............', '............'] },
  rock_throw: { pal: { b: '#5a5040', g: '#a09070', w: '#d8d0b8' }, rows: ['............', '.......bbb..', '......bgggb.', '......bgwgb.', '.......bbb..', '..bbbb......', '.bggggb.....', 'bggwgggb....', 'bgggggbb....', '.bbbbbb.....', '............', '............'] },
  quick_attack: { pal: { w: '#ffffff', y: '#ffe880' }, rows: ['............', '.......wwww.', '...wwwwyyyyw', '........wwww', '.wwwwwwyyyyw', '........wwww', '....wwwyyyyw', '.......wwww.', '............', '............', '............', '............'] },
  tackle: { pal: { w: '#ffffff', y: '#ffe880' }, rows: ['............', '.....w......', '.w...w...w..', '..w..w..w...', '...wwwww....', 'wwwwwywwwww.', '...wwwww....', '..w..w..w...', '.w...w...w..', '.....w......', '............', '............'] },
};

// Per-type projectile sprites (10×10 maps)
const PROJ: Record<PokeType, { pal: Record<string, string>; rows: string[] }> = {
  normal: { pal: { w: '#ffffff', y: '#e8e0c8' }, rows: ['..........', '....w.....', '....w.....', '..wwywww..', '....w.....', '....w.....', '..........', '..........', '..........', '..........'] },
  fire: { pal: { r: '#e83010', o: '#ff8020', y: '#ffe060' }, rows: ['....r.....', '...rr.....', '...ror....', '..rooor...', '..royor...', '.rooyyor..', '.royyyor..', '..royyr...', '...rrr....', '..........'] },
  water: { pal: { b: '#2860c0', l: '#60a8ff', w: '#e0f4ff' }, rows: ['....b.....', '...blb....', '...blb....', '..bllwb...', '..blllwb..', '.bllllwb..', '.blllllb..', '..blllb...', '...bbb....', '..........'] },
  electric: { pal: { y: '#ffe040', w: '#ffffff' }, rows: ['......yy..', '.....yy...', '....yy....', '...ywwyy..', '.....yy...', '....yy....', '...yy.....', '..yy......', '..........', '..........'] },
  grass: { pal: { g: '#2a8a30', l: '#90e060' }, rows: ['......gg..', '....ggllg.', '...gllllg.', '..glllgg..', '.glllg....', '.gllg.....', 'glg.......', 'g.........', '..........', '..........'] },
  ice: { pal: { c: '#a0e8ff', w: '#ffffff', b: '#5090c0' }, rows: ['....c.....', '...cwc....', '...cwc....', '..cwwbc...', '..cwbbc...', '..cbbbc...', '...cbc....', '...cbc....', '....c.....', '..........'] },
  fighting: { pal: { r: '#c03028', s: '#ffb090', w: '#ffffff' }, rows: ['..........', '..rrrr....', '.rssssr...', 'rswsswsr..', 'rssssssr..', 'rssssssr..', '.rsssssr..', '..rrrrr...', '..........', '..........'] },
  poison: { pal: { p: '#602070', v: '#b050d0', w: '#f0c0ff' }, rows: ['..........', '...pppp...', '..pvvvvp..', '.pvwvvvvp.', '.pvvvvvvp.', '.pvvvvvvp.', '..pvvvvp..', '...pvpp...', '....p.....', '..........'] },
  ground: { pal: { b: '#6a5030', y: '#c0a050', l: '#e8d8a0' }, rows: ['..........', '...bbbb...', '..byylyb..', '.byyyyyyb.', '.byyyyyyb.', '.bbyyyybb.', '..bbbbbb..', '..........', '..........', '..........'] },
  flying: { pal: { w: '#ffffff', b: '#a0c0f0' }, rows: ['..........', '.......ww.', '.....wwb..', '...wwbb...', '.wwbbb....', '...wwbb...', '.....wwb..', '.......ww.', '..........', '..........'] },
  psychic: { pal: { p: '#f85888', w: '#ffffff' }, rows: ['...pppp...', '..p....p..', '.p..pp..p.', '.p.pwwp.p.', '.p.pwwp.p.', '.p..pp..p.', '..p....p..', '...pppp...', '..........', '..........'] },
  bug: { pal: { g: '#788010', y: '#d8e840', w: '#ffffff' }, rows: ['..........', '..........', '.......w..', 'ggggyyyww.', 'yyyyyyyyww', 'ggggyyyww.', '.......w..', '..........', '..........', '..........'] },
  rock: { pal: { b: '#5a5040', g: '#a09070', w: '#d8d0b8' }, rows: ['..........', '...bbbb...', '..bggwgb..', '.bggwgggb.', '.bgggggbb.', '.bbggggb..', '..bbbbb...', '..........', '..........', '..........'] },
  ghost: { pal: { k: '#201830', p: '#7050a0', v: '#c0a0ff' }, rows: ['...pppp...', '..pkkkkp..', '.pkkvvkkp.', '.pkvvvvkp.', '.pkvvvvkp.', '.pkkvvkkp.', '..pkkkkp..', '...p.p.p..', '..p.p.p...', '..........'] },
  dragon: { pal: { p: '#4020b0', v: '#8050ff', w: '#e0c0ff' }, rows: ['.....pp...', '....pvp...', '...pvvp.p.', '..pvwvvpp.', '..pvwwvvp.', '.pvvwwvvp.', '.pvvwwvp..', '..pvvvp...', '...ppp....', '..........'] },
  dark: { pal: { k: '#181018', p: '#504048', w: '#a08890' }, rows: ['...kkkk...', '..kk..pk..', '.kk.......', '.kp.......', '.kp.......', '.kk.......', '..kk..pk..', '...kkkk...', '..........', '..........'] },
  steel: { pal: { s: '#8890a8', w: '#ffffff', l: '#d0d8f0' }, rows: ['....s.....', '....ls....', '..sslwss..', 'sllwwwlls.', '..sslwss..', '....ls....', '....s.....', '..........', '..........', '..........'] },
  fairy: { pal: { p: '#f080b0', w: '#ffffff', l: '#ffd0e8' }, rows: ['....p.....', '....l.....', '.p.lwl.p..', '..lwwwl...', 'plwwwwwlp.', '..lwwwl...', '.p.lwl.p..', '....l.....', '....p.....', '..........'] },
};

const ITEM_ART: Record<string, { pal: Record<string, string>; rows: string[] }> = {
  pokeball: { pal: { k: '#202020', r: '#e83030', w: '#ffffff' }, rows: ['...kkkk...', '..krrrrk..', '.krrrrrrk.', '.krrrrrrk.', 'kkkkwwkkkk', 'kwwkwwkwwk', '.kwwkkwwk.', '.kwwwwwwk.', '..kwwwwk..', '...kkkk...'] },
  greatball: { pal: { k: '#202020', b: '#3060d0', r: '#e83030', w: '#ffffff' }, rows: ['...kkkk...', '..kbbbbk..', '.krbbbbrk.', '.krrbbrrk.', 'kkkkwwkkkk', 'kwwkwwkwwk', '.kwwkkwwk.', '.kwwwwwwk.', '..kwwwwk..', '...kkkk...'] },
  ultraball: { pal: { k: '#202020', y: '#f0c030', w: '#ffffff' }, rows: ['...kkkk...', '..kykkyk..', '.kkykkykk.', '.kkykkykk.', 'kkkkwwkkkk', 'kwwkwwkwwk', '.kwwkkwwk.', '.kwwwwwwk.', '..kwwwwk..', '...kkkk...'] },
  netball: { pal: { k: '#202020', c: '#40c0d0', d: '#208090', w: '#ffffff' }, rows: ['...kkkk...', '..kcdcdk..', '.kdcdcdck.', '.kcdcdcdk.', 'kkkkwwkkkk', 'kwwkwwkwwk', '.kwwkkwwk.', '.kwwwwwwk.', '..kwwwwk..', '...kkkk...'] },
  duskball: { pal: { k: '#202020', g: '#30a050', o: '#f08030', w: '#ffffff', b: '#303030' }, rows: ['...kkkk...', '..kgbbgk..', '.kgbobbgk.', '.kbbbbbbk.', 'kkkkwwkkkk', 'kbbkwwkbbk', '.kbbkkbbk.', '.kbbbbbbk.', '..kbbbbk..', '...kkkk...'] },
  quickball: { pal: { k: '#202020', b: '#3070e0', y: '#f8d030', w: '#ffffff' }, rows: ['...kkkk...', '..kbyybk..', '.kbyyyybk.', '.kyybbyyk.', 'kkkkwwkkkk', 'kbbkwwkbbk', '.kyybbyyk.', '.kbyyyybk.', '..kbbbbk..', '...kkkk...'] },
  timerball: { pal: { k: '#202020', r: '#e04030', w: '#ffffff', g: '#d8d8d8' }, rows: ['...kkkk...', '..krkkrk..', '.kkrkkrkk.', '.krkkkkrk.', 'kkkkwwkkkk', 'kwwkwwkwwk', '.kwwkkwwk.', '.kwwwwwwk.', '..kwwwwk..', '...kkkk...'] },
  luxuryball: { pal: { k: '#202020', b: '#303030', r: '#e03030', y: '#f0c030', w: '#ffffff' }, rows: ['...kkkk...', '..kbyybk..', '.kbbrrbbk.', '.kyyyyyyk.', 'kkkkwwkkkk', 'kbbkwwkbbk', '.kbbkkbbk.', '.kbbbbbbk.', '..kbbbbk..', '...kkkk...'] },
  potion: { pal: { k: '#303040', p: '#a050d0', w: '#ffffff', g: '#c0c8d8' }, rows: ['...gggg...', '...kwwk...', '...kwwk...', '..kppppk..', '.kpwppppk.', '.kpwppppk.', '.kppppppk.', '.kppppppk.', '..kkkkkk..', '..........'] },
  superpotion: { pal: { k: '#303040', p: '#f08030', w: '#ffffff', g: '#c0c8d8' }, rows: ['...gggg...', '...kwwk...', '...kwwk...', '..kppppk..', '.kpwppppk.', '.kpwppppk.', '.kppppppk.', '.kppppppk.', '..kkkkkk..', '..........'] },
  oranberry: { pal: { g: '#40a040', b: '#4060e0', w: '#c0d0ff', k: '#203080' }, rows: ['....g.....', '...gg.....', '..kbbbk...', '.kbbbbbk..', 'kbwbbbbbk.', 'kbbbbbbbk.', 'kbbbbbbbk.', '.kbbbbbk..', '..kkkkk...', '..........'] },
  'linking-cord': { pal: { b: '#8a5a20', y: '#e0b060' }, rows: ['..bbbb....', '.by..yb...', 'by....yb..', 'by.....b..', '.by...yb..', '..bbybb...', '....by....', '....by.bb.', '.....yyyb.', '......bb..'] },
  // star shard of the meteor-shower event (world pickup, not an inventory item)
  'star-shard': { pal: { k: '#806020', y: '#ffe060', l: '#fff8c0', w: '#ffffff' }, rows: ['....kk....', '....kyk...', '...kyyk...', 'kkkkylykkk', 'kyyywlyyyk', '.kyylwyyk.', '..kyyyyk..', '.kyykkyyk.', '.kyk..kyk.', '.kk....kk.'] },
  // V31: Terastal / Dynamax
  'tera-orb': { pal: { k: '#304060', c: '#60e0ff', l: '#c0f8ff', p: '#ff80e0', w: '#ffffff' }, rows: ['...kkkk...', '..kclpck..', '.kclwlpck.', '.kllwwlck.', '.kcllllpk.', '.kpcllcck.', '..kcppck..', '...kkkk...', '..kk..kk..', '..........'] },
  'dynamax-band': { pal: { k: '#401020', r: '#ff3060', d: '#a01838', w: '#ffffff', g: '#d0d0e0' }, rows: ['..........', '..kkkkkk..', '.kggggggk.', 'kgkkkkkkgk', 'kgkrwrrkgk', 'kgkrrrdkgk', 'kgkkkkkkgk', '.kggggggk.', '..kkkkkk..', '..........'] },
  'tera-shard': { pal: { k: '#305070', c: '#80e8ff', l: '#d0f8ff', w: '#ffffff' }, rows: ['....k.....', '...kck....', '...kclk...', '..kclwk...', '..kcllck..', '.kcclwlk..', '.kccllck..', '..kcclk...', '...kkk....', '..........'] },
  'max-soup': { pal: { k: '#402018', b: '#c0a080', r: '#e04030', o: '#ff9040', w: '#ffffff' }, rows: ['..........', '...w.w....', '....w.w...', '.kkkkkkkk.', 'kbrrorrobk', 'kbrorrorbk', '.kbbbbbbk.', '..kkkkkk..', '...kkkk...', '..........'] },
  'key-stone': { pal: { k: '#404050', r: '#ff4060', y: '#ffe040', g: '#60ff80', b: '#40a0ff', w: '#ffffff' }, rows: ['...kkkk...', '..kryybk..', '.krwyygbk.', '.kryyggbk.', '.krygggbk.', '.kbgggbbk.', '..kbbbbk..', '...kkkk...', '..........', '..........'] },
};

function drawRows(ctx: CanvasRenderingContext2D, rows: string[], pal: Record<string, string>, ox = 0, oy = 0): void {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = pal[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(ox + x, oy + y, 1, 1);
    }
  });
}

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) return;
  const t = scene.textures.createCanvas(key, w, h)!;
  fn(t.getContext());
  t.refresh();
}

const shade = (hex: string, f: number) => {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f)), g = Math.min(255, Math.round(((n >> 8) & 255) * f)), b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
};

/** Round 11×11 type badge with a white glyph. */
function drawTypeIcon(scene: Phaser.Scene, t: PokeType): void {
  canvasTex(scene, 'type-' + t, 11, 11, (ctx) => {
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const d = Math.hypot(x - 5, y - 5);
      if (d > 5.6) continue;
      ctx.fillStyle = d > 4.7 ? shade(TYPE_COLOR_HEX[t], 0.5) : TYPE_COLOR_HEX[t];
      ctx.fillRect(x, y, 1, 1);
    }
    drawRows(ctx, TYPE_GLYPH[t], { '#': '#ffffff', o: shade(TYPE_COLOR_HEX[t], 0.75) }, 2, 2);
  });
}

function drawStatusIcon(scene: Phaser.Scene, k: StatusKind): void {
  const s = STATUS_ICON[k];
  canvasTex(scene, 'status-' + k, 9, 9, (ctx) => {
    ctx.fillStyle = '#1c1c28';
    ctx.fillRect(1, 0, 7, 9); ctx.fillRect(0, 1, 9, 7);
    drawRows(ctx, s.rows, { '#': s.c, o: s.d ?? shade(s.c, 0.7) }, 1, 1);
  });
}

const CATEGORY_FRAME: Record<string, string> = { physical: '#e86030', special: '#5088f0', status: '#a8a8b8' };

/** 16×16 skill icon: bespoke art if any, else composed from kind glyph + type palette + category frame + marks. */
export function drawSkillIcon(scene: Phaser.Scene, s: SkillDef): string {
  const key = 'skill-' + s.id;
  canvasTex(scene, key, 16, 16, (ctx) => {
    const tc = TYPE_COLOR_HEX[s.type] ?? '#a8a878';
    ctx.fillStyle = CATEGORY_FRAME[s.category] ?? '#a8a8b8';
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = shade(tc, 0.32);
    ctx.fillRect(1, 1, 14, 14);
    ctx.fillStyle = shade(tc, 0.45);
    ctx.fillRect(1, 1, 14, 2);
    const b = BESPOKE[s.id];
    if (b) drawRows(ctx, b.rows, b.pal, 2, 2);
    else {
      const g = KIND_GLYPH[s.kind] ?? KIND_GLYPH.projectile;
      drawRows(ctx, g, { '#': shade(tc, 1.35), o: tc, w: '#ffffff' }, 4, 3);
      // power pips (bottom-left): 1 = light, 2 = medium, 3 = heavy
      const pips = s.power >= 90 ? 3 : s.power >= 60 ? 2 : s.power > 0 ? 1 : 0;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < pips; i++) ctx.fillRect(2 + i * 2, 13, 1, 1);
      // multi-hit dots (bottom-right)
      const n = s.projectile?.count ?? 1;
      ctx.fillStyle = '#ffe060';
      for (let i = 1; i < n; i++) ctx.fillRect(13 - (i - 1) * 2, 13, 1, 1);
    }
    // inflicted status (top-left corner chip)
    if (s.status) {
      ctx.fillStyle = STATUS_ICON[s.status.kind]?.c ?? '#ffffff';
      ctx.fillRect(1, 1, 3, 3);
    }
    if (s.flinch) { ctx.fillStyle = STATUS_ICON.flinch.c; ctx.fillRect(12, 1, 3, 3); }
  });
  return key;
}

/** 10×10 item shapes shared by many items (palette: k outline, c colour, l light, d dark, w white, g green, b brown). */
export const ITEM_SHAPE: Record<string, string[]> = {
  apple: ['.....gb...', '....gb....', '..kkkbkk..', '.kcclcclk.', 'kccwlccclk', 'kcclcccdck', 'kcccccddck', '.kcccddck.', '..kkkkkk..', '..........'],
  cup: ['..........', '..kkkkkk..', '.kwlllllk.', '.kcccccckk', '.kcccccckk', '.kccccccck', '..kcccck..', '.kkkkkkkk.', '.kddddddk.', '..kkkkkk..'],
  armor: ['.kkk..kkk.', 'kclckkclck', 'kccclwccck', 'kcccllccck', '.kccccdck.', '.kccccdck.', '..kccdck..', '..kcdddk..', '...kkkk...', '..........'],
  scroll: ['.kkkkkkkk.', 'kddkwwwwkk', 'kddkllllkk', '.kkcccccck', '..kclllcck', '..kcccccck', '..kclllcck', '.kkcccccck', 'kddkkkkkkk', '.kkk......'],
  disc: ['...kkkk...', '..kllllk..', '.klcccclk.', 'klcckkcclk', 'klckwwkclk', 'kcckwwkcck', 'kccckkccdk', '.kccccddk.', '..kddddk..', '...kkkk...'],
  claw: ['......kk..', '.....kwk..', '....kwlk..', '...kwlk..k', '..kllk..kw', '.kllk..kwk', '.kcck.kwlk', 'kccckkllk.', 'kddccccck.', '.kkkkkkk..'],
  scale: ['....kk....', '...kwlk...', '..kwllck..', '.kwlccclk.', '.klcccclk.', 'klccccccdk', 'kcccccccdk', '.kccccddk.', '..kcddk...', '...kkk....'],
  berry: ['....gg....', '...gbg....', '..kkkbkk..', '.kcwlccck.', 'kcwlcccdck', 'kclcccccdk', 'kcccccccdk', '.kcccccdk.', '..kkkkkk..', '..........'],
  bottle: ['...kkkk...', '...kbbk...', '..kkkkkk..', '..kwlllk..', '.kwlccclk.', '.klcccccK.', '.kcwwwwck.', '.kcwccwck.', '.kccccddk.', '..kkkkkk..'],
  candy: ['..........', 'kk......kk', 'kck.kk.kck', 'kcckllkkck', '.kcklwlkk.', '.kkcllck..', 'kckkcckcck', 'kck.kk.kck', 'kk......kk', '..........'],
};

function drawItemIcon(scene: Phaser.Scene, id: string, color: string, kind: string, pokeType?: string, icon?: string): void {
  const art = ITEM_ART[id];
  canvasTex(scene, 'item-' + id, 10, 10, (ctx) => {
    if (art) { drawRows(ctx, art.rows, art.pal); return; }
    const shape = icon ?? (kind === 'candy' ? 'candy' : kind === 'evItem' ? (id.endsWith('-berry') ? 'berry' : 'bottle') : null);
    if (shape && ITEM_SHAPE[shape]) {
      drawRows(ctx, ITEM_SHAPE[shape].map((r) => r.replace(/K/g, 'k')), { k: shade(color, 0.35), c: color, l: shade(color, 1.35), d: shade(color, 0.7), w: '#ffffff', g: '#58b048', b: '#7a5030' });
      return;
    }
    if (kind === 'evoStone') {
      // faceted gem
      drawRows(ctx, ['...kkkk...', '..kllllk..', '.klwlllck.', 'kllwllccck', 'klllllccck', '.kllcccck.', '..kcccck..', '...kkkk...', '..........', '..........'],
        { k: shade(color, 0.45), l: shade(color, 1.25), c: color, w: '#ffffff' });
      return;
    }
    if (kind === 'megaStone') {
      drawRows(ctx, ['...kkkk...', '..kccllk..', '.kccwlllk.', '.kcwcclck.', '.kcclcclk.', '.klcccwck.', '..klccck..', '...kkkk...', '..........', '..........'],
        { k: shade(color, 0.4), l: shade(color, 1.4), c: color, w: '#ffffff' });
      return;
    }
    // held item: round charm, type glyph if it boosts a type
    for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
      const d = Math.hypot(x - 4.5, y - 4.5);
      if (d > 4.9) continue;
      ctx.fillStyle = d > 4 ? shade(color, 0.45) : color;
      ctx.fillRect(x, y, 1, 1);
    }
    if (pokeType && TYPE_GLYPH[pokeType as PokeType]) drawRows(ctx, TYPE_GLYPH[pokeType as PokeType], { '#': '#ffffff', o: shade(color, 1.3) }, 1, 1);
    else { ctx.fillStyle = '#ffffff'; ctx.fillRect(3, 2, 2, 1); ctx.fillRect(2, 3, 1, 2); }
  });
}

function drawProjectile(scene: Phaser.Scene, t: PokeType): void {
  canvasTex(scene, 'proj-' + t, 10, 10, (ctx) => drawRows(ctx, PROJ[t].rows, PROJ[t].pal));
}

/** Builds every icon texture. Called once from BootScene after the data is loaded. */
/** Scene whose (game-wide) texture manager receives skill icons drawn on first use. */
let iconScene: Phaser.Scene | null = null;

/**
 * Skill icons (one per move, ~1000) are drawn the first time a move is shown (`moveAssets`) instead of all at
 * boot, which was the slowest part of the start-up on phones.
 */
export function ensureSkillIcon(s: SkillDef): void {
  if (iconScene && !iconScene.textures.exists('skill-' + s.id)) drawSkillIcon(iconScene, s);
}

export function buildIcons(scene: Phaser.Scene, skills: Iterable<SkillDef>, items: Iterable<{ id: string; color: string; kind: string; icon?: string; effect?: { pokeType?: string } }>): { skills: number; bespoke: number } {
  for (const t of ALL_TYPES) { drawTypeIcon(scene, t); drawProjectile(scene, t); }
  for (const k of Object.keys(STATUS_ICON) as StatusKind[]) drawStatusIcon(scene, k);
  iconScene = scene;
  let n = 0, bespoke = 0;
  for (const s of skills) { n++; if (BESPOKE[s.id]) bespoke++; }
  for (const it of items) drawItemIcon(scene, it.id, it.color, it.kind, it.effect?.pokeType, it.icon);
  for (const id of Object.keys(ITEM_ART)) drawItemIcon(scene, id, '#ffffff', 'art');
  return { skills: n, bespoke };
}

// ───────────────────────────── registries ─────────────────────────────
export const TypeIconRegistry = { key: (t: string) => 'type-' + t, all: ALL_TYPES };
export const StatusIconRegistry = { key: (k: StatusKind) => 'status-' + k, kinds: Object.keys(STATUS_ICON) as StatusKind[] };
export const SkillIconRegistry = {
  key: (id: string) => 'skill-' + id,
  hasBespoke: (id: string) => !!BESPOKE[id],
  bespokeIds: Object.keys(BESPOKE),
};
export const ItemIconRegistry = { key: (id: string) => 'item-' + id };
export const ProjectileRegistry = { key: (t: string) => 'proj-' + t };

/** Map data for tests (glyph sizes, coverage) without Phaser. */
export const ICON_DATA = { TYPE_GLYPH, STATUS_ICON, KIND_GLYPH, BESPOKE, PROJ, ITEM_ART };
