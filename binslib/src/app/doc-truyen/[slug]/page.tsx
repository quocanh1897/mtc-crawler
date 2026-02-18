import { notFound } from "next/navigation";
import Link from "next/link";
import { getBookBySlug, getChaptersByBookId } from "@/lib/queries";
import { BookCover } from "@/components/books/BookCover";
import { StatusBadge } from "@/components/ui/Badge";
import { DownloadButton } from "@/components/books/DownloadButton";
import { Pagination } from "@/components/ui/Pagination";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function BookDetailPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { page: pageStr } = await searchParams;
  const page = Math.max(1, parseInt(pageStr || "1", 10));

  const book = await getBookBySlug(slug);
  if (!book) notFound();

  const chapters = await getChaptersByBookId(book.id, page, 50);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--color-text-secondary)] mb-4">
        <Link href="/" className="hover:text-[var(--color-primary)]">Trang chủ</Link>
        {book.genres[0] && (
          <>
            <span className="mx-1">&rsaquo;</span>
            <Link href={`/the-loai/${book.genres[0].slug}`} className="hover:text-[var(--color-primary)]">
              {book.genres[0].name}
            </Link>
          </>
        )}
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--color-text)]">{book.name}</span>
      </nav>

      {/* Book Header */}
      <div className="bg-white rounded-lg border border-[var(--color-border)] p-6">
        <div className="flex gap-6">
          {/* Cover */}
          <BookCover bookId={book.id} name={book.name} size="lg" />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[var(--color-text)] mb-2">{book.name}</h1>

            {book.author && (
              <p className="text-sm text-[var(--color-text-secondary)] mb-1">
                T&aacute;c gi&#7843;: <span className="text-[var(--color-primary)]">{book.author.name}</span>
                {book.author.localName && (
                  <span className="text-xs ml-1">({book.author.localName})</span>
                )}
              </p>
            )}

            <div className="flex flex-wrap gap-1.5 mb-2">
              {book.genres.map((g) => (
                <Link
                  key={g.id}
                  href={`/the-loai/${g.slug}`}
                  className="text-xs px-2 py-0.5 rounded bg-gray-100 text-[var(--color-text-secondary)] hover:bg-gray-200 transition-colors"
                >
                  {g.name}
                </Link>
              ))}
            </div>

            <div className="mb-3">
              <StatusBadge status={book.status} />
            </div>

            {/* Stats Row */}
            <div className="flex flex-wrap gap-4 text-sm mb-4">
              <div className="text-center">
                <div className="font-bold text-[var(--color-primary)]">{formatNumber(book.viewCount)}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">L&#432;&#7907;t &#273;&#7885;c</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-[var(--color-primary)]">{formatNumber(book.commentCount)}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">B&igrave;nh lu&#7853;n</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-[var(--color-primary)]">{formatNumber(book.bookmarkCount)}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Y&ecirc;u th&iacute;ch</div>
              </div>
              <div className="text-center">
                <div className="font-bold text-[var(--color-primary)]">{formatNumber(book.chapterCount)}</div>
                <div className="text-xs text-[var(--color-text-secondary)]">Ch&#432;&#417;ng</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <DownloadButton bookId={book.id} bookStatus={book.status} />
              {chapters.data.length > 0 && (
                <Link
                  href={`/doc-truyen/${book.slug}/chuong-1`}
                  className="px-5 py-2 text-sm font-medium rounded bg-green-600 text-white hover:bg-green-700 transition-colors"
                >
                  &#272;&#7885;c truy&#7879;n
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Synopsis */}
      {book.synopsis && (
        <div className="bg-white rounded-lg border border-[var(--color-border)] p-6 mt-4">
          <h2 className="font-bold text-sm mb-2">Gi&#7899;i thi&#7879;u</h2>
          <div className="text-sm text-[var(--color-text-secondary)] leading-relaxed whitespace-pre-line">
            {book.synopsis.replace(/\\n/g, "\n")}
          </div>
        </div>
      )}

      {/* Chapter List */}
      <div className="bg-white rounded-lg border border-[var(--color-border)] mt-4">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-sm">
            Danh s&aacute;ch ch&#432;&#417;ng
            <span className="font-normal text-[var(--color-text-secondary)] ml-2">
              ({formatNumber(chapters.total)} ch&#432;&#417;ng)
            </span>
          </h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {chapters.data.map((ch) => (
            <Link
              key={ch.id}
              href={`/doc-truyen/${book.slug}/chuong-${ch.indexNum}`}
              className="block px-4 py-2 text-sm hover:bg-gray-50 transition-colors text-[var(--color-text)] hover:text-[var(--color-primary)]"
            >
              {ch.title}
            </Link>
          ))}
        </div>
        <div className="px-4 py-3">
          <Pagination
            currentPage={page}
            totalPages={chapters.totalPages}
            baseUrl={`/doc-truyen/${book.slug}`}
          />
        </div>
      </div>
    </div>
  );
}
