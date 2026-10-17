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
import { bookingRowsForUpsert, toCamel, toSnake } from "./storage-shape.js";
import { readBookings } from "./booking-reader.js";
import { MARKETING_CONSENT_VERSION } from "./marketing.js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

// ── Column name mapping (JS camelCase ↔ database snake_case) ─────────────────
// ── localStorage helpers (session + verification codes only) ──────────────────
const localGet    = key => { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } };
const localSet    = (key, val) => { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} };
const localRemove = key => localStorage.removeItem(key);

// ── Main adapter ──────────────────────────────────────────────────────────────
const storage = {

  async createUser(user, choices, referralCode = "") {
    const { error } = await supabase.from("users").insert(toSnake({ ...user,
      marketingEmailOptIn: choices.email === true, marketingWhatsappOptIn: choices.whatsapp === true,
      marketingConsentVersion:MARKETING_CONSENT_VERSION,
      ...(referralCode ? { referral_signup_code:referralCode } : {}),
    }));
    if (error) throw new Error(error.message);
  },

  async getUser(id) {
    const { data, error } = await supabase.from("users").select("id,marketing_email_opt_in,marketing_whatsapp_opt_in,marketing_email_confirmed_at,marketing_consent_updated_at,marketing_consent_version,marketing_consent_source").eq("id", id).single();
    if (error) throw new Error(error.message);
    return toCamel(data);
  },

  async updateMarketingPreferences(id, changes) {
    const { data, error } = await supabase.rpc("save_marketing_preferences", {
      p_member_id:id,
      p_email:typeof changes.marketingEmailOptIn === "boolean" ? changes.marketingEmailOptIn : null,
      p_whatsapp:typeof changes.marketingWhatsappOptIn === "boolean" ? changes.marketingWhatsappOptIn : null,
      p_confirm_email:!!changes.marketingEmailConfirmedAt,
    });
    if (error) throw new Error(error.message);
    return toCamel(data);
  },

  subscribeToBookings(onChange) {
    const channel = supabase
      .channel(`bookings-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, onChange)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  },

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
      return readBookings(supabase);
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
      // Profile/password saves must never replay an old consent snapshot and
      // undo a more recent unsubscribe or a change on another device.
      const rows = (Array.isArray(value) ? value : [value]).map(user =>
        toSnake(Object.fromEntries(Object.entries(user).filter(([field]) => !field.startsWith("marketing") && field !== "referral_signup_code"))));
      const { error } = await supabase.from("users").upsert(rows);
      if (error) { console.error("[storage] set users:", error.message); throw new Error(error.message); }
      return;
    }

    // Bookings → upsert into Supabase
    if (key === "bookings") {
      if (!value?.length) return;
      const rows = bookingRowsForUpsert(value);
      const { error } = await supabase.from("bookings").upsert(rows);
      if (error) { console.error("[storage] set bookings:", error.message); throw new Error(error.message); }
      return;
    }

    // Studio hire enquiries → upsert into Supabase
    if (key === "studio_hire_enquiries") {
      const rows = (Array.isArray(value) ? value : [value]).map(toSnake);
      const { error } = await supabase.from("studio_hire_enquiries").upsert(rows);
      if (error) { console.error("[storage] set studio_hire_enquiries:", error.message); throw new Error(error.message); }
      return;
    }

    localSet(key, value);
  },

  async remove(key) {
    if (key === "snb_session" || key === "snb_welcome_pending" || key.startsWith("vc_")) localRemove(key);
  },

};

export default storage;
export { supabase };
