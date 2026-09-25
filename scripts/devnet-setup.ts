// Solana DEVNET bootstrap for CryptoArena (standard SPL token — no custom on-chain program).
//
//   pnpm devnet:setup                       create/load treasury, airdrop SOL, create reward mint,
//                                           create treasury ATA and mint the initial supply
//   pnpm devnet:setup --write-env           …and write the resulting values into .env
//   pnpm devnet:setup --fund <wallet> <n>   send n test tokens (+ a little SOL) to a player wallet
//
// The treasury keypair is stored in ./secrets/treasury.json (git-ignored) and never printed.
// This script refuses to run against anything but devnet/localnet.

import "dotenv/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { webcrypto } from "node:crypto";
import {
  address,
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  lamports,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  signature as toSignature,
  type Instruction,
  type KeyPairSigner,
} from "@solana/kit";
import { getCreateAccountInstruction, getTransferSolInstruction } from "@solana-program/system";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getInitializeMint2Instruction,
  getMintSize,
  getMintToCheckedInstruction,
} from "@solana-program/token";

const NETWORK = process.env.SOLANA_NETWORK ?? "devnet";
const RPC_URL = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";
const DECIMALS = Number(process.env.REWARD_TOKEN_DECIMALS ?? 6);
const INITIAL_SUPPLY_TOKENS = 10_000_000n;
const SECRET_FILE = "secrets/treasury.json";

if (NETWORK !== "devnet" && NETWORK !== "localnet") {
  console.error(`Refusing to run: SOLANA_NETWORK=${NETWORK}. This script is for devnet/localnet only.`);
  process.exit(1);
}

const rpc = createSolanaRpc(RPC_URL);

async function generateExtractableKeypairBytes(): Promise<Uint8Array> {
  const kp = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as webcrypto.CryptoKeyPair;
  const pkcs8 = new Uint8Array(await webcrypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pub = new Uint8Array(await webcrypto.subtle.exportKey("raw", kp.publicKey));
  const out = new Uint8Array(64);
  out.set(pkcs8.slice(pkcs8.length - 32), 0);
  out.set(pub, 32);
  return out;
}

/** Loads (or creates) the treasury keypair and returns it with the JSON secret it came from. */
async function loadTreasury(): Promise<{ signer: KeyPairSigner; secretJson: string }> {
  const fromEnv = process.env.TREASURY_SECRET?.trim();
  if (fromEnv) {
    if (!fromEnv.startsWith("[")) throw new Error("TREASURY_SECRET must be a JSON byte array (solana-keygen format) for this script");
    return { signer: await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(fromEnv) as number[])), secretJson: fromEnv };
  }
  if (!existsSync(SECRET_FILE)) {
    mkdirSync("secrets", { recursive: true });
    const bytes = await generateExtractableKeypairBytes();
    writeFileSync(SECRET_FILE, JSON.stringify([...bytes]), { mode: 0o600 });
    console.log(`Generated new treasury keypair → ${SECRET_FILE} (keep it secret, never commit it)`);
  }
  const secretJson = readFileSync(SECRET_FILE, "utf8").trim();
  return { signer: await createKeyPairSignerFromBytes(Uint8Array.from(JSON.parse(secretJson) as number[])), secretJson };
}

async function confirm(sig: string, label: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const { value } = await rpc.getSignatureStatuses([toSignature(sig)]).send();
    const s = value[0];
    if (s?.err) throw new Error(`${label} failed: ${JSON.stringify(s.err)}`);
    if (s?.confirmationStatus === "confirmed" || s?.confirmationStatus === "finalized") {
      console.log(`  ✔ ${label}: ${sig}`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`${label} not confirmed in time (${sig})`);
}

async function send(payer: KeyPairSigner, instructions: Instruction[], label: string): Promise<string> {
  const { value: latest } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latest, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const signed = await signTransactionMessageWithSigners(msg);
  const sig = getSignatureFromTransaction(signed);
  await rpc.sendTransaction(getBase64EncodedWireTransaction(signed), { encoding: "base64", preflightCommitment: "confirmed" }).send();
  await confirm(sig, label);
  return sig;
}

async function ensureSol(owner: KeyPairSigner, minSol: number): Promise<void> {
  const { value } = await rpc.getBalance(owner.address).send();
  if (Number(value) >= minSol * 1e9) {
    console.log(`Treasury SOL balance: ${(Number(value) / 1e9).toFixed(3)} SOL`);
    return;
  }
  console.log("Requesting devnet airdrop (2 SOL)…");
  try {
    const sig = await rpc.requestAirdrop(owner.address, lamports(2_000_000_000n)).send();
    await confirm(sig, "airdrop");
  } catch (err) {
    console.error(`Airdrop failed (${(err as Error).message}). Fund ${owner.address} manually at https://faucet.solana.com and re-run.`);
    process.exit(1);
  }
}

async function ata(owner: string, mint: string): Promise<string> {
  const [pda] = await findAssociatedTokenPda({ owner: address(owner), mint: address(mint), tokenProgram: TOKEN_PROGRAM_ADDRESS });
  return pda;
}

async function createMint(treasury: KeyPairSigner): Promise<string> {
  const mint = await generateKeyPairSigner();
  const space = BigInt(getMintSize());
  const rent = await rpc.getMinimumBalanceForRentExemption(space).send();
  await send(
    treasury,
    [
      getCreateAccountInstruction({ payer: treasury, newAccount: mint, lamports: rent, space, programAddress: TOKEN_PROGRAM_ADDRESS }),
      getInitializeMint2Instruction({ mint: mint.address, decimals: DECIMALS, mintAuthority: treasury.address, freezeAuthority: null }),
    ],
    "create reward mint",
  );
  return mint.address;
}

async function mintTo(treasury: KeyPairSigner, mint: string, owner: string, tokens: bigint, label: string): Promise<void> {
  const dest = await ata(owner, mint);
  await send(
    treasury,
    [
      getCreateAssociatedTokenIdempotentInstruction({ payer: treasury, ata: address(dest), owner: address(owner), mint: address(mint) }),
      getMintToCheckedInstruction({ mint: address(mint), token: address(dest), mintAuthority: treasury, amount: tokens * 10n ** BigInt(DECIMALS), decimals: DECIMALS }),
    ],
    label,
  );
}

function writeEnv(values: Record<string, string>): void {
  let env = existsSync(".env") ? readFileSync(".env", "utf8") : readFileSync(".env.example", "utf8");
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^${k}=.*$`, "m");
    env = re.test(env) ? env.replace(re, `${k}=${v}`) : `${env.trimEnd()}\n${k}=${v}\n`;
  }
  writeFileSync(".env", env, { mode: 0o600 });
  console.log("Updated .env");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const genesis = await rpc.getGenesisHash().send();
  if (NETWORK === "devnet" && genesis !== "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG") throw new Error(`RPC ${RPC_URL} is not devnet`);

  const { signer: treasury, secretJson } = await loadTreasury();
  console.log(`Treasury: ${treasury.address}`);
  await ensureSol(treasury, 0.5);

  let mint = process.env.REWARD_TOKEN_MINT || "";
  if (!mint) {
    mint = await createMint(treasury);
    console.log(`Reward mint: ${mint}`);
    await mintTo(treasury, mint, treasury.address, INITIAL_SUPPLY_TOKENS, `mint ${INITIAL_SUPPLY_TOKENS} tokens to treasury`);
  } else {
    console.log(`Using existing mint ${mint}`);
  }

  const fundIdx = args.indexOf("--fund");
  if (fundIdx >= 0) {
    const player = args[fundIdx + 1];
    const amount = BigInt(args[fundIdx + 2] ?? "100");
    if (!player) throw new Error("--fund requires a wallet address");
    await mintTo(treasury, mint, player, amount, `send ${amount} test tokens to ${player}`);
    await send(treasury, [getTransferSolInstruction({ source: treasury, destination: address(player), amount: lamports(50_000_000n) })], "send 0.05 SOL for fees");
  }

  const values = {
    SOLANA_MOCK: "false",
    SOLANA_NETWORK: NETWORK,
    SOLANA_RPC_URL: RPC_URL,
    TREASURY_PUBLIC_KEY: treasury.address,
    REWARD_TOKEN_MINT: mint,
    REWARD_TOKEN_DECIMALS: String(DECIMALS),
  };
  if (args.includes("--write-env")) {
    writeEnv({ ...values, TREASURY_SECRET: secretJson });
  } else {
    console.log("\nAdd to .env (TREASURY_SECRET = contents of secrets/treasury.json; blockchain-service only):");
    for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`);
  }
  console.log(`\nExplorer: https://explorer.solana.com/address/${mint}?cluster=devnet`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
