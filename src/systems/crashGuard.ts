// Keeps the game running when one frame throws, and keeps progress when the page is closed or reloaded.
//
// Phaser runs every frame from one requestAnimationFrame callback and only asks for the next frame *after*
// the callback returns: a single exception anywhere in a scene's update / render stopped the loop for good,
// the screen froze and the only way out was reloading the page (losing everything since the last autosave).
// Now a failing frame is reported (asynchronously, so window.onerror / test runners still see it) and the next
// frame runs. An error that repeats every frame opens a small panel that saves and reloads.

type Saver = () => void;

const savers = new Set<Saver>();
const recent: number[] = [];
/** errors in this window (ms) … */
const BURST_MS = 3000;
/** … that make the game look stuck */
const BURST_COUNT = 40;
let panel: HTMLElement | null = null;
let reported = 0;

/** Registers a function that writes the current progress (called on page hide and before a recovery reload). */
export function onEmergencySave(fn: Saver): () => void {
  savers.add(fn);
  return () => savers.delete(fn);
}

/** Runs every registered saver; one failing saver never stops the others. */
export function emergencySave(): void {
  for (const fn of savers) {
    try { fn(); } catch (e) { console.warn('[crashGuard] save failed', e); }
  }
}

/** Bookkeeping for a caught frame error; true when errors keep coming (the panel should show). */
export function noteFrameError(now: number): boolean {
  recent.push(now);
  while (recent.length && now - recent[0] > BURST_MS) recent.shift();
  return recent.length >= BURST_COUNT;
}

export function resetFrameErrors(): void {
  recent.length = 0;
}

function report(e: unknown): void {
  // the first few with full detail; after that the console would only fill up with the same frame error
  if (reported++ < 5) setTimeout(() => { throw e; }, 0);
}

function showPanel(): void {
  if (panel || typeof document === 'undefined') return;
  panel = document.createElement('div');
  panel.id = 'crash-panel';
  panel.style.cssText = 'position:fixed;inset:auto 0 24px 0;margin:auto;width:min(92vw,420px);z-index:9999;'
    + 'background:#1c2030;color:#f0f0f0;border:2px solid #e0a040;border-radius:10px;padding:14px 16px;'
    + 'font:16px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px #0008;text-align:center';
  panel.innerHTML = '<div style="margin-bottom:10px">Trò chơi gặp lỗi. Tiến trình đã được lưu.</div>';
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:0 6px;padding:8px 14px;font:inherit;border-radius:6px;border:0;cursor:pointer;background:#e0a040;color:#1c2030';
    b.onclick = fn;
    panel!.appendChild(b);
  };
  btn('Lưu và tải lại', () => { emergencySave(); location.reload(); });
  btn('Tiếp tục', () => { panel?.remove(); panel = null; resetFrameErrors(); });
  document.body.appendChild(panel);
}

/** Wraps the game's frame step so one exception never stops the loop. Call right after `new Phaser.Game`. */
export function installCrashGuard(game: {
  step: (time: number, delta: number) => void;
  headlessStep?: (time: number, delta: number) => void;
  loop?: { running: boolean; callback: (time: number, delta: number) => void };
}): void {
  const wrap = (step: (time: number, delta: number) => void) => (time: number, delta: number) => {
    try {
      step(time, delta);
    } catch (e) {
      report(e);
      if (noteFrameError(performance.now())) {
        emergencySave();
        showPanel();
      }
    }
  };
  game.step = wrap(game.step.bind(game));
  if (game.headlessStep) game.headlessStep = wrap(game.headlessStep.bind(game));
  // normally Phaser binds the step only once its textures are ready (after this call); if it already started, rewire it
  if (game.loop?.running) game.loop.callback = wrap(game.loop.callback);
  if (typeof window === 'undefined') return;
  // closing / reloading / switching away from the tab: save now (an autosave may be up to 20 s old)
  addEventListener('pagehide', emergencySave);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') emergencySave(); });
}
