/**
 * SINGLE source of truth for every provider selector in the dashboard.
 *
 * The dashboard never assembles a provider list locally: every selector loads
 * the MERGED providers list from the omniagent API (`GET /plugins`), which
 * omniagent core resolves as
 *
 *     enabled provider plugins  +  providers defined in models.yml
 *
 * deduplicated by provider id with models.yml precedence (models.yml fields
 * win, the plugin config is merged underneath), and which ALSO surfaces the
 * merge-contract errors LOUDLY: a models.yml entry that declares itself
 * plugin-backed (`plugin: true` / `plugin: <name>`) whose same-id provider
 * plugin is NOT enabled comes back as a row with `status: "error"` and the
 * reason in `status_message` (never a silent skip, never a half-merged
 * provider).
 *
 * Consumers: channels page (channel provider select), profiles page (profile
 * default provider select), workflows page (per-role provider select) and the
 * channel card renderer in lib/channel-config.ts. Use `mergedProvidersFromApi`
 * with an already-fetched `/plugins` payload (no extra request) or
 * `loadMergedProviders` when a page does not fetch plugins itself.
 */
import { apiGet, toCamelCase, type PluginData } from "./api";
import { escapeHtml } from "./helpers";

export interface ProviderError {
  provider: string;
  message: string;
}

export interface MergedProviders {
  /** Provider ids: enabled provider plugins + models.yml, sorted, deduped. */
  providers: string[];
  /** Model ids per provider (models.yml `models` wins over the plugin enum). */
  models: Record<string, string[]>;
  /** Loud merge-contract errors from the API (plugin-backed without plugin). */
  errors: ProviderError[];
}

/** Read a field from a plugin row tolerating snake_case and camelCase (the
 * dashboard API mapper only converts the TOP-LEVEL plugin keys). */
function field(row: Record<string, unknown>, snake: string, camel: string): unknown {
  if (row[camel] !== undefined) return row[camel];
  return row[snake];
}

/** Model ids declared by a provider row (omniagent puts the models.yml `models`
 * list into the `default_model` enum's allowed_values). */
export function modelsFromProviderRow(p: PluginData): string[] {
  const row = p as unknown as Record<string, unknown>;
  const manifest = (row.manifest as Record<string, unknown> | undefined) ?? {};
  const schema = [
    ...((field(row, "config_schema", "configSchema") as Array<Record<string, unknown>>) ?? []),
    ...((field(manifest, "config_schema", "configSchema") as Array<Record<string, unknown>>) ?? []),
  ];
  const modelField = schema.find((f) => f && f.key === "default_model");
  if (!modelField) return [];
  const allowed = (modelField.allowed_values as string[] | undefined) ?? [];
  if (allowed.length > 0) return allowed;
  const def = modelField.default;
  return typeof def === "string" && def ? [def] : [];
}

/** Normalize the omniagent `/plugins` payload into the merged providers view.
 * PURE (no fetching) so every page feeds it the payload it already has: this is
 * the ONE merge step, shared by all selectors. */
export function mergedProvidersFromApi(apiResp: unknown): MergedProviders {
  const raw = ((apiResp as { data?: unknown } | null)?.data ?? apiResp ?? []) as Record<string, unknown>[];
  const rows = (Array.isArray(raw) ? raw : []).map((r) => toCamelCase<PluginData>(r));
  const providers: string[] = [];
  const models: Record<string, string[]> = {};
  const errors: ProviderError[] = [];
  const errorNames = new Set<string>();
  const byName = new Map<string, PluginData>();
  for (const p of rows) {
    if (!p || p.pluginType !== "provider") continue;
    const row = p as unknown as Record<string, unknown>;
    if (p.status === "error") {
      const message =
        (field(row, "status_message", "statusMessage") as string | undefined) ||
        (p.manifest && (p.manifest.description as string | undefined)) ||
        `provider '${p.name}' failed the providers merge contract`;
      errors.push({ provider: p.name, message });
      errorNames.add(p.name);
      continue;
    }
    // Only providers that can actually serve a request: enabled provider
    // plugins and models.yml-defined (code-less) providers. Disabled /
    // not-found rows are never offered as options.
    if (p.status !== "enabled") continue;
    const prev = byName.get(p.name);
    if (!prev) {
      byName.set(p.name, p);
      continue;
    }
    // Deduplicated by provider id with models.yml precedence: when the API
    // returns both a plugin row and a models.yml row, models.yml wins.
    if (field(p, "source", "source") === "models.yml" && field(prev, "source", "source") !== "models.yml") {
      byName.set(p.name, p);
    }
  }
  for (const [name, row] of byName) {
    if (errorNames.has(name)) continue; // loud error instead of a broken option
    providers.push(name);
    models[name] = modelsFromProviderRow(row);
  }
  providers.sort();
  return { providers, models, errors };
}

/** Fetch + normalize the merged providers list (for pages that do not already
 * hold the `/plugins` payload). */
export async function loadMergedProviders(): Promise<MergedProviders> {
  const resp = await apiGet<Record<string, unknown>>("/plugins");
  return mergedProvidersFromApi(resp);
}

/** Loud error banner for the merge-contract failures: rendered next to the
 * provider selects instead of silently dropping the provider. */
export function providerErrorBanner(errors: ProviderError[]): string {
  if (!errors || errors.length === 0) return "";
  return errors
    .map(
      (e) =>
        `<div class="provider-resolution-error" data-provider="${escapeHtml(e.provider)}" role="alert" ` +
        `style="margin:0.25rem 0;padding:0.375rem 0.5rem;border:1px solid #c0392b;border-radius:4px;` +
        `color:#c0392b;font-size:0.8125rem;">Provider error (${escapeHtml(e.provider)}): ${escapeHtml(e.message)}</div>`,
    )
    .join("");
}
