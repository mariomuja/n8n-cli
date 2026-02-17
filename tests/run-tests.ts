#!/usr/bin/env node
/**
 * Test runner for n8n-cli tests.
 * Run with: npm run test:client (from n8n-cli)
 */

import { runLoadConfigTests } from './load-config.test.js';
import { runClientTests } from './client.test.js';

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════');
  console.log('  n8n-cli Test Suite');
  console.log('═══════════════════════════════════════════\n');

  let totalPassed = 0;
  let totalFailed = 0;

  const { passed: p1, failed: f1 } = await runLoadConfigTests();
  totalPassed += p1;
  totalFailed += f1;

  const { passed: p2, failed: f2 } = await runClientTests();
  totalPassed += p2;
  totalFailed += f2;

  console.log('\n═══════════════════════════════════════════');
  console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('═══════════════════════════════════════════\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
