/**
 * TypeScript interfaces matching the Supabase database schema.
 * These are plain data shapes — no ORM, no generated code.
 */

export interface User {
  id: string; // uuid
  telegram_id: number; // bigint (JS number is safe up to 2^53-1)
  created_at: string; // ISO 8601
  last_active_at: string; // ISO 8601
}

export interface Conversation {
  id: string; // uuid
  user_id: string; // uuid, FK → users.id
  step: string; // current conversation step
  collected_data: Record<string, unknown>; // jsonb
  active_project_id: string | null; // uuid, FK → projects.id
  updated_at: string; // ISO 8601
}

export interface Project {
  id: string; // uuid
  user_id: string; // uuid, FK → users.id
  state: string; // ProjectState value
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export interface ProjectAsset {
  id: string; // uuid
  project_id: string; // uuid, FK → projects.id
  support_type: string; // e.g. "avatar", "banner", "business_card", etc.
  idempotency_key: string; // hash(projectId + supportType + charterVersion)
  status: string; // "pending" | "generating" | "done" | "failed"
  storage_path: string | null; // Supabase Storage path, null until produced
  created_at: string; // ISO 8601
}

export interface BrandProfileRecord {
  id: string; // uuid
  project_id: string; // uuid, FK → projects.id
  profile_data: Record<string, unknown>; // jsonb — serialised BrandProfile
  created_at: string; // ISO 8601
}

export interface GenerationJob {
  id: string; // uuid
  project_id: string; // uuid, FK → projects.id
  step: string; // Inngest step name
  status: string; // "pending" | "running" | "done" | "failed"
  attempts: number; // int
  created_at: string; // ISO 8601
  updated_at: string; // ISO 8601
}

export interface QualityCheck {
  id: string; // uuid
  project_id: string; // uuid, FK → projects.id
  asset_id: string; // uuid, FK → project_assets.id
  result: Record<string, unknown>; // jsonb — QC result payload
  created_at: string; // ISO 8601
}

export interface CostRecord {
  id: string; // uuid
  project_id: string; // uuid, FK → projects.id
  provider: string; // e.g. "rodiumai"
  model: string; // model identifier
  operation: string; // e.g. "image_generation", "vision", "chat"
  declared_cost: number | null; // numeric, in RODI — null if not reported by API
  estimated_cost: number; // numeric, in RODI — always present
  attempts: number; // int
  created_at: string; // ISO 8601
}

export interface DeliveryRecord {
  id: string; // uuid
  project_id: string; // uuid, FK → projects.id
  method: string; // "send_document" | "signed_url"
  storage_path: string; // Supabase Storage path of the delivered ZIP
  delivered_at: string; // ISO 8601
}
