// ============================================================
// Grand RP DC Checker — SCHEMA-BRÜCKE zur alten App (V153)
// Altes Schema (localStorage grandrp_pov_meta_v42 & Drive-Backup):
//   { id, originalName, finalName, targetId, reason, manualResult, sc, server,
//     date, rid, types[], perma, permaArchive, notBanned, documentStatus,
//     pcCheckers[], pcCheckerManual[], discordId, proof, complete, saved,
//     videoStored, offline, sourceSize, sourceType, duration, timestamps{},
//     infoPhotoField, missing[], youtube{id,url,…}, youtubeConnectionSlot,
//     youtubeTitle, result{…} }
// Lesen: altes Schema → PovEntry.  Schreiben: PovEntry → altes Schema
// (alle Originalfelder bleiben erhalten; Zusatzfelder unter "dc").
// Keine Wertimporte aus core.ts (Import-Zyklus).
// ============================================================
import type { PovEntry, PovResult } from "./core";

type Raw = Record<string, unknown>;
const legacyRaw = new Map<string, Raw>();
const mapKeys = new Map<string, string>();
let legacyN = 0;

const S = (v: unknown): string => (v == null || typeof v === "object" || typeof v === "function") ? "" : String(v).trim();
const N = (v: unknown): number => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "")); return Number.isFinite(n) ? n : 0; };
const B = (v: unknown): boolean => v === true || v === 1 || v === "1" || (typeof v === "string" && /^(true|ja|yes|on)$/i.test(v));
const A = (v: unknown): string[] => Array.isArray(v) ? v.map(S).filter(Boolean) : [];
const O = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v)) ? (v as Raw) : {};
const RESULTS: PovResult[] = ["BESTÄTIGT", "NEGATIV", "OFFEN", "VERDACHT"];

function hash(o: Raw): string {
  const s = JSON.stringify(o);
  let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  let h2 = 52711; for (let i = 0; i < s.length; i++) h2 = ((h2 << 5) ^ (h2 >> 2) ^ s.charCodeAt(i)) >>> 0;
  return `legacy_${h.toString(36)}${h2.toString(36)}`;
}
function toISO(v: unknown): string {
  if (typeof v === "number" && v > 1e9) return new Date(v < 1e11 ? v * 1000 : v).toISOString().slice(0, 10);
  const s = S(v); if (!s) return "";
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) { let y = m[3]; if (y.length === 2) y = "20" + y; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  const t = Date.parse(s); return Number.isNaN(t) ? "" : new Date(t).toISOString().slice(0, 10);
}
function toTs(v: unknown): number {
  if (typeof v === "number") return v > 0 && v < 1e11 ? v * 1000 : v;
  const s = S(v); if (!s) return 0;
  if (/^\d+$/.test(s)) { const n = parseInt(s, 10); return n < 1e11 ? n * 1000 : n; }
  const t = Date.parse(s); return Number.isNaN(t) ? 0 : t;
}
const complete = (e: Pick<PovEntry, "targetId" | "reason" | "sc" | "date">): boolean =>
  !!(e.targetId && /^\d{1,8}$/.test(e.targetId) && e.reason && e.sc && e.date);
const quality = (e: Pick<PovEntry, "targetId" | "reason" | "sc" | "date" | "server">): number =>
  (e.targetId && /^\d{1,8}$/.test(e.targetId) ? 30 : 0) + (e.reason ? 25 : 0) + (e.server ? 10 : 0) + (e.date ? 15 : 0) + (e.sc ? 20 : 0);

/** Rohobjekt (altes oder eigenes Schema) → PovEntry. null nur für Nicht-Objekte. */
export function normalizeEntry(rawIn: unknown, seen: Set<string>, mapKey?: string): PovEntry | null {
  if (!rawIn || typeof rawIn !== "object" || Array.isArray(rawIn)) return null;
  const o = rawIn as Raw;
  const dc = O(o.dc);
  const yt = O(o.youtube);

  let id = S(o.id) || S(o.dcId) || S(dc.id);
  let targetId = S(o.targetId ?? o.zielId ?? o.playerId);
  if (id && /^\d{1,8}$/.test(id) && !targetId) { targetId = id; id = ""; }
  if (!id) id = hash(o);
  if (seen.has(id)) { let n = 2; while (seen.has(`${id}_${n}`)) n++; id = `${id}_${n}`; }
  seen.add(id);

  const reason = S(o.reason ?? o.grund);
  const sc = S(o.sc ?? o.soc ?? o.socialclub);
  const proof = S(o.proof);
  let youtubeUrl = S(yt.url) || S(o.youtubeUrl);
  if (!youtubeUrl && /youtu\.?be/.test(proof)) youtubeUrl = proof;
  let youtubeId = S(yt.id) || S(o.youtubeId);
  if (!youtubeId && youtubeUrl) { const m = youtubeUrl.match(/(?:v=|youtu\.be\/|shorts\/)([A-Za-z0-9_-]{11})/); if (m) youtubeId = m[1]; }
  const date = toISO(o.date ?? o.datum);
  const createdAt = toTs(dc.createdAt ?? o.createdAt) || (date ? Date.parse(date) : 0) || Date.now();
  const updatedAt = toTs(dc.updatedAt ?? o.updatedAt) || createdAt;
  const pc = [...new Set([...A(o.pcCheckers), ...A(o.pcCheckerManual)])];
  const types = A(o.types).map((t) => t.toLowerCase());
  const ts: Record<string, number> = {};
  for (const [k, v] of Object.entries(O(o.timestamps))) { const n = N(v); if (n > 0) ts[k] = n; }
  const resRaw = S(dc.result) || (typeof o.result === "string" ? S(o.result) : "");
  const base = { targetId, reason, sc, date, server: S(o.server) };
  const notBanned = B(o.notBanned);
  const result: PovResult = (RESULTS as string[]).includes(resRaw) ? (resRaw as PovResult)
    : notBanned || types.includes("negativ") ? "NEGATIV" : complete(base) ? "BESTÄTIGT" : "OFFEN";

  const e: PovEntry = {
    id, targetId, reason,
    manualResult: S(o.manualResult ?? o.ergebnis),
    sc, rid: S(o.rid),
    server: S(o.server) || "3", date,
    discord: S(o.discordId ?? o.discord),
    proof, youtubeId, youtubeUrl,
    youtubeTitle: S(o.youtubeTitle),
    filename: S(o.finalName ?? o.filename),
    origFilename: S(o.originalName ?? o.origFilename),
    filesize: N(o.sourceSize ?? o.filesize ?? yt.sourceSize),
    sourceType: S(o.sourceType ?? yt.sourceType) || "video/mp4",
    duration: N(o.duration),
    types, perma: B(o.perma), permaArchive: B(o.permaArchive), notBanned,
    documentStatus: S(o.documentStatus) || "nicht eingetragen",
    pcCheckers: pc,
    timestamps: ts,
    ytSlot: N(o.youtubeConnectionSlot ?? o.ytSlot) || 1,
    result,
    status: S(dc.status ?? o.status) || (complete(base) ? "vollständig" : "unvollständig"),
    family: S(dc.family ?? o.family), note: S(dc.note ?? o.note),
    hasVideo: o.videoStored != null ? B(o.videoStored) : B(o.hasVideo),
    createdAt, updatedAt,
    quality: N(dc.quality ?? o.quality) || quality(base),
    ocrRaw: S(dc.ocrRaw ?? o.ocrRaw) || undefined,
    adminId: S(dc.adminId ?? o.adminId) || undefined,
    videoKey: S(dc.videoKey ?? o.videoKey) || undefined,
  };
  if (!legacyRaw.has(id)) { legacyRaw.set(id, o); if ("finalName" in o || "originalName" in o || "discordId" in o) legacyN++; }
  if (mapKey) mapKeys.set(id, mapKey);
  return e;
}

export function legacyCount(): number { return legacyN; }

/** PovEntry → altes Schema (verlustfrei: Originalfelder bleiben, Zusatzfelder unter "dc"). */
export function denormalizeEntry(e: PovEntry): Raw {
  const raw = legacyRaw.get(e.id) || {};
  const missing: string[] = [];
  if (!e.targetId) missing.push("targetId"); if (!e.reason) missing.push("reason"); if (!e.sc) missing.push("sc"); if (!e.date) missing.push("date");
  const ytOld = O(raw.youtube);
  const out: Raw = {
    ...raw,
    id: e.id,
    originalName: e.origFilename, finalName: e.filename,
    targetId: e.targetId, reason: e.reason, manualResult: e.manualResult,
    sc: e.sc, server: e.server, date: e.date, rid: e.rid,
    types: e.types, perma: e.perma, permaArchive: e.permaArchive, notBanned: e.notBanned,
    documentStatus: e.documentStatus,
    pcCheckers: e.pcCheckers, pcCheckerManual: Array.isArray(raw.pcCheckerManual) ? raw.pcCheckerManual : [],
    discordId: e.discord, proof: e.proof || e.youtubeUrl,
    complete: missing.length === 0, saved: true, videoStored: e.hasVideo, offline: raw.offline ?? false,
    sourceSize: e.filesize, sourceType: e.sourceType || "video/mp4", duration: e.duration,
    timestamps: Object.keys(e.timestamps || {}).length ? e.timestamps : (raw.timestamps ?? {}),
    infoPhotoField: raw.infoPhotoField ?? "banner", missing,
    youtube: e.youtubeId ? { ...ytOld, id: e.youtubeId, url: e.youtubeUrl, sourceSize: e.filesize, sourceType: e.sourceType || "video/mp4" } : raw.youtube,
    youtubeConnectionSlot: e.ytSlot || raw.youtubeConnectionSlot || 1,
    youtubeTitle: e.youtubeTitle || e.filename,
    dc: { createdAt: e.createdAt, updatedAt: e.updatedAt, quality: e.quality, note: e.note, family: e.family, status: e.status, result: e.result, ocrRaw: e.ocrRaw, adminId: e.adminId, videoKey: e.videoKey },
  };
  if (!out.youtube) delete out.youtube;
  return out;
}

// ---------------- Container-Form des META-Keys ----------------

export interface MetaContainer {
  list: unknown[];
  shape: { kind: "array" } | { kind: "wrapped"; key: string; rest: Raw } | { kind: "map" };
  rawText: string | null;
  unparsable: boolean;
  mapKeys: Map<number, string>;
}
const WRAP_KEYS = ["entries", "items", "povs", "list", "data", "records", "archive", "archiv"];

export function parseMetaContainer(rawText: string | null): MetaContainer {
  const base: MetaContainer = { list: [], shape: { kind: "array" }, rawText, unparsable: false, mapKeys: new Map() };
  if (rawText == null || rawText === "") return base;
  let j: unknown;
  try { j = JSON.parse(rawText); } catch { return { ...base, unparsable: true }; }
  if (j == null || j === "" || j === 0 || j === false) return base;
  if (Array.isArray(j)) return { ...base, list: j };
  if (j && typeof j === "object") {
    const o = j as Raw;
    for (const k of WRAP_KEYS) if (Array.isArray(o[k])) { const rest: Raw = { ...o }; delete rest[k]; return { ...base, list: o[k] as unknown[], shape: { kind: "wrapped", key: k, rest } }; }
    const vals = Object.entries(o);
    if (vals.length && vals.every(([, v]) => v && typeof v === "object" && !Array.isArray(v))) {
      const mk = new Map<number, string>(); vals.forEach(([k], i) => mk.set(i, k));
      return { ...base, list: vals.map(([, v]) => v), shape: { kind: "map" }, mapKeys: mk };
    }
    if (vals.length === 0) return base;
  }
  return { ...base, unparsable: true };
}

export function serializeMeta(c: MetaContainer, entries: PovEntry[]): string {
  const payload = entries.map(denormalizeEntry);
  if (c.shape.kind === "array") return JSON.stringify(payload);
  if (c.shape.kind === "wrapped") return JSON.stringify({ ...c.shape.rest, [c.shape.key]: payload });
  const obj: Raw = {}; entries.forEach((e, i) => { obj[mapKeys.get(e.id) || e.id] = payload[i]; });
  return JSON.stringify(obj);
}
