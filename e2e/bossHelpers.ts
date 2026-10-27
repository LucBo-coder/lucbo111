import type { Page } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';

// Since v0.8 a boss can't be one-shot: HP stops at each phase threshold and every transition is invulnerable,
// and legendaries end WEAKENED (capture window) instead of dying. These helpers play that out in the page.

const ev = <T = unknown>(page: Page, fn: string) => page.evaluate(fn) as Promise<T>;

/** Hits world.boss down to `frac` of its HP, waiting out each phase transition. */
export async function beatBossTo(page: Page, frac: number, tries = 120): Promise<void> {
  for (let i = 0; i < tries; i++) {
    const r = await ev<{ hp: number; act: boolean; done: boolean }>(page, `(() => { const b = window.__adv.world.boss; if (!b || !b.alive) return { hp: 0, act: false, done: true };
      return { hp: b.hp / b.maxHp, act: b.boss.pm.canAct && !(b.boss.ray && b.boss.ray.air > 0.5), done: !!b.boss.weakened }; })()`);
    if (r.done || (r.hp <= frac + 1e-6 && r.act)) return;
    if (r.act) await ev(page, `(() => { const w = window.__adv.world, b = w.boss; w.applyDamage(b, Math.ceil(b.hp - b.maxHp * ${frac}) + (${frac} === 0 ? 1e9 : 0), w.allies[0] ?? null); })()`);
    await page.waitForTimeout(200);
  }
}

/** Throws balls at the weakened legendary until it is caught (chance forced high so the test is deterministic). */
export async function catchWeakenedLegend(page: Page): Promise<void> {
  await page.waitForFunction(() => !!(window as unknown as { __adv: { legendCap: unknown } }).__adv.legendCap, undefined, { timeout: 10_000 });
  for (let i = 0; i < 8; i++) {
    const open = await ev<boolean>(page, `(() => { const a = window.__adv; if (!a.legendCap) return false; if (a.captureFx) return true;
      a.legendCap.rule.minChance = 0.95; a.legendCap.rule.balls = undefined; a.state.addItems({ ultraball: 1 }); a.selectedBall = 'ultraball';
      const b = a.legendCap.unit; a.pointerWorld = { x: b.x, y: b.y, at: a.time.now }; a.throwBall(); return true; })()`);
    if (!open) return;
    await page.waitForFunction(() => !(window as unknown as { __adv: { captureFx: unknown } }).__adv.captureFx, undefined, { timeout: 15_000 });
  }
}

/**
 * V22 shrines: walking in no longer summons a legendary — E on the ritual spot does, after the ritual. This stands on
 * the spot with the ritual already done once (a rematch only needs E) and presses E; the boss appears after the cutscene.
 */
export async function summonShrine(page: Page, site: string): Promise<void> {
  await ev(page, `(() => { const a = window.__adv, sh = a.shrines, s = sh.spot('${site}'); a.world.teleport(s.P.x, s.P.y);
    const r = (a.state.adv.rites ??= []); if (!r.includes(sh.shrineOf('${site}'))) r.push(sh.shrineOf('${site}')); void sh.open('${site}'); })()`);
}

/** Presses E until no dialogue is open. */
export async function closeDialogues(page: Page): Promise<void> {
  for (let i = 0; i < 10 && (await ev<boolean>(page, `!!window.__phaser.scene.getScene('AdvUI').dialogueLayer`)); i++) { await page.keyboard.press('e'); await page.waitForTimeout(200); }
}

/**
 * Hidden shrines (LEGENDARY_SHRINES.md mục 8): where a shrine stands now — the plane (a tier-1 dimension or a map's
 * sanctum) and its anchor tile; travelTo(region, x, y) lands in its court. Read from the map data, never hard-coded.
 */
export function shrineHome(site: string): { region: string; x: number; y: number } {
  const dir = 'src/data/world/';
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(readFileSync(dir + f, 'utf8')) as { id?: string; void?: string; legendaries?: { id: string; x: number; y: number }[] };
    const l = d.void ? d.legendaries?.find((x) => x.id === site) : undefined;
    if (l && d.id) return { region: d.id, x: l.x, y: l.y };
  }
  throw new Error(`no shrine ${site}`);
}

/** The hidden entrance to a shrine's plane on its overworld map (`to-<site>`; the Temple's is `to-origin`). */
export function secretOf(site: string): { region: string; x: number; y: number; stand: [number, number]; to: string } {
  const dir = 'src/data/world/';
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const d = JSON.parse(readFileSync(dir + f, 'utf8')) as { id?: string; secrets?: { id: string; x: number; y: number; stand?: [number, number]; to: string }[] };
    const s = d.secrets?.find((x) => x.id === `to-${site}`);
    if (s && d.id) return { region: d.id, x: s.x, y: s.y, stand: s.stand ?? [s.x, s.y], to: s.to };
  }
  throw new Error(`no entrance to ${site}`);
}
