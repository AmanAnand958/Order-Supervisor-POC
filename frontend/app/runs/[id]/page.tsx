"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, RunDetail, EventType, TimelineEvent } from "@/lib/api";

const STATUS_COLORS: Record<string, { badge: string; text: string; dot: string }> = {
  active: {
    badge: "bg-green-500/10 border-green-500/20 text-green-400 shadow-sm shadow-green-500/10",
    text: "text-green-400",
    dot: "bg-green-500",
  },
  paused: {
    badge: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400 shadow-sm shadow-yellow-500/10",
    text: "text-yellow-400",
    dot: "bg-yellow-500",
  },
  completed: {
    badge: "bg-blue-500/10 border-blue-500/20 text-blue-400 shadow-sm shadow-blue-500/10",
    text: "text-blue-400",
    dot: "bg-blue-500",
  },
  terminated: {
    badge: "bg-gray-500/10 border-gray-500/20 text-gray-400",
    text: "text-gray-400",
    dot: "bg-gray-450",
  },
  error: {
    badge: "bg-red-500/10 border-red-500/20 text-red-400 shadow-sm shadow-red-500/10",
    text: "text-red-400",
    dot: "bg-red-500",
  },
};

const EVENT_ICONS: Record<string, string> = {
  order_created: "🛍️",
  payment_confirmed: "💳",
  payment_failed: "❌",
  shipment_created: "📦",
  shipment_delayed: "⏳",
  shipment_lost: "🔍",
  out_for_delivery: "🚚",
  delivered: "🎉",
  refund_requested: "↩️",
  refund_approved: "✅",
  refund_rejected: "🚫",
  customer_message_received: "💬",
  customer_complaint_filed: "🚨",
  order_cancelled: "🗑️",
  order_modified: "✏️",
  fraud_flag: "⚠️",
  no_update_for_n_hours: "⏰",
  agent_turn: "🤖",
  "tool:send_customer_message": "📧",
  "tool:create_internal_note": "📝",
  "tool:escalate_issue": "🔺",
  "tool:mark_order_for_review": "🔎",
  "tool:schedule_next_wakeup": "⏱️",
  "tool:close_workflow": "🏁",
};

const TRIGGER_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  workflow_start: { label: "Workflow Start", icon: "🚀", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  signal: { label: "Incoming Event", icon: "📨", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  scheduled_wakeup: { label: "Scheduled Wake-up", icon: "⏰", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20" },
  operator_terminate: { label: "Operator Terminate", icon: "🛑", color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const TOOL_DISPLAY: Record<string, { label: string; icon: string; successMsg: string }> = {
  send_customer_message: { label: "Customer Message Sent", icon: "📧", successMsg: "Recipient: Customer" },
  create_internal_note: { label: "Internal Note Created", icon: "📝", successMsg: "Status: Saved" },
  escalate_issue: { label: "Issue Escalated", icon: "🔺", successMsg: "Ticket: Created" },
  mark_order_for_review: { label: "Order Marked for Review", icon: "🔎", successMsg: "Status: Flagged" },
  schedule_next_wakeup: { label: "Wake-up Scheduled", icon: "⏰", successMsg: "Status: Scheduled" },
  close_workflow: { label: "Workflow Closed", icon: "🏁", successMsg: "Status: Closed" },
};

function AgentTurnCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const trigger = String(event.payload.trigger || "unknown");
  const reasoning = String(event.payload.reasoning || "");
  const toolCalls = (event.payload.tool_calls as { tool: string; args: Record<string, unknown> }[]) || [];
  const nextWake = event.payload.next_wake_minutes as number | undefined;
  const triggerInfo = TRIGGER_LABELS[trigger] || { label: trigger, icon: "🤖", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" };

  return (
    <div className="relative flex gap-4 pl-6 pb-6 last:pb-0 group">
      <div className="absolute left-[11px] top-7 bottom-0 w-[2px] bg-gray-800 group-last:hidden" />
      <div className="absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center text-xs bg-gray-900 border border-purple-500/40 shadow-sm shadow-purple-500/20">
        🤖
      </div>

      <div className="flex-1 bg-gradient-to-br from-purple-950/20 to-gray-900/30 border border-purple-500/20 rounded-xl p-4 space-y-3 hover:border-purple-500/30 transition-colors">
        {/* Header: Trigger + Timestamp */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-purple-400 font-mono">AI Decision</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${triggerInfo.color}`}>
              {triggerInfo.icon} {triggerInfo.label}
            </span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">
            {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {/* Reasoning */}
        {reasoning && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-purple-400/70 uppercase tracking-wider">Reasoning</span>
            <p className="text-sm text-gray-200 leading-relaxed font-light whitespace-pre-line">{reasoning}</p>
          </div>
        )}

        {/* Recommended Actions */}
        {toolCalls.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-purple-400/70 uppercase tracking-wider">Recommended Actions</span>
            <div className="space-y-1.5">
              {toolCalls.map((tc, i) => {
                const info = TOOL_DISPLAY[tc.tool] || { label: tc.tool, icon: "⚡", successMsg: "Done" };
                return (
                  <div key={i} className="flex items-center gap-2 text-sm text-gray-200">
                    <span className="text-green-400 text-xs">✓</span>
                    <span>{info.icon} {info.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Scheduled Wake-up */}
        {nextWake && nextWake > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-400 pt-1 border-t border-purple-500/10">
            <span>⏰</span>
            <span>Next wake-up in <span className="text-white font-bold">{nextWake} minutes</span></span>
          </div>
        )}

        {/* Expand raw payload */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-mono text-gray-500 hover:text-gray-300 cursor-pointer block select-none"
        >
          {expanded ? "[hide payload]" : "[view payload]"}
        </button>
        {expanded && (
          <pre className="text-[10px] bg-gray-950 border border-gray-900 rounded-xl p-3 overflow-auto text-gray-400 max-h-48 font-mono">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ToolCallCard({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const toolName = event.type.replace("tool:", "");
  const info = TOOL_DISPLAY[toolName] || { label: toolName, icon: "⚡", successMsg: "Done" };
  const result = event.payload.result as Record<string, unknown> | undefined;
  const args = event.payload.args as Record<string, unknown> | undefined;
  const status = result?.status as string | undefined;

  return (
    <div className="relative flex gap-4 pl-6 pb-6 last:pb-0 group">
      <div className="absolute left-[11px] top-7 bottom-0 w-[2px] bg-gray-800 group-last:hidden" />
      <div className="absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center text-xs bg-gray-900 border border-gray-850">
        {info.icon}
      </div>

      <div className="flex-1 bg-gray-900/30 border border-gray-850/60 rounded-xl p-4 space-y-2 hover:border-gray-800 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-400 font-mono">{info.icon} {info.label}</span>
            {status && (
              <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-green-500/10 text-green-400 border border-green-500/20">
                ✓ Success
              </span>
            )}
          </div>
          <span className="text-[10px] text-gray-500 font-mono">
            {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {/* Tool details */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {args && Object.entries(args).map(([key, val]) => (
            <div key={key} className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">{key.replace(/_/g, " ")}</span>
              <span className="text-gray-200 font-light">{typeof val === "string" ? val : JSON.stringify(val)}</span>
            </div>
          ))}
          {result && Object.entries(result).filter(([k]) => k !== "status").map(([key, val]) => (
            <div key={key} className="flex flex-col">
              <span className="text-[10px] text-gray-500 uppercase tracking-wider">{key.replace(/_/g, " ")}</span>
              <span className="text-gray-200 font-light">{typeof val === "string" ? val : JSON.stringify(val)}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-mono text-gray-500 hover:text-gray-300 cursor-pointer block select-none"
        >
          {expanded ? "[hide payload]" : "[view payload]"}
        </button>
        {expanded && (
          <pre className="text-[10px] bg-gray-950 border border-gray-900 rounded-xl p-3 overflow-auto text-gray-400 max-h-48 font-mono">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function TimelineEntry({ event }: { event: TimelineEvent }) {
  const [expanded, setExpanded] = useState(false);
  const icon = EVENT_ICONS[event.type] ?? (event.source === "agent" ? "🤖" : "📌");
  const isAgent = event.source === "agent";

  if (event.type === "agent_turn") {
    return <AgentTurnCard event={event} />;
  }

  if (event.type.startsWith("tool:")) {
    return <ToolCallCard event={event} />;
  }

  return (
    <div className={`relative flex gap-4 pl-6 pb-6 last:pb-0 group transition-opacity duration-300 ${
      isAgent ? "opacity-95" : ""
    }`}>
      <div className="absolute left-[11px] top-7 bottom-0 w-[2px] bg-gray-800 group-last:hidden" />
      <div className={`absolute left-0 top-1 w-6 h-6 rounded-full flex items-center justify-center text-xs bg-gray-900 border transition-all duration-200 ${
        isAgent 
          ? "border-purple-500/40 shadow-sm shadow-purple-500/20" 
          : event.source === "user" 
          ? "border-blue-500/30" 
          : "border-gray-850"
      }`}>
        {icon}
      </div>

      <div className="flex-1 bg-gray-900/30 border border-gray-850/60 rounded-xl p-4 space-y-2 hover:border-gray-800 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`text-xs font-bold font-mono tracking-wide ${
              isAgent ? "text-purple-400" : "text-blue-400"
            }`}>
              {event.type}
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
              isAgent 
                ? "bg-purple-500/10 text-purple-400" 
                : event.source === "user" 
                ? "bg-blue-500/10 text-blue-400" 
                : "bg-gray-800 text-gray-400"
            }`}>
              {event.source}
            </span>
          </div>
          <span className="text-[10px] text-gray-500 font-mono">
            {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-[10px] font-mono text-gray-500 hover:text-gray-300 cursor-pointer block select-none"
        >
          {expanded ? "[hide payload]" : "[view payload]"}
        </button>

        {expanded && (
          <pre className="text-[10px] bg-gray-950 border border-gray-900 rounded-xl p-3 overflow-auto text-gray-400 max-h-48 font-mono">
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
        setRemaining("Now");
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

  return <span className="font-mono text-white font-bold">{remaining}</span>;
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
      setControlMsg(`✓ ${action} completed`);
      setTimeout(() => { setControlMsg(null); loadRun(); }, 2000);
    } catch (e: unknown) {
      setControlMsg(`Error: ${e instanceof Error ? e.message : "Unknown"}`);
    } finally {
      setControlling(false);
    }
  }

  if (loading) return <div className="text-center text-gray-500 py-20 font-light">Loading telemetry...</div>;
  if (error) return <div className="text-center text-red-400 py-20 font-light">{error}</div>;
  if (!run) return null;

  const isActive = run.status === "active";
  const isPaused = run.status === "paused";
  const isDone = ["completed", "terminated"].includes(run.status);
  const liveStatus = run.workflow_status ?? run.status;
  const nextWake = run.workflow_next_wake_at ?? run.next_wake_at;
  const statusCfg = STATUS_COLORS[liveStatus] ?? STATUS_COLORS.error;

  return (
    <div className="space-y-6">
      {/* Header breadcrumb bar */}
      <div className="flex items-center gap-2.5 border-b border-gray-800/60 pb-5">
        <Link href="/runs" className="text-gray-400 hover:text-white text-sm font-semibold transition-colors">Runs</Link>
        <span className="text-gray-700 font-mono text-sm">/</span>
        <span className="font-mono text-sm text-gray-300 font-semibold">Order #{run.order_id}</span>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${statusCfg.badge}`}>
          {liveStatus}
        </span>
        {!isDone && (
          <span className="ml-auto text-[10px] text-gray-500 flex items-center gap-1.5 font-semibold uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-pulse shadow-sm shadow-blue-500" />
            Live Monitoring
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left pane: Operations Timeline & Final Summary */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-gray-900/30 border border-gray-800/80 rounded-2xl p-5 md:p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-gray-800/60 pb-4">
              <h2 className="font-bold text-lg text-white">Execution Timeline</h2>
              <span className="text-xs text-gray-500 font-mono">{run.timeline.length} events logged</span>
            </div>
            <div className="max-h-[650px] overflow-y-auto pr-2 space-y-1">
              {run.timeline.length === 0 ? (
                <p className="text-center text-gray-500 py-10 font-light text-sm">Waiting for first execution event...</p>
              ) : (
                run.timeline.map((ev) => <TimelineEntry key={ev.id} event={ev} />)
              )}
              <div ref={timelineEndRef} />
            </div>
          </div>

          {/* Final Summary Card */}
          {run.final_output && (
            <div className="bg-gradient-to-r from-blue-950/20 to-indigo-950/20 border border-blue-500/30 rounded-2xl p-6 space-y-6 glow-primary">
              <div className="border-b border-blue-500/20 pb-4 flex items-center justify-between">
                <h2 className="font-bold text-xl text-blue-300">🏁 Final Summary & Analysis</h2>
                <span className="text-[10px] uppercase font-mono tracking-wider text-blue-400 bg-blue-500/10 px-2.5 py-0.5 rounded-md border border-blue-500/20">Outcome Report</span>
              </div>
              
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-blue-400/80 uppercase tracking-wider font-mono">Overview</span>
                <p className="text-sm text-gray-200 leading-relaxed font-light">{run.final_output.summary}</p>
              </div>

              {run.final_output.actions_taken?.length > 0 && (
                <div className="space-y-3">
                  <span className="text-[10px] font-bold text-blue-400/80 uppercase tracking-wider font-mono">Actions Executed</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {run.final_output.actions_taken.map((a, i) => {
                      const actionDesc = typeof a === "string" ? a : a.action;
                      const outcome = typeof a !== "string" ? a.outcome : null;
                      return (
                        <div key={i} className="bg-gray-950/60 border border-blue-500/10 p-3 rounded-xl flex flex-col justify-between">
                          <span className="text-xs text-gray-200 font-light">{actionDesc}</span>
                          {outcome && (
                            <span className="text-[10px] text-blue-400 font-mono mt-1 pt-1.5 border-t border-gray-900">{outcome}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                {run.final_output.learnings && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-blue-400/80 uppercase tracking-wider font-mono">Key Learnings</span>
                    <p className="text-xs text-gray-300 font-light leading-relaxed bg-gray-950/40 border border-blue-500/5 p-3 rounded-xl">{run.final_output.learnings}</p>
                  </div>
                )}
                {run.final_output.recommendations && (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-blue-400/80 uppercase tracking-wider font-mono">Recommendations</span>
                    <p className="text-xs text-gray-300 font-light leading-relaxed bg-gray-950/40 border border-blue-500/5 p-3 rounded-xl">{run.final_output.recommendations}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right pane: Control Panel, Directives & State variables */}
        <div className="space-y-6">
          {/* Global State metrics */}
          <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5 md:p-6 space-y-4">
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider border-b border-gray-800 pb-2">Supervisor State</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Telemetry Status</span>
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold uppercase tracking-wider ${statusCfg.badge}`}>
                  {liveStatus}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Wake Cycles</span>
                <span className="text-white font-bold font-mono">{run.turn_count} turns</span>
              </div>
              {nextWake && !isDone && (
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Next Scheduled Wake</span>
                  <CountdownTimer targetIso={nextWake} />
                </div>
              )}
            </div>

            {/* Compact Memory display */}
            {run.memory_summary && (
              <div className="pt-4 border-t border-gray-800/80 space-y-2">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono">Active Memory Context</span>
                <p className="text-xs text-gray-300 leading-relaxed font-light bg-gray-950/50 border border-gray-900 p-3.5 rounded-xl">{run.memory_summary}</p>
              </div>
            )}
          </div>

          {/* Action Execution Controls */}
          {!isDone && (
            <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5 md:p-6 space-y-4">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider border-b border-gray-800 pb-2">Manual Interventions</h3>
              
              {controlMsg && (
                <div className={`p-3 rounded-xl border text-xs font-medium ${
                  controlMsg.startsWith("Error") 
                    ? "bg-red-500/10 border-red-500/20 text-red-400" 
                    : "bg-green-500/10 border-green-500/20 text-green-400"
                }`}>
                  {controlMsg}
                </div>
              )}

              <div className="grid grid-cols-1 gap-2.5">
                {isActive && (
                  <button
                    onClick={() => control("interrupt")}
                    disabled={controlling}
                    className="w-full py-3 bg-yellow-500/5 hover:bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 rounded-xl text-xs font-bold transition-all disabled:opacity-50 hover:-translate-y-0.5 cursor-pointer"
                  >
                    ⏸ Pause Execution
                  </button>
                )}
                {isPaused && (
                  <button
                    onClick={() => control("resume")}
                    disabled={controlling}
                    className="w-full py-3 bg-green-500/5 hover:bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-xs font-bold transition-all disabled:opacity-50 hover:-translate-y-0.5 cursor-pointer"
                  >
                    ▶ Resume Execution
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm("Force terminate this run? This will prompt final LLM summary generation.")) {
                      control("terminate");
                    }
                  }}
                  disabled={controlling}
                  className="w-full py-3 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-xs font-bold transition-all disabled:opacity-50 hover:-translate-y-0.5 cursor-pointer"
                >
                  🛑 Force Terminate Run
                </button>
              </div>
            </div>
          )}

          {/* Event Injection Node */}
          {!isDone && (
            <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5 md:p-6 space-y-4">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider border-b border-gray-800 pb-2">Inject Telemetry Event</h3>
              <form onSubmit={sendEvent} className="space-y-4">
                {eventError && (
                  <p className="text-xs text-red-400">{eventError}</p>
                )}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Event Schema Type</label>
                  <select
                    value={selectedEvent}
                    onChange={(e) => setSelectedEvent(e.target.value)}
                    required
                    className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2.5 text-white text-xs font-medium transition-all"
                  >
                    <option value="">Select event...</option>
                    {eventTypes.map((et) => (
                      <option key={et.type} value={et.type}>
                        {et.type}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono">Payload Parameters (JSON)</label>
                  <textarea
                    value={eventPayloadStr}
                    onChange={(e) => setEventPayloadStr(e.target.value)}
                    rows={3}
                    className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2.5 text-white text-xs font-mono transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={sendingEvent}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-500/25 transition-all"
                >
                  {sendingEvent ? "Sending..." : "Inject Event Signal →"}
                </button>
              </form>
            </div>
          )}

          {/* Add Operator Instructions */}
          {!isDone && (
            <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5 md:p-6 space-y-4">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider border-b border-gray-800 pb-2">Directives & Instructions</h3>
              <form onSubmit={sendInstruction} className="space-y-3">
                <textarea
                  value={instructionText}
                  onChange={(e) => setInstructionText(e.target.value)}
                  required
                  rows={3}
                  className="w-full bg-gray-950 border border-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2.5 text-white text-xs transition-all"
                  placeholder="Inject runtime agent instruction (e.g. Prioritize communication, change escalation threshold)..."
                />
                <button
                  type="submit"
                  disabled={sendingInstruction}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-purple-500/25 transition-all"
                >
                  {sendingInstruction ? "Sending..." : "Send Directive →"}
                </button>
              </form>
            </div>
          )}

          {/* Directives History */}
          {run.extra_instructions?.length > 0 && (
            <div className="bg-gray-900/30 border border-gray-800 rounded-2xl p-5 md:p-6 space-y-3">
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider border-b border-gray-800 pb-2">Active Directives</h3>
              <ul className="space-y-2">
                {run.extra_instructions.map((i, idx) => (
                  <li key={idx} className="text-xs text-gray-300 flex items-start gap-2 bg-gray-950/40 border border-gray-900 p-2.5 rounded-lg">
                    <span className="text-purple-400 font-bold font-mono select-none">•</span>
                    <span className="font-light">{i}</span>
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
