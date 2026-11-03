import Link from 'next/link'
import { FoxIcon } from '@/components/shared/FoxIcon'

export const metadata = { title: 'FAQ — Fennec' }
// The list lives in the backend (services/faq.ts) so the Fennec chat knows the same answers.
export const revalidate = 600

interface FaqTopic { topic: string; items: { q: string; a: string }[] }

async function loadFaq(): Promise<FaqTopic[] | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/faq`, { next: { revalidate } })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

export default async function FaqPage() {
  const faq = await loadFaq()
  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', padding: '0 0 80px' }}>
      <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)', padding: '16px 24px' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none', color: 'inherit' }}>
          <FoxIcon size={24} />
          <span style={{ fontWeight: 800, fontSize: 15, fontFamily: 'Plus Jakarta Sans, sans-serif' }}>Fennec</span>
        </Link>
      </div>

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 16px' }}>
        <h1 style={{ fontSize: 30, fontWeight: 800, marginBottom: 8 }}>Questions and answers</h1>
        <p style={{ color: 'var(--text2)', fontSize: 14, marginBottom: 32 }}>
          Can&apos;t find it here? Signed in, ask the fox in the bottom-right corner, or press Feedback.
        </p>

        {!faq && <p style={{ color: 'var(--text2)', fontSize: 14 }}>The questions couldn&apos;t load just now. Please try again in a minute.</p>}

        {faq?.map(t => (
          <section key={t.topic} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10 }}>{t.topic}</h2>
            {t.items.map(i => (
              <details key={i.q} style={{ borderTop: '1px solid var(--border)', padding: '12px 0' }}>
                <summary style={{ cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{i.q}</summary>
                <p style={{ color: 'var(--text2)', fontSize: 14, lineHeight: 1.7, marginTop: 8 }}>{i.a}</p>
              </details>
            ))}
          </section>
        ))}

        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--border)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/privacy" style={{ color: 'var(--primary)', fontSize: 14, textDecoration: 'none' }}>Privacy Policy</Link>
          <Link href="/terms" style={{ color: 'var(--primary)', fontSize: 14, textDecoration: 'none' }}>Terms of Service</Link>
          <Link href="/login" style={{ color: 'var(--text2)', fontSize: 14, textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
