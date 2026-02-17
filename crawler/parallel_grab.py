#!/usr/bin/env python3
"""
Parallel book downloader using 2 emulators.

Each emulator runs its own app instance in the foreground, so both
download at full speed simultaneously (no background throttling).

Usage:
    python3 parallel_grab.py              # download all pending
    python3 parallel_grab.py --list       # show book list
    python3 parallel_grab.py --limit 4    # download at most 4 books
    python3 parallel_grab.py --setup      # copy auth from emu1 → emu2
"""
from __future__ import annotations

import argparse
import multiprocessing
import os
import sqlite3
import subprocess
import sys
import time

ADB = os.path.expanduser("~/Library/Android/sdk/platform-tools/adb")
PACKAGE = "com.novelfever.app.android.debug"
DEVICES = ["emulator-5554", "emulator-5556"]
OUTPUT_DIR = "output"


# ── Helpers ──────────────────────────────────────────────────────────────────

def adb_cmd(device: str, *args: str, timeout: int = 30) -> bytes:
    cmd = [ADB, "-s", device] + list(args)
    return subprocess.run(cmd, capture_output=True, timeout=timeout).stdout


def device_online(device: str) -> bool:
    try:
        out = adb_cmd(device, "shell", "getprop", "sys.boot_completed", timeout=5)
        return b"1" in out
    except Exception:
        return False


def pull_db_from(device: str) -> str:
    db_path = f"/tmp/mtc_grab_{device}.db"
    data = subprocess.run(
        [ADB, "-s", device, "shell",
         f"run-as {PACKAGE} cat databases/app_database.db"],
        capture_output=True, timeout=30,
    ).stdout
    with open(db_path, "wb") as f:
        f.write(data)
    return db_path


def get_bookmarked_books(device: str = "emulator-5554") -> list[dict]:
    """Get bookmarked books from device's DB."""
    db_path = pull_db_from(device)
    conn = sqlite3.connect(db_path)
    rows = conn.execute("""
        SELECT id, name, latestIndex
        FROM BaseBook
        WHERE following = 1
        ORDER BY bookmarkId DESC
    """).fetchall()
    conn.close()
    return [{"id": r[0], "name": r[1], "latest_index": r[2] or 0} for r in rows]


def get_extracted_counts() -> dict[int, int]:
    """Return {book_id: txt_file_count} from output/."""
    counts = {}
    if not os.path.isdir(OUTPUT_DIR):
        return counts
    for name in os.listdir(OUTPUT_DIR):
        path = os.path.join(OUTPUT_DIR, name)
        if os.path.isdir(path):
            try:
                bid = int(name)
            except ValueError:
                continue
            counts[bid] = sum(1 for f in os.listdir(path)
                              if f.endswith(".txt") and f[0].isdigit())
    return counts


def print_book_list(books: list[dict], extracted: dict[int, int]):
    print(f"\n{'#':>3}  {'ID':>7}  {'Chaps':>6}  {'Saved':>6}  Status    Name")
    print("-" * 80)
    for i, b in enumerate(books):
        bid = b["id"]
        latest = b["latest_index"]
        saved = extracted.get(bid, 0)
        status = "DONE" if saved >= latest and latest > 0 else "pending"
        print(f"{i:3d}  {bid:7d}  {latest:6d}  {saved:6d}  {status:<8s}  {b['name'][:45]}")
    done = sum(1 for b in books if extracted.get(b["id"], 0) >= b["latest_index"] > 0)
    print(f"\n  {done}/{len(books)} fully extracted")


# ── Setup: copy auth from emu1 → emu2 ───────────────────────────────────────

def setup_second_emulator():
    """Copy auth prefs + clean BaseBook DB from emulator-5554 to emulator-5556."""
    src, dst = DEVICES[0], DEVICES[1]

    print(f"[Setup] Copying auth from {src} → {dst}")

    # Check both online
    for d in [src, dst]:
        if not device_online(d):
            print(f"  ERROR: {d} not online. Start both emulators first.")
            sys.exit(1)

    # Install APK if needed
    pkgs = adb_cmd(dst, "shell", "pm", "list", "packages").decode()
    if PACKAGE not in pkgs:
        apk_path = os.path.join(os.path.dirname(__file__), "..", "apk", "mtc1.4.4", "aligned_emu.apk")
        print(f"  Installing APK on {dst}...")
        subprocess.run([ADB, "-s", dst, "install", apk_path], timeout=120)

    # Launch app once on dst to create data dirs
    adb_cmd(dst, "shell", "am", "start", "-n",
            f"{PACKAGE}/com.example.novelfeverx.MainActivity")
    time.sleep(5)
    # Back out
    for _ in range(5):
        adb_cmd(dst, "shell", "input", "keyevent", "KEYCODE_BACK")
        time.sleep(0.3)

    # Copy SharedPreferences (contains auth token)
    print("  Copying SharedPreferences...")
    prefs = adb_cmd(src, "shell",
                    f"run-as {PACKAGE} cat shared_prefs/FlutterSharedPreferences.xml")
    if prefs and b"<map" in prefs:
        tmp = "/data/local/tmp/_prefs_copy.xml"
        local = "/tmp/mtc_prefs_copy.xml"
        with open(local, "wb") as f:
            f.write(prefs)
        subprocess.run([ADB, "-s", dst, "push", local, tmp],
                       capture_output=True, timeout=10)
        adb_cmd(dst, "shell",
                f"run-as {PACKAGE} cp {tmp} shared_prefs/FlutterSharedPreferences.xml")
        print("  SharedPreferences copied")
    else:
        print("  WARNING: Could not read SharedPreferences from source")

    # Copy BaseBook table (bookmarks) from src DB
    print("  Copying BaseBook data...")
    src_db = pull_db_from(src)
    dst_db = pull_db_from(dst)

    src_conn = sqlite3.connect(src_db)
    dst_conn = sqlite3.connect(dst_db)

    # Get BaseBook schema
    try:
        cur = src_conn.execute("SELECT * FROM BaseBook")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        if rows:
            placeholders = ",".join("?" * len(cols))
            col_names = ",".join(f'"{c}"' for c in cols)
            dst_conn.execute("DELETE FROM BaseBook")
            dst_conn.executemany(
                f"INSERT OR REPLACE INTO BaseBook ({col_names}) VALUES ({placeholders})",
                rows,
            )
            dst_conn.commit()
            print(f"  Copied {len(rows)} books to BaseBook")
    except Exception as e:
        print(f"  WARNING: BaseBook copy failed: {e}")
    finally:
        src_conn.close()
        dst_conn.close()

    # Push dst DB back
    subprocess.run([ADB, "-s", dst, "push", dst_db,
                    "/data/local/tmp/_app_db_copy.db"],
                   capture_output=True, timeout=30)
    adb_cmd(dst, "shell",
            f"run-as {PACKAGE} cp /data/local/tmp/_app_db_copy.db databases/app_database.db")
    print("  DB pushed to destination")

    # Force-stop + relaunch to pick up new prefs
    adb_cmd(dst, "shell", "am", "force-stop", PACKAGE)
    time.sleep(2)
    adb_cmd(dst, "shell", "am", "start", "-n",
            f"{PACKAGE}/com.example.novelfeverx.MainActivity")
    time.sleep(5)

    print("\n[Setup] Done! Second emulator should now have the same auth + bookmarks.")
    print("  Verify by opening the app on emulator-5556 and checking bookmarks.")


# ── Worker: runs in a subprocess ─────────────────────────────────────────────

def worker(device: str, books: list[dict], result_queue: multiprocessing.Queue):
    """Download a list of books on a specific emulator.

    Each worker is a separate process with its own grab_book module state,
    so there are no shared globals to worry about.
    """
    # Import and configure grab_book for this device
    from grab_book import (
        set_device, search_book_api, launch_app,
        ui_search_and_download, clear_download_queue,
        wait_for_download, extract_chapters, pull_db,
    )
    set_device(device)

    succeeded = 0
    failed = 0
    skipped = []

    for i, b in enumerate(books):
        bid = b["id"]
        name = b["name"]
        ch = b["chapter_count"]

        print(f"\n[{device}] [{i+1}/{len(books)}] {name[:50]}")
        print(f"  ID={bid}, Chapters={ch}")

        try:
            clear_download_queue()
            launch_app()
            ok = ui_search_and_download(name, ch)

            if not ok:
                print(f"  [{device}] SKIP: Not found in search")
                skipped.append(name)
                failed += 1
                continue

            # Verify download started (retry — large books take time to begin)
            count = 0
            for attempt in range(4):
                time.sleep(15)
                try:
                    conn = sqlite3.connect(pull_db())
                    count = conn.execute(
                        "SELECT COUNT(*) FROM Chapter WHERE bookId=?", (bid,)
                    ).fetchone()[0]
                    conn.close()
                except Exception:
                    continue
                if count > 0:
                    break
                print(f"  [{device}] DB check #{attempt+1}: {count} chapters, waiting...")
            print(f"  [{device}] DB check: {count} chapters")

            if count == 0:
                print(f"  [{device}] SKIP: Download didn't start after 60s")
                skipped.append(name)
                failed += 1
                continue

            # Wait + extract
            final = wait_for_download(bid, ch)
            saved = extract_chapters(bid, name)
            print(f"  [{device}] Result: {saved}/{ch} chapters")
            succeeded += 1

        except Exception as e:
            print(f"  [{device}] ERROR: {e}")
            skipped.append(name)
            failed += 1

    result_queue.put({
        "device": device,
        "succeeded": succeeded,
        "failed": failed,
        "skipped": skipped,
    })


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Parallel download using 2 emulators")
    parser.add_argument("--list", action="store_true", help="List books and exit")
    parser.add_argument("--limit", type=int, default=0, help="Max books to download")
    parser.add_argument("--setup", action="store_true",
                        help="Copy auth from emulator-5554 → emulator-5556")
    args = parser.parse_args()

    if args.setup:
        setup_second_emulator()
        return

    print("=" * 60)
    print("  Parallel Book Grabber (2 Emulators)")
    print("=" * 60)

    # Check both emulators are online
    for d in DEVICES:
        if not device_online(d):
            print(f"\n  ERROR: {d} not online.")
            print("  Run: ./start_emulators.sh")
            sys.exit(1)
    print(f"\n  Both emulators online: {', '.join(DEVICES)}")

    # Read bookmarks from emulator-5554 (primary)
    print("\n[1] Reading bookmarks from DB...")
    books = get_bookmarked_books(DEVICES[0])
    extracted = get_extracted_counts()
    print(f"  {len(books)} bookmarked books")

    if args.list:
        print_book_list(books, extracted)
        return

    # Filter to pending
    pending = []
    for b in books:
        if extracted.get(b["id"], 0) >= b["latest_index"] and b["latest_index"] > 0:
            continue
        pending.append(b)

    if not pending:
        print("  All books already downloaded!")
        return

    if args.limit > 0:
        pending = pending[:args.limit]

    # Pre-fetch chapter counts from API (single-threaded)
    print(f"\n[2] Fetching chapter counts for {len(pending)} books...")
    from grab_book import search_book_api
    for b in pending:
        api = search_book_api(b["name"])
        if api and api.get("chapter_count"):
            b["chapter_count"] = api["chapter_count"]
        else:
            b["chapter_count"] = b["latest_index"]
        time.sleep(0.3)

    # Split round-robin into 2 queues
    queue1 = [b for i, b in enumerate(pending) if i % 2 == 0]
    queue2 = [b for i, b in enumerate(pending) if i % 2 == 1]

    # Warm up: launch apps on both emulators so they're ready
    print("\n[3] Warming up apps on both emulators...")
    for d in DEVICES:
        adb_cmd(d, "shell", "am", "start", "-n",
                f"{PACKAGE}/com.example.novelfeverx.MainActivity")
    time.sleep(10)
    for d in DEVICES:
        # Verify app is in foreground
        focus = adb_cmd(d, "shell", "dumpsys", "window").decode(errors="ignore")
        if PACKAGE in focus:
            print(f"  {d}: app ready")
        else:
            print(f"  {d}: app may need more time, continuing anyway")

    print(f"\n[4] Downloading {len(pending)} books across 2 emulators")
    print(f"  {DEVICES[0]}: {len(queue1)} books")
    print(f"  {DEVICES[1]}: {len(queue2)} books")

    # Handle edge case: only 1 book → single emulator
    if not queue2:
        print("  (Only 1 book — using single emulator)")
        result_queue = multiprocessing.Queue()
        worker(DEVICES[0], queue1, result_queue)
        result = result_queue.get()
        print(f"\n{'='*60}")
        print(f"  Done! {result['succeeded']} succeeded, {result['failed']} failed")
        print(f"{'='*60}")
        return

    # Spawn 2 worker processes
    result_queue = multiprocessing.Queue()
    p1 = multiprocessing.Process(
        target=worker, args=(DEVICES[0], queue1, result_queue))
    p2 = multiprocessing.Process(
        target=worker, args=(DEVICES[1], queue2, result_queue))

    print("\n  Starting workers...")
    p1.start()
    p2.start()

    p1.join()
    p2.join()

    # Collect results
    results = []
    while not result_queue.empty():
        results.append(result_queue.get_nowait())

    total_ok = sum(r["succeeded"] for r in results)
    total_fail = sum(r["failed"] for r in results)
    all_skipped = []
    for r in results:
        all_skipped.extend(r["skipped"])

    print(f"\n{'='*60}")
    print(f"  Parallel download complete!")
    print(f"  Succeeded: {total_ok}")
    print(f"  Failed:    {total_fail}")
    for r in results:
        print(f"    {r['device']}: {r['succeeded']} ok, {r['failed']} fail")
    if all_skipped:
        print(f"  Skipped books:")
        for n in all_skipped:
            print(f"    - {n[:60]}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
