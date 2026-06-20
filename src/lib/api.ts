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
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
}

export interface OverviewRow {
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
  error?: string;
}

export interface FsReadResponse {
  path: string;
  content: string;
  size: number;
  error?: string;
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

// ── Kanban Types ──

export interface KanbanBoard {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface KanbanBoardsResponse {
  boards: KanbanBoard[];
}

export interface KanbanTask {
  id: string;
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
  name: string;
  provider: string | null;
  model: string | null;
  allowed_tools: string[]; // array of tool names
  skills: string[]; // filenames from filesystem
  all_tools: string[]; // available options for multi-select
}

// ── Channel Types ──

export interface ChannelData {
  id: number;
  name: string;
  platform: string | null;
  resource_identifier: string | null;
  closed: boolean;
  current_profile: string | null;
  current_provider: string | null;
  current_model: string | null;
  readonly: boolean;
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

export interface PlatformSubscriptionChannel {
  id: number;
  name: string;
  platform: string;
  resource_identifier: string;
}

export interface PlatformSubscription {
  id: number;
  subscriber_resource: string;
  channels: PlatformSubscriptionChannel[];
}

export interface PlatformData {
  name: string;
  active: boolean;
  resource_identifiers: PlatformResourceId[];
  subscriptions: PlatformSubscription[];
  all_channels: { id: number; name: string; platform: string; resource_identifier: string }[];
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
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
  return res.json();
}

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
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}
