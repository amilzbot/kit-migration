/**
 * Kit Version Compatibility Tester
 * 
 * Tests cookbook functions against different Kit versions to detect breaking changes.
 * Results are written to test-results.md
 * 
 * Usage:
 *   bun run scripts/version-test.ts                    # Test default versions
 *   bun run scripts/version-test.ts 5.0.0 4.0.0       # Test specific versions
 *   bun run version-test:all                           # Test all stable releases
 */

import { $ } from "bun";
import { writeFileSync } from "fs";

const DEFAULT_VERSIONS = [
  "5.5.1",
  "5.0.0", 
  "4.0.0",
  "3.0.0",
  "2.1.0",
];

interface TestResult {
  version: string;
  installed: boolean;
  compiles: boolean;
  errors: string[];
}

const output: string[] = [];

function log(msg: string) {
  console.log(msg);
  output.push(msg);
}

async function testVersion(version: string): Promise<TestResult> {
  const result: TestResult = {
    version,
    installed: false,
    compiles: false,
    errors: [],
  };
  
  process.stdout.write(`Testing ${version}...`);
  
  // Install specific version
  try {
    await $`bun add @solana/kit@${version} 2>&1`.quiet();
    result.installed = true;
    process.stdout.write(" installed...");
  } catch (e: any) {
    result.errors.push(`Install failed`);
    console.log(" INSTALL FAILED");
    return result;
  }
  
  // Try to compile
  try {
    const proc = await $`bun build scripts/cookbook.ts --target node 2>&1`.nothrow();
    if (proc.exitCode === 0) {
      result.compiles = true;
      console.log(" OK");
    } else {
      const rawOutput = proc.stderr.toString() + proc.stdout.toString();
      
      // Extract key errors
      const lines = rawOutput.split('\n');
      const errorLines = lines.filter(l => 
        l.includes('error:') || 
        l.includes('has no exported member') ||
        l.includes('does not exist') ||
        l.includes('is not assignable') ||
        l.includes('Cannot find')
      ).slice(0, 20);
      
      result.errors = errorLines.map(l => l.trim());
      console.log(` FAILED (${result.errors.length} errors)`);
    }
  } catch (e: any) {
    result.errors.push(e.message || "Unknown error");
    console.log(" BUILD EXCEPTION");
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const versionsToTest = args.length > 0 ? args : DEFAULT_VERSIONS;
  
  log("# Kit Version Compatibility Test Results");
  log("");
  log(`**Date:** ${new Date().toISOString()}`);
  log(`**Versions tested:** ${versionsToTest.length}`);
  log("");
  
  console.log(`\nTesting ${versionsToTest.length} versions...\n`);
  
  const results: TestResult[] = [];
  
  for (const version of versionsToTest) {
    const result = await testVersion(version);
    results.push(result);
  }
  
  // Restore latest
  console.log("\nRestoring @solana/kit@latest...");
  await $`bun add @solana/kit@latest 2>&1`.quiet();
  
  // Write results table
  log("## Results Table");
  log("");
  log("| Version | Installs | Compiles |");
  log("|---------|----------|----------|");
  
  for (const r of results) {
    const install = r.installed ? "✓" : "✗";
    const compile = r.compiles ? "✓" : "✗";
    log(`| ${r.version} | ${install} | ${compile} |`);
  }
  
  // Detailed errors
  const broken = results.filter(r => r.errors.length > 0);
  
  if (broken.length > 0) {
    log("");
    log("## Breaking Changes Detail");
    
    for (const r of broken) {
      log("");
      log(`### ${r.version}`);
      log("");
      log("```");
      r.errors.forEach(e => log(e));
      log("```");
    }
  }
  
  // Summary
  const working = results.filter(r => r.compiles);
  log("");
  log("## Summary");
  log("");
  log(`- **Compatible:** ${working.map(r => r.version).join(", ") || "none"}`);
  log(`- **Breaking:** ${broken.map(r => r.version).join(", ") || "none"}`);
  
  // Write to file
  const outputFile = "test-results.md";
  writeFileSync(outputFile, output.join("\n"));
  console.log(`\n✓ Results written to ${outputFile}`);
}

main().catch(console.error);
