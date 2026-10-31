import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Every adventure map and every legendary shrine must be reachable from the start:
// no portal may require a boss that can only be fought behind that same portal.
const DIR = join(__dirname, '../src/data/world');
type Link = { to: string; requires?: string[] };

const maps = new Map<string, unknown>();
for (const f of readdirSync(DIR)) {
  if (!f.endsWith('.json')) continue;
  const j = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  if (j && typeof j === 'object' && 'portals' in j) maps.set(f.slice(0, -5), j);
}

function collect(o: unknown, hit: (n: Record<string, unknown>) => void): void {
  if (Array.isArray(o)) o.forEach((x) => collect(x, hit));
  else if (o && typeof o === 'object') {
    hit(o as Record<string, unknown>);
    for (const v of Object.values(o)) collect(v, hit);
  }
}

describe('world progression', () => {
  it('has no gate that depends on a boss behind itself', () => {
    const bossIn = new Map<string, string>([['mega-venusaur', 'starter-valley']]);
    const links = new Map<string, Link[]>();
    for (const [id, m] of maps) {
      const ls: Link[] = [];
      collect(m, (n) => {
        if (typeof n.shrine === 'string' && !bossIn.has(n.shrine)) bossIn.set(n.shrine, id);
        if (typeof n.to === 'string') ls.push(n as unknown as Link);
      });
      links.set(id, ls);
    }
    // Region flags come from story quests in the always-open starter areas.
    const flags = new Set(['region:emerald-forest', 'region:coral-coast']);
    const reach = new Set(['starter-valley']);
    for (let changed = true; changed;) {
      changed = false;
      for (const [b, m] of bossIn) if (reach.has(m) && !flags.has('boss:' + b)) { flags.add('boss:' + b); changed = true; }
      for (const m of [...reach]) for (const l of links.get(m) ?? []) {
        if (maps.has(l.to) && !reach.has(l.to) && (l.requires ?? []).every((r) => flags.has(r))) { reach.add(l.to); changed = true; }
      }
    }
    expect([...maps.keys()].filter((m) => !reach.has(m) && m !== 'pvp-arena')).toEqual([]);
    expect([...bossIn.keys()].filter((b) => !flags.has('boss:' + b))).toEqual([]);
  });
});
