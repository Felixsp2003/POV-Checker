import React from "react";

interface State {
  error: Error | null;
  info: string;
}

/**
 * Fängt React-Abstürze ab und zeigt sie an, statt eine schwarze Seite zu lassen.
 * Die Daten im Browser bleiben dabei unangetastet.
 */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      const stack = info.componentStack || "";
      this.setState({ info: stack.slice(0, 2500) });
      // Auch global sichtbar machen (DevTools-frei lesbar)
      const el = document.getElementById("dc-global-error");
      if (el) {
        el.style.display = "flex";
        el.textContent = `FEHLER: ${error.message}`;
      }
    } catch { /* noop */ }
  }

  render() {
    if (!this.state.error) return this.props.children;
    const e = this.state.error;
    return (
      <div className="flex min-h-full items-center justify-center bg-[#070b14] p-6">
        <div className="w-full max-w-2xl rounded-2xl border border-red-500/30 bg-[#0d1424] p-6 shadow-2xl">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-red-500 text-white">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v6M12 16.5v.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-100">Ein Fehler hat die Ansicht unterbrochen</h1>
              <p className="text-xs text-slate-400">Deine gespeicherten Daten sind nicht betroffen — sie liegen im Browser und bleiben erhalten.</p>
            </div>
          </div>

          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-red-300">Fehlermeldung</p>
            <p className="break-words font-mono text-xs text-red-200">{e.name}: {e.message}</p>
          </div>

          {this.state.info && (
            <details className="mt-3 rounded-xl border border-white/10 bg-black/30 p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-300">Technische Details anzeigen</summary>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-slate-400">{this.state.info}</pre>
            </details>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-[#131006] hover:bg-amber-400"
              onClick={() => this.setState({ error: null, info: "" })}
            >
              Versuchen fortzufahren
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
              onClick={() => window.location.reload()}
            >
              Seite neu laden
            </button>
            <a
              href="https://github.com/Felixsp2003/POV-Checker/issues"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
            >
              Fehler melden
            </a>
          </div>
        </div>
      </div>
    );
  }
}
