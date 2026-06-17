import { Router, Request, Response } from "express";

export const scheduleRouter = Router();

scheduleRouter.get("/", (_req: Request, res: Response) => {
  res.json({ message: "Coming Soon" });
});
