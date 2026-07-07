import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { NOTION_AUTH_URL } from "@/lib/notion";

/**
 * Inicia el flujo OAuth de Notion: redirige al usuario a la pantalla de
 * autorización de la integración pública de Notion.
 * Acepta ?mt=ACCESS_TOKEN para flujos originados desde la app mobile.
 */
export async function GET(request: NextRequest) {
  const mobileToken = request.nextUrl.searchParams.get("mt");

  let userId: string | undefined;

  if (mobileToken) {
    const admin = createServiceRoleClient();
    const { data } = await admin.auth.getUser(mobileToken);
    userId = data.user?.id;
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    userId = user?.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const state = mobileToken ? `${userId}:mobile` : userId;

  const url = new URL(NOTION_AUTH_URL);
  url.searchParams.set("client_id", process.env.NOTION_CLIENT_ID!);
  url.searchParams.set("redirect_uri", process.env.NOTION_REDIRECT_URI!);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("owner", "user");
  url.searchParams.set("state", state);

  return NextResponse.redirect(url.toString());
}
