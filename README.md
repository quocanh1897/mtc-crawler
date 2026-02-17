# MTC Crawler

Download books from [metruyencv.net](https://metruyencv.com) by automating the official Android app on an emulator, then extracting decrypted chapter text from the app's SQLite database.

## Why?

The mobile API encrypts chapter content (AES-CBC, Laravel envelope). The encryption key is embedded in obfuscated Dart code and hasn't been fully reverse-engineered. However, the app **decrypts and stores plaintext** in its local SQLite database. This project triggers in-app downloads via UI automation, then reads the plaintext directly from the DB.

## Architecture

```
                        ┌───────────────┐
                        │  metruyencv   │
                        │  (encrypted)  │
                        └───────┬───────┘
                                │
                          mitmproxy :8083
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                  │
   ┌──────────┴──────────┐   ┌─┴──────────────────┴──┐
   │  Emulator 1 (5554)  │   │  Emulator 2 (5556)     │
   │  MTC Debug APK      │   │  MTC Debug APK         │
   │  ┌───────────────┐  │   │  ┌───────────────┐     │
   │  │ SQLite DB     │  │   │  │ SQLite DB     │     │
   │  │ (plaintext)   │  │   │  │ (plaintext)   │     │
   │  └───────┬───────┘  │   │  └───────┬───────┘     │
   └──────────┼──────────┘   └──────────┼─────────────┘
              │                         │
              └────────┬────────────────┘
                       │
            ┌──────────┴──────────┐
            │  Crawler Scripts    │
            │  API search → UI   │
            │  automation → DB   │
            │  extract → .txt    │
            └──────────┬──────────┘
                       │
              crawler/output/{id}/
              ├── book.json
              ├── 0001_slug.txt
              └── Book Name.txt
```

## Quick Start

```bash
# 1. Start emulators + mitmproxy
cd crawler/
./start_emulators.sh

# 2. Grab a single book by name
python3 grab_book.py "hủ bại thế giới"

# 3. Batch download all bookmarked books
python3 batch_grab.py

# 4. Parallel download using 2 emulators
python3 parallel_grab.py

# 5. Monitor progress in real-time
cd ../progress-checking/
pip install -r requirements.txt
python3 dashboard.py
```

## Scripts

| Script | Purpose |
|--------|---------|
| `crawler/grab_book.py` | Single book: API search → UI automation → DB poll → extract |
| `crawler/batch_grab.py` | Loop through all bookmarked books on one emulator |
| `crawler/parallel_grab.py` | Split work across 2 emulators for ~2x throughput |
| `crawler/extract_book.py` | Standalone extraction after manual in-app download |
| `crawler/config.py` | API configuration (base URL, auth token, headers) |
| `crawler/start_emulators.sh` | Launch emulators + mitmproxy |
| `progress-checking/dashboard.py` | Real-time terminal dashboard |

### grab_book.py

End-to-end flow for a single book:

1. **API search** — find book ID and chapter count via `/api/books`
2. **UI automation** — launch app, navigate to bookmarks tab, search, tap 3-dot menu, trigger "Tai truyen" (download), fill chapter range dialog
3. **DB monitoring** — poll SQLite every 10s until all chapters downloaded
4. **Extraction** — write individual `.txt` files + combined book

```bash
python3 grab_book.py "book name"
python3 grab_book.py "book name" --book-id 12345 --chapters 500
python3 grab_book.py "book name" --skip-search --bookmark-idx 0
python3 grab_book.py "book name" --device emulator-5556
```

### parallel_grab.py

Uses two app instances on separate emulators. UI automation is serialized (one emulator at a time), but downloads run in parallel in the background.

```bash
python3 parallel_grab.py --list       # show pending books
python3 parallel_grab.py              # download all pending in pairs
python3 parallel_grab.py --limit 4    # first 4 books only
python3 parallel_grab.py --setup      # copy auth from emu1 → emu2
```

### dashboard.py

Real-time terminal TUI (powered by [rich](https://github.com/Textualize/rich)) that polls emulator DBs and `crawler/output/`.

```bash
python3 dashboard.py                  # full monitoring, 5s interval
python3 dashboard.py --interval 3     # faster polling
python3 dashboard.py --no-device      # output-only mode (no adb)
python3 dashboard.py --single         # only monitor emulator 1
```

**Interactive controls:**

| Key | Action |
|-----|--------|
| `e` | Cycle view size: 3 → 10 → full |
| `f` | Jump to full view |
| `j` / `n` | Next page |
| `k` / `p` | Previous page |
| `s` | Cycle sort: Recent, Name, Size, Chapters, ID |
| `/` | Search (filter by name or ID) |
| `Esc` | Clear search filter |
| `q` | Quit |

**Dashboard panels:**
- **Device DB Overview** — connection status, bookmarked books count, total chapters
- **Active Downloads** — progress bars, download rate, ETA
- **Bookmarked Books** — per-book status (Bookmarked / Downloading / Downloaded / Extracted)
- **Extraction Status** — books on disk with chapter counts, sizes, completion status

## Prerequisites

| Requirement | Details |
|-------------|---------|
| macOS | Tested on macOS (uses `sips` for screenshot conversion) |
| Android SDK | Emulator + ADB in `~/Library/Android/sdk/` |
| AVD | `Medium_Phone_API_36.1` (arm64-v8a, Google APIs) |
| Patched APK | reflutter-patched, `debuggable=true` (see `apk/` — gitignored) |
| mitmproxy | `mitmdump --listen-port 8083` |
| Python 3.9+ | With `httpx`, `uiautomator2` |

### Install dependencies

```bash
# Crawler
pip install httpx uiautomator2

# Dashboard
cd progress-checking/
pip install -r requirements.txt
```

## Output Format

```
crawler/output/{book_id}/
├── book.json                    # {"book_id", "book_name", "chapters_saved", "total_in_db"}
├── 0001_chuong-1-slug.txt       # Individual chapters (title + content)
├── 0002_chuong-2-slug.txt
├── ...
└── Book Name.txt                # Combined full book with separators
```

## Technical Details

### Database Access

The app's SQLite database is extracted via:
```bash
adb shell "run-as com.novelfever.app.android.debug cat databases/app_database.db"
```

Key tables:
- **BaseBook** — `id`, `name`, `latestIndex`, `following`, `bookmarkId`
- **Chapter** — `id`, `bookId`, `index`, `name`, `content`, `slug`

### UI Automation

- ADB `input tap`/`input keyevent`/`input text` for basic interactions
- `uiautomator2` for Vietnamese text entry (diacritics)
- Pixel scanning (BMP analysis) for detecting 3-dot menu icons and dialog fields
- TAB-based keyboard navigation for Flutter dialog buttons (more reliable than tap coordinates)
- Search uses first 4 words, diacritics stripped (`unicodedata.normalize("NFKD")`)

### API

- Base URL: `https://android.lonoapp.net`
- Auth: Bearer token (only requirement — `x-signature` is not validated)
- Chapter content: encrypted (AES-CBC, Laravel envelope) — not directly usable
- See `API.md` for full endpoint documentation

## Project Structure

```
mtc/
├── README.md
├── .gitignore
├── API.md                        # API endpoint documentation
├── ENCRYPTION.md                 # Encryption analysis
├── KNOWLEDGE.md                  # Project knowledge base
├── PARALLEL_DOWNLOAD.md          # Dual-emulator setup guide
├── crawler/
│   ├── CONTEXT.md                # Crawler architecture notes
│   ├── config.py                 # API config (URL, token, headers)
│   ├── grab_book.py              # Single-book grabber
│   ├── batch_grab.py             # Batch downloader
│   ├── parallel_grab.py          # Parallel orchestrator
│   ├── extract_book.py           # Standalone DB extraction
│   ├── start_emulators.sh        # Launch emulators + proxy
│   └── output/                   # (gitignored) extracted books
├── progress-checking/
│   ├── PLAN.md                   # Dashboard design document
│   ├── dashboard.py              # Real-time TUI dashboard
│   └── requirements.txt          # rich>=13.0
└── apk/                          # (gitignored) patched APKs
```

## License

Private project — not for redistribution.
