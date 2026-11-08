/* Saved property details: the Home Loan page keeps the last LINZ lookup and the
   values read off a rates notice, so it doesn't look them up (or spend an AI use
   re-reading the notice) every time it opens.

   They include the address, title and legal description, so Fennec's server
   encrypts them like the home address (see backend/src/services/propertyStore.ts),
   and the database refuses anything that isn't encrypted.

   Safe to run more than once. The code works before this is run; it just
   doesn't save anything until it is. */

begin;

alter table public.home_loan add column if not exists property_details text;

drop trigger if exists home_loan_encrypted_fields on public.home_loan;
create trigger home_loan_encrypted_fields
  before insert or update on public.home_loan
  for each row execute function public.require_encrypted_fields('address', 'property_details');

commit;
