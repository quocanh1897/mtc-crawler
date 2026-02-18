import { notFound } from "next/navigation";
import { getBookBySlug, getChapter } from "@/lib/queries";
import { ChapterNavTop, ChapterNavBottom } from "@/components/chapters/ChapterNav";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string; chapter: string }>;
}

export default async function ChapterReaderPage({ params }: Props) {
  const { slug, chapter: chapterSegment } = await params;

  const match = chapterSegment.match(/^chuong-(\d+)$/);
  if (!match) notFound();
  const indexNum = parseInt(match[1], 10);
  if (isNaN(indexNum) || indexNum < 1) notFound();

  const book = await getBookBySlug(slug);
  if (!book) notFound();

  const chapter = await getChapter(book.id, indexNum);
  if (!chapter) notFound();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <ChapterNavTop
        bookId={book.id}
        bookSlug={book.slug}
        bookName={book.name}
        currentIndex={indexNum}
        totalChapters={book.chapterCount}
      />

      <article className="bg-white rounded-lg border border-[var(--color-border)] p-8">
        <h1 className="text-lg font-bold text-center mb-6 text-[var(--color-text)]">
          {chapter.title}
        </h1>
        <div
          className="prose max-w-none text-[var(--color-text)] leading-[1.8]"
          style={{ fontFamily: "var(--font-serif)", fontSize: "16px" }}
        >
          {chapter.body?.split("\n").map((paragraph: string, i: number) => (
            <p key={i} className="mb-4 text-justify indent-8">
              {paragraph}
            </p>
          ))}
        </div>
      </article>

      <ChapterNavBottom
        bookId={book.id}
        bookSlug={book.slug}
        currentIndex={indexNum}
        totalChapters={book.chapterCount}
      />
    </div>
  );
}
