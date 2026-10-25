import type { SaveData } from '../systems/saveSchema';

// Wire protocol of the authoritative Adventure server (Node + WebSocket + SQLite).
// The client only *requests* actions; the server validates ownership/cooldowns/inventory, mutates the
// canonical save inside a transaction and sends back the authoritative state. Presence is server-driven.

export const SERVER_PROTOCOL = 2;

export interface ServerAccount {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  role: 'player' | 'moderator' | 'admin';
  banned: boolean;
}

export interface ServerPlayerView {
  accountId: string;
  username: string;
  displayName: string;
  avatar: string;
  region: string;
  x: number;
  y: number;
  facing: number;
  activeUid: string | null;
  species: string | null;
  shiny: boolean;
  level: number;
  moving: boolean;
  updatedAt: number;
  /** Pokémon state machine as seen by others: summon/recall play an animation before ACTIVE/none */
  petState?: PetState;
  /** last emote, shown as a bubble for a few seconds */
  emote?: { kind: EmoteKind; at: number } | null;
  partyId?: string | null;
}

export type PetState = 'none' | 'summoning' | 'active' | 'recalling';
export const EMOTES = ['wave', 'cheer', 'sit', 'point'] as const;
export type EmoteKind = typeof EMOTES[number];

export interface ServerAlphaView {
  id: string;
  region: string;
  species: string;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  status: 'active' | 'defeated';
  spawnedAt: number;
  /** top contributors only (bounded payload) */
  participants: { accountId: string; displayName: string; damage: number }[];
  participantCount?: number;
}

export interface ServerEventView {
  objective?: string;
  id: string;
  type: string;
  name: string;
  region: string;
  startsAt: number;
  endsAt: number;
  goal: number;
  progress: number;
  status: 'active' | 'completed' | 'expired';
  legendary: boolean;
  minLevel: number;
  difficulty?: string;
  recommendedLevel?: number;
  rewards?: string;
  /** your own contribution (sent per player) */
  myContribution?: number;
  participants?: number;
}

/** WORLD EVENT INCOMING — announced before the event starts; nobody is teleported. */
export interface ServerEventIncoming {
  region: string;
  type: string;
  name: string;
  startsAt: number;
  difficulty: string;
  recommendedLevel: number;
  rewards: string;
  objective: string;
  legendary: boolean;
}

export interface ServerChatMessage {
  id: number;
  channel: string;
  from: string;
  fromName: string;
  body: string;
  at: number;
  moderated: boolean;
}

export interface ServerFriend {
  accountId: string;
  username: string;
  displayName: string;
  online: boolean;
  status: 'pending' | 'accepted' | 'blocked';
  incoming: boolean;
}

export interface ServerPartyView {
  id: string;
  leaderId: string;
  members: {
    accountId: string; username: string; displayName: string; online: boolean; level: number;
    species?: string | null; hpFrac?: number; region?: string | null; distance?: number | null;
  }[];
}

export interface AlphaReward {
  accountId: string;
  money: number;
  items: Record<string, number>;
  expCandy: string;
  contribution: number;
  /** EXP given to the active Pokémon (server-computed, includes the capped party bonus) */
  exp?: number;
  levels?: number;
  partyBonus?: number;
}

/** Actions that mutate the canonical save; every one is transactional + idempotent. */
export type ActionType =
  | 'party.setActive'
  | 'party.recall'
  | 'party.deposit'
  | 'party.withdraw'
  | 'party.switch'
  | 'pc.move'
  | 'pc.favorite'
  | 'pc.rename'
  | 'pc.boxName'
  | 'pc.sort'
  | 'candy.use'
  | 'pokemon.evolve'
  | 'pokemon.declineEvolution'
  | 'player.import';

export interface ClientAction {
  t: 'action';
  actionId: string;
  type: ActionType;
  data?: Record<string, unknown>;
}

export type ClientMsg =
  | { t: 'login'; username: string; password: string }
  | { t: 'register'; username: string; password: string; displayName?: string; starter?: string }
  | { t: 'resume'; token: string }
  | { t: 'recover'; username: string; code: string; newPassword: string }
  | { t: 'account'; actionId: string; op: 'changePassword' | 'recoveryCode' | 'logoutAll'; password?: string; newPassword?: string }
  | { t: 'travel'; portal: string }
  | { t: 'logout' }
  | { t: 'enter'; region: string }
  | { t: 'move'; x: number; y: number; facing?: number; moving?: boolean }
  | ClientAction
  | { t: 'resync' }
  | { t: 'chat'; actionId: string; channel: string; body: string }
  | { t: 'friend'; actionId: string; op: 'request' | 'accept' | 'remove' | 'block' | 'unblock' | 'report'; target: string; reason?: string }
  | { t: 'party'; actionId: string; op: 'create' | 'invite' | 'accept' | 'decline' | 'leave' | 'kick' | 'promote' | 'disband' | 'info'; target?: string }
  | { t: 'whisper'; actionId: string; target: string; body: string }
  | { t: 'emote'; kind: EmoteKind }
  | { t: 'alpha.attack'; actionId: string }
  | { t: 'ping'; at?: number };

export type ServerMsg =
  | { t: 'saveSync'; save: SaveData }
  | { t: 'position'; region: string; x: number; y: number }
  | { t: 'welcome'; token: string; account: ServerAccount; save: SaveData; protocol: number; serverTime: number; recoveryCode?: string }
  | { t: 'recoveryCode'; code: string }
  /** region change through a portal: the client reloads the map at (x, y) */
  | { t: 'region'; region: string; x: number; y: number; save: SaveData }
  | { t: 'error'; code: string; message: string; actionId?: string }
  /** full = complete visible set; otherwise a delta: changed players + ids that left the view */
  | { t: 'presence'; region: string; players: ServerPlayerView[]; full?: boolean; gone?: string[] }
  | { t: 'actionResult'; actionId: string; ok: true; save: SaveData; result?: Record<string, unknown> }
  | { t: 'actionError'; actionId: string; ok: false; code: string; message: string }
  | { t: 'chat'; message: ServerChatMessage }
  | { t: 'chatHistory'; channel: string; messages: ServerChatMessage[] }
  | { t: 'friends'; friends: ServerFriend[]; requests: ServerFriend[] }
  | { t: 'party'; party: ServerPartyView | null; invite?: { partyId: string; fromName: string } | null }
  | { t: 'alpha'; alpha: ServerAlphaView | null }
  | { t: 'alphaHit'; alpha: ServerAlphaView; damage: number; contribution: number }
  | { t: 'alphaDefeated'; alpha: ServerAlphaView; rewards: AlphaReward[]; save?: SaveData }
  | { t: 'event'; event: ServerEventView | null; message?: string }
  | { t: 'eventIncoming'; incoming: ServerEventIncoming | null }
  | { t: 'whisper'; from: string; fromName: string; to: string; toName: string; body: string; at: number }
  | { t: 'petFx'; accountId: string; kind: 'summon' | 'recall'; species: string | null; x: number; y: number }
  | { t: 'emote'; accountId: string; kind: EmoteKind; at: number }
  | { t: 'notice'; message: string; level?: 'info' | 'warn' }
  | { t: 'pong'; at?: number; serverTime: number };
