import caveJson from '../../data/world/dungeons.json';
import variantsJson from '../../data/world/dungeon-variants.json';
import type { DungeonDef } from './dungeonMap';

// Every dungeon of the game. The Ancient Cave is hand-authored (ASCII layout); the elemental dungeons and the
// timed Challenge reuse its layout (rooms, doors, plates) with their own waves, boss, hazards, tint and rewards.

type Variant = Omit<DungeonDef, 'width' | 'height' | 'rows' | 'rooms' | 'plateOrder'> & { layout: string };

const CAVE = caveJson as unknown as DungeonDef;
const LAYOUTS: Record<string, DungeonDef> = { [CAVE.id]: CAVE };

export const DUNGEONS: Record<string, DungeonDef> = { [CAVE.id]: { ...CAVE, region: 'starter-valley', kind: 'cave' } };
for (const v of variantsJson as unknown as Variant[]) {
  const base = LAYOUTS[v.layout];
  if (!base) throw new Error(`dungeon ${v.id}: unknown layout ${v.layout}`);
  DUNGEONS[v.id] = { ...base, ...v, rows: base.rows, rooms: base.rooms, plateOrder: base.plateOrder, width: base.width, height: base.height };
}

export function dungeonDef(id: string | null | undefined): DungeonDef {
  return DUNGEONS[id ?? ''] ?? DUNGEONS[CAVE.id];
}
