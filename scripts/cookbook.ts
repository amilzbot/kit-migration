/**
 * Kit Cookbook - Comprehensive examples of common Solana operations using @solana/kit
 * 
 * This file serves as:
 * 1. Working reference implementation for common tasks
 * 2. Version compatibility test (run against different Kit versions)
 * 3. Foundation for Kit migration skill
 * 
 * Tested versions:
 * - @solana/kit: 5.5.1
 * - @solana-program/system: 0.10.0
 * - @solana-program/token-2022: 0.8.0
 * - @solana-program/memo: 0.10.0
 * - @solana-program/compute-budget: 0.12.0
 */

import {
  // RPC
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  
  // Keys & Signers
  generateKeyPairSigner,
  createKeyPairSignerFromBytes,
  address,
  type Address,
  type KeyPairSigner,
  
  // Transaction building
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  appendTransactionMessageInstruction,
  appendTransactionMessageInstructions,
  signTransactionMessageWithSigners,
  getSignatureFromTransaction,
  
  // Transaction sending
  sendAndConfirmTransactionFactory,
  
  // Utilities
  lamports,
  type Lamports,
  type IInstruction,
} from "@solana/kit";

import {
  getTransferSolInstruction,
  getCreateAccountInstruction,
} from "@solana-program/system";

import {
  getSetComputeUnitLimitInstruction,
  getSetComputeUnitPriceInstruction,
} from "@solana-program/compute-budget";

import {
  getAddMemoInstruction,
} from "@solana-program/memo";

import {
  TOKEN_2022_PROGRAM_ADDRESS,
  getInitializeMint2Instruction,
  getMintToInstruction,
  getCreateAssociatedTokenIdempotentInstruction,
  findAssociatedTokenPda,
  getMintSize,
  ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";

// =============================================================================
// Configuration
// =============================================================================

const DEVNET_RPC = "https://api.devnet.solana.com";
const DEVNET_WSS = "wss://api.devnet.solana.com";

// =============================================================================
// 1. RPC Connection
// =============================================================================

export function createRpc(url: string = DEVNET_RPC) {
  return createSolanaRpc(url);
}

export function createRpcSubscriptions(url: string = DEVNET_WSS) {
  return createSolanaRpcSubscriptions(url);
}

// =============================================================================
// 2. Keypair Management
// =============================================================================

export async function generateKeypair(): Promise<KeyPairSigner> {
  return generateKeyPairSigner();
}

export async function keypairFromBytes(bytes: Uint8Array): Promise<KeyPairSigner> {
  return createKeyPairSignerFromBytes(bytes);
}

export async function keypairFromJsonFile(path: string): Promise<KeyPairSigner> {
  const file = Bun.file(path);
  const bytes = new Uint8Array(await file.json());
  return createKeyPairSignerFromBytes(bytes);
}

// =============================================================================
// 3. Balance & Airdrop
// =============================================================================

export async function getBalance(rpc: ReturnType<typeof createSolanaRpc>, addr: Address): Promise<bigint> {
  const result = await rpc.getBalance(addr).send();
  return result.value;
}

export async function requestAirdrop(
  rpc: ReturnType<typeof createSolanaRpc>,
  addr: Address,
  amount: Lamports = lamports(1_000_000_000n)
): Promise<string> {
  const signature = await rpc.requestAirdrop(addr, amount).send();
  // Wait for confirmation
  await new Promise(resolve => setTimeout(resolve, 2000));
  return signature;
}

// =============================================================================
// 4. Transaction Building Helpers
// =============================================================================

export async function buildTransaction(
  rpc: ReturnType<typeof createSolanaRpc>,
  feePayer: Address,
  instructions: IInstruction[]
) {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  
  return pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(feePayer, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions(instructions, tx),
  );
}

// =============================================================================
// 5. CU Estimation via Simulation
// =============================================================================

export async function estimateComputeUnits(
  rpc: ReturnType<typeof createSolanaRpc>,
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  feePayer: KeyPairSigner,
  instructions: IInstruction[]
): Promise<{ cuUsed: number; cuLimit: number }> {
  const message = await buildTransaction(rpc, feePayer.address, instructions);
  const signedTx = await signTransactionMessageWithSigners(message);
  
  const simResult = await rpc.simulateTransaction(signedTx, {
    commitment: "confirmed",
    replaceRecentBlockhash: true,
  }).send();
  
  const cuUsed = Number(simResult.value.unitsConsumed ?? 200_000);
  const cuLimit = Math.ceil(cuUsed * 1.1); // 10% buffer
  
  return { cuUsed, cuLimit };
}

// =============================================================================
// 6. Send Transaction with CU Optimization
// =============================================================================

export async function sendOptimizedTransaction(
  rpc: ReturnType<typeof createSolanaRpc>,
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  feePayer: KeyPairSigner,
  instructions: IInstruction[],
  priorityFee?: number // microlamports per CU
): Promise<{ signature: string; cuUsed: number; cuLimit: number }> {
  // Estimate CU
  const { cuUsed, cuLimit } = await estimateComputeUnits(rpc, rpcSubscriptions, feePayer, instructions);
  
  // Build optimized instruction set
  const optimizedIxs: IInstruction[] = [
    getSetComputeUnitLimitInstruction({ units: cuLimit }),
  ];
  
  if (priorityFee) {
    optimizedIxs.push(getSetComputeUnitPriceInstruction({ microLamports: BigInt(priorityFee) }));
  }
  
  optimizedIxs.push(...instructions);
  
  // Build and send
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    tx => setTransactionMessageFeePayer(feePayer.address, tx),
    tx => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    tx => appendTransactionMessageInstructions(optimizedIxs, tx),
  );
  
  const signedTx = await signTransactionMessageWithSigners(message);
  
  const sendAndConfirm = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await sendAndConfirm(signedTx, { commitment: "confirmed" });
  
  return {
    signature: getSignatureFromTransaction(signedTx),
    cuUsed,
    cuLimit,
  };
}

// =============================================================================
// 7. SOL Transfer
// =============================================================================

export async function transferSol(
  rpc: ReturnType<typeof createSolanaRpc>,
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  from: KeyPairSigner,
  to: Address,
  amount: Lamports
): Promise<{ signature: string; cuUsed: number; cuLimit: number }> {
  const transferIx = getTransferSolInstruction({
    source: from,
    destination: to,
    amount,
  });
  
  return sendOptimizedTransaction(rpc, rpcSubscriptions, from, [transferIx]);
}

// =============================================================================
// 8. Memo
// =============================================================================

export async function sendMemo(
  rpc: ReturnType<typeof createSolanaRpc>,
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  payer: KeyPairSigner,
  message: string,
  signers?: KeyPairSigner[]
): Promise<{ signature: string; cuUsed: number; cuLimit: number }> {
  const memoIx = getAddMemoInstruction({
    memo: message,
    signers: signers?.map(s => s.address),
  });
  
  return sendOptimizedTransaction(rpc, rpcSubscriptions, payer, [memoIx]);
}

// =============================================================================
// 9. Token Operations (Token-2022)
// =============================================================================

export async function createToken(
  rpc: ReturnType<typeof createSolanaRpc>,
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  payer: KeyPairSigner,
  mintAuthority: Address,
  decimals: number = 9,
  freezeAuthority?: Address
): Promise<{ signature: string; mint: Address; cuUsed: number; cuLimit: number }> {
  // Generate new mint keypair
  const mint = await generateKeyPairSigner();
  
  // Calculate mint account size
  const mintSize = getMintSize([]);
  const lamportsForMint = await rpc.getMinimumBalanceForRentExemption(BigInt(mintSize)).send();
  
  // Create account instruction
  const createAccountIx = getCreateAccountInstruction({
    payer,
    newAccount: mint,
    lamports: lamportsForMint,
    space: mintSize,
    programAddress: TOKEN_2022_PROGRAM_ADDRESS,
  });
  
  // Initialize mint instruction
  const initMintIx = getInitializeMint2Instruction({
    mint: mint.address,
    decimals,
    mintAuthority,
    freezeAuthority: freezeAuthority ?? null,
  });
  
  const result = await sendOptimizedTransaction(
    rpc, 
    rpcSubscriptions, 
    payer, 
    [createAccountIx, initMintIx]
  );
  
  return {
    ...result,
    mint: mint.address,
  };
}

export async function getOrCreateAta(
  rpc: ReturnType<typeof createSolanaRpc>,
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  payer: KeyPairSigner,
  mint: Address,
  owner: Address
): Promise<{ signature: string; ata: Address; cuUsed: number; cuLimit: number }> {
  const [ata] = await findAssociatedTokenPda({
    mint,
    owner,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  
  const createAtaIx = getCreateAssociatedTokenIdempotentInstruction({
    payer,
    owner,
    mint,
    ata,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ADDRESS,
  });
  
  const result = await sendOptimizedTransaction(rpc, rpcSubscriptions, payer, [createAtaIx]);
  
  return {
    ...result,
    ata,
  };
}

export async function mintTokens(
  rpc: ReturnType<typeof createSolanaRpc>,
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  payer: KeyPairSigner,
  mint: Address,
  mintAuthority: KeyPairSigner,
  destination: Address,
  amount: bigint
): Promise<{ signature: string; cuUsed: number; cuLimit: number }> {
  const mintToIx = getMintToInstruction({
    mint,
    token: destination,
    mintAuthority,
    amount,
  });
  
  return sendOptimizedTransaction(rpc, rpcSubscriptions, payer, [mintToIx]);
}

// =============================================================================
// 10. Account Data Decoding
// =============================================================================

export async function getAccountInfo(
  rpc: ReturnType<typeof createSolanaRpc>,
  addr: Address
) {
  const result = await rpc.getAccountInfo(addr, { encoding: "base64" }).send();
  return result.value;
}

export async function getMultipleAccounts(
  rpc: ReturnType<typeof createSolanaRpc>,
  addresses: Address[]
) {
  const result = await rpc.getMultipleAccounts(addresses, { encoding: "base64" }).send();
  return result.value;
}

// =============================================================================
// 11. Transaction Confirmation
// =============================================================================

export async function confirmTransaction(
  rpc: ReturnType<typeof createSolanaRpc>,
  signature: string,
  commitment: "processed" | "confirmed" | "finalized" = "confirmed"
): Promise<boolean> {
  const status = await rpc.getSignatureStatuses([signature]).send();
  const result = status.value[0];
  
  if (!result) return false;
  if (result.err) return false;
  
  const commitmentLevel = result.confirmationStatus;
  
  if (commitment === "processed") {
    return ["processed", "confirmed", "finalized"].includes(commitmentLevel ?? "");
  }
  if (commitment === "confirmed") {
    return ["confirmed", "finalized"].includes(commitmentLevel ?? "");
  }
  return commitmentLevel === "finalized";
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function runTests() {
  console.log("🧪 Kit Cookbook Test Suite\n");
  console.log("Versions:");
  console.log("  @solana/kit: 5.5.1");
  console.log("  @solana-program/system: 0.10.0");
  console.log("  @solana-program/token-2022: 0.8.0");
  console.log("  @solana-program/memo: 0.10.0");
  console.log("  @solana-program/compute-budget: 0.12.0\n");
  
  const rpc = createRpc();
  const rpcSubscriptions = createRpcSubscriptions();
  
  // Test 1: Generate Keypair
  console.log("1. Generate Keypair...");
  const payer = await generateKeypair();
  console.log(`   ✓ Generated: ${payer.address.slice(0, 20)}...`);
  
  // Test 2: Request Airdrop
  console.log("2. Request Airdrop...");
  try {
    await requestAirdrop(rpc, payer.address);
    const balance = await getBalance(rpc, payer.address);
    console.log(`   ✓ Balance: ${Number(balance) / 1e9} SOL`);
  } catch (e) {
    console.log(`   ✗ Airdrop failed (rate limited?): ${e}`);
    return;
  }
  
  // Test 3: SOL Transfer
  console.log("3. SOL Transfer...");
  const recipient = await generateKeypair();
  try {
    const { signature, cuUsed, cuLimit } = await transferSol(
      rpc,
      rpcSubscriptions,
      payer,
      recipient.address,
      lamports(100_000_000n) // 0.1 SOL
    );
    console.log(`   ✓ Transferred 0.1 SOL`);
    console.log(`   ✓ CU: ${cuUsed} / ${cuLimit}`);
    console.log(`   ✓ Sig: ${signature.slice(0, 20)}...`);
  } catch (e) {
    console.log(`   ✗ Transfer failed: ${e}`);
  }
  
  // Test 4: Memo
  console.log("4. Send Memo...");
  try {
    const { signature, cuUsed, cuLimit } = await sendMemo(
      rpc,
      rpcSubscriptions,
      payer,
      "Kit Cookbook Test"
    );
    console.log(`   ✓ Memo sent`);
    console.log(`   ✓ CU: ${cuUsed} / ${cuLimit}`);
  } catch (e) {
    console.log(`   ✗ Memo failed: ${e}`);
  }
  
  // Test 5: Create Token
  console.log("5. Create Token (Token-2022)...");
  try {
    const { mint, cuUsed, cuLimit } = await createToken(
      rpc,
      rpcSubscriptions,
      payer,
      payer.address, // mint authority
      9 // decimals
    );
    console.log(`   ✓ Mint: ${mint.slice(0, 20)}...`);
    console.log(`   ✓ CU: ${cuUsed} / ${cuLimit}`);
    
    // Test 6: Create ATA
    console.log("6. Create ATA...");
    const { ata, cuUsed: ataCu, cuLimit: ataCuLimit } = await getOrCreateAta(
      rpc,
      rpcSubscriptions,
      payer,
      mint,
      payer.address
    );
    console.log(`   ✓ ATA: ${ata.slice(0, 20)}...`);
    console.log(`   ✓ CU: ${ataCu} / ${ataCuLimit}`);
    
    // Test 7: Mint Tokens
    console.log("7. Mint Tokens...");
    const { cuUsed: mintCu, cuLimit: mintCuLimit } = await mintTokens(
      rpc,
      rpcSubscriptions,
      payer,
      mint,
      payer, // mint authority
      ata,
      1_000_000_000n // 1 token
    );
    console.log(`   ✓ Minted 1 token`);
    console.log(`   ✓ CU: ${mintCu} / ${mintCuLimit}`);
    
  } catch (e) {
    console.log(`   ✗ Token ops failed: ${e}`);
  }
  
  // Test 8: Account Info
  console.log("8. Get Account Info...");
  try {
    const info = await getAccountInfo(rpc, payer.address);
    console.log(`   ✓ Account exists: ${info !== null}`);
    if (info) {
      console.log(`   ✓ Lamports: ${info.lamports}`);
    }
  } catch (e) {
    console.log(`   ✗ Get account failed: ${e}`);
  }
  
  console.log("\n✅ Test suite complete!");
}

// Run if executed directly
if (import.meta.main) {
  runTests().catch(console.error);
}
