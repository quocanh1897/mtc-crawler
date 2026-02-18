import { notFound } from "next/navigation";
import Link from "next/link";
import { getAuthorById, getBooksByAuthorId } from "@/lib/queries";
import { BookCard } from "@/components/books/BookCard";
import { Pagination } from "@/components/ui/Pagination";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
}

export default async function AuthorPage({ params, searchParams }: Props) {
  const { id: idStr } = await params;
  const { page: pageStr } = await searchParams;
  const authorId = parseInt(idStr, 10);
  if (isNaN(authorId)) notFound();

  const author = await getAuthorById(authorId);
  if (!author) notFound();

  const page = Math.max(1, parseInt(pageStr || "1", 10));
  const books = await getBooksByAuthorId(authorId, page, 20);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <nav className="text-xs text-[var(--color-text-secondary)] mb-4">
        <Link href="/" className="hover:text-[var(--color-primary)]">Trang chủ</Link>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--color-text)]">Tác giả</span>
        <span className="mx-1">&rsaquo;</span>
        <span className="text-[var(--color-text)]">{author.name}</span>
      </nav>

      <div className="bg-white rounded-lg border border-[var(--color-border)] p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[var(--color-primary)] flex items-center justify-center text-white font-bold text-xl shrink-0">
            {author.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">{author.name}</h1>
            {author.localName && (
              <p className="text-sm text-[var(--color-text-secondary)]">{author.localName}</p>
            )}
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              {books.total} truyện
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-[var(--color-border)]">
        <div className="px-4 py-3 border-b border-[var(--color-border)]">
          <h2 className="font-bold text-sm">
            Danh sách truyện
            <span className="font-normal text-[var(--color-text-secondary)] ml-2">
              ({books.total} truyện)
            </span>
          </h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
          {books.data.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
        {books.totalPages > 1 && (
          <div className="px-4 py-3">
            <Pagination
              currentPage={page}
              totalPages={books.totalPages}
              baseUrl={`/tac-gia/${authorId}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
