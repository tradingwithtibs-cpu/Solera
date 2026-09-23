import { VersionedTransaction } from "@solana/web3.js";
import { stageContinuation, type Continuation } from "./deferred-signing";
import { getTriggerClient, TriggerError, type CraftedDeposit, type TriggerClient } from "./jupiter-trigger";
import type { PriceOrderBody, TriggerMapping } from "./jupiter-trigger-map";
import { plansClient, PlansClientError } from "./plans-client";
import type { Plan } from "./plans";

/**
 * The six steps that turn a proposed live plan into a Jupiter Trigger order
 * (docs/port/agent-ux.md §3.1, §3.2, §3.4; backend.md §9.4, §9.6), free of
 * React so the arm sheet, the cancel sheet and the iOS resumer share them.
 * A deferred wallet (Phantom over deeplinks) leaves the page at each
 * signature; the continuation staged just before carries what the return
 * page needs to finish.
 */
export type TriggerOk = Extract<TriggerMapping, { ok: true }>;

export interface ArmWallet {
  publicKey: string;
  signMessage?: (bytes: Uint8Array) => Promise<Uint8Array>;
  signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;
  /** Phantom deeplinks on iOS Safari: signing leaves the page. */
  deferred?: boolean;
}

export type ArmStep = "auth" | "vault" | "craft" | "deposit" | "create" | "record";
export interface ArmProgress {
  step: ArmStep;
  challenge?: string;
  vault?: string;
  orderId?: string;
}

export interface ArmResult {
  orderId: string;
  txSignature: string;
  vault: string;
  plan: Plan | null;
  recorded: boolean;
  recordError?: string;
}

export const STEP_LABELS: Record<ArmStep, string> = {
  auth: "Waiting for your wallet…",
  vault: "Setting up your Jupiter vault…",
  craft: "Preparing the deposit…",
  deposit: "Waiting for your wallet…",
  create: "Sending the deposit to Jupiter…",
  record: "Recording the order…",
};

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

/** Jupiter's and the wallet's errors, said the way the sheet says things (agent-ux §3.1). */
export function friendlyTriggerError(err: unknown, step: ArmStep | "cancel"): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/user rejected|rejected the request|cancel/i.test(message) && (step === "deposit" || step === "cancel")) return step === "cancel" ? "You cancelled the withdrawal. The order is still cancelling; tap Finish withdrawal when you're ready." : "You cancelled the deposit. Nothing was moved.";
  if (/user rejected|rejected the request/i.test(message)) return "You cancelled the signature. Nothing was moved.";
  if (err instanceof TriggerError) {
    if (err.status === 401) return step === "auth" ? "That Jupiter sign-in expired. Tap Arm it again — nothing was moved." : "Jupiter's sign-in expired. Tap Arm it again — nothing was moved.";
    if (err.status === 403) return "This wallet doesn't match the one that signed in. Reconnect and try again.";
    if (err.status === 429) return "Jupiter is rate-limiting right now. Wait a moment and try again.";
    return err.message;
  }
  if (err instanceof PlansClientError) return err.message;
  return message || "Something went wrong.";
}

export function armContinuationFor(plan: Plan, wallet: string, challenge: string, purpose: "arm" | "cancel"): Continuation {
  return { kind: "trigger-auth", planId: plan.id, wallet, challenge, issuedAt: Date.now(), purpose };
}

/**
 * Arms `plan` on Jupiter. Returns "deferred" when the wallet left the page
 * to sign; the resumer finishes from the staged continuation. `resume`
 * carries what an earlier hop already did.
 */
export async function armWithJupiter(a: {
  plan: Plan;
  mapping: TriggerOk;
  wallet: ArmWallet;
  sessionToken: string;
  client?: TriggerClient;
  onProgress?: (p: ArmProgress) => void;
  resume?: { jwt?: string; vault?: string; crafted?: CraftedDeposit };
}): Promise<ArmResult | "deferred"> {
  const client = a.client ?? getTriggerClient();
  const w = a.wallet;
  const progress = a.onProgress ?? (() => {});
  const order: PriceOrderBody = a.mapping.order;

  // 1. Sign in with Jupiter (skipped while the 24 h token is cached).
  let jwt = a.resume?.jwt ?? client.cachedToken(w.publicKey);
  if (!jwt) {
    if (!w.signMessage) throw new Error("This wallet can't sign messages here. Try another wallet.");
    const challenge = await client.getChallenge(w.publicKey);
    progress({ step: "auth", challenge: challenge.challenge });
    const bytes = new TextEncoder().encode(challenge.challenge);
    if (w.deferred) {
      stageContinuation(armContinuationFor(a.plan, w.publicKey, challenge.challenge, "arm"));
      void w.signMessage(bytes).catch(() => {});
      return "deferred";
    }
    jwt = await client.authenticate({ publicKey: w.publicKey, signMessage: w.signMessage }, challenge);
  }

  // 2. The vault (registered once, no signature).
  progress({ step: "vault" });
  const vault = a.resume?.vault ?? (await client.ensureVault(jwt)).vaultPubkey;

  // 3. The deposit transaction, crafted by Jupiter.
  progress({ step: "craft", vault });
  const crafted =
    a.resume?.crafted ??
    (await client.craftDeposit(jwt, { inputMint: order.inputMint, outputMint: order.outputMint, userAddress: w.publicKey, amount: order.inputAmount, orderType: "price", orderSubType: order.orderSubType }));

  // 4. The person signs the deposit.
  progress({ step: "deposit", vault });
  if (!w.signTransaction) throw new Error("This wallet can't sign transactions here. Try another wallet.");
  const tx = VersionedTransaction.deserialize(Buffer.from(crafted.transaction, "base64"));
  const depositText = `${a.mapping.deposit.amount.toLocaleString("en-US", { maximumFractionDigits: 4 })} ${a.mapping.deposit.unit}`;
  if (w.deferred) {
    stageContinuation({
      kind: "trigger-deposit",
      planId: a.plan.id,
      wallet: w.publicKey,
      token: jwt,
      tokenExp: client.tokenExpiry(w.publicKey) ?? Date.now() + 23 * 60 * 60_000,
      requestId: crafted.requestId,
      order,
      vault,
      expiresAt: a.mapping.expiresAt,
      depositText,
    });
    void w.signTransaction(tx).catch(() => {});
    return "deferred";
  }
  const signed = await w.signTransaction(tx);

  // 5. Create the order; the deposit lands during this call.
  progress({ step: "create", vault });
  const created = await client.createPriceOrder(jwt, { ...order, depositRequestId: crafted.requestId, depositSignedTx: base64(signed.serialize()) });

  // 6. Record it on the plan (the server verifies the deposit on-chain).
  progress({ step: "record", vault, orderId: created.id });
  return recordArm(a.plan.id, a.sessionToken, { orderId: created.id, txSignature: created.txSignature, depositConfirmed: created.depositConfirmed }, a.mapping.expiresAt, vault);
}

/** PATCHes the armed plan; on a 409 (RPC hasn't seen the deposit yet) waits and tries twice more. */
export async function recordArm(planId: string, sessionToken: string, created: { orderId: string; txSignature: string; depositConfirmed: boolean }, expiresAt: number, vault: string): Promise<ArmResult> {
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const plan = await plansClient.armTrigger(sessionToken, planId, { orderId: created.orderId, depositSignature: created.txSignature, expiresAt, depositConfirmed: created.depositConfirmed });
      return { orderId: created.orderId, txSignature: created.txSignature, vault, plan, recorded: true };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (!(err instanceof PlansClientError && err.status === 409)) break;
      await new Promise((r) => setTimeout(r, 4_000));
    }
  }
  return { orderId: created.orderId, txSignature: created.txSignature, vault, plan: null, recorded: false, recordError: lastError };
}

/** After the iOS sign-in hop: the token, so the arm sheet can reopen at step 2. */
export async function finishTriggerAuth(wallet: string, signature: Uint8Array, client = getTriggerClient()): Promise<{ jwt: string; exp: number }> {
  const { token, exp } = await client.verifySignature(wallet, signature);
  return { jwt: token, exp };
}

/** After the iOS deposit hop: create the order and record it. */
export async function finishTriggerDeposit(c: Extract<Continuation, { kind: "trigger-deposit" }>, signedTx: Uint8Array, sessionToken: string, client = getTriggerClient()): Promise<ArmResult> {
  client.remember(c.wallet, c.token, c.tokenExp);
  const created = await client.createPriceOrder(c.token, { ...c.order, depositRequestId: c.requestId, depositSignedTx: base64(signedTx) });
  return recordArm(c.planId, sessionToken, { orderId: created.id, txSignature: created.txSignature, depositConfirmed: created.depositConfirmed }, c.expiresAt, c.vault);
}

export interface CancelResult {
  txSignature: string;
  plan: Plan | null;
  recordError?: string;
}

/**
 * Cancels a Jupiter order and withdraws the deposit (two Jupiter calls, one
 * signature; a sign-in first when no token is cached). "deferred" means the
 * wallet left the page; the resumer finishes it.
 */
export async function cancelWithJupiter(a: {
  plan: Plan;
  wallet: ArmWallet;
  sessionToken: string;
  depositText: string;
  client?: TriggerClient;
  onProgress?: (label: string) => void;
  resume?: { jwt?: string };
}): Promise<CancelResult | "deferred"> {
  const client = a.client ?? getTriggerClient();
  const w = a.wallet;
  const progress = a.onProgress ?? (() => {});
  if (!a.plan.triggerOrderId) throw new Error("This plan has no Jupiter order to cancel.");
  let jwt = a.resume?.jwt ?? client.cachedToken(w.publicKey);
  if (!jwt) {
    if (!w.signMessage) throw new Error("This wallet can't sign messages here.");
    const challenge = await client.getChallenge(w.publicKey);
    progress("Sign in with your wallet to talk to Jupiter…");
    if (w.deferred) {
      stageContinuation(armContinuationFor(a.plan, w.publicKey, challenge.challenge, "cancel"));
      void w.signMessage(new TextEncoder().encode(challenge.challenge)).catch(() => {});
      return "deferred";
    }
    jwt = await client.authenticate({ publicKey: w.publicKey, signMessage: w.signMessage }, challenge);
  }
  progress("Cancelling the order…");
  const cancel = await client.initiateCancel(jwt, a.plan.triggerOrderId);
  if (!w.signTransaction) throw new Error("This wallet can't sign transactions here.");
  const tx = VersionedTransaction.deserialize(Buffer.from(cancel.transaction, "base64"));
  progress("Waiting for your wallet…");
  if (w.deferred) {
    stageContinuation({ kind: "trigger-withdraw", planId: a.plan.id, wallet: w.publicKey, orderId: a.plan.triggerOrderId, cancelRequestId: cancel.requestId, token: jwt, tokenExp: client.tokenExpiry(w.publicKey) ?? Date.now() + 23 * 60 * 60_000, depositText: a.depositText });
    void w.signTransaction(tx).catch(() => {});
    return "deferred";
  }
  const signed = await w.signTransaction(tx);
  progress("Returning your funds…");
  const confirmed = await client.confirmCancel(jwt, a.plan.triggerOrderId, base64(signed.serialize()), cancel.requestId);
  return recordCancel(a.plan.id, a.sessionToken, confirmed.txSignature);
}

async function recordCancel(planId: string, sessionToken: string, txSignature: string): Promise<CancelResult> {
  try {
    const plan = await plansClient.cancelTrigger(sessionToken, planId, txSignature);
    return { txSignature, plan };
  } catch (err) {
    return { txSignature, plan: null, recordError: err instanceof Error ? err.message : String(err) };
  }
}

/** After the iOS withdrawal hop. */
export async function finishTriggerWithdraw(c: Extract<Continuation, { kind: "trigger-withdraw" }>, signedTx: Uint8Array, sessionToken: string, client = getTriggerClient()): Promise<CancelResult> {
  client.remember(c.wallet, c.token, c.tokenExp);
  const confirmed = await client.confirmCancel(c.token, c.orderId, base64(signedTx), c.cancelRequestId);
  return recordCancel(c.planId, sessionToken, confirmed.txSignature);
}
