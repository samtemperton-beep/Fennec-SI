import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

import pricesRouter from './routes/prices';
import aiRouter from './routes/ai';
import newsRouter from './routes/news';
import importRouter from './routes/import';
import alertsRouter from './routes/alerts';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Railway (and most cloud hosts) sit behind a proxy — trust it so
// express-rate-limit can read the real client IP from X-Forwarded-For
app.set('trust proxy', 1);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.some(o => origin.startsWith(o.trim()))) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({ windowMs: 60_000, max: 100 });
app.use('/api/', limiter);

app.use('/api/prices', pricesRouter);
app.use('/api/ai', aiRouter);
app.use('/api/news', newsRouter);
app.use('/api/import', importRouter);
app.use('/api/alerts', alertsRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date() }));

app.listen(PORT, () => console.log(`Fennec SI backend running on :${PORT}`));

export default app;
