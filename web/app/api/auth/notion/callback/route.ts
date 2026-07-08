import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { NOTION_TOKEN_URL } from "@/lib/notion";

interface NotionTokenResponse {
  access_token: string;
  workspace_id: string;
  workspace_name?: string;
  bot_id: string;
  duplicated_template_id?: string | null;
}

/**
 * Callback de OAuth de Notion: intercambia el code por un access token
 * (no expira) y lo guarda en `integrations`.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const rawState = searchParams.get("state") ?? "";
  const stateParts = rawState.split(":");
  const isMobile = stateParts[stateParts.length - 1] === "mobile";
  const resolvedUserId = isMobile ? stateParts.slice(0, -1).join(":") : rawState;

  function mobileDeepLink(result: "success" | "error") {
    return `com.eyro.agenda://auth/notion/${result}`;
  }

  const redirectUrl = new URL("/settings", request.url);

  if (error || !code || !resolvedUserId) {
    if (isMobile) return NextResponse.redirect(mobileDeepLink("error"));
    redirectUrl.searchParams.set("notion", "error");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const basicAuth = Buffer.from(
      `${process.env.NOTION_CLIENT_ID}:${process.env.NOTION_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch(NOTION_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.NOTION_REDIRECT_URI,
      }),
    });

    if (!response.ok) {
      throw new Error(`Notion token exchange failed: ${response.status}`);
    }

    const tokens = (await response.json()) as NotionTokenResponse;

    const supabase = createServiceRoleClient();

    await supabase.from("integrations").upsert(
      {
        user_id: resolvedUserId,
        provider: "notion",
        access_token: tokens.access_token,
        workspace_id: tokens.workspace_id,
        metadata: {
          workspace_name: tokens.workspace_name ?? null,
          bot_id: tokens.bot_id,
        },
      },
      { onConflict: "user_id,provider" }
    );

    if (isMobile) return NextResponse.redirect(mobileDeepLink("success"));
    redirectUrl.searchParams.set("notion", "connected");
    return NextResponse.redirect(redirectUrl);
  } catch {
    if (isMobile) return NextResponse.redirect(mobileDeepLink("error"));
    redirectUrl.searchParams.set("notion", "error");
    return NextResponse.redirect(redirectUrl);
  }
}
