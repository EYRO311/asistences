export type ItemType = "compromiso" | "personal" | "evento";

export type ItemStatus = "draft" | "syncing" | "confirmed" | "failed" | "cancelled";

export type Priority = "alta" | "media" | "baja";
export type Effort = "pequeno" | "media" | "grande";
export type TaskStatus = "sin_empezar" | "en_curso" | "listo";
export type Category = "Trabajo" | "Escuela" | "Cursos extras" | "Personal" | "Salud" | "Hogar" | "Otro" | "Evento";
export type ItemSource = "app" | "google_sync" | "notion_sync";

export interface TravelModeEstimate {
  minutes: number;
  leaveMinutesBefore: number;
}

export interface RideshareEstimate {
  minutes: number;
  leaveMinutesBefore: number;
  costRangeMXN: [number, number];
}

export interface TravelEstimate {
  distanceKm: number;
  car: TravelModeEstimate;
  bike: TravelModeEstimate;
  publicTransport: TravelModeEstimate;
  rideshare?: RideshareEstimate;
}

// ── Recommendations ───────────────────────────────────────────────────────────

// Alias de compatibilidad con componentes existentes — refleja la respuesta
// que devuelven los endpoints de recomendaciones (misma forma que antes)
export interface CachedRecommendation {
  recommendation: string | null;
  outfit_suggestion: string | null;
  location: string | null;
  weather: {
    description: string;
    tempMaxC: number;
    tempMinC: number;
    precipitationProbability: number;
  } | null;
  travel: TravelEstimate | null;
  preferredTransport?: PreferredTransport | null;
  // true si esta recomendación viene de la "recomendación automática" del
  // día (compartida con las demás tareas de hoy) en vez de ser específica
  // de este item.
  isDaily?: boolean;
}

export interface Recommendation {
  id: string;
  item_id: string | null;
  outfit_brief: string | null;   // solo ropa, mostrar en tarjeta
  full_text: string | null;      // recomendación completa
  location_name: string | null;
  weather: {
    description: string;
    tempMaxC: number;
    tempMinC: number;
    precipitationProbability: number;
  } | null;
  travel: TravelEstimate | null;
  preferred_transport: PreferredTransport | null;
  is_daily: boolean;
  generated_at: string;
}

export interface GoalRecommendation {
  id: string;
  user_id: string;
  recurrence_type: GoalRecurrence;
  outfit_brief: string | null;
  full_text: string | null;
  generated_at: string;
}

// ── Items ─────────────────────────────────────────────────────────────────────

export interface Item {
  id: string;
  user_id: string;
  type: ItemType;
  title: string;
  description: string | null;   // encriptado en BD, desencriptado en app
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  add_to_calendar: boolean;
  status: ItemStatus;
  google_event_id: string | null;
  notion_page_id: string | null;
  notion_url: string | null;
  priority: Priority | null;
  effort: Effort | null;
  task_status: TaskStatus;
  categories: Category[];
  outfit_suggestion: string | null;
  location: string | null;      // encriptado en BD, desencriptado en app
  source: ItemSource;
  meet_link: string | null;
  recurrence_days: number[];
  recurrence_start_time: string | null;
  recurrence_end_time: string | null;
  created_at: string;
  updated_at: string;
}

// ── Goals ─────────────────────────────────────────────────────────────────────

export type GoalRecurrence = "none" | "daily" | "weekly" | "monthly";
export type GoalStatus = "active" | "completed" | "archived";

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;   // encriptado en BD, desencriptado en app
  due_date: string | null;      // solo para type 'none' (meta única con fecha límite)
  recurrence_type: GoalRecurrence;
  status: GoalStatus;
  categories: Category[];
  created_at: string;
  updated_at: string;
}

export interface GoalItem {
  id: string;
  goal_id: string;
  title: string;                // encriptado en BD, desencriptado en app
  completed: boolean;
  completed_at: string | null;
  reset_at: string | null;
  order_index: number;
  created_at: string;
}

export interface CreateGoalInput {
  title: string;
  description?: string;
  due_date?: string;
  recurrence_type: GoalRecurrence;
  categories?: Category[];
}

export interface CreateGoalItemInput {
  title: string;
  order_index?: number;
}

export type PreferredTransport = "car" | "bike" | "public_transport" | "walking";

export type Gender = "masculino" | "femenino" | "no_binario" | "prefiero_no_decir";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  age: number | null;
  gender: Gender | null;
  timezone: string;
  notion_database_id: string | null;
  location: string | null;
  preferred_transport: PreferredTransport | null;
  extra_buffer_minutes: number;
  theme: "light" | "dark" | null;
  wake_time: string;
  sleep_time: string;
  created_at: string;
}

export type IntegrationProvider = "google" | "notion";

export interface Integration {
  id: string;
  user_id: string;
  provider: IntegrationProvider;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  workspace_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateItemInput {
  type: ItemType;
  title: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  all_day?: boolean;
  add_to_calendar?: boolean;
  priority?: Priority;
  effort?: Effort;
  task_status?: TaskStatus;
  categories?: Category[];
  location?: string;
  recurrence_days?: number[];
  recurrence_start_time?: string;
  recurrence_end_time?: string;
}

export interface FreeSlot {
  date: string; // YYYY-MM-DD
  free: boolean;
  free_blocks: { start: string; end: string }[];
}
