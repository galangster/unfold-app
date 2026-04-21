#!/usr/bin/env node
// check-subscription-prices.mjs — Read subscription prices from App Store Connect.
//
// Usage:
//   node scripts/check-subscription-prices.mjs            # all subscriptions, USA territory
//   node scripts/check-subscription-prices.mjs --all      # all territories
//
// Reads credentials from eas.json submit.production.ios.

import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createSign } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const eas = JSON.parse(readFileSync(join(REPO_ROOT, 'eas.json'), 'utf8'));
const { ascAppId, ascApiKeyId, ascApiKeyIssuerId, ascApiKeyPath } = eas.submit.production.ios;
const privateKey = readFileSync(resolve(REPO_ROOT, ascApiKeyPath), 'utf8');

const showAllTerritories = process.argv.includes('--all');

function b64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function mintJwt() {
  const header = { alg: 'ES256', kid: ascApiKeyId, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: ascApiKeyIssuerId, iat: now, exp: now + 20 * 60, aud: 'appstoreconnect-v1' };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signer = createSign('SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${b64url(signature)}`;
}

const token = mintJwt();
const ASC = 'https://api.appstoreconnect.apple.com/v1';

async function asc(path) {
  const res = await fetch(`${ASC}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  if (!res.ok) {
    const errs = json?.errors?.map((e) => `${e.code}: ${e.title} — ${e.detail ?? ''}`).join('\n  ') ?? text;
    throw new Error(`ASC GET ${path} → ${res.status}\n  ${errs}`);
  }
  return json;
}

// 1. Groups
const groups = await asc(`/apps/${ascAppId}/subscriptionGroups?limit=20`);
console.log(`\nApp ${ascAppId} — ${groups.data.length} subscription group(s)\n`);

for (const group of groups.data) {
  console.log(`▸ Group: ${group.attributes.referenceName} (${group.id})`);

  // 2. Subscriptions in the group
  const subs = await asc(
    `/subscriptionGroups/${group.id}/subscriptions?limit=50&fields[subscriptions]=name,productId,subscriptionPeriod,state`
  );
  if (!subs.data.length) {
    console.log('  (no subscriptions)');
    continue;
  }

  for (const sub of subs.data) {
    const { name, productId, subscriptionPeriod, state } = sub.attributes;
    console.log(`\n  • ${name}`);
    console.log(`    productId: ${productId}`);
    console.log(`    period:    ${subscriptionPeriod}`);
    console.log(`    state:     ${state}`);

    // 3. Prices — prefer the new subscriptionPrices relationship
    //    GET /v1/subscriptions/{id}/prices?include=subscriptionPricePoint,territory
    //    Filter to USA unless --all
    const priceFilter = showAllTerritories ? '' : '&filter[territory]=USA';
    try {
      const prices = await asc(
        `/subscriptions/${sub.id}/prices?limit=50&include=subscriptionPricePoint,territory${priceFilter}`
      );
      if (!prices.data.length) {
        console.log('    prices:    (none)');
        continue;
      }

      // Build lookup maps from included[]
      const pointById = new Map();
      const territoryById = new Map();
      for (const inc of prices.included ?? []) {
        if (inc.type === 'subscriptionPricePoints') pointById.set(inc.id, inc);
        if (inc.type === 'territories') territoryById.set(inc.id, inc);
      }

      for (const p of prices.data) {
        const pointRef = p.relationships?.subscriptionPricePoint?.data;
        const territoryRef = p.relationships?.territory?.data;
        const point = pointRef ? pointById.get(pointRef.id) : null;
        const territory = territoryRef ? territoryById.get(territoryRef.id) : null;
        const customerPrice = point?.attributes?.customerPrice;
        const currency = territory?.attributes?.currency ?? territoryRef?.id ?? '';
        const territoryCode = territoryRef?.id ?? '?';
        const startDate = p.attributes?.startDate ?? '—';
        const preserved = p.attributes?.preserveCurrentPrice === true ? ' (preserved)' : '';
        console.log(`    price:     ${customerPrice ?? '?'} ${currency} — ${territoryCode} — starts ${startDate}${preserved}`);
      }
    } catch (err) {
      console.log(`    prices:    error — ${err.message.split('\n')[0]}`);
    }
  }
}

console.log('');
