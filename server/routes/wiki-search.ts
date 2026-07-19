import { Router, Request, Response } from "express";

export const wikiSearchRouter = Router();

wikiSearchRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { query, limit = 10 } = req.body;

    if (!query || typeof query !== "string") {
      res.status(400).json({ error: "Query string is required" });
      return;
    }

    const scrollLimit = Math.max(limit, 100);

    const response = await fetch("http://qdrant:6333/collections/wiki/points/scroll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        limit: scrollLimit,
        with_payload: true,
        with_vector: false,
      }),
    });

    if (!response.ok) {
      // console.error("[wiki-search] Qdrant error:", response.status, await response.text().catch(() => "Unknown error"));
      res.status(502).json({ error: "Search backend unavailable" });
      return;
    }

    const data = (await response.json()) as {
      result?: { points?: Array<{ id: number; payload?: { title?: string; path?: string } }> };
    };
    const points = data.result?.points ?? [];

    const queryLower = query.toLowerCase();

    // Filter by case-insensitive substring match on payload fields
    const filtered = points.filter((p: { payload?: { title?: string; path?: string } }) => {
      const payload = p.payload || {};
      const title: string = payload.title || "";
      const path: string = payload.path || "";

      return title.toLowerCase().includes(queryLower) || path.toLowerCase().includes(queryLower);
    });

    // Sort by relevance: path match > title match
    interface ScoredResult {
      file_path: string;
      section_title: string;
      content_preview: string;
      score: number;
    }
    const scored: ScoredResult[] = filtered.map((p: { payload?: { title?: string; path?: string } }) => {
      const payload = p.payload || {};
      const path: string = payload.path || "";
      const title: string = payload.title || "";

      let score = 0;
      if (path.toLowerCase().includes(queryLower)) score += 3;
      if (title.toLowerCase().includes(queryLower)) score += 2;

      return {
        file_path: path,
        section_title: title,
        content_preview: title,
        score,
      };
    });

    scored.sort((a: ScoredResult, b: ScoredResult) => b.score - a.score);

    res.json(scored.slice(0, limit));
  } catch (err) {
    console.error("[wiki-search] Error:", err);
    res.status(500).json({ error: "Failed to search wiki" });
  }
});
