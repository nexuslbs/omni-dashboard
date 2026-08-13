export const API_BASE = "/api";

export interface HealthCheck {
  status: string;
  version: string;
  uptime: number;
}

export interface SystemStats {
  cpu: { usage: number; cores: number };
  memory: { total: number; used: number; percent: number };
  disk: { total: number; used: number; percent: number };
  uptime: number;
  messages_today: number;
}

export interface Message {
  [key: string]: unknown;
  id: number;
  channel_id: number | null;
  role: string;
  content: string | null;
  status: string;
  thread_id: string | null;
  thread_sequence: number | null;
  external_id: string | null;
  metadata: string | null;
  embedding: string | null;
  summary_text: string | null;
  is_summary: boolean | null;
  created_at: string;
  profile: string | null;
  provider: string | null;
  model: string | null;
  processing_time_ms: number | null;
  token_usage: TokenUsage | null;
  channel_name?: string;
  type: string | null;
  subtype: string | null;
  thread_status: string | null;
  iteration_number: number | null;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
}

export interface OverviewRow {
  [key: string]: unknown;
  id: number;
  content_preview: string | null;
  status: string;
  thread_id: string | null;
  thread_count: number;
  processing_time_ms: number | null;
  prompt_tokens: number;
  completion_tokens: number;
  created_at: string;
  channel_name: string | null;
  model: string | null;
}

// ── Dashboard Types ──

export interface DashboardKpis {
  threads_today: number;
  avg_response_time: number;
  tokens_today: number;
  active_channels: number;
  threads_yesterday: number;
  avg_response_yesterday: number;
  tokens_yesterday: number;
}

export interface HourlyBucket {
  bucket: string;
  count: number;
}

export interface StatusCount {
  status: string;
  count: number;
}

export interface DailyTokens {
  day: string;
  tokens: number;
}

export interface ChannelHealthRow {
  name: string;
  threads_today: number;
  avg_duration: number;
  success_rate: number;
  last_activity: string;
}

export interface ToolUsage {
  tool: string;
  count: number;
}

export interface DashboardData {
  kpis: DashboardKpis;
  threads_over_time: HourlyBucket[];
  status_distribution: StatusCount[];
  token_trend: DailyTokens[];
  recent_activity: OverviewRow[];
  channel_health: ChannelHealthRow[];
  top_tools: ToolUsage[];
  // Kanban snapshot is fetched separately
}

export interface Channel {
  id: number;
  name: string;
  platform: string;
}

export interface MessagesResponse {
  messages: Message[];
  total: number;
  offset: number;
  limit: number;
}

export interface MessagesFilters {
  channels: { id: number; name: string; count: number }[];
  roles: string[];
  providers: string[];
  models: string[];
  types: string[];
  subtypes: string[];
}

export interface WikiSearchResult {
  file_path: string;
  section_title: string;
  score: number;
  content_preview: string;
}

export interface SearchResult {
  file_path: string;
  section_title: string;
  score: number;
  content_preview: string;
  url: string;
}

export interface FsEntry {
  name: string;
  path: string;
  type: "file" | "directory";
  size: number | null;
}

export interface FsListResponse {
  entries: FsEntry[];
  path: string;
  root?: string;
  error?: string;
}

export interface FsReadResponse {
  content: string;
  size: number;
  binary: boolean;
}

export interface FsDiffResponse {
  diff: string;
}

export interface UploadResponse {
  files: {
    original_name: string;
    size: number;
    mime_type: string;
    path: string;
  }[];
}

export interface UploadListEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified_at: string;
}

// ── Git Types ──

export interface GitFileEntry {
  path: string;
  status: "M" | "U" | "D" | "R";
}

export interface GitStatusResponse {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  unstaged: GitFileEntry[];
}

// ── Kanban Types ──

export interface KanbanBoard {
  [key: string]: unknown;
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface KanbanBoardsResponse {
  boards: KanbanBoard[];
}

export interface KanbanTask {
  [key: string]: unknown;
  id: string;
  display_id?: number;
  title: string;
  body: string | null;
  assignee: string | null;
  channel_id: string | null;
  profile: string | null;
  status: string;
  priority: number;
  position?: number;
  board_id?: string;
  archived?: boolean;
  planning_mode?: string | null;
  plan?: boolean;
  created_at: string;
  updated_at: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  tasks: KanbanTask[];
}

export interface KanbanBoardResponse {
  columns: KanbanColumn[];
  total: number;
}

// ── Cron/Schedule Types ──

export interface CronJob {
  [key: string]: unknown;
  id: string;
  name: string;
  schedule: string;
  prompt_preview: string;
  prompt?: string;
  skills: string[];
  enabled: boolean;
  script?: string | null;
  context_from?: string | string[] | null;
  no_agent?: boolean;
  enabled_toolsets?: string | string[] | null;
  workdir?: string | null;
  profile?: string | null;
  deliver?: string | null;
  repeat?: number | null;
  mode?: string;
  direct_task_type?: string;
  active?: boolean;
  channel_id?: number;
  last_run: string | null;
  next_run: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  status: string;
}

// ── Settings Types ──

export interface SettingOption {
  [key: string]: unknown;
  value: string;
  label: string;
}

export interface SettingMeta {
  type: "number" | "boolean" | "secret" | "select" | "text" | "textarea";
  description: string;
  options: SettingOption[] | null;
  readonly: boolean;
  default: string;
}

export interface SettingEntry {
  name: string;
  value: string;
  metadata: SettingMeta;
}

export interface SettingCategory {
  [key: string]: unknown;
  name: string;
  label: string;
  settings: SettingEntry[];
}

// ── Profile Types ──

export interface ProfileChannel {
  id: number;
  name: string;
  platform: string;
  resource_identifier: string;
}

export interface ProfileData {
  [key: string]: unknown;
  name: string;
  provider: string | null;
  model: string | null;
  allowed_tools: string[]; // array of tool names
  skills: string[]; // filenames from filesystem
  all_tools: string[]; // available options for multi-select
}

// ── Channel Types ──

export interface ChannelData {
  [key: string]: unknown;
  id: number;
  name: string;
  platform: string | null;
  resource_identifier: string | null;
  closed: boolean;
  current_profile: string | null;
  current_provider: string | null;
  current_model: string | null;
  readonly: boolean;
  plan: boolean;
  planning_mode?: string | null;
  template: string | null;
}

// ── Platform Types ──

export interface PlatformResourceId {
  id: number;
  channel_id: number;
  channel_name: string;
  resource_identifier: string | null;
  closed: boolean;
  profile: string | null;
}

export interface PlatformData {
  name: string;
  active: boolean;
  resource_identifiers: PlatformResourceId[];
  all_channels: { id: number; name: string; platform: string; resource_identifier: string }[];
}

// ── Plugin Types ──

export interface ConfigField {
  [key: string]: unknown;
  key: string;
  label: string;
  type:
    | "string"
    | "secret"
    | "boolean"
    | "integer"
    | "enum"
    | "multi_select"
    | "provider"
    | "model"
    | "tool"
    | "platform";
  required?: boolean;
  description?: string;
  default?: string | number | boolean;
  allowed_values?: string[];
  min?: number;
  max?: number;
  format?: string;
  refresh_url?: string;
  depends_on?: string;
}

export interface PluginManifest {
  name: string;
  version?: string;
  label?: string;
  type: "platform" | "mcp" | "provider";
  description?: string;
  entrypoint?: { command: string; transport: string };
  capabilities?: { inbound?: boolean; outbound?: boolean; setup?: boolean };
  config_schema?: ConfigField[];
}

export interface PluginConfig {
  [key: string]: string | number | boolean | undefined;
}

export interface PluginRemote {
  url?: string;
  path?: string;
  git_ref?: string;
  [key: string]: unknown;
}

export interface PluginData {
  [key: string]: unknown;
  id?: string;
  name: string;
  pluginType: "platform" | "tool" | "provider";
  version?: string;
  source: "built-in" | "installed" | "bundled" | "remote" | "mcp_config";
  status: "enabled" | "disabled" | "error";
  manifest: PluginManifest;
  config: PluginConfig;
  configSchema?: ConfigField[];
  resolvedEnv?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
  needsBuild?: boolean;
  /** True when this source is NOT the primary (YAML-configured) one */
  isDuplicated?: boolean;
  /** True if the plugin has source code (Cargo.toml or entrypoint command) */
  hasSourceCode?: boolean;
  /** True if this is a script-language MCP (no Cargo.toml, just entrypoint command) */
  isScript?: boolean;
  /** Remote plugin metadata (url, path, ref) */
  remote?: PluginRemote;
  /** Programming language: "Rust", "Python", "Node.js", or "unknown" */
  language?: string;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  const json = await res.json();
  // Unwrap {"success": true, "data": ...} → just the data
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data as T;
  }
  return json as T;
}

/** Convert all snake_case keys in an object to camelCase (shallow). */
export function toCamelCase<T = Record<string, unknown>>(obj: Record<string, unknown>): T {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = obj[key];
  }
  return result as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data as T;
  }
  return json as T;
}

/** Convert all snake_case keys in an object to camelCase (shallow). */

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data as T;
  }
  return json as T;
}

/** Convert all snake_case keys in an object to camelCase (shallow). */

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json && typeof json === "object" && "success" in json && "data" in json) {
    return json.data as T;
  }
  return json as T;
}

/** Convert all snake_case keys in an object to camelCase (shallow). */

// ── Workflow Types (Phase 5: workflows.yml CRUD) ──

export interface WorkflowRoleConfig {
  template?: string;
  profile?: string;
  provider?: string;
  model?: string;
  plan_mode?: string;
  retries?: number;
}

export interface Workflow {
  profile?: string;
  provider?: string;
  model?: string;
  plan_mode?: string;
  retries?: number;
  /** Top-level (outside roles): clear `workflow_state.executions` when the task moves to review. Default: false. */
  clear_executions_on_review?: boolean;
  roles?: Record<string, WorkflowRoleConfig>;
}

export interface WorkflowEntry {
  key: string;
  workflow: Workflow;
  resolved?: Record<string, WorkflowRoleConfig>;
}

export interface WorkflowListResponse {
  workflows: WorkflowEntry[];
}

export interface ResetExecutionsResponse {
  reset: boolean;
  message?: string;
}

// ── Workflow API (Phase 5) ──

/** GET /workflows — list workflow definitions from workflows.yml (stored in OMNI_DIR; no DB tables). */
export async function fetchWorkflows(): Promise<WorkflowEntry[]> {
  const res = await apiGet<WorkflowListResponse>("/workflows");
  return res?.workflows ?? [];
}

/** PUT /workflows/{key} — create or update a workflow definition in workflows.yml. */
export async function upsertWorkflow(key: string, workflow: Workflow): Promise<WorkflowEntry[]> {
  const res = await apiPut<WorkflowListResponse>(`/workflows/${encodeURIComponent(key)}`, workflow);
  return res?.workflows ?? [];
}

/** DELETE /workflows/{key} — remove a workflow definition from workflows.yml. */
export async function deleteWorkflow(key: string): Promise<WorkflowEntry[]> {
  const res = await apiDelete<WorkflowListResponse>(`/workflows/${encodeURIComponent(key)}`);
  return res?.workflows ?? [];
}

/** POST /kanban/tasks/{id}/workflow/executions/reset — clear a task's workflow execution counters. */
export async function resetWorkflowExecutions(taskId: string | number): Promise<ResetExecutionsResponse> {
  return apiPost<ResetExecutionsResponse>(
    `/kanban/tasks/${encodeURIComponent(String(taskId))}/workflow/executions/reset`,
    {},
  );
}
