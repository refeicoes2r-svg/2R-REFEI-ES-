import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { Redis } from '@upstash/redis';

const scrypt = promisify(scryptCallback);
const redisConfigured = () => Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const passwordKey = 'r2:auth:password';

function redisClient() {
  if (!redisConfigured()) throw new Error('Configure o armazenamento de senha persistente na hospedagem.');
  return Redis.fromEnv();
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt:${salt.toString('base64url')}:${derived.toString('base64url')}`;
}

export async function verifyPassword(password, encoded) {
  if (typeof encoded !== 'string') return false;
  const [algorithm, saltText, hashText] = encoded.split(':');
  if (algorithm !== 'scrypt' || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    const actual = await scrypt(String(password), salt, expected.length);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function checkPassword(password) {
  if (!redisConfigured()) return safeEqual(password, process.env.APP_LOGIN_PASSWORD || '');
  const redis = redisClient();
  const stored = await redis.get(passwordKey);
  if (stored) return verifyPassword(password, stored);
  return safeEqual(password, process.env.APP_LOGIN_PASSWORD || '');
}

export async function migratePassword(password) {
  if (!redisConfigured()) return;
  const redis = redisClient();
  const hash = await hashPassword(password);
  await redis.set(passwordKey, hash, { nx: true });
}

export async function savePassword(password) {
  const redis = redisClient();
  await redis.set(passwordKey, await hashPassword(password));
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}