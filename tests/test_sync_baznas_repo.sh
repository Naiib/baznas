#!/usr/bin/env bash
# ==============================================================================
# test_sync_baznas_repo.sh - Comprehensive automated regression test suite
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SYNC_SCRIPT="$WORK_DIR/scripts/sync_baznas_repo.sh"
LOG_FILE="$WORK_DIR/output/test_execution_$(date +%Y%m%d_%H%M%S).log"
FIXTURE_BASE="$WORK_DIR/tmp_test_fixtures_$$"

mkdir -p "$WORK_DIR/output"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================"
echo "Starting test suite for sync_baznas_repo.sh"
echo "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "Log file:  $LOG_FILE"
echo "============================================================"

cleanup() {
    local exit_code=$?
    echo ""
    echo "--- Cleaning up temporary test fixtures: $FIXTURE_BASE ---"
    rm -rf "$FIXTURE_BASE"
    echo "Cleanup complete. Final exit code: $exit_code"
    exit $exit_code
}
trap cleanup EXIT INT TERM

mkdir -p "$FIXTURE_BASE"

TESTS_PASSED=0
TESTS_FAILED=0

assert_equals() {
    local expected="$1"
    local actual="$2"
    local message="$3"
    if [[ "$expected" == "$actual" ]]; then
        echo "  [PASS] $message"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "  [FAIL] $message: expected '$expected', got '$actual'" >&2
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

assert_exit_code() {
    local expected="$1"
    local actual="$2"
    local message="$3"
    assert_equals "$expected" "$actual" "$message"
}

setup_pair() {
    local name="$1"
    local dir="$FIXTURE_BASE/$name"
    mkdir -p "$dir"
    local remote_dir="$dir/Naiib/baznas.git"
    local local_dir="$dir/local_repo"

    git init --bare --initial-branch=main "$remote_dir" >/dev/null

    local seed_dir="$dir/seed"
    git init --initial-branch=main "$seed_dir" >/dev/null
    git -C "$seed_dir" config user.email "test@example.com"
    git -C "$seed_dir" config user.name "Test Runner"
    echo "# Initial BAZNAS" > "$seed_dir/README.md"
    echo "original content" > "$seed_dir/content.txt"
    git -C "$seed_dir" add README.md content.txt
    git -C "$seed_dir" commit -m "initial commit" >/dev/null
    git -C "$seed_dir" remote add origin "$remote_dir"
    git -C "$seed_dir" push -u origin main >/dev/null
    rm -rf "$seed_dir"

    git clone "$remote_dir" "$local_dir" >/dev/null
    git -C "$local_dir" config user.email "local@example.com"
    git -C "$local_dir" config user.name "Local Runner"

    echo "$remote_dir|$local_dir"
}

echo ""
echo "=== TEST 1: Remote commits added (local behind) ==="
PAIR_1=$(setup_pair "test1")
REMOTE_1="${PAIR_1%%|*}"
LOCAL_1="${PAIR_1##*|}"

PUSHER_1="$FIXTURE_BASE/test1/pusher"
git clone "$REMOTE_1" "$PUSHER_1" >/dev/null
git -C "$PUSHER_1" config user.email "remote@example.com"
git -C "$PUSHER_1" config user.name "Remote Contributor"
echo "feature update from remote" >> "$PUSHER_1/remote_feature.txt"
git -C "$PUSHER_1" add remote_feature.txt
git -C "$PUSHER_1" commit -m "remote feature commit" >/dev/null
REMOTE_SHA_1=$(git -C "$PUSHER_1" rev-parse HEAD)
git -C "$PUSHER_1" push origin main >/dev/null

LOCAL_HEAD_BEFORE_1=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_1" rev-parse HEAD)
LOCAL_TREE_BEFORE_1=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_1" status --porcelain=v1)

SET_EC=0
"$SYNC_SCRIPT" --allow-any-remote "$LOCAL_1" >/dev/null || SET_EC=$?
assert_exit_code 0 "$SET_EC" "sync script exited with 0"

LOCAL_HEAD_AFTER_1=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_1" rev-parse HEAD)
LOCAL_TREE_AFTER_1=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_1" status --porcelain=v1)
REMOTE_TRACKING_SHA_1=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_1" rev-parse refs/remotes/origin/main)

assert_equals "$LOCAL_HEAD_BEFORE_1" "$LOCAL_HEAD_AFTER_1" "Local HEAD remains unchanged"
assert_equals "$LOCAL_TREE_BEFORE_1" "$LOCAL_TREE_AFTER_1" "Local working tree remains clean and untouched"
assert_equals "$REMOTE_SHA_1" "$REMOTE_TRACKING_SHA_1" "Remote-tracking branch updated to new remote SHA"

JSON_OUT_1=$("$SYNC_SCRIPT" --allow-any-remote --json "$LOCAL_1")
DIVERGENCE_1=$(echo "$JSON_OUT_1" | python3 -c "import sys, json; print(json.load(sys.stdin)['divergence'])")
BEHIND_1=$(echo "$JSON_OUT_1" | python3 -c "import sys, json; print(json.load(sys.stdin)['behind_count'])")
assert_equals "behind" "$DIVERGENCE_1" "Divergence correctly reported as 'behind'"
assert_equals "1" "$BEHIND_1" "Behind count is 1"

echo ""
echo "=== TEST 2: Local working tree dirty & Raw Index Byte Preservation ==="
PAIR_2=$(setup_pair "test2")
LOCAL_2="${PAIR_2##*|}"

echo "staged change" >> "$LOCAL_2/staged.txt"
git -C "$LOCAL_2" add staged.txt
echo "unstaged modification" >> "$LOCAL_2/README.md"
echo "untracked secret or scratchpad" > "$LOCAL_2/scratchpad.env"

DIRTY_STATE_BEFORE=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_2" status --porcelain=v1)
HEAD_BEFORE_2=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_2" rev-parse HEAD)
INDEX_BYTES_BEFORE=$(sha256sum "$LOCAL_2/.git/index" | awk '{print $1}')
FILE_BYTES_BEFORE=$(sha256sum "$LOCAL_2/README.md" | awk '{print $1}')

SET_EC=0
"$SYNC_SCRIPT" --allow-any-remote "$LOCAL_2" >/dev/null || SET_EC=$?
assert_exit_code 0 "$SET_EC" "sync script succeeded on dirty tree"

DIRTY_STATE_AFTER=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_2" status --porcelain=v1)
HEAD_AFTER_2=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_2" rev-parse HEAD)
INDEX_BYTES_AFTER=$(sha256sum "$LOCAL_2/.git/index" | awk '{print $1}')
FILE_BYTES_AFTER=$(sha256sum "$LOCAL_2/README.md" | awk '{print $1}')

assert_equals "$DIRTY_STATE_BEFORE" "$DIRTY_STATE_AFTER" "Dirty working tree status exactly preserved"
assert_equals "$HEAD_BEFORE_2" "$HEAD_AFTER_2" "HEAD preserved on dirty repository"
assert_equals "$INDEX_BYTES_BEFORE" "$INDEX_BYTES_AFTER" "Raw .git/index bytes 100% UNCHANGED (zero index writes)"
assert_equals "$FILE_BYTES_BEFORE" "$FILE_BYTES_AFTER" "Dirty file byte content exactly preserved"

echo ""
echo "=== TEST 3: Divergent / Ahead history ==="
PAIR_3=$(setup_pair "test3")
REMOTE_3="${PAIR_3%%|*}"
LOCAL_3="${PAIR_3##*|}"

echo "local work" >> "$LOCAL_3/local_file.txt"
git -C "$LOCAL_3" add local_file.txt
git -C "$LOCAL_3" commit -m "local commit" >/dev/null

PUSHER_3="$FIXTURE_BASE/test3/pusher"
git clone "$REMOTE_3" "$PUSHER_3" >/dev/null
git -C "$PUSHER_3" config user.email "remote@example.com"
git -C "$PUSHER_3" config user.name "Remote Contributor"
echo "remote divergent" >> "$PUSHER_3/remote_divergent.txt"
git -C "$PUSHER_3" add remote_divergent.txt
git -C "$PUSHER_3" commit -m "remote divergent commit" >/dev/null
git -C "$PUSHER_3" push origin main >/dev/null

SET_EC=0
JSON_OUT_3=$("$SYNC_SCRIPT" --allow-any-remote --json "$LOCAL_3") || SET_EC=$?
assert_exit_code 0 "$SET_EC" "sync script succeeded on divergent history"
DIVERGENCE_3=$(echo "$JSON_OUT_3" | python3 -c "import sys, json; print(json.load(sys.stdin)['divergence'])")
AHEAD_3=$(echo "$JSON_OUT_3" | python3 -c "import sys, json; print(json.load(sys.stdin)['ahead_count'])")
BEHIND_3=$(echo "$JSON_OUT_3" | python3 -c "import sys, json; print(json.load(sys.stdin)['behind_count'])")
assert_equals "diverged" "$DIVERGENCE_3" "Divergence correctly reported as 'diverged'"
assert_equals "1" "$AHEAD_3" "Ahead count is 1"
assert_equals "1" "$BEHIND_3" "Behind count is 1"

echo ""
echo "=== TEST 4: REGRESSION P1 - Neutralize remote.origin.fetch & disable tags ==="
PAIR_4=$(setup_pair "test4")
REMOTE_4="${PAIR_4%%|*}"
LOCAL_4="${PAIR_4##*|}"

git -C "$LOCAL_4" branch protected
PROTECTED_BEFORE=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_4" rev-parse protected)

PUSHER_4="$FIXTURE_BASE/test4/pusher"
git clone "$REMOTE_4" "$PUSHER_4" >/dev/null
git -C "$PUSHER_4" config user.email "remote@example.com"
git -C "$PUSHER_4" config user.name "Remote Contributor"
echo "commit for tag" >> "$PUSHER_4/file.txt"
git -C "$PUSHER_4" add file.txt
git -C "$PUSHER_4" commit -m "commit for tag" >/dev/null
git -C "$PUSHER_4" tag review-tag
git -C "$PUSHER_4" push origin main --tags >/dev/null

git -C "$LOCAL_4" config --add remote.origin.fetch 'refs/heads/main:refs/heads/protected'

SET_EC=0
"$SYNC_SCRIPT" --allow-any-remote "$LOCAL_4" >/dev/null || SET_EC=$?
assert_exit_code 0 "$SET_EC" "sync script succeeded with --refmap override"

PROTECTED_AFTER=$(GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_4" rev-parse protected)
assert_equals "$PROTECTED_BEFORE" "$PROTECTED_AFTER" "Local protected branch was NOT modified"

TAG_EXISTS=0
GIT_OPTIONAL_LOCKS=0 git -C "$LOCAL_4" show-ref --verify --quiet refs/tags/review-tag || TAG_EXISTS=$?
if [[ "$TAG_EXISTS" -ne 0 ]]; then
    echo "  [PASS] Remote tag 'review-tag' was NOT created in local tags"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "  [FAIL] Remote tag was improperly downloaded into local tags" >&2
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "=== TEST 5: REGRESSION P2 - Detection of Dirty File Modification During Fetch ==="
PAIR_5=$(setup_pair "test5")
LOCAL_5="${PAIR_5##*|}"

echo "dirty before transport" > "$LOCAL_5/content.txt"
MUTATION_TARGET="$LOCAL_5/content.txt"

HELPER_5="$FIXTURE_BASE/test5/mutator_helper.sh"
cat > "$HELPER_5" << 'HELPER'
#!/usr/bin/env bash
set -euo pipefail
printf "mutated during transport\n" > "$MUT_FILE"
exec git-upload-pack "$@"
HELPER
chmod +x "$HELPER_5"
git -C "$LOCAL_5" config remote.origin.uploadpack "$HELPER_5"

SET_EC=0
ERR_MSG_MUT=$(MUT_FILE="$MUTATION_TARGET" "$SYNC_SCRIPT" --allow-any-remote "$LOCAL_5" 2>&1) || SET_EC=$?
assert_exit_code 10 "$SET_EC" "Transport mutation of dirty file detected, script failed with exit 10"
if echo "$ERR_MSG_MUT" | grep -q "CRITICAL INTEGRITY FAILURE: Local file content or staged entries changed"; then
    echo "  [PASS] Correct integrity violation error message emitted"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "  [FAIL] Missing or unexpected error message: $ERR_MSG_MUT" >&2
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "=== TEST 6: REGRESSION P2 - Nested Untracked File Mutation Detection ==="
PAIR_6=$(setup_pair "test6")
LOCAL_6="${PAIR_6##*|}"

mkdir -p "$LOCAL_6/scratch"
NESTED_FILE="$LOCAL_6/scratch/nested.txt"
echo "nested dirty before transport" > "$NESTED_FILE"

HELPER_6="$FIXTURE_BASE/test6/mutator_nested.sh"
cat > "$HELPER_6" << 'HELPER'
#!/usr/bin/env bash
set -euo pipefail
printf "nested mutated during transport\n" > "$MUT_FILE"
exec git-upload-pack "$@"
HELPER
chmod +x "$HELPER_6"
git -C "$LOCAL_6" config remote.origin.uploadpack "$HELPER_6"

SET_EC=0
ERR_MSG_NESTED=$(MUT_FILE="$NESTED_FILE" "$SYNC_SCRIPT" --allow-any-remote "$LOCAL_6" 2>&1) || SET_EC=$?
assert_exit_code 10 "$SET_EC" "Mutation of nested untracked file detected with exit 10"
if echo "$ERR_MSG_NESTED" | grep -q "CRITICAL INTEGRITY FAILURE: Local file content or staged entries changed"; then
    echo "  [PASS] Correct integrity violation error for nested untracked emitted"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "  [FAIL] Missing or unexpected error message: $ERR_MSG_NESTED" >&2
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "=== TEST 7: REGRESSION P2 - Staged Rename with Unstaged Modification Mutation Detection ==="
PAIR_7=$(setup_pair "test7")
LOCAL_7="${PAIR_7##*|}"

git -C "$LOCAL_7" mv content.txt renamed-content.txt
RENAMED_FILE="$LOCAL_7/renamed-content.txt"
echo "renamed dirty before transport" > "$RENAMED_FILE"

HELPER_7="$FIXTURE_BASE/test7/mutator_rename.sh"
cat > "$HELPER_7" << 'HELPER'
#!/usr/bin/env bash
set -euo pipefail
printf "renamed mutated during transport\n" > "$MUT_FILE"
exec git-upload-pack "$@"
HELPER
chmod +x "$HELPER_7"
git -C "$LOCAL_7" config remote.origin.uploadpack "$HELPER_7"

SET_EC=0
ERR_MSG_RENAME=$(MUT_FILE="$RENAMED_FILE" "$SYNC_SCRIPT" --allow-any-remote "$LOCAL_7" 2>&1) || SET_EC=$?
assert_exit_code 10 "$SET_EC" "Mutation of destination in staged rename detected with exit 10"
if echo "$ERR_MSG_RENAME" | grep -q "CRITICAL INTEGRITY FAILURE: Local file content or staged entries changed"; then
    echo "  [PASS] Correct integrity violation error for staged rename emitted"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "  [FAIL] Missing or unexpected error message: $ERR_MSG_RENAME" >&2
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "=== TEST 8: REGRESSION P2 - Real Slow Transport Timeout & Child Termination ==="
PAIR_8=$(setup_pair "test8")
LOCAL_8="${PAIR_8##*|}"

SLOW_HELPER="$FIXTURE_BASE/test8/slow_helper.sh"
cat > "$SLOW_HELPER" << 'HELPER'
#!/usr/bin/env bash
sleep 15
exec git-upload-pack "$@"
HELPER
chmod +x "$SLOW_HELPER"
git -C "$LOCAL_8" config remote.origin.uploadpack "$SLOW_HELPER"

START_TIME=$(date +%s)
SET_EC=0
ERR_MSG_SLOW=$("$SYNC_SCRIPT" --allow-any-remote -t 1 "$LOCAL_8" 2>&1) || SET_EC=$?
END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))

assert_exit_code 8 "$SET_EC" "Slow transport timed out and exited with code 8"
if [[ "$ELAPSED" -le 6 ]]; then
    echo "  [PASS] Timeout bounded properly (elapsed: ${ELAPSED}s <= 6s)"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "  [FAIL] Timeout exceeded bound: ${ELAPSED}s" >&2
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "=== TEST 9: REGRESSION P1 & P2 - Hermetic Allowlist & Multi-URL Rejection ==="
PAIR_9=$(setup_pair "test9")
LOCAL_9="${PAIR_9##*|}"

# 1. Hermetic check of official HTTPS URL via --check-only
git -C "$LOCAL_9" remote set-url origin "https://github.com/Naiib/baznas.git"
SET_EC=0
"$SYNC_SCRIPT" --check-only "$LOCAL_9" >/dev/null || SET_EC=$?
assert_exit_code 0 "$SET_EC" "Official HTTPS URL passes hermetic allowlist check (exit 0)"

# 2. Hermetic check of official SSH URL via --check-only
git -C "$LOCAL_9" remote set-url origin "git@github.com:Naiib/baznas.git"
SET_EC=0
"$SYNC_SCRIPT" --check-only "$LOCAL_9" >/dev/null || SET_EC=$?
assert_exit_code 0 "$SET_EC" "Official SSH URL passes hermetic allowlist check (exit 0)"

# 3. Path / non-github host rejected without --allow-any-remote
git -C "$LOCAL_9" remote set-url origin "https://gitlab.com/Naiib/baznas.git"
SET_EC=0
"$SYNC_SCRIPT" "$LOCAL_9" >/dev/null 2>&1 || SET_EC=$?
assert_exit_code 7 "$SET_EC" "Non-GitHub host rejected with exit 7"

# 4. Embedded credentials rejected
git -C "$LOCAL_9" remote set-url origin "https://user:secret@github.com/Naiib/baznas.git"
SET_EC=0
"$SYNC_SCRIPT" "$LOCAL_9" >/dev/null 2>&1 || SET_EC=$?
assert_exit_code 6 "$SET_EC" "Embedded credentials in URL rejected with exit 6"

# 5. Multi-URL remote configuration explicitly rejected
git -C "$LOCAL_9" remote set-url origin "https://github.com/Naiib/baznas.git"
git -C "$LOCAL_9" config --add remote.origin.url "git@github.com:Naiib/baznas.git"
SET_EC=0
ERR_MSG_MULTI=$("$SYNC_SCRIPT" "$LOCAL_9" 2>&1) || SET_EC=$?
assert_exit_code 5 "$SET_EC" "Multi-URL remote rejected with exit 5"
if echo "$ERR_MSG_MULTI" | grep -q "Safety Error: Remote 'origin' has multiple URLs configured"; then
    echo "  [PASS] Multi-URL error message correctly emitted"
    TESTS_PASSED=$((TESTS_PASSED + 1))
else
    echo "  [FAIL] Unexpected error for multi-URL: $ERR_MSG_MULTI" >&2
    TESTS_FAILED=$((TESTS_FAILED + 1))
fi

echo ""
echo "=== TEST 10: REGRESSION P2 - JSON validity with actual backslash and newline ==="
PAIR_10=$(setup_pair "test10")
REMOTE_10="${PAIR_10%%|*}"

SPECIAL_DIR="$FIXTURE_BASE/test10/repo_bs\\and
nl"
git clone "$REMOTE_10" "$SPECIAL_DIR" >/dev/null

JSON_OUTPUT_RAW=$("$SYNC_SCRIPT" --allow-any-remote --json "$SPECIAL_DIR")
SET_EC=0
echo "$JSON_OUTPUT_RAW" | python3 -m json.tool >/dev/null 2>&1 || SET_EC=$?
assert_exit_code 0 "$SET_EC" "JSON with actual literal backslash and newline parses cleanly via python3 json.tool"

PARSED_DIR=$(echo "$JSON_OUTPUT_RAW" | python3 -c "import sys, json; print(json.load(sys.stdin)['target_dir'])")
assert_equals "$SPECIAL_DIR" "$PARSED_DIR" "Target directory with backslash/newline strictly preserved in JSON"

echo ""
echo "=== TEST 11: Timeout bounds, non-numeric, and fail-closed missing dependency ==="
PAIR_11=$(setup_pair "test11")
LOCAL_11="${PAIR_11##*|}"

# Timeout 0 rejected
SET_EC=0
"$SYNC_SCRIPT" --timeout 0 --allow-any-remote "$LOCAL_11" >/dev/null 2>&1 || SET_EC=$?
assert_exit_code 2 "$SET_EC" "--timeout 0 rejected with exit 2"

# Negative timeout rejected
SET_EC=0
"$SYNC_SCRIPT" --timeout -10 --allow-any-remote "$LOCAL_11" >/dev/null 2>&1 || SET_EC=$?
assert_exit_code 2 "$SET_EC" "Negative timeout rejected with exit 2"

# Non-numeric timeout rejected
SET_EC=0
"$SYNC_SCRIPT" --timeout abc --allow-any-remote "$LOCAL_11" >/dev/null 2>&1 || SET_EC=$?
assert_exit_code 2 "$SET_EC" "Non-numeric timeout rejected with exit 2"

# Missing timeout binary fail-closed simulation
NOTIMEOUT_DIR="$FIXTURE_BASE/notimeout_bin"
mkdir -p "$NOTIMEOUT_DIR"
for cmd in bash sh git python3 awk sha256sum sed grep wc tr; do
    CMD_PATH=$(which "$cmd" 2>/dev/null || true)
    if [[ -n "$CMD_PATH" && -x "$CMD_PATH" ]]; then
        ln -sf "$CMD_PATH" "$NOTIMEOUT_DIR/$cmd"
    fi
done

SET_EC=0
ERR_MSG_DEP=$(PATH="$NOTIMEOUT_DIR" "$SYNC_SCRIPT" --allow-any-remote "$LOCAL_11" 2>&1) || SET_EC=$?
assert_exit_code 11 "$SET_EC" "Missing timeout utility fails closed with exit 11"

echo ""
echo "============================================================"
echo "REGRESSION TEST SUITE SUMMARY:"
echo "Total Passed: $TESTS_PASSED"
echo "Total Failed: $TESTS_FAILED"
echo "============================================================"

if [[ $TESTS_FAILED -gt 0 ]]; then
    exit 1
fi

exit 0
