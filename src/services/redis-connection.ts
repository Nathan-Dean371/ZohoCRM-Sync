import { RedisOptions } from 'ioredis';

// Shared BullMQ/ioredis connection options, sourced from env vars so the
// same code works locally (no auth) and on Railway (password + optional TLS).
export function getRedisConnectionOptions(): RedisOptions {
  const connection: RedisOptions = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    maxRetriesPerRequest: null,
  };

  if (process.env.REDIS_PASSWORD) {
    connection.password = process.env.REDIS_PASSWORD;
  }

  if (process.env.REDIS_TLS === 'true') {
    connection.tls = {};
  }

  return connection;
}
