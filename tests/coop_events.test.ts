import { describe, expect, it } from 'vitest';
import { COOP_EVENTS, CoopEventDirector, type CoopEventSample } from '../src/core/coopEvents';
const sample: CoopEventSample = { dt: 0.1, kills: 0, elites: 0, bosses: 0, healing: 0, bothAlive: true, distance: 100 };
describe('shared co-op challenges', () => {
  it('awards a completed hunt once and waits before the next challenge', () => {
    const director = new CoopEventDirector();
    expect(director.update({ ...sample, kills: 14 })).toBeNull();
    expect(director.update({ ...sample, kills: 1 })?.currency).toBe(250);
    for (let i = 0; i < 50; i++) expect(director.update({ ...sample, kills: 30 })).toBeNull();
    expect(director.view!.status).toBe('completed');
  });
  it.each(COOP_EVENTS)('$name uses its own objective', (def) => {
    const director = new CoopEventDirector();
    director.view = { ...def, progress: 0, left: def.duration, status: 'active' };
    if (def.id === 'survive' || def.id === 'together') {
      for (let i = 0; i < def.goal * 10 + 1; i++) director.update(sample);
    } else {
      const metric = { hunt: 'kills', elite: 'elites', boss: 'bosses', heal: 'healing' }[def.id]!;
      expect(director.update({ ...sample, [metric]: def.goal })?.id).toBe(def.id);
    }
    expect(director.view!.status).toBe('completed');
  });
  it('does not count distant/fainted teammates and resets continuous survival', () => {
    const d = new CoopEventDirector(), def = COOP_EVENTS.find((e) => e.id === 'together')!;
    d.view = { ...def, progress: 5, left: 100, status: 'active' };
    d.update({ ...sample, distance: 300 }); d.update({ ...sample, bothAlive: false });
    expect(d.view.progress).toBe(5);
    d.view.id = 'survive'; d.update({ ...sample, bothAlive: false });
    expect(d.view.progress).toBe(0);
  });
  it('expires without awarding currency', () => {
    const d = new CoopEventDirector(); d.update(sample); d.view!.left = 0.05;
    expect(d.update(sample)).toBeNull(); expect(d.view!.status).toBe('expired');
  });
});
