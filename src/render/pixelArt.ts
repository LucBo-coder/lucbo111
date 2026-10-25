import Phaser from 'phaser';
import { AVATARS, avatarTextureKey } from '../core/avatars';
import { REGISTRY } from './spriteRegistry';

// All art is generated at boot from tiny pixel maps, so the game has zero binary assets.
// '.' = transparent; every other char is looked up in the palette.

export type Palette = Record<string, string>;
export const SPRITES: Record<string, { pal: Palette; rows: string[] }> = {
  charmander: {
    pal: { o: '#f08030', O: '#c85818', y: '#f8d878', w: '#ffffff', k: '#202020', r: '#e83010', Y: '#ffe040' },
    rows: [
      '........oooo....',
      '.......oooooo...',
      '......oooooooo..',
      '......ooooowko..',
      '......oooooooooo',
      '......Oooooooo..',
      '.......oooooo...',
      '..r....ooooo....',
      '.rYr..ooyyyoo...',
      '.rrr.oooyyyooo..',
      '..O.ooooyyyoo...',
      '...OooooyyyoO...',
      '......ooyyoo....',
      '......oo..oo....',
      '.....ooo..ooo...',
      '................',
    ],
  },
  squirtle: {
    pal: { b: '#58a8f0', B: '#3878c0', s: '#b87838', S: '#8a5220', y: '#f8e0a0', w: '#ffffff', k: '#202020' },
    rows: [
      '................',
      '........bbbb....',
      '.......bbbbbb...',
      '.......bbbbwkb..',
      '.......bbbbbbbb.',
      '........bbbbbB..',
      '.....sssbbbb....',
      '....sSssyyyyb...',
      '...sSsssyyyybb..',
      '..bsSsssyyyy.b..',
      '.bb.sSssyyyy....',
      '.b...sssyyy.....',
      '......ssss......',
      '......bb.bb.....',
      '.....BBB.BBB....',
      '................',
    ],
  },
  bulbasaur: {
    pal: { g: '#3a9040', G: '#68c858', t: '#60c8a8', T: '#3e9a80', d: '#2e7a68', r: '#e84040', w: '#ffffff', m: '#c03030' },
    rows: [
      '................',
      '....gg..........',
      '...gGGg.........',
      '..gGGGGg........',
      '..gGGGGGg.tt....',
      '..gGGGGgtttttt..',
      '...ggggttttttt..',
      '...tttttttrwtt..',
      '..ttdtttttttttt.',
      '..tttttdttttttt.',
      '..Tttttttttmmt..',
      '...tdtttttttt...',
      '...TT.tt..TT.tt.',
      '...TT.tt..TT.tt.',
      '................',
      '................',
    ],
  },
  rattata: {
    pal: { p: '#a070c0', P: '#7a4ea0', c: '#f0e0c0', w: '#ffffff', k: '#202020', t: '#ffffff' },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '.........pp.....',
      '........pppp.pp.',
      '.......pppppppp.',
      '......ppppppwkp.',
      '.....pppppppppcc',
      '....ppppcccppp..',
      '...pppppcccpp...',
      '..P.pppppppp....',
      '.P...PP...PP....',
      'P...PPP..PPP....',
      '................',
      '................',
    ],
  },
  magnemite: {
    pal: { g: '#b0b8c8', G: '#808898', w: '#ffffff', k: '#202020', r: '#e04040', b: '#4070e0', s: '#606070' },
    rows: [
      '................',
      '.......ss.......',
      '.......ss.......',
      '.....gggggg.....',
      '....gggggggg....',
      '...gggwwwwggg...',
      'rr.ggwwkkwwgg.rr',
      'rrrggwwkkwwgggrr',
      'bb.ggwwwwwwgg.bb',
      '....gggwwggg....',
      '....Ggggggggg...',
      '.....s.GGG.s....',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  geodude: {
    pal: { r: '#9a9080', R: '#c8c0b0', h: '#787060', k: '#202020', w: '#ffffff', d: '#5a5244' },
    rows: [
      '................',
      '................',
      '................',
      '.....rrrrrr.....',
      '....rrRRrrrrr...',
      '...rrRrrrrrRrr..',
      '...rrkwrrrkwrr..',
      '..rrrrrrrrrrrrr.',
      'hhrrrrrddddrrrhh',
      'hhhrrrrrrrrrrhhh',
      '.hh.rrrrrrrrr.hh',
      '.....drrrrrd....',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  trainer: {
    pal: { r: '#e83030', R: '#a01818', w: '#ffffff', s: '#f8c898', k: '#302018', b: '#3070d0', B: '#2050a0', n: '#283048', y: '#f8d030' },
    rows: [
      '................',
      '.....rrrrrr.....',
      '....rrrwwrrr....',
      '....rrrrrrrrRR..',
      '....kkssssk.....',
      '....ksksskk.....',
      '.....ssssss.....',
      '......ssss......',
      '....bbbbbbbb....',
      '...sbbyybbbbs...',
      '...s.bbbbbb.s...',
      '.....BBBBBB.....',
      '.....nn..nn.....',
      '.....nn..nn.....',
      '....kkk..kkk....',
      '................',
    ],
  },
  pikachu: {
    pal: { y: '#f8d030', Y: '#d8a820', k: '#202020', w: '#ffffff', r: '#e84838', b: '#9a6028' },
    rows: [
      '.........k....k.',
      '.........yk..ky.',
      '.........yy..yy.',
      '........yyyyyyy.',
      '........yykyyyk.',
      '..bb....yyyyyyyy',
      '.bby....yryyyry.',
      '.byy.....yyyyy..',
      '..yy...yyyyyyy..',
      '...yy.yyyyyyyyy.',
      '....yyyyyyyyyy..',
      '.....YyyyyyyyY..',
      '......Yyyyyyy...',
      '......yy...yy...',
      '.....YYY..YYY...',
      '................',
    ],
  },
  pidgey: {
    pal: { b: '#b07840', B: '#7a5028', c: '#f0dcb0', w: '#ffffff', k: '#202020', g: '#9090a0', p: '#e0a070' },
    rows: [
      '................',
      '.........bbb....',
      '........bbbbbb..',
      '.......bbbwkbb..',
      '.......bbbbbbbgg',
      '....bbbbcccbbb..',
      '..bbbbbccccbb...',
      '.bbBBbcccccb....',
      'bbBBBbcccccb....',
      '.bBBBbbccccb....',
      '..bBbbbcccb.....',
      '....bbbbbb......',
      '.....pp.pp......',
      '....ppp.ppp.....',
      '................',
      '................',
    ],
  },
  caterpie: {
    pal: { g: '#78c850', G: '#4a9a30', y: '#f8e070', Y: '#d0b040', r: '#e84838', w: '#ffffff', k: '#202020' },
    rows: [
      '................',
      '................',
      '................',
      '................',
      '...........rr...',
      '..........rgg...',
      '.........gggggg.',
      '.........ggwkgg.',
      '...gg..g.gggggg.',
      '..ggggggggggyyg.',
      '.gyggyggyggggg..',
      '.gggggggggggg...',
      '..GYg.GYg.GYg...',
      '................',
      '................',
      '................',
    ],
  },
  oddish: {
    pal: { l: '#58b048', L: '#3a8030', b: '#5070c8', B: '#3a54a0', r: '#e04040', w: '#ffffff' },
    rows: [
      '...l......l.....',
      '...ll....ll.....',
      '....ll..ll......',
      '..llllllllll....',
      '.lllLllllLlll...',
      '...lllLLlll.....',
      '.....llll.......',
      '....bbbbbb......',
      '...bbbbbbbb.....',
      '...bbrbbbrbb....',
      '...bbbbbbbbb....',
      '....bBbbbBb.....',
      '.....BB.BB......',
      '................',
      '................',
      '................',
    ],
  },
  zubat: {
    pal: { b: '#5890d8', B: '#3a64a8', p: '#9870c0', P: '#704898', r: '#c03040', w: '#ffffff' },
    rows: [
      '................',
      '................',
      '................',
      'pp............pp',
      'ppp..bb..bb..ppp',
      'pPpp.bbbbbb.ppPp',
      'pPPpbbbbbbbbpPPp',
      '.pPPpbbbbbbpPPp.',
      '..pppbrrrrbppp..',
      '...pp.brwb.pp...',
      '.......bb.......',
      '......b..b......',
      '.....B....B.....',
      '................',
      '................',
      '................',
    ],
  },
  onix_head: {
    pal: { r: '#a0a0a8', R: '#d0d0d8', d: '#606068', h: '#787880', w: '#ffffff', k: '#202020', m: '#404048' },
    rows: [
      '................',
      '........hh......',
      '.......hhh......',
      '....rrrrrrrr....',
      '...rrRRrrrrrr...',
      '..rrRrrrrrrrrr..',
      '..rrrrrwwkrrrrr.',
      '..rrrrrwkkrrrrrr',
      '..drrrrrrrrrrrrr',
      '..ddrrrrrrrrrrr.',
      '...ddrrrrrmmmm..',
      '....ddrrrrrr....',
      '.....dddddd.....',
      '................',
      '................',
      '................',
    ],
  },
};

const ICONS: Record<string, { pal: Palette; rows: string[] }> = {
  heart: { pal: { r: '#ff4060', R: '#ffa0b0' }, rows: ['..........', '.rr...rr..', 'rRrr.rrrr.', 'rRrrrrrrr.', 'rrrrrrrrr.', '.rrrrrrr..', '..rrrrr...', '...rrr....', '....r.....', '..........'] },
  sword: { pal: { w: '#e0e8ff', y: '#f0c040', b: '#806040' }, rows: ['.........w', '........ww', '.......ww.', '......ww..', '.....ww...', 'y...ww....', '.y.ww.....', '..yw......', '.bby......', 'bb..y.....'] },
  clock: { pal: { k: '#303040', w: '#f0f0ff', r: '#ff5050' }, rows: ['..kkkkk...', '.kwwwwwk..', 'kwwwkwwwk.', 'kwwwkwwwk.', 'kwwwkrrwk.', 'kwwwwwwwk.', '.kwwwwwk..', '..kkkkk...', '..........', '..........'] },
  star: { pal: { y: '#ffe040', Y: '#fff0a0' }, rows: ['....y.....', '....y.....', '...yYy....', 'yyyyYyyyy.', '.yyyyyyy..', '..yyyyy...', '..yy.yy...', '.yy...yy..', '..........', '..........'] },
  boot: { pal: { b: '#c06030', w: '#f0f0f0' }, rows: ['..bbbb....', '..bbbb....', '..bbbb....', '..bbbb....', '..bbbbbb..', '..bbbbbbb.', '..bbbbbbbb', '..wwwwwwww', '..........', '..........'] },
  magnet: { pal: { r: '#ff4040', b: '#4080ff', w: '#e0e0e0' }, rows: ['.ww...ww..', '.rr...bb..', '.rr...bb..', '.rr...bb..', '.rr...bb..', '.rrr.bbb..', '..rrrbb...', '...rrb....', '..........', '..........'] },
  bolt: { pal: { y: '#ffe040' }, rows: ['.....yy...', '....yy....', '...yy.....', '..yyyyyy..', '.....yy...', '....yy....', '...yy.....', '..y.......', '..........', '..........'] },
  ring: { pal: { c: '#60e0ff' }, rows: ['...cccc...', '.cc....cc.', 'c........c', 'c...cc...c', 'c...cc...c', 'c........c', '.cc....cc.', '...cccc...', '..........', '..........'] },
  multi: { pal: { o: '#ffa040' }, rows: ['..........', 'o...o...o.', 'oo..oo..oo', 'ooo.ooo.oo', 'oo..oo..oo', 'o...o...o.', '..........', '..........', '..........', '..........'] },
  skill: { pal: { w: '#ffffff', c: '#80d0ff' }, rows: ['....w.....', '...wcw....', '..wcccw...', 'wwcccccww.', '..wcccw...', '...wcw....', '....w.....', '..........', '..........', '..........'] },
  berry: { pal: { g: '#40a040', b: '#4060e0', w: '#c0d0ff' }, rows: ['....g.....', '...gg.....', '..bbbb....', '.bbbbbb...', '.bwbbbb...', '.bbbbbb...', '..bbbb....', '..........', '..........', '..........'] },
  pokeball: { pal: { r: '#e83030', w: '#ffffff', k: '#202020' }, rows: ['..kkkk..', '.krrrrk.', 'krrrrrrk', 'kkkwwkkk', 'kwwwwwwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'] },
};

function drawMap(scene: Phaser.Scene, key: string, rows: string[], pal: Palette, width?: number): void {
  const w = width ?? Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  rows.forEach((row, y) => {
    for (let x = 0; x < w; x++) {
      const c = row[x] ?? '.';
      if (c === '.' || !pal[c]) continue;
      ctx.fillStyle = pal[c];
      ctx.fillRect(x, y, 1, 1);
    }
  });
  tex.refresh();
}

/** Outline every opaque pixel with a dark 1px border for readability on grass. */
/** Draws a palette grid of any size into a static texture (optional 1px dark outline). */
export function drawGridTexture(scene: Phaser.Scene, key: string, rows: string[], pal: Palette, outline = true): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const gw = Math.max(...rows.map((r) => r.length));
  const pad = outline ? 1 : 0;
  const tex = scene.textures.createCanvas(key, gw + pad * 2, rows.length + pad * 2)!;
  paintGrid(tex.getContext(), rows, pal, outline);
  tex.refresh();
}

/** Paints a character-map drawing at (0,0) of a context (1 px outline when `outline`). */
export function paintGrid(ctx: CanvasRenderingContext2D, rows: string[], pal: Palette, outline = true): void {
  const gw = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(gw, '.'));
  const pad = outline ? 1 : 0;
  const solid = (x: number, y: number) => y >= 0 && y < grid.length && x >= 0 && x < gw && grid[y][x] !== '.';
  if (outline) {
    ctx.fillStyle = '#1a1420';
    for (let y = -1; y <= grid.length; y++) {
      for (let x = -1; x <= gw; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) ctx.fillRect(x + 1, y + 1, 1, 1);
      }
    }
  }
  grid.forEach((row, y) => {
    for (let x = 0; x < gw; x++) {
      const c = row[x];
      if (c === '.' || !pal[c]) continue;
      ctx.fillStyle = pal[c];
      ctx.fillRect(x + pad, y + pad, 1, 1);
    }
  });
}

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, fn: (ctx: CanvasRenderingContext2D) => void): void {
  const tex = scene.textures.createCanvas(key, w, h)!;
  fn(tex.getContext());
  tex.refresh();
}

function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

export function generateTextures(scene: Phaser.Scene, eager: (key: string) => boolean = () => true): void {
  for (const [key, s] of Object.entries(REGISTRY)) if (eager(key)) drawGridTexture(scene, key, s.rows, s.pal, s.outline);
  // profile avatars: always available (they are tiny and used by the lobby)
  for (const a of AVATARS) drawGridTexture(scene, avatarTextureKey(a.id), a.rows, a.pal, true);
  for (const [key, s] of Object.entries(ICONS)) drawMap(scene, 'icon_' + key, s.rows, s.pal);

  // Onix body segment: shaded boulder
  canvas(scene, 'onix_seg', 16, 16, (ctx) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
      if (d > 7.5) continue;
      ctx.fillStyle = d > 6.6 ? '#3a3a44' : dx + dy < -4 ? '#d0d0d8' : dx + dy > 5 ? '#686870' : '#a0a0a8';
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#585860';
    ctx.fillRect(4, 9, 6, 1);
  });

  // Ground tile: grass with seeded noise
  canvas(scene, 'grass', 64, 64, (ctx) => {
    const rnd = seeded(7);
    ctx.fillStyle = '#4c9a48';
    ctx.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) {
      ctx.fillStyle = rnd() < 0.5 ? '#438c40' : '#58a852';
      ctx.fillRect(Math.floor(rnd() * 64), Math.floor(rnd() * 64), 1, rnd() < 0.3 ? 2 : 1);
    }
    for (let i = 0; i < 10; i++) {
      const x = Math.floor(rnd() * 62), y = Math.floor(rnd() * 62);
      ctx.fillStyle = '#3a7a38';
      ctx.fillRect(x, y + 1, 1, 2); ctx.fillRect(x + 2, y, 1, 3); ctx.fillRect(x + 1, y + 1, 1, 2);
    }
  });

  canvas(scene, 'tree', 32, 40, (ctx) => {
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(13, 26, 6, 12);
    ctx.fillStyle = '#3e2814'; ctx.fillRect(13, 26, 2, 12);
    const blobs: [number, number, number][] = [[16, 14, 12], [9, 19, 7], [23, 19, 7], [16, 7, 8]];
    for (const [pass, col] of [[1, '#1c4020'], [0, '#2f7a34']] as const) {
      ctx.fillStyle = col;
      for (const [cx, cy, r] of blobs) for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        if (Math.hypot(x - cx, y - cy) <= r + pass) ctx.fillRect(x, y, 1, 1);
      }
    }
    const rnd = seeded(3);
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rnd() * 32), y = Math.floor(rnd() * 28);
      const d = ctx.getImageData(x, y, 1, 1).data;
      if (d[3] && d[1] > 100) { ctx.fillStyle = y < 14 ? '#4ea84a' : '#246a2a'; ctx.fillRect(x, y, 2, 1); }
    }
  });

  canvas(scene, 'bush', 16, 10, (ctx) => {
    ctx.fillStyle = '#1c4020';
    for (const [cx, cy, r] of [[5, 6, 4], [11, 6, 4], [8, 4, 4]]) for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - cx, y - cy) <= r + 1) ctx.fillRect(x, y, 1, 1);
    ctx.fillStyle = '#3c8c3c';
    for (const [cx, cy, r] of [[5, 6, 4], [11, 6, 4], [8, 4, 4]]) for (let y = 0; y < 10; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - cx, y - cy) <= r) ctx.fillRect(x, y, 1, 1);
  });

  canvas(scene, 'flower', 5, 5, (ctx) => {
    ctx.fillStyle = '#ffffff'; ctx.fillRect(1, 0, 3, 1); ctx.fillRect(0, 1, 5, 3); ctx.fillRect(1, 4, 3, 1);
    ctx.fillStyle = '#f8d030'; ctx.fillRect(2, 2, 1, 1);
  });

  canvas(scene, 'shadow', 16, 6, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let y = 0; y < 6; y++) for (let x = 0; x < 16; x++) if (((x - 7.5) / 8) ** 2 + ((y - 2.5) / 3) ** 2 <= 1) ctx.fillRect(x, y, 1, 1);
  });

  const dot = (key: string, size: number, outer: string, inner: string) =>
    canvas(scene, key, size, size, (ctx) => {
      const c = (size - 1) / 2;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const d = Math.hypot(x - c, y - c);
        if (d > c + 0.3) continue;
        ctx.fillStyle = d < c * 0.5 ? inner : outer;
        ctx.fillRect(x, y, 1, 1);
      }
    });
  dot('p_ember', 8, '#ff6020', '#fff080');
  dot('p_water', 8, '#3888f0', '#c0e8ff');
  dot('p_bubble', 9, '#80c8ff', '#e8f8ff');
  dot('p_spark', 7, '#f8d020', '#ffffff');
  dot('p_rock', 9, '#7a7060', '#b0a890');
  dot('p_poison', 8, '#a040c0', '#e0a0ff');
  dot('p_shadow', 9, '#403050', '#9080c0');
  dot('p_psychic', 9, '#f85888', '#ffd0e0');
  dot('p_dragon', 9, '#6030e0', '#c0a0ff');
  dot('p_fairy', 8, '#f0a0c0', '#ffffff');
  dot('p_steel', 7, '#a0a8c0', '#ffffff');
  dot('p_fight', 8, '#c03028', '#ffb090');
  dot('p_ground', 8, '#c0a050', '#f0e0a0');
  canvas(scene, 'p_wind', 10, 8, (ctx) => {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(2, 4, 6, -1.1, 1.1); ctx.stroke();
    ctx.strokeStyle = '#c8e0ff'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 4, 5, -1, 1); ctx.stroke();
  });
  canvas(scene, 'p_shard', 6, 10, (ctx) => {
    ctx.fillStyle = '#a0e8ff';
    for (let y = 0; y < 10; y++) { const w = y < 5 ? Math.ceil(y / 2) + 1 : Math.ceil((9 - y) / 2) + 1; ctx.fillRect(3 - Math.floor(w / 2), y, w, 1); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(2, 2, 1, 4);
  });
  canvas(scene, 'p_star', 7, 7, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 0, 1, 7); ctx.fillRect(0, 3, 7, 1); ctx.fillRect(2, 2, 3, 3);
  });
  canvas(scene, 'p_drop', 5, 7, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(2, 0, 1, 2); ctx.fillRect(1, 2, 3, 2); ctx.fillRect(0, 4, 5, 2); ctx.fillRect(1, 6, 3, 1);
  });
  canvas(scene, 'p_smoke', 8, 8, (ctx) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const d = Math.hypot(x - 3.5, y - 3.5);
      if (d > 3.8) continue;
      ctx.fillStyle = `rgba(255,255,255,${(1 - d / 4) * 0.9})`;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  canvas(scene, 'p_leaf', 8, 8, (ctx) => {
    ctx.fillStyle = '#2a8a30';
    for (let i = 0; i < 8; i++) { const w = Math.min(i, 7 - i); ctx.fillRect(3 - Math.floor(w / 2), i, w + 1, 1); }
    ctx.fillStyle = '#90e070'; ctx.fillRect(3, 1, 1, 6);
  });

  // exp gems
  const gem = (key: string, a: string, b: string) => canvas(scene, key, 7, 9, (ctx) => {
    const rows = ['...k...', '..kak..', '.kaabk.', 'kaaabbk', 'kaabbbk', '.kabbk.', '..kbk..', '...k...', '.......'];
    rows.forEach((r, y) => [...r].forEach((c, x) => {
      if (c === '.') return;
      ctx.fillStyle = c === 'k' ? '#102030' : c === 'a' ? a : b;
      ctx.fillRect(x, y, 1, 1);
    }));
  });
  gem('gem', '#a0f0ff', '#30a0e0');
  gem('gem_big', '#ffa0ff', '#b040e0');
  gem('gem_huge', '#fff0a0', '#f0a020');

  canvas(scene, 'px', 2, 2, (ctx) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 2, 2); });
  canvas(scene, 'px4', 4, 4, (ctx) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 4, 4); });
  canvas(scene, 'circle', 64, 64, (ctx) => {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(32, 32, 32, 0, Math.PI * 2); ctx.fill();
  });
  canvas(scene, 'ringTex', 64, 64, (ctx) => {
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(32, 32, 29, 0, Math.PI * 2); ctx.stroke();
  });
  canvas(scene, 'slash', 32, 32, (ctx) => {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(8, 16, 18, -0.9, 0.9); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(4, 16, 18, -0.7, 0.7); ctx.stroke();
  });
}

export const PROJECTILE_TEX: Record<string, string> = {
  ember: 'p_ember', water: 'p_water', bubble: 'p_bubble', leaf: 'p_leaf', spark: 'p_spark', rock: 'p_rock',
  wind: 'p_wind', poison: 'p_poison',
};

/** Fallback projectile texture per type when a skill's vfx has no dedicated sprite. */
export const TYPE_PROJECTILE_TEX: Record<string, string> = {
  normal: 'p_star', fire: 'p_ember', water: 'p_water', electric: 'p_spark', grass: 'p_leaf', ice: 'p_shard',
  fighting: 'p_fight', poison: 'p_poison', ground: 'p_ground', flying: 'p_wind', psychic: 'p_psychic', bug: 'p_leaf',
  rock: 'p_rock', ghost: 'p_shadow', dragon: 'p_dragon', dark: 'p_shadow', steel: 'p_steel', fairy: 'p_fairy',
};
