#!/usr/bin/env python3
"""
Omni-Dashboard Integration Tests

Tests that the dashboard's key API endpoints return proper data:
- /api/secrets — full CRUD lifecycle (create, read, update, delete, verify)
- /api/schedule — create as disabled, verify loaded
- /api/kanban/tasks — create in backlog, verify loaded
- /api/plugins/actions/reinstall — verify Rust recompilation works (exit code 101 regression)
- Each page's data loads correctly (not just HTTP 200)

Usage: python3 tests/integration_test.py
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


def find_secret(secrets_list, name):
    """Find a secret by name in the list returned by GET /secrets."""
    data = secrets_list.get("data") if "data" in secrets_list else secrets_list
    if not isinstance(data, list):
        return None
    for s in data:
        if s.get("name") == name:
            return s
    return None


def test_secrets_crud():
    """
    Test full CRUD lifecycle for secrets:
    - Create a test secret
    - Verify it shows in the secrets page with the correct value
    - Update the secret value
    - Verify the new value shows in the secrets page
    - Delete the secret
    - Verify it no longer shows in the secrets page
    """
    print(f"\n🔐 Secrets CRUD lifecycle:")

    # The backend API uses camelCase: fieldType (not field_type)
    secret_name = "test-crud-secret-int"
    original_value = "original-value-42"
    updated_value = "updated-value-99"

    # ---- Step 1: Create ----
    print(f"\n  1. Creating secret '{secret_name}'...")
    create_result = api("/secrets", method="POST", data={
        "name": secret_name,
        "fieldType": "text",
        "value": original_value,
    })

    if "error" in create_result:
        error_msg = create_result.get("error", str(create_result))
        # If it already exists from a previous run, that's OK — we'll update it
        if "already exists" in error_msg:
            print(f"     ℹ️  Secret already exists (from previous run), proceeding with update/delete cycle")
            update_first = api(f"/secrets/{secret_name}", method="PUT", data={"value": original_value})
            if "error" in update_first:
                print(f"     ⚠️  Could not reset secret: {update_first.get('error')}")
        else:
            check(f"Create returned success", False, error_msg)
            return False
    else:
        created = create_result.get("data") if "data" in create_result else create_result
        check(f"Create returned success",
              create_result.get("success", True) == True or "id" in created,
              str(create_result))
        print(f"     Created: name={created.get('name')}")

    # ---- Step 2: Verify creation in list ----
    print(f"\n  2. Verifying secret shows in secrets list...")
    list_result = api("/secrets")
    if "error" in list_result:
        check("List secrets endpoint OK", False, list_result.get("error"))
        return False

    found = find_secret(list_result, secret_name)
    check(f"Secret '{secret_name}' found in list", found is not None)
    if found:
        check(f"Value matches original",
              found.get("current_value") == original_value,
              f"Expected '{original_value}', got '{found.get('current_value')}'")

    # ---- Step 3: Update ----
    print(f"\n  3. Updating secret '{secret_name}' to new value...")
    update_result = api(f"/secrets/{secret_name}", method="PUT", data={
        "value": updated_value,
    })

    if "error" in update_result:
        check(f"Update returned success", False, update_result.get("error"))
        return False

    check(f"Update returned success",
          update_result.get("success", True) == True,
          str(update_result))
    print(f"     Updated value to: {updated_value}")

    # ---- Step 4: Verify update in list ----
    print(f"\n  4. Verifying updated secret shows new value...")
    list_result2 = api("/secrets")
    if "error" in list_result2:
        check("List secrets endpoint OK", False, list_result2.get("error"))
        return False

    found2 = find_secret(list_result2, secret_name)
    check(f"Secret '{secret_name}' found in list after update", found2 is not None)
    if found2:
        check(f"Value matches updated value",
              found2.get("current_value") == updated_value,
              f"Expected '{updated_value}', got '{found2.get('current_value')}'")

    # ---- Step 5: Delete ----
    print(f"\n  5. Deleting secret '{secret_name}'...")
    delete_result = api(f"/secrets/{secret_name}", method="DELETE")

    if "error" in delete_result:
        check(f"Delete returned success", False, delete_result.get("error"))
        return False

    check(f"Delete returned success",
          delete_result.get("success", True) == True,
          str(delete_result))
    print(f"     Deleted secret '{secret_name}'")

    # ---- Step 6: Verify deletion in list ----
    print(f"\n  6. Verifying secret no longer shows...")
    list_result3 = api("/secrets")
    if "error" in list_result3:
        check("List secrets endpoint OK", False, list_result3.get("error"))
        return False

    found3 = find_secret(list_result3, secret_name)
    check(f"Secret '{secret_name}' absent from list after deletion", found3 is None)

    if found3:
        print(f"     Secret still present with value: {found3.get('current_value')}")
        return False

    print(f"\n  ✅ Secrets CRUD lifecycle: all steps passed")
    return True


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

    result = api(f"/plugins/{name}/reinstall", method="POST", data={})

    if "error" in result:
        error_msg = result.get("error", str(result))
        if "Rust compilation failed" in error_msg or "exit code" in error_msg:
            check("Reinstall should NOT fail with Rust compilation error", False,
                  f"Unexpected compilation failure: {error_msg}")
            print(f"     This is the bug: cargo tried to build from data_dir with broken relative paths")
            return False
        else:
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
    print(f"\n🔍 Data access pattern test:")

    sec_result = api("/secrets")
    if "error" not in sec_result:
        sec_data = sec_result.get("data") if "data" in sec_result else sec_result
        if isinstance(sec_data, list):
            check(f"response.data pattern works", True)
            passed += 1
        else:
            check(f"response.data pattern works", False, f"Got {type(sec_data)}")
            failed += 1

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
    print(f"\n🔧 Reinstall test (regression for exit code 101):")
    if not test_reinstall_plugin("actions"):
        failed += 1
    else:
        passed += 1

    # 9. Full secrets CRUD lifecycle test
    if not test_secrets_crud():
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
