import { createClient } from "@/lib/supabase/server";
import { DayView } from "@/components/DayView";
import type { Item } from "@/lib/types";

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { date } = await searchParams;

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .order("start_time", { ascending: true, nullsFirst: false });

  return <DayView items={(items ?? []) as Item[]} initialDate={date} />;
}
