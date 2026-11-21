#!/usr/bin/env python3
import subprocess
import json
import base64
import os
import sys
import tempfile

CONN_ID = os.environ.get("GITHUB_CONNECTION_ID", "std_01m6zhc7xce8wba5n72mkpmyw0")
REPO = "Bqsqwadtechnologies/bq-squad-tv"

def call_gh(endpoint, method="GET", data=None):
    cmd = ["lovable", "connections", "call", CONN_ID, endpoint, "--json"]
    if method != "GET":
        cmd.extend(["-X", method])
    temp_path = None
    if data is not None:
        with tempfile.NamedTemporaryFile("w", delete=False, suffix=".json") as tf:
            tf.write(json.dumps(data))
            temp_path = tf.name
        cmd.extend(["-d", f"@{temp_path}"])
    try:
        res = subprocess.run(cmd, capture_output=True, text=True)
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass
    if res.returncode != 0:
        raise RuntimeError(f"CLI error (exit {res.returncode}): {res.stderr}\n{res.stdout}")
    try:
        out = json.loads(res.stdout)
    except Exception as e:
        raise RuntimeError(f"Failed to parse JSON: {res.stdout}") from e
    status = out.get("status", 0)
    if status < 200 or status >= 300:
        raise RuntimeError(f"GitHub API error {status}: {json.dumps(out.get('body'))}")
    return out.get("body")

def push_files(files_to_commit, commit_message):
    print(f"--> Pushing {len(files_to_commit)} files with message: {commit_message}")
    
    # 1. Get HEAD commit and base tree
    ref_data = call_gh(f"repos/{REPO}/git/ref/heads/main")
    head_sha = ref_data["object"]["sha"]
    commit_data = call_gh(f"repos/{REPO}/git/commits/{head_sha}")
    base_tree_sha = commit_data["tree"]["sha"]
    print(f"    Current main HEAD: {head_sha} (tree: {base_tree_sha})")
    
    # 2. Upload blobs for changed/added files
    tree_items = []
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    for rel_path in files_to_commit:
        full_path = os.path.join(repo_root, rel_path)
        if not os.path.exists(full_path):
            # Deletion
            tree_items.append({
                "path": rel_path,
                "mode": "100644",
                "type": "blob",
                "sha": None
            })
            print(f"    Deleted: {rel_path}")
        else:
            with open(full_path, "rb") as f:
                content = f.read()
            b64_content = base64.b64encode(content).decode("ascii")
            blob_res = call_gh(f"repos/{REPO}/git/blobs", "POST", {
                "content": b64_content,
                "encoding": "base64"
            })
            tree_items.append({
                "path": rel_path,
                "mode": "100644",
                "type": "blob",
                "sha": blob_res["sha"]
            })
            print(f"    Uploaded blob for: {rel_path} ({blob_res['sha'][:10]})")
            
    # 3. Create tree
    tree_res = call_gh(f"repos/{REPO}/git/trees", "POST", {
        "base_tree": base_tree_sha,
        "tree": tree_items
    })
    new_tree_sha = tree_res["sha"]
    print(f"    Created tree: {new_tree_sha}")
    
    # 4. Create commit
    commit_res = call_gh(f"repos/{REPO}/git/commits", "POST", {
        "message": commit_message,
        "tree": new_tree_sha,
        "parents": [head_sha]
    })
    new_commit_sha = commit_res["sha"]
    print(f"    Created commit: {new_commit_sha}")
    
    # 5. Update ref
    call_gh(f"repos/{REPO}/git/refs/heads/main", "PATCH", {
        "sha": new_commit_sha,
        "force": False
    })
    print(f"    Updated refs/heads/main to: {new_commit_sha}")
    
    # 6. Verify by reading back from main
    verified = call_gh(f"repos/{REPO}/commits/{new_commit_sha}")
    verified_sha = verified["sha"]
    verified_msg = verified["commit"]["message"].split("\n")[0]
    changed_files = [f["filename"] for f in verified.get("files", [])]
    print(f"    VERIFIED on main: {verified_sha} - {verified_msg}")
    print(f"    Files changed ({len(changed_files)}): {changed_files}")
    return verified_sha, verified_msg, changed_files

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: push_to_main.py <commit_message> <file1> [file2 ...]")
        sys.exit(1)
    msg = sys.argv[1]
    files = sys.argv[2:]
    sha, v_msg, c_files = push_files(files, msg)
    print(f"SUCCESS: {sha}")
