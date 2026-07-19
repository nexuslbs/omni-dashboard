// ── Plugin Types ──
export interface PluginBase {
  [key: string]: unknown;
  name: string;
  description?: string;
  plugin_type: string;
  source?: string;
  status?: string;
  enabled?: boolean;
  version?: string;
  config?: Record<string, unknown>;
  config_schema?: SettingDefinition[];
}

export interface SettingDefinition {
  [key: string]: unknown;
  key: string;
  label: string;
  type: string;
  default?: unknown;
  options?: { id: string; value: string; label: string }[];
  description?: string;
  required?: boolean;
}

export interface SettingOption {
  [key: string]: unknown;
  id?: string;
  value?: string;
  label?: string;
}

// ── Channel Types ──
export interface ChannelData {
  [key: string]: unknown;
  id: string;
  name?: string;
  platform: string;
  current_provider?: string;
  current_model?: string;
  metadata?: Record<string, unknown>;
  profiles?: string[];
  enabled?: boolean;
}

// ── Profile Types ──
export interface ProfileData {
  [key: string]: unknown;
  name: string;
  label?: string;
  allowed_tools?: string[];
  all_tools?: string[];
  all_tool_details?: { name: string; server_name?: string }[];
  skills?: string[];
  provider?: string;
  model?: string;
  default_model?: string;
  default_provider?: string;
  config?: Record<string, unknown>;
  config_schema?: SettingDefinition[];
}

// ── Kanban Types ──
export interface KanbanTask {
  [key: string]: unknown;
  id: string;
  title: string;
  status: string;
  board?: string;
  channel_id?: string;
  thread_id?: string;
  assignee?: string;
  priority?: string;
  metadata?: Record<string, unknown>;
}

export interface KanbanHistoryEntry {
  [key: string]: unknown;
  id: string;
  kanban_task_id: string;
  action: string;
  initial_board?: string;
  final_board?: string;
  previous_values?: Record<string, unknown>;
  created_at?: string;
}

// ── Message Types ──
export interface MessageData {
  [key: string]: unknown;
  id: string;
  thread_id: string;
  role: string;
  content: string;
  msg_type: string;
  msg_subtype?: string;
  metadata?: Record<string, unknown>;
  created_at?: string;
}

// ── Settings Types ──
export interface SettingCategory {
  [key: string]: unknown;
  name: string;
  label?: string;
  settings: SettingDefinition[];
}

export interface SettingsResponse {
  success: boolean;
  data?: {
    categories: SettingCategory[];
  };
}

// ── Secret Types ──
export interface SecretData {
  [key: string]: unknown;
  name: string;
  fieldType?: string;
  value?: string;
}

// ── API Response Types ──
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
