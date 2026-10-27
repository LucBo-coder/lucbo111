import RAW from '../data/whatsnew.json';

/** One release note shown in the main menu's "What's new" panel (newest first in whatsnew.json). */
export interface WhatsNewEntry { id: string; title: string; items: string[] }

export const WHATS_NEW: readonly WhatsNewEntry[] = RAW as WhatsNewEntry[];

const SEEN_KEY = 'survivor.whatsnew.seen';

/** How many entries are newer than the last one the player opened (all of them when never opened). */
export function unseenCount(seenId: string | null, list: readonly WhatsNewEntry[] = WHATS_NEW): number {
  const i = seenId ? list.findIndex((e) => e.id === seenId) : -1;
  return i < 0 ? list.length : i;
}

/** Device-wide (not per save slot); storage can be disabled, then the badge simply always shows. */
export function seenWhatsNew(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}

export function markWhatsNewSeen(): void {
  try { if (WHATS_NEW[0]) localStorage.setItem(SEEN_KEY, WHATS_NEW[0].id); } catch { /* storage disabled */ }
}
