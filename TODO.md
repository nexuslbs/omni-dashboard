# OmniAgent Memory & Performance Improvements

## ✅ Implemented

### Leaner System Prompt (prompt_builder.rs)
- [x] Remove empty constants: `RESEARCH_WORKFLOW`, `SKILLS_GUIDANCE`, `WIKI_GUIDANCE`, `DOCKER_EXECUTION_GUIDANCE`
- [x] Shorten `DB_SCHEMA` from raw DDL (~500 tokens) to compact summary (~150 chars)

### Templates for Kanban & Cron Tasks
- [x] **Migration:** `kanban_tasks.template TEXT`, `cron_jobs.instruction_file TEXT`
- [x] **Template loader:** `load_template()` in `prompt_builder.rs` reads from `profiles/<name>/templates/<name>.md`
- [x] **Kanban dispatcher (scheduler.rs):** Fetches `template`, stores in cause message metadata
- [x] **Cron scheduler (scheduler.rs):** Fetches `instruction_file`, stores in cause message metadata
- [x] **process_thread (agent/mod.rs):** Loads template from metadata, injects as "=== Task Template ===" system message
- [x] **MCP tool (kanban.rs):** `create_kanban_task` accepts optional `template` param, `template` in list queries
- [x] **Kanban create modal:** Template text input field
- [x] **Kanban edit modal:** Template text input field, populated from task data
- [x] **Kanban detail view:** Shows template value
- [x] **Cron create/edit modal:** Instruction File text input field
- [x] **Cron detail view:** Shows instruction_file value
- [x] **Sample template:** `code-improvement.md` at `/opt/data/profiles/default/templates/`

### Adaptive Planning (context_builder.rs + agent/mod.rs)
- [x] `Complexity` enum: `Simple | Standard | Complex`
- [x] `classify_complexity()` with keyword detection and structured task detection
- [x] Simple messages (< 60 chars, greetings) skip planning entirely
- [x] Complex keywords (implement, refactor, design) trigger deep planning
- [x] Planning threshold lowered from 200 to 100 chars for standard tasks

### Subtask Automation (agent/mod.rs)
- [x] After plan generation for Complex tasks, parses plan lines into subtasks
- [x] Max 6 subtasks, priority-ordered from plan
- [x] Subtasks appear in system prompt as "Current Task Progress" block
