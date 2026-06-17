import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

const BASE = process.env.TEST_BASE_URL || "http://host.docker.internal:12346";

async function apiGet(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function apiGetRaw(path: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${BASE}${path}`);
  const text = await res.text();
  return { status: res.status, text };
}

describe("OmniDashboard API", () => {
  it("/api/health returns ok status", async () => {
    const { status, body } = await apiGet("/api/health");
    assert.equal(status, 200);
    assert.equal(body.status, "ok");
    assert.ok(body.version);
    assert.ok(typeof body.uptime === "number");
  });

  it("/api/overview returns array with correct structure", async () => {
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
    }
  });

  it("/api/messages/events returns messages array with total", async () => {
    const { status, body } = await apiGet("/api/messages/events?limit=1");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.messages));
    assert.ok(typeof body.total === "number");
    assert.ok(typeof body.offset === "number");
    assert.ok(typeof body.limit === "number");
  });

  it("/api/messages/events?role=user filters correctly", async () => {
    const { status, body } = await apiGet("/api/messages/events?limit=1&role=user");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.messages));
    // If any messages returned, they should have role 'user'
    if (body.messages.length > 0) {
      assert.equal(body.messages[0].role, "user");
    }
  });

  it("/api/messages/events?channel_id=all returns all (no filter)", async () => {
    const { status, body } = await apiGet("/api/messages/events?limit=1&channel_id=all");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.messages));
  });

  it("/api/messages/filters returns filters with channels", async () => {
    const { status, body } = await apiGet("/api/messages/filters");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.channels));
    assert.ok(Array.isArray(body.roles));
    assert.ok(Array.isArray(body.providers));
    assert.ok(Array.isArray(body.models));
  });

  it("/api/fs/list returns entries array", async () => {
    const { status, body } = await apiGet("/api/fs/list?path=/");
    assert.equal(status, 200);
    assert.ok(Array.isArray(body.entries));
    assert.ok(typeof body.path === "string");
  });

  it("HTML page includes favicon link", async () => {
    const { status, text } = await apiGetRaw("/");
    assert.equal(status, 200);
    assert.ok(text.includes("favicon.svg"), "HTML should include favicon.svg reference");
  });
});
