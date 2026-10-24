"use client";

import { useState } from "react";
import Link from "next/link";

const SCENARIOS = [
  { id: "prompt_injection", name: "Prompt Injection" },
  { id: "sql_injection", name: "Destructive SQL" },
  { id: "path_traversal", name: "Path Traversal" },
  { id: "parameter_swap", name: "Parameter Swap" },
  { id: "approval_replay", name: "Approval Replay" },
  { id: "gray_area", name: "Gray Area (Approval)" },
];

export default function AttackDemo() {
  const [firewall, setFirewall] = useState(false);
  const [running, setRunning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState("prompt_injection");
  const [score, setScore] = useState({ blocked: 0, leaked: 0, approved: 0 });
  
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  const runAttack = async (step: "init" | "continue" = "init") => {
    setRunning(true);
    
    if (step === "init") {
      setLogs([]);
      setResult(null);
      setPendingActionId(null);
    }

    try {
      // Claude's new API handles the approval internally when step === "continue"
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          firewallEnabled: firewall, 
          scenario: selectedScenario, 
          step, 
          actionId: pendingActionId
        })
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        setLogs(prev => [...prev, `[SERVER ERROR] ${res.status}: ${errorText}`]);
        setRunning(false);
        return;
      }
      
      const data = await res.json();
      
      let i = 0;
      const interval = setInterval(() => {
        if (i < data.logs.length) {
          if (typeof data.logs[i] === 'string') setLogs(prev => [...prev, data.logs[i]]);
          i++;
        } else {
          clearInterval(interval);
          setRunning(false);
          
          if (data.status === 'PENDING') {
            setPendingActionId(data.actionId);
            setResult('PENDING');
          } else {
            setResult(data.status);
            if (data.status === 'BLOCKED') setScore(s => ({ ...s, blocked: s.blocked + 1 }));
            else if (data.status === 'LEAKED') setScore(s => ({ ...s, leaked: s.leaked + 1 }));
            else if (data.status === 'EXECUTED') setScore(s => ({ ...s, approved: s.approved + 1 }));
          }
        }
      }, 500);
    } catch (e) { setRunning(false); }
  };

  const resetDemo = () => {
    setScore({ blocked: 0, leaked: 0, approved: 0 });
    setLogs([]);
    setResult(null);
    setPendingActionId(null);
  };

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-400 font-mono text-sm p-4 flex flex-col">
      <div className="max-w-2xl mx-auto w-full space-y-6 mt-4">
        <header className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-widest uppercase">Attack Simulation</h1>
            <p className="text-zinc-500 text-xs mt-1">Multi-Vector Security Testing</p>
          </div>
          <button onClick={resetDemo} className="border border-zinc-700 text-zinc-400 px-3 py-1 text-xs hover:bg-zinc-800">RESET</button>
        </header>

        <div className="grid grid-cols-3 gap-2">
          <div className="border border-red-500/30 bg-red-500/5 p-2 text-center">
            <div className="text-[10px] text-red-500 uppercase">Leaked</div>
            <div className="text-xl font-bold text-red-400">{score.leaked}</div>
          </div>
          <div className="border border-cyan-500/30 bg-cyan-500/5 p-2 text-center">
            <div className="text-[10px] text-cyan-500 uppercase">Human Approved</div>
            <div className="text-xl font-bold text-cyan-400">{score.approved}</div>
          </div>
          <div className="border border-emerald-500/30 bg-emerald-500/5 p-2 text-center">
            <div className="text-[10px] text-emerald-500 uppercase">Blocked</div>
            <div className="text-xl font-bold text-emerald-400">{score.blocked}</div>
          </div>
        </div>

        <div className="border border-zinc-800 bg-[#0a0a0a] p-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="text-white font-bold tracking-wider">WALL-A FIREWALL</div>
            <button onClick={() => setFirewall(!firewall)} disabled={running} className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${firewall ? 'bg-emerald-500' : 'bg-zinc-700'} ${running ? 'opacity-50' : ''}`}>
              <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${firewall ? 'translate-x-9' : 'translate-x-1'}`} />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {SCENARIOS.map(s => (
              <button key={s.id} onClick={() => { setSelectedScenario(s.id); setPendingActionId(null); setResult(null); setLogs([]); }} className={`text-[10px] p-2 border text-center ${selectedScenario === s.id ? 'border-cyan-500 text-cyan-400 bg-cyan-500/10' : 'border-zinc-800 text-zinc-500'}`}>{s.name}</button>
            ))}
          </div>
        </div>

        <div className="border border-zinc-800 bg-black p-4 h-64 overflow-y-auto font-mono text-xs leading-relaxed relative">
          {logs.length === 0 && !running && <div className="text-zinc-600 absolute inset-0 flex items-center justify-center">Select scenario and run.</div>}
          {logs.map((log, i) => {
            if (typeof log !== 'string') return null;
            return <div key={i} className={`mb-2 ${log.includes('WALL-A') ? 'text-emerald-400' : log.includes('BYPASSED') ? 'text-red-400' : log.includes('ADMIN') ? 'text-yellow-400' : 'text-zinc-300'}`}>{log}</div>;
          })}
          {running && <div className="animate-pulse text-zinc-500">_</div>}
          
          {result === 'PENDING' && !running && (
            <div className="mt-4 border border-yellow-500/50 bg-yellow-500/10 p-3">
              <div className="text-yellow-500 font-bold mb-2">⚠️ Action requires human approval.</div>
              <button onClick={() => runAttack("continue")} className="w-full bg-yellow-500 text-black font-bold py-2 hover:bg-yellow-400">[ APPROVE ACTION ]</button>
            </div>
          )}
        </div>

        {result && result !== 'PENDING' && (
          <div className={`p-4 border text-center font-bold tracking-widest text-lg ${
            result === 'LEAKED' ? 'border-red-500/50 bg-red-500/10 text-red-500' : 
            result === 'EXECUTED' ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-500' :
            'border-emerald-500/50 bg-emerald-500/10 text-emerald-500'
          }`}>
            {result === 'LEAKED' ? '⛔ ATTACK SUCCEEDED' : result === 'EXECUTED' ? '✅ ACTION EXECUTED' : '🛡️ ATTACK BLOCKED'}
          </div>
        )}

        <div className="flex gap-4">
          <Link href="/" className="flex-1 border border-zinc-800 text-center py-3 text-zinc-400 hover:bg-zinc-900">[ Back ]</Link>
          <button onClick={() => runAttack("init")} disabled={running || result === 'PENDING'} className={`flex-1 border py-3 font-bold ${running || result === 'PENDING' ? 'border-zinc-800 text-zinc-600' : 'border-white text-black bg-white hover:bg-zinc-200'}`}>{running ? 'RUNNING...' : 'EXECUTE'}</button>
        </div>
      </div>
    </main>
  );
}
