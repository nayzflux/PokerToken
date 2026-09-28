import { describe, expect, test } from "bun:test";
import { act, createRoom, joinRoom, previewSettlement, setStartingTokens, settleHand, startHand, viewRoom } from "./domain";

function table() {
  const room = createRoom("ABCDEF", "Alice", "token-a");
  joinRoom(room, "Bob", "token-b");
  joinRoom(room, "Camille", "token-c");
  const [alice, bob, camille] = room.players;
  return { room, alice, bob, camille };
}

describe("gestion des Pockins", () => {
  test("conserve les soldes entre les manches", () => {
    const { room, alice, bob } = table();
    startHand(room);
    act(room, alice.id, "bet", 100);
    act(room, bob.id, "call");
    act(room, room.players[2].id, "fold");
    settleHand(room, { "pot-0": [bob.id] });
    expect(alice.balance).toBe(400);
    expect(bob.balance).toBe(600);
    startHand(room);
    expect(alice.balance).toBe(400);
    expect(bob.balance).toBe(600);
    expect(room.hand?.contributions[alice.id]).toBe(0);
  });

  test("crée un pot annexe et rembourse la part non suivie", () => {
    const { room, alice, bob, camille } = table();
    alice.balance = 500;
    bob.balance = 150;
    camille.balance = 50;
    startHand(room);
    act(room, alice.id, "bet", 300);
    act(room, bob.id, "call");
    act(room, camille.id, "call");
    const preview = previewSettlement(room);
    expect(preview.refund).toEqual({ playerId: alice.id, amount: 150 });
    expect(preview.pots.map((pot) => pot.amount)).toEqual([150, 200]);
    expect(preview.pots[0].eligiblePlayerIds).toEqual([alice.id, bob.id, camille.id]);
    expect(preview.pots[1].eligiblePlayerIds).toEqual([alice.id, bob.id]);
    settleHand(room, { "pot-0": [camille.id], "pot-1": [bob.id] });
    expect([alice.balance, bob.balance, camille.balance]).toEqual([350, 200, 150]);
    expect(room.players.reduce((sum, player) => sum + player.balance, 0)).toBe(700);
  });

  test("couche automatiquement un joueur qui n'a pas suivi", () => {
    const { room, alice, bob, camille } = table();
    startHand(room);
    act(room, alice.id, "bet", 100);
    act(room, bob.id, "call");
    act(room, camille.id, "bet", 200);
    const preview = previewSettlement(room);
    expect(preview.autoFoldPlayerIds).toEqual([alice.id, bob.id]);
    expect(preview.refund).toEqual({ playerId: camille.id, amount: 100 });
    expect(preview.pots[0].eligiblePlayerIds).toEqual([camille.id]);
    settleHand(room, {});
    expect(camille.balance).toBe(700);
  });

  test("partage un jeton restant selon l'ordre d'entrée", () => {
    const room = createRoom("ABCDEF", "Alice", "token-a");
    setStartingTokens(room, 10);
    joinRoom(room, "Bob", "token-b");
    joinRoom(room, "Camille", "token-c");
    const [alice, bob, camille] = room.players;
    startHand(room);
    act(room, alice.id, "bet", 1);
    act(room, bob.id, "call");
    act(room, camille.id, "call");
    settleHand(room, { "pot-0": [alice.id, bob.id] });
    expect([alice.balance, bob.balance, camille.balance]).toEqual([11, 10, 9]);
  });

  test("réserve les pseudos et bloque les entrées pendant une manche", () => {
    const { room } = table();
    expect(() => joinRoom(room, "ALICE", "other")).toThrow("pseudo");
    startHand(room);
    expect(() => joinRoom(room, "David", "token-d")).toThrow("entre deux manches");
    expect(viewRoom(room).players[0]).not.toHaveProperty("tokenHash");
  });

  test("refuse les mises impossibles", () => {
    const { room, alice, bob } = table();
    startHand(room);
    act(room, alice.id, "bet", 100);
    expect(() => act(room, bob.id, "bet", 50)).toThrow("dépassez");
    expect(() => act(room, bob.id, "bet", 501)).toThrow("couvert");
    act(room, bob.id, "fold");
    expect(() => act(room, bob.id, "call")).toThrow("couché");
  });
});
