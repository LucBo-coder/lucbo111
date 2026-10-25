import { net } from './session';

/**
 * `?netstats` in the address: a small corner panel with the connection numbers (refreshed every second).
 *  - ping: player ↔ player round trip (p50 / p95 / jitter), share of pings left unanswered (loss estimate)
 *  - relay: me ↔ Cloudflare room only — the network part of the ping
 *  - co-op guest: input → acknowledged snapshot (what the player feels), host hold time, gap between snapshots
 */
export function startNetOverlay(): void {
  const el = document.createElement('pre');
  el.dataset.netstats = '';
  el.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:9999;margin:0;padding:6px 8px;font:11px/1.35 monospace;color:#cfe;background:rgba(0,0,0,.72);border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(el);
  const f = (s: { p50: number; p95: number; jitter: number; n: number } | null | undefined) => s && s.n ? `p50 ${s.p50} · p95 ${s.p95} · jitter ${s.jitter} ms (n=${s.n})` : '—';
  setInterval(() => {
    if (!net.connected) { el.textContent = `net: ${net.status}`; return; }
    const st = net.stats();
    const lines = [`${st.kind} · ping ${f(st.rtt)} · mất ${st.lossPct}%`];
    if (st.relay) lines.push(`relay ↔ máy chủ: ${f(st.relay)}`);
    const g = (window as unknown as { __coopGuest?: { ended: boolean; sys: { isActive(): boolean }; netStats(): Record<string, ReturnType<typeof net.stats>['rtt']> } }).__coopGuest;
    if (g && !g.ended && g.sys.isActive()) {
      const s = g.netStats();
      lines.push(`input → host: ${f(s.inputToAck)}`, `host giữ input: ${f(s.hostHold)}`, `giữa 2 snapshot: ${f(s.snapshotGap)}`);
    }
    el.textContent = lines.join('\n');
  }, 1000);
}
