// API client for Order Supervisor backend

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Supervisor {
  id: string;
  name: string;
  base_instruction: string;
  tools: string[];
  wake_policy: {
    default_interval_minutes: number;
    aggressiveness: "low" | "medium" | "high";
  };
  model_config: {
    model: string;
    temperature: number;
    max_tokens: number;
  };
  created_at: string;
}

export interface Run {
  id: string;
  order_id: string;
  supervisor_id: string;
  status: "active" | "paused" | "completed" | "terminated" | "error";
  next_wake_at: string | null;
  memory_summary: string;
  turn_count: number;
  created_at: string;
  updated_at: string;
}

export interface TimelineEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  source: "system" | "agent" | "user";
  created_at: string;
}

export interface RunDetail extends Run {
  timeline: TimelineEvent[];
  extra_instructions: string[];
  final_output?: {
    summary: string;
    actions_taken: { action: string; timestamp?: string; outcome?: string }[];
    learnings: string;
    recommendations: string;
    created_at: string;
  };
  workflow_status?: string;
  workflow_next_wake_at?: string;
  workflow_paused?: boolean;
}

export interface EventType {
  type: string;
  description: string;
}

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Request failed: ${res.status}`);
  }

  return res.json();
}

// ─── Supervisors ───────────────────────────────

export const api = {
  supervisors: {
    list: () => request<Supervisor[]>("/api/supervisors"),
    get: (id: string) => request<Supervisor>(`/api/supervisors/${id}`),
    create: (data: {
      name: string;
      base_instruction: string;
      tools: string[];
      model_config: { model: string; temperature: number; max_tokens: number };
      wake_policy: { default_interval_minutes: number; aggressiveness: string };
    }) =>
      request<Supervisor>("/api/supervisors", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    availableTools: () => request<string[]>("/api/supervisors/tools/available"),
  },

  runs: {
    list: (status?: string) =>
      request<Run[]>(`/api/runs${status ? `?status=${status}` : ""}`),
    get: (id: string) => request<RunDetail>(`/api/runs/${id}`),
    create: (data: { order_id: string; supervisor_id: string }) =>
      request<Run>("/api/runs", { method: "POST", body: JSON.stringify(data) }),
    sendEvent: (runId: string, eventType: string, payload: Record<string, unknown>) =>
      request(`/api/runs/${runId}/events`, {
        method: "POST",
        body: JSON.stringify({ event_type: eventType, payload }),
      }),
    addInstruction: (runId: string, text: string) =>
      request(`/api/runs/${runId}/instructions`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    interrupt: (runId: string) =>
      request(`/api/runs/${runId}/interrupt`, { method: "POST" }),
    resume: (runId: string) =>
      request(`/api/runs/${runId}/resume`, { method: "POST" }),
    terminate: (runId: string) =>
      request(`/api/runs/${runId}/terminate`, { method: "POST" }),
  },

  eventTypes: () => request<EventType[]>("/api/event-types"),
};
