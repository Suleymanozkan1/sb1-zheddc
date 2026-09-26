// Transaction builders using @solana/kit + @solana-program/token (standard SPL token transfers,
// no custom on-chain program). Deposit transactions are built server-side so the recipient,
// mint and amount are fixed; the user's wallet only signs.

import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  blockhash as toBlockhash,
  compileTransaction,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  pipe,
  setTransactionMessageFeePayer,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Address,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
} from "@solana-program/token";

export async function getAssociatedTokenAddress(owner: string, mint: string): Promise<string> {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  return ata;
}

/** Adds a read-only, non-signer reference key to an instruction (Solana Pay style correlation). */
function withReference(ix: Instruction, reference: Address): Instruction {
  return { ...ix, accounts: [...(ix.accounts ?? []), { address: reference, role: AccountRole.READONLY }] };
}

export interface DepositTxInput {
  payer: string;
  mint: string;
  decimals: number;
  amount: bigint;
  treasuryOwner: string;
  reference: string;
  blockhash: string;
  lastValidBlockHeight: bigint;
}

/**
 * Builds the unsigned deposit transaction (base64 wire format) for the player's wallet to sign.
 * The treasury token account must already exist (created by `pnpm devnet:setup`).
 */
export async function buildDepositTransaction(input: DepositTxInput): Promise<{ transaction: string; recipientTokenAccount: string }> {
  const payer = address(input.payer);
  const mint = address(input.mint);
  const source = await getAssociatedTokenAddress(input.payer, input.mint);
  const destination = await getAssociatedTokenAddress(input.treasuryOwner, input.mint);

  const transfer = withReference(
    getTransferCheckedInstruction({
      source: address(source),
      mint,
      destination: address(destination),
      authority: payer,
      amount: input.amount,
      decimals: input.decimals,
    }),
    address(input.reference),
  );

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: toBlockhash(input.blockhash), lastValidBlockHeight: input.lastValidBlockHeight }, m),
    (m) => appendTransactionMessageInstructions([transfer], m),
  );

  const compiled = compileTransaction(message);
  return { transaction: getBase64EncodedWireTransaction(compiled), recipientTokenAccount: destination };
}

export interface WithdrawalTxInput {
  signer: TransactionSigner;
  recipient: string;
  mint: string;
  decimals: number;
  amount: bigint;
  blockhash: string;
  lastValidBlockHeight: bigint;
}

/** Builds and signs a withdrawal transfer from the treasury. Returns the signature before sending. */
export async function buildSignedWithdrawalTransaction(
  input: WithdrawalTxInput,
): Promise<{ signature: string; wireTransaction: string }> {
  const mint = address(input.mint);
  const recipient = address(input.recipient);
  const source = await getAssociatedTokenAddress(input.signer.address, input.mint);
  const destination = await getAssociatedTokenAddress(input.recipient, input.mint);

  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(input.signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: toBlockhash(input.blockhash), lastValidBlockHeight: input.lastValidBlockHeight }, m),
    (m) =>
      appendTransactionMessageInstructions(
        [
          getCreateAssociatedTokenIdempotentInstruction({ payer: input.signer, ata: address(destination), owner: recipient, mint }),
          getTransferCheckedInstruction({
            source: address(source),
            mint,
            destination: address(destination),
            authority: input.signer,
            amount: input.amount,
            decimals: input.decimals,
          }),
        ],
        m,
      ),
  );

  const signed = await signTransactionMessageWithSigners(message);
  return { signature: getSignatureFromTransaction(signed), wireTransaction: getBase64EncodedWireTransaction(signed) };
}
