import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { encrypt, decrypt } from "@/lib/crypto";
import type { Goal } from "@/lib/types";

const createGoalSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  due_date: z.string().datetime().optional(),
  recurrence_type: z.enum(["none", "daily", "weekly", "monthly"]),
  categories: z
    .array(z.enum(["Trabajo", "Escuela", "Cursos extras", "Personal", "Salud", "Hogar", "Otro"]))
    .optional(),
});

function decryptGoal(goal: Goal): Goal {
  return {
    ...goal,
    description: decrypt(goal.description),
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await supabase
    .from("goals")
    .select("*, goal_items(*)")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const goals = (data as Goal[]).map(decryptGoal);
  return NextResponse.json({ goals });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const body = await request.json();
  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const service = createServiceRoleClient();
  const { data, error } = await service
    .from("goals")
    .insert({
      user_id: user.id,
      title: parsed.data.title,
      description: encrypt(parsed.data.description ?? null),
      due_date: parsed.data.due_date ?? null,
      recurrence_type: parsed.data.recurrence_type,
      categories: parsed.data.categories ?? [],
    })
    .select("*")
    .single<Goal>();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Error al crear" }, { status: 500 });

  return NextResponse.json({ goal: decryptGoal(data) }, { status: 201 });
}
