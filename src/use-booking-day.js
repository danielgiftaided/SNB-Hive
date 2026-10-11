import { useEffect, useState } from "react";
import { bookingToday } from "../supabase/functions/_shared/class-config.ts";

// Refresh an open screen at London midnight and when returning to the app.
export function useBookingDay() {
  const [today, setToday] = useState(() => bookingToday());
  useEffect(() => {
    const refresh = () => setToday(bookingToday());
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return today;
}
