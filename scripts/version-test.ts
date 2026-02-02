/**
 * Kit Version Compatibility Tester
 * 
 * Tests cookbook functions against different Kit versions to detect breaking changes.
 * 
 * Usage:
 *   bun run scripts/version-test.ts                    # Test default versions
 *   bun run scripts/version-test.ts 5.0.0 4.0.0       # Test specific versions
 *   bun run version-test:all                           # Test all stable releases
 */

import { $ } from "bun";

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

async function testVersion(version: string): Promise<TestResult> {
  const result: TestResult = {
    version,
    installed: false,
    compiles: false,
    errors: [],
  };
  
  process.stdout.write(`| ${version.padEnd(7)} |`);
  
  // Install specific version
  try {
    await $`bun add @solana/kit@${version} 2>&1`.quiet();
    result.installed = true;
    process.stdout.write(" ✓        |");
  } catch (e: any) {
    result.errors.push(`Install failed`);
    console.log(" ✗        | ✗        | Install failed");
    return result;
  }
  
  // Try to compile
  try {
    const proc = await $`bun build scripts/cookbook.ts --target node 2>&1`.nothrow();
    if (proc.exitCode === 0) {
      result.compiles = true;
      console.log(" ✓        |");
    } else {
      const output = proc.stderr.toString() + proc.stdout.toString();
      
      // Extract key errors
      const lines = output.split('\n');
      const errorLines = lines.filter(l => 
        l.includes('error:') || 
        l.includes('has no exported member') ||
        l.includes('does not exist') ||
        l.includes('is not assignable')
      ).slice(0, 10);
      
      result.errors = errorLines.map(l => l.trim().slice(0, 120));
      console.log(` ✗        | ${result.errors.length} errors`);
    }
  } catch (e: any) {
    result.errors.push(e.message?.slice(0, 100) || "Unknown error");
    console.log(" ✗        | Build exception");
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const versionsToTest = args.length > 0 ? args : DEFAULT_VERSIONS;
  
  console.log("# Kit Version Compatibility Test\n");
  console.log(`Testing ${versionsToTest.length} versions...\n`);
  console.log("| Version | Installs | Compiles | Notes |");
  console.log("|---------|----------|----------|-------|");
  
  const results: TestResult[] = [];
  
  for (const version of versionsToTest) {
    const result = await testVersion(version);
    results.push(result);
  }
  
  // Restore latest
  console.log("\nRestoring @solana/kit@latest...");
  await $`bun add @solana/kit@latest 2>&1`.quiet();
  
  // Detailed errors
  const broken = results.filter(r => r.errors.length > 0);
  
  if (broken.length > 0) {
    console.log("\n## Breaking Changes Detail\n");
    
    for (const r of broken) {
      console.log(`### ${r.version}\n`);
      console.log("```");
      r.errors.forEach(e => console.log(e));
      console.log("```\n");
    }
  }
  
  // Summary
  const working = results.filter(r => r.compiles);
  console.log("\n## Summary\n");
  console.log(`- **Compatible:** ${working.map(r => r.version).join(", ") || "none"}`);
  console.log(`- **Breaking:** ${broken.map(r => r.version).join(", ") || "none"}`);
}

main().catch(console.error);
