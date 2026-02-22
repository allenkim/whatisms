#!/usr/bin/env python3
"""Suggestions worker — polls for pending suggestions, runs Claude to implement them,
then rebuilds and redeploys the site."""

import fcntl
import json
import logging
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    stream=sys.stdout,
)
log = logging.getLogger("suggestions-worker")

# ── Config ────────────────────────────────────────────────────────────────────

WORKER_TOKEN = os.environ.get("WORKER_TOKEN", "")
API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:8050")
REPO_DIR = os.environ.get("REPO_DIR", os.path.expanduser("~/whatisms"))
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "30"))
CLAUDE_PATH = os.environ.get("CLAUDE_PATH", "claude")
LOCK_FILE = "/tmp/suggestions-worker.lock"

HEADERS = {
    "Authorization": f"Bearer {WORKER_TOKEN}",
    "Content-Type": "application/json",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def api_get(path):
    """GET request to the internal API. Returns parsed JSON or None."""
    req = urllib.request.Request(f"{API_BASE_URL}{path}", headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read().decode()
            if not body or body == "null":
                return None
            return json.loads(body)
    except urllib.error.HTTPError as e:
        log.error("API GET %s failed: %s %s", path, e.code, e.read().decode()[:200])
        return None
    except Exception as e:
        log.error("API GET %s error: %s", path, e)
        return None


def api_put(path, data, retries=3):
    """PUT request with retry + backoff (for calls during rebuild)."""
    body = json.dumps(data).encode()
    for attempt in range(retries):
        req = urllib.request.Request(
            f"{API_BASE_URL}{path}", data=body, headers=HEADERS, method="PUT"
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return json.loads(resp.read().decode())
        except Exception as e:
            if attempt < retries - 1:
                wait = 5 * (attempt + 1)
                log.warning("PUT %s attempt %d failed (%s), retrying in %ds", path, attempt + 1, e, wait)
                time.sleep(wait)
            else:
                log.error("PUT %s failed after %d attempts: %s", path, retries, e)
                return None


def run(cmd, cwd=None, timeout=300):
    """Run a shell command, return (returncode, stdout, stderr)."""
    log.info("Running: %s", " ".join(cmd) if isinstance(cmd, list) else cmd)
    result = subprocess.run(
        cmd, cwd=cwd or REPO_DIR, capture_output=True, text=True, timeout=timeout,
        shell=isinstance(cmd, str),
    )
    return result.returncode, result.stdout, result.stderr


def wait_for_healthy(url, max_wait=120):
    """Poll a URL until it returns 200 or timeout."""
    start = time.time()
    while time.time() - start < max_wait:
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=5):
                log.info("Health check passed")
                return True
        except Exception:
            time.sleep(3)
    log.error("Health check timed out after %ds", max_wait)
    return False


# ── Main processing ──────────────────────────────────────────────────────────

def process_suggestion(suggestion):
    sid = suggestion["id"]
    text = suggestion["suggestion_text"]
    log.info("Processing suggestion #%d: %s", sid, text[:80])

    # Mark as processing
    api_put(f"/api/internal/suggestions/{sid}", {"status": "processing"})

    stashed = False
    try:
        # Ensure clean working tree
        rc, out, _ = run(["git", "status", "--porcelain"])
        if out.strip():
            log.info("Dirty working tree — stashing changes")
            run(["git", "stash", "push", "-m", f"suggestions-worker auto-stash"])
            stashed = True

        # Run Claude
        prompt = (
            f"You are modifying the whatisms website. Implement this user suggestion:\n\n"
            f"{text}\n\n"
            f"Make the minimal changes needed. Do not break existing functionality. "
            f"Only modify files inside the whatisms/ repo."
        )
        rc, stdout, stderr = run(
            [CLAUDE_PATH, "-p", prompt, "--allowedTools", "Edit,Write,Read,Glob,Grep,Bash"],
            timeout=300,
        )
        claude_output = stdout + ("\n--- STDERR ---\n" + stderr if stderr.strip() else "")

        if rc != 0:
            log.error("Claude exited with code %d", rc)
            api_put(f"/api/internal/suggestions/{sid}", {
                "status": "failed",
                "claude_output": f"Claude exited with code {rc}\n\n{claude_output[-3000:]}",
            })
            if stashed:
                run(["git", "stash", "pop"])
            return

        # Check for changes
        rc, diff_out, _ = run(["git", "diff", "--name-only"])
        rc2, diff_cached, _ = run(["git", "diff", "--cached", "--name-only"])
        changed_files = set(filter(None, (diff_out + "\n" + diff_cached).strip().split("\n")))

        if not changed_files:
            log.info("No files changed — marking completed")
            api_put(f"/api/internal/suggestions/{sid}", {
                "status": "completed",
                "claude_output": "No changes were needed.\n\n" + claude_output[-3000:],
            })
            if stashed:
                run(["git", "stash", "pop"])
            return

        # Git commit
        log.info("Changed files: %s", changed_files)
        truncated = text[:60].replace("\n", " ")
        for f in changed_files:
            run(["git", "add", f])
        run(["git", "commit", "-m", f"suggestion #{sid}: {truncated}"])

        # Docker rebuild
        log.info("Rebuilding district2...")
        rc, out, err = run(
            ["docker", "compose", "build", "district2"],
            timeout=600,
        )
        if rc != 0:
            log.error("Docker build failed: %s", err[:500])
            api_put(f"/api/internal/suggestions/{sid}", {
                "status": "failed",
                "claude_output": f"Docker build failed:\n{err[-2000:]}\n\n{claude_output[-1000:]}",
            })
            if stashed:
                run(["git", "stash", "pop"])
            return

        log.info("Restarting district2...")
        run(["docker", "compose", "up", "-d", "district2"], timeout=120)

        # Wait for healthy
        if not wait_for_healthy(f"{API_BASE_URL}/api/status"):
            log.warning("Service didn't become healthy, but continuing")

        if stashed:
            run(["git", "stash", "pop"])

        # Mark completed (with retries since the service may have just restarted)
        api_put(f"/api/internal/suggestions/{sid}", {
            "status": "completed",
            "claude_output": claude_output[-4000:],
        }, retries=5)
        log.info("Suggestion #%d completed", sid)

    except subprocess.TimeoutExpired:
        log.error("Timeout processing suggestion #%d", sid)
        api_put(f"/api/internal/suggestions/{sid}", {
            "status": "failed",
            "claude_output": "Timed out during processing",
        })
        if stashed:
            run(["git", "stash", "pop"])
    except Exception as e:
        log.exception("Error processing suggestion #%d", sid)
        api_put(f"/api/internal/suggestions/{sid}", {
            "status": "failed",
            "claude_output": f"Worker error: {e}",
        })
        if stashed:
            run(["git", "stash", "pop"])


# ── Main loop ────────────────────────────────────────────────────────────────

def main():
    if not WORKER_TOKEN:
        log.error("WORKER_TOKEN not set — exiting")
        sys.exit(1)

    # File lock to prevent concurrent instances
    lock_fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.error("Another worker instance is running — exiting")
        sys.exit(1)

    log.info("Suggestions worker started (polling every %ds)", POLL_INTERVAL)
    log.info("API: %s | Repo: %s", API_BASE_URL, REPO_DIR)

    while True:
        try:
            suggestion = api_get("/api/internal/suggestions/pending")
            if suggestion:
                process_suggestion(suggestion)
            else:
                time.sleep(POLL_INTERVAL)
        except KeyboardInterrupt:
            log.info("Shutting down")
            break
        except Exception:
            log.exception("Unexpected error in poll loop")
            time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()
