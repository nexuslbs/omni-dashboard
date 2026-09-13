/**
 * Tri-state body builder for `PATCH {OMNIAGENT}/profiles/{id}`.
 *
 * The omniagent profile fields are TRI-STATE: a key ABSENT from the body leaves
 * the stored value unchanged, an explicit JSON `null` clears it to None (the
 * resolution chain falls through), and a value sets it. The dashboard expresses
 * "Default / None" as an EMPTY STRING (that is the provider/model/toolset select
 * option value), which the core endpoint also accepts as a clear alias.
 *
 * Both spellings must be forwarded VERBATIM. A `value || null` normalization
 * collapses `""` into `null`, and before the core was tri-state an explicit
 * `null` was indistinguishable from an absent key: the clear was silently
 * dropped and the previous value survived a reload (regression: "setting a
 * profile field back to Default is not persisted").
 */
export interface ProfilePatchInput {
  provider?: unknown;
  model?: unknown;
  plan?: unknown;
  template?: unknown;
  toolset?: unknown;
}

/**
 * Build the PATCH body for the string-valued tri-state fields plus `plan`.
 * Only keys the caller actually provided are emitted (absent = unchanged).
 * Returns `""` for an empty-string clear (not `null`) so the wire format stays
 * exactly what the caller asked for, and trims real values.
 *
 * `allowed_tools` is handled separately by the router because it needs the
 * display-name -> raw-name mapping.
 */
export function buildProfilePatchBody(input: ProfilePatchInput): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const stringField = (key: "provider" | "model" | "template" | "toolset"): void => {
    const value = input[key];
    if (value === undefined) return;
    if (value === null) {
      body[key] = null; // explicit clear
      return;
    }
    body[key] = typeof value === "string" ? value.trim() : String(value);
  };

  stringField("provider");
  stringField("model");
  stringField("template");
  stringField("toolset");

  // `plan` is a boolean tri-state: absent = unchanged, null = clear, bool = set.
  if (input.plan !== undefined) body.plan = input.plan;

  return body;
}
