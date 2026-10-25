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
  return (
    <section className={`rounded-lg border p-3 ${count > 0 ? "border-amber-500/40 bg-amber-500/10" : "border-zinc-800 bg-zinc-900/50"}`}>
      <div className="text-sm font-medium text-white">{count > 0 ? "Your agent is TAINTED" : "Agent context is clean"}</div>
      <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
        {count > 0
          ? "It read untrusted content (fetch_url), so risky actions are restricted. Clear this only when you start a fresh conversation."
          : "No untrusted content has been read since the last clear."}
      </p>
      {count > 0 && (
        <button onClick={clear} disabled={busy} className="mt-2 rounded-md border border-amber-500/50 px-3 py-2 text-xs text-amber-200 disabled:opacity-50">
          {busy ? "Clearing..." : "Clear taint"}
        </button>
      )}
    </section>
  );
}
