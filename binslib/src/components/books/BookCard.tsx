import Link from "next/link";
import { StatusBadge } from "@/components/ui/Badge";
import { BookCover } from "@/components/books/BookCover";
import { formatNumber, truncate } from "@/lib/utils";
import type { BookWithAuthor } from "@/types";

export function BookCard({ book }: { book: BookWithAuthor }) {
  return (
    <div className="bg-white rounded-lg border border-[var(--color-border)] overflow-hidden hover:shadow-md transition-shadow">
      <Link href={`/doc-truyen/${book.slug}`} className="flex p-3 gap-3">
        <div className="shrink-0 w-16 h-22">
          <BookCover bookId={book.id} name={book.name} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm text-[var(--color-text)] line-clamp-1 hover:text-[var(--color-primary)] transition-colors">
            {book.name}
          </h3>
          {book.author && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              {book.author.name}
            </p>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-xs text-[var(--color-text-secondary)]">
            <span>{formatNumber(book.chapterCount)} ch</span>
            <StatusBadge status={book.status} />
          </div>
          {book.synopsis && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5 line-clamp-2">
              {truncate(book.synopsis.replace(/\\n/g, " "), 120)}
            </p>
          )}
        </div>
      </Link>
    </div>
  );
}
