#!/usr/bin/env python3
import sys

def patch(path, anchor, replacement, count=1):
    with open(path, encoding="utf-8") as f:
        s = f.read()
    n = s.count(anchor)
    if n != count:
        print(f"FAIL {path}: anchor found {n} times (expected {count}): {anchor[:80]!r}")
        sys.exit(1)
    s = s.replace(anchor, replacement)
    with open(path, "w", encoding="utf-8") as f:
        f.write(s)
    print(f"OK {path}: {anchor[:60]!r}")

API = "/workspace/omni-dashboard/src/lib/api.ts"

patch(API, """export interface WorkflowRoleConfig {
  template?: string;
  profile?: string;
  provider?: string;
  model?: string;
  plan_mode?: string;
  retries?: number;
}""", """export interface WorkflowRoleConfig {
  template?: string;
  profile?: string;
  provider?: string;
  model?: string;
  plan_mode?: string;
  retries?: number;
  /** Role execution mode: 'agent' (default, LLM loop) | 'action' (runs an actions.yml tool). */
  mode?: string;
  /** actions.yml action id; required when mode === 'action'. */
  action_id?: string;
}""")

patch(API, """  /** Top-level (outside roles): clear `workflow_state.executions` when the task moves to review. Default: false. */
  clear_executions_on_review?: boolean;
  roles?: Record<string, WorkflowRoleConfig>;
}""", """  /** Top-level (outside roles): clear `workflow_state.executions` when the task moves to review. Default: false. */
  clear_executions_on_review?: boolean;
  /** Top-level: no reviewer — review-bound tasks go straight to done; review_on_fail forced false. Default: false. */
  auto_approve?: boolean;
  /** Top-level: failed steps go to review instead of blocked (ignored when auto_approve). Default: false. */
  review_on_fail?: boolean;
  roles?: Record<string, WorkflowRoleConfig>;
}""")

print("ALL API PATCHES APPLIED")
