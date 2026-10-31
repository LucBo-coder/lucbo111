import { describe, expect, it } from 'vitest';
import { auditQuests, type AuditWorld } from '../src/core/questAudit';
import type { QuestDef } from '../src/core/quests';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { BOSSES, POKEMON } from '../src/core/data';
import { LEGENDS, legendQuests } from '../src/core/legends';
import { storyOf } from '../src/core/storyData';
import gathering from '../src/data/world/gathering.json';
import worldQuests from '../src/data/world/quests.json';
import vnQuests from '../src/data/vietnam/quests.json';
import { CONSERVATION } from '../src/core/conservation';

const world: AuditWorld = {
  regions: REGION_DEFS,
  bosses: new Set([...BOSSES.keys(), ...LEGENDS.keys(), ...Object.values(REGION_DEFS).flatMap((r) => (r.worldBoss ? [r.worldBoss.id] : []))]),
  species: new Set(POKEMON.keys()),
  gatherKinds: new Set(Object.values(gathering as Record<string, { kind: string }>).map((g) => g.kind)),
  legends: new Set(LEGENDS.keys()),
};
const books: Record<string, QuestDef[]> = {
  classic: [...(worldQuests as unknown as QuestDef[]), ...legendQuests(worldQuests as unknown as QuestDef[]), ...storyOf('classic').quests],
  vietnam: [...(vnQuests as unknown as QuestDef[]), ...storyOf('vietnam').quests],
};

describe('quest book audit (V30)', () => {
  for (const [name, qs] of Object.entries(books)) {
    it(`${name}: no broken quest`, () => {
      const issues = auditQuests(qs, world);
      const errors = issues.filter((i) => i.level === 'error').map((i) => `${i.quest}: ${i.msg}`);
      if (process.env.AUDIT) console.log(issues.map((i) => `[${i.level}] ${i.quest}: ${i.msg}`).join('\n'));
      expect(errors).toEqual([]);
    });
  }

  it('restoration quests never ask for more sites than the province has', () => {
    for (const q of books.vietnam) for (const o of q.objectives) {
      if (!o.target?.startsWith('eco:')) continue;
      expect(o.count, q.id).toBeLessThanOrEqual(CONSERVATION[o.target.slice(4)]?.sites.length ?? 0);
    }
  });
});
