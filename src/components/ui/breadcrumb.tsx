'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[12px] mb-4">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-2">
          {i > 0 && <ChevronRight size={12} className="text-pw-text-faint" aria-hidden="true" />}
          {item.href ? (
            <Link href={item.href} className="text-pw-text-muted hover:text-pw-text transition-colors duration-150">
              {item.label}
            </Link>
          ) : (
            <span className="text-pw-text font-medium truncate max-w-[240px]" aria-current="page">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
