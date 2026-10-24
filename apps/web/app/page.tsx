"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Action = {
  actionId: string;
  agentId: string;
  toolName: string;
  parameters: Record<string, any>;
  status: string;
  riskScore: number;
  reason: string;
  paramsHash: string;
  timestamp: string;
};

type AuditLog = {
  index: number;
  timestamp: string;
  actionId: string;
  event: string;
  data: any;
  prevHash: string;
  entryHash: string;
};

function getRiskLevel(score: number) {
  if (score >= 90) return { label: "CRITICAL", color: "text-red-500", bg: "bg-red-500/10", bar: "bg-red-500" };
  if (score >= 70) return { label: "HIGH", color: "text-orange-500", bg: "bg-orange-500/10", bar: "bg-orange-500" };
  if (score >= 30) return { label: "MEDIUM", color: "text-yellow-500", bg: "bg-yellow-500/10", bar: "bg-yellow-500" };
  return { label: "LOW", color: "text-emerald-500", bg: "bg-emerald-500/10", bar: "bg-emerald-500" };
}

export default function Dashboard() {
  const [actions, setActions] = useState<Action[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [chainValid, setChainValid] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'BLOCKED'>('ALL');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const fetchData = async () => {
    try {
      const [actionsRes, auditRes] = await Promise.all([
        fetch("/api/approvals"),
        fetch("/api/audit")
      ]);
      if (actionsRes.ok) setActions(await actionsRes.json());
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditLogs(auditData.logs || []);
        setChainValid(auditData.isValid || false);
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const clearLogs = async () => {
    const token = prompt("Enter Admin Token to clear logs:");
    if (!token) return;
    const res = await fetch("/api/actions/reset", {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!res.ok) alert("Unauthorized.");
    fetchData();
  };

  const handleDecision = async (actionId: string, decision: 'APPROVE' | 'REJECT') => {
    const token = prompt("Enter Admin Token to approve/block:");
    if (!token) return;
    const res = await fetch(`/api/approvals/${actionId}/decision`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({ decision }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error);
    }
    fetchData();
  };

  // New Tile Math
  const pendingCount = actions.filter(a => a.status === 'PENDING').length;
  const approvedCount = actions.filter(a => a.status === 'APPROVED' || a.status === 'EXECUTED').length;
  const allowedCount = actions.filter(a => a.status === 'ALLOWED').length; // ALLOWED count
  const blockedCount = actions.filter(a => a.status === 'BLOCKED' || a.status === 'REJECTED' || a.status === 'EXPIRED').length;

  const filteredActions = actions.filter(a => {
    if (filter === 'ALL') return true;
    if (filter === 'PENDING') return a.status === 'PENDING';
    if (filter === 'APPROVED') return a.status === 'APPROVED' || a.status === 'EXECUTED';
    if (filter === 'BLOCKED') return a.status === 'BLOCKED' || a.status === 'REJECTED' || a.status === 'EXPIRED';
    return true;
  });

  return (
    <main className="min-h-screen bg-[#050505] text-zinc-400 font-mono text-sm selection:bg-emerald-500/30 flex flex-col justify-between">
      <div>
        <div className="border-b border-zinc-800 bg-black px-4 py-3 flex justify-between items-center">
          <span className="text-emerald-500 font-bold tracking-widest text-lg">WALL-A</span>
          <div className="flex items-center gap-4">
            <button onClick={clearLogs} className="border border-red-800 text-red-400 px-2 py-1 text-[10px] hover:bg-red-900/30 transition-colors">CLEAR LOGS</button>
            <Link href="/demo" className="border border-cyan-800 text-cyan-400 px-2 py-1 text-[10px] hover:bg-cyan-900/30">RUN DEMO</Link>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span className="relative rounded-full h-2 w-2 bg-emerald-500"></span></span>
              <span className="text-emerald-500 uppercase text-[10px] hidden sm:inline">Sys.Active</span>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-6 max-w-4xl mx-auto">
          <div className="border border-yellow-500/30 bg-yellow-500/10 text-yellow-500 text-xs px-3 py-2 text-center">
            ⚠️ Public Demo: This dashboard is shared across all visitors. Data is reset periodically.
          </div>
          {/* 5 TILES */}
          <div className="grid grid-cols-5 gap-1 text-center text-xs">
            <div className="border border-zinc-800 bg-black p-2"><div className="text-zinc-500 mb-1">TOTAL</div><div className="text-white font-bold text-lg">{actions.length}</div></div>
            <div className="border border-yellow-500/30 bg-yellow-500/5 p-2"><div className="text-yellow-600 mb-1">PENDING</div><div className="text-yellow-500 font-bold text-lg">{pendingCount}</div></div>
            <div className="border border-emerald-500/30 bg-emerald-500/5 p-2"><div className="text-emerald-600 mb-1">APPROVED</div><div className="text-emerald-500 font-bold text-lg">{approvedCount}</div></div>
            <div className="border border-cyan-500/30 bg-cyan-500/5 p-2"><div className="text-cyan-600 mb-1">ALLOWED</div><div className="text-cyan-500 font-bold text-lg">{allowedCount}</div></div>
            <div className="border border-red-500/30 bg-red-500/5 p-2"><div className="text-red-600 mb-1">BLOCKED</div><div className="text-red-500 font-bold text-lg">{blockedCount}</div></div>
          </div>

          <div className={`flex justify-between items-center border px-3 py-2 text-xs ${chainValid ? 'border-emerald-500/30 text-emerald-500 bg-emerald-500/5' : 'border-red-500/30 text-red-500 animate-pulse bg-red-500/5'}`}>
            <span>CHAIN INTEGRITY:</span><span className="font-bold">{chainValid ? 'VERIFIED' : 'TAMPERED'}</span>
          </div>

          <div className="flex border-b border-zinc-800 text-xs overflow-x-auto">
            {['ALL', 'PENDING', 'APPROVED', 'BLOCKED'].map((tab) => (
              <button key={tab} onClick={() => setFilter(tab as any)} className={`px-4 py-2 uppercase tracking-wider transition-colors border-b-2 whitespace-nowrap ${filter === tab ? 'border-emerald-500 text-emerald-500 bg-emerald-500/10' : 'border-transparent text-zinc-500'}`}>{tab}</button>
            ))}
          </div>

          <div className="space-y-4">
            {filteredActions.map((a) => {
              const risk = getRiskLevel(a.riskScore);
              const isPending = a.status === 'PENDING';
              const isBlocked = a.status === 'BLOCKED' || a.status === 'REJECTED' || a.status === 'EXPIRED';
              const isAllowed = a.status === 'ALLOWED';
              
              return (
                <div key={a.actionId} className={`border bg-[#0a0a0a] ${isPending ? 'border-yellow-500/50' : isBlocked ? 'border-red-500/50' : isAllowed ? 'border-cyan-500/50' : 'border-emerald-500/50 opacity-60'}`}>
                  <div className="flex justify-between items-center px-3 py-2 bg-zinc-900/50 border-b border-zinc-800 text-[10px]">
                    <span className={isPending ? "text-yellow-500 font-bold" : isBlocked ? "text-red-500 font-bold" : isAllowed ? "text-cyan-500 font-bold" : "text-emerald-500 font-bold"}>
                      {isPending ? '⚠ REQUIRE_APPROVAL' : isBlocked ? `⛔ ${a.status}` : `✅ ${a.status}`}
                    </span>
                    <div className="flex gap-2 text-zinc-500">
                      <span>{mounted ? new Date(a.timestamp).toLocaleTimeString([], { hour12: false }) : ''}</span>
                      <span>ID: {a.actionId.split('-')[0]}</span>
                    </div>
                  </div>
                  
                  <div className="p-3 space-y-3">
                    <div className="flex justify-between items-start text-xs border-b border-zinc-800 pb-2">
                      <div className={`max-w-[65%] ${isBlocked ? 'text-red-400' : isPending ? 'text-yellow-400' : isAllowed ? 'text-cyan-400' : 'text-zinc-500'}`}>
                        <span className="text-zinc-600 block mb-1">REASON</span>{a.reason}
                      </div>
                      <div className="text-right">
                        <span className="text-zinc-600 block mb-1">RISK ({a.riskScore}/100)</span>
                        <span className={`${risk.color} ${risk.bg} px-1 py-0.5 font-bold`}>{risk.label}</span>
                        <div className="w-16 h-1 bg-zinc-800 mt-1 ml-auto rounded-full overflow-hidden"><div className={`h-full ${risk.bar}`} style={{ width: `${a.riskScore}%` }}></div></div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div><span className="text-zinc-600 block mb-1">TOOL</span><span className="text-white bg-zinc-900 px-1 py-0.5">{a.toolName}</span></div>
                      <div><span className="text-zinc-600 block mb-1">AGENT</span><span className="text-red-400 bg-red-950/30 px-1 py-0.5">{a.agentId}</span></div>
                    </div>
                    
                    <details className="group">
                      <summary className="cursor-pointer text-zinc-500 text-xs flex items-center gap-1 select-none">
                        <span className="group-open:rotate-90 transition-transform">▶</span> PAYLOAD DATA
                      </summary>
                      <pre className="bg-black border border-zinc-800 p-2 text-xs text-emerald-300 overflow-x-auto mt-2">{JSON.stringify(a.parameters, null, 2)}</pre>
                    </details>

                    {isPending && (
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => handleDecision(a.actionId, 'APPROVE')} className="flex-1 border border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 py-2 text-xs uppercase">[ Approve ]</button>
                        <button onClick={() => handleDecision(a.actionId, 'REJECT')} className="flex-1 border border-red-500/50 text-red-500 hover:bg-red-500/10 py-2 text-xs uppercase">[ Block ]</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-2 pt-4">
            <div className="flex items-center justify-between text-xs text-zinc-500 uppercase tracking-widest">
              <div className="flex items-center gap-2"><span className="text-cyan-500">▶</span> Audit Trail</div>
              <span className="text-[10px] text-zinc-600">ENTRIES: {auditLogs.length}</span>
            </div>
            <div className="bg-black border border-zinc-800 p-3 text-xs font-mono leading-relaxed overflow-x-auto h-64">
              {auditLogs.map((log) => (
                <div key={log.entryHash} className="mb-3">
                  <div className="flex gap-2">
                    <span className="text-zinc-600">[{mounted ? new Date(log.timestamp).toLocaleTimeString([], { hour12: false }) : ''}]</span>
                    <span className="text-cyan-400 font-bold">{log.event}</span>
                    <span className="text-zinc-500">ID: {log.actionId.slice(0, 8)}</span>
                  </div>
                  <div className="text-zinc-400 text-[10px] pl-2 border-l border-zinc-800 ml-2 mt-1">
                    DATA: {JSON.stringify(log.data)}<br />
                    <span className="text-zinc-600">prev: {log.prevHash.slice(0, 16)}...</span><br />
                    <span className="text-emerald-600">hash: {log.entryHash.slice(0, 16)}...</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      <footer className="text-center text-[10px] text-zinc-600 border-t border-zinc-800 py-4 mt-8">© {new Date().getFullYear()} Superwavvy. All rights reserved.</footer>
    </main>
  );
}
