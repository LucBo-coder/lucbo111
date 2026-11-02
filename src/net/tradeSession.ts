import { applyTrade, emptyOffer, itemBlock, MAX_STACKS, monBlock, offerSig, sanitizeItems, sanitizeMon, tradeCopy, type TradeOffer } from '../core/trade';
import type { OwnedPokemon } from '../core/progression';
import type { SaveData } from '../systems/saveSchema';
import type { PartyMsg } from './party';

// One trade between two members of a co-op room. Each side edits its own offer (a version number goes up on every
// change and clears both confirmations). "Đồng ý" confirms the pair (my version, their version). When both have
// confirmed the same pair, each side sends a commit for it and applies its half once the other's commit arrives —
// a side that changed its offer in the meantime never commits, so nobody gives without receiving.

export type TradeState = 'asking' | 'invited' | 'open' | 'committed' | 'done' | 'closed';
export interface TradeIo {
  send(m: PartyMsg, to: string): void;
  save(): SaveData;
  kindOf(id: string): string | undefined;
  /** both halves were applied to my save */
  applied(added: OwnedPokemon | null, gave: TradeOffer, got: TradeOffer): void;
  changed(): void;
}

export class TradeSession {
  state: TradeState;
  mine: TradeOffer = emptyOffer();
  theirs: TradeOffer = emptyOffer();
  myV = 0;
  theirV = 0;
  myReady = false;
  theirReady = false;
  note = '';
  private sentCommit = false;
  private gotCommit = false;

  constructor(readonly tid: string, readonly partner: string, inviting: boolean, private io: TradeIo) {
    this.state = inviting ? 'asking' : 'invited';
    if (inviting) io.send({ t: 'trReq', tid }, partner);
  }

  get busy(): boolean { return this.state !== 'done' && this.state !== 'closed'; }

  accept(): void {
    if (this.state !== 'invited') return;
    this.state = 'open';
    this.io.send({ t: 'trAcc', tid: this.tid }, this.partner);
    this.io.changed();
  }

  cancel(reason = 'Đã hủy trao đổi'): void {
    if (!this.busy || this.state === 'committed') return;
    this.state = 'closed'; this.note = reason;
    this.io.send({ t: 'trEnd', tid: this.tid }, this.partner);
    this.io.changed();
  }

  /** My new offer; returns why it is refused ('' = sent). */
  setOffer(o: TradeOffer): string {
    if (this.state !== 'open') return 'Chưa thể đổi đề nghị lúc này';
    const save = this.io.save();
    if (o.mon) { const why = monBlock(save, o.mon.uid); if (why) return why; }
    if (Object.keys(o.items).length > MAX_STACKS) return `Tối đa ${MAX_STACKS} loại vật phẩm`;
    for (const [id, q] of Object.entries(o.items)) { const why = itemBlock(save, id, q, this.io.kindOf(id)); if (why) return why; }
    this.mine = { mon: o.mon ? tradeCopy(o.mon) : null, items: { ...o.items } };
    this.myV++;
    this.myReady = this.theirReady = false;
    this.io.send({ t: 'trOffer', tid: this.tid, v: this.myV, mon: this.mine.mon, items: this.mine.items }, this.partner);
    this.io.changed();
    return '';
  }

  /** "Đồng ý": I accept exactly what both sides show now. */
  confirm(): string {
    if (this.state !== 'open') return '';
    if (!this.mine.mon && !Object.keys(this.mine.items).length && !this.theirs.mon && !Object.keys(this.theirs.items).length) return 'Hai bên chưa đặt gì lên bàn';
    this.myReady = true;
    this.io.send({ t: 'trReady', tid: this.tid, v: this.myV, tv: this.theirV, sig: `${offerSig(this.mine)}#${offerSig(this.theirs)}` }, this.partner);
    this.tryCommit();
    this.io.changed();
    return '';
  }

  receive(m: PartyMsg, from: string): void {
    if (from !== this.partner || m.tid !== this.tid) return;
    switch (m.t) {
      case 'trAcc': if (this.state === 'asking') { this.state = 'open'; this.io.changed(); } return;
      case 'trEnd':
        // (a side that committed never cancels, so their cancel means they will not commit: safe to close)
        if (this.busy) { this.state = 'closed'; this.note = 'Người kia đã hủy trao đổi'; this.io.changed(); }
        return;
      case 'trOffer': {
        if ((this.state !== 'open' && this.state !== 'committed') || typeof m.v !== 'number' || m.v <= this.theirV) return;
        // they changed their offer after my commit: they will not commit to the old pair, so neither do I
        if (this.state === 'committed') { this.state = 'open'; this.sentCommit = this.gotCommit = false; }
        const mon = m.mon ? sanitizeMon(m.mon) : null;
        this.theirs = { mon, items: sanitizeItems(m.items, this.io.kindOf) };
        this.theirV = m.v;
        this.myReady = this.theirReady = false;
        this.io.changed();
        return;
      }
      case 'trReady':
        if (this.state !== 'open') return;
        // their confirmation counts only for the pair I see now
        this.theirReady = m.v === this.theirV && m.tv === this.myV && m.sig === `${offerSig(this.theirs)}#${offerSig(this.mine)}`;
        this.tryCommit();
        this.io.changed();
        return;
      case 'trCommit':
        if (m.v !== this.theirV || m.tv !== this.myV) return;
        this.gotCommit = true;
        this.tryCommit();
        return;
    }
  }

  private tryCommit(): void {
    if ((this.state === 'open' && this.myReady && this.theirReady) && !this.sentCommit) {
      this.sentCommit = true;
      this.state = 'committed';
      this.io.send({ t: 'trCommit', tid: this.tid, v: this.myV, tv: this.theirV }, this.partner);
    }
    if (this.state !== 'committed' || !this.gotCommit) return;
    const added = applyTrade(this.io.save(), this.mine, this.theirs, this.io.kindOf);
    if (added === 'unavailable') {
      // cannot happen with an unchanged save; never give what is gone
      this.state = 'closed'; this.note = 'Vật phẩm / Pokémon của bạn không còn — trao đổi bị hủy';
      this.io.changed();
      return;
    }
    this.state = 'done';
    this.note = 'Trao đổi thành công!';
    this.io.applied(added, this.mine, this.theirs);
    this.io.changed();
  }
}
