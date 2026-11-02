import { redirect } from 'next/navigation'

// Settings and Admin moved under /app. Kept so old links and bookmarks still work.
export default function OldPage() {
  redirect('/app/settings')
}
