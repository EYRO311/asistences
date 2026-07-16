"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  IconCalendar,
  IconCalendarMonth,
  IconClipboardList,
  IconTarget,
} from "@tabler/icons-react";
import type { TablerIcon } from "@/lib/itemPresentation";

const LINKS: { href: string; Icon: TablerIcon; label: string }[] = [
  { href: "/semana", Icon: IconCalendar as TablerIcon, label: "Semana" },
  { href: "/mes", Icon: IconCalendarMonth as TablerIcon, label: "Mes" },
];

const LINKS_RIGHT: { href: string; Icon: TablerIcon; label: string }[] = [
  { href: "/tareas", Icon: IconClipboardList as TablerIcon, label: "Tareas" },
  { href: "/metas", Icon: IconTarget as TablerIcon, label: "Metas" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border-soft bg-surface pb-[env(safe-area-inset-bottom)] xs:hidden">
      <div className="relative mx-auto flex h-16 max-w-md items-center justify-between px-6">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center gap-0.5 text-[11px] ${
              isActive(link.href) ? "text-foreground" : "text-muted"
            }`}
          >
            <link.Icon size={22} stroke={1.5} aria-hidden />
            {link.label}
          </Link>
        ))}

        <Link
          href="/new"
          aria-label="Nueva tarea"
          className="absolute left-1/2 top-0 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-foreground text-background shadow-lg"
        >
          <span className="text-2xl leading-none">+</span>
        </Link>
        <span className="w-10" aria-hidden />

        {LINKS_RIGHT.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex flex-col items-center gap-0.5 text-[11px] ${
              isActive(link.href) ? "text-foreground" : "text-muted"
            }`}
          >
            <link.Icon size={22} stroke={1.5} aria-hidden />
            {link.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
