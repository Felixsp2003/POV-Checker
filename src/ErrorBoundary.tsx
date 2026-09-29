import { Component, type ErrorInfo, type ReactNode } from "react";

interface State { error: Error | null; info: string; }

// Fängt Render-Abstürze ab: statt eines schwarzen Bildschirms erscheint eine Fehlerseite
// mit Diagnose und Rettungsfunktionen. Es werden NIEMALS Daten gelöscht.
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, info: "" };

  static getDerivedStateFromError(error: Error): Partial<State> { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info: info.componentStack || "" });
    try { console.error("[DC Checker] Render-Fehler:", error, info.componentStack); } catch { /* noop */ }
  }

  private diagnostics(): string {
    const lines: string[] = [];
    try {
      lines.push(`URL: ${location.href}`);
      lines.push(`Browser: ${navigator.userAgent}`);
      lines.push(`Fehler: ${this.state.error?.message || "?"}`);
      lines.push("");
      lines.push("localStorage (grandrp*):");
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (!k.startsWith("grandrp")) continue;
        const v = localStorage.getItem(k) || "";
        let shape = "string";
        try {
          const j = JSON.parse(v);
          if (Array.isArray(j)) {
            shape = `array[${j.length}]`;
            const first = j.find((x: unknown) => x && typeof x === "object");
            if (first) shape += ` keys: ${Object.keys(first as object).slice(0, 25).join(",")}`;
          } else if (j && typeof j === "object") shape = `object keys: ${Object.keys(j).slice(0, 25).join(",")}`;
          else shape = typeof j;
        } catch { /* string */ }
        lines.push(`  ${k} · ${(v.length / 1024).toFixed(1)} KB · ${shape}`);
      }
    } catch (e) { lines.push(`Diagnose-Fehler: ${e instanceof Error ? e.message : String(e)}`); }
    lines.push("");
    lines.push("Stack:");
    lines.push(this.state.error?.stack || "");
    lines.push(this.state.info);
    return lines.join("\n");
  }

  private downloadRaw(): void {
    const dump: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      if (k.startsWith("grandrp")) dump[k] = localStorage.getItem(k) || "";
    }
    const blob = new Blob([JSON.stringify(dump)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `grandrp-rohdaten-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  private resetSession(): void {
    // nur Sitzung/Tresor-Schlüssel — keine Archivdaten
    for (const k of ["grandrp_session_v42", "grandrp_session_v42__dc"]) { try { localStorage.removeItem(k); } catch { /* noop */ } }
    try { sessionStorage.clear(); } catch { /* noop */ }
    location.reload();
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const diag = this.diagnostics();
    return (
      <div style={{ minHeight: "100%", background: "#070b14", color: "#e6ecf7", fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <div style={{ maxWidth: 900, margin: "0 auto", border: "1px solid #7f1d1d", background: "#160b10", borderRadius: 16, padding: 24 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900 }}>⚠️ Anzeige-Fehler abgefangen</h1>
          <p style={{ color: "#fca5a5", marginTop: 8, fontSize: 14 }}>{this.state.error.message}</p>
          <p style={{ color: "#93a0b8", fontSize: 13, lineHeight: 1.6 }}>
            Deine Daten sind <b>nicht</b> verändert worden. Wahrscheinlich liegen im Browser Daten einer anderen App-Version
            (gleiche Domain = gleicher Speicher). Bitte „Diagnose kopieren“ und den Text schicken.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            <button onClick={() => location.reload()} style={btn("#f59e0b", "#111")}>Neu laden</button>
            <button onClick={() => this.resetSession()} style={btn("#1b2540", "#e6ecf7")}>Sitzung zurücksetzen & neu laden</button>
            <button onClick={() => { void navigator.clipboard.writeText(diag).catch(() => undefined); }} style={btn("#1b2540", "#e6ecf7")}>Diagnose kopieren</button>
            <button onClick={() => this.downloadRaw()} style={btn("#1b2540", "#e6ecf7")}>Rohdaten sichern (Download)</button>
          </div>
          <pre style={{ marginTop: 16, whiteSpace: "pre-wrap", fontSize: 11, color: "#94a3b8", background: "#0b1120", padding: 12, borderRadius: 10, maxHeight: 360, overflow: "auto" }}>{diag}</pre>
        </div>
      </div>
    );
  }
}

function btn(bg: string, fg: string): React.CSSProperties {
  return { background: bg, color: fg, border: 0, borderRadius: 10, padding: "10px 14px", fontWeight: 800, cursor: "pointer", fontSize: 13 };
}
