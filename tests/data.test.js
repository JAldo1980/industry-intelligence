import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTier, seriesStats } from '../server/lib/evidence.js';
import { assertPublicUrl, normaliseUrl } from '../server/lib/http.js';
import { absCode } from '../server/providers/ons.js';
import { nameScore } from '../server/providers/companieshouse.js';

test('series statistics are computed from real points only', () => {
  const s = seriesStats({ frequency: 'annual', points: [{ period: '2023', value: 100 }, { period: '2024', value: 110 }, { period: '2025', value: 99, forecast: true }] });
  assert.equal(s.latest, 110);
  assert.equal(s.change1y.pct, 10);
});

test('source hierarchy', () => {
  assert.equal(classifyTier('https://www.ons.gov.uk/x'), 1);
  assert.equal(classifyTier('https://www.bankofengland.co.uk/x'), 2);
  assert.equal(classifyTier('https://www.makeuk.org/x', ['makeuk.org']), 3);
  assert.equal(classifyTier('https://find-and-update.company-information.service.gov.uk/company/1'), 4);
  assert.equal(classifyTier('https://randomblog.example/x'), 7);
});

test('blocks internal addresses and bad schemes', async () => {
  await assert.rejects(() => assertPublicUrl('http://127.0.0.1:8787/'));
  await assert.rejects(() => assertPublicUrl('http://169.254.169.254/latest/meta-data'));
  await assert.rejects(() => assertPublicUrl('http://localhost.localhost/'));
  assert.throws(() => normaliseUrl('file:///etc/passwd'));
  assert.equal(normaliseUrl('example.com').href, 'https://example.com/');
});

test('ABS code mapping', () => {
  assert.equal(absCode('28410'), '28.41');
  assert.equal(absCode('284'), '28.4');
  assert.equal(absCode('28'), '28');
});

test('company matching prefers the exact company over similarly named ones', () => {
  assert.equal(nameScore('Renishaw PLC', 'RENISHAW P L C'), 1);
  assert.ok(nameScore('Renishaw PLC', 'RENISHAW DIAGNOSTICS LIMITED') < 0.7);
  assert.equal(nameScore('Acme Ltd', 'Zenith Ltd'), 0);
});
