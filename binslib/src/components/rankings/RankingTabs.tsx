"use client";

import { useState } from "react";
import Link from "next/link";
import { cn, formatNumber } from "@/lib/utils";
import { BookCover } from "@/components/books/BookCover";
import type { BookWithAuthor, RankingMetric } from "@/types";

const TABS: { id: RankingMetric; label: string; unit: string }[] = [
  { id: "view_count", label: "Lượt đọc", unit: "lượt xem" },
  { id: "bookmark_count", label: "Yêu thích", unit: "yêu thích" },
  { id: "comment_count", label: "Bình luận", unit: "bình luận" },
];

interface RankingTabsProps {
  data: Record<RankingMetric, BookWithAuthor[]>;
  genreSlug?: string;
}

export function RankingTabs({ data, genreSlug }: RankingTabsProps) {
  const [active, setActive] = useState<RankingMetric>("view_count");

  const books = data[active] || [];

  function getStatValue(book: BookWithAuthor): number {
    if (active === "view_count") return book.viewCount;
    if (active === "comment_count") return book.commentCount;
    if (active === "bookmark_count") return book.bookmarkCount;
    return 0;
  }

  const activeTab = TABS.find((t) => t.id === active)!;

  return (
    <div className="bg-white rounded-lg border border-[var(--color-border)]">
      {/* Tab Headers */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
                active === tab.id
                  ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                  : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <Link
          href={`/bang-xep-hang?metric=${active}${genreSlug ? `&genre=${genreSlug}` : ""}`}
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          Tất cả &raquo;
        </Link>
      </div>

      {/* Ranking List */}
      <div className="divide-y divide-[var(--color-border)]">
        {books.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
            Chưa có dữ liệu.
          </p>
        ) : (
          books.map((book, i) => (
            <Link
              key={book.id}
              href={`/doc-truyen/${book.slug}`}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors"
            >
              {/* Rank */}
              <span
                className={cn(
                  "w-6 h-6 rounded flex items-center justify-center text-xs font-bold shrink-0",
                  i < 3
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-gray-100 text-[var(--color-text-secondary)]"
                )}
              >
                {i + 1}
              </span>

              {/* Cover */}
              <BookCover bookId={book.id} name={book.name} size="sm" />

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)] line-clamp-1">
                  {book.name}
                </p>
                {book.author && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                    {book.author.name}
                  </p>
                )}
              </div>

              {/* Stat */}
              <div className="shrink-0 text-right">
                <span className="text-sm font-semibold text-[var(--color-primary)]">
                  {formatNumber(getStatValue(book))}
                </span>
                <span className="block text-[10px] text-[var(--color-text-secondary)]">
                  {activeTab.unit}
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
