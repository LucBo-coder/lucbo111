import { describe, expect, it } from 'vitest';
import { clockwise, relicsDue, RELICS, RITUALS, RITUAL_OF, RitualRun, roamFlag, type RitualDef } from '../src/core/rituals';
import { activeHazard, HAZARD_TELEGRAPH, hazardPoints, MAX_HAZARD_KINDS } from '../src/core/shrineHazards';
import { SHRINES, shrineBounds, shrineCells, shrineFind } from '../src/core/shrines';
import { LEGENDS } from '../src/core/legends';
import { ITEM_DEFS } from '../src/core/evolution';
import { REGION_DEFS } from '../src/core/map/regionDefs';
import { ValleyMap } from '../src/core/map/valley';

// V22 legendary shrines, steps 2–6 (LEGENDARY_SHRINES.md): rituals (data/world/rituals.json + core/rituals.ts),
// relics (key items), roaming triggers, shrine planes and arena hazards.

const counts = (shrine: string) => {
  const s = SHRINES.get(shrine)!, out: Record<string, number> = {};
  for (const ch of s.rows.join('')) out[ch] = (out[ch] ?? 0) + 1;
  out['12'] = (out['1'] ?? 0) + (out['2'] ?? 0);
  return out;
};
const def = (steps: RitualDef['steps']): RitualDef => ({ shrine: 't', legends: ['t'], title: 'T', steps, appear: 'fade', color: 0, awaken: '' });
const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('V22 rituals: data', () => {
  it('every shrine has a ritual; every step uses parts its layout really has', () => {
    expect(RITUALS.size).toBe(SHRINES.size);
    for (const r of RITUALS.values()) {
      expect(SHRINES.has(r.shrine), r.shrine).toBe(true);
      expect(r.title.length, r.shrine).toBeGreaterThan(3);
      expect(r.steps.length, r.shrine).toBeLessThanOrEqual(3);
      const c = counts(r.shrine);
      for (const st of r.steps) {
        expect(st.text.length, r.shrine).toBeGreaterThan(10);
        if (st.kind === 'sequence') expect(c[st.part] ?? 0, `${r.shrine} ${st.part}`).toBeGreaterThanOrEqual(2);
        if (st.kind === 'plates') {
          expect(c[st.part] ?? 0, `${r.shrine} ${st.part}`).toBe(st.order.length);
          expect([...st.order].sort()).toEqual(st.order.map((_, i) => i));
        }
        if (st.kind === 'relic') for (const i of st.items) {
          expect(ITEM_DEFS.get(i)?.kind, i).toBe('key');
          expect(RELICS.some((x) => x.id === i), i).toBe(true);
        }
        if (st.kind === 'quiz') for (const q of st.questions) expect(q.answer).toBeLessThan(q.options.length);
      }
      for (const l of r.legends) expect(LEGENDS.has(l), l).toBe(true);
    }
  });

  it('every fought / met legendary has its shrine ritual; no two rituals are the same chain', () => {
    for (const l of LEGENDS.values()) if (l.kind === 'shrine' || l.kind === 'gift') expect(RITUAL_OF.get(l.id), l.id).toBeTruthy();
    const sig = new Map<string, string>();
    for (const r of RITUALS.values()) {
      if ((r.mode ?? 'fight') !== 'fight' && r.mode !== 'gift' || !r.steps.length) continue;
      const k = r.steps.map((s) => s.kind + ':' + ('part' in s ? s.part : '') + ':' + ('count' in s ? s.count : 'order' in s ? s.order.join('') : 'items' in s ? s.items.join() : '')).join('|');
      expect(sig.get(k), `${r.shrine} = ${sig.get(k)}`).toBeUndefined();
      sig.set(k, r.shrine);
    }
  });

  it('relics: each is a key item with a real source; earned by story flags or a finished investigation', () => {
    for (const r of RELICS) {
      expect(ITEM_DEFS.get(r.id)?.price, r.id).toBe(0);
      for (const f of r.from) expect(/^(boss|clues):/.test(f), f).toBe(true);
    }
    const flags = new Set(['boss:articuno', 'boss:zapdos', 'boss:moltres']);
    const due = relicsDue((f) => flags.has(f), () => false, () => false);
    expect(due.sort()).toEqual(['feather-fire', 'feather-ice', 'feather-thunder']);
    expect(relicsDue((f) => flags.has(f), () => false, (i) => i === 'feather-ice')).not.toContain('feather-ice');
    // Lugia's silver feather comes from its investigation
    expect(relicsDue(() => false, (l) => l === 'lugia', () => false)).toEqual(['silver-feather']);
  });

  it('each roamer is woken by a trigger in the world (stone, terrace or Beast statue)', () => {
    const woken = new Set<string>();
    for (const r of RITUALS.values()) { if (r.mode === 'roam') r.legends.forEach((l) => woken.add(l)); r.wake?.forEach((l) => woken.add(l)); }
    for (const l of LEGENDS.values()) if (l.kind === 'roaming') {
      expect(woken.has(l.id), l.id).toBe(true);
      expect(l.requires).toContain(roamFlag(l.id));
    }
    // Ho-Oh's tower has one Beast statue per Beast
    expect(counts('ho-oh').S).toBeGreaterThanOrEqual(RITUALS.get('ho-oh')!.wake!.length);
  });

  it('gates lead into their planes onto open ground; the planes lead back next to the gate', () => {
    for (const r of RITUALS.values()) {
      if (r.mode !== 'portal') continue;
      const to = r.to!, plane = REGION_DEFS[to.region];
      expect(plane?.void, to.region).toBeTruthy();
      const m = new ValleyMap(plane);
      expect(m.solidAt(to.x, to.y), `${r.shrine} → ${to.region}`).toBe(false);
      const back = plane.portals![0], home = new ValleyMap(REGION_DEFS[back.to]);
      expect(home.solidAt(back.toX, back.toY), `${to.region} back`).toBe(false);
      const gate = REGION_DEFS[back.to].legendaries!.find((l) => l.shrine === r.shrine)!;
      const s = SHRINES.get(r.shrine)!, [x0, y0] = shrineBounds(s, gate.x, gate.y), p = shrineFind(s, 'P')!;
      expect(Math.hypot(back.toX - (x0 + p[0]), back.toY - (y0 + p[1])), r.shrine).toBeLessThanOrEqual(3);
    }
  });

  it('arena hazards: at most two kinds per shrine, telegraphed at least 0.8 s', () => {
    expect(HAZARD_TELEGRAPH).toBeGreaterThanOrEqual(0.8);
    for (const r of RITUALS.values()) {
      expect((r.hazards ?? []).length, r.shrine).toBeLessThanOrEqual(MAX_HAZARD_KINDS);
      if (r.hazards?.length && SHRINES.get(r.shrine)!.arena === 0) expect(['cresselia']).toContain(r.shrine);
    }
  });
});

describe('V22 rituals: the state machine', () => {
  it('untimed sequence: the objects light up in turn; touching the lit one counts, a wrong one restarts', () => {
    const r = new RitualRun(def([{ kind: 'sequence', part: 'O', count: 3, text: 'xxxxxxxxxxx' }]), { O: 4 });
    expect(r.lit).toBe(0);
    r.touch('O', 0);
    expect(r.done).toBe(1);
    expect(r.lit).toBe(1);
    r.touch('O', 3); // wrong
    expect(r.done).toBe(0);
    expect(r.drain().some((e) => e.t === 'fail')).toBe(true);
    for (let i = 0; i < 3; i++) r.touch('O', r.lit);
    expect(r.finished).toBe(true);
    expect(r.drain().pop()).toEqual({ t: 'complete' });
  });

  it('timed sequence (Mew): too slow fails with the cooldown; the light never stays on the same statue', () => {
    const r = new RitualRun(def([{ kind: 'sequence', part: 'S', count: 3, window: 3, cooldown: 60, text: 'xxxxxxxxxxx' }]), { S: 4 }, seq([0.1, 0.1, 0.6]));
    const first = r.lit;
    r.touch('S', first);
    expect(r.lit).not.toBe(first);
    r.drain();
    r.tick(3.1, false, 'clear');
    expect(r.drain().find((e) => e.t === 'fail')).toMatchObject({ cooldown: 60 });
  });

  it('plates: the order is followed, re-standing on the last plate is fine, a wrong plate restarts', () => {
    const r = new RitualRun(def([{ kind: 'plates', part: '&', order: [1, 3, 0, 2], text: 'xxxxxxxxxxx' }]), { '&': 4 });
    r.stepOn('&', 1); r.stepOn('&', 1); r.stepOn('&', 3);
    expect(r.done).toBe(2);
    r.stepOn('&', 2);
    expect(r.done).toBe(0);
    for (const i of [1, 3, 0, 2]) r.stepOn('&', i);
    expect(r.finished).toBe(true);
  });

  it('hidden plates (Cresselia) give no light event; relic / field / quiz steps wait for the scene', () => {
    const r = new RitualRun(def([{ kind: 'relic', items: ['lunar-feather'], text: 'xxxxxxxxxxx' }, { kind: 'plates', part: '&', order: [2, 0, 1], hidden: true, text: 'xxxxxxxxxxx' }]), { '&': 3 });
    expect(r.step?.kind).toBe('relic');
    r.drain();
    r.pass();
    expect(r.drain().some((e) => e.t === 'light')).toBe(false);
    for (const i of [2, 0, 1]) r.stepOn('&', i);
    expect(r.finished).toBe(true);
  });

  it('still: moving resets the count; a blizzard shortens Regice\'s wait', () => {
    const st = { kind: 'still' as const, seconds: 60, fast: ['blizzard'], fastSeconds: 20, text: 'xxxxxxxxxxx' };
    const r = new RitualRun(def([st]), {});
    r.tick(30, false, 'clear');
    r.tick(0.1, true, 'clear');
    expect(r.stillT).toBe(0);
    r.tick(59, false, 'clear');
    expect(r.finished).toBe(false);
    const b = new RitualRun(def([st]), {});
    b.tick(21, false, 'blizzard');
    expect(b.finished).toBe(true);
    expect(b.stillNeed('blizzard')).toBe(0); // finished: no step left
  });

  it('waves: each cleared wave counts, the last one completes the step', () => {
    const r = new RitualRun(def([{ kind: 'waves', waves: 3, ring: 3, species: ['croagunk'], text: 'xxxxxxxxxxx' }]), {});
    r.waveCleared(); r.waveCleared();
    expect(r.finished).toBe(false);
    r.waveCleared();
    expect(r.finished).toBe(true);
  });

  it('clockwise order starts at north', () => {
    const c = clockwise([{ x: 0, y: 5 }, { x: 5, y: 0 }, { x: 0, y: -5 }, { x: -5, y: 0 }], 0, 0);
    expect(c).toEqual([{ x: 0, y: -5 }, { x: 5, y: 0 }, { x: 0, y: 5 }, { x: -5, y: 0 }]);
  });
});

describe('V22 shrine hazards', () => {
  const ctx = { cx: 1000, cy: 1000, R: 480, trainer: { x: 1200, y: 1000, vx: 400, vy: 0 }, boss: { x: 900, y: 1000 }, floor: [{ x: 1100, y: 1000 }, { x: 900, y: 1100 }] };
  it('one kind at a time, alternating with the boss phase', () => {
    const list = RITUALS.get('zapdos')!.hazards!;
    expect(activeHazard(list, 0)?.kind).toBe('strike');
    expect(activeHazard(list, 1)?.kind).toBe('line');
    expect(activeHazard(list, 2)?.kind).toBe('strike');
    expect(activeHazard(undefined, 0)).toBeNull();
  });
  it('every strike lands inside the arena', () => {
    for (const kind of ['strike', 'ring', 'line', 'floor'] as const) {
      const pts = hazardPoints({ kind, type: 'electric', every: 7, power: 40 }, ctx, () => 0.37);
      expect(pts.length, kind).toBeGreaterThan(0);
      for (const p of pts) expect(Math.hypot(p.x - ctx.cx, p.y - ctx.cy), kind).toBeLessThanOrEqual(ctx.R + 1);
    }
  });
  it('the hazard floor tiles of a shrine are its x cells (Kyogre\'s tide ring)', () => {
    const s = SHRINES.get('kyogre')!;
    expect([...shrineCells(s, 25, 22)].filter((c) => c.ch === 'x').length).toBeGreaterThan(100);
  });
});
