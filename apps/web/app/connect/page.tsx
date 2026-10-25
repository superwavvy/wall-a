"use client";

import { useState } from "react";
import Link from "next/link";

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

export default function Connect() {
  const [url, setUrl] = useState<string | null>(null);
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/keys/self", {
        method: "POST",
        headers: { "x-client-id": getClientId() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
      } else {
        setUrl(`${window.location.origin}/api/mcp?key=${data.key}`);
        setAgentId(data.agentId);
      }
    } catch {
      setError("Could not reach the server.");
    }
    setBusy(false);
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
          Create a private connector link. Add it to Claude as a custom connector. Everything your agent
          does shows up on your own dashboard, and nobody else can see it.
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
            <button onClick={copy} className="w-full rounded-lg border border-zinc-600 py-3 text-white">
              {copied ? "Copied" : "Copy link"}
            </button>
            <ol className="list-decimal pl-5 text-sm text-zinc-400 space-y-1">
              <li>In Claude: Settings, Connectors, Add custom connector.</li>
              <li>Paste the link and save.</li>
              <li>Ask Claude to use a tool, then open your dashboard.</li>
            </ol>
          </div>
        )}

        <Link href="/" className="block text-center text-sm text-zinc-400 underline">Back to dashboard</Link>
      </div>
    </main>
  );
}
