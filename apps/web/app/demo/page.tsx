"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const SCENARIOS = [
  { id: "prompt_injection", name: "Prompt Injection", desc: "The agent reads a malicious web page, then gets tricked into emailing secrets to an attacker." },
  { id: "sql_injection", name: "Destructive SQL", desc: "The agent is tricked into running a query that deletes a database table." },
  { id: "path_traversal", name: "Path Traversal", desc: "The agent tries to read a system file outside the folder it is allowed to use." },
  { id: "parameter_swap", name: "Parameter Swap", desc: "A human approves a safe email, then the attacker swaps the recipient before it sends." },
  { id: "approval_replay", name: "Approval Replay", desc: "The attacker tries to reuse an approval that was already used." },
  { id: "gray_area", name: "Gray Area (Approval)", desc: "A legitimate email to a new recipient. A human approves it, then it runs." },
];

function getClientId() {
  if (typeof window === "undefined") return "default";
  try {
    let id = localStorage.getItem("wall-a-client-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("wall-a-client-id", id);
    }
    return id;
  } catch {
    return "default";
  }
}

function logColor(log: string) {
  if (log.includes("BYPASSED") || log.includes("Exploit succeeded")) return "text-red-400";
  if (log.includes("ADMIN")) return "text-yellow-400";
  if (log.includes("WALL-A")) return "text-emerald-400";
  return "text-zinc-300";
}

export default function AttackDemo() {
  const [firewall, setFirewall] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("prompt_injection");
  const [score, setScore] = useState({ blocked: 0, leaked: 0, approved: 0 });
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stop the log animation if the page closes mid-run.
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const scenario = SCENARIOS.find((s) => s.id === selectedScenario)!;

  const runAttack = async (step: "init" | "continue" = "init") => {
    setRunning(true);

    if (step === "init") {
      setLogs([]);
      setResult(null);
      setPendingActionId(null);
    }

    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-client-id": getClientId() },
        body: JSON.stringify({
          firewallEnabled: firewall,
          scenario: selectedScenario,
          step,
          actionId: pendingActionId,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        setLogs((prev) => [...prev, `[SERVER ERROR] ${res.status}: ${errorText}`]);
        setRunning(false);
        return;
      }

      const data = await res.json();
      const lines: string[] = Array.isArray(data.logs) ? data.logs : [];

      let i = 0;
      timer.current = setInterval(() => {
        if (i < lines.length) {
          const line = lines[i]; // copy now, before i changes
          i++;
          if (typeof line === "string") setLogs((prev) => [...prev, line]);
        } else {
          if (timer.current) clearInterval(timer.current);
          setRunning(false);

          if (data.status === "PENDING") {
            setPendingActionId(data.actionId);
            setResult("PENDING");
          } else {
            setResult(data.status);
            if (data.status === "BLOCKED") setScore((s) => ({ ...s, blocked: s.blocked + 1 }));
            else if (data.status === "LEAKED") setScore((s) => ({ ...s, leaked: s.leaked + 1 }));
            else if (data.status === "EXECUTED") setScore((s) => ({ ...s, approved: s.approved + 1 }));
          }
        }
      }, 500);
    } catch {
      setLogs((prev) => [...prev, "[ERROR] Could not reach the server."]);
      setRunning(false);
    }
  };

  const resetDemo = () => {
    setScore({ blocked: 0, leaked: 0, approved: 0 });
    setLogs([]);
    setResult(null);
    setPendingActionId(null);
  };

  const locked = running || result === "PENDING";

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-300 font-mono text-sm p-4 flex flex-col">
      <div className="max-w-2xl mx-auto w-full space-y-6 mt-4">
        <header className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase">Attack Simulation</h1>
            <p className="text-zinc-400 text-xs mt-1">Multi-Vector Security Testing</p>
          </div>
          <button onClick={resetDemo} className="border border-zinc-600 text-zinc-300 px-3 py-2 text-xs hover:bg-zinc-800">RESET</button>
        </header>

        <div className="grid grid-cols-3 gap-2">
          <div className="border border-red-500/30 bg-red-500/5 p-2 text-center">
            <div className="text-[11px] text-red-500 uppercase">Leaked</div>
            <div className="text-xl font-bold text-red-400">{score.leaked}</div>
          </div>
          <div className="border border-cyan-500/30 bg-cyan-500/5 p-2 text-center">
            <div className="text-[11px] text-cyan-500 uppercase">Human Approved</div>
            <div className="text-xl font-bold text-cyan-400">{score.approved}</div>
          </div>
          <div className="border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
            <div className="text-[11px] text-emerald-500 uppercase">Blocked</div>
            <div className="text-xl font-bold text-emerald-400">{score.blocked}</div>
          </div>
        </div>

        <div className="border border-zinc-800 bg-[#0a0a0a] p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-white font-bold tracking-wider">WALL-A FIREWALL</div>
              <div className={`text-xs mt-1 ${firewall ? "text-emerald-400" : "text-red-400"}`}>
                {firewall ? "ON: attacks are checked" : "OFF: attacks go straight through"}
              </div>
            </div>
            <button
              role="switch"
              aria-checked={firewall}
              aria-label="Toggle firewall"
              onClick={() => setFirewall(!firewall)}
              disabled={locked}
              className={`relative inline-flex h-8 w-16 shrink-0 items-center rounded-full transition-colors ${firewall ? "bg-emerald-500" : "bg-zinc-700"} ${locked ? "opacity-50" : ""}`}
            >
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${firewall ? "translate-x-9" : "translate-x-1"}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SCENARIOS.map((s) => (
              <button
                key={s.id}
                disabled={running}
                onClick={() => { setSelectedScenario(s.id); setPendingActionId(null); setResult(null); setLogs([]); }}
                className={`text-xs px-2 py-3 min-h-[48px] border text-center ${selectedScenario === s.id ? "border-cyan-500 text-cyan-300 bg-cyan-500/10" : "border-zinc-700 text-zinc-300"}`}
              >
                {s.name}
              </button>
            ))}
          </div>

          <p className="text-xs text-zinc-300 leading-relaxed">{scenario.desc}</p>
        </div>

        <div className="border border-zinc-800 bg-black p-4 h-64 overflow-y-auto font-mono text-xs leading-relaxed relative">
          {logs.length === 0 && !running && <div className="text-zinc-500 absolute inset-0 flex items-center justify-center">Select a scenario and run.</div>}
          {logs.map((log, i) => (
            <div key={i} className={`mb-2 ${logColor(log)}`}>{log}</div>
          ))}
          {running && <div className="animate-pulse text-zinc-500">_</div>}

          {result === "PENDING" && !running && (
            <div className="mt-4 border border-yellow-500/50 bg-yellow-500/10 p-3">
              <div className="text-yellow-500 font-bold mb-2">⚠️ Action requires human approval.</div>
              <button onClick={() => runAttack("continue")} className="w-full bg-yellow-500 text-black font-bold py-3 hover:bg-yellow-400">[ APPROVE ACTION ]</button>
            </div>
          )}
        </div>

        {result && result !== "PENDING" && (
          <div className={`p-4 border text-center font-bold tracking-widest text-lg ${
            result === "LEAKED" ? "border-red-500/50 bg-red-500/10 text-red-500" :
            result === "EXECUTED" ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-500" :
            "border-emerald-500/50 bg-emerald-500/10 text-emerald-500"
          }`}>
            {result === "LEAKED" ? "⛔ ATTACK SUCCEEDED" : result === "EXECUTED" ? "✅ ACTION EXECUTED" : "🛡️ ATTACK BLOCKED"}
          </div>
        )}

        <div className="flex gap-4">
          <Link href="/" className="flex-1 border border-zinc-700 text-center py-3 text-zinc-300 hover:bg-zinc-900">[ Back ]</Link>
          <button onClick={() => runAttack("init")} disabled={locked} className={`flex-1 border py-3 font-bold ${locked ? "border-zinc-800 text-zinc-600" : "border-white text-black bg-white hover:bg-zinc-200"}`}>{running ? "RUNNING..." : "EXECUTE"}</button>
        </div>
      </div>
    </main>
  );
}
