import { describe, expect, it } from 'vitest';
import { groundPose, pmdFootAnchor, visualProfile } from '../src/render/overworldVisual';
import { creatureFootAnchor, frameSize } from '../src/render/animation';
import { REGISTRY } from '../src/render/spriteRegistry';

describe('overworld ground contract', () => {
  it('keeps the PMD authored centre-relative foot offset across differently padded sheets', () => {
    for (const species of ['pikachu', 'snorlax', 'caterpie', 'articuno', 'zapdos']) {
      const profile = visualProfile(species, true);
      for (let dir = 0; dir < 8; dir++) {
        const idle = pmdFootAnchor(species, dir, 40, 56, profile);
        const attack = pmdFootAnchor(species, dir, 80, 120, profile);
        expect(idle.y - 28).toBe(attack.y - 60);
        expect(idle.x - 20).toBe(attack.x - 40);
      }
    }
  });
  it('does not count empty rows in a derived sprite as feet', () => {
    REGISTRY['test-padding'] = { rows: ['....', '.xx.', '.xx.', '....', '....'], pal: { x: '#ffffff' }, outline: false, source: 'procedural' };
    const f = frameSize(REGISTRY['test-padding'].rows);
    expect(creatureFootAnchor('test-padding').y * f).toBe(f - 3 - 2);
    delete REGISTRY['test-padding'];
  });
  it('uses ground depth/shadow even during flight; offset never changes ground', () => {
    const p = visualProfile('articuno', true);
    p.spriteOffset = { x: 3, y: -2 };
    expect(groundPose(100, 200, p, 160)).toEqual({ x: 103, y: 14, shadowX: 100, shadowY: 200, depth: 200 });
    expect(visualProfile('caterpie', true).locomotion).toBe('crawl');
    expect(visualProfile('magnemite', true).flightHeight).toBe(12);
    expect(visualProfile('pikachu', true).flightHeight).toBe(0);
    expect(visualProfile('zapdos-galar', false).flightHeight).toBe(0);
    expect(visualProfile('zapdos~shiny', true)).toEqual(visualProfile('zapdos', true));
  });
});
