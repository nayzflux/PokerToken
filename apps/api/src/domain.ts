import type { Phase, PotView, RoomView } from "@pockettoken/shared";

export type Player = {
  id: string;
  nickname: string;
  tokenHash: string;
  balance: number;
  admin: boolean;
};

export type Hand = {
  participants: string[];
  contributions: Record<string, number>;
  folded: string[];
};

export type Room = {
  code: string;
  version: number;
  phase: Phase;
  startingTokens: number;
  handNumber: number;
  players: Player[];
  hand: Hand | null;
  lastResult: { handNumber: number; payouts: Record<string, number> } | null;
};

export class RuleError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function createRoom(code: string, nickname: string, tokenHash: string): Room {
  return {
    code,
    version: 1,
    phase: "lobby",
    startingTokens: 500,
    handNumber: 0,
    players: [{ id: crypto.randomUUID(), nickname, tokenHash, balance: 500, admin: true }],
    hand: null,
    lastResult: null,
  };
}

export function playerForToken(room: Room, tokenHash: string | undefined): Player | undefined {
  return tokenHash ? room.players.find((player) => player.tokenHash === tokenHash) : undefined;
}

export function joinRoom(room: Room, nickname: string, tokenHash: string): void {
  if (room.phase === "betting") throw new RuleError("Rejoignez la room entre deux manches.", 409);
  if (room.players.length >= 10) throw new RuleError("La room est complète.", 409);
  if (room.players.some((player) => player.nickname.toLocaleLowerCase("fr") === nickname.toLocaleLowerCase("fr"))) {
    throw new RuleError("Ce pseudo est déjà utilisé.", 409);
  }
  room.players.push({ id: crypto.randomUUID(), nickname, tokenHash, balance: room.startingTokens, admin: false });
}

export function setStartingTokens(room: Room, amount: number): void {
  if (room.phase !== "lobby") throw new RuleError("Le solde initial est verrouillé après la première manche.", 409);
  room.startingTokens = amount;
  for (const player of room.players) player.balance = amount;
}

export function startHand(room: Room): void {
  if (room.phase === "betting") throw new RuleError("Une manche est déjà en cours.", 409);
  const participants = room.players.filter((player) => player.balance > 0).map((player) => player.id);
  if (participants.length < 2) throw new RuleError("Il faut au moins deux joueurs avec des Pockins.", 409);
  room.handNumber += 1;
  room.phase = "betting";
  room.hand = { participants, contributions: Object.fromEntries(participants.map((id) => [id, 0])), folded: [] };
  room.lastResult = null;
}

function activePlayers(room: Room): Player[] {
  const hand = room.hand;
  if (!hand) return [];
  return room.players.filter((player) => hand.participants.includes(player.id) && !hand.folded.includes(player.id));
}

export function currentBet(room: Room): number {
  const hand = room.hand;
  if (!hand) return 0;
  return Math.max(0, ...activePlayers(room).map((player) => hand.contributions[player.id] ?? 0));
}

export function act(room: Room, playerId: string, action: "bet" | "call" | "fold", amount?: number): void {
  const hand = room.hand;
  if (room.phase !== "betting" || !hand) throw new RuleError("Aucune manche n’est en cours.", 409);
  if (!hand.participants.includes(playerId)) throw new RuleError("Vous ne participez pas à cette manche.", 403);
  if (hand.folded.includes(playerId)) throw new RuleError("Vous êtes couché pour cette manche.", 409);
  const player = room.players.find((item) => item.id === playerId)!;
  if (action === "fold") {
    if (activePlayers(room).length === 1) throw new RuleError("Le dernier joueur actif ne peut pas se coucher.", 409);
    hand.folded.push(playerId);
    return;
  }
  if (player.balance === 0) throw new RuleError("Vous avez déjà fait tapis.", 409);
  const committed = hand.contributions[playerId] ?? 0;
  const highest = currentBet(room);
  if (action === "call") {
    const needed = highest - committed;
    if (needed <= 0) throw new RuleError("Aucune mise à suivre.", 409);
    const paid = Math.min(needed, player.balance);
    player.balance -= paid;
    hand.contributions[playerId] = committed + paid;
    return;
  }
  if (!Number.isSafeInteger(amount) || amount! <= 0 || amount! > player.balance) {
    throw new RuleError("La mise doit être un entier positif couvert par votre solde.");
  }
  if (committed + amount! <= highest) throw new RuleError("Pour relancer, dépassez la plus haute mise.", 409);
  player.balance -= amount!;
  hand.contributions[playerId] = committed + amount!;
}

export type Settlement = {
  contributions: Record<string, number>;
  folded: string[];
  autoFoldPlayerIds: string[];
  refund: { playerId: string; amount: number } | null;
  pots: PotView[];
};

export function previewSettlement(room: Room): Settlement {
  const hand = room.hand;
  if (!hand) return { contributions: {}, folded: [], autoFoldPlayerIds: [], refund: null, pots: [] };
  const contributions = { ...hand.contributions };
  const folded = [...hand.folded];
  const high = currentBet(room);
  const autoFoldPlayerIds = activePlayers(room)
    .filter((player) => (contributions[player.id] ?? 0) < high && player.balance > 0)
    .map((player) => player.id);
  folded.push(...autoFoldPlayerIds);

  const ranked = hand.participants.map((id) => ({ id, amount: contributions[id] ?? 0 })).sort((a, b) => b.amount - a.amount);
  let refund: Settlement["refund"] = null;
  if (ranked.length >= 2 && ranked[0].amount > ranked[1].amount) {
    const amount = ranked[0].amount - ranked[1].amount;
    contributions[ranked[0].id] -= amount;
    refund = { playerId: ranked[0].id, amount };
  }

  const levels = [...new Set(Object.values(contributions).filter((value) => value > 0))].sort((a, b) => a - b);
  const active = hand.participants.filter((id) => !folded.includes(id));
  const pots: PotView[] = [];
  let previous = 0;
  for (const level of levels) {
    const contributors = hand.participants.filter((id) => (contributions[id] ?? 0) >= level);
    const amount = (level - previous) * contributors.length;
    let eligiblePlayerIds = contributors.filter((id) => active.includes(id));
    if (eligiblePlayerIds.length === 0 && active.length > 0) {
      const best = Math.max(...active.map((id) => contributions[id] ?? 0));
      eligiblePlayerIds = active.filter((id) => (contributions[id] ?? 0) === best);
    }
    pots.push({ id: `pot-${pots.length}`, amount, eligiblePlayerIds });
    previous = level;
  }
  return { contributions, folded, autoFoldPlayerIds, refund, pots };
}

export function settleHand(room: Room, winnersByPot: Record<string, string[]>): void {
  if (room.phase !== "betting" || !room.hand) throw new RuleError("Aucune manche à clôturer.", 409);
  const settlement = previewSettlement(room);
  const payouts: Record<string, number> = {};
  for (const pot of settlement.pots) {
    const winners = pot.eligiblePlayerIds.length === 1
      ? pot.eligiblePlayerIds
      : winnersByPot[pot.id] ?? [];
    if (!winners.length || new Set(winners).size !== winners.length || winners.some((id) => !pot.eligiblePlayerIds.includes(id))) {
      throw new RuleError(`Sélectionnez les gagnants valides pour ${pot.id}.`);
    }
    const ordered = room.players.filter((player) => winners.includes(player.id));
    const share = Math.floor(pot.amount / ordered.length);
    let remainder = pot.amount % ordered.length;
    for (const player of ordered) {
      payouts[player.id] = (payouts[player.id] ?? 0) + share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
    }
  }
  if (settlement.refund) {
    const player = room.players.find((item) => item.id === settlement.refund!.playerId)!;
    player.balance += settlement.refund.amount;
  }
  for (const player of room.players) player.balance += payouts[player.id] ?? 0;
  room.lastResult = { handNumber: room.handNumber, payouts };
  room.hand = null;
  room.phase = "intermission";
}

export function viewRoom(room: Room): RoomView {
  const hand = room.hand;
  const settlement = previewSettlement(room);
  const players = room.players.map((player) => ({
    id: player.id,
    nickname: player.nickname,
    balance: player.balance,
    contribution: hand?.contributions[player.id] ?? 0,
    participating: hand?.participants.includes(player.id) ?? false,
    folded: hand?.folded.includes(player.id) ?? false,
    allIn: !!hand?.participants.includes(player.id) && player.balance === 0,
    admin: player.admin,
  }));
  return {
    code: room.code,
    version: room.version,
    phase: room.phase,
    startingTokens: room.startingTokens,
    handNumber: room.handNumber,
    potTotal: players.reduce((sum, player) => sum + player.contribution, 0),
    currentBet: currentBet(room),
    players,
    pots: settlement.pots,
    autoFoldPlayerIds: settlement.autoFoldPlayerIds,
    refund: settlement.refund,
    lastResult: room.lastResult,
  };
}
