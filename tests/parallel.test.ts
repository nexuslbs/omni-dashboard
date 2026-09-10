import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { allSettledOrNull } from "../src/lib/parallel.ts";

const DELAY = 120;

interface InFlight {
  current: number;
  max: number;
}

function delayed<T>(value: T, state: InFlight): Promise<T> {
  state.current += 1;
  state.max = Math.max(state.max, state.current);
  return new Promise((resolve) =>
    setTimeout(() => {
      state.current -= 1;
      resolve(value);
    }, DELAY),
  );
}

describe("allSettledOrNull", () => {
  it("starts independent promises concurrently: page pays max, not sum", async () => {
    const state: InFlight = { current: 0, max: 0 };
    const started = Date.now();
    const [a, b, c, d] = await allSettledOrNull([
      delayed("a", state),
      delayed("b", state),
      delayed("c", state),
      delayed("d", state),
    ]);
    const elapsed = Date.now() - started;
    // Four 120 ms calls: concurrent => ~120 ms, sequential => ~480 ms.
    assert.equal(state.max, 4, "all four sources must be in flight at once");
    assert.ok(elapsed < DELAY * 3, `expected ~${DELAY} ms, took ${elapsed} ms`);
    assert.deepEqual([a, b, c, d], ["a", "b", "c", "d"]);
  });

  it("resolves a failed source to null without failing the others", async () => {
    const [ok, failed, other] = await allSettledOrNull([
      Promise.resolve(1),
      Promise.reject(new Error("boom")),
      Promise.resolve("keep"),
    ]);
    assert.equal(ok, 1);
    assert.equal(failed, null);
    assert.equal(other, "keep");
  });
});

// The page loaders below fan out to endpoints with no data dependency on each
// other; they must hand every source to a SINGLE allSettledOrNull call so the
// requests are started in the same tick (page load = max, not sum).
describe("page loaders parallelize independent API calls", () => {
  const read = (rel: string) =>
    readFileSync(new URL(`../src/pages/${rel}`, import.meta.url), "utf8");

  function parallelCallBody(src: string): string {
    const start = src.indexOf("allSettledOrNull([");
    assert.ok(start >= 0, "loader must use allSettledOrNull");
    return src.slice(start, src.indexOf("]);", start));
  }

  it("workflows loader fetches profiles/plugins/templates/actions/settings in one batch", () => {
    const body = parallelCallBody(read("workflows.ts"));
    for (const path of ["/profiles", "/plugins", "/templates", "/actions"]) {
      assert.ok(body.includes(`"${path}"`), `workflows loader must batch ${path}`);
    }
    assert.ok(body.includes("getDefaultProfile()"), "workflows loader must batch /settings");
  });

  it("channels loader fetches channels/profiles/plugins/templates/settings in one batch", () => {
    const body = parallelCallBody(read("channels.ts"));
    for (const path of ["/channels", "/profiles", "/plugins", "/templates"]) {
      assert.ok(body.includes(`"${path}"`), `channels loader must batch ${path}`);
    }
    assert.ok(body.includes("getDefaultProfile()"), "channels loader must batch /settings");
  });
});
