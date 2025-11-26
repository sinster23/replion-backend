// backend/src/app.ts
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import automationRoutes from './routes/automation.routes';
import integrationRoutes from './routes/integration.routes';
import keywordRoutes from './routes/keyword.routes';
import responseRoutes from './routes/response.routes';
import webhookRoutes from './routes/webhook.routes';
import bodyParser from "body-parser";

dotenv.config();

const app: Application = express();

app.use('/webhooks/instagram', bodyParser.json({
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString();
  },
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Instagram Automation SaaS API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Debug middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use('/webhooks', webhookRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/keywords', keywordRoutes);
app.use('/api/responses', responseRoutes);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl,
  });
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

export default app;