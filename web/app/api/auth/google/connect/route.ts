import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getGoogleOAuthClient, GOOGLE_SCOPES } from "@/lib/google";
import { signOAuthState } from "@/lib/oauthState";

/**
 * Inicia el flujo OAuth de Google: redirige al usuario a la pantalla de
 * consentimiento solicitando acceso a Google Calendar.
 * Acepta ?mt=ACCESS_TOKEN para flujos originados desde la app mobile.
 */
export async function GET(request: NextRequest) {
  const mobileToken = request.nextUrl.searchParams.get("mt");

  let userId: string | undefined;

  if (mobileToken) {
    // Mobile flow: verify the Supabase JWT from the mobile app
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

  const oauth2Client = getGoogleOAuthClient();

  const state = signOAuthState(userId, Boolean(mobileToken));

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent",
    scope: GOOGLE_SCOPES,
    state,
  });

  return NextResponse.redirect(url);
}
