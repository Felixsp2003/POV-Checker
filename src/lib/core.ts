// ============================================================
// Grand RP DC Checker — CORE (Speicher, Typen, Regeln)
// Speicherformat = Format der alten App (V153):
//   META_KEY grandrp_pov_meta_v42 · DB grandrp_pov_db_v42 / videos
//   Einträge werden im ALTEN Schema geschrieben (finalName, originalName,
//   discordId, types, pcCheckers, youtube:{id,url}, sourceSize …) —
//   beide App-Versionen können dieselben Daten lesen.
// ============================================================
import { normalizeEntry, parseMetaContainer, serializeMeta, legacyCount } from "./legacy";

export const APP_VERSION = "V145";
export const META_KEY = "grandrp_pov_meta_v42";
export const DB_NAME = "grandrp_pov_db_v42";
export const STORE = "videos";

export const USERS_KEY = "grandrp_users_v42";
export const SESSION_KEY = "grandrp_session_v42";
export const YT_KEY = "grandrp_yt_v42";
export const OLD_YT_KEY = "grandrp_youtube_connections_v89";   // alte App: Client-IDs übernehmen
export const DRIVE_KEY = "grandrp_drive_v42";
export const DELETED_KEY = "grandrp_deleted_v42";
export const SETTINGS_KEY = "grandrp_settings_v42";
export const QUEUE_KEY = "grandrp_queue_v42";
export const BRIDGE_KEY = "grandrp_bridge_v42";
export const LAST_KNOWN_KEY = "grandrp_lastknown_v42";
export const PC_CUSTOM_KEY = "grandrp_pc_checker_custom_v1";    // gleicher Key wie alte App
export const REC_PREFIX = "grandrp_pov_rec_v42_";
export const ACP_BASE = "https://admin.gta5grand.com";

// ---------------- Regeln der alten App ----------------

export const BAN_ADMIN_NAME = "Adam Byers";
export const BAN_ADMIN_ID = "15340";
export const PC_CHECKER_LEAD = "Adam Byers";
export const PC_CHECKER_POOL = ["Hunter Sanchez", "Mark Weber", "Christoph Contro", "John Koo", "Fugo Weezy", "Tony Shy", "Jason Azul", "Memo Savage"];
export const PC_CHECKER_MAX = 5;

export const ALLOWED_REASONS = [
  "PC-Check Verweigerung",
  "PC-Check Verweigerung - Trolling",
  "PC-Check Positiv 4.1 (Discord)",
  "PC-Check Positiv",
  "PC-Check Positiv 4.1 (Redux)",
  "PC-Check Positiv - Cleaning",
  "Event 1.7 (NoPov in PC Check)",
  "PC Check Positiv (Banevading)",
  "PC Check Positiv (Covering Cheater)",
  "Cheater",
  "Acc 1.4 (Twink)",
  "Acc 1.4 (Main)",
];

export const REASON_ALIASES: Record<string, string[]> = {
  "PC-Check Verweigerung": ["pc check verweigerung", "pc-check verweigerung", "pc check verweigert", "pc-check verweigert", "pc check yerweigerung", "po-check verweigerung", "c-check verweigerung", "pc check verweigern"],
  "PC-Check Verweigerung - Trolling": ["pc check verweigerung trolling", "pc-check verweigerung trolling", "pc check verweigert trolling", "pc check trolling verweigerung", "pc check trolling", "pc-check trolling", "trolling in pc check", "trolling im pc check"],
  "PC-Check Positiv 4.1 (Discord)": ["pc check positiv 4.1 discord", "pc-check positiv 4.1 discord", "pccheck positiv 4.1 discord", "pc check positiv 4 1 discord"],
  "PC-Check Positiv": ["pc check positiv", "pc-check positiv", "pccheck positiv", "pccheckpositiv"],
  "PC-Check Positiv 4.1 (Redux)": ["pc check positiv 4.1 redux", "pc-check positiv 4.1 redux", "pccheck positiv 4.1 redux", "pc check positiv 4 1 redux"],
  "PC-Check Positiv - Cleaning": ["pc check positiv cleaning", "pc-check positiv cleaning", "pccheck positiv cleaning", "pc-check positiv - cleaning"],
  "Event 1.7 (NoPov in PC Check)": ["event 1.7 nopov in pc check", "event1.7 nopov in pc check", "event 17 nopov in pc check", "event 1.7 no pov in pc check", "event1.7 nopov"],
  "PC Check Positiv (Banevading)": ["pc check positiv banevading", "pc-check positiv banevading", "pccheck positiv banevading", "pc check posiv banevading"],
  "PC Check Positiv (Covering Cheater)": ["pc check positiv covering cheater", "pc-check positiv covering cheater", "pc check covering cheater", "covering cheater"],
  "Cheater": ["cheater", "cheating", "cheater ban", "cheating ban"],
  "Acc 1.4 (Twink)": ["acc 1.4 twink", "acc1.4 twink", "acc 14 twink", "acc 1.4 (twink)"],
  "Acc 1.4 (Main)": ["acc 1.4 main", "acc1.4 main", "acc 14 main", "acc 1.4 (main)", "acc1.4"],
};

export const AUTO_PERMA_TRUE = new Set(["PC-Check Verweigerung - Trolling", "PC-Check Positiv", "PC Check Positiv (Banevading)", "Acc 1.4 (Twink)"]);
export const AUTO_PERMA_FALSE = new Set(["PC-Check Positiv 4.1 (Discord)", "PC-Check Positiv 4.1 (Redux)", "PC-Check Positiv - Cleaning", "Event 1.7 (NoPov in PC Check)", "PC Check Positiv (Covering Cheater)", "Acc 1.4 (Main)"]);

export const BAN_TYPES = [
  { id: "hardban", label: "Hardban" },
  { id: "socban", label: "Soc-Ban" },
  { id: "cheater", label: "Cheater" },
  { id: "negativ", label: "Negativ" },
  { id: "verweigert", label: "Verweigert" },
  { id: "pccheck", label: "PC-Check" },
];
export const DOCUMENT_STATUS = ["nicht eingetragen", "eingetragen", "nicht nötig"];
export const SERVERS = ["1", "2", "3", "4", "5"];
export const serverLabel = (s: string): string => /^\d$/.test(String(s || "")) ? `DE0${s}` : String(s || "—");
export const normServer = (s: string): string => {
  const m = String(s || "").toUpperCase().match(/(?:DE)?\s*0?([1-5])$/);
  return m ? m[1] : String(s || "");
};

// ---------------- Typen ----------------

export type PovResult = "BESTÄTIGT" | "NEGATIV" | "OFFEN" | "VERDACHT";

export interface PovEntry {
  id: string;
  targetId: string;
  reason: string;           // aus ALLOWED_REASONS (oder manuell)
  manualResult: string;     // „Ergebnis“ (Vanish, Loader, Multicheater, …)
  sc: string;               // SocialClub aus dem ACP (→ CSV-Spalte SOC)
  rid: string;              // bleibt in der Regel leer
  server: string;           // "3" = DE03
  date: string;             // ISO YYYY-MM-DD
  discord: string;
  proof: string;
  youtubeId: string;
  youtubeUrl: string;
  youtubeTitle: string;
  filename: string;         // finalName: "ID, Grund, TT.MM.JJJJ.mp4"
  origFilename: string;
  filesize: number;
  sourceType: string;
  duration: number;
  types: string[];          // hardban | socban | cheater | negativ | verweigert | pccheck
  perma: boolean;
  permaArchive: boolean;    // „Archiv: in Perma eingetragen“ → POV-Archiv
  notBanned: boolean;
  documentStatus: string;   // „Im Dokument“
  pcCheckers: string[];     // [0] = Leiter
  timestamps: Record<string, number>;
  ytSlot: number;           // 1..3 (wie alte App)
  result: PovResult;
  status: string;
  family: string;
  note: string;
  hasVideo: boolean;
  createdAt: number;
  updatedAt: number;
  quality: number;
  ocrRaw?: string;
  adminId?: string;
  videoKey?: string;        // Legacy-Schlüssel der Videodatei in IndexedDB
}

export interface QueueItem {
  qid: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  status: "wartet" | "youtube-upload" | "youtube-wartet" | "ocr" | "fertig" | "fehler" | "gespeichert";
  progress: number;
  ocrProgress: number;
  ocrResult: string;
  youtubeStatus: string;
  youtubeId: string;
  youtubeUrl: string;
  processingStatus: string;
  error: string;
  ytSlot: number;            // 0..2 (Index)
  ocr: Partial<PovEntry>;    // Formularwerte (OCR füllt nur leere Felder)
  ocrDone: boolean;
  createdAt: number;
  thumbUrl?: string;
  duration?: number;
}

export interface YTConnection {
  slot: number; name: string; clientId: string; apiKey: string; accessToken: string; refreshToken: string;
  expiry: number; channelName: string; enabled: boolean; lastVideoId: string; quotaUsed: number;
}

export interface DriveConfig {
  connected: boolean; clientId: string; accessToken: string; expiry: number; folderId: string; fileId: string;
  lastBackup: number; lastBackupCount: number; autoBackup: boolean; email: string;
  gistToken: string; gistId: string; gistLast: number;
}

export interface AppSettings {
  adminId: string; ocrLanguage: string; ocrFrames: number; serverDefault: string; loginRequired: boolean;
  autoBackup: boolean; ytDefaultSlot: number; theme: string; googleClientId: string; acpAutoOpen: boolean;
}

export interface LocalUser { u: string; p: string; salt: string; created: number; role: string; mustChange?: boolean; }

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
  const u = ["B", "KB", "MB", "GB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${u[i]}`;
}
export function formatDate(iso: string): string {
  const m = String(iso || "").match(/(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : (iso || "—");
}
export function formatDuration(s: number): string {
  if (!s || !Number.isFinite(s)) return "—";
  const m = Math.floor(s / 60); const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}
export function todayISO(): string { return new Date().toISOString().slice(0, 10); }
export function safeJSON<T>(raw: string | null, fallback: T): T {
  if (raw == null) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}
// "2026-09-07 00-53-42.mp4" → 2026-09-07 · "…, 07.09.2026.mp4" → 2026-09-07
export function dateFromFilename(name: string): string {
  let m = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = name.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

// ---------------- Regeln ----------------

export function classifyReason(text: string): string {
  const low = String(text || "").toLowerCase().replace(/[^a-z0-9äöü.()\- ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!low) return "";
  const compact = low.replace(/[^a-z0-9]+/g, "");
  let best = ""; let bestLen = 0;
  for (const r of ALLOWED_REASONS) {
    const cands = [r.toLowerCase(), ...(REASON_ALIASES[r] || [])];
    for (const c of cands) {
      const cc = c.replace(/[^a-z0-9]+/g, "");
      if (cc.length > bestLen && compact.includes(cc)) { best = r; bestLen = cc.length; }
    }
  }
  return best;
}
export function autoTypes(reason: string): string[] {
  const r = String(reason || "").toLowerCase();
  if (!r) return [];
  const t: string[] = [];
  if (/pc[ -]?check|event 1\.7/.test(r)) t.push("pccheck");
  if (/verweiger/.test(r)) t.push("verweigert");
  if (/positiv|cheat|banevading/.test(r) && !/verweiger/.test(r)) t.push("cheater");
  if (r === "cheater" || /acc 1\.4 \(twink\)/.test(r)) t.push("hardban");
  return [...new Set(t)];
}
export function autoPerma(reason: string): boolean | undefined {
  if (AUTO_PERMA_TRUE.has(reason)) return true;
  if (AUTO_PERMA_FALSE.has(reason)) return false;
  return undefined;
}
// Ergebnis: bei Verweigerung/Trolling automatisch = Grund, bei Positiv manuell (Vanish, Loader …)
export function autoResult(reason: string): string {
  return /verweiger/i.test(reason) ? reason : "";
}

const T = (e: Partial<PovEntry>) => (e.types || []).map((x) => String(x).toLowerCase());
const R = (e: Partial<PovEntry>) => `${e.reason || ""} ${e.manualResult || ""}`.toLowerCase();

export function isPcCheck(e: PovEntry): boolean { return T(e).includes("pccheck") || /pc[ -]?check/.test(R(e)); }
export function isCheater(e: PovEntry): boolean { return T(e).includes("cheater") || /cheat|positiv|banevading|redux|cleaning/.test(R(e)); }
export function isHardbann(e: PovEntry): boolean { return T(e).includes("hardban") || !!e.perma; }
export function isSocBan(e: PovEntry): boolean { return T(e).includes("socban") || /soc[ -]?ban|crossban/.test(R(e)); }
export function isNegative(e: PovEntry): boolean { return !!e.notBanned || T(e).includes("negativ") || e.result === "NEGATIV"; }
export function isVerweigert(e: PovEntry): boolean { return T(e).includes("verweigert") || /verweiger/.test(R(e)); }
export function isBan(e: PovEntry): boolean { return !isNegative(e) && (T(e).length > 0 || !!e.reason); }

export function getMissing(e: Partial<PovEntry>): string[] {
  const m: string[] = [];
  if (!e.targetId || !/^\d{1,8}$/.test(String(e.targetId).trim())) m.push("Ziel-ID");
  if (!e.reason || String(e.reason).trim().length < 2) m.push("Grund");
  if (!e.sc) m.push("SOC / SC");
  if (!e.date) m.push("Datum");
  return m;
}
export function isComplete(e: Partial<PovEntry>): boolean { return getMissing(e).length === 0; }
export function entryQuality(e: Partial<PovEntry>): number {
  let q = 0;
  if (e.targetId && /^\d{1,8}$/.test(String(e.targetId))) q += 30;
  if (e.reason && String(e.reason).length > 1) q += 25;
  if (e.server) q += 10; if (e.date) q += 15; if (e.sc) q += 20;
  return q;
}
export function deriveResult(e: Partial<PovEntry>): PovResult {
  if (e.notBanned || (e.types || []).includes("negativ")) return "NEGATIV";
  return isComplete(e) ? "BESTÄTIGT" : "OFFEN";
}
export function findDuplicateIds(entries: PovEntry[]): Set<string> {
  const count = new Map<string, number>();
  for (const e of entries) {
    const id = String(e.targetId || "").trim();
    if (!/^\d{1,8}$/.test(id)) continue;
    count.set(id, (count.get(id) || 0) + 1);
  }
  const out = new Set<string>();
  count.forEach((c, id) => { if (c > 1) out.add(id); });
  return out;
}
// "172718, PC-Check Verweigerung, 07.09.2026.mp4" (wie alte App)
export function buildFinalFilename(e: Partial<PovEntry>): string {
  const id = String(e.targetId || "").trim() || "UNBEKANNT";
  const reason = String(e.reason || "POV").trim().replace(/[\\/:*?"<>|]/g, "-") || "POV";
  return `${id}, ${reason}, ${formatDate(e.date || todayISO())}.mp4`;
}
export function emptyEntry(serverDefault = "3"): PovEntry {
  const now = Date.now();
  return {
    id: "", targetId: "", reason: "", manualResult: "", sc: "", rid: "", server: serverDefault, date: todayISO(),
    discord: "", proof: "", youtubeId: "", youtubeUrl: "", youtubeTitle: "", filename: "", origFilename: "",
    filesize: 0, sourceType: "video/mp4", duration: 0, types: [], perma: false, permaArchive: false, notBanned: false,
    documentStatus: DOCUMENT_STATUS[0], pcCheckers: [PC_CHECKER_LEAD], timestamps: {}, ytSlot: 1,
    result: "OFFEN", status: "", family: "", note: "", hasVideo: false, createdAt: now, updatedAt: now, quality: 0,
  };
}

// ---------------- IndexedDB (Version NICHT erzwingen — alte App bleibt lauffähig) ----------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try { req = indexedDB.open(DB_NAME); } catch (e) { reject(e); return; }
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => {
      const db = req.result; db.onversionchange = () => db.close();
      if (db.objectStoreNames.contains(STORE)) { resolve(db); return; }
      const next = db.version + 1; db.close();
      const up = indexedDB.open(DB_NAME, next);
      up.onupgradeneeded = () => { const d = up.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: "id" }); };
      up.onsuccess = () => { up.result.onversionchange = () => up.result.close(); resolve(up.result); };
      up.onerror = () => reject(up.error);
      up.onblocked = () => reject(new Error("IndexedDB blockiert — andere Tabs dieser Seite schließen."));
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("IndexedDB blockiert — andere Tabs dieser Seite schließen."));
  });
}
export async function putVideo(id: string, blob: Blob, meta?: Record<string, unknown>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readwrite"); const st = tx.objectStore(STORE);
      const value: Record<string, unknown> = { id, blob, meta: meta || {}, savedAt: Date.now() };
      const kp = st.keyPath;
      if (kp == null) st.put(value, id); else if (kp === "id") st.put(value); else if (typeof kp === "string") { value[kp] = id; st.put(value); } else st.put(value, id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error("Speicher voll?")); };
    } catch (e) { db.close(); reject(e); }
  });
}
function toBlob(r: unknown): Blob | null {
  if (!r) return null;
  if (r instanceof Blob) return r;
  if (typeof r !== "object") return null;
  const o = r as Record<string, unknown>;
  for (const k of ["blob", "file", "video", "data", "content", "bytes"]) {
    const v = o[k];
    if (v instanceof Blob) return v;
    if (v instanceof ArrayBuffer) return new Blob([v], { type: String(o.type || o.mime || "video/mp4") });
    if (ArrayBuffer.isView(v)) return new Blob([v as ArrayBufferView<ArrayBuffer>], { type: String(o.type || o.mime || "video/mp4") });
  }
  return null;
}
export async function getVideo(id: string): Promise<Blob | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE, "readonly"); const rq = tx.objectStore(STORE).get(id);
      rq.onsuccess = () => { db.close(); resolve(toBlob(rq.result)); };
      rq.onerror = () => { db.close(); reject(rq.error); };
    } catch (e) { db.close(); reject(e); }
  });
}
export async function delVideo(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
export async function hasVideo(id: string): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE, "readonly"); const rq = tx.objectStore(STORE).getKey(id);
    rq.onsuccess = () => { db.close(); resolve(rq.result !== undefined); };
    rq.onerror = () => { db.close(); resolve(false); };
  });
}
// Video eines Eintrags finden: eigene ID → Legacy-Schlüssel → Dateinamen
export async function findVideo(e: Pick<PovEntry, "id" | "videoKey" | "filename" | "origFilename">): Promise<Blob | null> {
  for (const key of [e.id, e.videoKey, e.filename, e.origFilename]) {
    if (!key) continue;
    const b = await getVideo(key).catch(() => null);
    if (b) return b;
  }
  return null;
}

// ---------------- Meta (localStorage) ----------------

const META_FALLBACK = META_KEY + "__dc";
const META_SAFETY = META_KEY + "__dc_safety";
const MIRROR_ID = "__meta_mirror__";

export function loadMeta(): PovEntry[] {
  const out: PovEntry[] = []; const seen = new Set<string>();
  const c = parseMetaContainer(localStorage.getItem(META_KEY));
  c.list.forEach((raw, i) => { const e = normalizeEntry(raw, seen, c.mapKeys.get(i)); if (e) out.push(e); });
  const fb = safeJSON<unknown>(localStorage.getItem(META_FALLBACK), null);
  if (Array.isArray(fb)) fb.forEach((raw) => { const e = normalizeEntry(raw, seen); if (e) out.push(e); });
  return out;
}
export function metaDiagnostics(): string {
  const raw = localStorage.getItem(META_KEY); const c = parseMetaContainer(raw);
  return `META ${raw ? `${(raw.length / 1024).toFixed(0)} KB` : "leer"} · Form: ${c.unparsable ? "UNLESBAR" : c.shape.kind} · Einträge: ${c.list.length} · Legacy: ${legacyCount()}`;
}
export function saveMeta(entries: PovEntry[]): void {
  const rawText = localStorage.getItem(META_KEY); const c = parseMetaContainer(rawText);
  if (c.unparsable) {
    localStorage.setItem(META_FALLBACK, JSON.stringify(entries.filter((e) => !e.id.startsWith("legacy_"))));
    localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify({ count: entries.length, at: Date.now() }));
    return;
  }
  if (rawText && !localStorage.getItem(META_SAFETY) && rawText.length < 3_000_000) { try { localStorage.setItem(META_SAFETY, rawText); } catch { /* egal */ } }
  localStorage.setItem(META_KEY, serializeMeta(c, entries));
  localStorage.setItem(LAST_KNOWN_KEY, JSON.stringify({ count: entries.length, at: Date.now() }));
  void mirrorMeta(entries).catch(() => undefined);
}
export async function mirrorMeta(entries: PovEntry[]): Promise<void> {
  if (!entries.length) return;
  await putVideo(MIRROR_ID, new Blob([JSON.stringify(entries)], { type: "application/json" }), { mirror: true });
}
export async function loadMirror(): Promise<PovEntry[]> {
  try { const b = await getVideo(MIRROR_ID); if (!b) return []; const arr = JSON.parse(await b.text()); return Array.isArray(arr) ? arr : []; } catch { return []; }
}
export function loadLastKnown(): { count: number; at: number } { return safeJSON(localStorage.getItem(LAST_KNOWN_KEY), { count: 0, at: 0 }); }

// ---------------- Key-Schutz: fremde Formate nie überschreiben ----------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function ownKey(base: string, looksMine: (v: unknown) => boolean): string {
  const raw = localStorage.getItem(base);
  if (raw == null || raw === "") return base;
  const v = safeJSON<unknown>(raw, undefined);
  if (v === undefined) return base + "__dc";
  return looksMine(v) ? base : base + "__dc";
}
const settingsKey = () => ownKey(SETTINGS_KEY, (v) => isObj(v) && ("ocrFrames" in v || "adminId" in v || "loginRequired" in v || Object.keys(v).length === 0));
const ytKey = () => ownKey(YT_KEY, (v) => Array.isArray(v) && v.length === 3 && v.every((x) => isObj(x) && "slot" in x));
const driveKey = () => ownKey(DRIVE_KEY, (v) => isObj(v) && ("connected" in v || "gistToken" in v || Object.keys(v).length === 0));
const usersKey = () => ownKey(USERS_KEY, (v) => Array.isArray(v) && (v.length === 0 || v.some((x) => isObj(x) && typeof x.u === "string" && typeof x.salt === "string")));
const sessionKey = () => { const r = localStorage.getItem(SESSION_KEY); return r && /^[[{]/.test(r) ? SESSION_KEY + "__dc" : SESSION_KEY; };
const deletedKey = () => ownKey(DELETED_KEY, (v) => Array.isArray(v) && v.every((x) => typeof x === "string"));
const queueKey = () => ownKey(QUEUE_KEY, (v) => Array.isArray(v) && (v.length === 0 || v.every((x) => isObj(x) && "qid" in x)));

export function loadDeleted(): string[] {
  const v = safeJSON<unknown>(localStorage.getItem(deletedKey()), []);
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
export function saveDeleted(ids: string[]): void { localStorage.setItem(deletedKey(), JSON.stringify(ids)); }
export function markDeleted(id: string): void {
  const d = loadDeleted(); if (!d.includes(id)) { d.push(id); saveDeleted(d); }
  try { localStorage.removeItem(REC_PREFIX + id); } catch { /* noop */ }
}

// Einzel-Records nur für eigene Einträge (pov_…), ohne große Felder
export function saveRecord(e: PovEntry): void {
  if (!e || typeof e.id !== "string" || !e.id.startsWith("pov_")) return;
  try { localStorage.setItem(REC_PREFIX + e.id, JSON.stringify({ ...e, ocrRaw: "" })); } catch { /* Quota */ }
}
export function loadAllRecords(): PovEntry[] {
  const out: PovEntry[] = []; const seen = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(REC_PREFIX)) { const v = normalizeEntry(safeJSON<unknown>(localStorage.getItem(k), null), seen); if (v && v.id.startsWith("pov_")) out.push(v); }
    }
  } catch { /* noop */ }
  return out;
}
export function deleteRecord(id: string): void { try { localStorage.removeItem(REC_PREFIX + id); } catch { /* noop */ } }

// Merge: Vereinigung; bessere/neuere Version gewinnt; leer überschreibt nie voll; Felder werden aufgefüllt
export function mergeEntries(a: unknown[], b: unknown[], extraDeleted: string[] = []): PovEntry[] {
  const map = new Map<string, PovEntry>();
  const deleted = new Set([...loadDeleted(), ...extraDeleted]);
  const seen = new Set<string>();
  const consider = (raw: unknown) => {
    const e = normalizeEntry(raw, seen);
    if (!e || deleted.has(e.id)) return;
    const prev = map.get(e.id);
    if (!prev) { map.set(e.id, e); return; }
    const qPrev = (prev.quality || 0) + (prev.updatedAt || 0) / 1e12;
    const qNext = (e.quality || 0) + (e.updatedAt || 0) / 1e12;
    if ((prev.targetId && prev.reason) && (!e.targetId && !e.reason)) return;
    const winner = qNext >= qPrev ? e : prev; const loser = winner === e ? prev : e;
    const m = { ...loser, ...winner } as Record<string, unknown>; const l = loser as unknown as Record<string, unknown>;
    for (const k of Object.keys(m)) {
      const v = m[k];
      if ((v === "" || v == null || v === 0 || (Array.isArray(v) && v.length === 0)) && l[k]) m[k] = l[k];
    }
    map.set(e.id, m as unknown as PovEntry);
  };
  (Array.isArray(a) ? a : []).forEach(consider);
  seen.clear();
  (Array.isArray(b) ? b : []).forEach(consider);
  return [...map.values()].sort((x, y) => (y.updatedAt || 0) - (x.updatedAt || 0));
}

// ---------------- Settings / YT / Drive / Users ----------------

export function defaultSettings(): AppSettings {
  return { adminId: BAN_ADMIN_ID, ocrLanguage: "deu+eng", ocrFrames: 8, serverDefault: "3", loginRequired: true, autoBackup: true, ytDefaultSlot: 0, theme: "dark", googleClientId: "", acpAutoOpen: true };
}
export function loadSettings(): AppSettings {
  const v = safeJSON<unknown>(localStorage.getItem(settingsKey()), {});
  const s = { ...defaultSettings(), ...(isObj(v) ? (v as Partial<AppSettings>) : {}) };
  s.serverDefault = normServer(s.serverDefault) || "3";
  if (!s.adminId) s.adminId = BAN_ADMIN_ID;
  return s;
}
export function saveSettings(s: AppSettings): void { localStorage.setItem(settingsKey(), JSON.stringify(s)); }

export function defaultYT(): YTConnection[] {
  return [0, 1, 2].map((slot) => ({ slot, name: `Verbindung ${slot + 1}`, clientId: "", apiKey: "", accessToken: "", refreshToken: "", expiry: 0, channelName: "", enabled: true, lastVideoId: "", quotaUsed: 0 }));
}
// Client-IDs der alten App (grandrp_youtube_connections_v89) werden übernommen, falls eigene leer sind
function oldYtClientIds(): string[] {
  const raw = safeJSON<unknown>(localStorage.getItem(OLD_YT_KEY), null);
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.connections) ? raw.connections : [];
  const out = ["", "", ""];
  for (const c of list as Array<Record<string, unknown>>) {
    if (!isObj(c)) continue;
    const slot = Number(c.slot || 0) - 1; const cid = String(c.clientId || "");
    if (slot >= 0 && slot < 3 && cid) out[slot] = cid;
  }
  return out;
}
export function loadYT(): YTConnection[] {
  const raw = safeJSON<YTConnection[] | null>(localStorage.getItem(ytKey()), null);
  const base = defaultYT().map((d, i) => ({ ...d, ...(raw && Array.isArray(raw) && isObj(raw[i]) ? raw[i] : {}) }));
  const old = oldYtClientIds();
  return base.map((y, i) => ({ ...y, clientId: y.clientId || old[i] }));
}
export function saveYT(conns: YTConnection[]): void { localStorage.setItem(ytKey(), JSON.stringify(conns)); }
export function adoptYtConnections(list: unknown): number {
  if (!Array.isArray(list)) return 0;
  const cur = loadYT(); let n = 0;
  for (const c of list as Array<Record<string, unknown>>) {
    if (!isObj(c)) continue;
    const slot = Number(c.slot || 0) - 1; const cid = String(c.clientId || "");
    if (slot >= 0 && slot < 3 && cid && !cur[slot].clientId) { cur[slot].clientId = cid; n++; }
  }
  if (n) saveYT(cur);
  return n;
}

export function defaultDrive(): DriveConfig {
  return { connected: false, clientId: "", accessToken: "", expiry: 0, folderId: "", fileId: "", lastBackup: 0, lastBackupCount: 0, autoBackup: true, email: "", gistToken: "", gistId: "", gistLast: 0 };
}
export function loadDrive(): DriveConfig {
  const v = safeJSON<unknown>(localStorage.getItem(driveKey()), {});
  return { ...defaultDrive(), ...(isObj(v) ? (v as Partial<DriveConfig>) : {}) };
}
export function saveDrive(d: DriveConfig): void { localStorage.setItem(driveKey(), JSON.stringify(d)); }

const validUser = (x: unknown): x is LocalUser => isObj(x) && typeof x.u === "string" && typeof x.p === "string" && typeof x.salt === "string";
export function loadUsers(): LocalUser[] {
  const raw = safeJSON<unknown>(localStorage.getItem(usersKey()), []);
  return Array.isArray(raw) ? raw.filter(validUser) : [];
}
export function saveUsers(u: LocalUser[]): void {
  const k = usersKey(); const raw = safeJSON<unknown>(localStorage.getItem(k), []);
  const foreign = Array.isArray(raw) ? raw.filter((x) => !validUser(x)) : [];
  localStorage.setItem(k, JSON.stringify([...u, ...foreign]));
}
export function loadSession(): string { const s = localStorage.getItem(sessionKey()) || ""; return /^[[{]/.test(s) ? "" : s; }
export function saveSession(u: string): void { if (u) localStorage.setItem(sessionKey(), u); else localStorage.removeItem(sessionKey()); }

export function loadBridgeToken(): string {
  let t = localStorage.getItem(BRIDGE_KEY) || "";
  if (!t) { t = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, "0")).join(""); localStorage.setItem(BRIDGE_KEY, t); }
  return t;
}

export function loadQueueMeta(): QueueItem[] {
  const v = safeJSON<unknown>(localStorage.getItem(queueKey()), []);
  return Array.isArray(v) ? (v.filter((x) => isObj(x) && typeof x.qid === "string") as QueueItem[]).map((q) => ({ ...q, ocr: isObj(q.ocr) ? q.ocr : {} })) : [];
}
export function saveQueueMeta(q: QueueItem[]): void {
  try { localStorage.setItem(queueKey(), JSON.stringify(q.map((x) => ({ ...x, thumbUrl: undefined, ocrResult: (x.ocrResult || "").slice(0, 600) })))); } catch { /* noop */ }
}

// PC-Checker: eigene Namen (gleicher Key wie alte App)
export function loadCustomCheckers(): string[] {
  const v = safeJSON<unknown>(localStorage.getItem(PC_CUSTOM_KEY), []);
  return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}
export function saveCustomCheckers(names: string[]): void { localStorage.setItem(PC_CUSTOM_KEY, JSON.stringify([...new Set(names.filter(Boolean))])); }
export function checkerPool(): string[] { return [...new Set([...PC_CHECKER_POOL, ...loadCustomCheckers()])]; }

// ---------------- CSV (Spalten wie alte App) ----------------

export const CSV_FILTER_DEFS = [
  { id: "bans", label: "Bans" }, { id: "hardbann", label: "Hardbann" }, { id: "socban", label: "Soc-Ban" },
  { id: "cheater", label: "Cheater" }, { id: "pccheck", label: "PC-Check" }, { id: "pccheck-refuse", label: "PC-Check Verweigerung" },
  { id: "trolling", label: "Trolling" }, { id: "cleaning", label: "Cleaning" }, { id: "redux", label: "Redux" },
  { id: "banevading", label: "Banevading" }, { id: "perma", label: "Perma-Ban" }, { id: "negativ", label: "Negativ" },
  { id: "doc-no", label: "Nicht im Dokument" }, { id: "sc-yes", label: "SC vorhanden" }, { id: "sc-no", label: "SC leer" },
  { id: "dc-yes", label: "Discord vorhanden" }, { id: "dc-no", label: "Discord leer" }, { id: "proof-yes", label: "Proof vorhanden" }, { id: "proof-no", label: "Proof leer" },
];
export const CSV_SORTS = [
  { id: "new", label: "Neueste" }, { id: "old", label: "Älteste" }, { id: "id-asc", label: "ID aufsteigend" }, { id: "id-desc", label: "ID absteigend" },
  { id: "reason-az", label: "Grund A–Z" }, { id: "reason-za", label: "Grund Z–A" }, { id: "hard-first", label: "Hardbann zuerst" }, { id: "hard-last", label: "Hardbann zuletzt" },
  { id: "soc-first", label: "Soc-Ban zuerst" }, { id: "cheater-first", label: "Cheater zuerst" }, { id: "pc-first", label: "PC-Check zuerst" }, { id: "perma-first", label: "Perma zuerst" },
  { id: "sc-first", label: "SC vorhanden zuerst" }, { id: "dc-first", label: "Discord vorhanden zuerst" }, { id: "proof-first", label: "Proof vorhanden zuerst" },
];
export function applyCsvFilters(entries: PovEntry[], f: { active: Set<string>; search: string; from: string; to: string }): PovEntry[] {
  const s = f.search.trim().toLowerCase();
  return entries.filter((e) => {
    if (f.active.size > 0) {
      let ok = false; const r = R(e);
      for (const id of f.active) {
        if (id === "bans" && isBan(e)) ok = true;
        if (id === "hardbann" && isHardbann(e)) ok = true;
        if (id === "socban" && isSocBan(e)) ok = true;
        if (id === "cheater" && isCheater(e)) ok = true;
        if (id === "pccheck" && isPcCheck(e)) ok = true;
        if (id === "pccheck-refuse" && isVerweigert(e)) ok = true;
        if (id === "trolling" && r.includes("troll")) ok = true;
        if (id === "cleaning" && r.includes("clean")) ok = true;
        if (id === "redux" && r.includes("redux")) ok = true;
        if (id === "banevading" && r.includes("banevading")) ok = true;
        if (id === "perma" && e.perma) ok = true;
        if (id === "negativ" && isNegative(e)) ok = true;
        if (id === "doc-no" && !/^eingetragen/i.test(e.documentStatus || "")) ok = true;
        if (id === "sc-yes" && e.sc) ok = true; if (id === "sc-no" && !e.sc) ok = true;
        if (id === "dc-yes" && e.discord) ok = true; if (id === "dc-no" && !e.discord) ok = true;
        if (id === "proof-yes" && (e.proof || e.youtubeUrl)) ok = true; if (id === "proof-no" && !(e.proof || e.youtubeUrl)) ok = true;
      }
      if (!ok) return false;
    }
    if (s && !`${e.targetId} ${e.sc} ${e.reason} ${e.manualResult} ${e.discord} ${(e.pcCheckers || []).join(" ")}`.toLowerCase().includes(s)) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    return true;
  });
}
export function sortCsv(entries: PovEntry[], sort: string): PovEntry[] {
  const arr = [...entries]; const n = (b: boolean) => Number(b);
  switch (sort) {
    case "old": return arr.sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.createdAt || 0) - (b.createdAt || 0));
    case "id-asc": return arr.sort((a, b) => parseInt(a.targetId || "0", 10) - parseInt(b.targetId || "0", 10));
    case "id-desc": return arr.sort((a, b) => parseInt(b.targetId || "0", 10) - parseInt(a.targetId || "0", 10));
    case "reason-az": return arr.sort((a, b) => (a.reason || "").localeCompare(b.reason || ""));
    case "reason-za": return arr.sort((a, b) => (b.reason || "").localeCompare(a.reason || ""));
    case "hard-first": return arr.sort((a, b) => n(isHardbann(b)) - n(isHardbann(a)));
    case "hard-last": return arr.sort((a, b) => n(isHardbann(a)) - n(isHardbann(b)));
    case "soc-first": return arr.sort((a, b) => n(isSocBan(b)) - n(isSocBan(a)));
    case "cheater-first": return arr.sort((a, b) => n(isCheater(b)) - n(isCheater(a)));
    case "pc-first": return arr.sort((a, b) => n(isPcCheck(b)) - n(isPcCheck(a)));
    case "perma-first": return arr.sort((a, b) => n(!!b.perma) - n(!!a.perma));
    case "sc-first": return arr.sort((a, b) => n(!!b.sc) - n(!!a.sc));
    case "dc-first": return arr.sort((a, b) => n(!!b.discord) - n(!!a.discord));
    case "proof-first": return arr.sort((a, b) => n(!!(b.proof || b.youtubeUrl)) - n(!!(a.proof || a.youtubeUrl)));
    default: return arr.sort((a, b) => (b.date || "").localeCompare(a.date || "") || (b.createdAt || 0) - (a.createdAt || 0));
  }
}
export const CSV_HEAD = ["Proof", "Datum", "ID", "SOC", "RID", "Discord ID", "Familie", "Ergebnis", "Grund", "Admin 1", "Admin 2", "Admin 3", "Admin 4", "Admin 5"];
export function csvRow(e: PovEntry): string[] {
  const pc = e.pcCheckers || [];
  // SOC = SC aus dem Adminpanel · RID bleibt leer · Familie bleibt leer · Admin 1–5 = PC Checker
  return [e.proof || e.youtubeUrl || "", formatDate(e.date), e.targetId || "", e.sc || "", "", e.discord || "", "", e.manualResult || "", e.reason || "", pc[0] || "", pc[1] || "", pc[2] || "", pc[3] || "", pc[4] || ""];
}
export function toCSV(entries: PovEntry[], sep = ";"): string {
  const esc = (v: string) => /[;"\n\t,]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return "\ufeff" + [CSV_HEAD.map(esc).join(sep), ...entries.map((e) => csvRow(e).map(esc).join(sep))].join("\r\n");
}
export function toTSV(entries: PovEntry[]): string {
  return [CSV_HEAD.join("\t"), ...entries.map((e) => csvRow(e).join("\t"))].join("\n");
}
