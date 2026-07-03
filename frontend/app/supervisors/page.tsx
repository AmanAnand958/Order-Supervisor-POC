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
  { value: "low", label: "Low", desc: "Only wake on CRITICAL events" },
  { value: "medium", label: "Medium", desc: "Wake on CRITICAL + HIGH events" },
  { value: "high", label: "High", desc: "Wake on CRITICAL + HIGH + MEDIUM events" },
];

function SupervisorCard({ supervisor }: { supervisor: Supervisor }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-semibold text-white">{supervisor.name}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
          supervisor.wake_policy.aggressiveness === "high"
            ? "bg-red-900/50 text-red-300"
            : supervisor.wake_policy.aggressiveness === "medium"
            ? "bg-yellow-900/50 text-yellow-300"
            : "bg-green-900/50 text-green-300"
        }`}>
          {supervisor.wake_policy.aggressiveness}
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-3 line-clamp-2">{supervisor.base_instruction}</p>
      <div className="flex flex-wrap gap-1 mb-3">
        {supervisor.tools.map((t) => (
          <span key={t} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
            {t.replace(/_/g, " ")}
          </span>
        ))}
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>Wake every {supervisor.wake_policy.default_interval_minutes}min</span>
        <span>{supervisor.model_config.model.split("-")[0]}</span>
      </div>
      <div className="mt-3 pt-3 border-t border-gray-800 flex gap-2">
        <Link
          href={`/runs?supervisor_id=${supervisor.id}`}
          className="flex-1 text-center text-xs py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded transition-colors"
        >
          Start Run →
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
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Supervisors</h1>
          <p className="text-gray-400 text-sm mt-1">Reusable AI supervisor configurations</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {showCreate ? "Cancel" : "+ New Supervisor"}
        </button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-gray-900 border border-gray-700 rounded-xl p-6 mb-8"
        >
          <h2 className="text-lg font-semibold text-white mb-4">Create Supervisor</h2>

          {formError && (
            <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded text-red-300 text-sm">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                placeholder="e.g. Standard Order Supervisor"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="llama-3.3-70b-versatile">llama-3.3-70b-versatile</option>
                <option value="llama-3.1-70b-versatile">llama-3.1-70b-versatile</option>
                <option value="llama3-70b-8192">llama3-70b-8192</option>
                <option value="llama3-8b-8192">llama3-8b-8192</option>
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Base Instruction
            </label>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              required
              rows={4}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              placeholder="You are an order supervisor AI. Your job is to..."
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Available Tools
            </label>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_TOOLS.map((tool) => (
                <button
                  key={tool}
                  type="button"
                  onClick={() => toggleTool(tool)}
                  className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    selectedTools.includes(tool)
                      ? "bg-blue-600/20 border-blue-500 text-blue-300"
                      : "bg-gray-800 border-gray-700 text-gray-500"
                  }`}
                >
                  {tool.replace(/_/g, " ")}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Wake Aggressiveness
              </label>
              <div className="flex flex-col gap-2">
                {AGGRESSIVENESS_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="aggressiveness"
                      value={opt.value}
                      checked={aggressiveness === opt.value}
                      onChange={(e) => setAggressiveness(e.target.value)}
                      className="text-blue-500"
                    />
                    <div>
                      <span className="text-sm text-white">{opt.label}</span>
                      <span className="text-xs text-gray-500 ml-2">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                Default Wake Interval (minutes)
              </label>
              <input
                type="number"
                value={intervalMinutes}
                onChange={(e) => setIntervalMinutes(Number(e.target.value))}
                min={5}
                max={1440}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
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
              {submitting ? "Creating..." : "Create Supervisor"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-16">Loading supervisors...</div>
      ) : error ? (
        <div className="text-center text-red-400 py-16">
          <p>{error}</p>
          <p className="text-sm text-gray-500 mt-2">Is the backend running? <code>uvicorn app.main:app</code></p>
        </div>
      ) : supervisors.length === 0 ? (
        <div className="text-center text-gray-500 py-16">
          <p className="text-4xl mb-2">🤖</p>
          <p>No supervisors yet. Create one above.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {supervisors.map((s) => (
            <SupervisorCard key={s.id} supervisor={s} />
          ))}
        </div>
      )}
    </div>
  );
}
