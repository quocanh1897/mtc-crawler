import { notFound } from "next/navigation";
import Link from "next/link";
import { getBookBySlug, getChapter } from "@/lib/queries";

export const dynamic = "force-dynamic";

interface Props {
    params: Promise<{ slug: string; index: string }>;
}

export default async function ChapterReaderPage({ params }: Props) {
    const resolvedParams = await params;
    console.log("[DEBUG ChapterReader] params:", JSON.stringify(resolvedParams));
    const { slug, index: indexStr } = resolvedParams;
    console.log("[DEBUG ChapterReader] slug:", slug, "indexStr:", indexStr);
    // Next.js passes the full segment "chuong-1" as index; extract the number
    const match = String(indexStr).match(/^chuong-(\d+)$/);
    const indexNum = match ? parseInt(match[1], 10) : parseInt(indexStr, 10);
    console.log("[DEBUG ChapterReader] match:", match, "indexNum:", indexNum);
    if (isNaN(indexNum) || indexNum < 1) {
        console.log("[DEBUG ChapterReader] notFound: invalid index");
        notFound();
    }

    const book = await getBookBySlug(slug);
    if (!book) notFound();

    const chapter = await getChapter(book.id, indexNum);
    if (!chapter) notFound();

    const hasPrev = indexNum > 1;
    const hasNext = indexNum < book.chapterCount;

    return (
        <div className="max-w-3xl mx-auto px-4 py-6">
            {/* Top Nav */}
            <div className="flex items-center justify-between mb-6 text-sm">
                <Link
                    href={`/doc-truyen/${book.slug}`}
                    className="text-[var(--color-primary)] hover:underline flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    {book.name}
                </Link>
                <div className="flex items-center gap-3">
                    <span className="text-[var(--color-text-secondary)]">
                        Chương {indexNum} / {book.chapterCount}
                    </span>
                    <Link
                        href={`/doc-truyen/${book.slug}`}
                        className="text-[var(--color-primary)] hover:underline flex items-center gap-1"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        Mục lục
                    </Link>
                </div>
            </div>

            {/* Chapter Content */}
            <article className="bg-white rounded-lg border border-[var(--color-border)] p-8">
                <h1 className="text-lg font-bold text-center mb-6 text-[var(--color-text)]">
                    {chapter.title}
                </h1>
                <div
                    className="prose max-w-none text-[var(--color-text)] leading-[1.8]"
                    style={{ fontFamily: "var(--font-serif)", fontSize: "16px" }}
                >
                    {chapter.body?.split("\n").map((paragraph, i) => (
                        <p key={i} className="mb-4 text-justify indent-8">
                            {paragraph}
                        </p>
                    ))}
                </div>
            </article>

            {/* Bottom Nav */}
            <div className="flex items-center justify-between mt-6">
                {hasPrev ? (
                    <Link
                        href={`/doc-truyen/${book.slug}/chuong-${indexNum - 1}`}
                        className="px-4 py-2 text-sm font-medium rounded border border-[var(--color-border)] hover:bg-gray-50 transition-colors"
                    >
                        &laquo; Chương trước
                    </Link>
                ) : (
                    <div />
                )}
                <Link
                    href={`/doc-truyen/${book.slug}`}
                    className="px-4 py-2 text-sm font-medium rounded border border-[var(--color-border)] hover:bg-gray-50 transition-colors flex items-center gap-1"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    Mục lục
                </Link>
                {hasNext ? (
                    <Link
                        href={`/doc-truyen/${book.slug}/chuong-${indexNum + 1}`}
                        className="px-4 py-2 text-sm font-medium rounded border border-[var(--color-border)] hover:bg-gray-50 transition-colors"
                    >
                        Chương sau &raquo;
                    </Link>
                ) : (
                    <div />
                )}
            </div>
        </div>
    );
}
