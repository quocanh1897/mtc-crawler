import { db, sqlite } from "@/db";
import {
  books,
  authors,
  genres,
  bookGenres,
  tags,
  bookTags,
  chapters,
} from "@/db/schema";
import { eq, desc, asc, sql, and } from "drizzle-orm";
import type {
  BookWithAuthor,
  BookWithDetails,
  GenreWithCount,
  RankingMetric,
  LibraryStats,
  PaginatedResponse,
} from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rowToBookWithAuthor(r: Record<string, unknown>): BookWithAuthor {
  return {
    id: r.id as number,
    name: r.name as string,
    slug: r.slug as string,
    synopsis: r.synopsis as string | null,
    status: r.status as number,
    statusName: r.status_name as string | null,
    viewCount: r.view_count as number,
    commentCount: r.comment_count as number,
    bookmarkCount: r.bookmark_count as number,
    voteCount: r.vote_count as number,
    reviewScore: r.review_score as number | null,
    reviewCount: r.review_count as number,
    chapterCount: r.chapter_count as number,
    wordCount: r.word_count as number,
    coverUrl: r.cover_url as string | null,
    authorId: r.author_id as number | null,
    createdAt: r.created_at as string | null,
    updatedAt: r.updated_at as string | null,
    publishedAt: r.published_at as string | null,
    newChapAt: r.new_chap_at as string | null,
    chaptersSaved: r.chapters_saved as number | null,
    author: r.author_name
      ? {
          id: r.author_id as number,
          name: r.author_name as string,
          localName: r.author_local_name as string | null,
          avatar: r.author_avatar as string | null,
        }
      : null,
  };
}

// ─── Books ───────────────────────────────────────────────────────────────────

const VALID_SORT = new Set([
  "view_count", "comment_count", "bookmark_count", "vote_count",
  "chapter_count", "updated_at", "created_at", "word_count",
]);

export async function getBooks(params: {
  sort?: string;
  order?: "asc" | "desc";
  genre?: string;
  status?: number;
  minChapters?: number;
  maxChapters?: number;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<BookWithAuthor>> {
  const {
    sort = "updated_at",
    order = "desc",
    genre,
    status,
    minChapters,
    maxChapters,
    page = 1,
    limit = 20,
  } = params;

  const safeLimit = Math.min(Math.max(1, limit), 50);
  const offset = (Math.max(1, page) - 1) * safeLimit;
  const safeSort = VALID_SORT.has(sort) ? sort : "updated_at";
  const safeOrder = order === "asc" ? "ASC" : "DESC";

  const conditions: string[] = [];
  const condParams: unknown[] = [];

  if (genre) {
    conditions.push("genres.slug = ?");
    condParams.push(genre);
  }
  if (status) {
    conditions.push("books.status = ?");
    condParams.push(status);
  }
  if (minChapters) {
    conditions.push("books.chapter_count >= ?");
    condParams.push(minChapters);
  }
  if (maxChapters) {
    conditions.push("books.chapter_count <= ?");
    condParams.push(maxChapters);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = genre
    ? `INNER JOIN book_genres ON books.id = book_genres.book_id
       INNER JOIN genres ON book_genres.genre_id = genres.id`
    : "";

  const dataSql = `
    SELECT books.*,
           authors.name as author_name,
           authors.local_name as author_local_name,
           authors.avatar as author_avatar
    FROM books
    LEFT JOIN authors ON books.author_id = authors.id
    ${joinClause}
    ${whereClause}
    ORDER BY books.${safeSort} ${safeOrder}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as cnt
    FROM books
    ${joinClause}
    ${whereClause}
  `;

  const rows = sqlite.prepare(dataSql).all(...condParams, safeLimit, offset) as Record<string, unknown>[];
  const countRow = sqlite.prepare(countSql).get(...condParams) as { cnt: number };
  const total = countRow?.cnt ?? 0;

  return {
    data: rows.map(rowToBookWithAuthor),
    total,
    page,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit),
  };
}

export async function getBookBySlug(slug: string): Promise<BookWithDetails | null> {
  const row = await db
    .select()
    .from(books)
    .where(eq(books.slug, slug))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) return null;
  return enrichBook(row);
}

export async function getBookById(id: number): Promise<BookWithDetails | null> {
  const row = await db
    .select()
    .from(books)
    .where(eq(books.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!row) return null;
  return enrichBook(row);
}

async function enrichBook(row: typeof books.$inferSelect): Promise<BookWithDetails> {
  const author = row.authorId
    ? await db.select().from(authors).where(eq(authors.id, row.authorId)).then((r) => r[0] ?? null)
    : null;

  const bookGenreRows = await db
    .select({ id: genres.id, name: genres.name, slug: genres.slug })
    .from(bookGenres)
    .innerJoin(genres, eq(bookGenres.genreId, genres.id))
    .where(eq(bookGenres.bookId, row.id));

  const bookTagRows = await db
    .select({ id: tags.id, name: tags.name, typeId: tags.typeId })
    .from(bookTags)
    .innerJoin(tags, eq(bookTags.tagId, tags.id))
    .where(eq(bookTags.bookId, row.id));

  return { ...row, author, genres: bookGenreRows, tags: bookTagRows };
}

// ─── Rankings ────────────────────────────────────────────────────────────────

export async function getRankedBooks(
  metric: RankingMetric,
  limit: number = 10,
  genreSlug?: string,
  status?: number
): Promise<BookWithAuthor[]> {
  const safeMetric = VALID_SORT.has(metric) ? metric : "view_count";

  const conditions: string[] = [];
  const condParams: unknown[] = [];

  if (genreSlug) {
    conditions.push("genres.slug = ?");
    condParams.push(genreSlug);
  }
  if (status) {
    conditions.push("books.status = ?");
    condParams.push(status);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const joinClause = genreSlug
    ? `INNER JOIN book_genres ON books.id = book_genres.book_id
       INNER JOIN genres ON book_genres.genre_id = genres.id`
    : "";

  const sqlStr = `
    SELECT books.*,
           authors.name as author_name,
           authors.local_name as author_local_name,
           authors.avatar as author_avatar
    FROM books
    LEFT JOIN authors ON books.author_id = authors.id
    ${joinClause}
    ${whereClause}
    ORDER BY books.${safeMetric} DESC
    LIMIT ?
  `;

  const rows = sqlite.prepare(sqlStr).all(...condParams, limit) as Record<string, unknown>[];
  return rows.map(rowToBookWithAuthor);
}

// ─── Genres ──────────────────────────────────────────────────────────────────

export async function getGenresWithCounts(): Promise<GenreWithCount[]> {
  const rows = await db
    .select({
      id: genres.id,
      name: genres.name,
      slug: genres.slug,
      bookCount: sql<number>`COUNT(${bookGenres.bookId})`.as("book_count"),
    })
    .from(genres)
    .leftJoin(bookGenres, eq(genres.id, bookGenres.genreId))
    .groupBy(genres.id)
    .orderBy(desc(sql`book_count`));

  return rows;
}

// ─── Chapters ────────────────────────────────────────────────────────────────

export async function getChaptersByBookId(
  bookId: number,
  page: number = 1,
  limit: number = 50
): Promise<PaginatedResponse<{ id: number; indexNum: number; title: string; slug: string | null }>> {
  const offset = (Math.max(1, page) - 1) * limit;

  const rows = await db
    .select({
      id: chapters.id,
      indexNum: chapters.indexNum,
      title: chapters.title,
      slug: chapters.slug,
    })
    .from(chapters)
    .where(eq(chapters.bookId, bookId))
    .orderBy(asc(chapters.indexNum))
    .limit(limit)
    .offset(offset);

  const countResult = sqlite
    .prepare("SELECT COUNT(*) as cnt FROM chapters WHERE book_id = ?")
    .get(bookId) as { cnt: number } | undefined;
  const total = countResult?.cnt ?? 0;

  return {
    data: rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getChapter(
  bookId: number,
  indexNum: number
) {
  return db
    .select()
    .from(chapters)
    .where(and(eq(chapters.bookId, bookId), eq(chapters.indexNum, indexNum)))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

// ─── Search ──────────────────────────────────────────────────────────────────

export function searchBooks(query: string, limit: number = 20, offset: number = 0) {
  const stmt = sqlite.prepare(`
    SELECT books.*, highlight(books_fts, 0, '<mark>', '</mark>') as hl_name,
           highlight(books_fts, 1, '<mark>', '</mark>') as hl_synopsis
    FROM books_fts
    JOIN books ON books.id = books_fts.rowid
    WHERE books_fts MATCH ?
    ORDER BY rank
    LIMIT ? OFFSET ?
  `);
  return stmt.all(query, limit, offset) as (Record<string, unknown> & {
    hl_name: string;
    hl_synopsis: string;
  })[];
}

export function searchChapters(query: string, limit: number = 20, offset: number = 0) {
  const stmt = sqlite.prepare(`
    SELECT chapters.id, chapters.book_id, chapters.index_num, chapters.title,
           books.name as book_name, books.slug as book_slug,
           snippet(chapters_fts, 1, '<mark>', '</mark>', '...', 40) as snippet
    FROM chapters_fts
    JOIN chapters ON chapters.id = chapters_fts.rowid
    JOIN books ON books.id = chapters.book_id
    WHERE chapters_fts MATCH ?
    ORDER BY rank
    LIMIT ? OFFSET ?
  `);
  return stmt.all(query, limit, offset) as {
    id: number;
    book_id: number;
    index_num: number;
    title: string;
    book_name: string;
    book_slug: string;
    snippet: string;
  }[];
}

// ─── Library Stats ───────────────────────────────────────────────────────────

export async function getLibraryStats(): Promise<LibraryStats> {
  const stats = sqlite
    .prepare(
      `SELECT
        COUNT(*) as total_books,
        SUM(chapters_saved) as total_chapters,
        SUM(CASE WHEN status = 2 THEN 1 ELSE 0 END) as completed_books,
        SUM(word_count) as total_words
      FROM books`
    )
    .get() as {
    total_books: number;
    total_chapters: number;
    completed_books: number;
    total_words: number;
  };

  const genreCount = sqlite
    .prepare("SELECT COUNT(*) as cnt FROM genres")
    .get() as { cnt: number };

  return {
    totalBooks: stats.total_books ?? 0,
    totalChapters: stats.total_chapters ?? 0,
    completedBooks: stats.completed_books ?? 0,
    totalWords: stats.total_words ?? 0,
    totalGenres: genreCount.cnt ?? 0,
  };
}

// ─── Book Primary Genre ─────────────────────────────────────────────────────

export function getBookPrimaryGenres(
  bookIds: number[]
): Record<number, { id: number; name: string; slug: string }> {
  if (bookIds.length === 0) return {};
  const placeholders = bookIds.map(() => "?").join(",");
  const rows = sqlite
    .prepare(
      `SELECT bg.book_id, g.id, g.name, g.slug
       FROM book_genres bg
       JOIN genres g ON bg.genre_id = g.id
       WHERE bg.book_id IN (${placeholders})
       GROUP BY bg.book_id`
    )
    .all(...bookIds) as { book_id: number; id: number; name: string; slug: string }[];

  const map: Record<number, { id: number; name: string; slug: string }> = {};
  for (const r of rows) {
    if (!map[r.book_id]) {
      map[r.book_id] = { id: r.id, name: r.name, slug: r.slug };
    }
  }
  return map;
}

// ─── Author ─────────────────────────────────────────────────────────────────

export async function getAuthorById(id: number) {
  return db
    .select()
    .from(authors)
    .where(eq(authors.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}

export async function getBooksByAuthorId(
  authorId: number,
  page: number = 1,
  limit: number = 20
): Promise<PaginatedResponse<BookWithAuthor>> {
  const offset = (Math.max(1, page) - 1) * limit;

  const dataSql = `
    SELECT books.*,
           authors.name as author_name,
           authors.local_name as author_local_name,
           authors.avatar as author_avatar
    FROM books
    LEFT JOIN authors ON books.author_id = authors.id
    WHERE books.author_id = ?
    ORDER BY books.updated_at DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `SELECT COUNT(*) as cnt FROM books WHERE author_id = ?`;

  const rows = sqlite.prepare(dataSql).all(authorId, limit, offset) as Record<string, unknown>[];
  const countRow = sqlite.prepare(countSql).get(authorId) as { cnt: number };
  const total = countRow?.cnt ?? 0;

  return {
    data: rows.map(rowToBookWithAuthor),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// ─── Author Search ──────────────────────────────────────────────────────────

export function searchAuthors(query: string, limit: number = 20) {
  return sqlite
    .prepare(
      `SELECT a.*, COUNT(b.id) as book_count
       FROM authors a
       LEFT JOIN books b ON a.id = b.author_id
       WHERE a.name LIKE ? OR a.local_name LIKE ?
       GROUP BY a.id
       ORDER BY book_count DESC
       LIMIT ?`
    )
    .all(`%${query}%`, `%${query}%`, limit) as {
    id: number;
    name: string;
    local_name: string | null;
    avatar: string | null;
    book_count: number;
  }[];
}
