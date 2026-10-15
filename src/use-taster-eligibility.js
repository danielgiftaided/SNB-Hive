import { useEffect, useState } from "react";
import { supabase } from "./storage.js";

// The private lifetime claims survive cancelled/deleted bookings. Do not show
// an offer until the server has checked those claims as well as loaded history.
export function useTasterEligibility(user, bookings) {
  const [state, setState] = useState({ key: "", available: [] });
  const key = user ? JSON.stringify([user.id, user.email]) : "";
  useEffect(() => {
    if (!user) return;
    let active = true;
    async function refresh() {
      try {
        const { data, error } = await supabase.rpc("class_taster_eligibility", {
          p_member_id: user.id, p_member_email: user.email,
        });
        if (active) setState({ key, available: error || !Array.isArray(data) ? [] :
          data.filter(row => row.eligible === true).map(row => row.session_id) });
      } catch {
        if (active) setState({ key, available: [] });
      }
    }
    refresh();
    return () => { active = false; };
  }, [key, bookings]);
  return state.key === key ? state.available : [];
}
