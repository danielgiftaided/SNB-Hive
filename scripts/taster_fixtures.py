"""Read-only stand-in for the private lifetime-eligibility RPC in UI fixtures."""
def taster_availability(rows, member, claimed=()):
    member_id = member.get('p_member_id')
    email = str(member.get('p_member_email') or '').strip().lower()
    consumed = set()
    resumable = set()
    for row in rows:
        mine = (member_id and row.get('user_id') == member_id) or (email and str(row.get('email') or '').strip().lower() == email)
        plan = str(row.get('plan') or '').lower()
        completed = row.get('status') in ['paid', 'confirmed'] or (
            row.get('status') in ['pending_payment', 'cancelled'] and str(row.get('gocardless_payment_id') or '').startswith('PM'))
        if mine and plan == 'taster (gocardless)' and row.get('status') in ['pending_checkout', 'pending_payment'] and not row.get('gocardless_payment_id'):
            resumable.add(row.get('session_id'))
        elif mine and ('taster' in plan or (row.get('session_id') == 'zumba' and completed and ('pay as you go' in plan or 'membership' in plan))):
            consumed.add(row.get('session_id'))
    unavailable = (set(claimed) - resumable) | consumed
    return [dict(session_id=session, eligible=session not in unavailable) for session in ['boxfit', 'zumba']]
