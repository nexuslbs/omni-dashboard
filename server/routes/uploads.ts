import { Router, Request, Response } from "express";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { join, normalize } from "path";
import multer from "multer";

export const uploadsRouter = Router();

const UPLOADS_DIR = (() => {
  const dir = process.env.OMNI_DIR;
  if (!dir) throw new Error("OMNI_DIR environment variable must be set");
  return dir + "/data/uploads";
})();

const KANBAN_DIR = (() => {
  const dir = process.env.OMNI_DIR;
  if (!dir) throw new Error("OMNI_DIR environment variable must be set");
  return dir + "/data/kanban";
})();

// Ensure uploads directory exists
function ensureUploadsDir(): void {
  if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

// Path traversal protection
function safePath(fileName: string): string | null {
  const fullPath = normalize(join(UPLOADS_DIR, fileName));
  if (!fullPath.startsWith(UPLOADS_DIR)) {
    return null;
  }
  return fullPath;
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureUploadsDir();
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    // Sanitize filename
    const name = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 20, // max 20 files
  },
});

// GET /uploads/list — list files in uploads directory
uploadsRouter.get("/list", (_req: Request, res: Response) => {
  try {
    ensureUploadsDir();
    const entries = readdirSync(UPLOADS_DIR);
    const result = entries.map((name) => {
      const fullPath = join(UPLOADS_DIR, name);
      const stats = statSync(fullPath);
      return {
        name,
        type: stats.isDirectory() ? "directory" : "file",
        size: stats.size,
        modified_at: stats.mtime.toISOString(),
      };
    });

    // Sort by modified_at descending
    result.sort((a, b) => new Date(b.modified_at).getTime() - new Date(a.modified_at).getTime());

    res.json(result);
  } catch (err) {
    console.error("[uploads] Error listing files:", err);
    res.status(500).json({ error: "Failed to list uploads" });
  }
});

// DELETE /uploads/:file — delete a file
uploadsRouter.delete("/:file", (req: Request, res: Response) => {
  try {
    const fileName = req.params.file;
    if (Array.isArray(fileName)) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }
    const filePath = safePath(fileName);
    if (!filePath) {
      res.status(400).json({ error: "Invalid file path" });
      return;
    }

    if (!existsSync(filePath)) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const stats = statSync(filePath);
    if (!stats.isFile()) {
      res.status(400).json({ error: "Not a file" });
      return;
    }

    unlinkSync(filePath);
    res.json({ success: true, file: fileName });
  } catch (err) {
    console.error("[uploads] Error deleting file:", err);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// POST /uploads/check — check if files exist
uploadsRouter.post("/check", (req: Request, res: Response) => {
  try {
    const { files } = req.body;
    if (!Array.isArray(files)) {
      res.status(400).json({ error: "files array is required" });
      return;
    }

    ensureUploadsDir();
    const result: { [key: string]: boolean } = {};
    for (const fileName of files) {
      if (typeof fileName !== "string") continue;
      const filePath = safePath(fileName);
      if (filePath) {
        result[fileName] = existsSync(filePath);
      } else {
        result[fileName] = false;
      }
    }

    res.json(result);
  } catch (err) {
    console.error("[uploads] Error checking files:", err);
    res.status(500).json({ error: "Failed to check files" });
  }
});

// POST /uploads — upload files
uploadsRouter.post("/", upload.array("files", 20), (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const result = files.map((file) => ({
      original_name: file.originalname,
      size: file.size,
      mime_type: file.mimetype,
      path: file.filename,
    }));

    res.json({ files: result });
  } catch (err) {
    console.error("[uploads] Error uploading files:", err);
    res.status(500).json({ error: "Failed to upload files" });
  }
});

// ── Kanban file uploads ────────────────────────────────────────────────

function ensureKanbanDir(): void {
  if (!existsSync(KANBAN_DIR)) {
    mkdirSync(KANBAN_DIR, { recursive: true });
  }
}

const kanbanStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    ensureKanbanDir();
    cb(null, KANBAN_DIR);
  },
  filename: (_req, file, cb) => {
    const name = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    cb(null, name);
  },
});

const kanbanUpload = multer({
  storage: kanbanStorage,
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 20,
  },
});

// POST /uploads/kanban — upload files to kanban directory
uploadsRouter.post("/kanban", kanbanUpload.array("files", 20), (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: "No files uploaded" });
      return;
    }

    const taskId = (req.query.task_id as string) || "";

    const result = files.map((file) => {
      let destPath = file.filename;

      // If task_id is provided, scope files under data/kanban/{task_id}/
      if (taskId) {
        const scopedDir = join(KANBAN_DIR, taskId);
        if (!existsSync(scopedDir)) {
          mkdirSync(scopedDir, { recursive: true });
        }
        // Move the file from the flat kanban dir to the scoped dir
        const src = join(KANBAN_DIR, file.filename);
        const dst = join(scopedDir, file.filename);
        try {
          renameSync(src, dst);
        } catch {
          // If rename fails (e.g. cross-device), copy+unlink
          const buf = readFileSync(src);
          writeFileSync(dst, buf);
          unlinkSync(src);
        }
        destPath = `${taskId}/${file.filename}`;
      }

      return {
        original_name: file.originalname,
        size: file.size,
        mime_type: file.mimetype,
        path: destPath,
      };
    });

    res.json({ files: result });
  } catch (err) {
    console.error("[kanban-uploads] Error uploading files:", err);
    res.status(500).json({ error: "Failed to upload kanban files" });
  }
});
