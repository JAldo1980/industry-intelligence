// A single shared password, sent with the browser's built-in sign-in prompt (HTTP Basic over the host's HTTPS).
import crypto from 'node:crypto';

const digest = (value) => crypto.createHash('sha256').update(value).digest();

export function isAuthorised(header, password) {
  const match = /^Basic (.+)$/.exec(header || '');
  if (!match) return false;
  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const supplied = decoded.slice(decoded.indexOf(':') + 1);
  return crypto.timingSafeEqual(digest(supplied), digest(password));
}

/** The host's health check stays open because it cannot sign in, and it reveals nothing. */
export const requirePassword = (password) => (req, res, next) => {
  if (req.path === '/api/health' || isAuthorised(req.headers.authorization, password)) return next();
  res.set('WWW-Authenticate', 'Basic realm="Industry Intelligence", charset="UTF-8"');
  return res.status(401).send('Password required.');
};
