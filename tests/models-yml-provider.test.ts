import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Regression tests: models.yml-source providers must NOT expose plugin ──
//    actions; they get a question-icon button opening an info modal instead.
//    (task_omnidev_remove_plugin_actions_from_providers)
//
// Providers defined in config/models.yml are not backed by a provider plugin,
// so plugin actions (install/uninstall/update/download/restart/...) do not
// apply to them. Their card must render NO plugin action buttons and instead
// a "?" button that opens an accessible modal (role=dialog, aria-modal,
// aria-labelledby) explaining how to manage such providers; the modal is
// dismissible via Close button, click-outside and the Escape key.

const modelsYmlProvider = (over: Record<string, unknown> = {}) => ({
  name: "deepseek",
  pluginType: "provider",
  source: "models.yml",
  status: "enabled",
  needsBuild: false,
  hasSourceCode: false,
  isScript: false,
  manifest: { name: "deepseek", type: "provider", description: "DeepSeek" },
  config: {},
  configSchema: [],
  ...over,
});

const pluginBackedProvider = (over: Record<string, unknown> = {}) => ({
  name: "noop-full",
  pluginType: "provider",
  source: "bundled",
  status: "enabled",
  needsBuild: false,
  hasSourceCode: true,
  isScript: false,
  manifest: { name: "noop-full", type: "provider", description: "Noop" },
  config: {},
  configSchema: [],
  ...over,
});

const load = async () =>
  (await import("../src/lib/plugin-ui.ts")) as {
    pluginActionState: (p: unknown) => string;
    renderActionButtons: (p: unknown) => string;
    renderPluginCard: (p: unknown, opts?: unknown) => string;
    showModelsYmlInfoModal: (name: string) => void;
  };

describe("models.yml-source providers: no plugin actions", () => {
  it("pluginActionState is 'none' for a models.yml provider", async () => {
    const { pluginActionState } = await load();
    assert.equal(pluginActionState(modelsYmlProvider()), "none");
  });

  it("renderActionButtons renders NOTHING for a models.yml provider", async () => {
    const { renderActionButtons } = await load();
    const html = renderActionButtons(modelsYmlProvider());
    assert.equal(html, "");
  });

  it("renderPluginCard: models.yml provider card has the ? button and NO plugin action buttons", async () => {
    const { renderPluginCard } = await load();
    const html = renderPluginCard(modelsYmlProvider(), {});
    assert.ok(html.includes("models-yml-info-btn"), "question-icon button must be present");
    // Opacity regression (dashboard modal opacity task): the ? button must be
    // fully OPAQUE (solid background, no rgba translucency).
    assert.ok(html.includes("background:#475569"), "question-icon button must have a solid opaque background");
    assert.ok(
      !/models-yml-info-btn[^>]*background:rgba\(/.test(html),
      "question-icon button must not use a translucent rgba background",
    );
    assert.ok(!html.includes("plugin-install-btn"), "no Install");
    assert.ok(!html.includes("plugin-reinstall-btn"), "no Reinstall");
    assert.ok(!html.includes("plugin-download-btn"), "no Download");
    assert.ok(!html.includes("plugin-update-btn"), "no Update");
    assert.ok(!html.includes("plugin-remove-btn"), "no Remove");
    assert.ok(!html.includes("plugin-toggle-btn"), "no Enable/Disable");
    assert.ok(!html.includes("plugin-restart-btn"), "no Restart");
    assert.ok(!html.includes("plugin-setup-btn"), "no Setup");
  });

  it("renderPluginCard: plugin-backed provider keeps its actions", async () => {
    const { renderPluginCard } = await load();
    const html = renderPluginCard(pluginBackedProvider(), {});
    assert.ok(!html.includes("models-yml-info-btn"), "no ? button for plugin-backed providers");
    // bundled + compilable + installed -> Reinstall / Uninstall / Remove
    assert.ok(html.includes("plugin-reinstall-btn"), "Reinstall kept");
    assert.ok(html.includes("plugin-remove-btn"), "Remove kept");
  });
});

describe("models.yml info modal (accessible, dismissible)", () => {
  it("opens a role=dialog modal with the short description; Close, click-outside and Escape dismiss it", async () => {
    const { showModelsYmlInfoModal } = await load();

    // Minimal fake DOM: exactly the surface showModelsYmlInfoModal uses.
    type Listener = (e?: unknown) => void;
    const docListeners: Record<string, Listener[]> = {};
    let bodyChildren: FakeEl[] = [];

    class FakeEl {
      attrs: Record<string, string> = {};
      style: Record<string, string> = {};
      innerHTML = "";
      listeners: Record<string, Listener[]> = {};
      private cache: Record<string, FakeEl> = {};
      setAttribute(k: string, v: string) {
        this.attrs[k] = v;
      }
      appendChild(c: FakeEl) {
        bodyChildren.push(c);
      }
      addEventListener(t: string, fn: Listener) {
        (this.listeners[t] ||= []).push(fn);
      }
      remove() {
        bodyChildren = bodyChildren.filter((c) => c !== this);
      }
      focus() {}
      fire(t: string, e?: unknown) {
        (this.listeners[t] || []).forEach((fn) => fn(e));
      }
      querySelector(sel: string): FakeEl | null {
        if (sel === ".models-yml-info-close") {
          if (!this.cache[sel]) {
            const btn = new FakeEl();
            btn.innerHTML = "Close";
            this.cache[sel] = btn;
          }
          return this.cache[sel];
        }
        return null;
      }
    }

    const fakeDocument = {
      createElement: () => new FakeEl(),
      body: { appendChild: (c: FakeEl) => bodyChildren.push(c) },
      addEventListener: (t: string, fn: Listener) => {
        (docListeners[t] ||= []).push(fn);
      },
      removeEventListener: (t: string, fn: Listener) => {
        docListeners[t] = (docListeners[t] || []).filter((f) => f !== fn);
      },
    };

    const g = globalThis as Record<string, unknown>;
    const prevDoc = g.document;
    g.document = fakeDocument;
    try {
      showModelsYmlInfoModal("deepseek");
      assert.equal(bodyChildren.length, 1, "modal backdrop appended to body");
      const backdrop = bodyChildren[0];
      assert.equal(backdrop.attrs["role"], "dialog");
      assert.equal(backdrop.attrs["aria-modal"], "true");
      assert.ok(backdrop.attrs["aria-labelledby"], "aria-labelledby set");
      // Opacity regression: the backdrop must be SEMI-TRANSPARENT (dimmed),
      // matching the standard .modal-backdrop rgba(0,0,0,0.6), never opaque.
      assert.ok(
        backdrop.style.cssText.includes("rgba(0,0,0,0.6)"),
        "modal backdrop must be semi-transparent (rgba(0,0,0,0.6))",
      );
      assert.ok(
        !backdrop.style.cssText.includes("0.85"),
        "modal backdrop must not use the near-opaque 0.85 alpha",
      );
      assert.ok(backdrop.innerHTML.includes("models.yml"), "modal text mentions models.yml");
      assert.ok(
        backdrop.innerHTML.includes("no plugin-provided actions"),
        "modal explains no plugin actions",
      );
      assert.ok(backdrop.innerHTML.includes("Models"), "modal points to the Models page");
      assert.ok(backdrop.innerHTML.includes("Reload"), "modal mentions reload/restart");

      // Close button dismisses
      const closeBtn = backdrop.querySelector(".models-yml-info-close")!;
      closeBtn.fire("click");
      assert.equal(bodyChildren.length, 0, "Close button dismisses the modal");
      assert.equal(docListeners["keydown"]?.length ?? 0, 0, "keydown listener removed after close");

      // Reopen: click-outside dismisses
      showModelsYmlInfoModal("deepseek");
      const backdrop2 = bodyChildren[0];
      backdrop2.fire("click", { target: backdrop2 });
      assert.equal(bodyChildren.length, 0, "click-outside dismisses the modal");

      // Reopen: Escape dismisses
      showModelsYmlInfoModal("deepseek");
      (docListeners["keydown"] || []).forEach((fn) => fn({ key: "Escape" }));
      assert.equal(bodyChildren.length, 0, "Escape dismisses the modal");
    } finally {
      g.document = prevDoc;
    }
  });
});
