"use client";

import { useCallback, useEffect, useState } from "react";

export default function PausePanel() {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const headers = () => ({ "Content-Type": "application/json", "x-client-id": localStorage.getItem("wall-a-client-id") ?? "" });

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/pause", { headers: headers(), cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPaused(!!data.paused);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (paused === null) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/pause", { method: "PUT", headers: headers(), body: JSON.stringify({ paused: !paused }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPaused(!!data.paused);
      else setErr(data.error || "Could not change the switch.");
    } catch {
      setErr("Could not reach the server.");
    }
    setBusy(false);
  };

  if (paused === null) return null;
  return (
    <section className={paused ? "t-note-red" : "t-card"}>
      <div style={{ fontWeight: 700 }}>{paused ? "[ XX ] FIREWALL PAUSED" : "[ OK ] FIREWALL ACTIVE"}</div>
      <p className={paused ? "" : "t-muted"} style={{ fontSize: 12, marginTop: 4 }}>
        {paused
          ? "Every action from every connector is blocked, and approved actions cannot run. Resume when you are ready."
          : "Pause blocks everything from your connectors at once. Use it if an agent misbehaves."}
      </p>
      {err && <p style={{ fontSize: 12, marginTop: 4 }}>[ ERR ] {err}</p>}
      <button onClick={toggle} disabled={busy} className={`t-btn t-btn-sm ${paused ? "" : "t-btn-red"}`} style={{ marginTop: 8 }}>
        {busy ? "..." : paused ? "resume" : "pause everything"}
      </button>
    </section>
  );
}
