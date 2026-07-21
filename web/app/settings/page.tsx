import { createClient } from "@/lib/supabase/server";
import { SettingsForm } from "@/components/SettingsForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationSettings } from "@/components/NotificationSettings";
import type { Integration, Profile } from "@/lib/types";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string; notion?: string }>;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { google, notion } = await searchParams;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single<Profile>();

  const { data: integrations } = await supabase
    .from("integrations")
    .select("provider, workspace_id, metadata, scope")
    .eq("user_id", user!.id);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 lg:max-w-2xl px-4 py-8">
      <h1 className="font-handwriting text-3xl mb-6">Ajustes</h1>

      <section className="mb-8 flex items-center justify-between rounded-md border border-border-soft px-4 py-3">
        <div>
          <p className="font-medium">Tema</p>
          <p className="text-sm text-muted">Elige cómo se ve la app en este dispositivo.</p>
        </div>
        <ThemeToggle />
      </section>

      {profile && (
        <NotificationSettings
          remindersEnabled={profile.reminders_enabled}
          reminderMinutesBefore={profile.reminder_minutes_before}
        />
      )}

      {google === "connected" && <p className="mb-4 text-sm text-green-600">Google conectado correctamente.</p>}
      {google === "error" && <p className="mb-4 text-sm text-red-600">Hubo un error conectando Google.</p>}
      {notion === "connected" && <p className="mb-4 text-sm text-green-600">Notion conectado correctamente.</p>}
      {notion === "error" && <p className="mb-4 text-sm text-red-600">Hubo un error conectando Notion.</p>}

      {profile && (
        <SettingsForm
          profile={profile}
          integrations={(integrations ?? []) as Pick<Integration, "provider" | "workspace_id" | "metadata" | "scope">[]}
        />
      )}

      <section className="mt-8 flex items-center justify-between rounded-md border border-border-soft px-4 py-3">
        <div>
          <p className="font-medium">Sesión</p>
          <p className="text-sm text-muted">{user!.email}</p>
        </div>
        <form action="/api/auth/signout" method="post">
          <button type="submit" className="rounded-md border border-border-soft px-3 py-1.5 text-sm hover:bg-surface">
            Salir
          </button>
        </form>
      </section>
    </main>
  );
}
