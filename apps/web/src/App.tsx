import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApiError, PlayerView, RoomResponse, RoomView } from "@pockettoken/shared";
import {
  ArrowRight, Check, CircleHelp, Coins, Copy, Crown, LockKeyhole, Moon,
  Play, Plus, RefreshCw, Spade, Sun, Users, Wifi, WifiOff, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const format = (value: number) => new Intl.NumberFormat("fr-FR").format(value);
const compact = (value: number) => new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const roomPath = (code: string) => `/room/${code}`;
const codeFromPath = () => /^\/room\/([A-Z]{6})$/.exec(window.location.pathname)?.[1] ?? null;

async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({ error: "Une erreur est survenue." })) as ApiError;
    throw new Error(data.error ?? "Une erreur est survenue.");
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function Brand() {
  return <span className="brand"><span className="brand-mark"><Spade size={23} fill="currentColor" /></span><span>Pocket<span className="brand-accent">Token</span></span></span>;
}

function ThemeButton({ theme, onToggle }: { theme: "dark" | "light"; onToggle: () => void }) {
  return <Button variant="outline" size="icon" className="theme-button" onClick={onToggle} aria-label={theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre"} title="Changer de thème">{theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}</Button>;
}

function Landing({ onEnter }: { onEnter: (data: RoomResponse) => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [nickname, setNickname] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const data = mode === "create"
        ? await api<RoomResponse>("/api/rooms", "POST", { nickname: nickname.trim() })
        : await api<RoomResponse>(`/api/rooms/${code.toUpperCase()}/join`, "POST", { nickname: nickname.trim() });
      onEnter(data);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="landing-shell">
    <section className="landing-copy">
      <span className="eyebrow"><span className="status-dot" /> LA TABLE EST À VOUS</span>
      <h1>Le plaisir du poker.<br /><em>Sans chercher les jetons.</em></h1>
      <p className="hero-text">Une room, quelques amis, et vos Pockins sont prêts à jouer. Suivez chaque mise et chaque solde en temps réel.</p>
      <div className="hero-points"><span><Coins size={18} /> Jetons virtuels</span><span><Users size={18} /> Jusqu’à 10 joueurs</span><span><LockKeyhole size={18} /> Sans compte</span></div>
      <div className="hero-chips" aria-hidden="true"><div className="chip chip-back">P</div><div className="chip chip-mid">P</div><div className="chip chip-front">P</div></div>
    </section>
    <Card className="entry-card">
      <CardHeader className="entry-header"><span className="entry-icon"><Spade size={25} fill="currentColor" /></span><CardTitle>À vos places</CardTitle><CardDescription>Créez une table ou rejoignez vos amis en quelques secondes.</CardDescription></CardHeader>
      <CardContent>
        <div className="segmented" role="tablist" aria-label="Choisir une action">
          <button type="button" role="tab" aria-selected={mode === "create"} className={mode === "create" ? "selected" : ""} onClick={() => { setMode("create"); setError(""); }}>Créer une room</button>
          <button type="button" role="tab" aria-selected={mode === "join"} className={mode === "join" ? "selected" : ""} onClick={() => { setMode("join"); setError(""); }}>Rejoindre</button>
        </div>
        <form onSubmit={submit} className="entry-form">
          {mode === "join" && <label>Code de la room<Input autoComplete="off" maxLength={6} placeholder="ABCDEF" value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z]/gi, "").toUpperCase())} className="code-input" required /></label>}
          <label>Votre pseudo<Input autoComplete="nickname" maxLength={20} minLength={2} placeholder="Ex. LuckySeven" value={nickname} onChange={(event) => setNickname(event.target.value)} required /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button className="neo-button gold-button w-full" size="lg" disabled={busy || nickname.trim().length < 2 || (mode === "join" && code.length !== 6)}>{busy ? "Un instant…" : mode === "create" ? "Créer ma table" : "Rejoindre la table"}<ArrowRight size={18} /></Button>
        </form>
        <p className="entry-note">Aucune carte ni règle de poker imposée. Vos jetons, votre partie.</p>
      </CardContent>
    </Card>
  </main>;
}

function playerStatus(player: PlayerView, phase: RoomView["phase"]) {
  if (phase !== "betting") return player.balance > 0 ? "Prêt" : "Sans jetons";
  if (!player.participating) return "Observe";
  if (player.folded) return "Couché";
  if (player.allIn) return "Tapis";
  return "En jeu";
}

function PokerSeat({ player, self, phase }: { player: PlayerView; self: boolean; phase: RoomView["phase"] }) {
  const status = playerStatus(player, phase);
  return <div className={cn("poker-seat", self && "seat-self", player.folded && "seat-folded", player.allIn && "seat-all-in")} title={`${player.nickname} · ${status} · mise ${format(player.contribution)}`}>
    <span className="seat-name">{player.admin && <Crown size={11} aria-label="Admin" />}<span>{player.nickname}</span>{self && <b>VOUS</b>}</span>
    <span className="seat-stake"><Coins size={12} /><strong>{phase === "betting" && player.participating ? compact(player.contribution) : "—"}</strong><small>{status}</small></span>
  </div>;
}

function PokerTable({ room, selfId }: { room: RoomView; selfId: string }) {
  const count = room.players.length;
  const topCount = Math.ceil(count / 2);
  return <section className="table-area" aria-label="Table de jeu">
    <div className="table-stage">
      <div className="desktop-seats">{room.players.map((player, index) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * index) / count;
        const position = { left: `${50 + 43 * Math.cos(angle)}%`, top: `${50 + 44 * Math.sin(angle)}%` };
        return <div className="seat-position" style={position} key={player.id}><PokerSeat player={player} self={player.id === selfId} phase={room.phase} /></div>;
      })}</div>
      <div className="mobile-seats top-seats" style={{ gridTemplateColumns: `repeat(${topCount}, minmax(0, 1fr))` }}>{room.players.slice(0, topCount).map((player) => <PokerSeat key={player.id} player={player} self={player.id === selfId} phase={room.phase} />)}</div>
      <div className="table-felt">
        <div className="felt-border" />
        <div className="felt-center">
          <span className="felt-label">{room.phase === "betting" ? `MANCHE ${room.handNumber}` : room.phase === "lobby" ? "LA TABLE EST PRÊTE" : "ENTRE DEUX MANCHES"}</span>
          <Coins size={29} className="pot-icon" />
          <strong>{format(room.potTotal)}</strong>
          <span className="pot-caption">POCKINS AU POT</span>
          {room.phase === "betting" && <span className="table-current-bet">Mise à suivre <b>{format(room.currentBet)}</b></span>}
        </div>
      </div>
      <div className="mobile-seats bottom-seats" style={{ gridTemplateColumns: `repeat(${Math.max(1, count - topCount)}, minmax(0, 1fr))` }}>{room.players.slice(topCount).map((player) => <PokerSeat key={player.id} player={player} self={player.id === selfId} phase={room.phase} />)}</div>
    </div>
    <p className="table-help">Places dans l’ordre d’arrivée · les mises s’actualisent en direct</p>
  </section>;
}

function PlayerLedger({ room, selfId }: { room: RoomView; selfId: string }) {
  return <section className="ledger" aria-labelledby="ledger-title">
    <div className="ledger-heading"><div><span className="section-kicker">LE REGISTRE</span><h2 id="ledger-title">Les joueurs</h2></div><strong>{room.players.length}/10</strong></div>
    <Table className="ledger-table">
      <TableHeader><TableRow><TableHead>Joueur</TableHead><TableHead className="number-cell">Solde</TableHead><TableHead className="number-cell">Mise</TableHead><TableHead className="status-column">État</TableHead></TableRow></TableHeader>
      <TableBody>{room.players.map((player) => {
        const status = playerStatus(player, room.phase);
        return <TableRow key={player.id} className={cn(player.id === selfId && "ledger-self", player.folded && "ledger-folded")}>
          <TableCell className="ledger-player"><span title={player.nickname}>{player.nickname}</span>{player.admin && <Crown size={13} aria-label="Admin" />}{player.id === selfId && <b>VOUS</b>}<small className="mobile-status">{status}</small></TableCell>
          <TableCell className="number-cell">{format(player.balance)}</TableCell>
          <TableCell className="number-cell">{room.phase === "betting" && player.participating ? format(player.contribution) : "—"}</TableCell>
          <TableCell className="status-column"><span className={cn("status-mark", player.folded && "is-folded", player.allIn && "is-all-in")}>{status}</span></TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  </section>;
}

type ActionDockProps = {
  room: RoomView;
  self: PlayerView;
  busy: boolean;
  betAmount: string;
  setBetAmount: (value: string) => void;
  onAction: (action: "bet" | "call" | "fold", amount?: number) => void;
};

function ActionDock({ room, self, busy, betAmount, setBetAmount, onAction }: ActionDockProps) {
  const active = !self.folded && !self.allIn;
  const toCall = Math.max(0, room.currentBet - self.contribution);
  const minBet = Math.max(1, toCall + 1);
  const validBet = Number.isSafeInteger(Number(betAmount)) && Number(betAmount) >= minBet && Number(betAmount) <= self.balance;
  const canFold = room.players.filter((player) => player.participating && !player.folded).length > 1;
  return <section className="action-dock" aria-label="Vos actions">
    <div className="dock-summary"><div><small>VOTRE SOLDE</small><strong>{format(self.balance)} <span>Pockins</span></strong></div><div><small>À SUIVRE</small><strong>{format(toCall)}</strong></div><div className="dock-status">{self.folded ? "COUCHÉ" : self.allIn ? "TAPIS" : "À VOUS DE JOUER"}</div></div>
    {active && <div className="dock-controls">
      <label className="bet-field"><span>Nouvelle mise</span><Input type="number" inputMode="numeric" min={minBet} max={self.balance} value={betAmount} onChange={(event) => setBetAmount(event.target.value)} placeholder={`Min. ${format(minBet)}`} disabled={busy || self.balance === 0} /></label>
      <Button className="neo-button gold-button dock-bet" disabled={busy || !validBet} onClick={() => onAction("bet", Number(betAmount))}><Coins size={16} />{room.currentBet ? "Relancer" : "Miser"}</Button>
      <Button className="neo-button dock-call" variant="secondary" disabled={busy || self.balance === 0 || toCall === 0} onClick={() => onAction("call")}>Suivre {toCall > 0 ? format(Math.min(toCall, self.balance)) : ""}</Button>
      <Button className="neo-button dock-fold" variant="outline" disabled={busy || !canFold} onClick={() => onAction("fold")}>Se coucher</Button>
    </div>}
    {!active && <p className="dock-message">{self.folded ? "Vous êtes couché pour cette manche." : "Vous avez fait tapis. Les gains seront distribués à la clôture."}</p>}
  </section>;
}

type SettlementProps = {
  room: RoomView;
  open: boolean;
  onOpenChange: (value: boolean) => void;
  winners: Record<string, string[]>;
  setWinners: (update: (current: Record<string, string[]>) => Record<string, string[]>) => void;
  busy: boolean;
  onSettle: () => void;
};

function SettlementDialog({ room, open, onOpenChange, winners, setWinners, busy, onSettle }: SettlementProps) {
  const ready = room.pots.every((pot) => pot.eligiblePlayerIds.length === 1 || !!winners[pot.id]?.length);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <div className="dialog-header"><span className="section-kicker">ADMIN · MANCHE {room.handNumber}</span><DialogTitle>Distribuer les pots</DialogTitle><DialogDescription>Choisissez un ou plusieurs gagnants par pot. Un partage est toujours égal.</DialogDescription></div>
      <div className="dialog-scroll">
        {room.autoFoldPlayerIds.length > 0 && <p className="settlement-note">Sans suivi à la clôture : {room.autoFoldPlayerIds.map((id) => room.players.find((player) => player.id === id)?.nickname).join(", ")} {room.autoFoldPlayerIds.length > 1 ? "seront couchés" : "sera couché"}.</p>}
        {room.refund && <p className="settlement-note">Mise non suivie remboursée : {format(room.refund.amount)} à {room.players.find((player) => player.id === room.refund?.playerId)?.nickname}.</p>}
        {room.pots.length === 0 ? <p className="empty-pot">Aucune mise engagée. La manche peut se terminer sans distribution.</p> : <Table className="pots-table"><TableHeader><TableRow><TableHead>Pot</TableHead><TableHead>Gagnant(s)</TableHead></TableRow></TableHeader><TableBody>{room.pots.map((pot, index) => <TableRow key={pot.id}><TableCell className="pot-name"><strong>{index === 0 ? "Principal" : `Annexe ${index}`}</strong><span>{format(pot.amount)} Pockins</span></TableCell><TableCell><div className="winner-options">{pot.eligiblePlayerIds.map((id) => {
          const player = room.players.find((item) => item.id === id)!;
          const selected = pot.eligiblePlayerIds.length === 1 || winners[pot.id]?.includes(id);
          return <button type="button" key={id} className={cn("winner-pill", selected && "selected")} aria-pressed={!!selected} disabled={pot.eligiblePlayerIds.length === 1} onClick={() => setWinners((current) => ({ ...current, [pot.id]: current[pot.id]?.includes(id) ? current[pot.id].filter((item) => item !== id) : [...(current[pot.id] ?? []), id] }))}><Check size={14} />{player.nickname}</button>;
        })}</div></TableCell></TableRow>)}</TableBody></Table>}
      </div>
      <div className="dialog-footer"><span>{room.pots.length} pot{room.pots.length > 1 ? "s" : ""} à traiter</span><Button className="neo-button gold-button" disabled={busy || !ready} onClick={onSettle}>Confirmer la distribution</Button></div>
    </DialogContent>
  </Dialog>;
}

function RoomScreen({ code, initial, onExit }: { code: string; initial: RoomResponse | null; onExit: () => void }) {
  const [session, setSession] = useState<RoomResponse | null>(initial);
  const [loading, setLoading] = useState(!initial);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [starting, setStarting] = useState("500");
  const [betAmount, setBetAmount] = useState("");
  const [winners, setWinners] = useState<Record<string, string[]>>({});
  const [settlementOpen, setSettlementOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await api<RoomResponse>(`/api/rooms/${code}`);
      setSession((current) => current && current.room.version > data.room.version ? current : data);
      setNeedsJoin(false);
    } catch (cause) {
      const message = (cause as Error).message;
      if (message.includes("Rejoignez")) setNeedsJoin(true);
      else { setSession(null); setError(message); }
    } finally { setLoading(false); }
  }, [code]);

  useEffect(() => { if (!initial) void reload(); }, [initial, reload]);
  useEffect(() => { if (session) setStarting(String(session.room.startingTokens)); }, [session?.room.startingTokens]);
  useEffect(() => { setWinners({}); }, [session?.room.version]);
  useEffect(() => { if (session?.room.phase !== "betting") setSettlementOpen(false); }, [session?.room.phase]);

  useEffect(() => {
    if (!session) return;
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let delay = 1000;
    const connect = () => {
      if (stopped) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${code}/ws`);
      socket.onopen = () => { setConnected(true); delay = 1000; void reload(); };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data) as { type: string; room?: RoomView };
        if (message.type === "closed") { onExit(); return; }
        if (message.type === "snapshot" && message.room) {
          const room = message.room;
          setSession((current) => current && room.version >= current.room.version ? { ...current, room } : current);
        }
      };
      socket.onclose = () => { setConnected(false); if (!stopped) { retry = setTimeout(connect, delay); delay = Math.min(delay * 2, 15000); } };
      socket.onerror = () => socket?.close();
    };
    connect();
    return () => { stopped = true; clearTimeout(retry); socket?.close(); };
  }, [code, !!session?.selfId]);

  async function join(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { setSession(await api<RoomResponse>(`/api/rooms/${code}/join`, "POST", { nickname: nickname.trim() })); setNeedsJoin(false); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function mutate(path: string, method: string, payload: Record<string, unknown>): Promise<boolean> {
    if (!session) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<RoomResponse>(`/api/rooms/${code}${path}`, method, { expectedVersion: session.room.version, ...payload });
      setSession((current) => current && current.room.version > result.room.version ? current : result);
      return true;
    } catch (cause) { setError((cause as Error).message); await reload(); return false; }
    finally { setBusy(false); }
  }

  async function close() {
    if (!session || !window.confirm("Fermer définitivement cette room et effacer ses jetons ?")) return;
    setBusy(true);
    try { await api<void>(`/api/rooms/${code}`, "DELETE", { expectedVersion: session.room.version }); onExit(); }
    catch (cause) { setError((cause as Error).message); await reload(); }
    finally { setBusy(false); }
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setNotice("Code copié !"); setTimeout(() => setNotice(""), 2500); }
    catch { setError("Impossible de copier le code."); }
  }

  if (loading) return <div className="center-state"><RefreshCw className="spin" /> Chargement de la table…</div>;
  if (needsJoin) return <div className="center-state"><Card className="join-card"><CardHeader><CardTitle>Rejoindre {code}</CardTitle><CardDescription>Choisissez un pseudo pour prendre place à la table.</CardDescription></CardHeader><CardContent><form onSubmit={join} className="entry-form"><Input value={nickname} onChange={(event) => setNickname(event.target.value)} minLength={2} maxLength={20} placeholder="Votre pseudo" required />{error && <p className="form-error">{error}</p>}<Button disabled={busy || nickname.trim().length < 2} className="neo-button gold-button">Rejoindre <ArrowRight size={17} /></Button></form></CardContent></Card></div>;
  if (!session) return <div className="center-state"><Card className="join-card"><CardHeader><CardTitle>Table indisponible</CardTitle><CardDescription>{error || "La room n’existe plus."}</CardDescription></CardHeader><CardContent><Button className="neo-button" onClick={onExit}>Retour à l’accueil</Button></CardContent></Card></div>;

  const { room, selfId } = session;
  const self = room.players.find((player) => player.id === selfId)!;
  const inHand = room.phase === "betting";
  const isAdmin = self.admin;
  const hasEnoughPlayers = room.players.filter((player) => player.balance > 0).length >= 2;

  async function settle() {
    if (await mutate("/hands/settle", "POST", { winnersByPot: winners })) setSettlementOpen(false);
  }

  function act(action: "bet" | "call" | "fold", amount?: number) {
    void mutate("/actions", "POST", { action, ...(amount === undefined ? {} : { amount }) });
    if (action === "bet") setBetAmount("");
  }

  return <main className={cn("room-shell", inHand && self.participating && "has-action-dock")}>
    <div className="room-topline"><div><span className="section-kicker">TABLE PRIVÉE · {room.phase === "betting" ? `MANCHE ${room.handNumber}` : room.phase === "lobby" ? "SALON" : "ENTRE-MANCHES"}</span><h1>Votre table de jeu</h1></div><div className="room-tools"><span className={cn("connection", connected ? "online" : "offline")}>{connected ? <Wifi size={15} /> : <WifiOff size={15} />}{connected ? "En direct" : "Reconnexion…"}</span><Button variant="outline" onClick={copyCode} className="code-button"><span>{code}</span><Copy size={15} /></Button></div></div>
    {notice && <div className="notice" role="status"><Check size={16} />{notice}</div>}
    {error && <div className="form-error room-error" role="alert"><CircleHelp size={16} />{error}<Button variant="ghost" size="sm" onClick={() => setError("")}><X size={15} /></Button></div>}

    <div className="phase-strip">
      {room.phase === "lobby" && <>
        <div className="phase-copy"><span className="phase-number">01</span><div><strong>Préparez la table</strong><span>Invitez vos amis avec le code {code}. Départ : {format(room.startingTokens)} Pockins.</span></div></div>
        {isAdmin ? <div className="phase-controls"><label>Solde initial<Input type="number" inputMode="numeric" min={1} max={1000000} value={starting} onChange={(event) => setStarting(event.target.value)} /></label><Button variant="outline" className="neo-button" disabled={busy || Number(starting) === room.startingTokens || !Number.isInteger(Number(starting)) || Number(starting) < 1 || Number(starting) > 1000000} onClick={() => void mutate("/settings", "PATCH", { startingTokens: Number(starting) })}>Enregistrer</Button><Button className="neo-button gold-button" disabled={busy || !hasEnoughPlayers || Number(starting) !== room.startingTokens} onClick={() => void mutate("/hands", "POST", {})}><Play size={16} fill="currentColor" />Démarrer</Button></div> : <strong className="phase-wait">En attente de l’admin</strong>}
      </>}
      {room.phase === "intermission" && <>
        <div className="phase-copy"><span className="phase-number">✓</span><div><strong>Manche {room.handNumber} terminée</strong><span>{Object.entries(room.lastResult?.payouts ?? {}).filter(([, amount]) => amount > 0).map(([id, amount]) => `${room.players.find((player) => player.id === id)?.nickname} +${format(amount)}`).join(" · ") || "Aucun gain distribué"}</span></div></div>
        {isAdmin ? <Button className="neo-button gold-button" disabled={busy || !hasEnoughPlayers} onClick={() => void mutate("/hands", "POST", {})}><Plus size={16} />Nouvelle manche</Button> : <strong className="phase-wait">En attente de l’admin</strong>}
      </>}
      {inHand && <>
        <div className="phase-copy"><span className="phase-number">{String(room.handNumber).padStart(2, "0")}</span><div><strong>Manche en cours</strong><span>{self.nickname} · {format(self.balance)} Pockins disponibles · {format(self.contribution)} engagés</span></div></div>
        {isAdmin && <Button variant="outline" className="neo-button settle-trigger" onClick={() => setSettlementOpen(true)}>Clôturer la manche <ArrowRight size={16} /></Button>}
      </>}
    </div>

    <div className="game-layout"><PokerTable room={room} selfId={selfId} /><PlayerLedger room={room} selfId={selfId} /></div>
    {inHand && self.participating && <ActionDock room={room} self={self} busy={busy} betAmount={betAmount} setBetAmount={setBetAmount} onAction={act} />}
    {isAdmin && <div className="room-footer-actions"><Button variant="ghost" className="close-room" disabled={busy} onClick={() => void close()}>Fermer la room</Button></div>}
    {isAdmin && inHand && <SettlementDialog room={room} open={settlementOpen} onOpenChange={setSettlementOpen} winners={winners} setWinners={setWinners} busy={busy} onSettle={() => void settle()} />}
  </main>;
}

export default function App() {
  const [code, setCode] = useState<string | null>(codeFromPath);
  const [initial, setInitial] = useState<RoomResponse | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">(() => localStorage.getItem("pockettoken-theme") === "light" ? "light" : "dark");
  useEffect(() => { document.documentElement.classList.toggle("dark", theme === "dark"); localStorage.setItem("pockettoken-theme", theme); }, [theme]);
  useEffect(() => { const back = () => { setCode(codeFromPath()); setInitial(null); }; window.addEventListener("popstate", back); return () => window.removeEventListener("popstate", back); }, []);
  const enter = (data: RoomResponse) => { history.pushState({}, "", roomPath(data.room.code)); setInitial(data); setCode(data.room.code); };
  const exit = () => { history.pushState({}, "", "/"); setInitial(null); setCode(null); };
  return <div className="app-shell"><header className="site-header"><div className="header-inner"><a href="/" onClick={(event) => { event.preventDefault(); exit(); }} aria-label="Accueil PocketToken"><Brand /></a><div className="header-right"><span className="header-tag">VOTRE TABLE, VOS RÈGLES</span><ThemeButton theme={theme} onToggle={() => setTheme(theme === "dark" ? "light" : "dark")} /></div></div></header>{code ? <RoomScreen key={code} code={code} initial={initial} onExit={exit} /> : <Landing onEnter={enter} />}<footer className="site-footer"><span>© PocketToken</span><span>Les Pockins restent entre amis.</span></footer></div>;
}
