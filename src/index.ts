/**
 * AMANTRA - Main Application Entry Point
 *
 * Sistem Kontrak Digital, Rekening Penitipan (Escrow),
 * dan Penyelesaian Otomatis berbasis QRIS, Bank API, dan Smart Contract Ledger.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { Pool } from 'pg';
import { createLogger } from './shared/Logger';

// Initialize logger
const logger = createLogger('amantra-main');

async function bootstrap(): Promise<void> {
  logger.info('Starting AMANTRA service...');

  // 1. Initialize Express app
  const app = express();

  // 2. Security middleware
  app.use(helmet());
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));

  // 3. Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'AMANTRA',
      version: process.env.npm_package_version || '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // 4. Initialize database connection
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    min: parseInt(process.env.DATABASE_POOL_MIN || '2'),
    max: parseInt(process.env.DATABASE_POOL_MAX || '10'),
  });

  // Test database connection
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    logger.info('Database connection established');
  } catch (error) {
    logger.error('Failed to connect to database', {
      error: (error as Error).message,
    });
    process.exit(1);
  }

  // 5. API Routes will be registered here
  // app.use('/api/v1/contracts', contractRoutes);
  // app.use('/webhooks/qris', qrisWebhookRoutes);

  // 6. Error handling middleware
  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  });

  // 7. Start server
  const port = parseInt(process.env.PORT || '3000');
  app.listen(port, () => {
    logger.info(`AMANTRA service started on port ${port}`, {
      environment: process.env.NODE_ENV || 'development',
      port,
    });
  });

  // 8. Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down AMANTRA service...');
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Start the application
bootstrap().catch((error) => {
  logger.error('Failed to start AMANTRA service', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});
