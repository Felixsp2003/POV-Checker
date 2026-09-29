// ============================================================
// Grand RP DC Checker — CORE (Speicher, Typen, Logik)
// META_KEY / DB_NAME DÜRFEN NIEMALS GEÄNDERT WERDEN!
// ============================================================

export const APP_VERSION = "V143";
export const META_KEY = "grandrp_pov_meta_v42";
export const DB_NAME = "grandrp_pov_db_v42";
export const DB_VERSION = 42;
export const STORE = "videos";

export const USERS_KEY = "grandrp_users_v42";
export const SESSION_KEY = "grandrp_session_v42";
export const YT_KEY = "grandrp_yt_v42";
export const DRIVE_KEY = "grandrp_drive_v42";
export const DRIVE_META_KEY = "grandrp_drive_backup_meta_v42";
export const DELETED_KEY = "grandrp_deleted_v42";
export const SETTINGS_KEY = "grandrp_settings_v42";
export const QUEUE_KEY = "grandrp_queue_v42";
export const BRIDGE_KEY = "grandrp_bridge_v42";
export const LAST_KNOWN_KEY = "grandrp_lastknown_v42";

export const ACP_BASE = "https://admin.gta5grand.com";

export const REC_PREFIX = "grandrp_pov_rec_v42_";

// ---------------- Typen ----------------

export type PovResult = "BESTÄTIGT" | "NEGATIV" | "OFFEN" | "VERDACHT";

export interface PovEntry {
  id: string;               // interne ID (niemals ändern)
  targetId: string;         // Ziel-ID (z.B. 123456)
  reason: string;           // Ban-Grund
  sc: string;               // SocialClub / RID
  server: string;           // DE01..DE05, EN, JP, TR, US ...
  date: string;             // YYYY-MM-DD
  discord: string;
  proof: string;            // YouTube URL oder Proof-Link
  youtubeId: string;
  youtubeUrl: string;
  youtubeTitle: string;
  filename: string;         // finaler Dateiname
  origFilename: string;
  filesize: number;
  duration: number;
  result: PovResult;
  status: string;
  family: string;
  rid: string;
  note: string;
  permaArchive: boolean;
  hasVideo: boolean;
  thumbnail: string;        // dataURL (klein)
  createdAt: number;
  updatedAt: number;
  quality: number;          // 0..100 OCR-/Datensatzqualität
  ocrRaw?: string;
  ocrVotes?: string[];
  adminId?: string;
  processingNote?: string;
}

export interface QueueItem {
  qid: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: "wartet" | "youtube-upload" | "youtube-wartet" | "ocr" | "fertig" | "fehler" | "gespeichert";
  progress: number;          // 0..100 Upload
  ocrProgress: number;
  ocrResult: string;
  youtubeStatus: string;
  youtubeId: string;
  youtubeUrl: string;
  processingStatus: string;  // youtube processing
  error: string;
  ytSlot: number;            // 0..2
  ocr: Partial<PovEntry> | null;
  ocrComplete: boolean;
  missing: string[];
  editing: boolean;
  createdAt: number;
  thumbUrl?: string;
  duration?: number;
}

export interface YTConnection {
  slot: number;
  name: string;
  clientId: string;
  apiKey: string;
  accessToken: string;
  refreshToken: string;
  expiry: number;
  channelName: string;
  enabled: boolean;
  lastVideoId: string;
  quotaUsed: number;
}

export interface DriveConfig {
  connected: boolean;
  clientId: string;
  accessToken: string;
  expiry: number;
  folderId: string;
  fileId: string;
  lastBackup: number;
  lastBackupCount: number;
  autoBackup: boolean;
  email: string;
  gistToken: string;
  gistId: string;
  gistLast: number;
}

export interface AppSettings {
  adminId: string;          // eigene Admin-ID (darf nicht als Ziel-ID erkannt werden)
  ocrLanguage: string;
  ocrFrames: number;
  serverDefault: string;
  loginRequired: boolean;
  autoBackup: boolean;
  ytDefaultSlot: number;
  theme: string;
  googleClientId: string;
  acpAutoOpen: boolean;
}

export interface LocalUser {
  u: string;
  p: string;          // SHA-256(salt + "::" + Passwort) — nie Klartext
  salt: string;
  created: number;
  role: string;
  mustChange?: boolean; // true = Standardpasswort aktiv, Änderung wird erzwungen
}
export interface ScCheckResult {
  sc: string; nickname: string; charId: string; logins: number;
  socban: boolean; ban: boolean; server: string; raw: string;
}

// ---------------- Gründe / Listen ----------------

export const ALLOWED_REASONS = [
  "Cheating", "Cheater", "PC-Check", "PC-Check Verweigerung", "Trolling", "Cleaning",
  "Redux", "Banevading", "Crossban", "Hardbann", "Soc-Ban", "Perma-Ban",
  "RDM", "VDM", "Fail-RP", "Powergaming", "Metagaming", "Bugabuse",
  "Beleidigung", "Rassismus", "Waffenmissbrauch", "Car-Ramming", "Combat-Logging",
  "Cop-Baiting", "Mercy-Killing", "NWL", "Ghetto-Regel", "Event-Regel", "Familien-Regel",
  "Negativ", "Unvollständig", "Sonstiges",
];

export const SERVERS = ["DE01", "DE02", "DE03", "DE04", "DE05", "EN01", "EN02", "JP01", "TR01", "US01"];

export const CSV_FILTER_DEFS = [
  { id: "bans", label: "Bans" }, { id: "hardbann", label: "Hardbann" },
  { id: "socban", label: "Soc-Ban" }, { id: "cheater", label: "Cheater" },
  { id: "pccheck", label: "PC-Check" }, { id: "pccheck-refuse", label: "PC-Check Verweigerung" },
  { id: "trolling", label: "Trolling" }, { id: "cleaning", label: "Cleaning" },
  { id: "redux", label: "Redux" }, { id: "banevading", label: "Banevading" },
  { id: "perma", label: "Perma-Ban" }, { id: "sc-yes", label: "SC vorhanden" },
  { id: "sc-no", label: "SC leer" }, { id: "dc-yes", label: "Discord vorhanden" },
  { id: "dc-no", label: "Discord leer" }, { id: "proof-yes", label: "Proof vorhanden" },
  { id: "proof-no", label: "Proof leer" },
];

export const CSV_SORTS = [
  { id: "new", label: "Neueste" }, { id: "old", label: "Älteste" },
  { id: "id-asc", label: "ID aufsteigend" }, { id: "id-desc", label: "ID absteigend" },
  { id: "reason-az", label: "Grund A–Z" }, { id: "reason-za", label: "Grund Z–A" },
  { id: "hard-first", label: "Hardbann zuerst" }, { id: "hard-last", label: "Hardbann zuletzt" },
  { id: "soc-first", label: "Soc-Ban zuerst" }, { id: "cheater-first", label: "Cheater zuerst" },
  { id: "pc-first", label: "PC-Check zuerst" }, { id: "perma-first", label: "Perma zuerst" },
  { id: "sc-first", label: "SC vorhanden zuerst" }, { id: "dc-first", label: "Discord vorhanden zuerst" },
  { id: "proof-first", label: "Proof vorhanden zuerst" },
];

// ---------------- Utils ----------------

export function uid(prefix = "pov"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function formatBytes(n: number): string {
  if (!n || n <= 0) return "—";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const m = iso.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return iso;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function safeJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// ---------------- Klassifizierung ----------------

const R = (e: PovEntry) => `${e.reason} ${e.status} ${e.result}`.toLowerCase();

export function isHardbann(e: PovEntry): boolean {
  const t = R(e);
  return t.includes("hardbann") || t.includes("perma") || t.includes("banevading");
}
export function isSocBan(e: PovEntry): boolean {
  const t = R(e);
  return t.includes("soc") || t.includes("crossban");
}
export function isCheater(e: PovEntry): boolean {
  const t = R(e);
  return t.includes("cheat") || t.includes("redux") || t.includes("cleaning") || t.includes("bugabuse");
}
export function isPcCheck(e: PovEntry): boolean {
  const t = R(e);
  return t.includes("pc-check") || t.includes("pccheck") || t.includes("pc check");
}
export function isBan(e: PovEntry): boolean {
  if (e.result === "NEGATIV") return false;
  const t = R(e);
  return t.includes("ban") || t.includes("cheat") || t.includes("rdm") || t.includes("vdm") ||
    t.includes("fail") || t.includes("troll") || t.includes("crossban") || e.result === "BESTÄTIGT";
}
export function isNegative(e: PovEntry): boolean {
  return e.result === "NEGATIV" || e.reason.toLowerCase().includes("negativ");
}

export function getMissing(e: Partial<PovEntry>): string[] {
  const m: string[] = [];
  if (!e.targetId || !/^\d{3,8}$/.test(e.targetId.trim())) m.push("Ziel-ID");
  if (!e.reason || e.reason.trim().length < 2) m.push("Grund");
  if (!e.server) m.push("Server");
  if (!e.date) m.push("Datum");
  if (!e.sc) m.push("SC/RID");
  return m;
}

export function isComplete(e: Partial<PovEntry>): boolean {
  return getMissing(e).length === 0;
}

export function entryQuality(e: Partial<PovEntry>): number {
  let q = 0;
  if (e.targetId && /^\d{3,8}$/.test(e.targetId)) q += 30;
  if (e.reason && e.reason.length > 1) q += 25;
  if (e.server) q += 15;
  if (e.date) q += 15;
  if (e.sc) q += 15;
  return q;
}

export function findDuplicateIds(entries: PovEntry[]): Set<string> {
  const count = new Map<string, number>();
  for (const e of entries) {
    const id = (e.targetId || "").trim();
    if (!/^\d{3,8}$/.test(id)) continue;
    count.set(id, (count.get(id) || 0) + 1);
  }
  const out = new Set<string>();
  count.forEach((c, id) => { if (c > 1) out.add(id); });
  return out;
}

export function buildFinalFilename(e: Partial<PovEntry>): string {
  const id = (e.targetId || "UNBEKANNT").trim() || "UNBEKANNT";
  const reason = (e.reason || "POV").trim().replace(/[\\/:*?"<>|]/g, "-") || "POV";
  const date = e.date || todayISO();
  return `${id}, ${reason}, ${date}.mp4`;
}

// ---------------- IndexedDB ----------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putVideo(id: string, blob: Blob, meta?: Record<string, unknown>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const st = tx.objectStore(STORE);
    st.put({ id, blob, meta: meta || {}, savedAt: Date.now() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getVideo(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const rq = tx.objectStore(STORE).get(id);
    rq.onsuccess = () => { db.close(); resolve(rq.result ? (rq.result.blob as Blob) : null); };
    rq.onerror = () => { db.close(); reject(rq.error); };
  });
}

export async function delVideo(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function hasVideo(id: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const rq = tx.objectStore(STORE).getKey(id);
    rq.onsuccess = () => { db.close(); resolve(rq.result !== undefined); };
    rq.onerror = () => { db.close(); resolve(false); };
  });
}

// ---------------- localStorage: Meta ----------------

export function loadMeta(): PovEntry[] {
  return safeJSON<PovEntry[]>(localStorage.getItem(META_KEY), []);
}

export function saveMeta(entries: PovEntry[]): void {
  localStorage.setItem(META_KEY, JSON.stringify(entries));
  localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify({ count: entries.length, at: Date.now() }));
}

export function loadLastKnown(): { count: number; at: number } {
  return safeJSON(localStorage.getItem(LAST_KNOWN_KEY), { count: 0, at: 0 });
}

export function loadDeleted(): string[] {
  return safeJSON<string[]>(localStorage.getItem(DELETED_KEY), []);
}
export function saveDeleted(ids: string[]): void {
  localStorage.setItem(DELETED_KEY, JSON.stringify(ids));
}
export function markDeleted(id: string): void {
  const d = loadDeleted();
  if (!d.includes(id)) { d.push(id); saveDeleted(d); }
  try { localStorage.removeItem(REC_PREFIX + id); } catch { /* noop */ }
}

// Einzel-Records (redundante Persistenz, Reload-sicher)
export function saveRecord(e: PovEntry): void {
  try { localStorage.setItem(REC_PREFIX + e.id, JSON.stringify(e)); } catch { /* Quota -> Thumbnail entfernen */ 
    try {
      const slim = { ...e, thumbnail: "" };
      localStorage.setItem(REC_PREFIX + e.id, JSON.stringify(slim));
    } catch { /* noop */ }
  }
}
export function loadAllRecords(): PovEntry[] {
  const out: PovEntry[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(REC_PREFIX)) {
        const v = safeJSON<PovEntry | null>(localStorage.getItem(k), null);
        if (v && v.id) out.push(v);
      }
    }
  } catch { /* noop */ }
  return out;
}
export function deleteRecord(id: string): void {
  try { localStorage.removeItem(REC_PREFIX + id); } catch { /* noop */ }
}

// Merge: Quelle A + Quelle B → Vereinigung, neuere/qualitativ bessere Version gewinnt,
// leere Datensätze überschreiben NIEMALS volle.
export function mergeEntries(a: PovEntry[], b: PovEntry[]): PovEntry[] {
  const map = new Map<string, PovEntry>();
  const deleted = new Set(loadDeleted());
  const consider = (e: PovEntry) => {
    if (!e || !e.id || deleted.has(e.id)) return;
    const prev = map.get(e.id);
    if (!prev) { map.set(e.id, e); return; }
    const qPrev = (prev.quality || 0) + (prev.updatedAt || 0) / 1e12;
    const qNext = (e.quality || 0) + (e.updatedAt || 0) / 1e12;
    const prevFull = isComplete(prev) || (prev.targetId && prev.reason);
    const nextEmpty = !e.targetId && !e.reason;
    if (prevFull && nextEmpty) return; // leer überschreibt nicht voll
    if (qNext >= qPrev) map.set(e.id, e);
  };
  a.forEach(consider);
  b.forEach(consider);
  return [...map.values()].sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
}

// ---------------- Settings / YT / Drive / Users ----------------

export function defaultSettings(): AppSettings {
  return {
    adminId: "", ocrLanguage: "deu+eng", ocrFrames: 6, serverDefault: "DE02",
    loginRequired: true, autoBackup: true, ytDefaultSlot: 0, theme: "dark",
    googleClientId: "", acpAutoOpen: true,
  };
}
export function loadSettings(): AppSettings {
  return { ...defaultSettings(), ...safeJSON<Partial<AppSettings>>(localStorage.getItem(SETTINGS_KEY), {}) };
}
export function saveSettings(s: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function defaultYT(): YTConnection[] {
  return [0, 1, 2].map((slot) => ({
    slot, name: slot === 0 ? "Kanal 1" : `Kanal ${slot + 1}`,
    clientId: "", apiKey: "", accessToken: "", refreshToken: "", expiry: 0,
    channelName: "", enabled: slot === 0, lastVideoId: "", quotaUsed: 0,
  }));
}
export function loadYT(): YTConnection[] {
  const raw = safeJSON<YTConnection[] | null>(localStorage.getItem(YT_KEY), null);
  if (!raw || !Array.isArray(raw) || raw.length !== 3) return defaultYT();
  return raw;
}
export function saveYT(conns: YTConnection[]): void {
  localStorage.setItem(YT_KEY, JSON.stringify(conns));
}

export function defaultDrive(): DriveConfig {
  return {
    connected: false, clientId: "", accessToken: "", expiry: 0,
    folderId: "", fileId: "", lastBackup: 0, lastBackupCount: 0, autoBackup: true, email: "",
    gistToken: "", gistId: "", gistLast: 0,
  };
}
export function loadDrive(): DriveConfig {
  return { ...defaultDrive(), ...safeJSON<Partial<DriveConfig>>(localStorage.getItem(DRIVE_KEY), {}) };
}
export function saveDrive(d: DriveConfig): void {
  localStorage.setItem(DRIVE_KEY, JSON.stringify(d));
}

export function loadUsers(): LocalUser[] {
  return safeJSON<LocalUser[]>(localStorage.getItem(USERS_KEY), []);
}
export function saveUsers(u: LocalUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(u));
}
export function loadSession(): string {
  return localStorage.getItem(SESSION_KEY) || "";
}
export function saveSession(u: string): void {
  if (u) localStorage.setItem(SESSION_KEY, u);
  else localStorage.removeItem(SESSION_KEY);
}

export function loadBridgeToken(): string {
  let t = localStorage.getItem(BRIDGE_KEY) || "";
  if (!t) {
    t = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(BRIDGE_KEY, t);
  }
  return t;
}

export function loadQueueMeta(): QueueItem[] {
  return safeJSON<QueueItem[]>(localStorage.getItem(QUEUE_KEY), []);
}
export function saveQueueMeta(q: QueueItem[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q.map(({ ...rest }) => ({ ...rest, thumbUrl: undefined })))); } catch { /* noop */ }
}

// ---------------- CSV ----------------

export interface CsvFilterState {
  active: Set<string>;
  search: string;
  from: string;
  to: string;
  sort: string;
}

export function applyCsvFilters(entries: PovEntry[], f: { active: Set<string>; search: string; from: string; to: string }): PovEntry[] {
  const s = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.active.size > 0) {
      let ok = false;
      for (const id of f.active) {
        if (id === "bans" && isBan(e)) ok = true;
        if (id === "hardbann" && isHardbann(e)) ok = true;
        if (id === "socban" && isSocBan(e)) ok = true;
        if (id === "cheater" && isCheater(e)) ok = true;
        if (id === "pccheck" && isPcCheck(e)) ok = true;
        if (id === "pccheck-refuse" && R(e).includes("verweigerung")) ok = true;
        if (id === "trolling" && R(e).includes("troll")) ok = true;
        if (id === "cleaning" && R(e).includes("clean")) ok = true;
        if (id === "redux" && R(e).includes("redux")) ok = true;
        if (id === "banevading" && R(e).includes("banevading")) ok = true;
        if (id === "perma" && (R(e).includes("perma") || R(e).includes("hardbann"))) ok = true;
        if (id === "sc-yes" && e.sc) ok = true;
        if (id === "sc-no" && !e.sc) ok = true;
        if (id === "dc-yes" && e.discord) ok = true;
        if (id === "dc-no" && !e.discord) ok = true;
        if (id === "proof-yes" && (e.proof || e.youtubeUrl)) ok = true;
        if (id === "proof-no" && !(e.proof || e.youtubeUrl)) ok = true;
      }
      if (!ok) return false;
    }
    if (s) {
      const hay = `${e.targetId} ${e.sc} ${e.reason} ${e.rid} ${e.discord} ${e.family}`.toLowerCase();
      if (!hay.includes(s)) return false;
    }
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    return true;
  });
}

export function sortCsv(entries: PovEntry[], sort: string): PovEntry[] {
  const arr = [...entries];
  switch (sort) {
    case "old": return arr.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    case "id-asc": return arr.sort((a, b) => parseInt(a.targetId || "0", 10) - parseInt(b.targetId || "0", 10));
    case "id-desc": return arr.sort((a, b) => parseInt(b.targetId || "0", 10) - parseInt(a.targetId || "0", 10));
    case "reason-az": return arr.sort((a, b) => (a.reason || "").localeCompare(b.reason || ""));
    case "reason-za": return arr.sort((a, b) => (b.reason || "").localeCompare(a.reason || ""));
    case "hard-first": return arr.sort((a, b) => Number(isHardbann(b)) - Number(isHardbann(a)));
    case "hard-last": return arr.sort((a, b) => Number(isHardbann(a)) - Number(isHardbann(b)));
    case "soc-first": return arr.sort((a, b) => Number(isSocBan(b)) - Number(isSocBan(a)));
    case "cheater-first": return arr.sort((a, b) => Number(isCheater(b)) - Number(isCheater(a)));
    case "pc-first": return arr.sort((a, b) => Number(isPcCheck(b)) - Number(isPcCheck(a)));
    case "perma-first": return arr.sort((a, b) => Number(R(b).includes("perma")) - Number(R(a).includes("perma")));
    case "sc-first": return arr.sort((a, b) => Number(!!b.sc) - Number(!!a.sc));
    case "dc-first": return arr.sort((a, b) => Number(!!b.discord) - Number(!!a.discord));
    case "proof-first": return arr.sort((a, b) => Number(!!(b.proof || b.youtubeUrl)) - Number(!!(a.proof || a.youtubeUrl)));
    default: return arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }
}

export function toCSV(entries: PovEntry[]): string {
  const head = ["Proof", "Datum", "ID", "SOC", "RID", "Discord ID", "Familie", "Grund", "Server", "Ergebnis", "Status", "Dateiname", "YouTube"];
  const esc = (v: string) => `"${String(v || "").replace(/"/g, '""')}"`;
  const lines = [head.map(esc).join(";")];
  for (const e of entries) {
    lines.push([e.proof || e.youtubeUrl, e.date, e.targetId, e.sc, e.rid || e.sc, e.discord, e.family, e.reason, e.server, e.result, e.status, e.filename, e.youtubeUrl].map(esc).join(";"));
  }
  return "\ufeff" + lines.join("\r\n");
}

// ---------------- SocialClub / Crossban ----------------

export function extractCrossbanServer(text: string): string {
  const m = text.match(/Crossban\s*\(?\s*([A-Z]{2})\s*\)?/i);
  if (m) return m[1].toUpperCase();
  return "DE";
}

export function buildCrossbanCommands(results: ScCheckResult[], serverLabel: string): string[] {
  const out: string[] = [];
  for (const r of results) {
    if (!r.socban && !r.ban) continue;
    if (r.socban) out.push(`/socban ${r.sc} Crossban ${serverLabel}`);
  }
  for (const r of results) {
    if (!r.ban || !r.charId) continue;
    out.push(`/unban ${r.charId}`);
    out.push(`/ban ${r.charId} 60 Crossban ${serverLabel}`);
  }
  return out;
}

export function buildCrossbanTemplate(r: ScCheckResult, serverLabel: string, proof: string): string {
  return `ID: ${r.charId || "—"}\nGrund: Crossban (${serverLabel})\nLID: ${r.sc}\nProof: ${proof || "—"}`;
}
