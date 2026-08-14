/**
 * Hooks API client + shared helpers for the /hooks page.
 *
 * The omniagent backend (src/server/hooks.rs) serves the hooks REST API and
 * wraps every response in `{ "success": true, "data": ... }` — apiGet()
 * unwraps that automatically. JSON keys are snake_case (serde default) and the
 * Express proxy forwards them unchanged, so every read here tolerates both
 * snake_case and camelCase keys (defensive: the task spec mentioned camelCase).
 */
import { apiGet } from "./api";

export interface Hook {
  [key: string]: unknown;
  id: string;
  name: string;
  display_name: string;
  event: string;
  scope: string;
  target: string | null;
  counter: Record<string, unknown>;
  count: number;
  mode: string;
  prompt: string | null;
  action_id: string | null;
  profile: string | null;
  channel_id: string | null;
  plan: boolean;
  template: string | null;
  enabled: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** Read a field from a hook record, accepting snake_case or camelCase keys. */
export function hookField<T>(hook: Record<string, unknown>, snake: string, camel: string): T | undefined {
  const v = hook[snake] ?? hook[camel];
  if (v === undefined || v === null || v === "") return undefined;
  return v as T;
}

/** Human-friendly name for a hook (display_name > name > id). */
export function hookName(hook: Record<string, unknown>): string {
  return (
    hookField<string>(hook, "display_name", "displayName") ||
    hookField<string>(hook, "name", "name") ||
    hookField<string>(hook, "id", "id") ||
    "Unnamed hook"
  );
}

// ── Labels ──
export const EVENT_LABELS: Record<string, string> = {
  thread_started: "Thread Started",
  thread_finished: "Thread Finished",
  new_message: "New Message",
};

export const SCOPE_LABELS: Record<string, string> = {
  global: "Global",
  channel: "Channel",
  profile: "Profile",
};

export const MODE_LABELS: Record<string, string> = {
  agentic: "Agentic",
  action: "Action",
};

// ── Badge classes (match the dashboard design system) ──
export function eventBadgeClass(event: string): string {
  switch (event) {
    case "thread_started":
      return "badge-success";
    case "thread_finished":
      return "badge-info";
    case "new_message":
      return "badge-warning";
    default:
      return "badge-neutral";
  }
}

export function scopeBadgeClass(scope: string): string {
  switch (scope) {
    case "global":
      return "badge-neutral";
    case "channel":
      return "badge-cyan";
    case "profile":
      return "badge-purple";
    default:
      return "badge-neutral";
  }
}

export function modeBadgeClass(mode: string): string {
  switch (mode) {
    case "action":
      return "badge-warning";
    default:
      return "badge-info";
  }
}

/**
 * Parse a hook's counter JSON into an object. Accepts an already-parsed
 * object, a JSON string, or anything else (falls back to {}).
 */
export function parseHookCounter(counter: unknown): Record<string, unknown> {
  if (counter && typeof counter === "object" && !Array.isArray(counter)) {
    return counter as Record<string, unknown>;
  }
  if (typeof counter === "string") {
    try {
      const parsed = JSON.parse(counter);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      /* invalid JSON: fall through */
    }
  }
  return {};
}

/**
 * Format a hook counter for the list: e.g. "global: 3" for global scope, or
 * "ch1: 2, ch2: 1" for channel scope (per-channel counts).
 */
export function formatHookCounter(counter: unknown, scope: string): string {
  const obj = parseHookCounter(counter);
  if (scope === "global") {
    const v = typeof obj.global === "number" ? obj.global : 0;
    return `global: ${v}`;
  }
  const section = scope === "channel" ? obj.channel : scope === "profile" ? obj.profile : undefined;
  const parts: string[] = [];
  if (section && typeof section === "object") {
    for (const [k, v] of Object.entries(section)) {
      if (typeof v === "number") parts.push(`${k}: ${v}`);
    }
  }
  if (parts.length === 0) return "0";
  return parts.join(", ");
}

/** Pretty-print the counter JSON for the read-only form view. */
export function formatHookCounterJson(counter: unknown): string {
  const obj = parseHookCounter(counter);
  if (Object.keys(obj).length === 0) return '{\n  "global": 0\n}';
  return JSON.stringify(obj, null, 2);
}

/** Date formatting shared with the schedule pages. */
export function formatHookDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}

// ── API client ──

export async function fetchHooks(): Promise<Hook[]> {
  const hooks = await apiGet<unknown[]>("/hooks");
  return (hooks || []).map((h) => h as Hook);
}

export async function fetchHook(id: string): Promise<Hook> {
  return apiGet<Hook>("/hooks/" + encodeURIComponent(id));
}
