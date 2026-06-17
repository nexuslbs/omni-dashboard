import { Router, Request, Response } from "express";

export const kanbanRouter = Router();

kanbanRouter.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Coming Soon" });
});
