import type { Page } from '@playwright/test';

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
