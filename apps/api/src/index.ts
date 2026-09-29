import { createHash, randomBytes, randomInt } from "node:crypto";
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { upgradeWebSocket, websocket } from "hono/bun";
import { z } from "zod";
import {
  RuleError, act, createRoom, joinRoom, playerForToken, setStartingTokens,
  settleHand, startHand, viewRoom, type Player, type Room,
} from "./domain";
import { closeRoom, EVENTS_CHANNEL, insertRoom, loadRoom, redis, subscriber, updateRoom } from "./store";

const app = new Hono();
const nicknameSchema = z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N} _-]+$/u);
const codeSchema = z.string().regex(/^[A-Z]{6}$/);
const versionSchema = z.number().int().positive();
const amountSchema = z.number().int().min(1).max(1_000_000);
type Socket = { send: (data: string) => unknown; close: (code?: number, reason?: string) => unknown };
const sockets = new Map<string, Set<Socket>>();

subscriber.subscribe(EVENTS_CHANNEL, (error) => {
  if (error) console.error("Redis subscription failed", error);
});
subscriber.on("message", (_channel, message) => {
  try {
    const event = JSON.parse(message) as { type: string; code?: string; room?: { code: string } };
    const code = event.code ?? event.room?.code;
    if (!code) return;
    for (const socket of sockets.get(code) ?? []) {
      socket.send(message);
      if (event.type === "closed") socket.close(1000, "Room fermée");
    }
  } catch (error) {
    console.error("Invalid event", error);
  }
});

setInterval(async () => {
  for (const [code, members] of sockets) {
    try {
      if (await loadRoom(code)) continue;
      const message = JSON.stringify({ type: "closed", code });
      for (const socket of members) { socket.send(message); socket.close(1000, "Room expirée"); }
      sockets.delete(code);
    } catch (error) { console.error("Room expiration check failed", error); }
  }
}, 30_000);

const cookieName = (code: string) => `pt_${code}`;
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");
const newCode = () => Array.from({ length: 6 }, () => String.fromCharCode(65 + randomInt(26))).join("");
const cookiePath = (code: string) => `/api/rooms/${code}`;
const cookieSameSite = process.env.COOKIE_SAME_SITE?.toLowerCase() === "none" ? "None" : "Lax";

function issueCookie(c: any, code: string, token: string) {
  setCookie(c, cookieName(code), token, {
    path: cookiePath(code),
    httpOnly: true,
    sameSite: cookieSameSite,
    secure: process.env.COOKIE_SECURE === "true" || cookieSameSite === "None",
  });
}

async function parseBody<T extends z.ZodTypeAny>(c: any, schema: T): Promise<z.infer<T>> {
  let body: unknown;
  try { body = await c.req.json(); } catch { throw new RuleError("Corps JSON invalide."); }
  const result = schema.safeParse(body);
  if (!result.success) throw new RuleError("Données invalides.");
  return result.data;
}

async function authorized(c: any): Promise<{ room: Room; player: Player }> {
  const code = c.req.param("code") as string;
  if (!codeSchema.safeParse(code).success) throw new RuleError("Code invalide.", 404);
  const room = await loadRoom(code);
  if (!room) throw new RuleError("Room introuvable ou expirée.", 404);
  const token = getCookie(c, cookieName(code));
  const player = playerForToken(room, token ? tokenHash(token) : undefined);
  if (!player) throw new RuleError("Rejoignez d’abord cette room.", 401);
  return { room, player };
}

function requireAdmin(player: Player) {
  if (!player.admin) throw new RuleError("Action réservée à l’admin.", 403);
}

async function rateLimit(c: any) {
  const ip = c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const key = `pockettoken:limit:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 60);
  if (count > 20) throw new RuleError("Trop de tentatives. Réessayez dans une minute.", 429);
}

app.use("/api/*", async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = process.env.APP_ORIGIN ?? "http://localhost:5173";
  if (origin && origin !== allowed) throw new RuleError("Origine non autorisée.", 403);
  if (origin) {
    c.header("Access-Control-Allow-Origin", allowed);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Vary", "Origin");
    if (c.req.method === "OPTIONS") {
      c.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      c.header("Access-Control-Allow-Headers", "Content-Type");
      return c.body(null, 204);
    }
  }
  await next();
});

app.get("/api/healthz", async (c) => {
  try { await redis.ping(); return c.json({ ok: true }); }
  catch { return c.json({ ok: false }, 503); }
});

app.post("/api/rooms", async (c) => {
  await rateLimit(c);
  const { nickname } = await parseBody(c, z.object({ nickname: nicknameSchema }));
  const token = newToken();
  for (let attempt = 0; attempt < 10; attempt++) {
    const room = createRoom(newCode(), nickname, tokenHash(token));
    if (await insertRoom(room)) {
      issueCookie(c, room.code, token);
      return c.json({ room: viewRoom(room), selfId: room.players[0].id }, 201);
    }
  }
  throw new RuleError("Impossible de créer la room. Réessayez.", 503);
});

app.post("/api/rooms/:code/join", async (c) => {
  await rateLimit(c);
  const code = c.req.param("code");
  if (!codeSchema.safeParse(code).success) throw new RuleError("Code invalide.", 404);
  const { nickname } = await parseBody(c, z.object({ nickname: nicknameSchema }));
  const existingRoom = await loadRoom(code);
  if (!existingRoom) throw new RuleError("Room introuvable ou expirée.", 404);
  const existingToken = getCookie(c, cookieName(code));
  const existingPlayer = playerForToken(existingRoom, existingToken ? tokenHash(existingToken) : undefined);
  if (existingPlayer) return c.json({ room: viewRoom(existingRoom), selfId: existingPlayer.id });
  const token = newToken();
  const room = await updateRoom(code, undefined, (draft) => joinRoom(draft, nickname, tokenHash(token)));
  const player = playerForToken(room, tokenHash(token))!;
  issueCookie(c, code, token);
  return c.json({ room: viewRoom(room), selfId: player.id }, 201);
});

app.get("/api/rooms/:code", async (c) => {
  const { room, player } = await authorized(c);
  return c.json({ room: viewRoom(room), selfId: player.id });
});

app.patch("/api/rooms/:code/settings", async (c) => {
  const { player } = await authorized(c);
  requireAdmin(player);
  const body = await parseBody(c, z.object({ expectedVersion: versionSchema, startingTokens: amountSchema }));
  const room = await updateRoom(c.req.param("code"), body.expectedVersion, (draft) => setStartingTokens(draft, body.startingTokens));
  return c.json({ room: viewRoom(room), selfId: player.id });
});

app.post("/api/rooms/:code/hands", async (c) => {
  const { player } = await authorized(c);
  requireAdmin(player);
  const { expectedVersion } = await parseBody(c, z.object({ expectedVersion: versionSchema }));
  const room = await updateRoom(c.req.param("code"), expectedVersion, startHand);
  return c.json({ room: viewRoom(room), selfId: player.id });
});

app.post("/api/rooms/:code/actions", async (c) => {
  const { player } = await authorized(c);
  const body = await parseBody(c, z.object({
    expectedVersion: versionSchema,
    action: z.enum(["bet", "call", "fold"]),
    amount: amountSchema.optional(),
  }));
  const room = await updateRoom(c.req.param("code"), body.expectedVersion, (draft) => act(draft, player.id, body.action, body.amount));
  return c.json({ room: viewRoom(room), selfId: player.id });
});

app.post("/api/rooms/:code/hands/settle", async (c) => {
  const { player } = await authorized(c);
  requireAdmin(player);
  const body = await parseBody(c, z.object({
    expectedVersion: versionSchema,
    winnersByPot: z.record(z.string(), z.array(z.string())),
  }));
  const room = await updateRoom(c.req.param("code"), body.expectedVersion, (draft) => settleHand(draft, body.winnersByPot));
  return c.json({ room: viewRoom(room), selfId: player.id });
});

app.delete("/api/rooms/:code", async (c) => {
  const { room, player } = await authorized(c);
  requireAdmin(player);
  const { expectedVersion } = await parseBody(c, z.object({ expectedVersion: versionSchema }));
  await closeRoom(room.code, expectedVersion);
  deleteCookie(c, cookieName(room.code), { path: cookiePath(room.code) });
  return c.body(null, 204);
});

app.get("/api/rooms/:code/ws", upgradeWebSocket((c) => {
  const code = c.req.param("code") ?? "";
  const token = getCookie(c, cookieName(code));
  let socketRef: Socket | null = null;
  return {
    async onOpen(_event, ws) {
      const room = await loadRoom(code);
      const player = room && playerForToken(room, token ? tokenHash(token) : undefined);
      if (!room || !player) { ws.close(1008, "Accès refusé"); return; }
      socketRef = ws as Socket;
      if (!sockets.has(code)) sockets.set(code, new Set());
      sockets.get(code)!.add(socketRef);
      ws.send(JSON.stringify({ type: "snapshot", room: viewRoom(room) }));
    },
    onClose() {
      if (socketRef) sockets.get(code)?.delete(socketRef);
      if (sockets.get(code)?.size === 0) sockets.delete(code);
    },
  };
}));

app.onError((error, c) => {
  if (error instanceof RuleError) return c.json({ error: error.message }, error.status as any);
  console.error(error);
  return c.json({ error: "Erreur interne." }, 500);
});

export default { fetch: app.fetch, websocket, port: Number(process.env.PORT ?? 3000) };
