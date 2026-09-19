import nacl from "tweetnacl";
import { PublicKey } from "@solana/web3.js";

/** True when `signatureBase64` is this wallet's ed25519 signature over `message`. Never throws. */
export function verifyWalletSignature(wallet: string, message: string, signatureBase64: string): boolean {
  try {
    const pubkey = new PublicKey(wallet);
    const signature = Uint8Array.from(Buffer.from(signatureBase64, "base64"));
    if (signature.length !== 64) return false;
    return nacl.sign.detached.verify(new TextEncoder().encode(message), signature, pubkey.toBytes());
  } catch {
    return false;
  }
}
