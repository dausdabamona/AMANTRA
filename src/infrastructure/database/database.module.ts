/**
 * AMANTRA - Database Module
 *
 * NestJS module for PostgreSQL database connection management.
 * Provides connection pool injection throughout the application.
 *
 * Configuration (Environment Variables):
 * - DATABASE_URL: PostgreSQL connection string
 * - DATABASE_POOL_MIN: Minimum pool size (default: 2)
 * - DATABASE_POOL_MAX: Maximum pool size (default: 10)
 *
 * @module infrastructure/database
 */

import { Module, Global, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool, PoolConfig } from 'pg';

/**
 * Injection token for PostgreSQL Pool
 */
export const PG_POOL = 'PG_POOL';

/**
 * Decorator for injecting the database pool
 */
export const InjectPool = () => Inject(PG_POOL);

/**
 * Database pool factory
 */
const databasePoolFactory = {
  provide: PG_POOL,
  inject: [ConfigService],
  useFactory: async (configService: ConfigService): Promise<Pool> => {
    const logger = new Logger('DatabaseModule');

    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    const poolMin = configService.get<number>('DATABASE_POOL_MIN', 2);
    const poolMax = configService.get<number>('DATABASE_POOL_MAX', 10);

    const poolConfig: PoolConfig = {
      connectionString,
      min: poolMin,
      max: poolMax,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      allowExitOnIdle: false,
    };

    const pool = new Pool(poolConfig);

    // Test connection
    try {
      const client = await pool.connect();
      const result = await client.query('SELECT NOW() as now');
      client.release();

      logger.log(`Database connected: ${result.rows[0].now}`);
      logger.log(`Pool config: min=${poolMin}, max=${poolMax}`);
    } catch (error) {
      logger.error(`Database connection failed: ${error}`);
      throw error;
    }

    // Error handling
    pool.on('error', (err) => {
      logger.error(`Unexpected database pool error: ${err.message}`);
    });

    pool.on('connect', () => {
      logger.debug('New client connected to database');
    });

    return pool;
  },
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [databasePoolFactory],
  exports: [PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Closing database pool...');
    await this.pool.end();
    this.logger.log('Database pool closed');
  }
}

/**
 * Transaction helper for executing queries within a transaction
 */
export async function withTransaction<T>(
  pool: Pool,
  callback: (client: import('pg').PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
