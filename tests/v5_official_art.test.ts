import { describe, expect, it } from 'vitest';
import itemsJson from '../src/data/items.json';
import { BALL_ORDER } from '../src/core/capture';

// The personal pack is git-ignored: these checks run only where it has been downloaded.
const found = import.meta.glob<{ items?: string[]; trainers?: string[] }>('../public/assets/official/index.json', { eager: true, import: 'default' });
const idx = Object.values(found)[0] ?? null;

describe.skipIf(!idx)('official item art (personal pack)', () => {
  it('every item of the game has official art', () => {
    const ids = [...(itemsJson as { id: string }[]).map((i) => i.id), ...BALL_ORDER, 'potion', 'superpotion', 'oranberry'];
    for (const id of ids) expect(idx!.items, id).toContain(id);
  });
});
