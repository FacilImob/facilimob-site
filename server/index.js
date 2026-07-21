import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import authRoutes from './routes/auth.js';
import configRoutes from './routes/config.js';
import simulationsRoutes from './routes/simulations.js';
import { pageAuth } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));
app.use(
  session({
    name: 'facilimob.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7200000
    }
  })
);
app.use(pageAuth);
app.use('/vendor/html2canvas', express.static(path.join(__dirname, '..', 'node_modules', 'html2canvas', 'dist')));
app.use('/vendor/jspdf', express.static(path.join(__dirname, '..', 'node_modules', 'jspdf', 'dist')));
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/simulations', simulationsRoutes);

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota nao encontrada.' });
});

app.listen(port, () => {
  console.log(`Simulador Facil Imob rodando em http://localhost:${port}`);
});
