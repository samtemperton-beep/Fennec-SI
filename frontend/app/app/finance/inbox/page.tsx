import { redirect } from 'next/navigation'

// The Email Inbox now lives on the Bills page. Kept so old links, bookmarks
// and the Gmail sign-in return (?gmail_connected=1) still land in the right place.
export default async function InboxRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(await searchParams)) {
    if (typeof v === 'string') params.set(k, v)
  }
  const qs = params.toString()
  redirect(`/app/finance/bills${qs ? `?${qs}` : ''}`)
}
