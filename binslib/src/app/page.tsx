import { getRankedBooks, getBooks, getBookPrimaryGenres } from "@/lib/queries";
import { RankingTabs } from "@/components/rankings/RankingTabs";
import { Sidebar } from "@/components/layout/Sidebar";
import { BookCard } from "@/components/books/BookCard";
import { StatusBadge } from "@/components/ui/Badge";
import { BookCover } from "@/components/books/BookCover";
import { formatNumber, timeAgo } from "@/lib/utils";
import type { RankingMetric } from "@/types";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [viewRanked, bookmarkRanked, commentRanked, recentlyUpdated, completedBooks] =
    await Promise.all([
      getRankedBooks("view_count", 10),
      getRankedBooks("bookmark_count", 10),
      getRankedBooks("comment_count", 10),
      getBooks({ sort: "updated_at", order: "desc", limit: 15 }),
      getBooks({ sort: "bookmark_count", order: "desc", status: 2, limit: 8 }),
    ]);

  const rankingData: Record<RankingMetric, typeof viewRanked> = {
    view_count: viewRanked,
    bookmark_count: bookmarkRanked,
    comment_count: commentRanked,
  };

  // Get primary genres for recently updated books
  const recentBookIds = recentlyUpdated.data.map((b) => b.id);
  const genreMap = getBookPrimaryGenres(recentBookIds);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex gap-6">
        {/* Main Content */}
        <div className="flex-1 min-w-0 space-y-6">
          {/* Ranking Tabs */}
          <RankingTabs data={rankingData} />

          {/* Recently Updated */}
          <div className="bg-white rounded-lg border border-[var(--color-border)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <h2 className="font-bold text-sm">M&#7899;i c&#7853;p nh&#7853;t</h2>
              <Link
                href="/tong-hop?sort=updated_at"
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                Xem th&ecirc;m &raquo;
              </Link>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {recentlyUpdated.data.map((book) => {
                const genre = genreMap[book.id];
                return (
                  <Link
                    key={book.id}
                    href={`/doc-truyen/${book.slug}`}
                    className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 transition-colors text-sm"
                  >
                    {genre ? (
                      <span className="shrink-0 text-xs text-[var(--color-primary)] w-20 truncate">
                        {genre.name}
                      </span>
                    ) : (
                      <StatusBadge status={book.status} />
                    )}
                    <span className="flex-1 min-w-0 font-medium text-[var(--color-text)] truncate">
                      {book.name}
                    </span>
                    <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">
                      {formatNumber(book.chapterCount)} ch
                    </span>
                    <span className="shrink-0 text-xs text-[var(--color-text-secondary)] w-24 text-right">
                      {timeAgo(book.updatedAt)}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Completed Books */}
          <div className="bg-white rounded-lg border border-[var(--color-border)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
              <h2 className="font-bold text-sm">Truy&#7879;n &#273;&atilde; ho&agrave;n th&agrave;nh</h2>
              <Link
                href="/tong-hop?status=2"
                className="text-xs text-[var(--color-primary)] hover:underline"
              >
                Xem th&ecirc;m &raquo;
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
              {completedBooks.data.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="hidden lg:block w-72 shrink-0">
          <Sidebar />
        </div>
      </div>
    </div>
  );
}
