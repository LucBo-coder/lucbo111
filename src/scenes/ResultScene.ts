import Phaser from 'phaser';
import { saveStore } from '../systems/save';
import { fitScale } from '../render/spriteRegistry';
import { gameModes } from '../systems/gameMode';
import { POKEMON } from '../core/data';
import { button, COLORS, fmtTime, panel, text, uiScale } from './ui';

interface ResultData {
  victory: boolean;
  time: number;
  kills: number;
  level: number;
  bosses: number;
  starter: string;
  newRecord: boolean;
  unlocked?: string[];
  party: { name: string; sprite: string; level: number; damage: number }[];
}

export class ResultScene extends Phaser.Scene {
  private data_!: ResultData;

  constructor() {
    super('Result');
  }

  init(data: ResultData): void {
    this.data_ = data;
  }

  create(): void {
    this.build();
    this.scale.on('resize', this.rebuild, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.rebuild, this));
    this.input.keyboard?.on('keydown-ENTER', () => gameModes.start(this, 'survivor', { starter: this.data_.starter }));
  }

  private rebuild(): void {
    this.children.removeAll(true);
    this.build();
  }

  private build(): void {
    const d = this.data_;
    const { width: W, height: H } = this.scale;
    const s = uiScale(W, H, (w, h) => Math.min(w / 900, h / 640, 1.5));
    this.cameras.main.setBackgroundColor(COLORS.bg);
    text(this, W / 2, 60 * s, d.victory ? 'CHIẾN THẮNG!' : 'THẤT BẠI', 64 * s, d.victory ? '#ffd640' : '#ff6060').setOrigin(0.5);
    text(this, W / 2, 108 * s, d.victory ? 'Bạn đã hạ Boss cuối cùng!' : 'Huấn luyện viên đã gục ngã...', 22 * s, COLORS.dim).setOrigin(0.5);

    const pw = Math.min(W - 32, 520 * s), ph = 160 * s + d.party.length * 44 * s;
    const px = (W - pw) / 2, py = 140 * s;
    panel(this, px, py, pw, ph);
    const lines: [string, string][] = [
      ['Thời gian sống sót', fmtTime(d.time) + (d.newRecord ? '  ★ KỶ LỤC MỚI' : '')],
      ['Cấp đạt được', `${d.level}`],
      ['Kẻ địch bị hạ', `${d.kills}`],
      ['Boss bị hạ', `${d.bosses}`],
    ];
    lines.forEach(([k, v], i) => {
      text(this, px + 24 * s, py + 20 * s + i * 30 * s, k, 22 * s, COLORS.dim);
      text(this, px + pw - 24 * s, py + 20 * s + i * 30 * s, v, 22 * s, '#ffffff').setOrigin(1, 0);
    });
    const maxDmg = Math.max(1, ...d.party.map((p) => p.damage));
    const g = this.add.graphics();
    d.party.forEach((p, i) => {
      const y = py + 150 * s + i * 44 * s;
      this.add.image(px + 40 * s, y + 14 * s, p.sprite).setScale(fitScale(this, p.sprite, 40 * s));
      text(this, px + 70 * s, y, `${p.name} Lv${p.level}`, 20 * s);
      const bw = pw - 200 * s;
      g.fillStyle(0x000000, 0.6).fillRect(px + 70 * s, y + 22 * s, bw, 8 * s);
      g.fillStyle(0xffa040, 1).fillRect(px + 70 * s, y + 22 * s, bw * (p.damage / maxDmg), 8 * s);
      text(this, px + pw - 24 * s, y + 10 * s, `${p.damage}`, 20 * s, '#ffd090').setOrigin(1, 0);
    });

    const st = saveStore.data.stats;
    text(this, W / 2, py + ph + 24 * s, `Tổng: ${st.runs} trận · ${st.victories} thắng · kỷ lục ${fmtTime(st.bestTime)} · ${saveStore.data.currency} xu`, 18 * s, COLORS.dim)
      .setOrigin(0.5).setWordWrapWidth(W - 32).setAlign('center');
    const by = Math.min(H - 50 * s, py + ph + 100 * s);
    if (d.unlocked?.length) {
      text(this, W / 2, py + ph + 50 * s, `Mang về Bộ sưu tập: ${d.unlocked.map((u) => POKEMON.get(u)?.name ?? u).join(', ')} (Lv5)`, 18 * s, '#ffe080').setOrigin(0.5).setWordWrapWidth(W - 32).setAlign('center');
    }
    button(this, W / 2 - 150 * s, by, 260 * s, 56 * s, '↻ Chơi lại', () => gameModes.start(this, 'survivor', { starter: d.starter }), 0x2f6a3a);
    button(this, W / 2 + 150 * s, by, 260 * s, 56 * s, '⌂ Menu', () => gameModes.toMenu(this));
  }
}
