import { MIX_MATCH_CLASS_IDS, mixMatchDates, mixMatchMonths } from "../supabase/functions/_shared/mix-match.ts";

export default function MixMatchDates({ month, selection, now, onMonthChange, onSelectionChange, fixedMonth = false }) {
  const months = fixedMonth ? (mixMatchMonths(now).includes(month) ? [month] : []) : mixMatchMonths(now);
  function toggle(id, date) {
    const chosen = selection[id];
    onSelectionChange({ ...selection, [id]:chosen.includes(date) ? chosen.filter(value => value !== date) : [...chosen, date] });
  }
  return <div className="flex flex-col gap-4" role="group" aria-label="Mix & Match lesson dates">
    <p className="text-sm text-stone-600">Choose two Zumba and two BoxFit classes in the same month. Four classes for £35.</p>
    {months.length ? <>
      <label className="text-sm font-medium text-stone-700">Membership month
        <select aria-label="Membership month" disabled={fixedMonth} value={month} onChange={event => onMonthChange(event.target.value)} className="mt-1 block w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm">
          {months.map(value => <option key={value} value={value}>{new Intl.DateTimeFormat("en-GB", { month:"long", year:"numeric", timeZone:"Europe/London" }).format(new Date(`${value}-01T12:00:00Z`))}</option>)}
        </select>
      </label>
      {MIX_MATCH_CLASS_IDS.map(id => <fieldset key={id} className="rounded-xl border border-stone-200 p-3.5">
        <legend className="px-1 text-sm font-medium text-stone-700">{id === "zumba" ? "Zumba" : "BoxFit"} — choose 2 dates</legend>
        <p className="mb-2 text-xs text-stone-500" role="status">{selection[id].length} of 2 selected</p>
        <div className="flex flex-col gap-2">
          {mixMatchDates(id, month, now).map(date => <label key={date} className="flex items-center gap-2.5 rounded-lg bg-stone-50 px-3 py-2 text-sm cursor-pointer">
            <input type="checkbox" value={date} checked={selection[id].includes(date)} disabled={selection[id].length >= 2 && !selection[id].includes(date)} onChange={() => toggle(id, date)}/>
            <span>{new Intl.DateTimeFormat("en-GB", { weekday:"long", day:"numeric", month:"long", year:"numeric", timeZone:"Europe/London" }).format(new Date(`${date}T12:00:00Z`))}</span>
          </label>)}
        </div>
      </fieldset>)}
    </> : <p className="text-sm text-stone-500">There are not enough upcoming dates for two classes of each type in this month. Please contact Shams for help.</p>}
  </div>;
}
