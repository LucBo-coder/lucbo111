import { describe, expect, it } from 'vitest';
import itemsJson from '../src/data/items.json';
import { BALL_ORDER } from '../src/core/capture';
import { AMBUSH_TRAINER_ART, NPC_TRAINER_ART } from '../src/render/spriteRegistry';
import { REGION_DEFS } from '../src/core/map/regionDefs';

// The personal pack is git-ignored: these checks run only where it has been downloaded.
const found = import.meta.glob<{ items?: string[]; trainers?: string[] }>('../public/assets/official/index.json', { eager: true, import: 'default' });
const idx = Object.values(found)[0] ?? null;

describe.skipIf(!idx)('official item & trainer art (personal pack)', () => {
  it('every item of the game has official art', () => {
    const ids = [...(itemsJson as { id: string }[]).map((i) => i.id), ...BALL_ORDER, 'potion', 'superpotion', 'oranberry'];
    for (const id of ids) expect(idx!.items, id).toContain(id);
  });
  it('every NPC / trainer of every region and every ambush look has a trainer sprite', () => {
    // quest boards and the glowing crystal are objects, not people: they keep their tile
    for (const d of Object.values(REGION_DEFS)) for (const n of [...d.npcs, ...d.trainers]) if (n.sprite !== 'board' && n.sprite !== 'light') expect(idx!.trainers, n.id).toContain(NPC_TRAINER_ART[n.id]);
    for (const t of AMBUSH_TRAINER_ART) expect(idx!.trainers, t).toContain(t);
  });
});
