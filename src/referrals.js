const KEY = "snb_signup_referral";
export function normaliseReferralCode(value) { return String(value || "").trim().toUpperCase(); }
export function captureReferralCode() {
  const url = new URL(window.location.href);
  const incoming = normaliseReferralCode(url.searchParams.get("ref"));
  if (incoming && /^HIVE-[A-Z0-9]{10}$/.test(incoming)) {
    try { localStorage.setItem(KEY,incoming); } catch { /* Field still prefills. */ }
    url.searchParams.delete("ref");
    window.history.replaceState(window.history.state,"",`${url.pathname}${url.search}${url.hash}`);
    return incoming;
  }
  try { return normaliseReferralCode(localStorage.getItem(KEY)); } catch { return ""; }
}
export function clearReferralCode() { try { localStorage.removeItem(KEY); } catch { /* No persistent attribution. */ } }
export function referralLink(code) { const url=new URL("/",window.location.origin);url.searchParams.set("ref",code);return url.href; }

const accessKey = memberId => `snb_referral_access_${memberId}`;
export function referralAccess(memberId) { try { return sessionStorage.getItem(accessKey(memberId)) || ""; } catch { return ""; } }
export function saveReferralAccess(memberId,token) { try { sessionStorage.setItem(accessKey(memberId),token); } catch { /* Access lasts for this mounted screen. */ } }
export function clearReferralAccess(memberId) { try { sessionStorage.removeItem(accessKey(memberId)); } catch { /* Storage disabled. */ } }
