#!/usr/bin/env bash
# ==============================================================================
# sync_baznas_repo.sh - Safe, fetch-only synchronization script
# ==============================================================================
# Guarantees:
# - Fetch-only: never runs pull, merge, rebase, reset, checkout, or push.
# - Preserves HEAD, Git index raw bytes, file content, local branches, and tags.
# - Zero index writes: uses read-only inspection with GIT_OPTIONAL_LOCKS=0.
# - Compares raw .git/index hash before and after fetch.
# - Comprehensive content fingerprinting:
#     * Enumerates all untracked files recursively with --untracked-files=all.
#     * Correctly handles renames (dest_path first, orig_path second in -z).
#     * Hashes file bytes on disk for all dirty and untracked files.
#     * Fails closed (exit 10) on any read or inspection failure without leaking
#       file content or secrets.
#     * Post-fetch integrity audit only detects mutations; it does NOT rollback
#       or overwrite user files.
# - Disables automatic tag downloading via --no-tags and fetch.pruneTags=false.
# - Neutralizes remote.<remote>.fetch by passing --refmap='' and explicit refspec.
# - Strictly enforces single-URL remote and host-bound allowlist for GitHub
#   (https://github.com/Naiib/baznas[.git] or git@github.com:Naiib/baznas.git)
#   unless explicitly overridden with --allow-any-remote.
# - Bounded positive timeout (1..3600) with fail-closed missing binary check.
# - Uses timeout --kill-after=5s to guarantee child process termination.
# - 100% compliant JSON encoding via python3 json.dumps.
# - Hermetic validation available via --check-only.
# ==============================================================================

set -euo pipefail

DEFAULT_REMOTE="origin"
DEFAULT_TIMEOUT=30
ALLOW_ANY_REMOTE=0
TARGET_DIR=""
REMOTE_NAME=""
TIMEOUT_SEC="$DEFAULT_TIMEOUT"
JSON_OUTPUT=0
CHECK_ONLY=0

usage() {
    cat << 'USAGE'
Usage: sync_baznas_repo.sh [OPTIONS] <repo-directory>

Options:
  -r, --remote <name>        Remote name to fetch (default: origin)
  -t, --timeout <seconds>    Network timeout in seconds (1..3600, default: 30)
  --allow-any-remote         Allow fetching remotes not matching official Naiib/baznas URL
  --check-only               Validate configuration, allowlist, and local state without fetch
  --json                     Output summary in standard JSON format
  -h, --help                 Display this help message

Description:
  Performs safe remote-tracking synchronization using 'git fetch --prune'.
  It isolates updates strictly to refs/remotes/<remote>/* without modifying
  the working directory, index, HEAD, local branches, or local tags.
USAGE
}

# Parse options
while [[ $# -gt 0 ]]; do
    case "$1" in
        -r|--remote)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --remote requires an argument" >&2
                exit 2
            fi
            REMOTE_NAME="$2"
            shift 2
            ;;
        -t|--timeout)
            if [[ -z "${2:-}" ]]; then
                echo "Error: --timeout requires an argument" >&2
                exit 2
            fi
            TIMEOUT_SEC="$2"
            shift 2
            ;;
        --allow-any-remote)
            ALLOW_ANY_REMOTE=1
            shift
            ;;
        --check-only)
            CHECK_ONLY=1
            shift
            ;;
        --json)
            JSON_OUTPUT=1
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        --)
            shift
            break
            ;;
        -*)
            echo "Error: Unknown option $1" >&2
            usage >&2
            exit 2
            ;;
        *)
            if [[ -z "$TARGET_DIR" ]]; then
                TARGET_DIR="$1"
            else
                echo "Error: Multiple target directories provided" >&2
                exit 2
            fi
            shift
            ;;
    esac
done

if [[ -z "$TARGET_DIR" ]]; then
    echo "Error: Target repository directory is required" >&2
    usage >&2
    exit 2
fi

# 1. Enforce timeout validity (bounded positive integer: 1 to 3600)
if ! [[ "$TIMEOUT_SEC" =~ ^[1-9][0-9]*$ ]] || [[ "$TIMEOUT_SEC" -lt 1 ]] || [[ "$TIMEOUT_SEC" -gt 3600 ]]; then
    echo "Error: --timeout must be a positive integer between 1 and 3600 seconds (got: '$TIMEOUT_SEC')" >&2
    exit 2
fi

# 2. Fail closed if timeout command is not available
if ! command -v timeout >/dev/null 2>&1; then
    echo "Error: 'timeout' utility is required but not found in PATH" >&2
    exit 11
fi

# 3. Validate remote name format (alphanumeric, dots, dashes, underscores)
REMOTE_NAME="${REMOTE_NAME:-$DEFAULT_REMOTE}"
if ! [[ "$REMOTE_NAME" =~ ^[a-zA-Z0-9._-]+$ ]] || [[ "$REMOTE_NAME" =~ ^- ]]; then
    echo "Error: Invalid remote name '$REMOTE_NAME'" >&2
    exit 2
fi

# 4. Validate repository directory
if [[ ! -d "$TARGET_DIR" ]]; then
    echo "Error: Target directory does not exist: $TARGET_DIR" >&2
    exit 3
fi

# Ensure target is a valid Git work tree (read-only without index locks)
if ! GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Error: '$TARGET_DIR' is not inside a valid Git work tree" >&2
    exit 4
fi

# 5. Measure raw .git/index hash BEFORE any other command runs
RAW_INDEX_PATH=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" rev-parse --git-path index 2>/dev/null || echo ".git/index")
if [[ "$RAW_INDEX_PATH" != /* ]]; then
    RAW_INDEX_PATH="$TARGET_DIR/$RAW_INDEX_PATH"
fi

if [[ -f "$RAW_INDEX_PATH" ]]; then
    INITIAL_INDEX_RAW_HASH=$(sha256sum "$RAW_INDEX_PATH" | awk '{print $1}')
else
    INITIAL_INDEX_RAW_HASH="NO_INDEX_FILE"
fi

# 6. Validate remote existence and single-URL configuration
REMOTE_URL_COUNT=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" config --get-all "remote.${REMOTE_NAME}.url" 2>/dev/null | wc -l | tr -d ' ')
if [[ "$REMOTE_URL_COUNT" -eq 0 ]]; then
    echo "Error: Remote '$REMOTE_NAME' does not exist in repository '$TARGET_DIR'" >&2
    exit 5
fi

if [[ "$REMOTE_URL_COUNT" -gt 1 ]]; then
    echo "Safety Error: Remote '$REMOTE_NAME' has multiple URLs configured ($REMOTE_URL_COUNT found). Multi-URL remotes are rejected." >&2
    exit 5
fi

REMOTE_URL=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" remote get-url "$REMOTE_NAME")

# 7. Security: Check for embedded credentials in remote URL
if [[ "$REMOTE_URL" =~ ^https?://[^/@]+@ ]] || [[ "$REMOTE_URL" =~ ^ssh://[^/@]+:[^/@]+@ ]]; then
    echo "Security Error: Remote URL contains embedded credentials. Refusing to proceed." >&2
    exit 6
fi

# 8. Security: Host-bound allowlist for official GitHub repository
if [[ "$ALLOW_ANY_REMOTE" -eq 0 ]]; then
    case "$REMOTE_URL" in
        "https://github.com/Naiib/baznas"|\
        "https://github.com/Naiib/baznas.git"|\
        "git@github.com:Naiib/baznas.git"|\
        "ssh://git@github.com/Naiib/baznas.git"|\
        "ssh://git@github.com/Naiib/baznas")
            ;;
        *)
            echo "Safety Error: Remote URL does not match official GitHub repository 'Naiib/baznas' on host 'github.com'." >&2
            echo "Pass --allow-any-remote if this is an intentional non-default target/fixture." >&2
            exit 7
            ;;
    esac
fi

# If check-only requested, exit 0 here (hermetic validation passed)
if [[ "$CHECK_ONLY" -eq 1 ]]; then
    if [[ "$JSON_OUTPUT" -eq 1 ]]; then
        python3 -c "
import json, sys
data = {
    'status': 'check_passed',
    'target_dir': sys.argv[1],
    'remote_name': sys.argv[2],
    'remote_url': sys.argv[3],
    'check_only': True
}
print(json.dumps(data, indent=2))
" "$TARGET_DIR" "$REMOTE_NAME" "$REMOTE_URL"
    else
        echo "Check passed: repository, remote, allowlist, and timeout bounds are valid."
    fi
    exit 0
fi

# 9. Pre-fetch local state snapshots (100% read-only with GIT_OPTIONAL_LOCKS=0)
INITIAL_HEAD_REV=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" rev-parse HEAD 2>/dev/null || echo "EMPTY_OR_UNBORN")
INITIAL_LOCAL_HEADS_HASH=$( (GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" show-ref --heads 2>/dev/null || true) | sha256sum | awk '{print $1}')
INITIAL_LOCAL_TAGS_HASH=$( (GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" show-ref --tags 2>/dev/null || true) | sha256sum | awk '{print $1}')

# Read-only content fingerprinting of staged blobs and modified/untracked files on disk
# - Recursive untracked file enumeration via --untracked-files=all
# - Correct rename handling (dest_path first, orig_path second in porcelain -z)
# - Safe NUL processing without leaking file contents or secrets
# - Fail-closed (exit 10) on any inspection or read error
compute_local_fingerprint() {
    python3 -c "
import subprocess, os, hashlib, sys

repo_dir = sys.argv[1]
env = os.environ.copy()
env['GIT_OPTIONAL_LOCKS'] = '0'

hasher = hashlib.sha256()

# 1. Staged files / index entries from git ls-files --stage
try:
    stage_res = subprocess.check_output(
        ['git', '-C', repo_dir, 'ls-files', '--stage', '-z'],
        env=env
    )
    for entry in stage_res.split(b'\0'):
        if entry:
            hasher.update(b'STAGE:' + entry + b'\0')
except Exception:
    sys.stderr.write('Audit Error: Failed to inspect git index stage entries.\n')
    sys.exit(10)

# 2. Porcelain status with --untracked-files=all (enumerates nested untracked files individually)
try:
    status_res = subprocess.check_output(
        ['git', '-C', repo_dir, 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
        env=env
    )
except Exception:
    sys.stderr.write('Audit Error: Failed to inspect git status.\n')
    sys.exit(10)

entries = status_res.split(b'\0')
i = 0
while i < len(entries):
    entry = entries[i]
    if not entry:
        i += 1
        continue
    status_code = entry[:2]
    dest_path = entry[3:]
    orig_path = b''
    # In porcelain v1 -z for renames/copies: DEST comes first, ORIG follows in next NUL record
    if b'R' in status_code or b'C' in status_code:
        i += 1
        if i < len(entries):
            orig_path = entries[i]

    hasher.update(b'STATUS:' + status_code + b':DEST:' + dest_path + b':ORIG:' + orig_path + b'\0')

    # Hash file bytes on disk for dest_path
    full_dest = os.path.join(repo_dir.encode(), dest_path)
    if os.path.islink(full_dest):
        try:
            hasher.update(b'SYMLINK:' + os.readlink(full_dest).encode() + b'\0')
        except Exception:
            sys.stderr.write('Audit Error: Failed to read symlink during integrity audit.\n')
            sys.exit(10)
    elif os.path.isfile(full_dest):
        try:
            hasher.update(str(os.path.getsize(full_dest)).encode() + b':')
            with open(full_dest, 'rb') as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    hasher.update(chunk)
        except Exception:
            sys.stderr.write('Audit Error: Failed to read file bytes during integrity audit.\n')
            sys.exit(10)
    elif os.path.isdir(full_dest):
        # Submodule or directory entry
        hasher.update(b'DIR:' + dest_path + b'\0')
    elif not os.path.exists(full_dest):
        hasher.update(b'NONEXISTENT:' + dest_path + b'\0')

    i += 1

print(hasher.hexdigest())
" "$TARGET_DIR"
}

INITIAL_CONTENT_FINGERPRINT=$(compute_local_fingerprint)

# 10. Execute fetch with bounded timeout and strict ref isolation
# - Neutralize configured fetch refspecs with --refmap=''
# - Enforce explicit mapping strictly to refs/remotes/<remote>/*
# - Disable tag auto-following: --no-tags and fetch.pruneTags=false
# - Non-interactive SSH options
SSH_CMD="ssh -o BatchMode=yes -o ConnectTimeout=${TIMEOUT_SEC} -o KbdInteractiveAuthentication=no -o PasswordAuthentication=no"

FETCH_CMD=(
    git -C "$TARGET_DIR"
    -c "core.askPass=true"
    -c "core.sshCommand=${SSH_CMD}"
    -c "fetch.prune=true"
    -c "fetch.pruneTags=false"
    -c "tag.forceSignAnnotated=false"
    fetch
    --refmap=
    --no-tags
    --prune
    "$REMOTE_NAME"
    "+refs/heads/*:refs/remotes/${REMOTE_NAME}/*"
)

FETCH_EXIT_CODE=0
FETCH_OUTPUT=""

FETCH_OUTPUT=$(GIT_TERMINAL_PROMPT=0 timeout --kill-after=5s "${TIMEOUT_SEC}s" "${FETCH_CMD[@]}" 2>&1) || FETCH_EXIT_CODE=$?

if [[ $FETCH_EXIT_CODE -ne 0 ]]; then
    echo "Error: Git fetch failed with exit code $FETCH_EXIT_CODE" >&2
    if [[ -n "$FETCH_OUTPUT" ]]; then
        echo "Fetch log:" >&2
        echo "$FETCH_OUTPUT" | sed -E 's/([?&]token=)[^&]+/\1***/g' >&2
    fi
    exit 8
fi

# 11. Post-fetch exhaustive integrity check (Read-Only)
# NOTE: This check only DETECTS mutations that occurred during fetch;
# it does NOT rollback or overwrite user files. If a violation is detected,
# it fails immediately with an integrity error.

# Check raw .git/index hash
if [[ -f "$RAW_INDEX_PATH" ]]; then
    FINAL_INDEX_RAW_HASH=$(sha256sum "$RAW_INDEX_PATH" | awk '{print $1}')
else
    FINAL_INDEX_RAW_HASH="NO_INDEX_FILE"
fi

if [[ "$INITIAL_INDEX_RAW_HASH" != "$FINAL_INDEX_RAW_HASH" ]]; then
    echo "CRITICAL INTEGRITY FAILURE: Git index file ($RAW_INDEX_PATH) bytes changed during fetch!" >&2
    exit 10
fi

# Check file content and staged blob fingerprint
FINAL_CONTENT_FINGERPRINT=$(compute_local_fingerprint)
if [[ "$INITIAL_CONTENT_FINGERPRINT" != "$FINAL_CONTENT_FINGERPRINT" ]]; then
    echo "CRITICAL INTEGRITY FAILURE: Local file content or staged entries changed during fetch!" >&2
    exit 10
fi

# Check HEAD
FINAL_HEAD_REV=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" rev-parse HEAD 2>/dev/null || echo "EMPTY_OR_UNBORN")
if [[ "$INITIAL_HEAD_REV" != "$FINAL_HEAD_REV" ]]; then
    echo "CRITICAL INTEGRITY FAILURE: HEAD revision changed during fetch!" >&2
    exit 9
fi

# Check local branch heads
FINAL_LOCAL_HEADS_HASH=$( (GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" show-ref --heads 2>/dev/null || true) | sha256sum | awk '{print $1}')
if [[ "$INITIAL_LOCAL_HEADS_HASH" != "$FINAL_LOCAL_HEADS_HASH" ]]; then
    echo "CRITICAL INTEGRITY FAILURE: Local branch references (refs/heads/*) changed during fetch!" >&2
    exit 9
fi

# Check local tags
FINAL_LOCAL_TAGS_HASH=$( (GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" show-ref --tags 2>/dev/null || true) | sha256sum | awk '{print $1}')
if [[ "$INITIAL_LOCAL_TAGS_HASH" != "$FINAL_LOCAL_TAGS_HASH" ]]; then
    echo "CRITICAL INTEGRITY FAILURE: Local tag references (refs/tags/*) changed during fetch!" >&2
    exit 9
fi

# 12. Collect local state and upstream divergence report (read-only)
CURRENT_BRANCH=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" branch --show-current 2>/dev/null || echo "")
if [[ -z "$CURRENT_BRANCH" ]]; then
    CURRENT_BRANCH="DETACHED_OR_UNBORN"
fi

STATUS_RAW=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" status --porcelain=v1 2>/dev/null || true)
if [[ -n "$STATUS_RAW" ]]; then
    DIRTY_COUNT=$(echo "$STATUS_RAW" | wc -l | tr -d ' ')
    UNTRACKED_COUNT=$(echo "$STATUS_RAW" | awk '/^\?\?/ {count++} END {print count+0}')
    MODIFIED_COUNT=$(echo "$STATUS_RAW" | awk '!/^\?\?/ && NF {count++} END {print count+0}')
else
    DIRTY_COUNT=0
    UNTRACKED_COUNT=0
    MODIFIED_COUNT=0
fi

DIVERGENCE="no_upstream"
AHEAD_COUNT=0
BEHIND_COUNT=0

if [[ "$CURRENT_BRANCH" != "DETACHED_OR_UNBORN" ]]; then
    UPSTREAM_TRACKING=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" rev-parse --abbrev-ref "${CURRENT_BRANCH}@{upstream}" 2>/dev/null || echo "")
    if [[ -n "$UPSTREAM_TRACKING" ]]; then
        COUNTS=$(GIT_OPTIONAL_LOCKS=0 git -C "$TARGET_DIR" rev-list --left-right --count "${CURRENT_BRANCH}...${UPSTREAM_TRACKING}" 2>/dev/null || echo "0 0")
        AHEAD_COUNT=$(echo "$COUNTS" | awk '{print $1}')
        BEHIND_COUNT=$(echo "$COUNTS" | awk '{print $2}')
        if [[ "$AHEAD_COUNT" -eq 0 && "$BEHIND_COUNT" -eq 0 ]]; then
            DIVERGENCE="up_to_date"
        elif [[ "$AHEAD_COUNT" -gt 0 && "$BEHIND_COUNT" -eq 0 ]]; then
            DIVERGENCE="ahead"
        elif [[ "$AHEAD_COUNT" -eq 0 && "$BEHIND_COUNT" -gt 0 ]]; then
            DIVERGENCE="behind"
        else
            DIVERGENCE="diverged"
        fi
    fi
fi

# Sanitize remote URL for safe display
SANITIZED_URL=$(echo "$REMOTE_URL" | sed -E 's#(https?://)[^/@]+@#\1#g')

# 13. Render output (Standard Text or Strict JSON via python3)
if [[ "$JSON_OUTPUT" -eq 1 ]]; then
    IS_DIRTY="false"
    if [[ "$DIRTY_COUNT" -gt 0 ]]; then
        IS_DIRTY="true"
    fi
    python3 -c "
import json, sys
data = {
    'status': 'success',
    'target_dir': sys.argv[1],
    'remote_name': sys.argv[2],
    'remote_url': sys.argv[3],
    'current_branch': sys.argv[4],
    'head_rev': sys.argv[5],
    'working_tree_dirty': sys.argv[6] == 'true',
    'dirty_entries_count': int(sys.argv[7]),
    'modified_or_staged_count': int(sys.argv[8]),
    'untracked_count': int(sys.argv[9]),
    'divergence': sys.argv[10],
    'ahead_count': int(sys.argv[11]),
    'behind_count': int(sys.argv[12]),
    'integrity_verified': True
}
print(json.dumps(data, indent=2))
" "$TARGET_DIR" "$REMOTE_NAME" "$SANITIZED_URL" "$CURRENT_BRANCH" "$FINAL_HEAD_REV" "$IS_DIRTY" "$DIRTY_COUNT" "$MODIFIED_COUNT" "$UNTRACKED_COUNT" "$DIVERGENCE" "$AHEAD_COUNT" "$BEHIND_COUNT"
else
    echo "============================================================"
    echo " Git Fetch-Only Synchronization Summary"
    echo "============================================================"
    echo " Target:              $TARGET_DIR"
    echo " Remote:              $REMOTE_NAME ($SANITIZED_URL)"
    echo " Current Branch:      $CURRENT_BRANCH"
    echo " Current HEAD:        $FINAL_HEAD_REV"
    echo " Local Working Tree:  $([[ "$DIRTY_COUNT" -gt 0 ]] && echo "DIRTY ($DIRTY_COUNT uncommitted/untracked items)" || echo "CLEAN")"
    if [[ "$DIVERGENCE" == "no_upstream" ]]; then
        echo " Tracking Upstream:   None (or detached HEAD)"
    else
        echo " Upstream Status:     $DIVERGENCE (ahead: $AHEAD_COUNT, behind: $BEHIND_COUNT)"
    fi
    echo " Working Tree Safety: VERIFIED (working tree, index raw bytes, local heads & tags untouched)"
    echo " Remote-Tracking:     Refs updated in refs/remotes/$REMOTE_NAME/*"
    echo "============================================================"
fi

exit 0
