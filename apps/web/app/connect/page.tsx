"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import TaintPanel from "./TaintPanel";
import PausePanel from "./PausePanel";

type KeyRow = { id: string; agent_id: string; permissions: string[]; created_at: string; last_used_at: string | null };

function getClientId() {
  try {
    let id = localStorage.getItem("wall-a-client-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("wall-a-client-id", id);
    }
    return id;
  } catch {
    return "";
  }
}

function ago(iso: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function Connect() {
  const [url, setUrl] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/keys/mine", { headers: { "x-client-id": getClientId() }, cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setKeys(data.keys ?? []);
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setBusy(true);
    setError("");
    setCopied(false);
    try {
      const res = await fetch("/api/keys/self", { method: "POST", headers: { "x-client-id": getClientId() } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        setUrl(`${window.location.origin}/api/mcp?key=${data.key}`);
        setAgentId(data.agentId);
        load();
      }
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
  };

  const revoke = async (id: string) => {
    setError("");
    try {
      const res = await fetch(`/api/keys/self/${id}`, { method: "DELETE", headers: { "x-client-id": getClientId() } });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not revoke.");
      }
    } catch {
      setError("Could not reach the server.");
    }
    setConfirmId(null);
    load();
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError("Copy failed. Long-press the box and copy manually.");
    }
  };

  return (
    <main className="term" style={{ padding: 20 }}>
      <div style={{ maxWidth: 560, margin: "24px auto 0", display: "grid", gap: 20 }}>
        <header>
          <div className="t-muted" style={{ fontSize: 12 }}>wall-a@firewall:~$ connect --agent</div>
          <h1 className="t-title">Connect your agent</h1>
          <p className="t-muted" style={{ fontSize: 13, marginTop: 6 }}>
            Create a private connector link and add it to Claude as a custom connector. Everything your agent does shows up on your own dashboard.
          </p>
        </header>

        {!url && (
          <button onClick={create} disabled={busy} className="t-btn t-btn-solid">
            {busy ? "creating..." : "> create connector link"}
          </button>
        )}

        {error && <div className="t-note-red" style={{ fontSize: 13 }}>[ ERR ] {error}</div>}

        {url && (
          <div style={{ display: "grid", gap: 12 }}>
            <div className="t-note-amber" style={{ fontSize: 13 }}>
              [ !! ] Shown once. Works like a password. Copy it now and don&apos;t share it.
            </div>
            <div className="t-muted" style={{ fontSize: 12 }}>agent: {agentId} | tools: send_email, fetch_url, read_file</div>
            <textarea readOnly value={url} rows={4} className="t-field" />
            <button onClick={copy} className="t-btn">{copied ? "[ copied ]" : "copy link"}</button>
            <button onClick={() => { setUrl(null); setCopied(false); }} className="t-link" style={{ background: "none", border: 0, fontSize: 13, minHeight: 44 }}>
              I&apos;ve saved it, hide the link
            </button>
          </div>
        )}

        <section style={{ display: "grid", gap: 8 }}>
          <h2 className="t-h2">## connectors [{keys.length}/3]</h2>
          {keys.length === 0 && <p className="t-muted" style={{ fontSize: 13 }}>no active connectors.</p>}
          {keys.map((k) => (
            <div key={k.id} className="t-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: "var(--g)", fontWeight: 700 }}>{k.agent_id}</div>
                <div className="t-muted" style={{ fontSize: 12 }}>created {ago(k.created_at)} | last used {ago(k.last_used_at)}</div>
                <div className="t-muted" style={{ fontSize: 11 }}>{k.permissions.join(", ")}</div>
              </div>
              {confirmId === k.id ? (
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => revoke(k.id)} className="t-btn t-btn-sm t-btn-red">confirm</button>
                  <button onClick={() => setConfirmId(null)} className="t-btn t-btn-sm">cancel</button>
                </div>
              ) : (
                <button onClick={() => setConfirmId(k.id)} className="t-btn t-btn-sm t-btn-red" style={{ flexShrink: 0 }}>revoke</button>
              )}
            </div>
          ))}
          <p className="t-muted" style={{ fontSize: 12 }}>Revoking stops that link at once and frees a slot.</p>
        </section>

        <PausePanel />

        <TaintPanel />

        <Link href="/" className="t-link" style={{ textAlign: "center", fontSize: 13 }}>&lt; back to dashboard</Link>
      </div>
    </main>
  );
}
