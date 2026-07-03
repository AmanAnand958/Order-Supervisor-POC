"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, Run, Supervisor } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-900/40 text-green-300 border-green-800",
  paused: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  completed: "bg-blue-900/40 text-blue-300 border-blue-800",
  terminated: "bg-gray-700/40 text-gray-300 border-gray-600",
  error: "bg-red-900/40 text-red-300 border-red-800",
};

function RunCard({ run, supervisors }: { run: Run; supervisors: Supervisor[] }) {
  const supervisor = supervisors.find((s) => s.id === run.supervisor_id);
  const statusColor = STATUS_COLORS[run.status] ?? STATUS_COLORS.error;

  return (
    <Link href={`/runs/${run.id}`}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 hover:bg-gray-900/80 transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-gray-500 font-mono mb-1">Order #{run.order_id}</p>
            <h3 className="font-semibold text-white">{supervisor?.name ?? "Unknown Supervisor"}</h3>
          </div>
          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${statusColor}`}>
            {run.status}
          </span>
        </div>

        {run.memory_summary && (
          <p className="text-sm text-gray-400 mb-3 line-clamp-2">{run.memory_summary}</p>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{run.turn_count} turn{run.turn_count !== 1 ? "s" : ""}</span>
          {run.next_wake_at && run.status === "active" && (
            <span>
              next wake: {new Date(run.next_wake_at).toLocaleTimeString()}
            </span>
          )}
          <span>{new Date(run.created_at).toLocaleDateString()}</span>
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Runs</h1>
          <p className="text-gray-400 text-sm mt-1">Active and completed workflow runs</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showCreate ? "Cancel" : "+ Start Run"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Start New Run</h2>

          {formError && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Order ID</label>
              <input
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="e.g. ORD-12345"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Supervisor</label>
              <select
                value={selectedSupervisor}
                onChange={(e) => setSelectedSupervisor(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                {supervisors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {submitting ? "Starting..." : "Start Workflow"}
            </button>
          </div>
        </form>
      )}

      {/* Status filter pills */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {["all", "active", "paused", "completed", "terminated"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-blue-600/20 border-blue-500 text-blue-300"
                : "border-gray-700 text-gray-400 hover:border-gray-600"
            }`}
          >
            {s} {s !== "all" && statusCounts[s] ? `(${statusCounts[s]})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading runs...</div>
      ) : error ? (
        <div className="text-center text-red-400 py-16">
          <p>{error}</p>
          <p className="text-sm text-gray-500 mt-2">Is the backend running?</p>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="text-center text-gray-500 py-16">
          <p className="text-4xl mb-2">🚀</p>
          <p>No runs yet. Start one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
    <Suspense fallback={<div className="text-center text-gray-500 py-16">Loading...</div>}>
      <RunsPageInner />
    </Suspense>
  );
}
