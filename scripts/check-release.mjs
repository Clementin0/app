#!/usr/bin/env node
/**
 * Pre-release guard (run by the CI release job and before uploading to the
 * Play Store): fails when the build would still use the AdMob test IDs or
 * when the git tag does not match package.json.
 *
 * Usage: node scripts/check-release.mjs [tag]
 */
import { readFileSync } from 'node:fs';
import { hasRealProductionIds, PRODUCTION_IDS, USE_TEST_ADS } from '../src/config/admob.config.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.argv[2];
const problems = [];

if (USE_TEST_ADS) problems.push('USE_TEST_ADS is true in src/config/admob.config.js (test ads in a release).');
if (!hasRealProductionIds(PRODUCTION_IDS)) problems.push('PRODUCTION_IDS still contain placeholders in src/config/admob.config.js.');
if (tag && tag.replace(/^v/, '') !== pkg.version) problems.push(`Tag ${tag} does not match package.json version ${pkg.version}.`);

if (problems.length) {
  console.error(`Release check failed:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`Release check passed for v${pkg.version}.`);
