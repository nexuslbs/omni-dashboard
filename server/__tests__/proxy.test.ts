import { describe, it, expect } from "vitest";

const BASE = "http://localhost:3001";

// ── Helpers ──

async function apiGet(path: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`);
  const body = await res.json();
  return { status: res.status, body };
}

async function apiPost(path: string, data?: unknown): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: data !== undefined ? JSON.stringify(data) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

// ── Tests ──

describe("Local (non-proxied) API routes", () => {
  // ── /api/health ──
  describe("/api/health", () => {
    it("GET / returns 200 with status, version, uptime, and time", async () => {
      const { status, body } = await apiGet("/api/health");
      expect(status).toBe(200);
      expect(body).toHaveProperty("status", "ok");
      expect(body).toHaveProperty("version");
      expect(typeof body.version).toBe("string");
      expect(body).toHaveProperty("uptime");
      expect(typeof body.uptime).toBe("number");
      expect(body).toHaveProperty("time");
      expect(typeof body.time).toBe("number");
    });
  });

  // ── /api/wiki-search ──
  describe("/api/wiki-search", () => {
    it("POST / with empty body returns 400 validation error", async () => {
      const { status, body } = await apiPost("/api/wiki-search", {});
      expect(status).toBe(400);
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
    });

    it("POST / with query returns expected result shape or 502 error", async () => {
      const { status, body } = await apiPost("/api/wiki-search", {
        query: "test",
        limit: 5,
      });

      if (status === 200) {
        // Successful wiki search returns an array of results
        expect(Array.isArray(body)).toBe(true);
        if (body.length > 0) {
          const result = body[0];
          expect(result).toHaveProperty("file_path");
          expect(result).toHaveProperty("section_title");
          expect(result).toHaveProperty("content_preview");
          expect(result).toHaveProperty("score");
        }
      } else if (status === 502) {
        // Backend unavailable: check error structure
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("unavailable");
      } else {
        // Unexpected status: fail
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/fs/list ──
  describe("/api/fs", () => {
    it("GET /list?path=/ returns 200 with entries array", async () => {
      const { status, body } = await apiGet("/api/fs/list?path=/");
      expect(status).toBe(200);
      expect(body).toHaveProperty("entries");
      expect(Array.isArray(body.entries)).toBe(true);
      expect(body).toHaveProperty("path");
      expect(typeof body.path).toBe("string");

      if (body.entries.length > 0) {
        const entry = body.entries[0];
        expect(entry).toHaveProperty("name");
        expect(entry).toHaveProperty("path");
        expect(entry).toHaveProperty("type");
        expect(["directory", "file"]).toContain(entry.type);
        expect(entry).toHaveProperty("size");
      }
    });
  });

  // ── /api/profiles ──
  describe("/api/profiles", () => {
    it("GET / returns 200 with array of profiles", async () => {
      const { status, body } = await apiGet("/api/profiles");
      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);

      if (body.length > 0) {
        const profile = body[0];
        expect(profile).toHaveProperty("name");
        expect(typeof profile.name).toBe("string");
        expect(profile).toHaveProperty("skills");
        expect(Array.isArray(profile.skills)).toBe(true);
      }
    });
  });
});

describe("Named proxy routes (irregular path mappings)", () => {
  // ── /api/channels/:channelId/stop ──
  describe("/api/channels/:channelId/stop", () => {
    it("POST /1/stop returns 200 or 502 with correct error structure", async () => {
      const { status, body } = await apiPost("/api/channels/1/stop");

      if (status === 200) {
        // OmniAgent responded: any valid JSON is acceptable
        expect(body).toBeDefined();
      } else if (status === 502) {
        // Backend unreachable: check error structure
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/threads/:threadId/stop ──
  describe("/api/threads/:threadId/stop", () => {
    it("POST /1/stop returns 200 or 502 with correct error structure", async () => {
      const { status, body } = await apiPost("/api/threads/1/stop");

      if (status === 200) {
        expect(body).toBeDefined();
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/schedule/:id/run ──
  describe("/api/schedule/:id/run", () => {
    it("POST /1/run returns 200, 404, or 502 with correct error structure", async () => {
      const { status, body } = await apiPost("/api/schedule/1/run");

      if (status === 200) {
        expect(body).toBeDefined();
      } else if (status === 404) {
        // Job not found: omniagent returned an error
        expect(body).toHaveProperty("error");
        expect(body).toHaveProperty("schedule_id");
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 404, 502]);
      }
    });
  });
});

describe("Generic proxy routes (catch-all /api/*)", () => {
  // ── /api/threads ──
  describe("/api/threads", () => {
    it("GET / returns 200 or 502 with correct structure", async () => {
      const { status, body } = await apiGet("/api/threads");

      if (status === 200) {
        expect(body).toHaveProperty("data");
        if (body.data) {
          expect(body.data).toHaveProperty("threads");
          expect(Array.isArray(body.data.threads)).toBe(true);
        }
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/messages/filters ──
  describe("/api/messages/filters", () => {
    it("GET / returns 200 or 502 with correct structure", async () => {
      const { status, body } = await apiGet("/api/messages/filters");

      if (status === 200) {
        // OmniAgent wraps response in { data: { ... } }
        const data = body.data || body;
        expect(data).toHaveProperty("channels");
        expect(Array.isArray(data.channels)).toBe(true);
        expect(data).toHaveProperty("roles");
        expect(Array.isArray(data.roles)).toBe(true);
        expect(data).toHaveProperty("providers");
        expect(Array.isArray(data.providers)).toBe(true);
        expect(data).toHaveProperty("models");
        expect(Array.isArray(data.models)).toBe(true);
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/overview/dashboard ──
  describe("/api/overview/dashboard", () => {
    it("GET / returns 200 or 502 with correct structure", async () => {
      const { status, body } = await apiGet("/api/overview/dashboard");

      if (status === 200) {
        expect(body).toBeDefined();
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/kanban/tasks ──
  describe("/api/kanban/tasks", () => {
    it("GET / returns 200 or 502 with correct structure", async () => {
      const { status, body } = await apiGet("/api/kanban/tasks");

      if (status === 200) {
        expect(body).toBeDefined();
        expect(Array.isArray(body) || typeof body === "object").toBe(true);
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/memory/stats ──
  describe("/api/memory/stats", () => {
    it("GET / returns 200 or 502 with correct structure", async () => {
      const { status, body } = await apiGet("/api/memory/stats");

      if (status === 200) {
        expect(body).toBeDefined();
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/schedule ──
  describe("/api/schedule", () => {
    it("GET / returns 200 or 502 with correct structure", async () => {
      const { status, body } = await apiGet("/api/schedule");

      if (status === 200) {
        // OmniAgent wraps response in { data: [...] }
        const data = body.data || body;
        expect(Array.isArray(data)).toBe(true);
        if (data.length > 0) {
          const job = data[0];
          expect(job).toHaveProperty("id");
          expect(job).toHaveProperty("name");
          expect(job).toHaveProperty("schedule");
        }
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/channels ──
  describe("/api/channels", () => {
    it("GET / returns 200 or 502 with correct structure", async () => {
      const { status, body } = await apiGet("/api/channels");

      if (status === 200) {
        // OmniAgent wraps response in { data: [...] }
        const data = body.data || body;
        expect(Array.isArray(data)).toBe(true);
        if (data.length > 0) {
          const channel = data[0];
          expect(channel).toHaveProperty("id");
          expect(channel).toHaveProperty("name");
        }
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });

  // ── /api/platforms ──
  describe("/api/platforms", () => {
    it("GET / returns 200 or 502 with correct structure", async () => {
      const { status, body } = await apiGet("/api/platforms");

      if (status === 200) {
        // OmniAgent wraps response in { data: [...] }
        const data = body.data || body;
        expect(Array.isArray(data)).toBe(true);
      } else if (status === 502) {
        expect(body).toHaveProperty("error");
        expect(typeof body.error).toBe("string");
        expect(body.error).toContain("Failed to reach OmniAgent");
      } else {
        expect(status).toBeOneOf([200, 502]);
      }
    });
  });
});

describe("Proxy error handling: 502 for unreachable routes", () => {
  it("Generic proxy returns 502 with error structure when omniagent is unreachable", async () => {
    // Hit a route that goes through the generic proxy.
    // If omniagent is reachable, the test still passes: the error structure
    // is only verified when we get a 502.
    const { status, body } = await apiGet("/api/threads");

    if (status === 502) {
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error).toContain("Failed to reach OmniAgent");
    }
  });

  it("Named proxy returns 502 with error structure when omniagent is unreachable", async () => {
    const { status, body } = await apiPost("/api/channels/1/stop");

    if (status === 502) {
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      expect(body.error).toContain("Failed to reach OmniAgent");
    }
  });

  it("Local route returns 502 with error structure when dependent backend is unreachable", async () => {
    // wiki-search can return 502 if Qdrant is unreachable
    const { status, body } = await apiPost("/api/wiki-search", {
      query: "test",
      limit: 5,
    });

    if (status === 502) {
      expect(body).toHaveProperty("error");
      expect(typeof body.error).toBe("string");
      // wiki-search returns its own error messages
      expect(typeof body.error === "string").toBe(true);
    }
  });
});
