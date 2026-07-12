/**
 * src/storage.js — Supabase adapter
 *
 * All user accounts and bookings are stored in Supabase so they
 * persist across devices and appear in the admin dashboard.
 *
 * Verification codes and login sessions stay in localStorage
 * because they are intentionally per-device.
 *
 * Requires in Vercel Environment Variables:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ── Column name mapping (JS camelCase ↔ database snake_case) ─────────────────
const SNAKE = {
  passwordHash:    "password_hash",
  createdAt:       "created_at",
  sessionId:       "session_id",
  sessionName:     "session_name",
  userId:          "user_id",
  fitnessType:     "fitness_type",
  sessionsPerWeek: "sessions_per_week",
  classSize:       "class_size",
};
const CAMEL = Object.fromEntries(Object.entries(SNAKE).map(([k, v]) => [v, k]));

const toSnake = obj =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [SNAKE[k] || k, v]));

const toCamel = obj =>
  Object.fromEntries(Object.entries(obj).map(([k, v]) => [CAMEL[k] || k, v]));

// ── localStorage helpers (session + verification codes only) ──────────────────
const localGet    = key => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } };
const localSet    = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };
const localRemove = key => localStorage.removeItem(key);

// ── Main adapter ──────────────────────────────────────────────────────────────
const storage = {

  async get(key) {
    // Login session and verification codes → localStorage (per-device)
    if (key === "snb_session" || key.startsWith("vc_")) return localGet(key);

    // User accounts → Supabase
    if (key === "snb_users") {
      const { data, error } = await supabase.from("users").select("*");
      if (error) { console.error("[storage] get users:", error.message); return []; }
      return (data || []).map(toCamel);
    }

    // Bookings → Supabase
    if (key === "bookings") {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { console.error("[storage] get bookings:", error.message); return []; }
      return (data || []).map(toCamel);
    }

    // Studio hire enquiries → Supabase
    if (key === "studio_hire_enquiries") {
      const { data, error } = await supabase
        .from("studio_hire_enquiries")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) { console.error("[storage] get studio_hire_enquiries:", error.message); return []; }
      return (data || []).map(toCamel);
    }

    return localGet(key);
  },

  async set(key, value) {
    // Login session and verification codes → localStorage
    if (key === "snb_session" || key.startsWith("vc_")) { localSet(key, value); return; }

    // User accounts → upsert into Supabase
    if (key === "snb_users") {
      const rows = (Array.isArray(value) ? value : [value]).map(toSnake);
      const { error } = await supabase.from("users").upsert(rows);
      if (error) console.error("[storage] set users:", error.message);
      return;
    }

    // Bookings → upsert into Supabase
    if (key === "bookings") {
      if (!value?.length) return;
      const rows = value.map(toSnake);
      const { error } = await supabase.from("bookings").upsert(rows);
      if (error) console.error("[storage] set bookings:", error.message);
      return;
    }

    // Studio hire enquiries → upsert into Supabase
    if (key === "studio_hire_enquiries") {
      const rows = (Array.isArray(value) ? value : [value]).map(toSnake);
      const { error } = await supabase.from("studio_hire_enquiries").upsert(rows);
      if (error) console.error("[storage] set studio_hire_enquiries:", error.message);
      return;
    }

    localSet(key, value);
  },

  async remove(key) {
    if (key === "snb_session" || key.startsWith("vc_")) localRemove(key);
  },

};

export default storage;
