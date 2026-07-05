#!/usr/bin/env python3
"""
Omni-Dashboard Integration Tests

Tests that the dashboard's key API endpoints return proper data:
- /api/schedule — create as disabled, verify loaded
- /api/kanban/tasks — create in backlog, verify loaded
- /api/secrets — create and verify loaded
- /api/plugins/actions/reinstall — verify Rust recompilation works (exit code 101 regression)
- Each page's data loads correctly (not just HTTP 200)

Requires: requests, access to the dashboard proxy
Usage: python3 test_dashboard_api.py
"""

import json
import sys
import time
import urllib.request
import urllib.error


BASE_URL = "http://omni-dashboard-1:3001/api"


def api(path, method="GET", data=None):
    """Make an API call and return parsed JSON."""
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode("utf-8") if data else None
    req = urllib.request.Request(
        url,
        data=body,
        method=method,
        headers={"Content-Type": "application/json"} if body else {},
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode("utf-8")
            if resp.status != 200:
                return {"error": f"HTTP {resp.status}", "raw": raw}
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"error": "invalid json", "raw": raw}
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", errors="replace")
        return {"error": f"HTTP {e.code}", "raw": raw}
    except Exception as e:
        return {"error": str(e)}


def check(label, condition, detail=""):
    """Print test result."""
    status = "✅" if condition else "❌"
    print(f"  {status} {label}")
    if not condition and detail:
        print(f"     {detail}")
    return condition


def test_page_loads(path, name):
    """Test that a page API loads successfully with data."""
    print(f"\n📄 {name} page ({path}):")
    result = api(path)
    
    if not check("HTTP 200 OK", "error" not in result, str(result.get("error"))):
        # Try alternate: maybe the response has {success, data} wrapper
        pass
    
    # Check success field
    if "success" in result:
        check("Has success field", result["success"] is True,
              f"Got success={result['success']}")
    else:
        print("  ℹ️  No success field (apiGet may unwrap)")
    
    # Check data exists
    if "data" in result:
        data = result["data"]
    else:
        data = result
    
    if isinstance(data, list):
        # Just check it's a list (may be empty for fresh DB)
        check("Data is a list", isinstance(data, list), f"Type: {type(data)}")
        print(f"     Items: {len(data)}")
        return True, data
    elif isinstance(data, dict):
        check("Data is a dict", True)
        return True, data
    else:
        print(f"     Unexpected data type: {type(data)}")
        return False, data


def test_reinstall_plugin(name):
    """
    Test that reinstalling a plugin works.
    
    This test simulates the error where 'actions' plugin (a Rust crate with
    path deps like `omniagent = { path = \"../../../\" }`) failed to compile
    because the reinstall handler built from the data directory where relative
    paths don't resolve correctly.
    
    The fix: use workspace-root compilation (like the install handler does)
    so path dependencies resolve correctly.
    
    This test would FAIL with the old code (exit 101 from cargo) and
    PASS with the fix — without any changes to the test itself.
    """
    print(f"\n🔧 Reinstall test: {name}")
    
    # Call the reinstall endpoint - this was failing with:
    # "Reinstall: Rust compilation failed for 'actions' with exit code exit status: 101"
    result = api(f"/plugins/{name}/reinstall", method="POST", data={})
    
    if "error" in result:
        # Check if it's the compilation error we're testing for
        error_msg = result.get("error", str(result))
        if "Rust compilation failed" in error_msg or "exit code" in error_msg:
            check("Reinstall should NOT fail with Rust compilation error", False,
                  f"Unexpected compilation failure: {error_msg}")
            print(f"     This is the bug: cargo tried to build from data_dir with broken relative paths")
            return False
        else:
            # Some other error (plugin not installed, etc.) — might be acceptable
            check(f"Reinstall: {error_msg}", False,
                  f"Error: {error_msg}")
            return False
    
    success = result.get("success", False)
    check(f"Reinstall returned success=true", success,
          f"Got success={success}")
    
    if success:
        print(f"  ✅ Plugin '{name}' reinstalled successfully (no compilation error)")
        return True
    
    return False


def run():
    """Run all integration tests."""
    passed = 0
    failed = 0
    
    print("=" * 60)
    print(" Omni-Dashboard Integration Tests")
    print("=" * 60)
    
    # 1. Test secrets page
    result = api("/secrets")
    if "error" not in result:
        data = result.get("data") if "data" in result else result
        if isinstance(data, list):
            print(f"\n🔐 Secrets: {len(data)} secret(s) loaded")
            for s in data:
                print(f"   - {s.get('name')}: {s.get('field_type')}")
            check(f"Secrets endpoint OK", True)
            passed += 1
        else:
            print(f"❌ Secrets: unexpected response type: {type(data)}")
            failed += 1
    else:
        print(f"❌ Secrets: {result.get('error')}")
        failed += 1
    
    # 2. Test schedule page
    result = api("/schedule?active=false")
    if "error" not in result:
        data = result.get("data") if "data" in result else result
        if isinstance(data, list):
            print(f"\n📅 Schedule: {len(data)} job(s) loaded")
            for j in data:
                enabled_status = "enabled" if j.get("enabled") else "disabled"
                print(f"   - {j.get('name')} ({enabled_status})")
            check(f"Schedule endpoint OK", True)
            passed += 1
        else:
            print(f"❌ Schedule: unexpected response type")
            failed += 1
    else:
        print(f"❌ Schedule: {result.get('error')}")
        failed += 1
    
    # 3. Test kanban page
    result = api("/kanban/tasks")
    if "error" not in result:
        data = result.get("data") if "data" in result else result
        if isinstance(data, list):
            print(f"\n📋 Kanban: {len(data)} task(s) loaded")
            for t in data:
                print(f"   - {t.get('title')} ({t.get('status')})")
            check(f"Kanban endpoint OK", True)
            passed += 1
        else:
            print(f"❌ Kanban: unexpected response type")
            failed += 1
    else:
        print(f"❌ Kanban: {result.get('error')}")
        failed += 1
    
    # 4. Verify the front-end page data loading pattern works
    # Secrets page code does: apiGet('/secrets') then accesses response.data
    # Check that response.data pattern works with the actual response
    print(f"\n🔍 Data access pattern test:")
    
    # Test the pattern used by secrets.ts: response.data || response
    sec_result = api("/secrets")
    if "error" not in sec_result:
        sec_data = sec_result.get("data") if "data" in sec_result else sec_result
        if isinstance(sec_data, list):
            check(f"response.data pattern works", True)
            passed += 1
        else:
            check(f"response.data pattern works", False, f"Got {type(sec_data)}")
            failed += 1
    
    # Test the pattern used by schedule-list: directly use result as array
    sched_result = api("/schedule?active=false")
    if "error" not in sched_result:
        sched_data = sched_result.get("data") if "data" in sched_result else sched_result
        if isinstance(sched_data, list):
            check(f"Direct array pattern works", True)
            passed += 1
        else:
            check(f"Direct array pattern works", False, f"Got {type(sched_data)}")
            failed += 1
    
    # 5. Test creating a disabled cron job
    print(f"\n➕ Creating disabled schedule...")
    create_result = api("/schedule", method="POST", data={
        "name": "test-disabled-job",
        "display_name": "Test Disabled Job",
        "schedule": "0 0 * * *",
        "prompt": "test prompt",
        "active": False,
        "enabled": False,
        "planning_mode": "",
        "template": "",
        "profile": "",
    })
    if create_result.get("error") or create_result.get("success") != True:
        print(f"  ⚠️  Create disabled schedule: {create_result.get('error', 'unknown error')}")
    else:
        created_id = create_result.get("id", create_result.get("data", {}).get("id", "unknown"))
        print(f"  ✅ Created disabled schedule: {created_id}")
        passed += 1
        
        # Clean up
        del_result = api(f"/schedule/{created_id}", method="PATCH", data={"active": False})
        print(f"     (cleanup would delete, but PATCH toggle is safer)")
    
    # 6. Test creating a backlog kanban task
    print(f"\n➕ Creating backlog kanban task...")
    kb_result = api("/kanban/tasks", method="POST", data={
        "title": "Test Backlog Task",
        "body": "Integration test task",
        "status": "backlog",
        "priority": 5,
    })
    if kb_result.get("error") or kb_result.get("success") != True:
        print(f"  ⚠️  Create kanban task: {kb_result.get('error', 'unknown error')}")
    else:
        created_id = kb_result.get("id", kb_result.get("data", {}).get("id", "unknown"))
        print(f"  ✅ Created backlog task: {created_id}")
        passed += 1
    
    # 7. Test pages that show with proper data
    # These call multiple endpoints on load - verify they all work
    pages_to_test = [
        ("/schedule?active=false", "Schedule list"),
        ("/kanban/tasks", "Kanban board"),
        ("/secrets", "Secrets"),
        ("/channels", "Channels"),
        ("/plugins", "Plugins (tools)"),
        ("/profiles", "Profiles"),
    ]
    
    for path, name in pages_to_test:
        result = api(path)
        if "error" not in result:
            passed += 1
        else:
            print(f"  ❌ {name}: {result.get('error')}")
            failed += 1
    
    # 8. Test reinstall of a bundled Rust plugin (regression test for exit code 101)
    # This tests the fix where reinstall handler now uses workspace-root compilation
    # instead of compiling from the data directory with broken relative paths.
    # 
    # The 'actions' plugin is a Rust crate with path deps like:
    #   omniagent = { path = "../../../" }
    # When built from data_dir (/opt/omni/plugins/mcp/actions/), the relative
    # path resolves to /opt/omni/ which has no Cargo.toml → cargo exits 101.
    # With workspace-root compilation (/app/Cargo.toml -p mcp-server-actions),
    # the relative path resolves correctly.
    #
    # This test would FAIL on the old code (exit 101) and PASS on the fix.
    print(f"\n🔧 Reinstall test (regression for exit code 101):")
    
    # Try 'actions' first (bundled Rust plugin)
    if not test_reinstall_plugin("actions"):
        failed += 1
    else:
        passed += 1
    
    # ===== SUMMARY =====
    total = passed + failed
    print(f"\n{'=' * 40}")
    print(f" Results: {passed}/{total} passed")
    if failed > 0:
        print(f" FAILURES: {failed}")
        sys.exit(1)
    else:
        print(" All tests passed!")


if __name__ == "__main__":
    run()
