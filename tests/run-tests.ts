#!/usr/bin/env node
/**
 * Test runner for n8n-cli tests.
 * Run with: npm run test:client (from n8n-cli)
 * Run with: npm run test:integration (CLI integration tests only, real API)
 */

import { runLoadConfigTests } from './load-config.test.js';
import { runClientTests } from './client.test.js';
import { runCliIntegrationTests } from './cli-integration.test.js';

async function main(): Promise<void> {
  const integrationOnly = process.argv.includes('--integration');
  console.log('\n═══════════════════════════════════════════');
  console.log('  n8n-cli Test Suite');
  console.log('═══════════════════════════════════════════\n');

  let totalPassed = 0;
  let totalFailed = 0;

  if (!integrationOnly) {
    const { passed: p1, failed: f1 } = await runLoadConfigTests();
    totalPassed += p1;
    totalFailed += f1;

    const { passed: p2, failed: f2 } = await runClientTests();
    totalPassed += p2;
    totalFailed += f2;
  }

  const { passed: p3, failed: f3 } = await runCliIntegrationTests();
  totalPassed += p3;
  totalFailed += f3;

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
