import { createClient } from "@/lib/supabase/server";
import { MonthView } from "@/components/MonthView";
import type { Item } from "@/lib/types";

export default async function MonthPage() {
  const supabase = await createClient();

  const { data: items } = await supabase
    .from("items")
    .select("*")
    .order("start_time", { ascending: true, nullsFirst: false });

  return <MonthView items={(items ?? []) as Item[]} />;
}
