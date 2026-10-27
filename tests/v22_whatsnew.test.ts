import { describe, expect, it } from 'vitest';
import { unseenCount, WHATS_NEW } from '../src/core/whatsNew';

describe('main menu "Có gì mới" (data/whatsnew.json)', () => {
  it('every note has a unique id, a title and at least one line', () => {
    expect(WHATS_NEW.length).toBeGreaterThan(0);
    expect(new Set(WHATS_NEW.map((e) => e.id)).size).toBe(WHATS_NEW.length);
    for (const e of WHATS_NEW) {
      expect(e.title.trim()).not.toBe('');
      expect(e.items.length).toBeGreaterThan(0);
      for (const it of e.items) expect(it.trim()).not.toBe('');
    }
  });

  it('unread count: all when never opened, the newer ones after an older visit, none once the newest was read', () => {
    expect(unseenCount(null)).toBe(WHATS_NEW.length);
    expect(unseenCount('an-id-that-was-removed')).toBe(WHATS_NEW.length);
    expect(unseenCount(WHATS_NEW[0].id)).toBe(0);
    if (WHATS_NEW.length > 2) expect(unseenCount(WHATS_NEW[2].id)).toBe(2);
  });
});
