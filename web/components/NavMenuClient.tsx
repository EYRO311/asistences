"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/semana", label: "Semana" },
  { href: "/mes", label: "Mes" },
  { href: "/tareas", label: "Tareas" },
  { href: "/metas", label: "Metas" },
  { href: "/reportes", label: "Reportes" },
  { href: "/new", label: "Nueva tarea" },
  { href: "/settings", label: "Ajustes" },
];

export function NavMenuClient({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);

  function isActive(href: string) {
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  // Cierra el menú al navegar
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Cierra al hacer click fuera
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={menuRef} className="contents">
      {/* Links visibles en pantallas ≥ 1000px */}
      <div className="hidden nav:flex items-center gap-5">
        {LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 transition-colors ${
              isActive(link.href)
                ? "text-foreground font-medium"
                : "text-muted hover:text-foreground"
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Botón hamburguesa — visible solo entre 400px y 1000px */}
      <button
        className="hidden xs:flex nav:hidden items-center text-muted hover:text-foreground p-1 -mr-1"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
      >
        {open ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 border-b border-border-soft bg-surface shadow-lg nav:hidden">
          <div className="mx-auto max-w-3xl px-4 py-1 lg:max-w-6xl">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center py-3 border-b border-border-soft last:border-0 transition-colors ${
                  isActive(link.href)
                    ? "text-foreground font-medium"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {link.label}
              </Link>
            ))}
            <div className="flex items-center justify-between py-3">
              <span className="text-muted text-xs truncate">{email}</span>
              <form action="/api/auth/signout" method="post">
                <button
                  type="submit"
                  className="ml-4 shrink-0 text-sm text-muted hover:text-foreground"
                >
                  Salir
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
