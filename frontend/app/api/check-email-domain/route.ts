import { promises as dns } from 'dns'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Can this domain receive email at all? Only the domain is sent here, never the
// full address, and the lookup runs on our server rather than a third party.
// Anything inconclusive counts as "yes": a DNS hiccup must never block a sign-up.

const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/

export async function GET(request: NextRequest) {
  const domain = (request.nextUrl.searchParams.get('domain') ?? '').toLowerCase()
  if (!DOMAIN.test(domain) || domain.length > 253) return NextResponse.json({ canReceive: false })

  try {
    const mx = await dns.resolveMx(domain)
    return NextResponse.json({ canReceive: mx.length > 0 && !mx.every(r => r.exchange === '') })
  } catch (e: any) {
    if (e?.code !== 'ENOTFOUND' && e?.code !== 'ENODATA') return NextResponse.json({ canReceive: true })
  }
  // No MX record: mail falls back to the domain's own address, if it has one.
  try {
    return NextResponse.json({ canReceive: (await dns.resolve4(domain)).length > 0 })
  } catch (e: any) {
    return NextResponse.json({ canReceive: e?.code !== 'ENOTFOUND' && e?.code !== 'ENODATA' })
  }
}
