import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SyncWidget } from "@/components/SyncWidget";
import { NavMenuClient } from "@/components/NavMenuClient";

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <header className="relative border-b border-border-soft bg-surface">
      <nav className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 text-sm lg:max-w-6xl">
        {/* Logo */}
        <Link href="/" className="font-handwriting text-2xl shrink-0 mr-1">
          Mi Agenda
        </Link>

        {/* Links de escritorio + hamburguesa para tablet/móvil */}
        <NavMenuClient email={user.email ?? ""} />

        {/* Spacer */}
        <div className="flex-1" />

        {/* SyncWidget + email/salir en desktop */}
        <div className="flex shrink-0 items-center gap-3">
          <SyncWidget />
          <div className="hidden items-center gap-3 lg:flex">
            <span className="text-muted truncate max-w-50">{user.email}</span>
            <form action="/api/auth/signout" method="post">
              <button type="submit" className="text-muted hover:text-foreground">
                Salir
              </button>
            </form>
          </div>
        </div>
      </nav>
    </header>
  );
}
