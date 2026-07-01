import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { NOTION_AUTH_URL } from "@/lib/notion";

/**
 * Inicia el flujo OAuth de Notion: redirige al usuario a la pantalla de
 * autorización de la integración pública de Notion.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const url = new URL(NOTION_AUTH_URL);
  url.searchParams.set("client_id", process.env.NOTION_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.NOTION_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", user.id);

  return NextResponse.redirect(url.toString());
}
