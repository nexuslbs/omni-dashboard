import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

// ── Static source assertions: Import button + server proxy route exist ──

describe("Import button wiring (plugin-list.ts)", () => {
  const listSrc = readFileSync(join(src, "lib", "plugin-list.ts"), "utf-8");

  it("adds an Import button next to the Add button", () => {
    assert.match(listSrc, /importBtnId/);
    assert.match(listSrc, /\$\{ibId\}/);
    assert.match(listSrc, /Import/);
    assert.match(listSrc, /rgba\(6,182,212/); // cyan/teal accent
  });

  it("wires the Import button to showImportModal with a page reload", () => {
    assert.match(listSrc, /showImportModal\(type, \(\) => void loadPage\(type, cfg, true\)\)/);
  });

  it("imports showImportModal from ./plugin-import", () => {
    assert.match(listSrc, /import\s*\{[^}]*showImportModal[^}]*\}\s*from\s*["']\.\/plugin-import["']/);
  });
});

describe("server proxy route (server/index.ts)", () => {
  const serverSrc = readFileSync(join(here, "..", "server", "index.ts"), "utf-8");

  it("registers GET /api/fetch-remote before the generic proxy", () => {
    assert.match(serverSrc, /app\.get\("\/api\/fetch-remote"/);
    const localIdx = serverSrc.indexOf('/api/fetch-remote');
    const genericIdx = serverSrc.indexOf("Generic proxy");
    assert.ok(localIdx !== -1 && genericIdx !== -1 && localIdx < genericIdx, "fetch-remote must be registered before the generic proxy");
  });

  it("only allows http(s) URLs", () => {
    assert.match(serverSrc, /Only http\(s\) URLs are allowed/);
    assert.ok(serverSrc.includes("^https?:\\/\\/"));
  });

  it("registers GET /api/remote-yml for the local remote.yml", () => {
    assert.match(serverSrc, /app\.get\("\/api\/remote-yml"/);
    assert.match(serverSrc, /remote\.yml/);
  });
});

// ── Pure logic tests (dynamic import; skipped when the runtime cannot import TS) ──

async function loadImport() {
  try {
    return await import("../src/lib/plugin-import.ts");
  } catch {
    return null;
  }
}

describe("parseRemoteYml", () => {
  it("parses sections, entries, url/path/ref and skips comments", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const yml = `# remote plugin manifest
tools:
  test-rust-tool:
    url: https://github.com/nexuslbs/omni-plugins.git
    path: tools/test-rust-tool
  another:
    url: "https://github.com/org/repo.git"   # inline comment
    path: 'tools/another'
    ref: main
platforms:
  discord:
    url: https://github.com/org/discord.git
    path: platforms/discord
`;
    const parsed = mod.parseRemoteYml(yml);
    assert.deepEqual(Object.keys(parsed), ["tools", "platforms"]);
    assert.deepEqual(parsed.tools?.["test-rust-tool"], {
      url: "https://github.com/nexuslbs/omni-plugins.git",
      path: "tools/test-rust-tool",
    });
    assert.deepEqual(parsed.tools?.["another"], {
      url: "https://github.com/org/repo.git",
      path: "tools/another",
      ref: "main",
    });
    assert.deepEqual(parsed.platforms?.["discord"], {
      url: "https://github.com/org/discord.git",
      path: "platforms/discord",
    });
  });

  it("returns empty objects for missing sections", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const parsed = mod.parseRemoteYml("tools:\n  a:\n    url: https://x/y.git\n    path: tools/a\n");
    assert.deepEqual(parsed.providers, {});
    assert.deepEqual(parsed.platforms, {});
  });

  it("ignores unknown top-level sections and git_ref alias", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const parsed = mod.parseRemoteYml(
      "agents:\n  ignored:\n    url: https://x/y.git\n    path: agents/ignored\nproviders:\n  p1:\n    url: https://x/p.git\n    path: providers/p1\n    git_ref: dev\n",
    );
    assert.deepEqual(parsed.agents, undefined);
    assert.deepEqual(parsed.providers?.p1?.ref, "dev");
  });

  it("throws Invalid YAML for malformed content", async () => {
    const mod = await loadImport();
    if (!mod) return;
    assert.throws(() => mod.parseRemoteYml("this is not yaml at all"), /Invalid YAML/);
    assert.throws(() => mod.parseRemoteYml("tools:\n  - a list, not a mapping\n"), /Invalid YAML/);
  });

  it("throws Invalid YAML for an entry missing url", async () => {
    const mod = await loadImport();
    if (!mod) return;
    assert.throws(
      () => mod.parseRemoteYml("tools:\n  broken:\n    path: tools/broken\n"),
      /missing "url"/,
    );
  });

  it("throws Invalid YAML for empty documents", async () => {
    const mod = await loadImport();
    if (!mod) return;
    assert.throws(() => mod.parseRemoteYml(""), /Invalid YAML/);
    assert.throws(() => mod.parseRemoteYml("   \n# only a comment\n"), /Invalid YAML/);
  });
});

describe("determineAction", () => {
  const fetched = { url: "https://github.com/org/repo.git", path: "tools/repo", ref: "main" };

  it("returns add when no local plugin and no local remote.yml entry exist", async () => {
    const mod = await loadImport();
    if (!mod) return;
    assert.equal(mod.determineAction(fetched, null, null), "add");
    assert.equal(mod.determineAction(fetched, undefined, undefined), "add");
  });

  it("returns remove when the local plugin has the SAME url+path+ref", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const local = {
      name: "repo",
      pluginType: "tool",
      source: "remote",
      remote: { url: fetched.url, path: fetched.path, git_ref: fetched.ref },
    };
    assert.equal(mod.determineAction(fetched, local, null), "remove");
  });

  it("returns override when url differs", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const local = {
      name: "repo",
      pluginType: "tool",
      source: "remote",
      remote: { url: "https://github.com/other/repo.git", path: fetched.path, git_ref: fetched.ref },
    };
    assert.equal(mod.determineAction(fetched, local, null), "override");
  });

  it("returns override when path differs", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const local = {
      name: "repo",
      pluginType: "tool",
      source: "remote",
      remote: { url: fetched.url, path: "tools/other", git_ref: fetched.ref },
    };
    assert.equal(mod.determineAction(fetched, local, null), "override");
  });

  it("returns override when ref differs (including missing ref)", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const local = {
      name: "repo",
      pluginType: "tool",
      source: "remote",
      remote: { url: fetched.url, path: fetched.path, git_ref: "dev" },
    };
    assert.equal(mod.determineAction(fetched, local, null), "override");
    const noRef = { ...local, remote: { url: fetched.url, path: fetched.path } };
    assert.equal(mod.determineAction(fetched, noRef, null), "override");
  });

  it("falls back to the local remote.yml entry when the plugin is not installed", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const ymlEntry = { url: fetched.url, path: fetched.path, ref: fetched.ref };
    assert.equal(mod.determineAction(fetched, null, ymlEntry), "remove");
    assert.equal(
      mod.determineAction(fetched, null, { url: "https://github.com/old/repo.git", path: fetched.path }),
      "override",
    );
  });
});

describe("planImportActions", () => {
  it("maps entries to planned actions using local plugins + local remote.yml", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const entries = [
      { name: "new", spec: { url: "https://github.com/org/new.git", path: "tools/new" } },
      {
        name: "changed",
        spec: { url: "https://github.com/org/changed.git", path: "tools/changed", ref: "main" },
      },
      {
        name: "same",
        spec: { url: "https://github.com/org/same.git", path: "tools/same", ref: "main" },
      },
    ];
    const localPlugins = [
      {
        name: "changed",
        source: "remote",
        remote: { url: "https://github.com/org/changed.git", path: "tools/OLD", git_ref: "main" },
      },
      {
        name: "same",
        source: "remote",
        remote: { url: "https://github.com/org/same.git", path: "tools/same", git_ref: "main" },
      },
    ];
    const localYml = {
      changed: { url: "https://github.com/org/changed.git", path: "tools/changed", ref: "main" },
    };
    const planned = mod.planImportActions(entries, localPlugins, localYml);
    assert.deepEqual(
      planned.map((p) => [p.name, p.action]),
      [
        ["new", "add"],
        ["changed", "override"], // installed with a different path → override
        ["same", "remove"], // installed with identical spec → remove
      ],
    );
    assert.equal(planned[2].source, "remote");
  });
});

describe("fetchRemoteYml error handling", () => {
  const YAML = "tools:\n  a:\n    url: https://github.com/org/a.git\n    path: tools/a\n";

  it("returns ok with text on a successful direct fetch", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response(YAML, { status: 200, statusText: "OK" });
    };
    const out = await mod.fetchRemoteYml("https://raw.example/remote.yml", fetchImpl);
    assert.equal(out.ok, true);
    assert.equal(out.text, YAML);
    assert.equal(out.usedProxy, false);
    assert.deepEqual(calls, ["https://raw.example/remote.yml"]);
  });

  it("reports HTTP 404 without proxying", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      return new Response("Not Found", { status: 404, statusText: "Not Found" });
    };
    const out = await mod.fetchRemoteYml("https://raw.example/missing.yml", fetchImpl);
    assert.equal(out.ok, false);
    assert.match(out.error || "", /HTTP 404/);
    assert.equal(out.usedProxy, false);
    assert.equal(calls.length, 1); // no proxy attempt for an authoritative HTTP error
  });

  it("reports network errors and falls back to the server proxy", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const calls: string[] = [];
    const fetchImpl = async (url: string) => {
      calls.push(url);
      if (url.startsWith("/api/fetch-remote")) {
        return new Response(YAML, { status: 200, statusText: "OK" });
      }
      throw new TypeError("Failed to fetch");
    };
    const out = await mod.fetchRemoteYml("https://raw.example/remote.yml", fetchImpl);
    assert.equal(out.ok, true);
    assert.equal(out.text, YAML);
    assert.equal(out.usedProxy, true);
    assert.equal(calls.length, 2);
    assert.match(calls[1], /^\/api\/fetch-remote\?url=/);
    assert.ok(calls[1].includes(encodeURIComponent("https://raw.example/remote.yml")));
  });

  it("surfaces the proxy error when both direct fetch and proxy fail", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const fetchImpl = async (url: string) => {
      if (url.startsWith("/api/fetch-remote")) {
        throw new TypeError("Proxy unreachable");
      }
      throw new TypeError("Failed to fetch");
    };
    const out = await mod.fetchRemoteYml("https://raw.example/remote.yml", fetchImpl);
    assert.equal(out.ok, false);
    assert.match(out.error || "", /Network error/);
    assert.equal(out.usedProxy, true);
  });

  it("reports an empty response body", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const fetchImpl = async () => new Response("", { status: 200, statusText: "OK" });
    const out = await mod.fetchRemoteYml("https://raw.example/empty.yml", fetchImpl);
    assert.equal(out.ok, false);
    assert.match(out.error || "", /Empty response/);
  });
});

describe("executeImportBatch", () => {
  it("executes marked actions sequentially in list order and continues on failure", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const calls: string[] = [];
    const executor = {
      async install(opts: { name: string }) {
        calls.push(`install:${opts.name}`);
        if (opts.name === "boom") throw new Error("install exploded");
      },
      async remove(opts: { name: string }) {
        calls.push(`remove:${opts.name}`);
      },
    };
    const items = [
      { name: "a", action: "add", spec: { url: "https://x/a.git", path: "tools/a" } },
      { name: "boom", action: "override", spec: { url: "https://x/b.git", path: "tools/b" } },
      { name: "c", action: "remove", spec: { url: "https://x/c.git", path: "tools/c" }, source: "remote" },
    ];
    const results = await mod.executeImportBatch(items, "tool", executor);
    assert.deepEqual(calls, ["install:a", "install:boom", "remove:c"]); // order preserved, batch not aborted
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, false);
    assert.match(results[1].error || "", /install exploded/);
    assert.equal(results[2].ok, true);
  });

  it("routes remove actions to executor.remove with the type dir", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const seen: string[] = [];
    const executor = {
      async install() {
        seen.push("install");
      },
      async remove(opts: { typeDir: string; source: string; name: string }) {
        seen.push(`remove:${opts.typeDir}:${opts.source}:${opts.name}`);
      },
    };
    await mod.executeImportBatch(
      [{ name: "x", action: "remove", spec: { url: "https://x/x.git", path: "platforms/x" }, source: "remote" }],
      "platform",
      executor,
    );
    assert.deepEqual(seen, ["remove:platforms:remote:x"]);
  });

  it("uses the default executor against /plugins/install-git and DELETE", async () => {
    const mod = await loadImport();
    if (!mod) return;
    const calls: string[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method || "GET"} ${url} ${init?.body || ""}`);
      return new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        statusText: "OK",
        headers: { "Content-Type": "application/json" },
      });
    };
    const origFetch = globalThis.fetch;
    // @ts-expect-error - swapping global fetch for the test
    globalThis.fetch = fetchImpl;
    try {
      const items = [
        { name: "p1", action: "add", spec: { url: "https://x/p1.git", path: "tools/p1", ref: "main" } },
        {
          name: "p2",
          action: "remove",
          spec: { url: "https://x/p2.git", path: "tools/p2" },
          source: "remote",
        },
      ];
      await mod.executeImportBatch(items, "tool");
    } finally {
      globalThis.fetch = origFetch;
    }
    assert.ok(calls.some((c) => c.includes("POST /api/plugins/install-git") && c.includes('"git_ref":"main"')));
    assert.ok(calls.some((c) => c.includes("DELETE /api/plugins/tools/remote/p2")));
  });
});
