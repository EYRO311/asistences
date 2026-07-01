export type ItemType = "compromiso" | "personal" | "evento";

export type ItemStatus = "draft" | "syncing" | "confirmed" | "failed" | "cancelled";

export type Priority = "alta" | "media" | "baja";
export type Effort = "pequeno" | "media" | "grande";
export type TaskStatus = "sin_empezar" | "en_curso" | "listo";
export type Category = "Trabajo" | "Escuela" | "Cursos extras" | "Personal" | "Salud" | "Hogar" | "Otro";
export type ItemSource = "app" | "google_sync" | "notion_sync";

export interface TravelModeEstimate {
  minutes: number;
  leaveMinutesBefore: number;
}

export interface RideshareEstimate {
  minutes: number;
  leaveMinutesBefore: number;
  /** Rango de costo estimado en MXN [mín, máx] — orientativo, varía por ciudad y hora. */
  costRangeMXN: [number, number];
}

export interface TravelEstimate {
  distanceKm: number;
  car: TravelModeEstimate;
  bike: TravelModeEstimate;
  publicTransport: TravelModeEstimate;
  rideshare?: RideshareEstimate;
}

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
}

export interface Item {
  id: string;
  user_id: string;
  type: ItemType;
  title: string;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  add_to_calendar: boolean;
  status: ItemStatus;
  google_event_id: string | null;
  notion_page_id: string | null;
  notion_url: string | null;
  due_date: string | null;
  priority: Priority | null;
  effort: Effort | null;
  task_status: TaskStatus;
  categories: Category[];
  outfit_suggestion: string | null;
  location: string | null;
  source: ItemSource;
  cached_recommendation: CachedRecommendation | null;
  recurrence_days: number[]; // 1=lunes ... 7=domingo
  recurrence_start_time: string | null; // "HH:mm"
  recurrence_end_time: string | null; // "HH:mm"
  created_at: string;
  updated_at: string;
}

export type PreferredTransport = "car" | "bike" | "public_transport" | "walking";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  timezone: string;
  notion_database_id: string | null;
  location: string | null;
  preferred_transport: PreferredTransport | null;
  extra_buffer_minutes: number;
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
  due_date?: string;
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
