import Link from "next/link";
import { SearchBar } from "@/components/search/SearchBar";

export function Header() {
  return (
    <header className="bg-white border-b border-[var(--color-border)] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-6">
        {/* Logo */}
        <Link href="/" className="text-xl font-bold text-[var(--color-primary)] shrink-0">
          Binslib
        </Link>

        {/* Nav Links */}
        <nav className="hidden md:flex items-center gap-4 text-sm">
          <Link href="/bang-xep-hang" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
            Bảng xếp hạng
          </Link>
          <Link href="/tong-hop" className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] transition-colors">
            Bộ lọc
          </Link>
        </nav>

        {/* Search */}
        <div className="flex-1 max-w-md ml-auto">
          <SearchBar />
        </div>
      </div>
    </header>
  );
}
