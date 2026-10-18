import type { SupabaseClient } from '@supabase/supabase-js';

// Cross-checks Email Inbox items against the bank. An unpaid item is marked
// settled when a transaction on one of the user's own accounts:
//   - goes the right way (money out for a bill, money in for an invoice you sent)
//   - is for the same amount (to the cent; with or without GST added), or
//     mentions the item's reference (e.g. "INV-0164") in its description
//   - lands between 3 days before the email and 60 days after the due date
// Each transaction settles at most one item. Invoices created in Fennec's own
// Invoices page that are marked paid there also settle the matching email.

const DAY = 86_400_000;
const shiftDate = (iso: string, days: number) => new Date(new Date(iso + 'T00:00:00Z').getTime() + days * DAY).toISOString().slice(0, 10);
const gap = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / DAY;
const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

export async function reconcileInboxItems(supabase: SupabaseClient, userId: string): Promise<number> {
  const { data: items, error } = await supabase
    .from('gmail_scanned_items')
    .select('id, direction, amount, gst, reference, due_date, email_date, scanned_at')
    .eq('user_id', userId).eq('paid', false).eq('dismissed', false);
  if (error || !items?.length) return 0; // also covers the migration not having been run yet

  const today = new Date().toISOString().slice(0, 10);
  const anchor = (i: any) => i.email_date || String(i.scanned_at).slice(0, 10);
  const earliest = items.map(anchor).sort()[0];

  const [{ data: accounts }, { data: matched }, { data: invoices }] = await Promise.all([
    supabase.from('fin_accounts').select('id').eq('user_id', userId),
    supabase.from('gmail_scanned_items').select('matched_transaction_id').eq('user_id', userId).not('matched_transaction_id', 'is', null),
    supabase.from('business_invoices').select('invoice_number, status').eq('user_id', userId).eq('status', 'paid'),
  ]);
  const accountIds = (accounts ?? []).map((a: any) => a.id);
  const used = new Set((matched ?? []).map((m: any) => m.matched_transaction_id));
  const paidInvoiceRefs = new Set((invoices ?? []).map((i: any) => norm(i.invoice_number)).filter(Boolean));

  let txs: any[] = [];
  if (accountIds.length) {
    const { data } = await supabase.from('fin_transactions')
      .select('id, date, amount, description')
      .in('account_id', accountIds)
      .gte('date', shiftDate(earliest, -3))
      .limit(5000);
    txs = data ?? [];
  }

  let settled = 0;
  for (const item of [...items].sort((a, b) => anchor(a).localeCompare(anchor(b)))) {
    const receivable = item.direction === 'receivable';
    const ref = norm(item.reference);

    // An invoice you raised in Fennec and marked paid there.
    if (receivable && ref && paidInvoiceRefs.has(ref)) {
      await supabase.from('gmail_scanned_items')
        .update({ paid: true, matched_at: new Date().toISOString() }).eq('id', item.id);
      settled++;
      continue;
    }

    const amount = Number(item.amount);
    const withGst = item.gst ? amount + Number(item.gst) : null;
    const from = shiftDate(anchor(item), -3);
    const to = (() => { const end = shiftDate(item.due_date || anchor(item), 60); return end < today ? end : today; })();
    const target = item.due_date || anchor(item);

    const candidates = txs.filter(t => {
      if (used.has(t.id) || t.date < from || t.date > to) return false;
      const amt = Number(t.amount);
      if (receivable ? amt <= 0 : amt >= 0) return false;
      const abs = Math.abs(amt);
      const amountHit = amount > 0 && (Math.abs(abs - amount) <= 0.01 || (withGst !== null && Math.abs(abs - withGst) <= 0.01));
      const refHit = ref.length >= 4 && norm(t.description).includes(ref);
      return amountHit || refHit;
    });
    if (!candidates.length) continue;

    // Prefer a reference match, then the date closest to when it was due.
    const best = candidates.sort((a, b) => {
      const ra = ref.length >= 4 && norm(a.description).includes(ref) ? 0 : 1;
      const rb = ref.length >= 4 && norm(b.description).includes(ref) ? 0 : 1;
      return ra - rb || gap(a.date, target) - gap(b.date, target);
    })[0];

    const { error: upErr } = await supabase.from('gmail_scanned_items').update({
      paid: true,
      matched_transaction_id: best.id,
      paid_date: best.date,
      matched_at: new Date().toISOString(),
    }).eq('id', item.id);
    if (!upErr) {
      used.add(best.id);
      settled++;
    }
  }
  return settled;
}
