import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  root,
  port: Number(process.env.PORT || 8787),
  // Bound to loopback by default because the app has no user accounts.
  host: process.env.HOST || '127.0.0.1',
  dataDir: path.resolve(root, process.env.DATA_DIR || 'data'),
  password: process.env.APP_PASSWORD || '',
  // Render sets RENDER=true on its servers.
  hosted: process.env.RENDER === 'true',
  userAgent: process.env.RESEARCH_USER_AGENT || 'IndustryIntelligenceBot/1.0 (B2B market research; respects robots.txt)',
  maxConcurrentReports: Number(process.env.MAX_CONCURRENT_REPORTS || 2),
  reportsPerHour: Number(process.env.REPORTS_PER_HOUR || 12),
  maxCompanies: Number(process.env.MAX_COMPANIES || 6),
  // Nomis's robots.txt disallows /api/v01/dataset/ although the API is publicly documented.
  // It stays off unless the operator has decided that its API terms permit their use.
  nomisApiAllowed: process.env.NOMIS_API_ALLOWED === 'true',
  keys: {
    companiesHouse: process.env.COMPANIES_HOUSE_API_KEY || '',
  },
};
