# Agent Guide — OmniAgent Workspace

This file helps AI agents (like OmniAgent) understand how to work with this repository.

## Project Structure

- Each subdirectory under the root is a **project** named after its GitHub repository.
- The actual source code lives in `project-name/repo/` (gitignored at workspace level).
- `project-name/docker-compose.yml` is the safe, curated compose file for running the project.
- `project-name/base.env` is a template for environment variables.
- `project-name/.env` contains actual credentials (gitignored).

## Running a Project

```bash
# Start all services for a project
cd /opt/workspace/project-name
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f
```

## Adding a New Project

1. Create the project directory: `mkdir -p project-name/repo`
2. Clone the repo: `git clone <repo-url> project-name/repo/`
3. Write `project-name/docker-compose.yml`
4. Optionally create `project-name/base.env` with template variables
5. Optionally create `project-name/build/` with Dockerfiles
6. Optionally copy `base.env` to `.env` and set real values

## Resource Management

Workspace projects share the machine with OmniAgent. To avoid OOM crashes:

- **At most 1 workspace project runs at a time.** Never run two project compose stacks simultaneously.
- Each service must set a \`mem_limit\` via environment variable (e.g., \`\${MY_SERVICE_MEM:-500M}\`) — never hardcoded. The \`.env\` file (gitignored) holds the actual values per environment.
- On an 8 GB machine, assume base infra (OmniAgent, toolbox, tunnel, etc.) uses up to 3 GB. The workspace project budget is at most **5 GB total** across all its services.
- If you move to a machine with different RAM, only the \`.env\` values change — compose files stay the same.

## Safety Rules

Projects run on the same machine as OmniAgent. To keep the host safe:

- No docker.sock bind mounts (no Docker-in-Docker)
- No privileged: true containers
- No seccomp: unconfined or security_opt overrides
- No host network mode (network_mode: host)
- Container, network and volume names must not start with `omni` (project name defaults to the directory name, which cannot start with `omni` per the `.gitignore`, so this is automatically enforced)

## Omni-Dashboard Routes

The management dashboard (port 12346) has these pages:

| Route | Description |
|-------|-------------|
| `/overview` | System KPIs and channel health |
| `/threads` | Conversation threads |
| `/messages` | Message history with filters |
| `/kanban` | Kanban board |
| `/schedule` | Scheduled cron jobs |
| `/prompt` | Prompt preview |
| `/explorer` | File explorer — browse wiki, skills, .env, tools, plugins, and uploads |
| `/settings` | Environment configuration |
| `/profiles` | LLM provider profiles |
| `/channels` | Messaging channels |
| `/platforms` | Communication platform plugins |
| `/tools` | MCP tools and servers |
| `/providers` | LLM provider plugins |
| `/actions` | Agent action history |

> **Note:** `/explorer` was previously called `/wiki`. It now shows more than just wiki content — files, skills, .env, tools, plugins, and uploads are also browsable.

If a project requires any of the above, it must run on a separate machine (e.g., a cloud VM).

## Git Workflow

- The `.gitignore` ignores everything in `project-name/repo/` — only project-level config is versioned.
- Commit messages follow conventional commits format.
- Push to `nexuslbs/omni-workspace` (private org repo).
