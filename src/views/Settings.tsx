import { useState } from "react";
import { CloudDownload, CloudUpload, Copy, Download, ExternalLink, HardDrive, KeyRound, Plus, PlugZap, Trash2, Upload, User, Users, Video, Zap } from "lucide-react";
import {
  APP_VERSION, AppSettings, DB_NAME, DriveConfig, META_KEY, PC_CHECKER_LEAD, PC_CHECKER_POOL, PovEntry, SERVERS, STORE, YTConnection,
  adoptYtConnections, loadAllRecords, loadCustomCheckers, loadDeleted, loadMeta, loadUsers, mergeEntries, metaDiagnostics, saveCustomCheckers, saveDeleted, saveUsers, serverLabel, sha256, uid,
} from "../lib/core";
import { downloadExtension, downloadLocalBackup, driveBackup, driveRestore, googleConnect, YT_SCOPES, DRIVE_SCOPES } from "../lib/services";
import { downloadEncryptedVault, importEncryptedFile } from "../lib/vault";
import { Badge, CodeBox, Field, Mini, Push, btnDanger, btnGhost, btnPrimary, inputCls } from "../ui";
import { PwForm } from "./Modals";

export interface SettingsProps {
  settings: AppSettings; setSettings: (s: AppSettings) => void;
  ytConns: YTConnection[]; setYtConns: (c: YTConnection[]) => void;
  drive: DriveConfig; setDrive: (d: DriveConfig) => void;
  entries: PovEntry[]; setEntries: (e: PovEntry[]) => void;
  push: Push; driveMsg: string; setDriveMsg: (s: string) => void; bridgeToken: string;
  onChangePassword: (u: string, oldPw: string, newPw: string) => Promise<string>;
  username: string; onPoolChanged: () => void;
}

export default function SettingsView(props: SettingsProps) {
  const { settings, setSettings, ytConns, setYtConns, drive, setDrive, push } = props;
  const [tab, setTab] = useState("allgemein");
  const [busy, setBusy] = useState("");
  const [newUser, setNewUser] = useState({ u: "", p: "" });
  const [users, setUsers] = useState(() => loadUsers());
  const [pwOpen, setPwOpen] = useState(false);
  const [custom, setCustom] = useState(() => loadCustomCheckers());
  const [newChecker, setNewChecker] = useState("");

  const patchYt = (slot: number, patch: Partial<YTConnection>) => setYtConns(ytConns.map((y) => y.slot === slot ? { ...y, ...patch } : y));
  const ytConnect = async (slot: number) => {
    const cid = ytConns[slot].clientId || settings.googleClientId;
    if (!cid) { push("err", "Bitte zuerst Google Client-ID eintragen (kostenlos in der Google Cloud Console)."); return; }
    setBusy("yt" + slot);
    try {
      const { token, expiry } = await googleConnect(cid, YT_SCOPES);
      patchYt(slot, { accessToken: token, expiry });
      push("ok", `YouTube-Verbindung ${slot + 1} verbunden. Uploads laufen als unlisted.`);
    } catch (e) { push("err", `YouTube-Login fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(""); }
  };
  const driveConnect = async () => {
    const cid = drive.clientId || settings.googleClientId || ytConns.find((y) => y.clientId)?.clientId || "";
    if (!cid) { push("err", "Bitte zuerst Google Client-ID eintragen."); return; }
    setBusy("drive");
    try {
      const { token, expiry } = await googleConnect(cid, DRIVE_SCOPES);
      setDrive({ ...drive, connected: true, accessToken: token, expiry, clientId: cid });
      push("ok", "Google Drive verbunden — verschlüsselte Backups laufen automatisch nach jeder Änderung.");
    } catch (e) { push("err", `Drive-Login fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setBusy(""); }
  };
  const importPayload = (payload: { entries: unknown[]; deleted?: string[]; youtubeConnections?: unknown }, label: string) => {
    if (payload.deleted?.length) saveDeleted([...new Set([...loadDeleted(), ...payload.deleted])]);
    const merged = mergeEntries(props.entries, payload.entries || []);
    props.setEntries(merged);
    const yt = adoptYtConnections(payload.youtubeConnections);
    if (yt) setYtConns([...ytConns.map((y, i) => ({ ...y, clientId: y.clientId || (payload.youtubeConnections as Array<{ slot: number; clientId: string }>).find((c) => c.slot === i + 1)?.clientId || "" }))]);
    push("ok", `${label}: ${(payload.entries || []).length} Einträge → ${merged.length} gesamt (vereinigt, nichts überschrieben)${yt ? ` · ${yt} YouTube-Client-ID(s) übernommen` : ""}.`);
  };

  const tabs = [
    { id: "allgemein", label: "Allgemein & OCR" }, { id: "checker", label: "PC-Checker" }, { id: "youtube", label: "YouTube ×3" },
    { id: "drive", label: "Tresor / anderer PC" }, { id: "acp", label: "ACP / Extension" }, { id: "daten", label: "Daten & Backup" },
    { id: "install", label: "Installation" }, { id: "benutzer", label: "Benutzer" }, { id: "info", label: "Anleitung" },
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <div className="space-y-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${tab === t.id ? "bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30" : "text-slate-300 hover:bg-white/5"}`}>{t.label}</button>
        ))}
        <div className="mt-3 rounded-xl border border-white/10 bg-white/[.02] p-3 text-[11px] text-slate-400">
          <p className="font-bold text-slate-200">{APP_VERSION} · kostenlos</p>
          <p className="mt-1 break-all font-mono">META: {META_KEY}</p>
          <p className="break-all font-mono">DB: {DB_NAME} / {STORE}</p>
          <p className="mt-1">Kompatibel mit der alten App (V153): gleiche Keys, gleiches Datenformat.</p>
        </div>
      </div>

      <div className="min-w-0 rounded-2xl border border-white/10 bg-[#101830] p-5">
        {tab === "allgemein" && (
          <div className="grid max-w-2xl gap-4">
            <h3 className="font-black">Allgemein & OCR</h3>
            <Field label="Eigene Admin-ID (wird NIEMALS als Ziel-ID erkannt)" hint={`Bannblock: „${PC_CHECKER_LEAD} [${settings.adminId || "15340"}] hat … [Ziel-ID] für …“`}>
              <input className={inputCls} value={settings.adminId} onChange={(e) => setSettings({ ...settings, adminId: e.target.value.replace(/\D/g, "") })} placeholder="15340" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="OCR-Sprache (Tesseract, lokal & kostenlos)">
                <select className={inputCls} value={settings.ocrLanguage} onChange={(e) => setSettings({ ...settings, ocrLanguage: e.target.value })}>
                  <option value="deu+eng">Deutsch + Englisch</option><option value="eng">Englisch</option><option value="deu">Deutsch</option>
                </select>
              </Field>
              <Field label={`OCR-Frames: ${settings.ocrFrames}`} hint="Letzte 5 Sekunden haben Priorität (Bannblock), Rest grob verteilt.">
                <input type="range" min={3} max={12} value={settings.ocrFrames} onChange={(e) => setSettings({ ...settings, ocrFrames: parseInt(e.target.value, 10) })} className="range-accent w-full" />
              </Field>
              <Field label="Standard-Server">
                <select className={inputCls} value={settings.serverDefault} onChange={(e) => setSettings({ ...settings, serverDefault: e.target.value })}>
                  {SERVERS.map((s) => <option key={s} value={s}>{s} · {serverLabel(s)}</option>)}
                </select>
              </Field>
              <Field label="Standard YouTube-Verbindung">
                <select className={inputCls} value={settings.ytDefaultSlot} onChange={(e) => setSettings({ ...settings, ytDefaultSlot: parseInt(e.target.value, 10) })}>
                  <option value={0}>Verbindung 1</option><option value={1}>Verbindung 2</option><option value={2}>Verbindung 3</option>
                </select>
              </Field>
            </div>
            <Field label="Google OAuth Client-ID (kostenlos, für YouTube + Drive)" hint="In Google Cloud als autorisierter JavaScript-Ursprung exakt https://felixsp2003.github.io eintragen.">
              <input className={inputCls} value={settings.googleClientId} onChange={(e) => setSettings({ ...settings, googleClientId: e.target.value.trim() })} placeholder="xxxx.apps.googleusercontent.com" />
            </Field>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.loginRequired} onChange={(e) => setSettings({ ...settings, loginRequired: e.target.checked })} className="h-4 w-4 range-accent" /> Login erforderlich</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={settings.autoBackup} onChange={(e) => setSettings({ ...settings, autoBackup: e.target.checked })} className="h-4 w-4 range-accent" /> Auto-Backup nach Änderungen</label>
            </div>
            <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-400">
              OCR: Chat-Bereich oben links, 2× vergrößert → Varianten (Kontrast, Graustufen, Threshold, Original, Orange-Maske) → Konsens-Voting. Ziel-ID nur aus „hat … [ID] für“, Grund nur aus der festen Liste, SC ausschließlich 40-stelliger SocialClub-Hash bzw. aus dem ACP. Datum aus dem Dateinamen.
            </p>
          </div>
        )}

        {tab === "checker" && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-black">PC-Checker</h3>
            <p className="text-xs text-slate-400">Leiter ist immer <b className="text-slate-200">{PC_CHECKER_LEAD}</b>. Feste Liste + eigene Namen (gleicher Speicher-Key wie die alte App: <span className="font-mono">grandrp_pc_checker_custom_v1</span>).</p>
            <div className="flex flex-wrap gap-1.5">{PC_CHECKER_POOL.map((n) => <Badge key={n} tone="violet"><Users size={11} /> {n}</Badge>)}</div>
            <div className="space-y-2">
              {custom.map((n) => (
                <div key={n} className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm">
                  <span className="font-semibold">{n}</span><Badge tone="amber">eigen</Badge>
                  <button className={`${btnDanger} ml-auto !py-1`} onClick={() => { const c = custom.filter((x) => x !== n); setCustom(c); saveCustomCheckers(c); props.onPoolChanged(); }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={inputCls} value={newChecker} onChange={(e) => setNewChecker(e.target.value)} placeholder="Name hinzufügen" onKeyDown={(e) => e.key === "Enter" && document.getElementById("addChecker")?.click()} />
              <button id="addChecker" className={btnPrimary} onClick={() => { const n = newChecker.trim(); if (!n) return; const c = [...new Set([...custom, n])]; setCustom(c); saveCustomCheckers(c); setNewChecker(""); props.onPoolChanged(); push("ok", `${n} zur PC-Checker-Liste hinzugefügt.`); }}><Plus size={15} /> Hinzufügen</button>
            </div>
          </div>
        )}

        {tab === "youtube" && (
          <div className="space-y-4">
            <h3 className="font-black">YouTube-Verbindungen · 3 Slots</h3>
            <p className="text-xs text-slate-400">Ist eine Verbindung wegen Uploadlimit/Quota voll, wird die nächste verwendet. Client-IDs der alten App werden automatisch übernommen. Uploads: unlisted · Titel = finaler Dateiname. YouTube und Drive getrennt verbinden — Google erlaubt beide Berechtigungen nicht in einem Login.</p>
            {ytConns.map((y) => (
              <div key={y.slot} className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Video size={18} className="text-red-400" />
                  <input className="w-44 rounded-lg border border-white/10 bg-[#0b1326] px-2 py-1 text-sm font-bold" value={y.name} onChange={(e) => patchYt(y.slot, { name: e.target.value })} />
                  <label className="ml-auto flex items-center gap-2 text-xs"><input type="checkbox" checked={y.enabled} onChange={(e) => patchYt(y.slot, { enabled: e.target.checked })} className="h-4 w-4 range-accent" /> Aktiv</label>
                  {y.accessToken && y.expiry > Date.now() ? <Badge tone="green">● verbunden</Badge> : <Badge tone="zinc">● nicht verbunden</Badge>}
                </div>
                <Field label="Google OAuth Client-ID"><input className={inputCls} placeholder="xxxx.apps.googleusercontent.com" value={y.clientId} onChange={(e) => patchYt(y.slot, { clientId: e.target.value.trim() })} /></Field>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button className={btnPrimary} disabled={busy === "yt" + y.slot} onClick={() => void ytConnect(y.slot)}><PlugZap size={15} /> {busy === "yt" + y.slot ? "Verbinde…" : "Verbinden"}</button>
                  <button className={btnGhost} onClick={() => patchYt(y.slot, { accessToken: "", expiry: 0 })}>Trennen</button>
                </div>
              </div>
            ))}
            <p className="text-xs text-slate-400">Ohne Verbindung läuft eine Upload-Simulation (Fortschritt + processingStatus), damit der komplette Ablauf testbar bleibt — es landet dann kein Video auf YouTube.</p>
          </div>
        )}

        {tab === "drive" && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-black">Tresor · anderer PC · AES-256</h3>
            <p className="text-xs text-slate-400">Dauerhaft und auf einem anderen PC sind die Daten über den verschlüsselten Tresor (Google Drive und/oder geheimes GitHub-Gist). Google/GitHub sehen nur Ciphertext. Schlüssel = dein Login-Passwort. Drive-Login fragt nur Drive an, nie YouTube — sonst Error 400.</p>
            <div className="flex flex-wrap items-center gap-2">
              {drive.connected ? <Badge tone="green"><CloudUpload size={12} /> Drive verbunden</Badge> : <Badge tone="zinc">Drive offen</Badge>}
              {drive.gistId ? <Badge tone="green">Gist {drive.gistId.slice(0, 8)}…</Badge> : <Badge tone="zinc">Gist offen</Badge>}
              <Badge tone="amber">AES-256-GCM</Badge>
              {drive.lastBackup > 0 && <span className="text-xs text-slate-400">Letztes Backup: {new Date(drive.lastBackup).toLocaleString("de-DE")} · {drive.lastBackupCount} Einträge</span>}
            </div>
            <Field label="Drive Client-ID (optional, sonst globale / YouTube-Client-ID)"><input className={inputCls} value={drive.clientId} onChange={(e) => setDrive({ ...drive, clientId: e.target.value.trim() })} placeholder="xxxx.apps.googleusercontent.com" /></Field>
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} disabled={busy === "drive"} onClick={() => void driveConnect()}><PlugZap size={15} /> Google Drive verbinden</button>
              <button className={btnGhost} onClick={() => { void driveBackup("manuell").then((r) => { props.setDriveMsg(r.msg); push(r.ok ? "ok" : "err", r.msg); }); }}><CloudUpload size={15} /> Jetzt alles sichern</button>
              <button className={btnGhost} onClick={() => {
                if (!window.confirm("Cloud-Tresor wiederherstellen? Lokale Daten werden VEREINIGT — nichts wird gelöscht.")) return;
                void driveRestore().then((r) => { if (!r.ok || !r.entries) { push("err", r.msg); return; } importPayload({ entries: r.entries, deleted: r.deleted, youtubeConnections: r.youtubeConnections }, "Restore"); });
              }}><CloudDownload size={15} /> Auf diesem PC wiederherstellen</button>
              <button className={btnGhost} onClick={() => { void downloadEncryptedVault().then(() => push("ok", "Verschlüsselter Tresor heruntergeladen.")).catch((e) => push("err", e instanceof Error ? e.message : String(e))); }}><Download size={15} /> AES-Datei exportieren</button>
              <label className={`${btnGhost} cursor-pointer`}>
                <Upload size={15} /> Backup importieren (AES oder altes JSON)
                <input type="file" accept="application/json,.json,.enc.json" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
                  void importEncryptedFile(f).then((payload) => importPayload(payload, "Import")).catch((err) => push("err", err instanceof Error ? err.message : String(err)));
                }} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={drive.autoBackup} onChange={(e) => setDrive({ ...drive, autoBackup: e.target.checked })} className="h-4 w-4 range-accent" /> Automatisches verschlüsseltes Backup nach Änderungen</label>
            <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
              <p className="text-sm font-black text-amber-200">Anderer PC — geheimes GitHub-Gist (kostenlos, ohne Google-OAuth)</p>
              <p className="text-xs text-slate-400">GitHub → Settings → Developer settings → Personal access tokens (Recht <b>gist</b>). Token nur hier einfügen. Gist ist secret, Inhalt AES-256.</p>
              <Field label="GitHub Token (gist)"><input className={`${inputCls} font-mono`} type="password" autoComplete="off" value={drive.gistToken} onChange={(e) => setDrive({ ...drive, gistToken: e.target.value.trim() })} placeholder="ghp_… oder github_pat_…" /></Field>
              <Field label="Gist-ID (wird beim ersten Sichern automatisch gesetzt)"><input className={`${inputCls} font-mono`} value={drive.gistId} onChange={(e) => setDrive({ ...drive, gistId: e.target.value.trim() })} placeholder="auf dem 2. PC die gleiche ID eintragen" /></Field>
              <p className="text-[11px] leading-relaxed text-slate-400">PC 1: Token einfügen → „Jetzt alles sichern“ → Gist-ID notieren. PC 2: gleiche Website → anmelden → Token + Gist-ID eintragen → „Auf diesem PC wiederherstellen“.</p>
            </div>
            {props.driveMsg && <p className="rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">{props.driveMsg}</p>}
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs">
              <p className="font-bold text-red-300">Sicherheit</p>
              <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-300">
                <li>Backup-Format = Format der alten App („grandrp-cloud-archive“) — alte Backups lassen sich direkt importieren.</li>
                <li>Leerer lokaler Zustand überschreibt niemals den Cloud-Tresor. Restore nur nach Bestätigung — nie automatisch bei F5.</li>
                <li>Videos bleiben lokal in IndexedDB; Proof-Links (YouTube unlisted) sind im Tresor und auf jedem PC nutzbar.</li>
              </ul>
            </div>
          </div>
        )}

        {tab === "acp" && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-black">ACP / Browser-Extension</h3>
            <p className="text-xs text-slate-400">Für SC und BannGrund wird Chrome mit dem Grand-RP-Adminpanel verwendet. Die Erweiterung läuft auf <span className="font-mono text-slate-200">https://admin.gta5grand.com/de/*</span>, wartet auf die geladenen Daten (SC bis 30 s) und sendet Social Club token-geschützt zurück.</p>
            <Field label="Bridge-Token (Nachrichten ohne Token werden abgelehnt)">
              <div className="flex gap-2">
                <input className={`${inputCls} font-mono`} readOnly value={props.bridgeToken} />
                <button className={btnGhost} onClick={() => { void navigator.clipboard.writeText(props.bridgeToken).catch(() => undefined); push("ok", "Bridge-Token kopiert."); }}><Copy size={15} /></button>
              </div>
            </Field>
            <div className="flex flex-wrap gap-2">
              <button className={btnPrimary} onClick={() => { void downloadExtension(); push("ok", "Extension-Dateien werden heruntergeladen."); }}><Download size={15} /> Extension herunterladen</button>
              <button className={btnGhost} onClick={() => window.open("https://admin.gta5grand.com/", "_blank", "noopener")}><ExternalLink size={15} /> ACP öffnen</button>
              <button className={btnGhost} onClick={() => {
                const last = (window as unknown as { __DC_LAST_SC?: unknown }).__DC_LAST_SC;
                push(last ? "ok" : "info", last ? `Bridge aktiv — letzte Nachricht: ${JSON.stringify(last).slice(0, 160)}` : "Bridge lauscht — noch keine Nachricht. Extension installiert? ACP-Tab aus dem Checker öffnen.");
              }}><Zap size={15} /> Bridge testen</button>
            </div>
          </div>
        )}

        {tab === "daten" && (
          <div className="max-w-2xl space-y-4">
            <h3 className="font-black">Daten & Speicher</h3>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Mini label="Einträge (Alle)" value={String(props.entries.length)} />
              <Mini label="POV-Archiv" value={String(props.entries.filter((e) => e.permaArchive).length)} />
              <Mini label="Gelöschte IDs" value={String(loadDeleted().length)} />
              <Mini label="Videos lokal" value={String(props.entries.filter((e) => e.hasVideo).length)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btnGhost} onClick={() => { const raw = loadMeta(); push("info", `${metaDiagnostics()} · Records=${loadAllRecords().length} · Merged=${mergeEntries(raw, loadAllRecords()).length}`); }}><HardDrive size={15} /> Speicher prüfen</button>
              <button className={btnGhost} onClick={() => downloadLocalBackup()}><Download size={15} /> Klartext-Backup (altes Format)</button>
              <label className={`${btnGhost} cursor-pointer`}>
                <Upload size={15} /> Archiv-Backup wiederherstellen (JSON)
                <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
                  void importEncryptedFile(f).then((payload) => importPayload(payload, "Import")).catch((err) => push("err", err instanceof Error ? err.message : "Import-Datei ungültig."));
                }} />
              </label>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-xs">
              <p className="font-bold text-red-300">Kein automatisches Löschen</p>
              <p className="mt-1 text-slate-300">Diese App löscht NIEMALS automatisch. Nur ausdrückliches Löschen entfernt Daten — mit Löschmarkierung gegen Auto-Restore. Vor dem ersten Schreiben wird eine Rohkopie der Alt-Daten angelegt.</p>
            </div>
          </div>
        )}

        {tab === "install" && <InstallGuide push={push} />}

        {pwOpen && (
          <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/85 p-4 backdrop-blur">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0d1424] p-6 shadow-2xl fade-up">
              <h2 className="mb-1 text-lg font-black">Passwort ändern</h2>
              <p className="mb-4 text-xs text-slate-400">Neuer Salt + neuer Hash. Der AES-Tresor-Schlüssel wird auf das neue Passwort umgestellt.</p>
              <PwForm username={props.username} onChange={props.onChangePassword} onCancel={() => setPwOpen(false)} onDone={() => { setPwOpen(false); setUsers(loadUsers()); push("ok", "Passwort geändert. Cloud-Backups ab jetzt mit dem neuen Passwort gesichert."); }} />
            </div>
          </div>
        )}

        {tab === "benutzer" && (
          <div className="max-w-xl space-y-4">
            <h3 className="font-black">Benutzer & Sicherheit · Lokal</h3>
            <p className="text-xs text-slate-400">Konten gelten für diesen Browser. Passwörter werden niemals im Klartext gespeichert.</p>
            <div className="flex flex-wrap items-center gap-2">
              <button className={btnPrimary} onClick={() => setPwOpen(true)}><KeyRound size={15} /> Passwort ändern</button>
              {users.some((u) => u.mustChange) && <Badge tone="red">Standardpasswort aktiv — Änderung erforderlich</Badge>}
            </div>
            {users.map((u) => (
              <div key={u.u} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm">
                <User size={16} className="text-slate-400" /><span className="font-bold">{u.u}</span><Badge tone="violet">{u.role}</Badge>
                <button className={`${btnDanger} ml-auto !py-1.5`} onClick={() => {
                  if (users.length <= 1) { push("err", "Der letzte Benutzer kann nicht gelöscht werden."); return; }
                  if (!window.confirm(`Benutzer ${u.u} löschen?`)) return;
                  const n = users.filter((x) => x.u !== u.u); setUsers(n); saveUsers(n); push("ok", `Benutzer ${u.u} gelöscht.`);
                }}><Trash2 size={14} /></button>
              </div>
            ))}
            <div className="grid gap-2 md:grid-cols-3">
              <input className={inputCls} placeholder="Neuer Benutzer" value={newUser.u} onChange={(e) => setNewUser({ ...newUser, u: e.target.value })} />
              <input className={inputCls} type="password" placeholder="Passwort" value={newUser.p} onChange={(e) => setNewUser({ ...newUser, p: e.target.value })} />
              <button className={btnPrimary} onClick={() => {
                if (!newUser.u.trim() || newUser.p.length < 8) { push("err", "Name + Passwort (min. 8) erforderlich."); return; }
                const salt = uid("s");
                void sha256(salt + "::" + newUser.p).then((h) => { const n = [...users, { u: newUser.u.trim(), p: h, salt, created: Date.now(), role: "mod" }]; setUsers(n); saveUsers(n); setNewUser({ u: "", p: "" }); push("ok", `Benutzer ${newUser.u.trim()} angelegt.`); });
              }}><Plus size={15} /> Anlegen</button>
            </div>
          </div>
        )}

        {tab === "info" && <ManualText />}
      </div>
    </div>
  );
}

function InstallGuide({ push }: { push: Push }) {
  const step = (n: string, title: string, children: React.ReactNode) => (
    <div className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-xs font-black text-black">{n}</span>
      <div className="min-w-0 flex-1 space-y-2"><p className="text-sm font-bold text-slate-100">{title}</p><div className="space-y-2 text-xs leading-relaxed text-slate-400">{children}</div></div>
    </div>
  );
  return (
    <div className="max-w-2xl space-y-5">
      <div><h3 className="font-black">Installation — Schritt für Schritt</h3><p className="mt-1 text-xs text-slate-400">Alles kostenlos. GitHub baut die App automatisch (Actions), kein Node.js nötig.</p></div>
      {step("1", "Projektdateien auf GitHub hochladen", <>
        <p>Neues öffentliches Repo → „uploading an existing file“ → diese Dateien/Ordner hineinziehen:</p>
        <CodeBox code={".github/   src/   public/\nindex.html   package.json   tsconfig.json   vite.config.ts   README.md   .gitignore"} />
        <p><b className="text-red-300">Nicht</b> hochladen: <span className="font-mono">node_modules/</span>, <span className="font-mono">dist/</span>. Dann „Commit changes“.</p>
      </>)}
      {step("2", "GitHub Pages einschalten", <>
        <p>Settings → Pages → Source: <b className="text-slate-200">GitHub Actions</b>. Reiter Actions: „Deploy DC Checker“ ~2 Minuten. Adresse: <span className="font-mono text-cyan-300">https://DEINNAME.github.io/REPO/</span></p>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5"><p className="text-amber-200"><b>Adresse nie mehr ändern</b> — Daten liegen im Browser pro Adresse.</p></div>
      </>)}
      {step("3", "Browser-Extension installieren", <>
        <p><span className="font-mono">chrome://extensions</span> → Entwicklermodus → „Entpackte Erweiterung laden“ → Ordner <span className="font-mono">public/ACP-Browser-Extension</span>.</p>
        <button className={btnPrimary} onClick={() => { void downloadExtension(); push("info", "Extension-Dateien werden heruntergeladen."); }}><Download size={15} /> Extension-Dateien herunterladen</button>
      </>)}
      {step("4", "Anmelden & Passwort setzen", <>
        <p>Erster Login: <b className="text-slate-200">Adam</b> / <b className="text-slate-200">Admin</b> → sofort eigenes Passwort setzen (Pflicht). Kein persönliches Passwort im Quellcode.</p>
      </>)}
      {step("5", "Alte Daten übernehmen", <>
        <p>Läuft die neue App unter <b className="text-slate-200">derselben Domain</b> wie die alte, sind alle Einträge sofort da (gleicher Speicher). Zusätzlich: Einstellungen → Tresor → „Backup importieren“ mit dem alten Drive-JSON („grandrp-cloud-archive“).</p>
      </>)}
      {step("6", "YouTube & Drive verbinden", <>
        <p>Google Cloud Console → OAuth-Client-ID (Webanwendung) → autorisierter JavaScript-Ursprung = deine GitHub-Pages-Adresse → Client-ID unter Allgemein bzw. YouTube ×3 eintragen → Verbinden.</p>
      </>)}
    </div>
  );
}

function ManualText() {
  const rows: Array<[string, string]> = [
    ["1. POV hochladen", "„POVs hochladen“ → Videos ablegen → Karte „Prüfen“ aufklappen. Ergebnis kann sofort eingetragen werden. „Speichern & YouTube hochladen“: Upload (unlisted) → processingStatus=succeeded → OCR → Speichern ins Archiv. „Nächste POV“ speichert und öffnet die nächste."],
    ["2. Prüfansicht", "Video mit Zeitmarken (Bannblock, Ziel-ID, Grund, SC/RID, PC-Check) · Ziel-ID · Ergebnis · Grund (feste Liste) · SOC/SC (aus ACP) · Server · Datum (aus Dateiname) · Proof · finaler Dateiname · PC Checker (Leiter + 4) · Bann-Typen · Perma/Archiv/Nicht gebannt · Im Dokument."],
    ["3. SC aus ACP", "„SC aus ACP holen“ öffnet das Adminpanel (Authorization-Logs) mit Ziel-ID + Bridge-Token. Die Extension liest den SocialClub aus und sendet ihn zurück — das Feld füllt sich automatisch."],
    ["4. Auto-Regeln", "Verweigerung/Trolling → Ergebnis = Grund. Trolling, Positiv, Banevading, Acc 1.4 (Twink) → Perma an. 4.1 (Discord/Redux), Cleaning, Event 1.7, Covering Cheater, Acc 1.4 (Main) → Perma aus. Bann-Typen werden aus dem Grund vorbelegt."],
    ["5. Archiv", "„Alle“ = alles. „Archiv: in Perma eingetragen“ (permaArchive) → zusätzlich unter „POV Archiv“. Filter sind nur Anzeige. Ein POV verschwindet nur durch ausdrückliches Löschen."],
    ["6. CSV", "Spalten wie alte App: Proof · Datum · ID · SOC · RID · Discord ID · Familie · Ergebnis · Grund · Admin 1–5. Filter/Sortierung → nur gefilterte Zeilen werden exportiert oder als Tabelle kopiert."],
    ["7. Tresor", "Nach jeder Änderung automatisch verschlüsseltes Backup (Drive/Gist). Format ist das der alten App — alte Backups importierbar. Restore nur per Klick. Leerer Zustand überschreibt nie das Cloud-Backup."],
  ];
  return (
    <div className="max-w-none space-y-3 text-sm text-slate-300">
      <h3 className="text-base font-black text-slate-100">Anleitung</h3>
      {rows.map(([t, d]) => (
        <div key={t} className="rounded-xl border border-white/10 bg-black/30 p-3"><p className="font-bold text-slate-100">{t}</p><p className="mt-1 text-xs leading-relaxed text-slate-400">{d}</p></div>
      ))}
    </div>
  );
}
