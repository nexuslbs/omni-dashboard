import { Router, Request, Response } from "express";
import { queryDb } from "../db.js";

const KANBAN_COLUMNS = [
  { id: "backlog", title: "Backlog" },
  { id: "todo", title: "Todo" },
  { id: "ready", title: "Ready" },
  { id: "running", title: "In Progress" },
  { id: "review", title: "Review" },
  { id: "done", title: "Done" },
  { id: "blocked", title: "Blocked" },
];

const VALID_STATUSES = new Set(KANBAN_COLUMNS.map((c) => c.id));

export const kanbanRouter = Router();

// ── GET /api/kanban/board — Tasks grouped by status ──
kanbanRouter.get("/board", async (req: Request, res: Response) => {
  try {
    const showArchived = req.query.show_archived === "true";

    const tasks = await queryDb(
      `SELECT id, title, body, assignee, channel_id, profile, status, priority,
              COALESCE(position, 0) AS position,
              created_at, updated_at, archived, template, planning_mode
       FROM kanban_tasks
       WHERE archived = ${showArchived}
       ORDER BY position ASC, created_at DESC`,
    );

    const columns = KANBAN_COLUMNS.map((col) => ({
      id: col.id,
      title: col.title,
      tasks: tasks.filter((t: any) => t.status === col.id),
    }));

    res.json({ columns, total: tasks.length });
  } catch (e: any) {
    console.error("Kanban board error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/kanban/tasks/:id — Task detail ──
kanbanRouter.get("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const tasks = await queryDb(
      `SELECT id, title, body, assignee, channel_id, profile, status, priority,
              created_at, updated_at, archived, template, planning_mode
       FROM kanban_tasks WHERE id = $1`,
      [taskId],
    );

    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json(tasks[0]);
  } catch (e: any) {
    console.error("Kanban task detail error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── POST /api/kanban/tasks — Create task ──
kanbanRouter.post("/tasks", async (req: Request, res: Response) => {
  try {
    const { title, body, channel_id, profile, priority, status, template, planning_mode } = req.body;
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const id = "task_" + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const taskStatus = status && VALID_STATUSES.has(status) ? status : "backlog";
    const taskPriority = priority != null ? priority : 0;
    const taskProfile = profile || null;

    // Get max position for this status group
    const posResult = await queryDb(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM kanban_tasks WHERE status = $1`,
      [taskStatus],
    );
    const nextPos = posResult.length > 0 ? posResult[0].next_pos : 0;

    await queryDb(
      `INSERT INTO kanban_tasks (id, title, body, status, priority, channel_id, profile, position, template, planning_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        id,
        title.trim(),
        body || "",
        taskStatus,
        taskPriority,
        channel_id != null ? channel_id : null,
        taskProfile,
        nextPos,
        template || null,
        planning_mode || "",
      ],
    );

    res.json({ success: true, id });
  } catch (e: any) {
    console.error("Kanban create task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/kanban/tasks/:id/status — Move task between columns ──
kanbanRouter.patch("/tasks/:id/status", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const { status, position } = req.body;
    if (!VALID_STATUSES.has(status)) {
      res.status(400).json({
        error: `Status must be one of: ${Array.from(VALID_STATUSES).join(", ")}`,
      });
      return;
    }

    // Check task exists
    const tasks = await queryDb(
      `SELECT id, status, COALESCE(position, 0) AS position FROM kanban_tasks WHERE id = $1`,
      [taskId],
    );
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const task = tasks[0];
    const oldStatus = task.status;
    const oldPosition = task.position;

    // If position is provided, handle shifting; otherwise append to end
    let targetPosition = position;
    if (targetPosition === undefined || targetPosition === null) {
      // Append to end of new status
      const posResult = await queryDb(
        `SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM kanban_tasks WHERE status = $1`,
        [status],
      );
      targetPosition = posResult.length > 0 ? posResult[0].next_pos : 0;
    }

    // If status changed, fill gap in old column and make room in new
    if (oldStatus !== status) {
      // Fill gap in old column
      await queryDb(`UPDATE kanban_tasks SET position = position - 1 WHERE status = $1 AND position > $2`, [
        oldStatus,
        oldPosition,
      ]);
      // Make room in new column
      await queryDb(
        `UPDATE kanban_tasks SET position = position + 1 WHERE status = $1 AND position >= $2 AND id != $3`,
        [status, targetPosition, taskId],
      );
    } else {
      // Reorder within the same column
      if (targetPosition > oldPosition) {
        // Moving down: shift intermediate tasks up
        await queryDb(
          `UPDATE kanban_tasks SET position = position - 1 WHERE status = $1 AND position > $2 AND position <= $3 AND id != $4`,
          [status, oldPosition, targetPosition, taskId],
        );
      } else if (targetPosition < oldPosition) {
        // Moving up: shift intermediate tasks down
        await queryDb(
          `UPDATE kanban_tasks SET position = position + 1 WHERE status = $1 AND position >= $2 AND position < $3 AND id != $4`,
          [status, targetPosition, oldPosition, taskId],
        );
      }
    }

    await queryDb(`UPDATE kanban_tasks SET status = $1, position = $2, updated_at = NOW() WHERE id = $3`, [
      status,
      targetPosition,
      taskId,
    ]);

    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban update status error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/kanban/tasks/:id/position — Update task position within/between columns ──
kanbanRouter.patch("/tasks/:id/position", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    const { status, position } = req.body;
    if (position === undefined || position === null) {
      res.status(400).json({ error: "position is required" });
      return;
    }
    if (status && !VALID_STATUSES.has(status)) {
      res.status(400).json({
        error: `Status must be one of: ${Array.from(VALID_STATUSES).join(", ")}`,
      });
      return;
    }

    // Check task exists and get current info
    const tasks = await queryDb(
      `SELECT id, status, COALESCE(position, 0) AS position FROM kanban_tasks WHERE id = $1`,
      [taskId],
    );
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    const task = tasks[0];
    const newStatus = status || task.status;
    const oldStatus = task.status;
    const oldPosition = task.position;

    if (oldStatus === newStatus && oldPosition === position) {
      // No-op: already at that position
      res.json({ success: true });
      return;
    }

    if (oldStatus !== newStatus) {
      // Cross-column move
      // Fill gap in old column
      await queryDb(`UPDATE kanban_tasks SET position = position - 1 WHERE status = $1 AND position > $2`, [
        oldStatus,
        oldPosition,
      ]);
      // Make room in new column
      await queryDb(
        `UPDATE kanban_tasks SET position = position + 1 WHERE status = $1 AND position >= $2 AND id != $3`,
        [newStatus, position, taskId],
      );
    } else {
      // Reorder within same column
      if (position > oldPosition) {
        // Moving down: shift intermediate tasks up
        await queryDb(
          `UPDATE kanban_tasks SET position = position - 1 WHERE status = $1 AND position > $2 AND position <= $3 AND id != $4`,
          [newStatus, oldPosition, position, taskId],
        );
      } else if (position < oldPosition) {
        // Moving up: shift intermediate tasks down
        await queryDb(
          `UPDATE kanban_tasks SET position = position + 1 WHERE status = $1 AND position >= $2 AND position < $3 AND id != $4`,
          [newStatus, position, oldPosition, taskId],
        );
      }
    }

    await queryDb(`UPDATE kanban_tasks SET status = $1, position = $2, updated_at = NOW() WHERE id = $3`, [
      newStatus,
      position,
      taskId,
    ]);

    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban update position error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── PATCH /api/kanban/tasks/:id — Update task details ──
kanbanRouter.patch("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    // Check task exists and fetch current values
    const tasks = await queryDb(
      `SELECT id, title, body, status, priority, channel_id, profile, template,
              planning_mode, archived, assignee, created_at, updated_at
       FROM kanban_tasks WHERE id = $1`,
      [taskId],
    );
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const before = tasks[0];

    const { title, body, channel_id, profile, priority, status, archived, template, planning_mode } =
      req.body;
    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIdx = 2;

    if (title !== undefined) {
      if (typeof title !== "string" || title.trim().length === 0) {
        res.status(400).json({ error: "Title cannot be empty" });
        return;
      }
      setClauses.push(`title = $${paramIdx++}`);
      params.push(title.trim());
    }
    if (body !== undefined) {
      setClauses.push(`body = $${paramIdx++}`);
      params.push(body);
    }
    if (channel_id !== undefined) {
      setClauses.push(`channel_id = $${paramIdx++}`);
      params.push(channel_id);
    }
    if (profile !== undefined) {
      setClauses.push(`profile = NULLIF($${paramIdx++}, '')::text`);
      params.push(profile);
    }
    if (priority !== undefined) {
      setClauses.push(`priority = $${paramIdx++}`);
      params.push(priority);
    }
    if (status !== undefined) {
      if (!VALID_STATUSES.has(status)) {
        res.status(400).json({
          error: `Status must be one of: ${Array.from(VALID_STATUSES).join(", ")}`,
        });
        return;
      }
      setClauses.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    if (archived !== undefined) {
      setClauses.push(`archived = $${paramIdx++}`);
      params.push(archived);
    }
    if (template !== undefined) {
      setClauses.push(`template = $${paramIdx++}`);
      params.push(template);
    }
    if (planning_mode !== undefined) {
      setClauses.push(`planning_mode = $${paramIdx++}`);
      params.push(planning_mode);
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    setClauses.push("updated_at = NOW()");

    const sql = `UPDATE kanban_tasks SET ${setClauses.join(", ")} WHERE id = $1`;
    await queryDb(sql, [taskId, ...params]);

    // ── Insert kanban history for the edit ──
    const previousValues = {
      title: before.title,
      body: before.body,
      status: before.status,
      priority: before.priority,
      channel_id: before.channel_id,
      profile: before.profile,
      template: before.template,
      planning_mode: before.planning_mode,
      archived: before.archived,
      assignee: before.assignee,
    };

    const hasStatusChange = status !== undefined && status !== before.status;
    const hasArchiveChange = archived !== undefined && archived !== before.archived;

    if (hasArchiveChange) {
      // Archived/unarchived — log without previous_values
      const action = archived ? "archived" : "unarchived";
      await queryDb(
        `INSERT INTO kanban_history (kanban_task_id, action, initial_board, final_board, previous_values)
         VALUES ($1, $2, NULL, NULL, NULL)`,
        [taskId, action],
      );
    } else if (hasStatusChange) {
      // Status move — log without previous_values
      await queryDb(
        `INSERT INTO kanban_history (kanban_task_id, action, initial_board, final_board, previous_values)
         VALUES ($1, $2, $3, $4, NULL)`,
        [taskId, "moved", before.status, status],
      );
    } else {
      // Field edit — log with full previous values
      await queryDb(
        `INSERT INTO kanban_history (kanban_task_id, action, initial_board, final_board, previous_values)
         VALUES ($1, $2, NULL, NULL, $3::jsonb)`,
        [taskId, "edited", JSON.stringify(previousValues)],
      );
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban update task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── DELETE /api/kanban/tasks/:id — Delete task ──
kanbanRouter.delete("/tasks/:id", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.id;
    if (!taskId) {
      res.status(400).json({ error: "Invalid task ID" });
      return;
    }

    // Fetch the task before deleting to capture previous_values
    const tasks = await queryDb(
      `SELECT id, title, body, status, priority, channel_id, profile, template,
              planning_mode, archived, assignee, created_at, updated_at
       FROM kanban_tasks WHERE id = $1`,
      [taskId],
    );
    if (tasks.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    const before = tasks[0];

    // ── Insert kanban history with full previous values ──
    const previousValues = {
      title: before.title,
      body: before.body,
      status: before.status,
      priority: before.priority,
      channel_id: before.channel_id,
      profile: before.profile,
      template: before.template,
      planning_mode: before.planning_mode,
      archived: before.archived,
      assignee: before.assignee,
    };
    await queryDb(
      `INSERT INTO kanban_history (kanban_task_id, action, initial_board, final_board, previous_values)
       VALUES ($1, $2, NULL, NULL, $3::jsonb)`,
      [taskId, "deleted", JSON.stringify(previousValues)],
    );

    // Clear FK references in related tables before deleting
    await queryDb(`UPDATE threads SET task_id = NULL WHERE task_id = $1`, [taskId]);

    const result = await queryDb(`DELETE FROM kanban_tasks WHERE id = $1 RETURNING id`, [taskId]);

    if (result.length === 0) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({ success: true });
  } catch (e: any) {
    console.error("Kanban delete task error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/kanban/tasks/:taskId/threads — Threads for a kanban task ──
kanbanRouter.get("/tasks/:taskId/threads", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId;
    const offset = parseInt(req.query.offset as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);
    const order = (req.query.order as string) === "asc" ? "ASC" : "DESC";

    // Total count
    const countResult = await queryDb(`SELECT COUNT(*) AS total FROM threads WHERE task_id = $1`, [taskId]);
    const total = parseInt(countResult[0]?.total) || 0;

    // Paginated rows — last message per thread with all message fields
    const rows = await queryDb(
      `SELECT last_msg.*, t.status AS thread_status, c.name AS channel_name
       FROM threads t
       LEFT JOIN channels c ON c.id = t.channel_id
       LEFT JOIN LATERAL (
         SELECT m.id, m.thread_id, m.role, m.content, m.msg_type AS type,
                m.msg_subtype AS subtype, t.provider, t.model,
                m.processing_time_ms, m.token_usage,
                m.iteration_number, m.thread_sequence,
                m.created_at, m.metadata
          FROM messages m
         WHERE m.thread_id = t.id
         ORDER BY m.id DESC
         LIMIT 1
       ) last_msg ON true
       WHERE t.task_id = $1
       ORDER BY last_msg.created_at ${order} NULLS LAST
       OFFSET $2
       LIMIT $3`,
      [taskId, offset, limit],
    );

    res.json({ rows, total });
  } catch (e: any) {
    console.error("Kanban threads error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});

// ── GET /api/kanban/history — History log ──
kanbanRouter.get("/history", async (req: Request, res: Response) => {
  try {
    const taskId = (req.query.task_id as string) || "";
    const action = (req.query.action as string) || "";
    const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
    const offset = parseInt(req.query.offset as string) || 0;

    const rows = await queryDb(
      `SELECT id, kanban_task_id, action, initial_board, final_board,
              previous_values, created_at::text AS created_at
       FROM kanban_history
       WHERE ($1 = '' OR kanban_task_id = $1)
         AND ($2 = '' OR action = $2)
       ORDER BY id DESC
       LIMIT $3 OFFSET $4`,
      [taskId, action, limit, offset],
    );

    res.json({ success: true, data: rows });
  } catch (e: any) {
    console.error("Kanban history error:", e?.message || e);
    res.status(500).json({ success: false, error: e.message || "Unknown error" });
  }
});

// ── GET /api/kanban/tasks/:taskId/subtasks — Subtasks for all threads of a kanban task ──
kanbanRouter.get("/tasks/:taskId/subtasks", async (req: Request, res: Response) => {
  try {
    const taskId = req.params.taskId;
    const rows = await queryDb(
      `SELECT ts.id, ts.description, ts.status, ts.priority, ts.thread_id,
              COALESCE(NULLIF(t.cause, ''), t.id::text) AS thread_title,
              ts.created_at, ts.updated_at
       FROM thread_subtasks ts
       JOIN threads t ON t.id = ts.thread_id
       WHERE t.task_id = $1
       ORDER BY t.id, ts.priority DESC, ts.id ASC`,
      [taskId],
    );
    res.json({ subtasks: rows });
  } catch (e: any) {
    console.error("Kanban subtasks error:", e?.message || e);
    res.status(500).json({ error: e.message || "Unknown error" });
  }
});
