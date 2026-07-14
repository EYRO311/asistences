import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { getRecommendations } from "@/lib/gemini";
import { decrypt } from "@/lib/crypto";
import type { Goal, GoalRecommendation, GoalRecurrence } from "@/lib/types";

const VALID_PERIODS = ["daily", "weekly", "monthly"] as const;
type Period = (typeof VALID_PERIODS)[number];

/**
 * GET /api/goals/recommendations?period=weekly&refresh=1
 *
 * Devuelve (o genera) la recomendación compartida para todas las metas del
 * usuario de un período dado (daily | weekly | monthly).
 * Una sola recomendación por período — todas las metas del mismo lapso la comparten.
 */
export async function GET(request: NextRequest) {
  const periodParam = request.nextUrl.searchParams.get("period");
  const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";

  if (!periodParam || !(VALID_PERIODS as readonly string[]).includes(periodParam)) {
    return NextResponse.json(
      { error: "period requerido: daily | weekly | monthly" },
      { status: 400 }
    );
  }
  const period = periodParam as Period;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const service = createServiceRoleClient();

  // Recomendación existente
  const { data: existing } = await service
    .from("goal_recommendations")
    .select("*")
    .eq("user_id", user.id)
    .eq("recurrence_type", period)
    .single<GoalRecommendation>();

  if (existing && !forceRefresh) {
    return NextResponse.json({
      recurrence_type: period,
      outfit_brief: existing.outfit_brief,
      full_text: existing.full_text,
      generated_at: existing.generated_at,
    });
  }

  // Carga las metas activas de este período
  const { data: goals, error: goalsError } = await service
    .from("goals")
    .select("*, goal_items(*)")
    .eq("user_id", user.id)
    .eq("recurrence_type", period as GoalRecurrence)
    .eq("status", "active");

  if (goalsError || !goals?.length) {
    return NextResponse.json(
      { error: `No hay metas activas de tipo ${period}` },
      { status: 404 }
    );
  }

  // Desencripta títulos y descripciones para el prompt
  const goalsPlain = (goals as Goal[]).map((g) => ({
    title: g.title,
    description: decrypt(g.description) ?? undefined,
  }));

  const goalsSummary = goalsPlain
    .map((g, i) => `${i + 1}. ${g.title}${g.description ? ` — ${g.description}` : ""}`)
    .join("\n");

  const periodLabel = { daily: "diaria", weekly: "semanal", monthly: "mensual" }[period];

  const fullText = await getRecommendations({
    title: `Metas ${periodLabel}`,
    description: `El usuario tiene las siguientes metas ${periodLabel}s:\n${goalsSummary}\n\nProporciona una recomendación general de vestimenta, motivación y hábitos para ayudarle a cumplirlas durante este período.`,
  });

  // Guarda o actualiza
  await service.from("goal_recommendations").upsert(
    {
      user_id: user.id,
      recurrence_type: period,
      outfit_brief: null,
      full_text: fullText,
      generated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,recurrence_type" }
  );

  return NextResponse.json({
    recurrence_type: period,
    outfit_brief: null,
    full_text: fullText,
    generated_at: new Date().toISOString(),
  });
}
