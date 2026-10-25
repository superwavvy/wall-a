"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

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
    <main className="min-h-screen bg-[#0b0b12] text-zinc-200 p-5">
      <div className="max-w-xl mx-auto space-y-5 mt-6">
        <h1 className="text-2xl font-semibold text-white">Connect your agent</h1>
        <p className="text-sm text-zinc-400 leading-relaxed">
          Create a private connector link and add it to Claude as a custom connector. Everything your agent does
          shows up on your own dashboard.
        </p>

        {!url && (
          <button onClick={create} disabled={busy} className="w-full rounded-lg bg-indigo-500 py-3 font-medium text-white disabled:opacity-50">
            {busy ? "Creating..." : "Create connector link"}
          </button>
        )}

        {error && <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}

        {url && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
              This link is shown once and works like a password. Copy it now, and don&apos;t share it.
            </div>
            <div className="text-xs text-zinc-400">Agent: {agentId} · Tools: send_email, fetch_url, read_file</div>
            <textarea readOnly value={url} rows={4} className="w-full rounded-lg border border-zinc-700 bg-black p-3 font-mono text-xs text-zinc-300 break-all" />
            <button onClick={copy} className="w-full rounded-lg border border-zinc-600 py-3 text-white">{copied ? "Copied" : "Copy link"}</button>
            <button onClick={() => { setUrl(null); setCopied(false); }} className="w-full rounded-lg py-2 text-sm text-zinc-400 underline">I&apos;ve saved it, hide the link</button>
          </div>
        )}

        <section className="space-y-2 pt-2">
          <h2 className="text-sm font-medium text-white">Your connectors ({keys.length}/3)</h2>
          {keys.length === 0 && <p className="text-sm text-zinc-500">No active connectors yet.</p>}
          {keys.map((k) => (
            <div key={k.id} className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-mono text-sm text-white">{k.agent_id}</div>
                  <div className="text-xs text-zinc-400">Created {ago(k.created_at)} · Last used {ago(k.last_used_at)}</div>
                  <div className="text-xs text-zinc-500">{k.permissions.join(", ")}</div>
                </div>
                {confirmId === k.id ? (
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => revoke(k.id)} className="rounded-md bg-rose-500 px-3 py-2 text-xs font-medium text-white">Confirm</button>
                    <button onClick={() => setConfirmId(null)} className="rounded-md border border-zinc-600 px-3 py-2 text-xs text-zinc-300">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmId(k.id)} className="shrink-0 rounded-md border border-rose-500/50 px-3 py-2 text-xs text-rose-300">Revoke</button>
                )}
              </div>
            </div>
          ))}
          <p className="text-xs text-zinc-500">Revoking stops that link working immediately and frees a slot.</p>
        </section>

        <Link href="/" className="block text-center text-sm text-zinc-400 underline">Back to dashboard</Link>
      </div>
    </main>
  );
}
