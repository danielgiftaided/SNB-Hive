/**
 * Storage adapter — localStorage version
 *
 * Works immediately with zero setup. Data is per-browser/device, which is
 * fine for testing and solo use. For a real booking system where bookings
 * and capacity need to sync across all customers and your admin dashboard,
 * follow the Supabase upgrade instructions in README.md.
 *
 * The API is async so swapping to Supabase only requires editing this file
 * — App.jsx does not need to change.
 */
const storage = {
  async get(key) {
    try {
      const val = localStorage.getItem(key);
      return val !== null ? JSON.parse(val) : null;
    } catch { return null; }
  },

  async set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error("[storage] set failed:", e);
    }
  },

  async remove(key) {
    localStorage.removeItem(key);
  },
};

export default storage;

/* ─────────────────────────────────────────────────────────────────────
   SUPABASE ADAPTER (uncomment and replace the above once you've done
   the Supabase setup in README.md)
   ─────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

const storage = {
  // users
  async getUsers() {
    const { data } = await supabase.from("users").select("*");
    return data || [];
  },
  async upsertUser(user) {
    await supabase.from("users").upsert(user);
  },

  // sessions (still localStorage — sessions are per-device by design)
  async get(key)         { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : null; } catch { return null; } },
  async set(key, value)  { localStorage.setItem(key, JSON.stringify(value)); },
  async remove(key)      { localStorage.removeItem(key); },

  // bookings
  async getBookings() {
    const { data } = await supabase.from("bookings").select("*").order("created_at", { ascending: false });
    return data || [];
  },
  async upsertBooking(booking) {
    await supabase.from("bookings").upsert(booking);
  },
  async updateBookingStatus(id, status) {
    await supabase.from("bookings").update({ status }).eq("id", id);
  },
};

export default storage;
*/
