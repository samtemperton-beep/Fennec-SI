import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { requireAuth } from '../middleware/auth';
import { emailAdmins, escapeHtml as esc } from '../services/adminEmail';
import dotenv from 'dotenv';
dotenv.config();

// Bug reports, ideas and Premium requests from the app's Feedback button.
// Emailed to every admin, with the sender as the reply-to address.

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

const KINDS: Record<string, string> = { bug: 'Bug', idea: 'Idea', premium: 'Premium request', other: 'Feedback' };
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;
const PER_HOUR = 10;

// Per-user count for the last hour, so one stuck button can't flood the inbox.
const recent = new Map<string, number[]>();
function allowed(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) || []).filter(t => now - t < 3_600_000);
  if (times.length >= PER_HOUR) return false;
  recent.set(userId, [...times, now]);
  return true;
}

// POST /api/feedback { kind, message, page, screenshot?: { name, type, data (base64) } }
router.post('/', requireAuth, async (req: any, res) => {
  const kind = KINDS[req.body?.kind] ? String(req.body.kind) : 'other';
  const message = String(req.body?.message || '').trim().slice(0, 5000);
  const page = String(req.body?.page || '').slice(0, 300);
  const shot = req.body?.screenshot;
  if (!message && kind !== 'premium') return res.status(400).json({ error: 'Write a short note first.' });
  if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: "Feedback email isn't set up on the server." });
  if (!allowed(req.user.id)) return res.status(429).json({ error: "That's a lot of feedback for one hour. Thank you! Try again a bit later." });

  let attachment: { filename: string; content: Buffer } | null = null;
  if (shot?.data) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(String(shot.type))) return res.status(400).json({ error: 'The screenshot must be an image.' });
    const content = Buffer.from(String(shot.data), 'base64');
    if (content.length > MAX_SCREENSHOT_BYTES) return res.status(400).json({ error: 'The screenshot is over 4 MB.' });
    attachment = { filename: String(shot.name || 'screenshot.png').replace(/[^\w.-]/g, '_').slice(0, 80), content };
  }

  const { data: profile } = await supabase.from('profiles').select('username, subscription_tier').eq('id', req.user.id).maybeSingle();
  const who = profile?.username || req.user.email;
  const error = await emailAdmins(supabase, {
    replyTo: req.user.email,
    subject: `${KINDS[kind]} from ${who}${page ? ` on ${page}` : ''}`,
    html: `<h2>${esc(KINDS[kind])}</h2>
<p><strong>From:</strong> ${esc(who)} (${esc(req.user.email || '')}, ${esc(profile?.subscription_tier || 'free')})<br>
<strong>Page:</strong> ${esc(page || 'unknown')}<br>
<strong>Browser:</strong> ${esc(String(req.headers['user-agent'] || '').slice(0, 200))}</p>
<p style="white-space:pre-wrap">${esc(message || '(no message)')}</p>`,
    attachments: attachment ? [attachment] : undefined,
  });
  if (error) {
    console.error('[feedback] email failed:', error);
    return res.status(502).json({ error: "Couldn't send just now. Please try again." });
  }
  res.json({ ok: true });
});

export default router;
