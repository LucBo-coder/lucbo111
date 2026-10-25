import Phaser from 'phaser';
import type { AdventureScene } from './AdventureScene';
import type { GameScene } from './GameScene';
import { coopSession } from '../net/coop';
import { net } from '../net/session';
import { monFromOwned } from '../net/duel';
import { saveStore } from '../systems/save';
import { gameModes } from '../systems/gameMode';
import { askText, button, panel, text } from './ui';
import type { DuelMon } from '../net/protocol';

/** Shared entry point in the pause/settings menu of every PvE campaign. */
export function openCoopMenu(ui: Phaser.Scene, game: AdventureScene | GameScene): void {
  const adventure = 'state' in game;
  const { width: W, height: H } = ui.scale;
  const width = Math.min(600, W - 24), height = Math.min(440, H - 24);
  const layer = ui.add.container(0, 0).setDepth(30000);
  const keyboards = [ui.input.keyboard, game.input.keyboard].filter(k => k != null);
  const enabled = keyboards.map(k => k.enabled);
  keyboards.forEach(k => { k.enabled = false; });
  layer.once('destroy', () => keyboards.forEach((k, i) => { k.enabled = enabled[i]; }));
  layer.add(ui.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0).setInteractive());
  layer.add(panel(ui, (W - width) / 2, (H - height) / 2, width, height));
  const top = (H - height) / 2;
  const label = text(ui, W / 2, top + 20, 'CO-OP · 2 NGƯỜI', 28, '#ffe080').setOrigin(0.5, 0);
  layer.add(label);
  const note = text(ui, W / 2 - width / 2 + 20, top + 65,
    'Cùng đánh quái và boss. Khách mang tối đa 3 Pokémon; ô lưu riêng được giữ nguyên.\nNhiệm vụ, bắt Pokémon và phần thưởng thuộc chủ phòng.\nĐứng gần đồng đội bị gục 3 giây để cứu. Đi quá xa sẽ được đưa về cạnh chủ phòng.', 16, '#c8d4f0').setWordWrapWidth(width - 40);
  layer.add(note);
  let busy = false;
  const close = () => { if (!busy) layer.destroy(); };
  layer.add(button(ui, W / 2, top + height - 34, width - 40, 40, 'Đóng', close).container);
  if (coopSession.active || net.connected || net.status === 'hosting') {
    note.setText(`Phòng ${net.code || '—'} · ${net.peerName || 'Đang chờ bạn tham gia'}\nChủ phòng tiếp tục chơi sau khi đóng bảng này.\nNhiệm vụ và phần thưởng được lưu cho chủ phòng.`);
    layer.add(button(ui, W / 2, top + height - 88, width - 40, 40, 'Rời / hủy phòng', () => {
      coopSession.active = false; net.leave(); game.coopHost?.destroy(); game.coopHost = null; layer.destroy();
    }, 0x6a2f2f).container);
    return;
  }
  const connect = async (host: boolean) => {
    if (busy) return;
    busy = true;
    try {
      net.myName = saveStore.data.playerName ?? net.myName;
      if (host) {
        const code = await net.host();
        coopSession.active = true;
        game.startCoopHost();
        note.setText(`Mã phòng: ${code}\nGửi mã này cho bạn của bạn.\nĐóng bảng và tiếp tục chơi để chờ đồng đội.\nNhiệm vụ, bắt Pokémon và phần thưởng được lưu cho chủ phòng.`);
        controls.forEach(b => b.setVisible(false));
      } else {
        const code = await askText(ui, 'Mã phòng co-op (tham gia sẽ rời lượt chơi hiện tại)', '', 6);
        if (!code) return;
        const party: DuelMon[] = adventure ? game.state.party().slice(0, 3).map(monFromOwned)
          : game.world.allies.slice(0, 3).map(u => ({ species: u.megaFrom ?? u.defId, level: Math.min(100, u.level), held: u.heldId, shiny: u.shiny }));
        if (!party.length) { note.setText('Cần ít nhất 1 Pokémon trong đội để tham gia.'); return; }
        if (adventure) game.persist();
        await net.join(code);
        coopSession.active = true;
        gameModes.start(ui, 'online', { entry: 'CoopGuest', party, returnTo: adventure ? 'adventure' : 'menu' });
      }
    } catch (e) { note.setText(e instanceof Error ? e.message : String(e)); }
    finally { busy = false; }
  };
  const controls = [
    button(ui, W / 2, top + height - 190, width - 40, 40, 'Tạo phòng co-op trên bản đồ này', () => void connect(true), 0x2f6a3a).container,
    button(ui, W / 2, top + height - 138, width - 40, 40, 'Tham gia co-op bằng mã', () => void connect(false), 0x2f5a8a).container,
  ];
  controls.forEach(c => layer.add(c));
}
