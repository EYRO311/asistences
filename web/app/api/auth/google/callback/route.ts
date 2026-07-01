import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getGoogleOAuthClient } from "@/lib/google";

/**
 * Callback de OAuth de Google: intercambia el code por tokens y los guarda
 * en `integrations` para el usuario indicado en `state`.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const userId = searchParams.get("state");
  const error = searchParams.get("error");

  const redirectUrl = new URL("/settings", request.url);

  if (error || !code || !userId) {
    redirectUrl.searchParams.set("google", "error");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const oauth2Client = getGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Google no devolvió access_token");
    }

    const supabase = createServiceRoleClient();

    await supabase.from("integrations").upsert(
      {
        user_id: userId,
        provider: "google",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? undefined,
        expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        scope: tokens.scope ?? null,
      },
      { onConflict: "user_id,provider", ignoreDuplicates: false }
    );

    redirectUrl.searchParams.set("google", "connected");
    return NextResponse.redirect(redirectUrl);
  } catch {
    redirectUrl.searchParams.set("google", "error");
    return NextResponse.redirect(redirectUrl);
  }
}
