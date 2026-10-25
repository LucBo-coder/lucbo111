export type CoopObjective = 'hunt' | 'elite' | 'boss' | 'together' | 'survive' | 'heal';
export interface CoopEventDef {
  id: CoopObjective; name: string; hint: string; goal: number; duration: number; currency: number;
}
export const COOP_EVENTS: readonly CoopEventDef[] = [
  { id: 'hunt', name: 'Dọn đường cùng bạn', hint: 'Hạ 15 Pokémon địch', goal: 15, duration: 150, currency: 250 },
  { id: 'together', name: 'Kề vai sát cánh', hint: 'Cả hai còn khỏe và đứng cách nhau dưới 220 px trong 45 giây', goal: 45, duration: 120, currency: 200 },
  { id: 'elite', name: 'Thợ săn tinh nhuệ', hint: 'Hạ 2 quái tinh nhuệ hoặc boss', goal: 2, duration: 210, currency: 400 },
  { id: 'survive', name: 'Không bỏ lại ai', hint: 'Cả hai sống sót liên tục 60 giây', goal: 60, duration: 150, currency: 300 },
  { id: 'heal', name: 'Tiếp sức đồng đội', hint: 'Hồi tổng cộng 150 HP trong trận', goal: 150, duration: 180, currency: 350 },
  { id: 'boss', name: 'Song hành diệt boss', hint: 'Cùng hạ một boss', goal: 1, duration: 240, currency: 600 },
];
export interface CoopEventView {
  id: CoopObjective; name: string; hint: string; goal: number; progress: number; left: number;
  status: 'active' | 'completed' | 'expired'; currency: number;
  /** currency word of the host's mode (ngọc / xu / đồng) */
  unit?: string;
}
export interface CoopEventSample { dt: number; kills: number; elites: number; bosses: number; healing: number; bothAlive: boolean; distance: number }

/** Host simulation time only: pauses, disconnects and browser frame time cannot advance objectives. */
export class CoopEventDirector {
  view: CoopEventView | null = null;
  /** currency word shown in the reward line (the host's mode) */
  unit = 'xu';
  private index = 0;
  private wait = 0;
  update(s: CoopEventSample): CoopEventDef | null {
    const dt = Math.max(0, Math.min(0.25, s.dt));
    if (!this.view || this.view.status !== 'active') {
      this.wait -= dt;
      if (this.wait > 0) return null;
      const def = COOP_EVENTS[this.index++ % COOP_EVENTS.length];
      this.view = { ...def, progress: 0, left: def.duration, status: 'active', unit: this.unit };
    }
    const v = this.view;
    v.left = Math.max(0, v.left - dt);
    switch (v.id) {
      case 'hunt': v.progress += s.kills; break;
      case 'elite': v.progress += s.elites; break;
      case 'boss': v.progress += s.bosses; break;
      case 'heal': v.progress += s.healing; break;
      case 'together': if (s.bothAlive && s.distance <= 220) v.progress += dt; break;
      case 'survive': v.progress = s.bothAlive ? v.progress + dt : 0; break;
    }
    v.progress = Math.min(v.goal, Math.max(0, v.progress));
    if (v.progress >= v.goal) {
      v.status = 'completed'; this.wait = 20;
      return COOP_EVENTS.find((d) => d.id === v.id)!;
    }
    if (v.left <= 0) { v.status = 'expired'; this.wait = 20; }
    return null;
  }
}

export function coopEventLabel(v: CoopEventView | null | undefined): string {
  if (!v) return 'Thử thách bắt đầu khi đồng đội vào phòng.';
  if (v.status === 'completed') return `${v.name}: hoàn thành! +${v.currency} ${v.unit ?? 'xu'}/người`;
  if (v.status === 'expired') return `${v.name}: hết giờ · chờ thử thách tiếp theo`;
  return `${v.name} · ${Math.floor(v.progress)}/${v.goal} · ${Math.ceil(v.left)}s\n${v.hint} · thưởng ${v.currency} ${v.unit ?? 'xu'}/người`;
}
