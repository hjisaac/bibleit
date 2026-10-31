import fs from 'node:fs';
import path from 'node:path';
import pino from 'pino';
import * as Sentry from '@sentry/node';

// Redact sensitive keys and authorization headers across all logs.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  '*.password',
  '*.secret',
  '*.token',
  '*.apiKey',
  '*.key',
];

const logDir = process.env.LOG_DIR;
let destination: pino.DestinationStream | undefined = undefined;

if (logDir) {
  fs.mkdirSync(logDir, { recursive: true });
  destination = pino.destination({
    dest: path.join(logDir, 'api.log'),
    sync: false,
    mkdir: true,
  });
}

const isProduction = process.env.NODE_ENV === 'production';

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
    redact: {
      paths: REDACT_PATHS,
      censor: '[REDACTED]',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  destination || (isProduction
    ? process.stdout
    : pino.transport({
        target: 'pino-pretty',
        options: { colorize: true, ignore: 'pid,hostname' },
      })),
);

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['cookie'];
        delete event.request.headers['set-cookie'];
        delete event.request.headers['x-api-key'];
      }
      return event;
    },
  });

  logger.info({ environment: process.env.NODE_ENV || 'development' }, 'Sentry crash reporting initialized');
}

export function captureCrash(err: unknown, context?: Record<string, unknown>): void {
  logger.error({ err, ...context }, 'Crash event captured');
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err, { extra: context });
  }
}
