// The evolution stage a species should have at a level: goes back through its line (by the game's evolution rules)
// while the level is under the stage's wild floor (ECOLOGY minLevel). Used for trainers and story waves (V30 levels).
import { ECOLOGY } from '../../src/core/encounters';
import { evolutionsOf } from '../../src/core/evolution';

const PRE = new Map<string, string>();
for (const id of ECOLOGY.keys()) for (const o of evolutionsOf(id)) if (!PRE.has(o.to)) PRE.set(o.to, id);

export function stageFor(species: string, level: number): string {
  let sp = species;
  for (let i = 0; i < 3 && (ECOLOGY.get(sp)?.minLevel ?? 1) > level && PRE.has(sp); i++) sp = PRE.get(sp)!;
  return sp;
}
