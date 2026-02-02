/**
 * Kit Version Compatibility Tester
 * 
 * Tests cookbook functions against different Kit versions to detect breaking changes.
 * Run: bun run src/version-test.ts [version]
 */

import { $ } from "bun";

const VERSIONS_TO_TEST = [
  "5.5.1",  // current
  "5.5.0",
  "5.4.0",
  "5.3.0",
  "5.2.0",
  "5.1.0",
  "5.0.0",
  // Add older versions as needed
];

interface TestResult {
  version: string;
  installed: boolean;
  compiles: boolean;
  errors: string[];
  typeChanges: string[];
}

async function testVersion(version: string): Promise<TestResult> {
  const result: TestResult = {
    version,
    installed: false,
    compiles: false,
    errors: [],
    typeChanges: [],
  };
  
  console.log(`\n📦 Testing @solana/kit@${version}...`);
  
  // Install specific version
  try {
    await $`bun add @solana/kit@${version}`.quiet();
    result.installed = true;
    console.log(`   ✓ Installed`);
  } catch (e: any) {
    result.errors.push(`Install failed: ${e.message}`);
    console.log(`   ✗ Install failed`);
    return result;
  }
  
  // Try to compile
  try {
    const proc = await $`bun build src/cookbook.ts --target node 2>&1`.quiet();
    result.compiles = true;
    console.log(`   ✓ Compiles`);
  } catch (e: any) {
    result.compiles = false;
    const output = e.stderr?.toString() || e.message;
    
    // Parse errors for type changes
    const typeErrors = output.match(/Property '.*?' does not exist/g) || [];
    const missingExports = output.match(/Module '"@solana\/kit"' has no exported member '.*?'/g) || [];
    const typeChanges = output.match(/Type '.*?' is not assignable to type '.*?'/g) || [];
    
    result.errors.push(...typeErrors, ...missingExports);
    result.typeChanges.push(...typeChanges);
    
    console.log(`   ✗ Compile errors: ${result.errors.length + result.typeChanges.length}`);
    
    if (result.errors.length > 0) {
      result.errors.slice(0, 3).forEach(e => console.log(`     - ${e}`));
    }
  }
  
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  
  // If specific version provided, test only that
  const versionsToTest = args.length > 0 ? args : VERSIONS_TO_TEST;
  
  console.log("🔬 Kit Version Compatibility Tester\n");
  console.log(`Testing versions: ${versionsToTest.join(", ")}`);
  
  const results: TestResult[] = [];
  
  for (const version of versionsToTest) {
    const result = await testVersion(version);
    results.push(result);
  }
  
  // Restore latest version
  console.log("\n📦 Restoring latest version...");
  await $`bun add @solana/kit@latest`.quiet();
  
  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 COMPATIBILITY REPORT\n");
  
  console.log("| Version | Installs | Compiles | Breaking Changes |");
  console.log("|---------|----------|----------|------------------|");
  
  for (const r of results) {
    const install = r.installed ? "✓" : "✗";
    const compile = r.compiles ? "✓" : "✗";
    const breaking = r.errors.length + r.typeChanges.length;
    console.log(`| ${r.version.padEnd(7)} | ${install.padEnd(8)} | ${compile.padEnd(8)} | ${String(breaking).padEnd(16)} |`);
  }
  
  // Detailed breaking changes
  const breakingVersions = results.filter(r => r.errors.length > 0 || r.typeChanges.length > 0);
  
  if (breakingVersions.length > 0) {
    console.log("\n📋 BREAKING CHANGES DETAIL\n");
    
    for (const r of breakingVersions) {
      console.log(`## ${r.version}`);
      if (r.errors.length > 0) {
        console.log("Missing/renamed exports:");
        r.errors.forEach(e => console.log(`  - ${e}`));
      }
      if (r.typeChanges.length > 0) {
        console.log("Type changes:");
        r.typeChanges.forEach(e => console.log(`  - ${e}`));
      }
      console.log("");
    }
  }
}

main().catch(console.error);
