// ============================================================
// Grand RP DC Checker — SERVICES (OCR, YouTube, Drive, ACP)
// 100% kostenlos: Tesseract.js (lokal), YouTube Data API v3,
// Google Drive API, kein eigenes Backend.
// ============================================================
import { createWorker, PSM } from "tesseract.js";
import {
  ACP_BASE, BAN_ADMIN_ID, PovEntry, buildFinalFilename, classifyReason, dateFromFilename,
  entryQuality, getMissing, loadBridgeToken, todayISO,
} from "./core";
import { vaultBackup, vaultRestore, type VaultPayload } from "./vault";

// ---------------- Thumbnails ----------------

export function captureThumbnail(file: Blob, atSec = 1.5): Promise<{ url: string; duration: number; width: number; height: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.src = url;
    v.onloadedmetadata = () => {
      const t = Math.min(Math.max(atSec, 0.3), Math.max((v.duration || 2) - 0.3, 0.5));
      v.currentTime = Number.isFinite(t) ? t : 0.5;
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        const scale = Math.min(1, 480 / (v.videoWidth || 640));
        c.width = Math.max(2, Math.round((v.videoWidth || 640) * scale));
        c.height = Math.max(2, Math.round((v.videoHeight || 360) * scale));
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        const data = c.toDataURL("image/jpeg", 0.72);
        const dur = v.duration || 0;
        URL.revokeObjectURL(url);
        resolve({ url: data, duration: dur, width: c.width, height: c.height });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ url: "", duration: v.duration || 0, width: 0, height: 0 });
      }
    };
    v.onerror = () => { URL.revokeObjectURL(url); resolve({ url: "", duration: 0, width: 0, height: 0 }); };
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch { /* noop */ } resolve({ url: "", duration: 0, width: 0, height: 0 }); }, 9000);
  });
}

function grabFrame(video: HTMLVideoElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = video.videoWidth || 640; c.height = video.videoHeight || 360;
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  return c;
}

function preprocess(canvas: HTMLCanvasElement, mode: string): HTMLCanvasElement {
  const src = canvas.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, canvas.width, canvas.height);
  const out = document.createElement("canvas");
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  const d = ctx.createImageData(canvas.width, canvas.height);
  const px = src.data, od = d.data;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    let v = 0.299 * r + 0.587 * g + 0.114 * b;
    if (mode === "orig") { od[i] = r; od[i + 1] = g; od[i + 2] = b; od[i + 3] = 255; continue; }
    if (mode === "gray") { od[i] = od[i + 1] = od[i + 2] = v; od[i + 3] = 255; continue; }
    if (mode === "thresh") { const t = v > 150 ? 255 : 0; od[i] = od[i + 1] = od[i + 2] = t; od[i + 3] = 255; continue; }
    if (mode === "contrast") { v = Math.min(255, Math.max(0, (v - 128) * 1.9 + 128)); od[i] = od[i + 1] = od[i + 2] = v; od[i + 3] = 255; continue; }
    if (mode === "orange") {
      // orange Maske: Grand RP UI-Orange hervorheben
      const isOrange = r > 150 && g > 80 && g < 200 && b < 110;
      const t = isOrange ? 0 : 255;
      od[i] = od[i + 1] = od[i + 2] = t; od[i + 3] = 255; continue;
    }
    od[i] = od[i + 1] = od[i + 2] = v; od[i + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return out;
}

// Chat-Bereich oben links (dort steht der Bannblock), 2× vergrößert.
// Bewusst schmal/kurz: die Spielerliste rechts und der untere Chat enthalten fremde
// Spieler-IDs, die sonst fälschlich als Ziel-ID erkannt werden.
function cropChat(canvas: HTMLCanvasElement, wFrac = 0.5, hFrac = 0.45): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.round(canvas.width * wFrac);
  out.height = Math.round(canvas.height * hFrac);
  out.getContext("2d")!.drawImage(canvas, 0, 0, out.width, out.height, 0, 0, out.width, out.height);
  const big = document.createElement("canvas");
  big.width = out.width * 2; big.height = out.height * 2;
  const bctx = big.getContext("2d")!;
  bctx.imageSmoothingEnabled = true;
  bctx.drawImage(out, 0, 0, big.width, big.height);
  return big;
}

// ---------------- OCR Parsing (Regeln der alten App) ----------------
//  • Ziel-ID = 1..6 Ziffern NUR aus „hat … [ID] für/fur …“ (Bannblock), niemals Admin-ID / HUD-Zahlen
//  • Grund nur aus der geschlossenen Liste (ALLOWED_REASONS + Aliase)
//  • SC = 40-stelliger Hex-Wert (SocialClub) – sonst leer (kommt aus dem ACP)
//  • Server aus „DE03“-Badge → "3"

// Echter Bannblock im Spiel-Chat (Screenshot):
//   Administrator Adam Byers[15340] ▢ hat Weird Newbie[14920] ▢ für 60 Tage
//   gebannt. Grund: PC-Check Positiv
//   [A] IP: 46.88.96.195 ▢ SC: c3e3850991ad3a4fde764aa5a338545c95a68633
//   [A] Adam Byers[15340] ▢ hat die Social Club ID <hash> gebannt. Grund: Cheats
// Zwischen „]“ und „für“ steht ein OCR-Artefakt (Kästchen) → beliebige Zeichen zulassen.
// Ziel-ID per Punktesystem statt „erster/letzter Treffer“.
// Im Chat stehen viele fremde IDs (Anfragen, Teleports, Admin-Chat, eigene Eingaben),
// deshalb gewinnt die ID mit dem stärksten Bannblock-Bezug bzw. der höchsten Häufigkeit.
function pickTargetId(t: string, banned: Set<string>): string {
  const score = new Map<string, number>();
  const add = (id: string, s: number) => {
    if (!/^\d{1,6}$/.test(id)) return;
    if (banned.has(id) || banned.has(id.replace(/^0+/, ""))) return;   // eigene Admin-ID nie
    score.set(id, (score.get(id) || 0) + s);
  };
  // 1) „[ID] ▢ für 60 Tage gebannt“ — der eigentliche Bannblock
  for (const m of t.matchAll(/\[\s*(\d{1,6})\s*\][^[\]]{0,30}?f[üu]r\s*\d{1,4}\s*(?:Tage?n?|Stunden?|Minuten?)/gi)) add(m[1], 120);
  // 2) „Administrator …[Admin] hat <Name>[ID]“
  for (const m of t.matchAll(/Administrator[^[\]]{0,60}\[\s*\d{1,6}\s*\][^[\]]{0,40}?hat\s+[^[\]]{0,50}\[\s*(\d{1,6})\s*\]/gi)) add(m[1], 100);
  // 3) irgendein „hat …[ID] … gebannt“ (nicht der Social-Club-Bann)
  for (const m of t.matchAll(/hat\s+(?!die\s+social)[^[\]]{0,60}\[\s*(\d{1,6})\s*\][^[\]]{0,45}?gebannt/gi)) add(m[1], 80);
  // 4) Häufigkeit: der geprüfte Spieler taucht im Chat mehrfach auf
  for (const m of t.matchAll(/\[\s*(\d{1,6})\s*\]/g)) add(m[1], 6);
  if (!score.size) return "";
  return [...score.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
}

export function parseOcrText(text: string, adminId: string): Partial<PovEntry> {
  const t = ` ${text.replace(/\s+/g, " ")} `;
  const out: Partial<PovEntry> = {};
  const banned = new Set([adminId, BAN_ADMIN_ID].filter(Boolean));

  const tid = pickTargetId(t, banned);
  if (tid) out.targetId = tid;
  let m: RegExpMatchArray | null;
  // 3) Grund: bevorzugt direkt hinter „gebannt. Grund:“ des Spieler-Banns.
  //    Der Social-Club-Bann („Grund: Cheats“) wird dabei übersprungen.
  let reason = "";
  const gm = t.match(/f[üu]r[^.]{0,40}gebannt\.?\s*Grund\s*[:：]\s*([^\n\r\[]{3,60})/i);
  if (gm) reason = classifyReason(gm[1]) || "";
  if (!reason) {
    const all = [...t.matchAll(/Grund\s*[:：]\s*([^\n\r\[]{3,60})/gi)];
    for (const g of all) {
      if (/social\s*club/i.test(t.slice(Math.max(0, (g.index || 0) - 90), g.index))) continue; // SC-Bann überspringen
      const r = classifyReason(g[1]); if (r) { reason = r; break; }
    }
  }
  if (!reason) reason = classifyReason(t);
  if (reason) out.reason = reason;
  // 4) Server-Badge
  m = t.match(/\bDE\s?0?([1-5])\b/i);
  if (m) out.server = m[1];
  // 5) Datum (TT.MM.JJJJ im HUD unten rechts)
  const dm = t.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dm) out.date = `${dm[3]}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  // 6) SocialClub: bevorzugt „SC: <hash>“, sonst freier 40/32-stelliger Hex-Wert
  m = t.match(/\bSC\s*[:：]?\s*([a-f0-9]{32,40})\b/i) || t.match(/Social\s*Club\s*ID\s*([a-f0-9]{32,40})\b/i)
    || t.match(/\b([a-f0-9]{40})\b/i) || t.match(/\b([a-f0-9]{32})\b/i);
  if (m) out.sc = m[1].toLowerCase();
  // 7) Discord-ID
  m = t.match(/discord\s*[:#]?\s*(\d{15,22})/i);
  if (m && m[1] !== out.targetId) out.discord = m[1];
  return out;
}

function voteConsensus(variants: Partial<PovEntry>[]): Partial<PovEntry> {
  const pick = (key: keyof PovEntry): string | undefined => {
    const freq = new Map<string, number>();
    for (const v of variants) {
      const val = String((v as Record<string, unknown>)[key as string] || "").trim();
      if (!val) continue;
      freq.set(val, (freq.get(val) || 0) + 1);
    }
    if (!freq.size) return undefined;
    return [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const out: Partial<PovEntry> = {};
  for (const k of ["targetId", "reason", "server", "date", "sc", "discord"] as const) {
    const v = pick(k);
    if (v) (out as Record<string, string>)[k] = v;
  }
  return out;
}

// Dateiname: „2026-09-07 00-53-42.mp4“ → Datum · „172718, PC-Check Verweigerung, 07.09.2026.mp4“ → ID/Grund/Datum
export function parseFileName(name: string, adminId: string): Partial<PovEntry> {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const out: Partial<PovEntry> = {};
  const d = dateFromFilename(base);
  if (d) out.date = d;
  const parts = base.split(",").map((s) => s.trim());
  if (parts.length >= 2 && /^\d{1,8}$/.test(parts[0]) && parts[0] !== adminId && parts[0] !== BAN_ADMIN_ID) {
    out.targetId = parts[0];
    const r = classifyReason(parts[1]) || parts[1];
    if (r) out.reason = r;
  }
  const sm = base.match(/\bDE\s?0?([1-5])\b/i);
  if (sm) out.server = sm[1];
  return out;
}

export interface OcrProgress { frame: number; frames: number; variant: string; text: string; }
export interface OcrOutcome { data: Partial<PovEntry>; raw: string; votes: string[]; timestamps: Record<string, number>; }

export async function runOcrOnFile(
  file: Blob, fileName: string, adminId: string,
  frameCount: number, lang: string,
  onProgress: (p: OcrProgress) => void,
): Promise<OcrOutcome> {
  const votes: Partial<PovEntry>[] = [];
  const perFrame: Array<{ t: number; v: Partial<PovEntry> }> = [];
  const rawTexts: string[] = [];
  votes.push(parseFileName(fileName, adminId)); // Stimme 1: Dateiname (Datum!)

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true; video.preload = "auto"; video.src = url;
  await new Promise<void>((res) => { video.onloadedmetadata = () => res(); video.onerror = () => res(); setTimeout(() => res(), 8000); });
  const dur = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 10;

  // Priorität: letzte 5 Sekunden (Bannblock), danach grobe Abtastung
  const n = Math.max(3, Math.min(12, frameCount || 8));
  const late = [0.4, 1.3, 2.3, 3.4, 4.8].slice(0, Math.min(5, n - 1)).map((s) => Math.max(0.2, dur - s));
  const coarseN = Math.max(1, n - late.length);
  const coarse = Array.from({ length: coarseN }, (_, i) => dur * ((i + 1) / (coarseN + 1)));
  const times = [...late, ...coarse];

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try { worker = await createWorker(lang || "deu+eng"); } catch { worker = null; }

  const MODES: Array<{ mode: string; psm: PSM }> = [
    { mode: "contrast", psm: PSM.SPARSE_TEXT },
    { mode: "gray", psm: PSM.AUTO },
    { mode: "thresh", psm: PSM.SINGLE_BLOCK },
    { mode: "orig", psm: PSM.SPARSE_TEXT },
    { mode: "orange", psm: PSM.SPARSE_TEXT },
  ];

  if (worker && video.videoWidth > 0) {
    try {
      for (let fi = 0; fi < times.length; fi++) {
        await new Promise<void>((res) => {
          const to = setTimeout(() => res(), 2500);
          video.onseeked = () => { clearTimeout(to); res(); };
          try { video.currentTime = times[fi]; } catch { clearTimeout(to); res(); }
        });
        await new Promise((r) => setTimeout(r, 100));
        let frame: HTMLCanvasElement;
        try { frame = cropChat(grabFrame(video)); } catch { continue; }
        const variants = fi < late.length ? [MODES[0], MODES[fi % 2 + 1]] : [MODES[fi % MODES.length]];
        for (const v of variants) {
          try {
            const pre = preprocess(frame, v.mode);
            await worker.setParameters({ tessedit_pageseg_mode: v.psm as unknown as PSM });
            const { data } = await worker.recognize(pre);
            const text = (data.text || "").trim();
            if (text.length > 2) {
              const parsed = parseOcrText(text, adminId);
              rawTexts.push(`[${times[fi].toFixed(1)}s/${v.mode}] ${text.slice(0, 400)}`);
              votes.push(parsed); perFrame.push({ t: times[fi], v: parsed });
              onProgress({ frame: fi + 1, frames: times.length, variant: v.mode, text: text.slice(0, 220) });
            }
          } catch { /* Variante überspringen */ }
        }
      }
    } catch { /* OCR-Fehler → Fallback */ }
    try { await worker.terminate(); } catch { /* noop */ }
  }
  try { URL.revokeObjectURL(url); } catch { /* noop */ }

  const consensus = voteConsensus(votes);
  if (!consensus.date) consensus.date = dateFromFilename(fileName) || todayISO();
  // Zeitstempel: erster Frame (späteste zuerst), dessen Wert dem Konsens entspricht
  const timestamps: Record<string, number> = {};
  const at = (k: keyof PovEntry): number | undefined => perFrame.find((f) => f.v[k] && f.v[k] === consensus[k])?.t;
  const tId = at("targetId"), tR = at("reason"), tSc = at("sc");
  if (tId != null) timestamps.targetId = +tId.toFixed(2);
  if (tR != null) timestamps.reason = +tR.toFixed(2);
  if (tSc != null) timestamps.sc = +tSc.toFixed(2);
  const banner = perFrame.find((f) => f.v.targetId === consensus.targetId && f.v.reason === consensus.reason)?.t ?? tId ?? tR ?? Math.max(0.2, dur - 2);
  timestamps.banner = +banner.toFixed(2);
  timestamps.pcCheck = +(dur / 2).toFixed(2);
  return { data: consensus, raw: rawTexts.join("\n"), votes: rawTexts, timestamps };
}

// ---------------- YouTube (3 Verbindungen) ----------------

export interface YtProgress { percent: number; status: string; }

function fakeVideoId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let s = "";
  const arr = crypto.getRandomValues(new Uint8Array(11));
  for (const b of arr) s += chars[b % 64];
  return s;
}

// Simuliert resumable Upload in Chunks (liest echte Datei-Slices → Fortschritt real),
// nutzt echte YouTube Data API, falls Token vorhanden, sonst Offline-Simulation.
// Quota/Limit eines Kanals erschöpft → App wechselt zum nächsten Slot
export class YtQuotaError extends Error {
  constructor(msg: string) { super(msg); this.name = "YtQuotaError"; }
}
function isQuotaText(t: string): boolean {
  return /quotaExceeded|uploadLimitExceeded|numberOfItemsInPlaylist|dailyLimitExceeded|rateLimitExceeded|userRequestsExceeded/i.test(t);
}

export async function youtubeUpload(
  file: Blob, title: string, slot: number, accessToken: string,
  onProgress: (p: YtProgress) => void, signal?: AbortSignal,
): Promise<{ videoId: string; url: string; simulated: boolean }> {
  const CHUNK = 4 * 1024 * 1024;
  const total = file.size || 1;
  let uploaded = 0;
  const pct = () => Math.round((uploaded / total) * 100);
  onProgress({ percent: 0, status: `Kanal ${slot + 1} · Upload startet (unlisted)…` });

  if (accessToken) {
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": file.type || "video/*", "X-Upload-Content-Length": String(total) },
      body: JSON.stringify({
        snippet: { title: title.slice(0, 100), description: "Grand RP POV — DC Checker", categoryId: "22" },
        status: { privacyStatus: "unlisted", selfDeclaredMadeForKids: false },
      }),
    }).catch((e) => { throw new Error(`Netzwerkfehler beim Upload-Start: ${e instanceof Error ? e.message : String(e)}`); });

    if (!init.ok) {
      const txt = await init.text().catch(() => "");
      if (init.status === 401 || init.status === 403) {
        if (isQuotaText(txt) || init.status === 403) throw new YtQuotaError(`Kanal ${slot + 1}: Limit/Quota erreicht oder Zugriff abgelaufen (${init.status}).`);
      }
      throw new Error(`Upload-Start fehlgeschlagen (${init.status}). ${txt.slice(0, 160)}`);
    }
    const sessionUrl = init.headers.get("Location") || "";
    if (!sessionUrl.startsWith("http")) throw new Error("YouTube hat keine Upload-Adresse geliefert (Location-Header fehlt).");

    while (uploaded < total) {
      if (signal?.aborted) throw new Error("abgebrochen");
      const end = Math.min(uploaded + CHUNK, total);
      const put = await fetch(sessionUrl, {
        method: "PUT",
        headers: { "Content-Range": `bytes ${uploaded}-${end - 1}/${total}`, "Content-Type": file.type || "video/*" },
        body: file.slice(uploaded, end),
      }).catch((e) => { throw new Error(`Netzwerkfehler beim Upload: ${e instanceof Error ? e.message : String(e)}`); });

      if (put.status === 200 || put.status === 201) {
        uploaded = total;
        onProgress({ percent: 100, status: `Kanal ${slot + 1} · Upload 100 %` });
        const data = await put.json();
        return { videoId: data.id as string, url: `https://youtu.be/${data.id}`, simulated: false };
      }
      if (put.status === 308) {
        // Server bestätigt den Fortschritt über Range; sonst lokal weiterzählen
        const range = put.headers.get("Range");
        const m = range && range.match(/bytes=0-(\d+)/);
        uploaded = m ? parseInt(m[1], 10) + 1 : end;
        onProgress({ percent: pct(), status: `Kanal ${slot + 1} · Upload ${pct()} %` });
        continue;
      }
      const txt = await put.text().catch(() => "");
      if (put.status === 403 || isQuotaText(txt)) throw new YtQuotaError(`Kanal ${slot + 1}: Upload-Limit erreicht.`);
      throw new Error(`Upload abgebrochen (${put.status}). ${txt.slice(0, 160)}`);
    }
    throw new Error("Upload unvollständig beendet.");
  }

  // Ohne Verbindung: Simulation (kein echtes Video auf YouTube)
  while (uploaded < total) {
    if (signal?.aborted) throw new Error("abgebrochen");
    await new Promise((r) => setTimeout(r, 60));
    try { await file.slice(uploaded, Math.min(uploaded + CHUNK, total)).arrayBuffer(); } catch { /* noop */ }
    uploaded = Math.min(total, uploaded + CHUNK + Math.floor(Math.random() * CHUNK));
    onProgress({ percent: pct(), status: `Simulation · Upload ${pct()} %` });
  }
  const vid = fakeVideoId();
  return { videoId: vid, url: `https://youtu.be/${vid}`, simulated: true };
}

// YouTube kann Stunden „processing“ melden. Die POV ist aber sofort gespeichert und
// OCR läuft ohnehin auf der lokalen Datei — deshalb wird nur kurz gewartet (Zeitlimit).
const PROCESS_WAIT_MS = 45_000;

export async function youtubeWaitProcessing(
  videoId: string, accessToken: string, simulated: boolean,
  onStatus: (s: string) => void, signal?: AbortSignal,
): Promise<"succeeded" | "failed" | "processing"> {
  if (!accessToken || simulated) {
    for (const s of ["uploaded", "processing", "succeeded"]) {
      if (signal?.aborted) throw new Error("abgebrochen");
      onStatus(s);
      await new Promise((r) => setTimeout(r, 600));
    }
    return "succeeded";
  }
  const until = Date.now() + PROCESS_WAIT_MS;
  let last = "uploaded";
  while (Date.now() < until) {
    if (signal?.aborted) throw new Error("abgebrochen");
    try {
      const r = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status&id=${videoId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (r.ok) {
        const j = await r.json();
        const it = j.items?.[0];
        const st = it?.processingDetails?.processingStatus || "processing";
        const up = it?.status?.uploadStatus || "";
        last = st;
        if (st === "succeeded" || up === "processed") { onStatus("succeeded"); return "succeeded"; }
        if (st === "failed" || st === "terminated" || up === "failed" || up === "rejected") { onStatus("failed"); return "failed"; }
        const left = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        onStatus(`${st} · noch ${left} s`);
      }
    } catch { /* Netz kurz weg — weiter versuchen */ }
    await new Promise((r) => setTimeout(r, 4000));
  }
  // Zeitlimit: Video ist hochgeladen, YouTube rechnet im Hintergrund weiter
  onStatus(last === "succeeded" ? "succeeded" : "hochgeladen · YouTube verarbeitet weiter");
  return "processing";
}

// Einzelbild an einer bestimmten Sekunde (Bannscreen-Foto)
export function captureFrameAt(file: Blob, atSec: number, maxW = 1280): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    let done = false;
    const finish = (d: string) => { if (done) return; done = true; try { URL.revokeObjectURL(url); } catch { /* egal */ } resolve(d); };
    v.muted = true; v.preload = "auto"; v.src = url;
    v.onloadedmetadata = () => {
      const dur = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
      const t = dur ? Math.min(Math.max(atSec, 0.1), Math.max(dur - 0.15, 0.1)) : Math.max(atSec, 0.1);
      try { v.currentTime = t; } catch { finish(""); }
    };
    v.onseeked = () => {
      try {
        const c = document.createElement("canvas");
        const scale = Math.min(1, maxW / (v.videoWidth || maxW));
        c.width = Math.max(2, Math.round((v.videoWidth || 1280) * scale));
        c.height = Math.max(2, Math.round((v.videoHeight || 720) * scale));
        c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
        finish(c.toDataURL("image/jpeg", 0.85));
      } catch { finish(""); }
    };
    v.onerror = () => finish("");
    setTimeout(() => finish(""), 10000);
  });
}

export async function youtubeSetTitle(videoId: string, title: string, accessToken: string): Promise<boolean> {
  if (!accessToken) return true; // Simulation: ok
  try {
    const g = await fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!g.ok) return false;
    const j = await g.json();
    const snip = j.items?.[0]?.snippet;
    if (!snip) return false;
    snip.title = title.slice(0, 100);
    const u = await fetch("https://www.googleapis.com/youtube/v3/videos?part=snippet", {
      method: "PUT",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: videoId, snippet: snip }),
    });
    return u.ok;
  } catch { return false; }
}

// ---------------- Google Drive / Tresor (AES-256, delegiert an vault.ts) ----------------

export async function driveBackup(reason: string): Promise<{ ok: boolean; msg: string; localOnly?: boolean }> {
  return vaultBackup(reason);
}

export async function driveRestore(): Promise<{ ok: boolean; msg: string; entries?: unknown[]; deleted?: string[]; youtubeConnections?: VaultPayload["youtubeConnections"] }> {
  return vaultRestore();
}

export function downloadLocalBackup(): void {
  if (!window.confirm("Klartext-JSON enthält alle POV-Daten unverschlüsselt. Nur auf einem sicheren PC speichern. Fortfahren?")) return;
  const payload = {
    version: 42,
    at: Date.now(),
    entries: JSON.parse(localStorage.getItem("grandrp_pov_meta_v42") || "[]"),
    deleted: JSON.parse(localStorage.getItem("grandrp_deleted_v42") || "[]"),
  };
  const blob = new Blob([JSON.stringify(payload, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `grandrp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------------- Google OAuth (GIS, kostenlos) ----------------

declare global { interface Window { google?: { accounts: { oauth2: { initTokenClient: (c: Record<string, unknown>) => { requestAccessToken: (opts?: Record<string, unknown>) => void } } } } } }

export function loadGIS(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS konnte nicht geladen werden"));
    document.head.appendChild(s);
  });
}

// YouTube und Drive dürfen NICHT in einem Request stehen (Google Error 400 invalid_request).
// include_granted_scopes muss false sein, sonst hängt GIS zuvor erteilte Scopes (Drive + YouTube) zusammen.
export const YT_SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];
export const DRIVE_SCOPES = ["https://www.googleapis.com/auth/drive.file"];

export async function googleConnect(clientId: string, scopes: string[]): Promise<{ token: string; expiry: number }> {
  await loadGIS();
  if (!window.google) throw new Error("Google Identity Services nicht verfügbar");
  const unique = [...new Set(scopes.filter(Boolean))];
  if (unique.length === 0) throw new Error("Keine OAuth-Berechtigung angegeben.");
  const hasYt = unique.some((s) => s.includes("/auth/youtube"));
  const hasDrive = unique.some((s) => s.includes("/auth/drive"));
  if (hasYt && hasDrive) throw new Error("YouTube und Drive müssen getrennt verbunden werden.");
  return new Promise((resolve, reject) => {
    try {
      const client = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: unique.join(" "),
        include_granted_scopes: false,
        prompt: "consent",
        callback: (resp: { access_token?: string; expires_in?: number; error?: string; error_description?: string }) => {
          if (resp.error || !resp.access_token) reject(new Error(resp.error_description || resp.error || "OAuth abgebrochen"));
          else resolve({ token: resp.access_token, expiry: Date.now() + (resp.expires_in || 3600) * 1000 });
        },
      });
      client.requestAccessToken();
    } catch (e) { reject(e instanceof Error ? e : new Error(String(e))); }
  });
}

// ---------------- ACP / Extension Bridge ----------------

// Authorization-Logs: SocialClub-Hash (40 hex) — Filter läuft über "characterid"
export function acpAuthUrl(targetId: string, server = "3"): string {
  const t = loadBridgeToken();
  return `${ACP_BASE}/de/${server}/logs/authorization?nick=&characterid=${encodeURIComponent(targetId)}`
    + `&ip=&socialname=&socialid=&date=&subdate=&dc_id=${encodeURIComponent(targetId)}&dc_bridge=${encodeURIComponent(t)}`;
}
// Character-Info: roter Kasten mit „Reason: …“ + SocialClub-Name/ID
export function acpInfoUrl(targetId: string, server = "3"): string {
  const t = loadBridgeToken();
  return `${ACP_BASE}/de/${server}/character/info/${encodeURIComponent(targetId)}`
    + `?dc_id=${encodeURIComponent(targetId)}&dc_bridge=${encodeURIComponent(t)}&dc_stage=info`;
}

// WICHTIG: KEIN "noopener" — sonst ist window.opener im ACP-Tab null und die
// direkte Rückmeldung (Extension ODER Lesezeichen) kann nichts zurücksenden.
let acpWin: Window | null = null;
function openAcp(url: string): Window | null {
  try { if (acpWin && !acpWin.closed) acpWin.close(); } catch { /* egal */ }
  acpWin = window.open(url, "grandrp_acp");   // benannt + mit opener
  if (!acpWin) return null;
  try { acpWin.focus(); } catch { /* egal */ }
  return acpWin;
}
// Zweistufig: erst Authorization (SC), danach springt die Extension selbst zur
// Character-Info und liest dort den BannGrund (kein zweites Pop-up nötig).
export function openAcpForId(targetId: string, server = "3"): Window | null {
  return openAcp(acpAuthUrl(targetId, server));
}
export function openAcpInfo(targetId: string, server = "3"): Window | null {
  return openAcp(acpInfoUrl(targetId, server));
}

// Lesezeichen-Variante: funktioniert OHNE Extension. Erkennt selbst, ob die Seite
// SocialClub (Authorization-Logs) oder BannGrund (Character-Info) zeigt.
export function bridgeBookmarklet(): string {
  const t = loadBridgeToken();
  const code = `(function(){try{var T=${JSON.stringify(t)};var b=(document.body&&document.body.innerText)||"";` +
    `var id="";try{id=new URL(location.href).searchParams.get("dc_id")||"";}catch(e){}` +
    `if(!id){var p=location.pathname.match(/\\/character\\/info\\/(\\d+)/);if(p)id=p[1];}` +
    `var r=b.match(/Reason\\s*:\\s*([^\\n\\r]+)/i);var m=b.match(/\\b([a-f0-9]{40})\\b/i)||b.match(/\\b([a-f0-9]{32})\\b/i);var msg=null,info="";` +
    `if(m){msg={source:"GRANDRP_ACP_BRIDGE",bridgeToken:T,type:"SC_RESULT",targetId:id,sc:m[1],reason:r?r[1].trim():""};info="SC "+m[1];}` +
    `else if(r){msg={source:"GRANDRP_ACP_BRIDGE",bridgeToken:T,type:"REASON_RESULT",targetId:id,reason:r[1].trim(),rawReason:r[1].trim()};info="Grund "+r[1].trim();}` +
    `else{var v=window.prompt("Nichts gefunden - SocialClub oder Grund einfuegen:","");if(!v)return;` +
    `msg=/^[a-f0-9]{32,40}$/i.test(v)?{source:"GRANDRP_ACP_BRIDGE",bridgeToken:T,type:"SC_RESULT",targetId:id,sc:v}:{source:"GRANDRP_ACP_BRIDGE",bridgeToken:T,type:"REASON_RESULT",targetId:id,reason:v,rawReason:v};info=v;}` +
    `var ok=false;try{if(window.opener&&!window.opener.closed){window.opener.postMessage(msg,"*");ok=true;}}catch(e){}` +
    `if(!ok){try{navigator.clipboard.writeText(info);}catch(e){}}` +
    `alert(ok?("An DC Checker gesendet:\\n"+info):("Kein Checker-Tab gefunden.\\nKopiert:\\n"+info));}catch(e){alert("Fehler: "+e.message);}})()`;
  return "javascript:" + encodeURIComponent(code);
}

export type AcpMessage =
  | { source: "GRANDRP_ACP_BRIDGE"; bridgeToken: string; type: "SC_RESULT"; targetId: string; sc: string; nickname?: string; reason?: string }
  | { source: "GRANDRP_ACP_BRIDGE"; bridgeToken: string; type: "REASON_RESULT"; targetId: string; reason: string; rawReason: string; admin?: string; banDate?: string; socialName?: string; socialId?: string }
  | { source: "GRANDRP_ACP_BRIDGE"; bridgeToken: string; type: "PING" };

export interface BridgeDiag { ext: boolean; extVersion: string; lastAt: number; lastMsg: string; rejected: number; }
const diag: BridgeDiag = { ext: false, extVersion: "", lastAt: 0, lastMsg: "", rejected: 0 };
export function bridgeDiag(): BridgeDiag { return { ...diag }; }

export function installAcpListener(onMsg: (m: AcpMessage) => void): () => void {
  const handler = (ev: MessageEvent) => {
    const d = ev.data as Omit<Partial<AcpMessage>, "source"> & { source?: string; version?: string };
    if (!d || typeof d !== "object") return;
    // Anwesenheitsmeldung der Extension (ohne Daten, daher ohne Token)
    if (d.source === "GRANDRP_ACP_BRIDGE_PRESENT") { diag.ext = true; diag.extVersion = String(d.version || ""); return; }
    if (d.source !== "GRANDRP_ACP_BRIDGE") return;
    if (d.bridgeToken !== loadBridgeToken()) { diag.rejected++; return; } // fremde Nachricht ablehnen
    diag.lastAt = Date.now();
    diag.lastMsg = JSON.stringify(d).slice(0, 200);
    onMsg(d as AcpMessage);
  };
  window.addEventListener("message", handler);
  return () => window.removeEventListener("message", handler);
}

// ---------------- Extension-Dateien (Download, kostenlos) ----------------

export function extensionFiles(bridgeToken: string): Record<string, string> {
  const manifest = JSON.stringify({
    manifest_version: 3,
    name: "GrandRP ACP Bridge — DC Checker",
    version: "1.4.2",
    description: "Liest SC/RID aus dem Grand RP Admin Panel und sendet sie an den DC Checker.",
    permissions: ["tabs", "storage", "scripting"],
    host_permissions: ["https://admin.gta5grand.com/*"],
    background: { service_worker: "background.js" },
    content_scripts: [{ matches: ["https://admin.gta5grand.com/de/*"], js: ["website-bridge.js", "content.js"], run_at: "document_idle" }],
  }, null, 2);

  const background = `// GrandRP ACP Bridge — background.js (MV3)\nconst BRIDGE = "GRANDRP_ACP_BRIDGE";\nchrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {\n  if (!msg || msg.source !== BRIDGE) return false;\n  // an alle DC-Checker-Tabs weiterleiten\n  chrome.tabs.query({}, (tabs) => {\n    for (const t of tabs) {\n      if (t.id && sender.tab && t.id !== sender.tab.id) {\n        chrome.tabs.sendMessage(t.id, msg).catch(() => {});\n      }\n    }\n  });\n  sendResponse({ ok: true });\n  return true;\n});\n`;

  const bridge = `// website-bridge.js — verbindet ACP mit DC Checker (postMessage, Token-geschützt)\n(function () {\n  const BRIDGE = "GRANDRP_ACP_BRIDGE";\n  function token() {\n    try {\n      const u = new URL(location.href);\n      return u.searchParams.get("dc_bridge") || sessionStorage.getItem("dc_bridge") || "";\n    } catch { return ""; }\n  }\n  window.__DC_SEND = function (payload) {\n    const msg = Object.assign({ source: BRIDGE, bridgeToken: token() }, payload);\n    window.postMessage(msg, "*");\n    try { chrome.runtime.sendMessage(msg).catch(() => {}); } catch {}\n  };\n  try {\n    const u = new URL(location.href);\n    const t = u.searchParams.get("dc_bridge");\n    if (t) sessionStorage.setItem("dc_bridge", t);\n  } catch {}\n})();\n`;

  const content = `// content.js — läuft auf admin.gta5grand.com/de/*\n(function () {\n  "use strict";\n  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));\n  function findSC() {\n    const body = document.body ? document.body.innerText : "";\n    let m = body.match(/\\b([a-f0-9]{32})\\b/i);\n    if (m) return m[1];\n    m = body.match(/Social\\s*Club\\s*[:#]?\\s*([A-Za-z0-9_.-]{3,40})/i);\n    if (m) return m[1];\n    const el = document.querySelector("[data-sc], [data-socialclub]");\n    if (el) return el.getAttribute("data-sc") || el.getAttribute("data-socialclub") || "";\n    return "";\n  }\n  function targetId() {\n    try { return new URL(location.href).searchParams.get("dc_id") || ""; } catch { return ""; }\n  }\n  async function scan() {\n    for (let i = 0; i < 20; i++) {\n      const sc = findSC();\n      if (sc && window.__DC_SEND) {\n        window.__DC_SEND({ type: "SC_RESULT", targetId: targetId(), sc });\n        badge("SC übernommen ✓");\n        return;\n      }\n      await sleep(1000);\n    }\n  }\n  function badge(text) {\n    let b = document.getElementById("dc-acp-badge");\n    if (!b) {\n      b = document.createElement("div");\n      b.id = "dc-acp-badge";\n      b.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:999999;background:#f59e0b;color:#111;padding:10px 14px;border-radius:10px;font-weight:700;font-family:sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.4)";\n      document.body.appendChild(b);\n    }\n    b.textContent = "DC Checker · " + text;\n  }\n  function addButton() {\n    if (document.getElementById("dc-sc-btn")) return;\n    const btn = document.createElement("button");\n    btn.id = "dc-sc-btn";\n    btn.textContent = "🔎 SocialClub";\n    btn.style.cssText = "position:fixed;top:70px;right:16px;z-index:999999;background:#f59e0b;color:#111;border:0;padding:10px 16px;border-radius:10px;font-weight:800;cursor:pointer;font-family:sans-serif;";\n    btn.onclick = () => { const sc = findSC(); if (sc && window.__DC_SEND) { window.__DC_SEND({ type: "SC_RESULT", targetId: targetId(), sc }); badge("SC gesendet ✓"); } else badge("keine SC gefunden"); };\n    document.body.appendChild(btn);\n  }\n  // SocialClub-Checker-Ergebnisse auf SC-Logseite auslesen\n  function scanScPage() {\n    try {\n      const u = new URL(location.href);\n      const want = (u.searchParams.get("dc_sc") || "").toLowerCase();\n      if (!want || !location.href.includes("socialclub")) return;\n      const rows = [...document.querySelectorAll("table tbody tr")];\n      const text = document.body.innerText || "";\n      const nick = (text.match(/Nickname\\s*[:#]?\\s*(\\S+)/i) || [])[1] || "";\n      const charId = (text.match(/(?:Character\\s*ID|Char\\s*ID|ID)\\s*[:#]?\\s*(\\d{3,8})/i) || [])[1] || "";\n      const logins = parseInt((text.match(/Total\\s*Logins\\s*[:#]?\\s*(\\d+)/i) || [])[1] || "0", 10) || rows.length;\n      const socban = /SOCBAN/i.test(text);\n      const ban = /\\bBAN\\b/i.test(text);\n      if (window.__DC_SEND) window.__DC_SEND({ type: "SC_CHECK_RESULT", sc: u.searchParams.get("dc_sc"), nickname: nick, charId, logins, socban, ban, server: u.pathname.split("/")[2] || "3" });\n    } catch {}\n  }\n  window.addEventListener("load", () => { addButton(); scan(); setTimeout(scanScPage, 2500); });\n  setTimeout(() => { addButton(); scan(); scanScPage(); }, 1500);\n})();\n`;

  const readme = `# GrandRP ACP Bridge — Installation\n\n1. Ordner \`acp-extension\` erstellen und alle 5 Dateien hineinlegen.\n2. Chrome/Edge: \`chrome://extensions\` → Entwicklermodus → „Entpackte Erweiterung laden“.\n3. Grand RP Admin Panel öffnen: https://admin.gta5grand.com/\n4. Im DC Checker: Bridge-Token (Einstellungen) = \`${bridgeToken.slice(0, 12)}…\` — wird automatisch per URL übergeben.\n5. Aus dem DC Checker „SC auslesen“ klicken → ACP-Tab öffnet sich → SC wird automatisch übernommen.\n\nKostenlos, keine Server, Token-geschützt (bridgeToken).\n`;

  return {
    "manifest.json": manifest,
    "background.js": background,
    "website-bridge.js": bridge,
    "content.js": content,
    "README.md": readme,
  };
}

export async function downloadExtension(): Promise<void> {
  // Die echten Dateien liegen im Ordner ACP-Browser-Extension/ neben index.html
  const names = ["manifest.json", "background.js", "content.js", "website-bridge.js", "dc-receiver.js", "README.md"];
  for (const n of names) {
    try {
      const r = await fetch(`ACP-Browser-Extension/${n}`);
      if (!r.ok) continue;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(await r.blob());
      a.download = n;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      await new Promise((res) => setTimeout(res, 350));
    } catch { /* Datei überspringen */ }
  }
}

// ---------------- Finale Helfer ----------------

export function finalizeEntryData(partial: Partial<PovEntry>, fallbackName: string): { filename: string; quality: number; missing: string[] } {
  const filename = buildFinalFilename({ ...partial, date: partial.date || todayISO() });
  void fallbackName;
  return { filename, quality: entryQuality(partial), missing: getMissing(partial) };
}
