import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import dotenv from 'dotenv';
import { requireAuth } from '../middleware/auth';
import { credentialsErrorResponse } from '../services/akahuCredentials';
import { runAkahuSync, SyncError } from '../services/akahuSync';
dotenv.config();

const router = Router();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!,
  { realtime: { transport: ws as any } }
);

// POST /api/akahu/sync — makes Akahu the source of truth for the user's broker
// holdings and KiwiSaver balance. The logic lives in services/akahuSync so the
// scheduled background sync runs exactly the same code.
//
// Body: { preview?: boolean, removeUnmatched?: boolean }
router.post('/sync', requireAuth, async (req: any, res) => {
  try {
    const result = await runAkahuSync(supabase, req.user.id, req.isPremium, {
      preview: req.body?.preview === true,
      removeUnmatched: req.body?.removeUnmatched === true,
    });
    res.json(result);
  } catch (e: any) {
    if (e instanceof SyncError) return res.status(e.status).json(e.body);
    return credentialsErrorResponse(res, e);
  }
});

export default router;
