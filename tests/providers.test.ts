import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergedProvidersFromApi, modelsFromProviderRow, providerErrorBanner } from "../src/lib/providers.ts";

// ── Unit tests for the SINGLE merged provider source of truth ──
//
// Every dashboard provider selector consumes `mergedProvidersFromApi`, fed with
// the omniagent `/plugins` payload (enabled provider plugins UNION models.yml
// providers, deduplicated by provider id with models.yml precedence). These
// tests pin that contract, including the loud merge error.

function providerRow(
  name: string,
  opts: {
    source?: string;
    status?: string;
    models?: string[];
    statusMessage?: string;
  } = {},
): Record<string, unknown> {
  return {
    name,
    plugin_type: "provider",
    source: opts.source ?? "bundled",
    status: opts.status ?? "enabled",
    status_message: opts.statusMessage,
    manifest: { name, type: "provider" },
    config_schema: [
      {
        key: "default_model",
        label: "Default model",
        type: "enum",
        allowed_values: opts.models ?? [],
      },
    ],
  };
}

describe("src/lib/providers.ts - merged providers from the omniagent API", () => {
  it("unions enabled provider plugins with models.yml providers", () => {
    const resp = {
      data: [
        providerRow("noop", { source: "bundled", models: ["noop-model"] }),
        providerRow("deepseek", { source: "models.yml", models: ["deepseek-v4-flash"] }),
        providerRow("opencode-go", { source: "models.yml", models: ["deepseek-v4-flash"] }),
      ],
    };
    const merged = mergedProvidersFromApi(resp);
    assert.deepEqual(merged.providers, ["deepseek", "noop", "opencode-go"]);
    assert.deepEqual(merged.models["opencode-go"], ["deepseek-v4-flash"]);
    assert.deepEqual(merged.errors, []);
  });

  it("lists models.yml-only providers even when NO provider plugin is enabled", () => {
    const resp = {
      data: [
        providerRow("deepseek", { source: "models.yml", models: ["deepseek-v4-flash"] }),
        providerRow("opencode-go", { source: "models.yml", models: ["deepseek-v4-flash"] }),
      ],
    };
    const merged = mergedProvidersFromApi(resp);
    assert.deepEqual(merged.providers, ["deepseek", "opencode-go"]);
    assert.equal(merged.providers.includes("noop"), false);
  });

  it("deduplicates a provider defined in both places, models.yml winning", () => {
    const resp = {
      data: [
        providerRow("deepseek", { source: "bundled", models: ["plugin-model"] }),
        providerRow("deepseek", { source: "models.yml", models: ["deepseek-v4-flash", "deepseek-v3"] }),
      ],
    };
    const merged = mergedProvidersFromApi(resp);
    assert.deepEqual(merged.providers, ["deepseek"], "provider appears exactly once");
    assert.deepEqual(merged.models["deepseek"], ["deepseek-v4-flash", "deepseek-v3"]);
  });

  it("never offers disabled rows as options", () => {
    const resp = {
      data: [
        providerRow("disabled-provider", { status: "disabled" }),
        providerRow("deepseek", { source: "models.yml" }),
      ],
    };
    const merged = mergedProvidersFromApi(resp);
    assert.deepEqual(merged.providers, ["deepseek"]);
  });

  it("surfaces a plugin-backed models.yml entry without its plugin as a loud error", () => {
    const resp = {
      data: [
        providerRow("ghost", {
          source: "models.yml",
          status: "error",
          statusMessage: "provider 'ghost' is plugin-backed but no provider plugin with that id is enabled",
        }),
        providerRow("deepseek", { source: "models.yml" }),
      ],
    };
    const merged = mergedProvidersFromApi(resp);
    assert.deepEqual(merged.providers, ["deepseek"], "broken provider is not offered");
    assert.equal(merged.errors.length, 1);
    assert.equal(merged.errors[0].provider, "ghost");
    assert.match(merged.errors[0].message, /plugin-backed/);
    const banner = providerErrorBanner(merged.errors);
    assert.match(banner, /ghost/);
    assert.match(banner, /role="alert"/);
    assert.equal(providerErrorBanner([]), "");
  });

  it("accepts a bare array payload (no data envelope)", () => {
    const merged = mergedProvidersFromApi([providerRow("deepseek", { source: "models.yml" })]);
    assert.deepEqual(merged.providers, ["deepseek"]);
  });

  it("modelsFromProviderRow reads models.yml allowed_values then the default", () => {
    const withAllowed = modelsFromProviderRow(providerRow("p", { models: ["m1", "m2"] }) as never);
    assert.deepEqual(withAllowed, ["m1", "m2"]);
    const withDefault = modelsFromProviderRow({
      name: "p",
      pluginType: "provider",
      configSchema: [{ key: "default_model", default: "only" }],
    } as never);
    assert.deepEqual(withDefault, ["only"]);
    const none = modelsFromProviderRow({ name: "p", pluginType: "provider" } as never);
    assert.deepEqual(none, []);
  });
});
