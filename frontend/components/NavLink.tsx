"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
        isActive
          ? "text-white bg-gray-800/80"
          : "text-gray-400 hover:text-white hover:bg-gray-900/80"
      }`}
    >
      {children}
    </Link>
  );
}
