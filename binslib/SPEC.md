# Binslib — Specification Document

> A tangthuvien-inspired book catalog, statistics dashboard, and reader.  
> Data sourced from `crawler/output/`.

---

## 1. Overview

**Binslib** is a self-hosted web application that mirrors the UI/UX of [truyen.tangthuvien.vn](https://truyen.tangthuvien.vn/) while serving as a personal library and statistics dashboard for books collected by the `crawler`. It removes converter/monetization-related features and focuses on **statistical browsing**, **genre filtering**, **full-text search**, and a **basic chapter reader**.

### What stays from tangthuvien

| Feature                | Notes                                                                                     |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| Genre navigation bar   | Horizontal genre bar with book counts, same as tangthuvien's top bar                      |
| Homepage rankings      | "Đề cử" → `vote_count`, "Yêu thích" → `bookmark_count`, "Bình luận" → `comment_count` |
| "Bảng xếp hạng" page   | Rankings with filters: metric, genre, status, time period                                 |
| "Bộ lọc" page          | Multi-criteria filter: status, genre, chapter count, sort order, tags                     |
| "Thể loại" genre pages | Per-genre listings with the same ranking tabs                                             |
| Book detail page       | Cover, synopsis, stats, chapter list, comments/reviews                                    |
| Search                 | Autocomplete dropdown + full results page                                                 |
| Responsive layout      | Desktop-first, mobile-friendly                                                            |

### What's removed

| Removed                            | Reason                         |
| ---------------------------------- | ------------------------------ |
| Top Converters leaderboard         | Converter-specific, irrelevant |
| Biên tập viên đề cử (Editor picks) | No editors in Binslib          |
| Top Đại gia (Top spenders)         | Monetization feature           |
| Tin tức (News/forum links)         | No forum                       |
| Converter registration/salary      | Converter-specific             |
| Facebook login                     | Replaced with local auth       |
| Ngôn tình subdomain                | All genres in one site         |

### What's new in Binslib

| Feature                   | Notes                                                                         |
| ------------------------- | ----------------------------------------------------------------------------- |
| Full-text chapter search  | Search within chapter content, not just titles                                |
| Reading progress tracking | Per-user last-read chapter, reading history                                   |
| Bookmarks & favorites     | Personal library management                                                   |
| Basic chapter reader      | Clean text reader with chapter navigation + "Mục lục" links                   |
| Author page               | Dedicated author page (`/tac-gia/[id]`) with book list; clickable everywhere  |
| "Đề cử" ranking           | `vote_count` replaces `view_count` as primary ranking metric                  |
| Quick EPUB download       | Small download button next to stats on homepage (ranking, recently updated)   |
| Data sync from crawler    | Import script reads `crawler/output/` into SQLite                             |
| Meta-puller integration   | Auto-fetch metadata for books missing `metadata.json`                         |
| EPUB download button      | On-demand EPUB generation via epub-converter, with smart re-generation        |
| Cover fallback            | Serves `cover.jpg` from crawler output; auto-pulls via meta-puller if missing |

---

## 2. Tech Stack

| Layer            | Technology                               | Rationale                                                      |
| ---------------- | ---------------------------------------- | -------------------------------------------------------------- |
| Framework        | **Next.js 15** (App Router, React 19)    | SSR for fast initial load, API routes for backend              |
| Language         | **TypeScript**                           | Type safety across frontend and backend                        |
| Database         | **SQLite** via **better-sqlite3**        | Simple, file-based, no external DB server needed               |
| Full-text search | **SQLite FTS5**                          | Built-in, no extra infra, supports CJK/Vietnamese tokenization |
| ORM              | **Drizzle ORM**                          | Lightweight, SQL-first, excellent SQLite support               |
| Styling          | **Tailwind CSS 4**                       | Utility-first, matches tangthuvien's dense layout              |
| Auth             | **NextAuth.js v5** (Auth.js)             | Credentials provider (email/password), session management      |
| Containerization | **Docker + Docker Compose**              | Self-hosted deployment                                         |
| Data import      | **Node.js script** (`scripts/import.ts`) | Reads JSON files from `crawler/output/` into SQLite            |
| Cron scheduler   | **node-cron**                            | Runs import polling loop inside the app process                |
| Progress display | **rich** (Python-style) via **cli-progress** + **chalk** | Terminal progress bars and colored summary reports  |

---

## 3. Data Architecture

### 3.1 Data Flow

```
crawler/output/{book_id}/
  ├── metadata.json      ──┐
  ├── book.json            │   scripts/import.ts
  ├── cover.jpg            ├──────────────────────►  SQLite DB
  └── *.txt (chapters)   ──┘     (reads & imports)
                                       │
                                       ▼
                              binslib/data/binslib.db
                                       │
                              Next.js App (reads DB)
                                       │
                              Browser (renders UI)
```

### 3.2 Import Script Behavior

The import script (`scripts/import.ts`) runs in two modes: **one-shot** (CLI) and **cron** (background polling).

#### Core Import Logic

1. **Scan** `crawler/output/` for numeric book directories
2. For each book directory:
   - Read `metadata.json` — if missing, invoke `meta-puller` for that book ID (shell out to `python3 ../meta-puller/pull_metadata.py --ids {id}`)
   - Read `book.json` for local chapter stats
   - Insert/update book record in `books` table
   - Insert/update author, genres, tags in respective tables
   - Check for `cover.jpg` in `crawler/output/{book_id}/`:
     - If exists → copy to `public/covers/{book_id}.jpg`
     - If missing → meta-puller was already invoked above (it downloads covers too), retry copy
     - If still missing → log warning, book will use placeholder at runtime
   - For each chapter `.txt` file:
     - Parse filename: `{INDEX}_{slug}.txt`
     - Read first line as title, rest as body
     - Insert into `chapters` table
     - Index content in FTS5 table
3. **Incremental mode** (default): Only process books/chapters that are new or updated (based on `updated_at` timestamp or file mtime)
4. **Full mode** (`--full`): Drop and re-import everything

#### Progress Bar & Report

Every import run (whether manual or cron-triggered) displays:

**During import — progress bar:**
```
Importing books ████████████░░░░░░░░░░ 156/238  65%  │ book: Mục Thần Ký
  Chapters      ████████████████████░░ 1640/1868 88%
```

- Outer bar: books processed / total book directories found
- Inner bar (per book): chapters imported / total chapter files
- Current book name shown alongside the bar
- Elapsed time and ETA displayed on the right

**After import — summary report:**
```
┌─────────────────────────────────────────────┐
│          Binslib Import Report               │
├─────────────────────────────────────────────┤
│  Mode:       incremental                    │
│  Started:    2026-02-18 14:30:00            │
│  Finished:   2026-02-18 14:32:15            │
│  Duration:   2m 15s                         │
├─────────────────────────────────────────────┤
│  Books scanned:    238                      │
│  Books imported:   12   (new or updated)    │
│  Books skipped:    226  (unchanged)         │
│  Books failed:     0                        │
├─────────────────────────────────────────────┤
│  Chapters added:   847                      │
│  Covers copied:    12                       │
│  Meta-puller runs: 2                        │
├─────────────────────────────────────────────┤
│  DB size:          1.2 GB                   │
│  Total books:      238                      │
│  Total chapters:   203,595                  │
└─────────────────────────────────────────────┘
```

- Colored output: green for success counts, yellow for skipped, red for failures
- Failed books listed individually with error messages at the bottom
- Report is also written to `data/import-log.txt` (appended, timestamped) for audit

**Implementation:** Uses `cli-progress` for multi-bar terminal progress and `chalk` for colored output.

#### CLI Flags

| Flag | Description |
|------|-------------|
| `--full` | Drop all data and re-import everything |
| `--cron` | Start the background polling loop (see §3.3) |
| `--interval <minutes>` | Polling interval for cron mode (default: 30) |
| `--ids <id ...>` | Import specific book IDs only |
| `--dry-run` | Show what would be imported without writing to DB |
| `--quiet` | Suppress progress bar (log summary only) |

### 3.3 Cron Polling (Background Import)

The import script supports a **cron mode** that continuously polls `crawler/output/` for changes and automatically imports new or updated data.

#### How it works

```
┌─────────────────────────────────────────────┐
│  npm run import:cron                        │
│  ┌───────────────────────────────────────┐  │
│  │  Every N minutes (default: 30):       │  │
│  │  1. Run incremental import            │  │
│  │  2. Display progress bar              │  │
│  │  3. Print summary report              │  │
│  │  4. Log to data/import-log.txt        │  │
│  │  5. Sleep until next cycle            │  │
│  └───────────────────────────────────────┘  │
│                                             │
│  Ctrl+C to stop                             │
└─────────────────────────────────────────────┘
```

**Startup banner:**
```
Binslib Import Daemon
  Polling: ../crawler/output  every 30 minutes
  Database: ./data/binslib.db
  Log: ./data/import-log.txt
  Next run: 2026-02-18 15:00:00
  Press Ctrl+C to stop
```

**Between cycles**, the script sleeps and displays a countdown:
```
Next import in 24m 30s...
```

**Configuration:**

| Env Variable | Default | Description |
|---|---|---|
| `IMPORT_CRON_INTERVAL` | `30` | Minutes between polling cycles |
| `IMPORT_CRON_ENABLED` | `false` | Auto-start cron when app starts (Docker) |

#### Integration with Docker

In Docker, the cron import runs as a **sidecar process** alongside the Next.js server:

```yaml
services:
  binslib:
    # ... (web server, as before)

  binslib-importer:
    build: .
    command: ["npx", "tsx", "scripts/import.ts", "--cron", "--interval", "30"]
    volumes:
      - ../crawler/output:/data/crawler-output
      - ../meta-puller:/data/meta-puller:ro
      - ./data:/app/data
      - ./public/covers:/app/public/covers
    environment:
      - DATABASE_URL=file:/app/data/binslib.db
      - CRAWLER_OUTPUT_DIR=/data/crawler-output
      - META_PULLER_DIR=/data/meta-puller
    restart: unless-stopped
```

This keeps the web server and the import daemon as separate containers sharing the same SQLite DB (safe with WAL mode: one writer at a time, concurrent readers).

#### Local development

```bash
# One-shot import (manual)
npm run import

# Start cron daemon in a separate terminal
npm run import:cron

# Custom interval (every 10 minutes)
npm run import:cron -- --interval 10
```

### 3.3 Database Schema

```sql
-- Books
CREATE TABLE books (
  id            INTEGER PRIMARY KEY,  -- same as tangthuvien/metruyencv book ID
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL,
  synopsis      TEXT,
  status        INTEGER NOT NULL DEFAULT 1,  -- 1=ongoing, 2=completed, 3=paused
  status_name   TEXT,
  view_count    INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  vote_count    INTEGER NOT NULL DEFAULT 0,
  review_score  REAL DEFAULT 0,
  review_count  INTEGER NOT NULL DEFAULT 0,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  word_count    INTEGER NOT NULL DEFAULT 0,
  cover_url     TEXT,                -- relative path: /covers/{id}.jpg
  author_id     INTEGER REFERENCES authors(id),
  created_at    TEXT,
  updated_at    TEXT,
  published_at  TEXT,
  new_chap_at   TEXT,

  -- Local stats (from book.json)
  chapters_saved INTEGER DEFAULT 0,  -- chapters actually on disk

  -- Indexes for statistical queries
  UNIQUE(slug)
);

CREATE INDEX idx_books_view_count ON books(view_count DESC);
CREATE INDEX idx_books_comment_count ON books(comment_count DESC);
CREATE INDEX idx_books_bookmark_count ON books(bookmark_count DESC);
CREATE INDEX idx_books_updated_at ON books(updated_at DESC);
CREATE INDEX idx_books_status ON books(status);

-- Authors
CREATE TABLE authors (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  local_name  TEXT,
  avatar      TEXT
);

-- Genres
CREATE TABLE genres (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL UNIQUE,
  slug  TEXT NOT NULL UNIQUE
);

-- Book-Genre junction
CREATE TABLE book_genres (
  book_id   INTEGER REFERENCES books(id) ON DELETE CASCADE,
  genre_id  INTEGER REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, genre_id)
);

CREATE INDEX idx_book_genres_genre ON book_genres(genre_id);

-- Tags
CREATE TABLE tags (
  id      INTEGER PRIMARY KEY,
  name    TEXT NOT NULL,
  type_id INTEGER
);

-- Book-Tag junction
CREATE TABLE book_tags (
  book_id INTEGER REFERENCES books(id) ON DELETE CASCADE,
  tag_id  INTEGER REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (book_id, tag_id)
);

-- Chapters
CREATE TABLE chapters (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  index_num   INTEGER NOT NULL,   -- chapter index (from filename)
  title       TEXT NOT NULL,
  slug        TEXT,
  body        TEXT,               -- full chapter text
  word_count  INTEGER DEFAULT 0,

  UNIQUE(book_id, index_num)
);

CREATE INDEX idx_chapters_book ON chapters(book_id, index_num);

-- Full-Text Search (FTS5)
CREATE VIRTUAL TABLE chapters_fts USING fts5(
  title,
  body,
  content='chapters',
  content_rowid='id',
  tokenize='unicode61'
);

-- Also index book names for search
CREATE VIRTUAL TABLE books_fts USING fts5(
  name,
  synopsis,
  content='books',
  content_rowid='id',
  tokenize='unicode61'
);

-- Users (auth)
CREATE TABLE users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  email           TEXT NOT NULL UNIQUE,
  username        TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  avatar          TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User bookmarks (favorites / "yêu thích")
CREATE TABLE user_bookmarks (
  user_id   INTEGER REFERENCES users(id) ON DELETE CASCADE,
  book_id   INTEGER REFERENCES books(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id)
);

-- Reading progress
CREATE TABLE reading_progress (
  user_id         INTEGER REFERENCES users(id) ON DELETE CASCADE,
  book_id         INTEGER REFERENCES books(id) ON DELETE CASCADE,
  chapter_index   INTEGER NOT NULL,   -- last read chapter index
  progress_pct    REAL DEFAULT 0,     -- scroll position (0-100)
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, book_id)
);

-- Reading history (log)
CREATE TABLE reading_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  book_id     INTEGER REFERENCES books(id) ON DELETE CASCADE,
  chapter_index INTEGER NOT NULL,
  read_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_reading_history_user ON reading_history(user_id, read_at DESC);
```

---

## 4. Pages & Routes

### 4.1 Route Map

| Route                               | Page            | Description                                       |
| ----------------------------------- | --------------- | ------------------------------------------------- |
| `/`                                 | Homepage        | Rankings dashboard (mirrors tangthuvien homepage) |
| `/the-loai/[slug]`                  | Genre page      | Per-genre listings and stats                      |
| `/bang-xep-hang`                    | Rankings        | Full rankings with filters                        |
| `/tong-hop`                         | Filter/Browse   | Advanced multi-filter browsing                    |
| `/doc-truyen/[slug]`                | Book detail     | Book info, stats, chapter list                    |
| `/doc-truyen/[slug]/chuong-[index]` | Chapter reader  | Basic text reader                                 |
| `/tac-gia/[id]`                     | Author page     | Author info and list of their books               |
| `/tim-kiem?q=`                      | Search results  | Full-text search results                          |
| `/dang-nhap`                        | Login           | Sign in page                                      |
| `/dang-ky`                          | Register        | Sign up page                                      |
| `/tai-khoan`                        | Account         | User profile, bookmarks, reading history          |
| `/tai-khoan/yeu-thich`              | My bookmarks    | User's bookmarked books                           |
| `/tai-khoan/lich-su`                | Reading history | Recent reading activity                           |

### 4.2 API Routes

| Method | Endpoint                           | Description                                                                 |
| ------ | ---------------------------------- | --------------------------------------------------------------------------- |
| `GET`  | `/api/books`                       | List books with pagination, sorting, filtering                              |
| `GET`  | `/api/books/[id]`                  | Single book details                                                         |
| `GET`  | `/api/books/[id]/chapters`         | Chapter list for a book                                                     |
| `GET`  | `/api/books/[id]/chapters/[index]` | Single chapter content                                                      |
| `GET`  | `/api/genres`                      | List all genres with book counts                                            |
| `GET`  | `/api/search?q=&scope=`            | Search (scope: `all`, `books`, `chapters`)                                  |
| `GET`  | `/api/rankings`                    | Rankings with filters (metric, genre, status, period)                       |
| `POST` | `/api/auth/register`               | Register new user                                                           |
| `POST` | `/api/auth/login`                  | Login                                                                       |
| `POST` | `/api/auth/logout`                 | Logout                                                                      |
| `GET`  | `/api/books/[id]/cover`            | Serve book cover (fallback to placeholder, triggers meta-puller if missing) |
| `GET`  | `/api/books/[id]/download-status`  | Check EPUB availability and whether regeneration is needed                  |
| `POST` | `/api/books/[id]/download`         | Generate (or re-generate) EPUB on demand, return download URL               |
| `GET`  | `/api/books/[id]/epub`             | Serve the `.epub` file as a download                                        |
| `GET`  | `/api/user/bookmarks`              | Get user's bookmarks                                                        |
| `POST` | `/api/user/bookmarks/[bookId]`     | Toggle bookmark                                                             |
| `GET`  | `/api/user/progress`               | Get reading progress for all books                                          |
| `PUT`  | `/api/user/progress/[bookId]`      | Update reading progress                                                     |
| `GET`  | `/api/user/history`                | Get reading history                                                         |

#### Query Parameters for `/api/books`

| Param          | Type   | Example                                                                                      | Description                      |
| -------------- | ------ | -------------------------------------------------------------------------------------------- | -------------------------------- |
| `sort`         | string | `view_count`, `comment_count`, `bookmark_count`, `updated_at`, `created_at`, `chapter_count` | Sort field                       |
| `order`        | string | `desc`, `asc`                                                                                | Sort direction (default: `desc`) |
| `genre`        | string | `tien-hiep`                                                                                  | Filter by genre slug             |
| `status`       | int    | `1`, `2`, `3`                                                                                | Filter by status                 |
| `tag`          | string | `123`                                                                                        | Filter by tag ID                 |
| `min_chapters` | int    | `300`                                                                                        | Minimum chapter count            |
| `max_chapters` | int    | `2000`                                                                                       | Maximum chapter count            |
| `page`         | int    | `1`                                                                                          | Page number                      |
| `limit`        | int    | `20`                                                                                         | Items per page (max 50)          |

#### Query Parameters for `/api/rankings`

| Param    | Type   | Options                                                       | Description        |
| -------- | ------ | ------------------------------------------------------------- | ------------------ |
| `metric` | string | `view_count`, `comment_count`, `bookmark_count`, `vote_count` | Ranking metric     |
| `genre`  | string | genre slug or `all`                                           | Genre filter       |
| `status` | int    | `0` (all), `1`, `2`, `3`                                      | Status filter      |
| `period` | string | `all`, `year`, `month`, `week`                                | Time period filter |

---

## 5. UI Design

### 5.1 Layout Structure

The layout follows tangthuvien's structure closely:

```
┌──────────────────────────────────────────────────────┐
│  HEADER: Logo "Binslib" | Nav links | Search bar     │
├──────────────────────────────────────────────────────┤
│  GENRE BAR: Tiên Hiệp (N) | Huyền Huyễn (N) | ...  │
├────────────────────────────────────┬─────────────────┤
│                                    │                 │
│  MAIN CONTENT                      │  SIDEBAR        │
│  (varies by page)                  │  (varies)       │
│                                    │                 │
├────────────────────────────────────┴─────────────────┤
│  FOOTER: About | Stats summary                       │
└──────────────────────────────────────────────────────┘
```

### 5.2 Homepage Layout

Mirrors tangthuvien but without converter/monetization sections:

```
┌──────────────────────────────────────────────────────┐
│  [Header + Genre Bar]                                │
├────────────────────────────────────┬─────────────────┤
│                                    │                 │
│  ┌─ Tabs ────────────────────┐     │  Truyện mới    │
│  │ Đề cử | Yêu thích |      │     │  xem (recent   │
│  │ Bình luận                 │     │  reads)        │
│  ├───────────────────────────┤     │                │
│  │  1. Book A    8 đề cử ⬇  │     │  ──────────    │
│  │  2. Book B    5 đề cử ⬇  │     │                │
│  │  3. Book C    3 đề cử ⬇  │     │  Thống kê      │
│  │  ...                      │     │  (Library      │
│  │  10. Book J    12,124 👁  │     │   stats)       │
│  └───────────────────────────┘     │  • 231 books   │
│                                    │  • 203K chaps  │
│  ┌─ Mới cập nhật ───────────────┐ │  • 12 genres   │
│  │ Genre|Title|Ch|Đề cử|⬇|Time │ │                │
│  │ ...                           │ │                │
│  └───────────────────────────────┘ │                │
│                                    │                 │
│  ┌─ Truyện đã hoàn thành ───┐     │                │
│  │ Grid of completed books   │     │                │
│  └───────────────────────────┘     │                │
│                                    │                 │
├────────────────────────────────────┴─────────────────┤
│  [Footer]                                            │
└──────────────────────────────────────────────────────┘
```

### 5.3 Book Detail Page

```
┌──────────────────────────────────────────────────────┐
│  Breadcrumb: Trang chủ > Genre > Book Title          │
├──────────────────────────────────────────────────────┤
│  ┌─────────┐  Title                                  │
│  │  Cover  │  Author: Name                           │
│  │  Image  │  Thể loại: Genre1, Genre2               │
│  │         │  Trạng thái: Còn tiếp / Hoàn thành      │
│  │         │  ─────────────────────────────           │
│  │         │  🏆 8 đề cử  💬 45  ❤ 2,436  📖 1,868   │
│  │         │                                         │
│  │         │  [⬇ DOWNLOAD]  ← prominent, above all   │
│  └─────────┘  [Đọc truyện] [Yêu thích] [Theo dõi]  │
├──────────────────────────────────────────────────────┤
│  Giới thiệu (Synopsis)                               │
│  Lorem ipsum dolor sit amet...                       │
├──────────────────────────────────────────────────────┤
│  Tabs: [Danh sách chương] [Thông tin]                │
│  ─────────────────────────────────────               │
│  Chapter 1: Title                                    │
│  Chapter 2: Title                                    │
│  ...                                                 │
│  [Pagination]                                        │
└──────────────────────────────────────────────────────┘
```

### 5.4 Chapter Reader

Minimal, distraction-free reading:

```
┌──────────────────────────────────────────────────────┐
│  ← Book Title              Ch X / Total  [☰ Mục lục]│
├──────────────────────────────────────────────────────┤
│                                                      │
│              Chapter Title                           │
│              ─────────────                           │
│                                                      │
│  Chapter body text here. Clean typography with       │
│  comfortable line-height and max-width for           │
│  readability. Vietnamese serif font.                 │
│                                                      │
│  ...                                                 │
│                                                      │
├──────────────────────────────────────────────────────┤
│  [◄ Chương trước]    [☰ Mục lục]    [Chương sau ►]  │
└──────────────────────────────────────────────────────┘
```

### 5.5 Color Scheme & Typography

Following tangthuvien's aesthetic:

| Element          | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| Primary color    | `#2a6496` (blue, links and nav)                         |
| Accent color     | `#c9302c` (red, highlights and badges)                  |
| Background       | `#f5f5f5` (light gray)                                  |
| Card background  | `#ffffff`                                               |
| Text primary     | `#333333`                                               |
| Text secondary   | `#666666`                                               |
| Genre bar BG     | `#2a2a2a` (dark)                                        |
| Font (body)      | `"Noto Serif", "Source Serif Pro", Georgia, serif`      |
| Font (UI)        | `"Noto Sans", "Source Sans Pro", system-ui, sans-serif` |
| Font size (body) | `16px`, line-height `1.8`                               |

### 5.6 Responsive Breakpoints

| Breakpoint   | Layout                                                       |
| ------------ | ------------------------------------------------------------ |
| `≥1200px`    | Full layout: main + sidebar                                  |
| `768–1199px` | Main content full width, sidebar below or hidden             |
| `<768px`     | Mobile: stacked layout, hamburger menu, genre bar scrollable |

---

## 6. Feature Specifications

### 6.1 Statistical Rankings (Core Feature)

This is the **primary feature** — must work exactly like tangthuvien's tabs.

#### Homepage Ranking Tabs

Three tabs, each showing a ranked top-10 list:

| Tab | Label         | Sort Field            | Display           |
| --- | ------------- | --------------------- | ----------------- |
| 1   | **Đề cử**    | `vote_count DESC`     | "8 đề cử"        |
| 2   | **Yêu thích** | `bookmark_count DESC` | "2,436 yêu thích" |
| 3   | **Bình luận** | `comment_count DESC`  | "45 bình luận"    |

Each entry shows: Rank number, book cover thumbnail, title (linked), author (clickable link to author page), stat value, and a quick EPUB download button.

Clicking "Tất cả" at top-right of each tab → navigates to `/bang-xep-hang?metric={metric}`.

#### Full Rankings Page (`/bang-xep-hang`)

Mirrors tangthuvien's "Bảng xếp hạng":

**Filters:**

- **Metric:** Đề cử | Lượt đọc | Bình luận | Yêu thích (radio buttons)
- **Genre:** Tất cả | Tiên Hiệp | Huyền Huyễn | ... (from DB)
- **Status:** Tất cả | Đang ra | Hoàn thành | Tạm dừng
- **Period:** Tất cả | Năm nay | Tháng này | Tuần này

> **Note on Period filter:** Since our data comes from static snapshots (metadata.json), time-based filtering applies to `published_at` / `updated_at` dates, not real-time view deltas. The period filter means "books published/updated within this period, sorted by the metric."

**Results:** Paginated table showing:

- Rank | Cover | Title | Author | Genre | Stat value | Status | Chapters | Last updated

#### Genre Page Rankings (`/the-loai/[slug]`)

Same three-tab ranking widget, but filtered to books in that genre.

### 6.2 Genre Navigation ("Thể loại")

#### Genre Bar (always visible in header)

Horizontal bar listing all genres with their book counts:

```
Tiên Hiệp (48) | Huyền Huyễn (72) | Đô Thị (35) | ...
```

- Counts are dynamically computed from the database
- Clicking a genre → `/the-loai/{genre-slug}`
- Active genre is highlighted
- On mobile: horizontally scrollable

#### Genre Page

- Hero section with genre name and total count
- Same ranking tabs as homepage (filtered by genre)
- "Mới cập nhật" — recently updated books in this genre
- "Truyện đã hoàn thành" — completed books in this genre

### 6.3 Search

#### Autocomplete (Header Search Bar)

- Triggered on typing (debounced 300ms, min 2 chars)
- Searches `books_fts` (title + synopsis)
- Returns top 5 book matches + top 3 author matches
- Dropdown shows: cover thumbnail, title, author, genre
- Pressing Enter or clicking "Xem tất cả" → full search page

#### Full Search Page (`/tim-kiem?q=`)

Three-tab results:

| Tab         | Scope                 | Source         | Display                                      |
| ----------- | --------------------- | -------------- | -------------------------------------------- |
| **Truyện**  | Book title + synopsis | `books_fts`    | Book cards with cover, stats                 |
| **Chương**  | Chapter title + body  | `chapters_fts` | Highlighted snippet, book name, chapter link |
| **Tác giả** | Author name           | `authors` LIKE | Author name + book count                     |

- Results paginated (20 per page)
- Search terms highlighted in results (FTS5 `highlight()` function)
- Sort options: Relevance (default), Lượt đọc, Mới nhất

### 6.4 Advanced Filter (`/tong-hop`)

Multi-criteria book filtering, mirrors tangthuvien's "Bộ lọc":

| Filter         | Options                                        |
| -------------- | ---------------------------------------------- |
| **Trạng thái** | Tất cả, Đang ra, Hoàn thành, Tạm dừng          |
| **Thể loại**   | All genres (clickable pills)                   |
| **Xếp hạng**   | Đề cử, Lượt đọc, Bình luận, Yêu thích, Không xếp hạng |
| **Số chương**  | Tất cả, 2000+, 1000–2000, 300–1000             |
| **Sắp xếp**    | Số chương, Truyện mới, Mới cập nhật            |
| **Tags**       | Tag pills (from DB), expandable                |

Results shown as book cards with: cover, title, synopsis excerpt, stats, "Đọc truyện" and "Chi tiết" buttons.

### 6.5 Book Detail Page (`/doc-truyen/[slug]`)

**Header section:**

- Cover image (see §6.9 Cover Image Handling)
- Title, author (clickable link to author page `/tac-gia/[id]`), genre tags
- Status badge (color-coded: green=ongoing, blue=completed, yellow=paused)
- Stats row: Đề cử (`vote_count`), Bình luận, Yêu thích, Số chương

**Actions (in order, top to bottom):**

1. **"DOWNLOAD"** — prominent button, visually distinct (see §6.10 EPUB Download)
2. "Đọc truyện" → first chapter (or last-read chapter if logged in)
3. "Yêu thích" → toggle bookmark (requires auth)
4. Rating display (stars from `review_score`)

**Tabs:**

- **Danh sách chương** — paginated chapter list (50 per page), sorted by index
- **Thông tin** — full synopsis, word count, dates, tags

### 6.6 Chapter Reader (`/doc-truyen/[slug]/chuong-[index]`)

**Minimal UI:**

- Top bar: back to book, chapter N/total, "Mục lục" link (navigates to book detail/chapter list)
- Chapter body: clean text, comfortable typography
- Bottom nav: "Chương trước" / "Mục lục" / "Chương sau" buttons (Mục lục in the center)
- Keyboard shortcuts: ← previous, → next

**Reading progress:**

- If logged in: auto-save scroll position and current chapter
- "Continue reading" button on book detail page

### 6.7 Authentication

**NextAuth.js v5** with Credentials provider:

| Feature          | Details                                      |
| ---------------- | -------------------------------------------- |
| Register         | Email, username, password (bcrypt hashed)    |
| Login            | Email + password                             |
| Session          | JWT-based (no external session store needed) |
| Protected routes | Bookmarks, reading progress, account pages   |
| Public routes    | All browsing, reading, search                |

**Account page (`/tai-khoan`):**

- Profile info (username, email, avatar)
- Bookmarked books (with reading progress)
- Reading history (chronological log)

### 6.9 Cover Image Handling

Book covers are served from `public/covers/{book_id}.jpg`, copied from `crawler/output/{book_id}/cover.jpg` during import.

**Fallback chain (during import and at runtime):**

1. Check `crawler/output/{book_id}/cover.jpg` — if it exists, copy to `public/covers/{book_id}.jpg`
2. If `cover.jpg` does not exist, run **meta-puller** for that specific book ID:
   ```bash
   python3 ../meta-puller/pull_metadata.py --ids {book_id}
   ```
   Meta-puller downloads the best available poster image as `cover.jpg` into the crawler output directory.
3. After meta-puller completes, retry step 1
4. If still no cover (API has no poster), use a **placeholder image** (`public/covers/placeholder.jpg`) — a generic book cover graphic

**Runtime behavior (API route `GET /api/books/[id]/cover`):**

- Serves the static file from `public/covers/{book_id}.jpg`
- If the file doesn't exist, triggers meta-puller on-demand (background job), responds with the placeholder
- The frontend `<img>` tag uses `onError` fallback to the placeholder for immediate display

**Import script behavior:**

- For each book, checks for `cover.jpg` in crawler output
- If missing, shells out to meta-puller for that book ID before copying
- Logs a warning if cover remains unavailable after meta-puller attempt

### 6.10 EPUB Download

A prominent **"DOWNLOAD"** button appears on the book detail page, positioned above the "Đọc truyện" button for maximum visibility.

**Visual design:**

- Full-width button (within the action column), accent-colored background (`#2a6496` blue)
- Icon: download arrow
- Text: "DOWNLOAD EPUB" (or "ĐANG TẠO..." while generating)
- Distinct from other action buttons — this is the primary CTA

**Behavior (smart generation):**

```
User clicks DOWNLOAD
        │
        ▼
  ┌─ Check: does EPUB already exist? ─┐
  │  (epub-converter/epub-output/      │
  │   {book_id}/*.epub)                │
  ├────────────────────────────────────┤
  │                                    │
  │  EXISTS                     NOT EXISTS
  │    │                            │
  │    ▼                            │
  │  Book status                    │
  │  == "Hoàn thành"?              │
  │    │                            │
  │  YES        NO                  │
  │    │         │                  │
  │    ▼         ▼                  ▼
  │  Serve    Re-generate       Generate
  │  file     (--force --ids)   (--ids {id})
  │    │         │                  │
  │    ▼         ▼                  ▼
  │  Download  Download           Download
  │  starts    after gen          after gen
  └────────────────────────────────────┘
```

**Decision logic in detail:**

| EPUB exists? | Book status                         | Action                                                    |
| ------------ | ----------------------------------- | --------------------------------------------------------- |
| Yes          | `status == 2` (Hoàn thành)          | Serve existing file immediately                           |
| Yes          | `status != 2` (Còn tiếp / Tạm dừng) | Re-generate EPUB (book may have new chapters), then serve |
| No           | Any                                 | Generate EPUB, then serve                                 |

**API endpoint: `POST /api/books/[id]/download`**

1. **Check** for existing `.epub` file in `epub-converter/epub-output/{book_id}/`
2. **If exists AND book is "Hoàn thành"** (`status == 2`):
   - Return `{ status: "ready", url: "/api/books/{id}/epub" }`
3. **Otherwise** (missing OR not completed):
   - Set a generation lock (prevent duplicate runs for the same book)
   - Shell out to epub-converter:
     ```bash
     cd ../epub-converter && python3 convert.py --ids {book_id} --force --no-audit
     ```
   - `--force` ensures re-generation even if epub exists (for ongoing books with new chapters)
   - `--no-audit` skips AUDIT.md update for on-demand single-book generation
   - On success: return `{ status: "ready", url: "/api/books/{id}/epub" }`
   - On failure: return `{ status: "error", message: "..." }`

**API endpoint: `GET /api/books/[id]/epub`**

- Serves the `.epub` file with `Content-Disposition: attachment; filename="{BookName}.epub"`
- Finds the epub by globbing `epub-converter/epub-output/{book_id}/*.epub`
- Returns 404 if no epub exists

**Frontend UX:**

1. Page loads → frontend calls `GET /api/books/{id}/download-status` to check epub availability
2. Button shows one of three states:
   - **"DOWNLOAD EPUB"** (blue, ready) — epub exists and book is completed
   - **"DOWNLOAD EPUB"** (blue, ready) — epub exists but book is ongoing (will re-generate on click)
   - **"DOWNLOAD EPUB"** (blue) — no epub yet (will generate on click)
3. On click → `POST /api/books/{id}/download`
4. Button changes to **"ĐANG TẠO..."** with a spinner while generating
5. On completion → browser triggers file download
6. On error → toast notification with error message

**Additional API endpoint: `GET /api/books/[id]/download-status`**

Returns the current EPUB state for the book:

```json
{
  "epub_exists": true,
  "epub_filename": "Mục Thần Ký.epub",
  "epub_size_bytes": 4521300,
  "book_status": 2,
  "needs_regeneration": false
}
```

Where `needs_regeneration` = `epub_exists && status != 2` (ongoing books that may have new chapters).

### 6.11 Sidebar Components

#### "Truyện mới xem" (Recently Viewed)

- If logged in: from `reading_history` table
- If guest: from `localStorage`
- Shows last 10 books with chapter link

#### Library Stats Widget

Replaces tangthuvien's "Top Converters" sidebar:

```
Thống kê thư viện
─────────────────
📚 231 truyện
📖 203,595 chương
✅ 188 hoàn thành
📝 203M+ từ
```

---

## 7. Project Structure

```
binslib/
├── SPEC.md                    # This file
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── drizzle.config.ts
├── .env.example
│
├── scripts/
│   ├── import.ts              # Data import (one-shot + cron polling mode)
│   ├── migrate.ts             # DB migration runner
│   └── seed.ts                # Optional: seed test data
│
├── src/
│   ├── app/                   # Next.js App Router pages
│   │   ├── layout.tsx         # Root layout (header, genre bar, footer)
│   │   ├── page.tsx           # Homepage
│   │   ├── the-loai/
│   │   │   └── [slug]/
│   │   │       └── page.tsx   # Genre page
│   │   ├── bang-xep-hang/
│   │   │   └── page.tsx       # Rankings page
│   │   ├── tong-hop/
│   │   │   └── page.tsx       # Filter/browse page
│   │   ├── doc-truyen/
│   │   │   └── [slug]/
│   │   │       ├── page.tsx   # Book detail
│   │   │       └── [chapter]/
│   │   │           └── page.tsx  # Chapter reader (chuong-N)
│   │   ├── tac-gia/
│   │   │   └── [id]/
│   │   │       └── page.tsx   # Author page (book list by author)
│   │   ├── tim-kiem/
│   │   │   └── page.tsx       # Search results
│   │   ├── dang-nhap/
│   │   │   └── page.tsx       # Login
│   │   ├── dang-ky/
│   │   │   └── page.tsx       # Register
│   │   └── tai-khoan/
│   │       ├── page.tsx       # Account dashboard
│   │       ├── yeu-thich/
│   │       │   └── page.tsx   # My bookmarks
│   │       └── lich-su/
│   │           └── page.tsx   # Reading history
│   │
│   ├── api/                   # API route handlers (Next.js Route Handlers)
│   │   ├── books/
│   │   ├── genres/
│   │   ├── search/
│   │   ├── rankings/
│   │   ├── auth/
│   │   └── user/
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── GenreBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Footer.tsx
│   │   ├── books/
│   │   │   ├── BookCard.tsx
│   │   │   ├── BookGrid.tsx
│   │   │   ├── BookList.tsx
│   │   │   ├── BookStats.tsx
│   │   │   ├── BookCover.tsx         # Cover image with placeholder fallback
│   │   │   ├── DownloadButton.tsx    # EPUB download with generation logic (book detail)
│   │   │   ├── QuickDownloadButton.tsx # Compact EPUB download icon button (homepage)
│   │   │   └── ChapterList.tsx
│   │   ├── rankings/
│   │   │   ├── RankingTabs.tsx
│   │   │   ├── RankingTable.tsx
│   │   │   ├── RankingFilters.tsx
│   │   │   └── AuthorLink.tsx    # Client-side author link with stopPropagation
│   │   ├── search/
│   │   │   ├── SearchBar.tsx
│   │   │   ├── SearchResults.tsx
│   │   │   └── Autocomplete.tsx
│   │   ├── reader/
│   │   │   ├── ChapterReader.tsx
│   │   │   └── ReaderNav.tsx
│   │   ├── filters/
│   │   │   ├── FilterPanel.tsx
│   │   │   ├── GenreFilter.tsx
│   │   │   └── StatusFilter.tsx
│   │   └── ui/
│   │       ├── Pagination.tsx
│   │       ├── Badge.tsx
│   │       ├── Tabs.tsx
│   │       └── StarRating.tsx
│   │
│   ├── db/
│   │   ├── index.ts           # DB connection (better-sqlite3 + drizzle)
│   │   ├── schema.ts          # Drizzle schema definitions
│   │   └── migrations/        # SQL migration files
│   │
│   ├── lib/
│   │   ├── auth.ts            # NextAuth config
│   │   ├── queries.ts         # Reusable DB query functions
│   │   └── utils.ts           # Helpers (formatting, etc.)
│   │
│   └── types/
│       └── index.ts           # Shared TypeScript types
│
├── public/
│   ├── covers/                # Book cover images (copied by import script)
│   └── fonts/                 # Vietnamese fonts if self-hosted
│
└── data/
    └── binslib.db             # SQLite database file (gitignored)
```

---

## 8. Docker Configuration

### docker-compose.yml

```yaml
services:
  binslib:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ../crawler/output:/data/crawler-output        # Book data (rw: meta-puller writes cover.jpg)
      - ../meta-puller:/data/meta-puller:ro            # Meta-puller scripts (read-only)
      - ../epub-converter:/data/epub-converter         # EPUB converter (rw: generates .epub files)
      - ./data:/app/data                               # SQLite DB persistence
      - ./public/covers:/app/public/covers             # Cover images
    environment:
      - DATABASE_URL=file:/app/data/binslib.db
      - CRAWLER_OUTPUT_DIR=/data/crawler-output
      - META_PULLER_DIR=/data/meta-puller
      - EPUB_CONVERTER_DIR=/data/epub-converter
      - EPUB_OUTPUT_DIR=/data/epub-converter/epub-output
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=http://localhost:3000

  binslib-importer:
    build: .
    command: ["npx", "tsx", "scripts/import.ts", "--cron", "--interval", "30"]
    volumes:
      - ../crawler/output:/data/crawler-output
      - ../meta-puller:/data/meta-puller:ro
      - ./data:/app/data                               # Shared SQLite DB with web server
      - ./public/covers:/app/public/covers             # Shared cover images
    environment:
      - DATABASE_URL=file:/app/data/binslib.db
      - CRAWLER_OUTPUT_DIR=/data/crawler-output
      - META_PULLER_DIR=/data/meta-puller
    restart: unless-stopped
```

### Dockerfile

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Python 3 + pip for epub-converter and meta-puller (runtime dependencies)
# better-sqlite3 native build tools
RUN apk add --no-cache python3 py3-pip make g++ \
    && pip3 install --break-system-packages ebooklib rich Pillow httpx

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
```

---

## 9. Data Import Workflow

### First-time setup

```bash
cd binslib

# 1. Install dependencies
npm install

# 2. Run database migrations
npm run db:migrate

# 3. Full import of all books from crawler output (with progress bar)
npm run import:full
# Scans ../crawler/output/*, shows progress bar per book/chapter,
# prints summary report, writes log to data/import-log.txt.

# 4. Start the dev server
npm run dev

# 5. (Optional) Start the import daemon in a second terminal
npm run import:cron
```

### npm scripts

| Script | Command | Description |
|--------|---------|-------------|
| `import` | `tsx scripts/import.ts` | One-shot incremental import |
| `import:full` | `tsx scripts/import.ts --full` | One-shot full re-import |
| `import:cron` | `tsx scripts/import.ts --cron` | Start background polling daemon (every 30min) |

### Ongoing usage — Cron Daemon

For continuous operation, run the import daemon alongside the dev server:

```bash
# Terminal 1: web server
npm run dev

# Terminal 2: import daemon (polls every 30 min)
npm run import:cron

# Or with a custom interval (every 10 minutes)
npm run import:cron -- --interval 10
```

The daemon will:
1. Run an incremental import immediately on startup
2. Show a progress bar and summary report for each run
3. Sleep until the next cycle (displaying a countdown timer)
4. Repeat indefinitely until stopped with Ctrl+C
5. Append each run's report to `data/import-log.txt`

### Docker workflow

```bash
# Build and start (web server + import daemon)
docker compose up -d
# The binslib-importer service starts automatically and polls every 30 min.

# View import daemon logs
docker compose logs -f binslib-importer

# Manual one-shot import inside container
docker compose exec binslib-importer npx tsx scripts/import.ts

# Full re-import
docker compose exec binslib-importer npx tsx scripts/import.ts --full
```

---

## 10. Performance Considerations

| Concern                          | Solution                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Large chapter table (~200K rows) | SQLite handles this well; FTS5 index for search                              |
| Full-text search speed           | FTS5 with `unicode61` tokenizer; consider `rank` for relevance               |
| Cover images                     | Static files served by Next.js; CDN-able                                     |
| SSR for SEO                      | Server Components for book pages; static generation for genre pages          |
| DB concurrency                   | SQLite WAL mode for concurrent reads; single-writer is fine for personal use |
| Import speed                     | Batch inserts (1000 per transaction); skip unchanged files                   |

---

## 11. Open Questions & Future Enhancements

| Item                        | Notes                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Dark mode**               | Toggle between light/dark themes.                                                                                 |
| **Mobile app**              | PWA support for offline reading?                                                                                  |
| **Comments**                | User comments on books/chapters (beyond the imported `comment_count`)?                                            |
| **Vietnamese tokenization** | FTS5's `unicode61` tokenizer works for Vietnamese but a custom tokenizer could improve search for compound words. |

---

## Appendix A: Tangthuvien → Binslib Mapping

| Tangthuvien Feature | Binslib Equivalent | Status |
| ------------------- | ------------------ | ------ |

| Genre bar with counts | Same, dynamic from DB | Core |
| "Xem nhiều" ranking | Replaced by "Đề cử" tab (`vote_count`) | Core |
| "Yêu thích" ranking | "Yêu thích" tab (`bookmark_count`) | Core |
| "Đề cử" ranking | "Đề cử" tab (`vote_count`) — primary ranking metric | Core |
| "Theo dõi nhiều" ranking | Removed (no follow system from tangthuvien) | N/A |
| "Bình luận" | "Bình luận" tab (`comment_count`) | Core |
| Bảng xếp hạng | `/bang-xep-hang` with same filters | Core |
| Bộ lọc (Tổng hợp) | `/tong-hop` with same filters | Core |
| Book detail | `/doc-truyen/[slug]` | Core |
| Chapter list | Paginated in book detail | Core |
| Chapter reader | `/doc-truyen/[slug]/chuong-[index]` | Core |
| Search autocomplete | Header search bar + dropdown | Core |
| Full search page | `/tim-kiem` with tabs | Core |
| Top Converters | **Removed** → Library Stats widget | N/A |
| Biên tập viên đề cử | **Removed** | N/A |
| Top Đại gia | **Removed** | N/A |
| Tin tức | **Removed** | N/A |
| User auth | NextAuth.js (credentials) | Core |
| Reading progress | Per-user tracking in SQLite | Core |
| Bookmarks | User bookmarks in SQLite | Core |
| N/A (new) | EPUB Download button with smart generation (§6.10) | Core |
| N/A (new) | Quick EPUB download buttons on homepage (ranking, recently updated, completed) | Core |
| N/A (new) | Author page (`/tac-gia/[id]`) with book list — clickable author names everywhere | Core |
| N/A (new) | "Mục lục" links in chapter reader (top nav + bottom nav) | Core |
| N/A (new) | Cover fallback chain with meta-puller integration (§6.9) | Core |

---

_Spec version: 1.3 — February 18, 2026_
