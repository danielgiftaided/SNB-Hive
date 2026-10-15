import { useEffect, useId, useRef, useState } from "react";
import CancellationPolicyNotice from "./CancellationPolicyNotice.jsx";

function CheckoutPolicyDialog({ onDecision }) {
  const dialog = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    return () => {
      element.close();
      document.body.style.overflow = overflow;
    };
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onDecision(false); }}
      className="ff-body m-auto w-[calc(100%-2rem)] max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-xl backdrop:bg-black/40">
      <h2 id={titleId} className="ff-display mb-4 text-xl font-semibold text-stone-800">Cancellation Policy</h2>
      <CancellationPolicyNotice showTitle={false}/>
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button autoFocus type="button" onClick={() => onDecision(false)} className="rounded-full border border-stone-200 px-4 py-2.5 text-sm text-stone-600">Back</button>
        <button type="button" onClick={() => onDecision(true)} className="rounded-full bg-[#4B5D4E] px-4 py-2.5 text-sm font-semibold text-white">Continue to GoCardless</button>
      </div>
    </dialog>
  );
}

// Ask before saving an attempt or starting payment. Dismissal leaves the
// booking form intact and creates no booking or provider request.
export function useCheckoutPolicy() {
  const [open, setOpen] = useState(false);
  const pending = useRef(null);
  const trigger = useRef(null);
  useEffect(() => () => { pending.current?.(false); pending.current = null; }, []);
  function requestPolicy() {
    if (pending.current) return Promise.resolve(false);
    trigger.current = document.activeElement;
    return new Promise(resolve => { pending.current = resolve; setOpen(true); });
  }
  function decide(accepted) {
    const resolve = pending.current;
    pending.current = null;
    setOpen(false);
    resolve?.(accepted);
    if (!accepted) requestAnimationFrame(() => { if (trigger.current?.isConnected) trigger.current.focus(); });
  }
  return { requestPolicy, policyDialog: open ? <CheckoutPolicyDialog onDecision={decide}/> : null };
}
