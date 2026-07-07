import { supabase } from "@/lib/supabase";

export type Provider = "google" | "notion";

export interface Integration {
  provider: Provider;
  connected: boolean;
  workspace_name?: string | null;
}

export async function getIntegrations(userId: string): Promise<Integration[]> {
  const { data } = await supabase
    .from("integrations")
    .select("provider, metadata")
    .eq("user_id", userId);

  const google: Integration = { provider: "google", connected: false };
  const notion: Integration = { provider: "notion", connected: false };

  for (const row of data ?? []) {
    if (row.provider === "google") {
      google.connected = true;
    } else if (row.provider === "notion") {
      notion.connected = true;
      notion.workspace_name = row.metadata?.workspace_name ?? null;
    }
  }

  return [google, notion];
}

export async function disconnectIntegration(userId: string, provider: Provider) {
  await supabase
    .from("integrations")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
}
