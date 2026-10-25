import { describe, expect, it } from 'vitest';
import { AVATARS, avatarById, avatarTextureKey, cleanAvatarId, DEFAULT_AVATAR } from '../src/core/avatars';

// The avatars are hand-drawn 16×16 character maps; a typo in a row silently shifts the art, so the
// grid invariants are worth a test.
describe('profile avatars', () => {
  it('ships several distinct avatars with the classic one as default', () => {
    expect(AVATARS.length).toBeGreaterThanOrEqual(8);
    expect(new Set(AVATARS.map((a) => a.id)).size).toBe(AVATARS.length);
    expect(AVATARS.some((a) => a.id === DEFAULT_AVATAR)).toBe(true);
    for (const a of AVATARS) {
      expect(a.name.length).toBeGreaterThan(0);
      expect(a.hint.length).toBeGreaterThan(0);
    }
  });

  it('every drawing is a 16×16 grid using only transparent or palette pixels', () => {
    for (const a of AVATARS) {
      expect(a.rows, a.id).toHaveLength(16);
      for (const [y, row] of a.rows.entries()) {
        expect(row.length, `${a.id} row ${y + 1}`).toBe(16);
        for (const ch of row) expect(ch === '.' || !!a.pal[ch], `${a.id}: unknown pixel ${ch}`).toBe(true);
      }
      // a drawing made only of one colour or empty rows would not be visible
      expect(a.rows.join('')).toMatch(/[^.]/);
    }
  });

  it('sanitises ids and exposes stable texture keys', () => {
    expect(cleanAvatarId('ninja')).toBe('ninja');
    expect(cleanAvatarId('  ninja  ')).toBe(DEFAULT_AVATAR); // ids are exact, not trimmed user input
    expect(cleanAvatarId('')).toBe(DEFAULT_AVATAR);
    expect(cleanAvatarId(undefined)).toBe(DEFAULT_AVATAR);
    expect(avatarById('ninja').id).toBe('ninja');
    expect(avatarById('missing').id).toBe(DEFAULT_AVATAR);
    expect(avatarTextureKey('lass')).toBe('avt-lass');
    expect(avatarTextureKey('missing')).toBe('avt-' + DEFAULT_AVATAR);
  });
});
