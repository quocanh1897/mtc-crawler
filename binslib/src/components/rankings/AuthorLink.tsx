"use client";

import Link from "next/link";

interface AuthorLinkProps {
  href: string;
  children: React.ReactNode;
  className?: string;
}

export function AuthorLink({ href, children, className }: AuthorLinkProps) {
  return (
    <Link
      href={href}
      className={className}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}
