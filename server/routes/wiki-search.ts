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
      const errText = await response.text().catch(() => "Unknown error");
      console.error("[wiki-search] Qdrant error:", response.status, errText);
      res.status(502).json({ error: "Search backend unavailable" });
      return;
    }

    const data: any = await response.json();
    const points = data.result?.points ?? [];

    const queryLower = query.toLowerCase();

    // Filter by case-insensitive substring match on payload fields
    const filtered = points.filter((p: any) => {
      const payload = p.payload || {};
      const title: string = payload.title || "";
      const path: string = payload.path || "";
      const updated: string = payload.updated || "";

      return (
        title.toLowerCase().includes(queryLower) ||
        path.toLowerCase().includes(queryLower)
      );
    });

    // Sort by relevance: path match > title match
    const scored = filtered.map((p: any) => {
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

    scored.sort((a: any, b: any) => b.score - a.score);

    res.json(scored.slice(0, limit));
  } catch (err) {
    console.error("[wiki-search] Error:", err);
    res.status(500).json({ error: "Failed to search wiki" });
  }
});
