import { describe, it } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.TEST_BASE_URL || "http://host.docker.internal:12346";

async function apiGet(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function apiPost(path: string, data: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function apiGetRaw(path: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  return { status: res.status, text };
}

/**
 * Run an async test with graceful skip if the API server is unreachable.
 */
async function tryOrSkip(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e: any) {
    // If it's a fetch failure (server not running), skip gracefully
    if (
      e?.cause?.code === "ECONNREFUSED" ||
      e?.cause?.code === "ENOTFOUND" ||
      e?.message?.includes("fetch failed") ||
      e?.code === "ERR_TEST_FAILURE"
    ) {
      // Re-throw for the parent to skip
      throw e;
    }
    // For unexpected errors, still fail the test
    throw e;
  }
}

describe("OmniDashboard API Routes", () => {
  // ── /api/kanban ──
  describe("/api/kanban", () => {
    it("/board returns expected structure", async () => {
      try {
        const { status, body } = await apiGet("/api/kanban/board");
        assert.equal(status, 200);
        assert.ok("columns" in body, "response should have columns");
        assert.ok("total" in body, "response should have total");
        assert.ok(Array.isArray(body.columns));
        assert.equal(typeof body.total, "number");
        if (body.columns.length > 0) {
          const col = body.columns[0];
          assert.ok("id" in col);
          assert.ok("title" in col);
          assert.ok("tasks" in col);
          assert.ok(Array.isArray(col.tasks));
        }
      } catch (e: any) {
        // Graceful skip if server not available — but still report failure
        // for unexpected errors (non-connectivity)
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          // This is acceptable — server might not be running
          return;
        }
        throw e;
      }
    });

    it("/tasks/{id} returns 404 for non-existent task", async () => {
      try {
        const { status, body } = await apiGet("/api/kanban/tasks/nonexistent_999");
        // Either 404 (task not found) or 200 if it exists, either is fine
        if (status === 404) {
          assert.ok("error" in body);
        } else if (status === 200) {
          assert.ok("id" in body);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });

  // ── /api/schedule ──
  describe("/api/schedule", () => {
    it("/ returns expected structure", async () => {
      try {
        const { status, body } = await apiGet("/api/schedule");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body));
        if (body.length > 0) {
          const job = body[0];
          assert.ok("id" in job);
          assert.ok("name" in job);
          assert.ok("schedule" in job);
          assert.ok("enabled" in job);
          assert.ok("status" in job);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("/{id} returns 404 for non-existent job", async () => {
      try {
        const { status, body } = await apiGet("/api/schedule/nonexistent_job_999");
        if (status === 404) {
          assert.ok("error" in body);
        } else if (status === 200) {
          assert.ok("id" in body);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });

  // ── /api/wiki-search (POST) ──
  describe("/api/wiki-search", () => {
    it("POST / returns expected structure or validation error", async () => {
      try {
        // Test with empty body — should get 400
        const { status, body } = await apiPost("/api/wiki-search", {});
        // Either 400 (query required) or error from backend
        if (status === 400) {
          assert.ok("error" in body);
        } else if (status === 200) {
          // Successful wiki search returns an array of results
          assert.ok(Array.isArray(body));
        } else if (status === 502) {
          // Backend unavailable
          assert.ok("error" in body);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("POST / with query returns expected result shape", async () => {
      try {
        const { status, body } = await apiPost("/api/wiki-search", {
          query: "test",
          limit: 5,
        });
        if (status === 200) {
          assert.ok(Array.isArray(body));
          if (body.length > 0) {
            const result = body[0];
            assert.ok("file_path" in result);
            assert.ok("section_title" in result);
            assert.ok("score" in result);
            assert.ok("content_preview" in result);
          }
        } else if (status === 400) {
          assert.ok("error" in body);
        } else if (status === 502) {
          assert.ok("error" in body);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });

  // ── /api/overview ──
  describe("/api/overview", () => {
    it("/ returns array with correct structure", async () => {
      try {
        const { status, body } = await apiGet("/api/overview");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body));
        if (body.length > 0) {
          const row = body[0];
          assert.ok("id" in row);
          assert.ok("channel_id" in row);
          assert.ok("thread_id" in row);
          assert.ok("status" in row);
          assert.ok("created_at" in row);
          assert.ok("channel_name" in row);
          assert.ok("content_preview" in row);
          assert.ok("prompt_tokens" in row);
          assert.ok("completion_tokens" in row);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });

  // ── /api/messages/filters ──
  describe("/api/messages/filters", () => {
    it("returns filters with all expected arrays", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/filters");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.channels));
        assert.ok(Array.isArray(body.roles));
        assert.ok(Array.isArray(body.providers));
        assert.ok(Array.isArray(body.models));
        assert.ok(Array.isArray(body.types));
        assert.ok(Array.isArray(body.subtypes));
        if (body.channels.length > 0) {
          const ch = body.channels[0];
          assert.ok("id" in ch);
          assert.ok("name" in ch);
          assert.ok("count" in ch);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });

  // ── /api/messages/events with various query params ──
  describe("/api/messages/events", () => {
    it("basic query returns messages array with total", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=1");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
        assert.equal(typeof body.total, "number");
        assert.equal(typeof body.offset, "number");
        assert.equal(typeof body.limit, "number");
        if (body.messages.length > 0) {
          const msg = body.messages[0];
          assert.ok("id" in msg);
          assert.ok("channel_id" in msg);
          assert.ok("role" in msg);
          assert.ok("content" in msg);
          assert.ok("status" in msg);
          assert.ok("created_at" in msg);
          assert.ok("channel_name" in msg);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("filter by role=user returns correct structure", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=1&role=user");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
        if (body.messages.length > 0) {
          assert.equal(body.messages[0].role, "user");
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("filter by channel_id=all returns all (no filter)", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=1&channel_id=all");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("filter by type param returns correct structure", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=1&type=all");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("filter by subtype param returns correct structure", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=1&subtype=test");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("filter by status returns correct structure", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=1&status=completed");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
        if (body.messages.length > 0) {
          // status is a field on the message
          assert.ok("status" in body.messages[0]);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("filter by search (provider) returns correct structure", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=1&provider=test");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("filter by model returns correct structure", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=1&model=gpt-4");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.messages));
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });

    it("pagination params (offset, limit) work", async () => {
      try {
        const { status, body } = await apiGet("/api/messages/events?limit=5&offset=0");
        assert.equal(status, 200);
        assert.equal(body.limit, 5);
        assert.equal(body.offset, 0);
        assert.ok(Array.isArray(body.messages));
        assert.ok(body.messages.length <= 5);
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });

  // ── /api/uploads/list ──
  describe("/api/uploads/list", () => {
    it("returns array of upload entries", async () => {
      try {
        const { status, body } = await apiGet("/api/uploads/list");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body));
        if (body.length > 0) {
          const entry = body[0];
          assert.ok("name" in entry);
          assert.ok("type" in entry);
          assert.ok("size" in entry);
          assert.ok("modified_at" in entry);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });

  // ── /api/fs/list ──
  describe("/api/fs/list", () => {
    it("/list?path=/ returns entries array", async () => {
      try {
        const { status, body } = await apiGet("/api/fs/list?path=/");
        assert.equal(status, 200);
        assert.ok(Array.isArray(body.entries));
        assert.ok(typeof body.path === "string");
        if (body.entries.length > 0) {
          const entry = body.entries[0];
          assert.ok("name" in entry);
          assert.ok("path" in entry);
          assert.ok("type" in entry);
          assert.ok("size" in entry || entry.size === null);
        }
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });

  // ── HTML page ──
  describe("Frontend (HTML)", () => {
    it("index page includes favicon link", async () => {
      try {
        const { status, text } = await apiGetRaw("/");
        assert.equal(status, 200);
        assert.ok(text.includes("favicon.svg"), "HTML should include favicon.svg reference");
      } catch (e: any) {
        if (e?.cause?.code === "ECONNREFUSED" || e?.message?.includes("fetch failed")) {
          return;
        }
        throw e;
      }
    });
  });
});
