# Kit Breaking Changes

Track breaking changes between `@solana/kit` versions. Updated via automated testing and manual discovery.

## How to Use

1. Find your current and target versions
2. Check all changes between them
3. Apply migrations in order

## Version History

### 5.5.x → 5.5.1 (Latest)
**Release Date:** 2026-01-28

**Changes:**
- Patch: Exports missing helpers in `@solana/errors` and `@solana/instruction-plans`

**Migration:** None required

---

### 5.4.x → 5.5.0
**Release Date:** 2026-01-27

**Changes:**
- Added type guard helpers: `isX` and `assertIsX` for instruction plans, transaction plans, results
- Added `SuccessfulTransactionPlanResult` type with guards
- Added `getFirstFailedSingleTransactionPlanResult`
- Added `unwrapSimulationError` function
- Added `flattenInstructionPlan` and `flattenTransactionPlan` (deprecates `getAllSingleTransactionPlans`)
- Added `everyInstructionPlan`, `everyTransactionPlan`, `everyTransactionPlanResult` predicate helpers
- Added `appendTransactionMessageInstructionPlan`
- Added `transformInstructionPlan`, `transformTransactionPlan`, `transformTransactionPlanResult`
- Added `findInstructionPlan`, `findTransactionPlan`, `findTransactionPlanResult`
- Added `passthroughFailedTransactionPlanExecution`
- Fixed race condition in `sendAndConfirmDurableNonceTransactionFactory`

**Migration:**
- Replace `getAllSingleTransactionPlans` with `flattenTransactionPlan` (deprecated but still works)

---

### 5.3.x → 5.4.0
**Release Date:** 2026-01-13

**Changes:**
- `fetchJsonParsedAccount` now includes program + type when available
- Added `<SelectedWalletAccountContext>` provider and `useSelectedWalletAccount` hook
- Added `useSignTransactions` and `useSignAndSendTransactions` hooks

**Migration:** None required (additive changes)

---

## Package Companion Versions

These packages should be updated together for compatibility:

| Kit Version | @solana-program/system | @solana-program/token-2022 | @solana-program/compute-budget |
|-------------|------------------------|----------------------------|--------------------------------|
| 5.5.x | 0.10.0 | 0.8.0 | 0.12.0 |
| 5.4.x | 0.10.0 | 0.8.0 | 0.12.0 |
| 5.3.x | 0.9.x | 0.7.x | 0.11.x |

---

## Common Patterns That Changed

### Transaction Building (Stable since 5.0)

The `pipe` pattern for transaction building has been stable:

```typescript
// This pattern works in all 5.x versions
const message = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayer(feePayer, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
  tx => appendTransactionMessageInstructions(instructions, tx),
);
```

### Instruction Plans (5.5+)

New helpers for working with instruction plans:

```typescript
// 5.5+ 
import { flattenTransactionPlan } from "@solana/instruction-plans";

// Instead of (deprecated)
import { getAllSingleTransactionPlans } from "@solana/instruction-plans";
```

---

## Testing Notes

Run `scripts/version-test.ts` to automatically detect compile-time breaking changes when downgrading versions.

```bash
bun run scripts/version-test.ts 5.3.0 5.4.0 5.5.0
```
