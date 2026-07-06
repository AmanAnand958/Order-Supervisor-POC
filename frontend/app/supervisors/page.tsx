"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { api, Supervisor } from "@/lib/api";

const AVAILABLE_TOOLS = [
  "send_customer_message",
  "create_internal_note",
  "escalate_issue",
  "mark_order_for_review",
  "schedule_next_wakeup",
  "close_workflow",
];

const AGGRESSIVENESS_OPTIONS = [
  { value: "low", label: "Low", desc: "Wake on CRITICAL events only" },
  { value: "medium", label: "Medium", desc: "Wake on CRITICAL & HIGH" },
  { value: "high", label: "High", desc: "Wake on CRITICAL, HIGH & MEDIUM" },
];

function SupervisorCard({ supervisor }: { supervisor: Supervisor }) {
  return (
    <div className="bg-gray-900/50 backdrop-blur border border-gray-800/80 rounded-2xl p-6 hover:border-blue-500/40 hover:bg-gray-900/80 transition-all duration-300 relative group flex flex-col justify-between h-full glow-primary">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors">{supervisor.name}</h3>
          <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
            supervisor.wake_policy.aggressiveness === "high"
              ? "bg-red-500/10 border-red-500/20 text-red-400"
              : supervisor.wake_policy.aggressiveness === "medium"
              ? "bg-yellow-500/10 border-yellow-500/20 text-yellow-400"
              : "bg-green-500/10 border-green-500/20 text-green-400"
          }`}>
            {supervisor.wake_policy.aggressiveness}
          </span>
        </div>
        
        <p className="text-sm text-gray-400 leading-relaxed font-light line-clamp-5">{supervisor.base_instruction}</p>
        
        <div className="flex flex-wrap gap-1.5 pt-2">
          {supervisor.tools.map((t) => (
            <span key={t} className="text-[10px] bg-gray-800/60 border border-gray-700/50 text-gray-300 px-2.5 py-1 rounded-md font-mono">
              {t.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-6 pt-5 border-t border-gray-800/80 flex items-center justify-between">
        <div className="flex flex-col">
          <span className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Wake Policy</span>
          <span className="text-xs text-gray-300 font-medium">Every {supervisor.wake_policy.default_interval_minutes}m</span>
        </div>
        <Link
          href={`/runs?supervisor_id=${supervisor.id}`}
          className="px-4 py-2 bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600 hover:border-blue-500 text-blue-400 hover:text-white text-xs font-bold rounded-lg transition-all duration-200"
        >
          Deploy Supervisor →
        </Link>
      </div>
    </div>
  );
}

export default function SupervisorsPage() {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [instruction, setInstruction] = useState("");
  const [selectedTools, setSelectedTools] = useState<string[]>(AVAILABLE_TOOLS);
  const [aggressiveness, setAggressiveness] = useState("medium");
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [model, setModel] = useState("llama-3.3-70b-versatile");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadSupervisors();
  }, []);

  async function loadSupervisors() {
    try {
      setLoading(true);
      const data = await api.supervisors.list();
      setSupervisors(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load supervisors");
    } finally {
      setLoading(false);
    }
  }

  function toggleTool(tool: string) {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      await api.supervisors.create({
        name,
        base_instruction: instruction,
        tools: selectedTools,
        wake_policy: { default_interval_minutes: intervalMinutes, aggressiveness },
        model_config: { model, temperature: 0.3, max_tokens: 1024 },
      });
      setShowCreate(false);
      setName("");
      setInstruction("");
      setSelectedTools(AVAILABLE_TOOLS);
      setAggressiveness("medium");
      setIntervalMinutes(60);
      await loadSupervisors();
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create supervisor");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-gray-800/60 pb-6">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">Supervisors</h1>
          <p className="text-gray-400 text-sm font-light mt-1">Design and configure reusable LLM supervisors for order orchestration</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 transition-all duration-200"
        >
          {showCreate ? "Close Panel" : "Create Supervisor"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-gray-900/40 backdrop-blur border border-gray-800 rounded-2xl p-6 md:p-8 space-y-6 glow-accent"
        >
          <div className="border-b border-gray-800/80 pb-4">
            <h2 className="text-xl font-bold text-white">Create Supervisor</h2>
            <p className="text-xs text-gray-400 mt-0.5">Customize the parameters and LLM model configurations.</p>
          </div>

          {formError && (
            <div className="p-4 bg-red-900/20 border border-red-700/30 rounded-xl text-red-400 text-sm">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Supervisor Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-gray-950/80 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-white text-sm transition-all"
                placeholder="e.g. Standard Order Supervisor"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">LLM Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-gray-950/80 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-white text-sm transition-all"
              >
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                <option value="llama-3.1-70b-versatile">llama-3.1-70b-versatile</option>
                <option value="llama3-70b-8192">llama3-70b-8192</option>
                <option value="llama3-8b-8192">llama3-8b-8192</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">System Instructions</label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              required
              rows={4}
              className="w-full bg-gray-950/80 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-white text-sm transition-all"
              placeholder="Provide context and tools execution guidelines..."
            />
          </div>

          <div className="space-y-3">
            <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Enabled Tools</label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOOLS.map((tool) => {
                const isActive = selectedTools.includes(tool);
                return (
                  <button
                    key={tool}
                    type="button"
                    onClick={() => toggleTool(tool)}
                    className={`text-xs px-4 py-2.5 rounded-xl border font-mono transition-all ${
                      isActive
                        ? "bg-blue-500/10 border-blue-500/40 text-blue-300"
                        : "bg-gray-950/40 border-gray-800 text-gray-500 hover:border-gray-700"
                    }`}
                  >
                    {tool.replace(/_/g, " ")}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Wake Aggressiveness</label>
              <div className="space-y-2">
                {AGGRESSIVENESS_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="aggressiveness"
                      value={opt.value}
                      checked={aggressiveness === opt.value}
                      onChange={(e) => setAggressiveness(e.target.value)}
                      className="text-blue-600 focus:ring-blue-500 border-gray-800 bg-gray-950"
                    />
                    <div>
                      <span className="text-sm text-gray-200 group-hover:text-white transition-colors">{opt.label}</span>
                      <span className="text-xs text-gray-500 block font-light">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-300 uppercase tracking-wider">Default Check-in Interval (minutes)</label>
              <input
                type="number"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                min={5}
                max={1440}
                className="w-full bg-gray-950/80 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-4 py-3 text-white text-sm transition-all"
              />
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
              {submitting ? "Creating..." : "Save Configuration"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-20 font-light">Loading supervisors...</div>
      ) : error ? (
        <div className="text-center text-red-400 py-20 border border-red-500/10 rounded-2xl bg-red-950/10">
          <p>{error}</p>
          <p className="text-xs text-gray-500 mt-2 font-mono">Uvicorn API server might not be running on localhost:8000</p>
        </div>
      ) : supervisors.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gray-800 rounded-2xl space-y-3">
          <span className="text-4xl inline-block">🤖</span>
          <p className="text-gray-400 font-light">No supervisor configurations registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {supervisors.map((s) => (
            <SupervisorCard key={s.id} supervisor={s} />
          ))}
        </div>
      )}
    </div>
  );
}
