/**
 * src/storage.js — Supabase adapter
 *
 * Replaces the localStorage version. Bookings and user accounts now live
 * in your shared Supabase database so all devices see the same data.
 *
 * Sessions (who is currently logged in) stay in localStorage — each
 * device manages its own login state, which is correct behaviour.
 *
 * Requires:
 *   VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY set in Vercel
 *   environment variables (Settings → Environment Variables).
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

/* ── column name mapping ──────────────────────────────────────────────
   JS objects use camelCase. The database columns use snake_case.
   These maps translate between the two automatically.
   ──────────────────────────────────────────────────────────────────── */
const TO_SNAKE = {
  passwordHash: "password_hash",
  createdAt:    "created_at",
  sessionId:    "session_id",
  sessionName:  "session_name",
  userId:       "user_id",
};
const TO_CAMEL = Object.fromEntries(
  Object.entries(TO_SNAKE).map(([k, v]) => [v, k])
);

function toSnake(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[TO_SNAKE[k] || k] = v;
  return out;
}
function toCamel(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[TO_CAMEL[k] || k] = v;
  return out;
}

/* ── localStorage helpers (session only) ─────────────────────────── */
function localGet(key) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch { return null; }
}
function localSet(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function localRemove(key) {
  localStorage.removeItem(key);
}

/* ── main storage adapter ─────────────────────────────────────────── */
const storage = {

  async get(key) {

    // Login session — per device, stays in localStorage
    if (key === "snb_session") return localGet(key);

    // User accounts — from Supabase
    if (key === "snb_users") {
      const { data, error } = await supabase
        .from("users")
        .select("*");
      if (error) {
        console.error("[storage] get users:", error.message);
        return [];
      }
      return (data || []).map(toCamel);
    }

    // Bookings — from Supabase
    if (key === "bookings") {
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[storage] get bookings:", error.message);
        return [];
      }
      return (data || []).map(toCamel);
    }

    return null;
  },

  async set(key, value) {

    // Login session — stays in localStorage
    if (key === "snb_session") {
      localSet(key, value);
      return;
    }

    // User accounts — upsert into Supabase
    // (only ever called when registering a new user, so this is safe)
    if (key === "snb_users") {
      const rows = (Array.isArray(value) ? value : [value]).map(toSnake);
      const { error } = await supabase.from("users").upsert(rows);
      if (error) console.error("[storage] set users:", error.message);
      return;
    }

    // Bookings — upsert the full array into Supabase
    // (upsert uses the id column to decide insert vs update,
    //  so adding a booking and updating a status both work correctly)
    if (key === "bookings") {
      if (!value || value.length === 0) return;
      const rows = value.map(toSnake);
      const { error } = await supabase.from("bookings").upsert(rows);
      if (error) console.error("[storage] set bookings:", error.message);
      return;
    }
  },

  async remove(key) {
    // Only session sign-out needs removing
    if (key === "snb_session") localRemove(key);
  },

};

export default storage;
