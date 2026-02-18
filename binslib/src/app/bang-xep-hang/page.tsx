import Link from "next/link";
import { AuthorLink } from "@/components/rankings/AuthorLink";
import { getRankedBooks, getGenresWithCounts } from "@/lib/queries";
import { BookCover } from "@/components/books/BookCover";
import { StatusBadge } from "@/components/ui/Badge";
import { formatNumber, timeAgo, cn } from "@/lib/utils";
import { METRIC_LABELS } from "@/types";
import type { RankingMetric } from "@/types";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{
    metric?: string;
    genre?: string;
    status?: string;
  }>;
}

const VALID_METRICS: RankingMetric[] = ["vote_count", "view_count", "comment_count", "bookmark_count"];

export default async function RankingsPage({ searchParams }: Props) {
  const params = await searchParams;
  const metric = (VALID_METRICS.includes(params.metric as RankingMetric)
    ? params.metric
    : "vote_count") as RankingMetric;
  const genreSlug = params.genre || undefined;
  const status = params.status ? parseInt(params.status, 10) : undefined;

  const [books, genres] = await Promise.all([
    getRankedBooks(metric, 50, genreSlug, status),
    getGenresWithCounts(),
  ]);

  function buildUrl(overrides: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    const merged = { metric, genre: genreSlug, status: status?.toString(), ...overrides };
    for (const [k, v] of Object.entries(merged)) {
      if (v) p.set(k, v);
    }
    return `/bang-xep-hang?${p.toString()}`;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-lg font-bold mb-4">Bảng xếp hạng</h1>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-[var(--color-border)] p-4 mb-4 space-y-3">
        {/* Metric */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-text-secondary)] w-16">Xếp hạng:</span>
          {VALID_METRICS.map((m) => (
            <Link
              key={m}
              href={buildUrl({ metric: m })}
              className={cn(
                "px-3 py-1 text-xs rounded-full border transition-colors",
                metric === m
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]"
              )}
            >
              {METRIC_LABELS[m]}
            </Link>
          ))}
        </div>

        {/* Genre */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-text-secondary)] w-16">Thể loại:</span>
          <Link
            href={buildUrl({ genre: undefined })}
            className={cn(
              "px-3 py-1 text-xs rounded-full border transition-colors",
              !genreSlug
                ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]"
            )}
          >
            Tất cả
          </Link>
          {genres.map((g) => (
            <Link
              key={g.id}
              href={buildUrl({ genre: g.slug })}
              className={cn(
                "px-3 py-1 text-xs rounded-full border transition-colors",
                genreSlug === g.slug
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]"
              )}
            >
              {g.name}
            </Link>
          ))}
        </div>

        {/* Status */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[var(--color-text-secondary)] w-16">Trạng thái:</span>
          {[
            { v: undefined, l: "Tất cả" },
            { v: "1", l: "Đang ra" },
            { v: "2", l: "Hoàn thành" },
            { v: "3", l: "Tạm dừng" },
          ].map(({ v, l }) => (
            <Link
              key={l}
              href={buildUrl({ status: v })}
              className={cn(
                "px-3 py-1 text-xs rounded-full border transition-colors",
                (v === undefined ? !status : String(status) === v)
                  ? "bg-[var(--color-primary)] text-white border-[var(--color-primary)]"
                  : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]"
              )}
            >
              {l}
            </Link>
          ))}
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div className="divide-y divide-[var(--color-border)]">
          {books.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)] py-12 text-center">
              Không có truyện nào.
            </p>
          ) : (
            books.map((book, i) => (
              <Link
                key={book.id}
                href={`/doc-truyen/${book.slug}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <span
                  className={cn(
                    "w-7 h-7 rounded flex items-center justify-center text-xs font-bold shrink-0",
                    i < 3
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-gray-100 text-[var(--color-text-secondary)]"
                  )}
                >
                  {i + 1}
                </span>
                <BookCover bookId={book.id} name={book.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] line-clamp-1">{book.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {book.author && (
                      <AuthorLink
                        href={`/tac-gia/${book.author.id}`}
                        className="hover:text-[var(--color-primary)] transition-colors"
                      >
                        {book.author.name}
                      </AuthorLink>
                    )}
                    {book.author && <> &middot; </>}
                    {formatNumber(book.chapterCount)} ch
                  </p>
                </div>
                <div className="hidden sm:block">
                  <StatusBadge status={book.status} />
                </div>
                <div className="shrink-0 text-right min-w-[80px]">
                  <span className="text-sm font-bold text-[var(--color-primary)]">
                    {formatNumber(
                      metric === "vote_count"
                        ? book.voteCount
                        : metric === "view_count"
                        ? book.viewCount
                        : metric === "comment_count"
                        ? book.commentCount
                        : book.bookmarkCount
                    )}
                  </span>
                  <div className="text-[10px] text-[var(--color-text-secondary)]">
                    {METRIC_LABELS[metric]}
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
