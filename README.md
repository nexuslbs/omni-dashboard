# OmniAgent Workspace

This repository contains projects that run locally alongside **OmniAgent** on the same machine.

## Purpose

- Define `docker-compose.yml` files to run projects in isolated containers, even if the original project doesn't have one.
- Wrap third-party projects safely — no docker.sock mounts, no privileged mode, no seccomp: unconfined.
- Keep each project's code and data self-contained within its directory.

## Structure

```
.
├── README.md
├── AGENTS.md
├── .gitignore
│
├── sql-forge/
│   ├── docker-compose.yml     # Docker Compose configuration for this project
│   ├── base.env               # (optional) Environment variables template
│   ├── build/                 # (optional) Docker build artifacts (Dockerfiles, etc.)
│   ├── repo/                  # (gitignored) Cloned repository with the project source code
│   └── .env                   # (optional, gitignored) Credentials derived from base.env
│
├── premium-dashboard/
│   ├── docker-compose.yml     # Premium dashboard service
│   └── README.md              # Dashboard documentation
│
├── omni-dashboard/
│   ├── docker-compose.yml     # OmniAgent management dashboard
│   └── README.md              # Dashboard documentation
│   │                          #   - /overview — system KPIs
│   │                          #   - /threads — conversation threads
│   │                          #   - /messages — message history
│   │                          #   - /kanban — kanban board
│   │                          #   - /schedule — scheduled jobs
│   │                          #   - /prompt — prompt preview
│   │                          #   - /explorer — browse files, wiki, skills, .env, tools, plugins
│   │                          #   - /settings — environment settings
│   │                          #   - /profiles — LLM profiles
│   │                          #   - /channels — messaging channels
│   │                          #   - /platforms — communication platforms
│   │                          #   - /tools — MCP tools and servers
│   │                          #   - /providers — LLM providers
│   │                          #   - /actions — agent actions
│   │
└── other-project/             # More projects as needed
    ├── docker-compose.yml
    └── ...
```

## Rules

- Each project directory is named after the GitHub repository name.
- `docker-compose.yml` must be at the project root, not inside `repo/`.
- The `repo/` subtree is gitignored — only the project-level structure is versioned.
- Project names must not start with `omni` to avoid naming collisions with OmniAgent infra containers.
- No docker.sock mappings, no privileged mode, no overly permissive security options.
- Docker Compose project name should match the directory name (e.g., `sql-forge`).
- Containers, networks, and volumes should be named with the project prefix (e.g., `sql-forge-mysql`).


## Resource Management

Workspace projects share the host with OmniAgent. To stay within memory limits:

- **Only 1 workspace project runs at a time.** Never start a second while another is running.
- Every service must set a `mem_limit` via environment variable (e.g., `${MY_SERVICE_MEM:-500M}`). Values live in a gitignored `.env` file per project, so limits can change per machine without touching the repo.
- On an 8 GB host, non-workspace infra (OmniAgent, toolbox, etc.) may use up to 3 GB. The running workspace project should budget at most 5 GB total across all its services.

## Adding a New Project

1. Create a directory named after the repo: `mkdir -p project-name/repo`
2. Add `docker-compose.yml` at `project-name/`
3. Clone the actual repo into `project-name/repo/`
4. Optionally add `base.env` and/or `build/`
5. Optionally copy `base.env` to `.env` and fill in credentials (`.env` is gitignored)
