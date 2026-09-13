import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProfilePatchBody } from "../server/lib/profile-patch.ts";

/**
 * Regression guard for the Profiles page "set a field back to Default / None"
 * bug: the BFF PATCH handler normalized each optional field with
 * `value || null`, which turned the empty-string clear (the value of the
 * "Default" select option) into `null`. The core endpoint treated an explicit
 * `null` as an ABSENT key, so nothing was written and the previous value
 * survived the reload. Every tri-state spelling must reach omniagent verbatim.
 */
describe("profiles PATCH body: explicit clears are forwarded, absent keys are omitted", () => {
  it("forwards the empty-string clear the dashboard Default option sends", () => {
    assert.deepEqual(buildProfilePatchBody({ provider: "" }), { provider: "" });
    assert.deepEqual(buildProfilePatchBody({ provider: "", model: "", toolset: "" }), {
      provider: "",
      model: "",
      toolset: "",
    });
  });

  it("forwards an explicit JSON null clear", () => {
    assert.deepEqual(buildProfilePatchBody({ provider: null, model: null, toolset: null }), {
      provider: null,
      model: null,
      toolset: null,
    });
  });

  it("omits keys the caller did not send (leave unchanged)", () => {
    assert.deepEqual(buildProfilePatchBody({}), {});
    assert.deepEqual(buildProfilePatchBody({ provider: "deepseek" }), { provider: "deepseek" });
  });

  it("trims concrete values but keeps them as values", () => {
    assert.deepEqual(buildProfilePatchBody({ provider: "  opencode-go  " }), {
      provider: "opencode-go",
    });
    assert.deepEqual(buildProfilePatchBody({ toolset: " dev_set " }), { toolset: "dev_set" });
  });

  it("keeps plan tri-state (null clear, boolean set)", () => {
    assert.deepEqual(buildProfilePatchBody({ plan: true }), { plan: true });
    assert.deepEqual(buildProfilePatchBody({ plan: null }), { plan: null });
    assert.deepEqual(buildProfilePatchBody({ provider: "x", plan: false }), {
      provider: "x",
      plan: false,
    });
  });

  it("forwards template clears too", () => {
    assert.deepEqual(buildProfilePatchBody({ template: "" }), { template: "" });
    assert.deepEqual(buildProfilePatchBody({ template: "dev-development" }), {
      template: "dev-development",
    });
  });
});
