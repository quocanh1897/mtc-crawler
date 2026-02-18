#!/usr/bin/env python3
"""
Batch download un-downloaded books from the crawler's AUDIT.md.

Processes the "Empty Folder" books using the API decryption method.
"""
from __future__ import annotations

import sys
import time
import traceback

from src.client import APIClient, APIError, ChapterNotFound
from src.decrypt import DecryptionError, decrypt_content
from src.utils import count_existing_chapters, save_chapter, save_metadata

EMPTY_FOLDER_BOOKS = [
    100441,
    101481,
    101486,
    109098,
    115282,
    122376,
    151531,
]


def download_book(client: APIClient, book_id: int) -> dict:
    """Download all chapters for a book. Returns stats dict."""
    stats = {"book_id": book_id, "saved": 0, "skipped": 0, "errors": 0, "name": "?"}

    try:
        book = client.get_book(book_id)
    except APIError as e:
        print(f"  Could not fetch book metadata: {e}")
        stats["errors"] = -1
        return stats

    name = book.get("name", f"Book {book_id}")
    total = book.get("chapter_count", 0)
    first_id = book.get("first_chapter")
    stats["name"] = name

    print(f"  Name: {name}")
    print(f"  Chapters: {total}")
    print(f"  First chapter: {first_id}")

    if not first_id:
        print("  No first_chapter — book may be empty or unavailable")
        return stats

    save_metadata(book_id, book)

    existing = count_existing_chapters(book_id)
    if existing:
        print(f"  Already saved: {len(existing)} chapters (will skip)")

    start_time = time.time()

    for chapter in client.iter_chapters(first_id, max_chapters=total or 9999):
        index = chapter.get("index", 0)
        slug = chapter.get("slug", f"chapter-{index}")
        ch_name = chapter.get("name", f"Chapter {index}")
        encrypted = chapter.get("content", "")

        if index in existing:
            stats["skipped"] += 1
            continue

        if not encrypted:
            print(f"    [{index}/{total}] No content, skipping")
            stats["errors"] += 1
            continue

        try:
            plaintext = decrypt_content(encrypted)
            save_chapter(book_id, index, slug, ch_name, plaintext)
            stats["saved"] += 1
            elapsed = time.time() - start_time
            rate = stats["saved"] / elapsed if elapsed > 0 else 0
            print(f"    [{index}/{total}] {ch_name} — {len(plaintext)} chars ({rate:.1f} ch/s)")
        except DecryptionError as e:
            print(f"    [{index}/{total}] DECRYPT FAILED: {e}")
            stats["errors"] += 1

    elapsed = time.time() - start_time
    print(f"  Done in {elapsed:.0f}s: {stats['saved']} saved, "
          f"{stats['skipped']} skipped, {stats['errors']} errors")
    return stats


def main():
    book_ids = EMPTY_FOLDER_BOOKS
    if len(sys.argv) > 1:
        book_ids = [int(x) for x in sys.argv[1:]]

    print(f"Batch downloading {len(book_ids)} books...\n")
    all_stats = []

    with APIClient(delay=1.0) as client:
        for i, book_id in enumerate(book_ids, 1):
            print(f"[{i}/{len(book_ids)}] Book {book_id}")
            try:
                stats = download_book(client, book_id)
                all_stats.append(stats)
            except Exception as e:
                print(f"  UNEXPECTED ERROR: {e}")
                traceback.print_exc()
                all_stats.append({"book_id": book_id, "saved": 0, "errors": -1, "name": "?"})
            print()

    print("=" * 60)
    print("BATCH SUMMARY")
    print("=" * 60)
    total_saved = 0
    total_errors = 0
    for s in all_stats:
        status = "OK" if s["saved"] > 0 else ("SKIP" if s.get("errors", 0) == 0 else "FAIL")
        print(f"  {s['book_id']:>6} | {s['saved']:>5} saved | {s.get('errors', 0):>3} errors | {status} | {s['name']}")
        total_saved += s["saved"]
        total_errors += max(0, s.get("errors", 0))

    print(f"\nTotal: {total_saved} chapters saved, {total_errors} errors")


if __name__ == "__main__":
    main()
