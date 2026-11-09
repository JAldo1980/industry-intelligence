// A single shared password, sent with the browser's built-in sign-in prompt (HTTP Basic over the host's HTTPS).
// It applies only when APP_PASSWORD is set.
import crypto from 'node:crypto';

const digest = (value) => crypto.createHash('sha256').update(value).digest();

export function isAuthorised(header, password) {
  const match = /^Basic (.+)$/.exec(header || '');
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const supplied = decoded.slice(decoded.indexOf(':') + 1);
  return crypto.timingSafeEqual(digest(supplied), digest(password));
}
