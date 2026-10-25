"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { JetBrains_Mono, Inter } from "next/font/google";
import {
  Activity,
  Ban,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Link2,
  Lock,
  Play,
  ShieldAlert,
  ShieldCheck,
  Trash2,
} from "lucide-react";

const jb = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jb" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

// JetBrains Mono is used for data: numbers, IDs, tool names, hashes, payloads.
const MONO = "font-[family-name:var(--font-jb)]";

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

type AuthReq =
  | { kind: "decision"; actionId: string; decision: "APPROVE" | "REJECT" }
  | { kind: "clear" };

type Filter = "ALL" | "PENDING" | "APPROVED" | "BLOCKED";

const PILL = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset";

const STATUS: Record<string, { label: string; pill: string; dot: string }> = {
  PENDING: { label: "Needs approval", pill: "bg-amber-400/10 text-amber-300 ring-amber-400/25", dot: "bg-amber-400" },
  APPROVED: { label: "Approved", pill: "bg-indigo-400/10 text-indigo-300 ring-indigo-400/25", dot: "bg-indigo-400" },
  EXECUTING: { label: "Executing", pill: "bg-indigo-400/10 text-indigo-300 ring-indigo-400/25", dot: "bg-indigo-400" },
  EXECUTED: { label: "Executed", pill: "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25", dot: "bg-emerald-400" },
  ALLOWED: { label: "Allowed", pill: "bg-sky-400/10 text-sky-300 ring-sky-400/25", dot: "bg-sky-400" },
  BLOCKED: { label: "Blocked", pill: "bg-rose-400/10 text-rose-300 ring-rose-400/25", dot: "bg-rose-400" },
  REJECTED: { label: "Rejected", pill: "bg-rose-400/10 text-rose-300 ring-rose-400/25", dot: "bg-rose-400" },
  EXPIRED: { label: "Expired", pill: "bg-slate-400/10 text-slate-300 ring-slate-400/25", dot: "bg-slate-400" },
  FAILED: { label: "Failed", pill: "bg-orange-400/10 text-orange-300 ring-orange-400/25", dot: "bg-orange-400" },
};
const FALLBACK = { label: "Unknown", pill: "bg-slate-400/10 text-slate-300 ring-slate-400/25", dot: "bg-slate-400" };

const APPROVED_SET = ["APPROVED", "EXECUTING", "EXECUTED"];
const BLOCKED_SET = ["BLOCKED", "REJECTED", "EXPIRED", "FAILED"];

const EVENT_LABEL: Record<string, string> = {
  ACTION_EVALUATED: "Evaluated",
  HUMAN_DECISION: "Human decision",
  ACTION_EXECUTED: "Executed",
  ACTION_FAILED: "Execution failed",
  AGENT_TAINTED: "Session tainted",
  TOCTOU_ATTACK_BLOCKED: "Tampering blocked",
};

function getClientId() {
  if (typeof window === "undefined") return "default";
  const ws = new URLSearchParams(window.location.search).get("ws");
  if (ws && /^[A-Za-z0-9_-]{1,64}$/.test(ws)) {
    localStorage.setItem("wall-a-client-id", ws);
    window.history.replaceState(null, "", window.location.pathname);
  }
  let id = localStorage.getItem("wall-a-client-id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("wall-a-client-id", id);
  }
  return id;
}

function riskMeta(score: number) {
  if (score >= 90) return { label: "Critical", color: "#f43f5e", text: "text-rose-300" };
  if (score >= 70) return { label: "High", color: "#fb923c", text: "text-orange-300" };
  if (score >= 30) return { label: "Medium", color: "#fbbf24", text: "text-amber-300" };
  return { label: "Low", color: "#34d399", text: "text-emerald-300" };
}

function rel(ts?: string) {
  if (!ts) return "";
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function clock(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour12: false });
}

function StatusPill({ status }: { status: string }) {
  const st = STATUS[status] ?? FALLBACK;
  return (
    <span className={`${PILL} ${st.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${st.dot} ${status === "PENDING" || status === "EXECUTING" ? "animate-pulse" : ""}`} />
      {st.label}
    </span>
  );
}

function RiskBadge({ score }: { score: number }) {
  const r = riskMeta(score);
  return (
    <span className={`inline-flex items-center gap-2 text-[11px] ${MONO} ${r.text}`}>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-white/10">
        <span
          className="block h-full rounded-full"
          style={{ width: `${Math.min(100, Math.max(0, score))}%`, background: r.color }}
        />
      </span>
      {r.label} {score}
    </span>
  );
}

function Stat({
  label,
  value,
  caption,
  icon: Icon,
  tint,
  className = "",
}: {
  label: string;
  value: number;
  caption?: string;
  icon: any;
  tint: string;
  className?: string;
}) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{label}</span>
        <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${tint}1f` }}>
          <Icon className="h-3.5 w-3.5" style={{ color: tint }} />
        </span>
      </div>
      <div className={`mt-3 text-3xl font-semibold tracking-tight text-white ${MONO}`}>{value}</div>
      {caption && <div className="mt-1 text-[11px] text-slate-500">{caption}</div>}
    </div>
  );
}

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-white/[0.05] ${className}`} />;
}

export default function Dashboard() {
  const [actions, setActions] = useState<Action[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [chainValid, setChainValid] = useState(true);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clientId, setClientId] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ msg: string; tone: "ok" | "err" } | null>(null);
  const [authReq, setAuthReq] = useState<AuthReq | null>(null);
  const [tokenInput, setTokenInput] = useState("");
  const [authError, setAuthError] = useState("");
  const [busy, setBusy] = useState(false);
  const tokenRef = useRef(""); // kept in memory only, never saved

  useEffect(() => {
    setMounted(true);
    setClientId(getClientId());
  }, []);

  const notify = (msg: string, tone: "ok" | "err" = "ok") => {
    setToast({ msg, tone });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchData = async () => {
    try {
      const cid = getClientId();
      const [actionsRes, auditRes] = await Promise.all([
        fetch("/api/approvals", { headers: { "x-client-id": cid } }),
        fetch("/api/audit", { headers: { "x-client-id": cid } }),
      ]);
      if (actionsRes.ok) setActions(await actionsRes.json());
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditLogs(auditData.logs || []);
        setChainValid(auditData.isValid || false);
      }
    } catch (e) {
      // keep the last good data on screen
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted) {
      fetchData();
      const interval = setInterval(fetchData, 3000);
      return () => clearInterval(interval);
    }
  }, [mounted]);

  const send = async (req: AuthReq, token: string) => {
    setBusy(true);
    try {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "x-client-id": getClientId(),
      };
      let res: Response;
      if (req.kind === "decision") {
        headers["Content-Type"] = "application/json";
        res = await fetch(`/api/approvals/${req.actionId}/decision`, {
          method: "POST",
          headers,
          body: JSON.stringify({ decision: req.decision }),
        });
      } else {
        res = await fetch("/api/actions/reset", { method: "DELETE", headers });
      }

      if (res.status === 401) {
        tokenRef.current = "";
        setAuthError("That token was not accepted. Try again.");
        setAuthReq(req);
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        notify(err.error || "Request failed", "err");
      } else {
        notify(req.kind === "clear" ? "Logs cleared" : req.decision === "APPROVE" ? "Action approved" : "Action rejected");
      }
      await fetchData();
    } catch (e) {
      notify("Network error", "err");
    } finally {
      setBusy(false);
    }
  };

  const requestAuthed = (req: AuthReq) => {
    if (tokenRef.current) {
      send(req, tokenRef.current);
      return;
    }
    setAuthError("");
    setTokenInput("");
    setAuthReq(req);
  };

  const confirmAuth = () => {
    if (!authReq || !tokenInput.trim()) return;
    const req = authReq;
    tokenRef.current = tokenInput.trim();
    setAuthReq(null);
    setTokenInput("");
    send(req, tokenRef.current);
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      notify("Copied");
    } catch (e) {
      notify("Copy failed", "err");
    }
  };

  const pending = actions.filter((a) => a.status === "PENDING");
  const approvedCount = actions.filter((a) => APPROVED_SET.includes(a.status)).length;
  const allowedCount = actions.filter((a) => a.status === "ALLOWED").length;
  const blockedCount = actions.filter((a) => BLOCKED_SET.includes(a.status)).length;

  const filtered = actions.filter((a) => {
    if (filter === "ALL") return true;
    if (filter === "PENDING") return a.status === "PENDING";
    if (filter === "APPROVED") return APPROVED_SET.includes(a.status);
    return BLOCKED_SET.includes(a.status);
  });

  const tabCount: Record<Filter, number> = {
    ALL: actions.length,
    PENDING: pending.length,
    APPROVED: approvedCount,
    BLOCKED: blockedCount,
  };

  const integrity =
    auditLogs.length === 0
      ? { label: "NO EVENTS YET", tone: "neutral" as const, note: "The chain starts with the first logged event." }
      : chainValid
      ? { label: "VERIFIED", tone: "ok" as const, note: "Every entry links to the one before it." }
      : { label: "TAMPERED", tone: "bad" as const, note: "The audit log no longer matches its hash chain." };

  if (!mounted) return null;

  return (
    <div
      className={`${jb.variable} ${inter.variable} min-h-screen text-slate-300 selection:bg-indigo-500/30`}
      style={{
        fontFamily: "var(--font-inter), system-ui, sans-serif",
        background:
          "radial-gradient(900px 420px at 50% -120px, rgba(99,91,255,0.22), transparent 70%), #0a0d1a",
      }}
    >
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0a0d1a]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg shadow-[0_4px_14px_rgba(99,91,255,0.45)]"
              style={{ background: "linear-gradient(180deg,#7a73ff,#635bff)" }}
            >
              <ShieldCheck className="h-4 w-4 text-white" />
            </span>
            <span className={`text-sm font-semibold tracking-[0.18em] text-white ${MONO}`}>WALL-A</span>
          </div>

          <div className="flex items-center gap-3">
            <span className={`hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[11px] text-slate-400 sm:flex ${MONO}`}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              live
            </span>
            <Link
              href="/demo"
              className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-white shadow-[0_4px_14px_rgba(99,91,255,0.35)] transition-opacity hover:opacity-90"
              style={{ background: "linear-gradient(180deg,#7a73ff,#635bff)" }}
            >
              <Play className="h-3.5 w-3.5" /> Run demo
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8 sm:px-6">
        {/* HERO */}
        <section>
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Overview</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-400">
            Every action your agents attempt, scored and decided before it runs.
          </p>
          <div className={`mt-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-slate-400 ${MONO}`}>
            <Link2 className="h-3 w-3" /> workspace {clientId.slice(0, 8)}
          </div>
        </section>

        {/* STATS */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)
          ) : (
            <>
              <Stat label="Total actions" value={actions.length} icon={Activity} tint="#635bff" className="col-span-2 sm:col-span-1" />
              <Stat label="Pending" value={pending.length} icon={Clock} tint="#fbbf24" />
              <Stat label="Approved" value={approvedCount} icon={ShieldCheck} tint="#a5b4fc" />
              <Stat label="Allowed" value={allowedCount} icon={ShieldCheck} tint="#38bdf8" />
              <Stat label="Blocked" value={blockedCount} caption="incl. rejected and expired" icon={Ban} tint="#fb7185" />
            </>
          )}
        </section>

        {/* NEEDS APPROVAL */}
        {pending.length > 0 && (
          <section className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.04] p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-400/15">
                <ShieldAlert className="h-3.5 w-3.5 text-amber-300" />
              </span>
              <h2 className="text-base font-semibold text-white">Needs your approval</h2>
              <span className={`rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-300 ${MONO}`}>
                {pending.length}
              </span>
            </div>

            <div className="space-y-3">
              {pending.map((a) => (
                <div key={a.actionId} className="rounded-xl border border-white/10 bg-[#0a0d1a]/70 p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className={`text-sm font-semibold text-white ${MONO}`}>{a.toolName}</span>
                    <RiskBadge score={a.riskScore} />
                    <span className={`text-[11px] text-slate-500 ${MONO}`}>{a.agentId} · {rel(a.timestamp)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-slate-400">{a.reason}</p>
                  <pre className={`mt-3 max-h-36 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs leading-relaxed text-indigo-200 ${MONO}`}>
                    {JSON.stringify(a.parameters, null, 2)}
                  </pre>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => requestAuthed({ kind: "decision", actionId: a.actionId, decision: "APPROVE" })}
                      disabled={busy}
                      className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white shadow-[0_4px_14px_rgba(99,91,255,0.35)] transition-opacity hover:opacity-90 disabled:opacity-50 sm:flex-none"
                      style={{ background: "linear-gradient(180deg,#7a73ff,#635bff)" }}
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => requestAuthed({ kind: "decision", actionId: a.actionId, decision: "REJECT" })}
                      disabled={busy}
                      className="flex-1 rounded-lg border border-rose-400/30 px-4 py-2.5 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-400/10 disabled:opacity-50 sm:flex-none"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* INTEGRITY */}
        <section
          className={`flex items-center justify-between gap-4 rounded-2xl border p-4 sm:p-5 ${
            integrity.tone === "ok"
              ? "border-emerald-400/20 bg-emerald-400/[0.04]"
              : integrity.tone === "bad"
              ? "border-rose-400/25 bg-rose-400/[0.05]"
              : "border-white/10 bg-white/[0.03]"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${
                integrity.tone === "ok" ? "bg-emerald-400/15" : integrity.tone === "bad" ? "bg-rose-400/15" : "bg-white/10"
              }`}
            >
              <Lock
                className={`h-4 w-4 ${
                  integrity.tone === "ok" ? "text-emerald-300" : integrity.tone === "bad" ? "text-rose-300" : "text-slate-400"
                }`}
              />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Audit chain integrity</p>
              <p className="text-xs text-slate-500">{integrity.note}</p>
            </div>
          </div>
          <span
            className={`${PILL} ${MONO} ${
              integrity.tone === "ok"
                ? "bg-emerald-400/10 text-emerald-300 ring-emerald-400/25"
                : integrity.tone === "bad"
                ? "animate-pulse bg-rose-400/10 text-rose-300 ring-rose-400/25"
                : "bg-white/5 text-slate-400 ring-white/10"
            }`}
          >
            {integrity.label}
          </span>
        </section>

        {/* ACTIVITY */}
        <section className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-white">Recent activity</h2>
            <div className="flex w-full gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1 sm:w-auto">
              {(["ALL", "PENDING", "APPROVED", "BLOCKED"] as Filter[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:flex-none ${
                    filter === tab ? "bg-white/10 text-white" : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  {tab.charAt(0) + tab.slice(1).toLowerCase()}
                  <span className={`text-[10px] text-slate-500 ${MONO}`}>{tabCount[tab]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
            {loading ? (
              <div className="space-y-3 p-4">
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
                <Skeleton className="h-14" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/5">
                  <ShieldCheck className="h-5 w-5 text-slate-500" />
                </span>
                <p className="text-sm text-slate-400">Nothing here yet.</p>
                <Link href="/demo" className="text-sm font-medium text-indigo-300 hover:text-indigo-200">
                  Run an attack simulation
                </Link>
              </div>
            ) : (
              filtered.map((a) => {
                const st = STATUS[a.status] ?? FALLBACK;
                const open = openId === a.actionId;
                const events = auditLogs
                  .filter((l) => l.actionId === a.actionId)
                  .sort((x, y) => x.index - y.index);

                return (
                  <div key={a.actionId} className="border-b border-white/5 last:border-0">
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setOpenId(open ? null : a.actionId)}
                      className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-white/[0.03] sm:px-5"
                    >
                      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${st.dot}`} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                          <span className={`text-sm font-semibold text-white ${MONO}`}>{a.toolName}</span>
                          <StatusPill status={a.status} />
                          <RiskBadge score={a.riskScore} />
                        </span>
                        <span className="mt-1.5 block truncate text-sm text-slate-400">{a.reason}</span>
                        <span className={`mt-1 block truncate text-[11px] text-slate-500 ${MONO}`}>
                          {a.agentId} · {rel(a.timestamp)}
                        </span>
                      </span>
                      <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180" : ""}`} />
                    </button>

                    {open && (
                      <div className="space-y-4 border-t border-white/5 bg-black/20 px-4 py-4 sm:px-5">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-slate-500">Action ID</div>
                            <button
                              onClick={() => copy(a.actionId)}
                              className={`mt-1 flex items-center gap-2 text-xs text-slate-300 hover:text-white ${MONO}`}
                            >
                              {a.actionId.slice(0, 18)}… <Copy className="h-3 w-3" />
                            </button>
                          </div>
                          <div>
                            <div className="text-[11px] uppercase tracking-wider text-slate-500">Payload hash (SHA-256)</div>
                            <button
                              onClick={() => copy(a.paramsHash)}
                              className={`mt-1 flex items-center gap-2 text-xs text-slate-300 hover:text-white ${MONO}`}
                            >
                              {(a.paramsHash || "").slice(0, 18)}… <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="mb-1.5 text-[11px] uppercase tracking-wider text-slate-500">Payload</div>
                          <pre className={`max-h-48 overflow-auto rounded-lg border border-white/10 bg-black/40 p-3 text-xs leading-relaxed text-indigo-200 ${MONO}`}>
                            {JSON.stringify(a.parameters, null, 2)}
                          </pre>
                        </div>

                        {events.length > 0 && (
                          <div>
                            <div className="mb-2 text-[11px] uppercase tracking-wider text-slate-500">Timeline</div>
                            <ol className="space-y-2">
                              {events.map((l) => (
                                <li key={l.entryHash} className="flex items-center gap-3 text-xs">
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  <span className="text-slate-300">{EVENT_LABEL[l.event] ?? l.event}</span>
                                  <span className={`text-slate-600 ${MONO}`}>{clock(l.timestamp)}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* AUDIT TRAIL */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Audit trail</h2>
            <button
              onClick={() => requestAuthed({ kind: "clear" })}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-rose-400/30 hover:text-rose-300 disabled:opacity-50"
            >
              <Trash2 className="h-3 w-3" /> Clear logs
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 sm:p-5">
            {loading ? (
              <div className="space-y-3">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
            ) : auditLogs.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">
                No events yet. Run a demo or connect an agent to start the chain.
              </p>
            ) : (
              <ol className="relative max-h-96 space-y-5 overflow-y-auto border-l border-white/10 pl-5">
                {auditLogs.map((log) => (
                  <li key={log.entryHash} className="relative">
                    <span className="absolute -left-[25px] top-1.5 h-2 w-2 rounded-full bg-indigo-400 ring-4 ring-[#0a0d1a]" />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-white">{EVENT_LABEL[log.event] ?? log.event}</span>
                      <span className={`text-[11px] text-slate-500 ${MONO}`}>{clock(log.timestamp)}</span>
                      <span className={`rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400 ${MONO}`}>
                        {(log.actionId || "").slice(0, 8)}
                      </span>
                    </div>
                    <p className={`mt-1 truncate text-[11px] text-slate-500 ${MONO}`}>{JSON.stringify(log.data)}</p>
                    <p className={`mt-0.5 text-[11px] text-indigo-300/70 ${MONO}`}>
                      #{log.index} · {(log.entryHash || "").slice(0, 14)}…
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} WALL-A Security
      </footer>

      {/* TOKEN MODAL */}
      {authReq && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setAuthReq(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0f1426] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-white">
              {authReq.kind === "clear"
                ? "Clear all logs?"
                : authReq.decision === "APPROVE"
                ? "Approve this action?"
                : "Reject this action?"}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              {authReq.kind === "clear"
                ? "This removes the actions and audit trail. It cannot be undone."
                : "Enter the admin token to continue. It is kept in memory for this tab only."}
            </p>
            <input
              type="password"
              autoFocus
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirmAuth()}
              placeholder="Admin token"
              className={`mt-4 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400/60 ${MONO}`}
            />
            {authError && <p className="mt-2 text-xs text-rose-300">{authError}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setAuthReq(null)}
                className="flex-1 rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
              >
                Cancel
              </button>
              <button
                onClick={confirmAuth}
                disabled={!tokenInput.trim()}
                className="flex-1 rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                style={{ background: "linear-gradient(180deg,#7a73ff,#635bff)" }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full border px-4 py-2 text-sm shadow-lg backdrop-blur ${
            toast.tone === "ok"
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-400/10 text-rose-200"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}
