/**
 * AMANTRA - Logger Interface & Implementation
 *
 * Structured logging untuk audit trail dan debugging.
 */

import winston from 'winston';

export interface LogContext {
  correlationId?: string;
  contractId?: string;
  userId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
}

export class WinstonLogger implements Logger {
  private logger: winston.Logger;

  constructor(service: string) {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
      ],
    });

    // Add file transport for production
    if (process.env.NODE_ENV === 'production') {
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
        })
      );
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/combined.log',
        })
      );
      // Audit log khusus
      this.logger.add(
        new winston.transports.File({
          filename: 'logs/audit.log',
          level: 'info',
        })
      );
    }
  }

  debug(message: string, context?: LogContext): void {
    this.logger.debug(message, context);
  }

  info(message: string, context?: LogContext): void {
    this.logger.info(message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.logger.warn(message, context);
  }

  error(message: string, context?: LogContext): void {
    this.logger.error(message, context);
  }
}

// Factory function
export function createLogger(service: string): Logger {
  return new WinstonLogger(service);
}
