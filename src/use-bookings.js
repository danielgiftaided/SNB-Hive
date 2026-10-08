import { useEffect, useRef, useState } from "react";
import storage from "./storage.js";

export function useBookings(enabled) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [loadError, setLoadError] = useState("");
  const refreshRef = useRef(() => {});

  useEffect(() => {
    if (!enabled) {
      setBookings([]);
      setLoading(false);
      setLoadError("");
      return;
    }
    let active = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const next = await storage.get("bookings");
        if (active) { setBookings(next); setLoadError(""); }
      } catch {
        if (active) setLoadError("We couldn't refresh bookings. Any previously loaded bookings are still shown. Please retry.");
      } finally {
        refreshing = false;
        if (active) setLoading(false);
      }
    };
    refreshRef.current = refresh;
    setLoading(true);
    refresh();
    const unsubscribe = storage.subscribeToBookings(refresh);
    const onFocus = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(onFocus, 15000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      active = false;
      refreshRef.current = () => {};
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enabled]);

  return { bookings, setBookings, loading, loadError, reloadBookings: () => refreshRef.current() };
}
