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

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}
