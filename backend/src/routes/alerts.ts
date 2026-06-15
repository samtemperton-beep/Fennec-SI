import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { createClient } from '@supabase/supabase-js';
import { fetchPrices } from '../services/yahoo';
import { Resend } from 'resend';
import ws from 'ws';
import dotenv from 'dotenv';
dotenv.config();

const router = Router();
const resend = new Resend(process.env.RESEND_API_KEY);

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

router.post('/check', requireAuth, async (req, res) => {
  const user = (req as any).user;
  const { data: alerts } = await supabase
    .from('alerts')
    .select('*')
    .eq('user_id', user.id)
    .eq('triggered', false);

  if (!alerts?.length) return res.json({ triggered: [] });

  const tickers = [...new Set(alerts.map(a => a.ticker))];
  const prices = await fetchPrices(tickers);
  const triggered: any[] = [];

  for (const alert of alerts) {
    const price = prices[alert.ticker];
    if (!price) continue;
    const shouldTrigger =
      (alert.type === 'above' && price >= alert.price) ||
      (alert.type === 'below' && price <= alert.price);

    if (shouldTrigger) {
      triggered.push({ ...alert, current_price: price });
      await supabase.from('alerts').update({ triggered: true }).eq('id', alert.id);

      // Send email notification
      const { data: profile } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', user.id)
        .single();

      try {
        await resend.emails.send({
          from: 'Fennec SI <alerts@fennecsi.app>',
          to: user.email,
          subject: `Alert triggered: ${alert.ticker} ${alert.type} $${alert.price}`,
          html: `
            <h2>Fennec SI Alert</h2>
            <p>Hi ${profile?.username || 'there'},</p>
            <p>Your alert for <strong>${alert.ticker}</strong> has been triggered!</p>
            <p>Current price: <strong>$${price}</strong></p>
            <p>Alert condition: ${alert.type} $${alert.price}</p>
            <p><a href="${process.env.FRONTEND_URL}/app/alerts">View your alerts</a></p>
          `,
        });
      } catch {}
    }
  }

  res.json({ triggered });
});

export default router;
