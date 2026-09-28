export type Phase = "lobby" | "betting" | "intermission";

export type PlayerView = {
  id: string;
  nickname: string;
  balance: number;
  contribution: number;
  participating: boolean;
  folded: boolean;
  allIn: boolean;
  admin: boolean;
};

export type PotView = {
  id: string;
  amount: number;
  eligiblePlayerIds: string[];
};

export type RoomView = {
  code: string;
  version: number;
  phase: Phase;
  startingTokens: number;
  handNumber: number;
  potTotal: number;
  currentBet: number;
  players: PlayerView[];
  pots: PotView[];
  autoFoldPlayerIds: string[];
  refund: { playerId: string; amount: number } | null;
  lastResult: { handNumber: number; payouts: Record<string, number> } | null;
};

export type RoomResponse = { room: RoomView; selfId: string };

export type ApiError = { error: string; room?: RoomView };
