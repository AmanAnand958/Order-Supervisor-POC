"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, Run, Supervisor } from "@/lib/api";

const STATUS_COLORS: Record<string, { badge: string; text: string; dot: string }> = {
  active: {
    badge: "bg-green-500/10 border-green-500/20 text-green-400",
    text: "text-green-400",
    dot: "bg-green-500",
  },
  paused: {
    badge: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
    text: "text-yellow-400",
    dot: "bg-yellow-500",
  },
  completed: {
    badge: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    text: "text-blue-400",
    dot: "bg-blue-500",
  },
  terminated: {
    badge: "bg-gray-500/10 border-gray-500/20 text-gray-400",
    text: "text-gray-400",
    dot: "bg-gray-400",
  },
  error: {
    badge: "bg-red-500/10 border-red-500/20 text-red-400",
    text: "text-red-400",
    dot: "bg-red-500",
  },
};

function RunCard({ run, supervisors }: { run: Run; supervisors: Supervisor[] }) {
  const supervisor = supervisors.find((s) => s.id === run.supervisor_id);
  const statusCfg = STATUS_COLORS[run.status] ?? STATUS_COLORS.error;

  return (
    <Link href={`/runs/${run.id}`} className="block group">
      <div className="bg-gray-900/40 backdrop-blur border border-gray-800/80 rounded-2xl p-6 hover:border-blue-500/30 hover:bg-gray-900/80 transition-all duration-300 relative overflow-hidden flex flex-col justify-between h-full glow-primary">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-500 font-mono tracking-wider uppercase">Order Reference</span>
              <p className="font-bold text-sm text-gray-400 group-hover:text-blue-400 transition-colors font-mono">#{run.order_id}</p>
            </div>
            <span className={`text-[10px] px-2.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.badge}`}>
              {run.status}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Active Supervisor</span>
            <h3 className="font-bold text-white tracking-tight">{supervisor?.name ?? "Unknown Supervisor"}</h3>
          </div>

          {run.memory_summary && (
            <div className="space-y-1 bg-gray-950/40 border border-gray-800/60 rounded-xl p-3">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider font-mono">Compacted Memory</span>
              <p className="text-xs text-gray-400 leading-relaxed font-light line-clamp-2">{run.memory_summary}</p>
            </div>
          )}
        </div>

        <div className="mt-6 pt-4 border-t border-gray-800/80 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-1.5 font-mono text-[10px]">
            <span>{run.turn_count} turn{run.turn_count !== 1 ? "s" : ""}</span>
          </div>
          {run.next_wake_at && run.status === "active" && (
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-[10px]">Wake: {new Date(run.next_wake_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
          <span className="text-[10px]">{new Date(run.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </Link>
  );
}

function RunsPageInner() {
  const searchParams = useSearchParams();
  const preselectedSupervisorId = searchParams.get("supervisor_id");

  const [runs, setRuns] = useState<Run[]>([]);
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(!!preselectedSupervisorId);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Create form state
  const [orderId, setOrderId] = useState("");
  const [selectedSupervisor, setSelectedSupervisor] = useState(preselectedSupervisorId ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([loadRuns(), loadSupervisors()]);
  }, []);

  async function loadRuns() {
    try {
      setLoading(true);
      const data = await api.runs.list();
      setRuns(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load runs");
    } finally {
      setLoading(false);
    }
  }

  async function loadSupervisors() {
    try {
      const data = await api.supervisors.list();
      setSupervisors(data);
      if (!selectedSupervisor && data.length > 0) {
        setSelectedSupervisor(data[0].id);
      }
    } catch {
      // ignore
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const run = await api.runs.create({
        order_id: orderId,
        supervisor_id: selectedSupervisor,
      });
      setShowCreate(false);
      setOrderId("");
      setRuns((prev) => [run, ...prev]);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create run");
    } finally {
      setSubmitting(false);
    }
  }

  const filteredRuns =
    statusFilter === "all" ? runs : runs.filter((r) => r.status === statusFilter);

  const statusCounts = runs.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-gray-800/60 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Active Runs</h1>
          <p className="text-gray-400 text-sm font-light mt-1">Monitor currently execution threads and past operational outcomes</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all duration-200"
        >
          {showCreate ? "Close Panel" : "Start New Run"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-gray-900/40 backdrop-blur border border-gray-800 rounded-2xl p-6 md:p-8 space-y-6 glow-accent"
        >
          <div className="border-b border-gray-800/80 pb-4">
            <h2 className="text-xl font-bold text-white">Start New Supervisor Run</h2>
            <p className="text-xs text-gray-400 mt-0.5 font-light">Binds an order ID to a Temporal supervisor workflow.</p>
          </div>

          {formError && (
            <div className="p-4 bg-red-900/20 border border-red-700/30 rounded-xl text-red-400 text-sm">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Order ID Reference</label>
              <input
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                required
                className="w-full bg-gray-950/80 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-white text-sm transition-all"
                placeholder="e.g. ORD-98921"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Supervisor Config</label>
              <select
                value={selectedSupervisor}
                onChange={(e) => setSelectedSupervisor(e.target.value)}
                required
                className="w-full bg-gray-950/80 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-white text-sm transition-all"
              >
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-800/80">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-5 py-2.5 bg-gray-950 border border-gray-800 hover:border-gray-700 text-gray-300 rounded-xl text-sm font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/25 transition-all"
            >
              {submitting ? "Deploying..." : "Launch Workflow"}
            </button>
          </div>
        </form>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-1.5 bg-gray-900/35 border border-gray-800 p-1 rounded-xl self-start w-fit flex-wrap">
        {["all", "active", "paused", "completed", "terminated"].map((s) => {
          const isActive = statusFilter === s;
          const count = s !== "all" ? statusCounts[s] ?? 0 : runs.length;
          return (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`text-xs px-4 py-2 rounded-lg font-bold capitalize transition-all ${
                isActive
                  ? "bg-gray-800/80 text-white border border-gray-700/50 shadow-sm"
                  : "text-gray-400 hover:text-gray-200"
              }`}
            >
              {s} <span className="text-[10px] ml-1 opacity-60 font-mono">({count})</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-20 font-light">Loading runs...</div>
      ) : error ? (
        <div className="text-center text-red-400 py-20 border border-red-500/10 rounded-2xl bg-red-950/10 space-y-3">
          <p>{error}</p>
          <button onClick={loadRuns} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-all">Retry</button>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-800 rounded-2xl space-y-3">
          <span className="text-4xl inline-block">🚀</span>
          <p className="text-gray-400 font-light">No runs matching the filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRuns.map((r) => (
            <RunCard key={r.id} run={r} supervisors={supervisors} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function RunsPage() {
  return (
    <Suspense fallback={<div className="text-center text-gray-500 py-20">Loading execution context...</div>}>
      <RunsPageInner />
    </Suspense>
  );
}
