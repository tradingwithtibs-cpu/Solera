import {
  BaseMessageSignerWalletAdapter,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletReadyState,
  isVersionedTransaction,
  type SupportedTransactionVersions,
  type TransactionOrVersionedTransaction,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { PublicKey } from "@solana/web3.js";
import {
  buildConnectUrl,
  buildSignUrl,
  decryptPayload,
  deriveSharedSecret,
  encryptPayload,
  generateDappKeyPair,
  parseReturnParams,
  stripReturnParams,
  toBase58,
  type ConnectResponse,
  type DappKeyPair,
} from "./phantom-deeplink";
import {
  newRequestId,
  readPending,
  savePending,
  saveResult,
  takeStagedContinuation,
  type DeepLinkResult,
  type PendingRequest,
} from "./deferred-signing";
import { hasInjectedWallet, isAndroid, isMobileBrowser } from "./mobile-wallet";

export const PhantomDeepLinkWalletName = "Phantom (Safari)" as WalletName<"Phantom (Safari)">;

const STORE_KEY = "solera:phantom-deeplink";

interface Store {
  dapp: DappKeyPair;
  phantomPublicKey?: string;
  session?: string;
  wallet?: string;
}

function loadStore(): Store | null {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Store) : null;
  } catch {
    return null;
  }
}

function saveStore(store: Store | null) {
  try {
    if (store) window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
    else window.localStorage.removeItem(STORE_KEY);
  } catch {
    // Without storage the round trip can't complete; connect() will just fail to resume.
  }
}

/** Where Phantom sends the user back: this page, without any query string (Phantom adds its own). */
function redirectLink(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

/** Set in the tab that started a round trip, so it can refresh once another tab finishes it. */
let initiatedHere = false;
export function didInitiateDeepLinkHere(): boolean {
  return initiatedHere;
}

/**
 * Phantom for iPhone users who are in Safari, not in Phantom's own browser.
 * Every operation is a hop into the Phantom app and back: connect once
 * (key exchange, a session token Phantom remembers), then each signature
 * is one more hop. The promise returned by connect/sign never settles in
 * the tab that started it: the page is navigating away, and the answer
 * arrives on a fresh page load, where the constructor decrypts it and
 * DeepLinkResumer finishes whatever was staged (see deferred-signing.ts).
 *
 * Only offered on a phone with no injected wallet and no Mobile Wallet
 * Adapter (i.e. iOS Safari); everywhere else it reports Unsupported and
 * the wallet picker never lists it.
 */
export class PhantomDeepLinkWalletAdapter extends BaseMessageSignerWalletAdapter {
  name = PhantomDeepLinkWalletName;
  url = "https://phantom.app";
  icon: string;
  /** Tells trade/profile code to stage a continuation before asking for a signature. */
  readonly deferred = true;
  supportedTransactionVersions: SupportedTransactionVersions = new Set(["legacy", 0]);

  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _readyState: WalletReadyState;

  constructor({ icon }: { icon: string }) {
    super();
    this.icon = icon;
    this._readyState =
      typeof window !== "undefined" && isMobileBrowser() && !hasInjectedWallet() && !isAndroid()
        ? WalletReadyState.Loadable
        : WalletReadyState.Unsupported;
    if (this._readyState === WalletReadyState.Loadable) this.processReturn();
  }

  get publicKey() {
    return this._publicKey;
  }
  get connecting() {
    return this._connecting;
  }
  get readyState() {
    return this._readyState;
  }

  /** A page load with a remembered session reconnects silently; one without never starts a hop on its own. */
  async autoConnect(): Promise<void> {
    if (this._readyState !== WalletReadyState.Loadable) return;
    const store = loadStore();
    if (store?.session && store.wallet) await this.connect();
  }

  async connect(): Promise<void> {
    if (this.connected || this._connecting) return;
    if (this._readyState !== WalletReadyState.Loadable) throw new WalletNotReadyError();

    const store = loadStore();
    if (store?.session && store.wallet) {
      this._publicKey = new PublicKey(store.wallet);
      this.emit("connect", this._publicKey);
      return;
    }

    this._connecting = true;
    const dapp = store?.dapp ?? generateDappKeyPair();
    saveStore({ dapp });
    this.begin("connect", buildConnectUrl({ dappPublicKey: dapp.publicKey, appUrl: window.location.origin, redirectLink: redirectLink() }));
    await new Promise<void>(() => {});
  }

  async disconnect(): Promise<void> {
    const store = loadStore();
    if (store) saveStore({ dapp: store.dapp });
    this._publicKey = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends TransactionOrVersionedTransaction<this["supportedTransactionVersions"]>>(transaction: T): Promise<T> {
    const store = this.requireSession();
    const bytes = isVersionedTransaction(transaction)
      ? transaction.serialize()
      : transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    const secret = deriveSharedSecret(store.phantomPublicKey!, store.dapp.secretKey);
    const { nonce, payload } = encryptPayload({ transaction: toBase58(bytes), session: store.session }, secret);
    this.begin("signTransaction", buildSignUrl("signTransaction", { dappPublicKey: store.dapp.publicKey, nonce, payload, redirectLink: redirectLink() }));
    await new Promise<void>(() => {});
    return transaction;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    const store = this.requireSession();
    const secret = deriveSharedSecret(store.phantomPublicKey!, store.dapp.secretKey);
    const { nonce, payload } = encryptPayload({ message: toBase58(message), session: store.session, display: "utf8" }, secret);
    this.begin("signMessage", buildSignUrl("signMessage", { dappPublicKey: store.dapp.publicKey, nonce, payload, redirectLink: redirectLink() }));
    await new Promise<void>(() => {});
    return message;
  }

  private requireSession(): Store {
    const store = loadStore();
    if (!this._publicKey || !store?.session || !store.phantomPublicKey) throw new WalletNotConnectedError();
    return store;
  }

  /** Record what we're waiting for, then hand the page to Phantom. */
  private begin(request: PendingRequest["request"], url: string) {
    const pending: PendingRequest = {
      id: newRequestId(),
      request,
      returnTo: window.location.href,
      createdAt: Date.now(),
      continuation: request === "connect" ? undefined : takeStagedContinuation(),
    };
    savePending(pending);
    initiatedHere = true;
    window.location.href = url;
  }

  /** On a page load that is Phantom's reply: decrypt it, file the result, tidy the URL. */
  private processReturn() {
    const params = parseReturnParams(window.location.search);
    if (!params) return;
    const cleanUrl = stripReturnParams(window.location.href);
    const pending = readPending();
    if (!pending) {
      window.history.replaceState(null, "", cleanUrl);
      return;
    }

    const store = loadStore();
    let result: DeepLinkResult;
    if (params.errorCode) {
      const message = params.errorMessage ?? `Phantom returned error ${params.errorCode}`;
      // A session Phantom no longer honours: forget it so the next connect does a fresh handshake.
      if (store && /session|unauthorized|invalid/i.test(message) && pending.request !== "connect") saveStore({ dapp: store.dapp });
      result = { id: pending.id, request: pending.request, error: message };
    } else {
      try {
        if (!store || !params.data || !params.nonce) throw new Error("Phantom's reply was incomplete.");
        if (pending.request === "connect") {
          if (!params.phantomPublicKey) throw new Error("Phantom's reply was incomplete.");
          const secret = deriveSharedSecret(params.phantomPublicKey, store.dapp.secretKey);
          const resp = decryptPayload<ConnectResponse>(params.data, params.nonce, secret);
          saveStore({ dapp: store.dapp, phantomPublicKey: params.phantomPublicKey, session: resp.session, wallet: resp.public_key });
          result = { id: pending.id, request: "connect", payload: resp.public_key };
        } else {
          if (!store.phantomPublicKey) throw new Error("No Phantom session. Connect again.");
          const secret = deriveSharedSecret(store.phantomPublicKey, store.dapp.secretKey);
          const resp = decryptPayload<{ transaction?: string; signature?: string }>(params.data, params.nonce, secret);
          const payload = pending.request === "signTransaction" ? resp.transaction : resp.signature;
          if (!payload) throw new Error("Phantom's reply had no signature.");
          result = { id: pending.id, request: pending.request, payload };
        }
      } catch (err) {
        result = { id: pending.id, request: pending.request, error: err instanceof Error ? err.message : "Could not read Phantom's reply." };
      }
    }
    saveResult(result);
    // The pending record stays until DeepLinkResumer consumes it alongside the result.
    window.history.replaceState(null, "", cleanUrl);
  }
}
