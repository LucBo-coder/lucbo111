/**
 * Player avatars (profile art only — the overworld trainer keeps its own sprite).
 *
 * Each drawing is a 16×16 character map in the same format as pixelArt.ts: '.' is transparent and
 * every other character is looked up in the avatar's palette. The data lives in `core` so the save
 * layer can validate avatar ids without importing Phaser.
 */

export interface AvatarDef {
  id: string;
  /** Vietnamese label shown in the profile picker. */
  name: string;
  /** One-line description (used as a tooltip / accessibility hint). */
  hint: string;
  pal: Record<string, string>;
  rows: string[];
}

export const DEFAULT_AVATAR = 'trainer';

export const AVATARS: readonly AvatarDef[] = [
  {
    id: 'trainer',
    name: 'Huấn luyện viên',
    hint: 'Mũ lưỡi trai đỏ, áo khoác xanh — phong cách cổ điển.',
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
  {
    id: 'lass',
    name: 'Cô bé',
    hint: 'Mũ rơm vàng, tóc hai bím và váy hồng.',
    pal: { y: '#f8d878', Y: '#c8a040', h: '#8a4a20', H: '#5a2c10', s: '#f8c898', k: '#302018', p: '#f070a0', P: '#b03868', w: '#ffffff', b: '#6040a0', n: '#3a3050' },
    rows: [
      '................',
      '....yyyyyyyy....',
      '...yyyyyyyyyy...',
      '..yyYYYYYYYYyy..',
      '....hssssssh....',
      '...hhsksskshh...',
      '...h.ssssss.h...',
      '....ssssssss....',
      '...pppppppppp...',
      '..spppwwwwppps..',
      '..s.pppppppp.s..',
      '....PPPPPPPP....',
      '.....ss..ss.....',
      '....bbb..bbb....',
      '....kkk..kkk....',
      '................',
    ],
  },
  {
    id: 'hiker',
    name: 'Nhà leo núi',
    hint: 'Mũ nồi nâu, râu rậm và áo gilet xanh.',
    pal: { t: '#b08048', T: '#7a5028', s: '#f0b080', k: '#302018', h: '#6a3c18', H: '#3f2410', v: '#4a8a38', V: '#2f5f24', w: '#ffffff', n: '#3a3020' },
    rows: [
      '................',
      '....tttttttt....',
      '...tttttttttt...',
      '..tttttttttttt..',
      '....ssssssss....',
      '....skssssks....',
      '....ssssssss....',
      '....hHHHHHHh....',
      '...vvhHHHHhvv...',
      '..svvvvvvvvvvs..',
      '..svvvwwvvvvvs..',
      '....vvvvvvvv....',
      '.....nn..nn.....',
      '.....nn..nn.....',
      '....kkk..kkk....',
      '................',
    ],
  },
  {
    id: 'scientist',
    name: 'Nhà nghiên cứu',
    hint: 'Áo blouse trắng, kính gọng và tóc đen.',
    pal: { k: '#202028', s: '#f8c898', w: '#f0f0f8', W: '#c8c8d8', b: '#4878b8', n: '#303848' },
    rows: [
      '................',
      '.....kkkkkk.....',
      '....kkkkkkkk....',
      '...kkksssskkk...',
      '...kkwksskwkk...',
      '....ssssssss....',
      '.....ssssss.....',
      '....wwwwwwww....',
      '...swwbbbbwws...',
      '...swwbbbbwws...',
      '...s.wwwwww.s...',
      '.....wwwwww.....',
      '.....nn..nn.....',
      '.....nn..nn.....',
      '....kkk..kkk....',
      '................',
    ],
  },
  {
    id: 'ranger',
    name: 'Kiểm lâm',
    hint: 'Mũ vành rộng, áo xanh và huy hiệu vàng.',
    pal: { t: '#c8a050', T: '#8a6828', s: '#f0b888', k: '#302018', v: '#3a7a4a', V: '#245030', y: '#f8d030', n: '#3a3020' },
    rows: [
      '................',
      '....tttttttt....',
      '...tttttttttt...',
      '..tttttttttttt..',
      '....ssssssss....',
      '....skssssks....',
      '....ssssssss....',
      '....vvvvvvvv....',
      '...svvvyyvvvs...',
      '...svvvvvvvvs...',
      '...s.VVVVVV.s...',
      '.....VVVVVV.....',
      '.....nn..nn.....',
      '.....nn..nn.....',
      '....kkk..kkk....',
      '................',
    ],
  },
  {
    id: 'swimmer',
    name: 'Bơi lội',
    hint: 'Mũ cao su xanh, kính bơi và làn da rám nắng.',
    pal: { c: '#40c8e0', C: '#2088a8', s: '#f0b080', k: '#302018', w: '#ffffff', n: '#283048' },
    rows: [
      '................',
      '....cccccccc....',
      '...cccccccccc...',
      '...ccwwccwwcc...',
      '...ccwkcckwcc...',
      '....ssssssss....',
      '.....ssssss.....',
      '......ssss......',
      '....cccccccc....',
      '...s.cccccc.s...',
      '...s.cccccc.s...',
      '.....CCCCCC.....',
      '.....CC..CC.....',
      '.....ss..ss.....',
      '....sss..sss....',
      '................',
    ],
  },
  {
    id: 'veteran',
    name: 'Cựu binh',
    hint: 'Tóc bạc, vết sẹo và áo khoác tối màu.',
    pal: { g: '#c8c8d0', G: '#8888a0', s: '#e8b888', k: '#302018', n: '#2a2a38', N: '#1a1a24', y: '#d8a830', r: '#a83030' },
    rows: [
      '................',
      '....gggggggg....',
      '...gggggggggg...',
      '...ggssssssgg...',
      '...gssksskssg...',
      '....ssssrsss....',
      '.....ssssss.....',
      '......ssss......',
      '....nnnnnnnn....',
      '...snnynnynns...',
      '...s.nnnnnn.s...',
      '.....NNNNNN.....',
      '.....nn..nn.....',
      '.....nn..nn.....',
      '....kkk..kkk....',
      '................',
    ],
  },
  {
    id: 'ninja',
    name: 'Ninja',
    hint: 'Mũ trùm tím, băng đô trắng, chỉ hở đôi mắt.',
    pal: { p: '#6a4a9a', P: '#422a68', s: '#f8c898', k: '#302018', w: '#ffffff', n: '#282438' },
    rows: [
      '................',
      '....pppppppp....',
      '...pppppppppp...',
      '...ppwwwwwwpp...',
      '...pssssssssp...',
      '...pskssssksp...',
      '....pppppppp....',
      '.....pppppp.....',
      '....pppppppp....',
      '...spppppppps...',
      '...s.pppppp.s...',
      '.....PPPPPP.....',
      '.....nn..nn.....',
      '.....nn..nn.....',
      '....kkk..kkk....',
      '................',
    ],
  },
] as const;

const AVATAR_BY_ID = new Map(AVATARS.map((a) => [a.id, a]));

/** Falls back to the classic trainer for old profiles, missing data or unknown ids. */
export function cleanAvatarId(raw: unknown): string {
  return typeof raw === 'string' && AVATAR_BY_ID.has(raw) ? raw : DEFAULT_AVATAR;
}

export function avatarById(id: string): AvatarDef {
  return AVATAR_BY_ID.get(cleanAvatarId(id))!;
}

/** Static texture key generated at boot. */
export function avatarTextureKey(id: string): string {
  return 'avt-' + cleanAvatarId(id);
}
