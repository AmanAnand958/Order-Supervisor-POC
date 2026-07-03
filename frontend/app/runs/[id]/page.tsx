"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, RunDetail, EventType, TimelineEvent } from "@/lib/api";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-900/40 text-green-300 border-green-800",
  paused: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  completed: "bg-blue-900/40 text-blue-300 border-blue-800",
  terminated: "bg-gray-700/40 text-gray-300 border-gray-600",
  error: "bg-red-900/40 text-red-300 border-red-800",
};

const EVENT_ICONS: Record<string, string> = {
  order_created: "🛍️",
  payment_confirmed: "✅",
  payment_failed: "❌",
  shipment_created: "📦",
  shipment_delayed: "⚠️",
  shipment_lost: "🔍",
  out_for_delivery: "🚚",
  delivered: "🎉",
  refund_requested: "↩️",
  refund_approved: "💚",
  refund_rejected: "🚫",
  customer_message_received: "💬",
  customer_complaint_filed: "📢",
  order_cancelled: "🗑️",
  order_modified: "✏️",
  fraud_flag: "🚨",
  no_update_for_n_hours: "⏰",
  agent_turn: "🤖",
  "tool:send_customer_message": "📧",
  "tool:create_internal_note": "📝",
  "tool:escalate_issue": "🔺",
  "tool:mark_order_for_review": "🔎",
  "tool:schedule_next_wakeup": "⏱️",
  "tool:close_workflow": "🏁",
};

function TimelineEntry({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const icon = EVENT_ICONS[event.type] ?? (event.source === "agent" ? "🤖" : "📌");
  const isAgent = event.source === "agent";

  return (
    <div
      className={`flex gap-3 py-3 border-b border-gray-800/50 last:border-0 ${
        isAgent ? "opacity-90" : ""
      }`}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm bg-gray-800 border border-gray-700">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-xs font-medium ${isAgent ? "text-purple-300" : "text-blue-300"}`}>
            {event.type}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded text-gray-500 bg-gray-800`}>
            {event.source}
          </span>
          <span className="text-xs text-gray-600 ml-auto flex-shrink-0">
            {new Date(event.created_at).toLocaleTimeString()}
          </span>
        </div>

        {event.type === "agent_turn" && !!event.payload.reasoning && (
          <p className="text-sm text-gray-300 mb-1">{String(event.payload.reasoning)}</p>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
        >
          {expanded ? "hide payload ▲" : "show payload ▼"}
        </button>

        {expanded && (
          <pre className="mt-2 text-xs bg-gray-800 rounded p-2 overflow-auto text-gray-400 max-h-48">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function CountdownTimer({ targetIso }: { targetIso: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const diff = new Date(targetIso).getTime() - Date.now();
      if (diff <= 0) {
        setRemaining("now");
        return;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}m ${s}s`);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return <span>{remaining}</span>;
}

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.id as string;

  const [run, setRun] = useState<RunDetail | null>(null);
  const [eventTypes, setEventTypes] = useState<EventType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Event injection form
  const [selectedEvent, setSelectedEvent] = useState("");
  const [eventPayloadStr, setEventPayloadStr] = useState("{}");
  const [sendingEvent, setSendingEvent] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);

  // Instruction form
  const [instructionText, setInstructionText] = useState("");
  const [sendingInstruction, setSendingInstruction] = useState(false);

  // Control buttons
  const [controlling, setControlling] = useState(false);
  const [controlMsg, setControlMsg] = useState<string | null>(null);

  const timelineEndRef = useRef<HTMLDivElement>(null);
  const prevTimelineLen = useRef(0);

  const loadRun = useCallback(async () => {
    try {
      const data = await api.runs.get(runId);
      setRun(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load run");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    loadRun();
    api.eventTypes().then(setEventTypes).catch(() => {});
  }, [loadRun]);

  // Poll every 3 seconds if active
  useEffect(() => {
    if (!run || !["active", "paused"].includes(run.status)) return;
    const id = setInterval(loadRun, 3000);
    return () => clearInterval(id);
  }, [run?.status, loadRun]);

  // Auto-scroll to bottom on new timeline events
  useEffect(() => {
    if (run && run.timeline.length > prevTimelineLen.current) {
      prevTimelineLen.current = run.timeline.length;
      timelineEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [run?.timeline.length]);

  async function sendEvent(e: React.FormEvent) {
    e.preventDefault();
    setEventError(null);
    setSendingEvent(true);
    try {
      let payload: Record<string, unknown> = {};
      try {
        payload = JSON.parse(eventPayloadStr);
      } catch {
        throw new Error("Payload must be valid JSON");
      }
      await api.runs.sendEvent(runId, selectedEvent, payload);
      setEventPayloadStr("{}");
      setTimeout(loadRun, 500);
    } catch (e: unknown) {
      setEventError(e instanceof Error ? e.message : "Failed to send event");
    } finally {
      setSendingEvent(false);
    }
  }

  async function sendInstruction(e: React.FormEvent) {
    e.preventDefault();
    setSendingInstruction(true);
    try {
      await api.runs.addInstruction(runId, instructionText);
      setInstructionText("");
      setTimeout(loadRun, 500);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setSendingInstruction(false);
    }
  }

  async function control(action: "interrupt" | "resume" | "terminate") {
    setControlling(true);
    setControlMsg(null);
    try {
      if (action === "interrupt") await api.runs.interrupt(runId);
      else if (action === "resume") await api.runs.resume(runId);
      else await api.runs.terminate(runId);
      setControlMsg(`✓ ${action} signal sent`);
      setTimeout(() => { setControlMsg(null); loadRun(); }, 2000);
    } catch (e: unknown) {
      setControlMsg(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setControlling(false);
    }
  }

  if (loading) return <div className="text-center text-gray-500 py-16">Loading...</div>;
  if (error) return <div className="text-center text-red-400 py-16">{error}</div>;
  if (!run) return null;

  const isActive = run.status === "active";
  const isPaused = run.status === "paused";
  const isDone = ["completed", "terminated"].includes(run.status);
  const liveStatus = run.workflow_status ?? run.status;
  const nextWake = run.workflow_next_wake_at ?? run.next_wake_at;

  return (
    <div className="max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/runs" className="text-gray-500 hover:text-gray-300 text-sm">← Runs</Link>
        <span className="text-gray-700">/</span>
        <span className="font-mono text-sm text-gray-400">Order #{run.order_id}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[liveStatus] ?? STATUS_COLORS.error}`}>
          {liveStatus}
        </span>
        {!isDone && (
          <span className="ml-auto text-xs text-gray-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block animate-pulse" />
            polling…
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Timeline */}
        <div className="col-span-2">
          <div className="bg-gray-900 border border-gray-800 rounded-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
              <h2 className="font-semibold text-white">Timeline</h2>
              <span className="text-xs text-gray-500">{run.timeline.length} events</span>
            </div>
            <div className="max-h-[600px] overflow-y-auto px-5 py-2">
              {run.timeline.length === 0 ? (
                <p className="text-center text-gray-600 py-8 text-sm">No events yet</p>
              ) : (
                run.timeline.map((ev) => <TimelineEntry key={ev.id} event={ev} />)
              )}
              <div ref={timelineEndRef} />
            </div>
          </div>

          {/* Final Output */}
          {run.final_output && (
            <div className="mt-6 bg-gray-900 border border-blue-800/50 rounded-xl p-5">
              <h2 className="font-semibold text-blue-300 mb-3">🏁 Final Summary</h2>
              <p className="text-sm text-gray-300 mb-4">{run.final_output.summary}</p>

              {run.final_output.actions_taken?.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Actions Taken</h3>
                  <ul className="space-y-1">
                    {run.final_output.actions_taken.map((a, i) => (
                      <li key={i} className="text-sm text-gray-300">
                        • {typeof a === "string" ? a : a.action}
                        {typeof a !== "string" && a.outcome && (
                          <span className="text-gray-500"> — {a.outcome}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {run.final_output.learnings && (
                <div className="mb-4">
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Learnings</h3>
                  <p className="text-sm text-gray-300">{run.final_output.learnings}</p>
                </div>
              )}

              {run.final_output.recommendations && (
                <div>
                  <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Recommendations</h3>
                  <p className="text-sm text-gray-300">{run.final_output.recommendations}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Controls */}
        <div className="space-y-5">
          {/* Status Panel */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-gray-300 mb-3">Status</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Status</span>
                <span className="text-white font-medium">{liveStatus}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Turns</span>
                <span className="text-white">{run.turn_count}</span>
              </div>
              {nextWake && !isDone && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Next wake</span>
                  <span className="text-white">
                    <CountdownTimer targetIso={nextWake} />
                  </span>
                </div>
              )}
            </div>

            {/* Memory Summary */}
            {run.memory_summary && (
              <div className="mt-3 pt-3 border-t border-gray-800">
                <p className="text-xs font-medium text-gray-500 mb-1">Memory</p>
                <p className="text-xs text-gray-400 leading-relaxed">{run.memory_summary}</p>
              </div>
            )}
          </div>

          {/* Control Buttons */}
          {!isDone && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Controls</h3>
              {controlMsg && (
                <p className={`text-xs mb-2 ${controlMsg.startsWith("Error") ? "text-red-400" : "text-green-400"}`}>
                  {controlMsg}
                </p>
              )}
              <div className="space-y-2">
                {isActive && (
                  <button
                    onClick={() => control("interrupt")}
                    disabled={controlling}
                    className="w-full py-2 bg-yellow-900/30 hover:bg-yellow-900/50 border border-yellow-800 text-yellow-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    ⏸ Pause (Interrupt)
                  </button>
                )}
                {isPaused && (
                  <button
                    onClick={() => control("resume")}
                    disabled={controlling}
                    className="w-full py-2 bg-green-900/30 hover:bg-green-900/50 border border-green-800 text-green-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    ▶ Resume
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm("Terminate this run? This will trigger the final summary.")) {
                      control("terminate");
                    }
                  }}
                  disabled={controlling}
                  className="w-full py-2 bg-red-900/30 hover:bg-red-900/50 border border-red-800 text-red-300 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  🛑 Terminate
                </button>
              </div>
            </div>
          )}

          {/* Event Injection */}
          {!isDone && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Inject Event</h3>
              <form onSubmit={sendEvent} className="space-y-3">
                {eventError && (
                  <p className="text-xs text-red-400">{eventError}</p>
                )}
                <select
                  value={selectedEvent}
                  onChange={(e) => setSelectedEvent(e.target.value)}
                  required
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                >
                  <option value="">Select event type…</option>
                  {eventTypes.map((et) => (
                    <option key={et.type} value={et.type}>
                      {EVENT_ICONS[et.type] ?? "📌"} {et.type}
                    </option>
                  ))}
                </select>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Payload (JSON)</label>
                  <textarea
                    value={eventPayloadStr}
                    onChange={(e) => setEventPayloadStr(e.target.value)}
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sendingEvent}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {sendingEvent ? "Sending…" : "Send Event →"}
                </button>
              </form>
            </div>
          )}

          {/* Add Instruction */}
          {!isDone && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">Add Instruction</h3>
              <form onSubmit={sendInstruction} className="space-y-3">
                <textarea
                  value={instructionText}
                  onChange={(e) => setInstructionText(e.target.value)}
                  required
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-blue-500"
                  placeholder="e.g. Prioritize customer communication for this order"
                />
                <button
                  type="submit"
                  disabled={sendingInstruction}
                  className="w-full py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  {sendingInstruction ? "Sending…" : "Add Instruction →"}
                </button>
              </form>
            </div>
          )}

          {/* Extra instructions list */}
          {run.extra_instructions?.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Instructions</h3>
              <ul className="space-y-1">
                {run.extra_instructions.map((i, idx) => (
                  <li key={idx} className="text-xs text-gray-400 flex gap-1">
                    <span className="text-purple-500">•</span>
                    {i}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
