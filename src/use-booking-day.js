import { useEffect, useState } from "react";
import { bookingToday } from "../supabase/functions/_shared/class-config.ts";

// Align updates with minute boundaries, including the exact class finish time.
// Focus/visibility refreshes catch up immediately after a backgrounded tab.
export function useBookingTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer;
    const refresh = () => {
      setNow(new Date());
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 60000 - Date.now() % 60000);
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return now;
}

export function useBookingDay() {
  return bookingToday(useBookingTime());
}
