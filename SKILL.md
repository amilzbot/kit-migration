---
name: kit-migration
version: 0.1.0
description: Track breaking changes and migrate between @solana/kit versions. Includes cookbook examples and version compatibility testing.
homepage: https://github.com/anza-xyz/kit
metadata:
  category: solana
  tags: [solana, kit, migration, typescript]
---

# Kit Migration Skill

Track breaking changes and migrate between `@solana/kit` versions. Includes working cookbook examples and version compatibility testing.

## Quick Reference

### Current Stable Versions (as of 2026-02-02)

| Package | Version |
|---------|---------|
| @solana/kit | 5.5.1 |
| @solana-program/system | 0.10.0 |
| @solana-program/token-2022 | 0.8.0 |
| @solana-program/memo | 0.10.0 |
| @solana-program/compute-budget | 0.12.0 |

### Install Kit

```bash
bun add @solana/kit @solana-program/system @solana-program/compute-budget
```

### Common Tasks (Kit 5.x)

#### RPC Connection
```typescript
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";

const rpc = createSolanaRpc("https://api.devnet.solana.com");
const rpcSub = createSolanaRpcSubscriptions("wss://api.devnet.solana.com");
```

#### Generate Keypair
```typescript
import { generateKeyPairSigner, createKeyPairSignerFromBytes } from "@solana/kit";

const keypair = await generateKeyPairSigner();

// From bytes (Solana CLI format)
const bytes = new Uint8Array(JSON.parse(fs.readFileSync("keypair.json")));
const signer = await createKeyPairSignerFromBytes(bytes);
```

#### Build & Send Transaction
```typescript
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  sendAndConfirmTransactionFactory,
  getSignatureFromTransaction,
} from "@solana/kit";

const { value: blockhash } = await rpc.getLatestBlockhash().send();

const message = pipe(
  createTransactionMessage({ version: 0 }),
  tx => setTransactionMessageFeePayer(payer.address, tx),
  tx => setTransactionMessageLifetimeUsingBlockhash(blockhash, tx),
  tx => appendTransactionMessageInstructions(instructions, tx),
);

const signedTx = await signTransactionMessageWithSigners(message);
const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
await sendAndConfirm(signedTx, { commitment: "confirmed" });
const signature = getSignatureFromTransaction(signedTx);
```

#### SOL Transfer
```typescript
import { getTransferSolInstruction } from "@solana-program/system";
import { lamports } from "@solana/kit";

const transferIx = getTransferSolInstruction({
  source: payer,
  destination: address("..."),
  amount: lamports(100_000_000n), // 0.1 SOL
});
```

#### Compute Budget (CU Optimization)
```typescript
import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";

// Simulate first to get CU used
const simResult = await rpc.simulateTransaction(signedTx, {
  commitment: "confirmed",
  replaceRecentBlockhash: true,
}).send();

const cuUsed = Number(simResult.value.unitsConsumed ?? 200_000);
const cuLimit = Math.ceil(cuUsed * 1.1); // 10% buffer

// Add to transaction
const cuLimitIx = getSetComputeUnitLimitInstruction({ units: cuLimit });
const priorityIx = getSetComputeUnitPriceInstruction({ microLamports: 1000n });
```

#### Token-2022 Operations
```typescript
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  getInitializeMint2Instruction,
  getMintToInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  findAssociatedTokenPda,
  getMintSize,
} from "@solana-program/token-2022";
import { getCreateAccountInstruction } from "@solana-program/system";

// Create mint
const mint = await generateKeyPairSigner();
const mintSize = getMintSize([]);
const lamportsForMint = await rpc.getMinimumBalanceForRentExemption(BigInt(mintSize)).send();

const createAccountIx = getCreateAccountInstruction({
  payer,
  newAccount: mint,
  lamports: lamportsForMint,
  space: mintSize,
  programAddress: TOKEN_2022_PROGRAM_ADDRESS,
});

const initMintIx = getInitializeMint2Instruction({
  mint: mint.address,
  decimals: 9,
  mintAuthority: payer.address,
  freezeAuthority: null,
});

// Create ATA
const [ata] = await findAssociatedTokenPda({
  mint: mint.address,
  owner: payer.address,
  tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
});
```

#### Memo
```typescript
import { getAddMemoInstruction } from "@solana-program/memo";

const memoIx = getAddMemoInstruction({
  memo: "Hello from Kit!",
});
```

## Files

| File | Purpose |
|------|---------|
| `references/breaking-changes.md` | Documented breaking changes between versions |
| `references/type-mapping.md` | Type renames and restructuring |
| `scripts/cookbook.ts` | Working examples of all common operations |
| `scripts/version-test.ts` | Test cookbook against different Kit versions |

## Testing Version Compatibility

```bash
# Test current version
bun run scripts/cookbook.ts

# Test specific version
bun run scripts/version-test.ts 5.4.0

# Test all tracked versions
bun run scripts/version-test.ts
```

## Known Breaking Changes

See `references/breaking-changes.md` for detailed version-by-version changes.

### Summary

| Versions | Category | Change |
|----------|----------|--------|
| TBD | TBD | Run version-test.ts to populate |

## Contributing

When you encounter breaking changes:

1. Document in `references/breaking-changes.md`
2. Update cookbook if needed
3. Add migration example if pattern changed significantly
