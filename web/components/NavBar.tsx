import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SyncWidget } from "@/components/SyncWidget";

export async function NavBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  return (
    <header className="border-b border-border-soft bg-surface">
      <nav className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 text-sm lg:max-w-6xl">
        <div className="hidden min-w-0 items-center gap-4 overflow-x-auto whitespace-nowrap md:flex">
          <Link href="/" className="font-handwriting text-2xl shrink-0">
            Mi Agenda
          </Link>
          <Link href="/semana" className="shrink-0 text-muted hover:text-foreground">
            Semana
          </Link>
          <Link href="/mes" className="shrink-0 text-muted hover:text-foreground">
            Mes
          </Link>
          <Link href="/tareas" className="shrink-0 text-muted hover:text-foreground">
            Tareas
          </Link>
          <Link href="/new" className="shrink-0 text-muted hover:text-foreground">
            Nueva tarea
          </Link>
          <Link href="/settings" className="shrink-0 text-muted hover:text-foreground">
            Ajustes
          </Link>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <SyncWidget />
          <div className="hidden items-center gap-3 md:flex">
            <span className="text-muted">{user.email}</span>
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
