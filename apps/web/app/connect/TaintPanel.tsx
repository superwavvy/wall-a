"use client";

import { useCallback, useEffect, useState } from "react";

export default function TaintPanel() {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const headers = () => ({ "x-client-id": localStorage.getItem("wall-a-client-id") ?? "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/taint", { headers: headers(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setCount(data.tainted);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const clear = async () => {
    setBusy(true);
    try { await fetch("/api/taint", { method: "DELETE", headers: headers() }); } catch {}
    setBusy(false);
    load();
  };

  if (count === null) return null;
  const tainted = count > 0;
  return (
    <section className={tainted ? "t-note-amber" : "t-card"}>
      <div style={{ fontWeight: 700 }}>
        {tainted ? "[ !! ] SESSION TAINTED" : "[ OK ] CONTEXT CLEAN"}
      </div>
      <p className={tainted ? "" : "t-muted"} style={{ fontSize: 12, marginTop: 4 }}>
        {tainted
          ? "Untrusted content was read (fetch_url). Risky actions are restricted. Clear only when you start a fresh conversation."
          : "No untrusted content read since the last clear."}
      </p>
      {tainted && (
        <button onClick={clear} disabled={busy} className="t-btn t-btn-sm t-btn-amber" style={{ marginTop: 8 }}>
          {busy ? "clearing..." : "clear taint"}
        </button>
      )}
    </section>
  );
}
