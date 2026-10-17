import assert from 'node:assert/strict';
import { MIX_MATCH_PLAN, MIX_MATCH_AMOUNT, mixMatchMonths, mixMatchDates, mixMatchSelectionIssue, mixMatchBookingIssue } from '../supabase/functions/_shared/mix-match.ts';
const now = new Date('2026-10-17T12:00:00Z');
assert.equal(MIX_MATCH_AMOUNT,3500);
assert.deepEqual(mixMatchMonths(now),['2026-10','2026-11']);
assert.deepEqual(mixMatchDates('zumba','2026-10',now),['2026-10-23','2026-10-30']);
assert.deepEqual(mixMatchDates('boxfit','2026-10',now),['2026-10-22','2026-10-29']);
assert.deepEqual(mixMatchDates('zumba','2026-11',now),['2026-11-06','2026-11-13','2026-11-20','2026-11-27']);
assert.deepEqual(mixMatchDates('boxfit','2026-11',now),['2026-11-05','2026-11-12','2026-11-19','2026-11-26']);
assert.equal(mixMatchDates('zumba','2026-11',now).length+mixMatchDates('boxfit','2026-11',now).length,8,'show all eight dates in a four-week month');
assert.equal(mixMatchSelectionIssue({zumba:['2026-11-20','2026-11-27'],boxfit:['2026-11-19','2026-11-26']},'2026-11',now),null,'the last two weeks of the selected month must be bookable before the rolling class window reaches them');
assert.equal(mixMatchDates('zumba','2027-01',new Date('2026-12-17T12:00:00Z')).length,5,'a five-occurrence month must include its fifth date');
assert.deepEqual(mixMatchDates('boxfit','2026-09',new Date('2026-09-01T12:00:00Z')),[],'never invent classes before launch');
assert.deepEqual(mixMatchMonths(new Date('2026-12-31T23:30:00Z')),['2027-01']);
const selection={zumba:['2026-10-23','2026-10-30'],boxfit:['2026-10-22','2026-10-29']};
assert.equal(mixMatchSelectionIssue(selection,'2026-10',now),null);
for(const invalid of [
  {...selection,zumba:[]}, {...selection,zumba:['2026-10-23']}, {...selection,zumba:['2026-10-23','2026-10-23']},
  {...selection,zumba:['2026-10-16','2026-10-23']}, {...selection,zumba:['2026-10-23','2026-11-06']},
  {...selection,boxfit:['2026-10-20','2026-10-27']},
  {zumba:['2026-10-09','2026-10-16','2026-10-23'],boxfit:['2026-10-22']},
  {zumba:['2026-10-09','2026-10-16','2026-10-23','2026-10-30'],boxfit:[]},
]) assert.ok(mixMatchSelectionIssue(invalid,'2026-10',now));
assert.ok(mixMatchSelectionIssue(selection,'2026-11',now));
assert.ok(mixMatchSelectionIssue(selection,'not-a-month',now));
const rows=Object.entries(selection).flatMap(([id,dates])=>dates.map(date=>({id:id+'-'+date,session_id:id,booking_date:date,plan:MIX_MATCH_PLAN,user_id:'member',email:'member@example.test',amount:0})));
rows[0].amount=35;
assert.equal(mixMatchBookingIssue(rows[0],rows,now),null);
for(const changed of [
  rows.slice(0,3), [...rows,rows[0]], rows.map((row,index)=>index===3?{...row,id:rows[0].id}:row),
  rows.map((row,index)=>index===3?{...row,user_id:'other'}:row),
  rows.map((row,index)=>index===3?{...row,email:'other@example.test'}:row),
  rows.map((row,index)=>index===3?{...row,session_id:'yoga'}:row),
  rows.map((row,index)=>index===0?{...row,amount:5}:row),
  rows.map((row,index)=>index===1?{...row,amount:-1}:row),
  rows.map((row,index)=>index===0?{...row,amount:'invalid'}:row),
  rows.map((row,index)=>index===3?{...row,plan:'Membership - 1 class'}:row),
]) assert.ok(mixMatchBookingIssue(changed[0],changed,now));
const before=new Date('2026-10-22T12:59:59Z'),after=new Date('2026-10-22T13:00:00Z');
assert.equal(mixMatchSelectionIssue(selection,'2026-10',before),null,'a class remains eligible until its London finish');
assert.ok(mixMatchSelectionIssue(selection,'2026-10',after),'the month stops being available when fewer than two BoxFit dates remain');
assert.deepEqual(mixMatchMonths(new Date('2026-10-30T13:00:00Z')),['2026-11']);
console.log('PASS £35 tariff; exactly 2+2, one calendar month, full calendar-month dates and London class finish; rejects 3:1/4:0, duplicates, past/wrong dates, mixed members and altered prices');
