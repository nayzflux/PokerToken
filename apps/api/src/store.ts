import Redis from "ioredis";
import { RuleError, type Room, viewRoom } from "./domain";

export const ROOM_TTL_SECONDS = 2 * 60 * 60;
export const EVENTS_CHANNEL = "pockettoken:events";
export const redis = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", { maxRetriesPerRequest: 1 });
export const subscriber = redis.duplicate();

const keyFor = (code: string) => `pockettoken:room:${code}`;

export async function loadRoom(code: string): Promise<Room | null> {
  const raw = await redis.get(keyFor(code));
  return raw ? JSON.parse(raw) as Room : null;
}

export async function insertRoom(room: Room): Promise<boolean> {
  return (await redis.set(keyFor(room.code), JSON.stringify(room), "EX", ROOM_TTL_SECONDS, "NX")) === "OK";
}

const UPDATE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
redis.call('PUBLISH', ARGV[4], ARGV[5])
return 1
`;

const CLOSE_SCRIPT = `
if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
redis.call('DEL', KEYS[1])
redis.call('PUBLISH', ARGV[2], ARGV[3])
return 1
`;

export async function updateRoom(code: string, expectedVersion: number | undefined, mutate: (room: Room) => void): Promise<Room> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const key = keyFor(code);
    const oldRaw = await redis.get(key);
    if (!oldRaw) throw new RuleError("Room introuvable ou expirée.", 404);
    const room = JSON.parse(oldRaw) as Room;
    if (expectedVersion !== undefined && room.version !== expectedVersion) throw new RuleError("La room a changé. Réessayez avec l’état récent.", 409);
    mutate(room);
    room.version++;
    const event = JSON.stringify({ type: "snapshot", room: viewRoom(room) });
    const result = await redis.eval(UPDATE_SCRIPT, 1, key, oldRaw, JSON.stringify(room), ROOM_TTL_SECONDS, EVENTS_CHANNEL, event);
    if (result === 1) return room;
  }
  throw new RuleError("La room est occupée. Réessayez.", 409);
}

export async function closeRoom(code: string, expectedVersion: number): Promise<void> {
  const key = keyFor(code);
  const raw = await redis.get(key);
  if (!raw) throw new RuleError("Room introuvable ou expirée.", 404);
  const room = JSON.parse(raw) as Room;
  if (room.version !== expectedVersion) throw new RuleError("La room a changé. Réessayez avec l’état récent.", 409);
  const result = await redis.eval(CLOSE_SCRIPT, 1, key, raw, EVENTS_CHANNEL, JSON.stringify({ type: "closed", code }));
  if (result !== 1) throw new RuleError("La room a changé. Réessayez.", 409);
}
