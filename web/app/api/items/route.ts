import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createItem, SagaError } from "@/lib/saga/createItem";
import { fixMidnightISO, fixMidnightTime } from "@/lib/normalizeTime";
import { decrypt } from "@/lib/crypto";
import type { Item } from "@/lib/types";

const createItemSchema = z.object({
  type: z.enum(["compromiso", "personal", "evento"]),
  title: z.string().min(1),
  description: z.string().optional(),
  start_time: z.string().datetime().optional(),
  end_time: z.string().datetime().optional(),
  all_day: z.boolean().optional(),
  add_to_calendar: z.boolean().optional(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
  effort: z.enum(["pequeno", "media", "grande"]).optional(),
  task_status: z.enum(["sin_empezar", "en_curso", "listo"]).optional(),
  categories: z.array(z.enum(["Trabajo", "Escuela", "Cursos extras", "Personal", "Salud", "Hogar", "Otro"])).optional(),
  location: z.string().optional(),
  recurrence_days: z.array(z.number().int().min(1).max(7)).optional(),
  recurrence_start_time: z.string().optional(),
  recurrence_end_time: z.string().optional(),
});

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("items")
    .select("*")
    .order("start_time", { ascending: true, nullsFirst: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data as Item[]).map((item) => ({
    ...item,
    description: decrypt(item.description),
    location: decrypt(item.location),
  }));

  return NextResponse.json({ items });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = {
      ...parsed.data,
      end_time: fixMidnightISO(parsed.data.end_time) as string | undefined,
      recurrence_end_time: fixMidnightTime(parsed.data.recurrence_end_time) as string | undefined,
    };
    const item = await createItem(user.id, data);
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof SagaError) {
      return NextResponse.json({ error: err.message, step: err.step }, { status: 422 });
    }
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
