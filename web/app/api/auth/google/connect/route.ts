import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getGoogleOAuthClient, GOOGLE_SCOPES } from "@/lib/google";

/**
 * Inicia el flujo OAuth de Google: redirige al usuario a la pantalla de
 * consentimiento solicitando acceso a Google Calendar.
 */
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const oauth2Client = getGoogleOAuthClient();

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent",
    scope: GOOGLE_SCOPES,
    state: user.id,
  });

  return NextResponse.redirect(url);
}
