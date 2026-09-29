import { Copy, Download } from "lucide-react";
import { CSV_FILTER_DEFS, CSV_HEAD, CSV_SORTS, PovEntry, csvRow, toTSV } from "../lib/core";
import { Badge, btnGhost, btnPrimary, copyText, inputCls, mini } from "../ui";

export default function CsvView(p: {
  entries: PovEntry[]; filtered: PovEntry[];
  active: Set<string>; setActive: (s: Set<string>) => void;
  search: string; setSearch: (s: string) => void; from: string; setFrom: (s: string) => void;
  to: string; setTo: (s: string) => void; sort: string; setSort: (s: string) => void;
  onExport: () => void; push: (k: "ok" | "err" | "info", t: string) => void;
}) {
  const toggle = (id: string) => { const n = new Set(p.active); if (n.has(id)) n.delete(id); else n.add(id); p.setActive(n); };
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#101830] p-4">
        <p className="text-xs text-slate-400">SOC wird mit dem SC aus dem Adminpanel gefüllt. RID bleibt immer leer. Familie bleibt leer. Admin 1–5 werden aus den PC Checkern übernommen. Filter verändern nur Anzeige/Export — nie die Originaldaten.</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CSV_FILTER_DEFS.map((f) => (
            <button key={f.id} onClick={() => toggle(f.id)}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${p.active.has(f.id) ? "border-amber-500/50 bg-amber-500/15 text-amber-300" : "border-white/10 bg-white/[.03] text-slate-300 hover:bg-white/10"}`}>
              {f.label}
            </button>
          ))}
          {p.active.size > 0 && <button className="rounded-lg border border-red-500/30 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-bold text-red-300" onClick={() => p.setActive(new Set())}>Filter zurücksetzen</button>}
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-4">
          <input className={inputCls} placeholder="Suchtext (ID · SOC · Grund · Ergebnis · Checker)" value={p.search} onChange={(e) => p.setSearch(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-slate-400">Von <input className={inputCls} type="date" value={p.from} onChange={(e) => p.setFrom(e.target.value)} /></label>
          <label className="flex items-center gap-2 text-xs text-slate-400">Bis <input className={inputCls} type="date" value={p.to} onChange={(e) => p.setTo(e.target.value)} /></label>
          <select className={inputCls} value={p.sort} onChange={(e) => p.setSort(e.target.value)}>
            {CSV_SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="sky">{p.filtered.length} von {p.entries.length} Einträgen</Badge>
          <button className={btnPrimary} onClick={p.onExport}><Download size={15} /> CSV Download (nur gefilterte)</button>
          <button className={btnGhost} onClick={() => { copyText(toTSV(p.filtered)); p.push("ok", `${p.filtered.length} Zeilen als Tabelle kopiert (Tab-getrennt, für Google Sheets/Excel).`); }}><Copy size={15} /> Als Tabelle kopieren</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="w-full min-w-[1400px] text-xs">
          <thead>
            <tr className="bg-[#0d1528] text-left text-[10px] uppercase tracking-wider text-slate-400">
              {CSV_HEAD.map((h) => <th key={h} className="px-3 py-2.5 font-bold">{h}</th>)}
              <th className="px-3 py-2.5 font-bold">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {p.filtered.slice(0, 300).map((e) => {
              const r = csvRow(e);
              return (
                <tr key={e.id} className="border-t border-white/5 hover:bg-white/[.03]">
                  {r.map((c, i) => (
                    <td key={i} className={`max-w-[200px] truncate px-3 py-2 ${i === 0 ? "text-cyan-300" : i === 2 ? "font-bold tick" : i === 3 ? "font-mono text-[11px]" : i === 8 ? "font-semibold text-amber-300" : ""}`} title={c}>
                      {i === 0 && c ? <a href={c} target="_blank" rel="noreferrer" className="hover:underline">{c}</a> : (c || <span className="text-slate-600">—</span>)}
                    </td>
                  ))}
                  <td className="px-3 py-2"><button className={btnGhost + mini} onClick={() => { copyText(r.join("\t")); p.push("ok", `Zeile ID ${e.targetId} kopiert.`); }}><Copy size={12} /> Zeile</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {p.filtered.length > 300 && <p className="border-t border-white/5 bg-[#0d1528] px-3 py-2 text-[11px] text-slate-400">Vorschau: 300 von {p.filtered.length} — Export enthält alle gefilterten.</p>}
        {p.filtered.length === 0 && <p className="bg-[#0d1528] px-3 py-8 text-center text-slate-400">Keine Einträge für diese Filter.</p>}
      </div>
    </div>
  );
}
