// Must be imported first: some Solana libraries (used by wallet-adapter) expect a global Buffer.
import { Buffer } from "buffer";

(globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
