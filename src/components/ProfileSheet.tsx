"use client";

import { useId, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSession } from "@/hooks/use-session";
import { BIO_MAX, NAME_MAX, buildProfileClaimMessage, validateProfileInput, type Profile, type ProfileInput } from "@/lib/profiles";
import { setProfile } from "@/hooks/use-profiles";
import { isDeferredSigner, stageContinuation } from "@/lib/deferred-signing";
import { Sheet, SheetHead } from "./auth/Sheet";
import { CheckCircleIcon } from "./icons";

/** An email account's profile: the session is the proof, nothing is signed. */
export async function submitProfileForUser(token: string, profile: ProfileInput): Promise<Profile> {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ profile }),
  });
  const data = (await res.json()) as { profile?: Profile; error?: string };
  if (!res.ok || !data.profile) throw new Error(data.error ?? "Couldn't save your profile.");
  return data.profile;
}

/** An email account links the wallet it just connected: the wallet signs the link message, the session proves the account. */
export async function submitWalletLink(token: string, wallet: string, issuedAt: number, signatureBase64: string): Promise<Profile> {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ link: { wallet, issuedAt, signature: signatureBase64 } }),
  });
  const data = (await res.json()) as { profile?: Profile; error?: string };
  if (!res.ok || !data.profile) throw new Error(data.error ?? "Couldn't link the wallet.");
  return data.profile;
}

/** POSTs a signed claim; shared with the deeplink resumer, which has the signature but not this sheet. */
export async function submitProfileClaim(wallet: string, profile: ProfileInput, issuedAt: number, signatureBase64: string): Promise<Profile> {
  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ wallet, profile, issuedAt, signature: signatureBase64 }),
  });
  const data = (await res.json()) as { profile?: Profile; error?: string };
  if (!res.ok || !data.profile) throw new Error(data.error ?? "Couldn't save your profile.");
  return data.profile;
}

/**
 * Claim or edit the connected wallet's profile. Saving asks the wallet to
 * sign a plain-text message that spells out exactly what's being saved;
 * the server checks that signature before writing. No email, no password.
 */
export function ProfileSheet({ existing, onClose }: { existing: Profile | null; onClose: () => void }) {
  const id = useId();
  const { publicKey, signMessage, wallet: connected } = useWallet();
  const session = useSession();
  const emailAccount = !publicKey && session.kind === "user" && !!session.token;
  const [form, setForm] = useState<ProfileInput>({
    handle: existing?.handle ?? "",
    name: existing?.name ?? "",
    bio: existing?.bio ?? "",
    visibility: existing?.visibility ?? "public",
  });
  const [status, setStatus] = useState<"idle" | "signing" | "saving" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const problem = validateProfileInput(form);

  async function save() {
    if (problem) {
      setError(problem);
      return;
    }
    if (emailAccount) {
      setError(null);
      setStatus("saving");
      try {
        const saved = await submitProfileForUser(session.token!, form);
        setProfile(saved);
        setStatus("done");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
        setStatus("idle");
      }
      return;
    }
    if (!publicKey || !signMessage) {
      setError("Your wallet can't sign messages. Try Phantom or Solflare.");
      return;
    }
    setError(null);
    setStatus("signing");
    try {
      const wallet = publicKey.toBase58();
      const issuedAt = Date.now();
      const message = buildProfileClaimMessage(wallet, form, issuedAt);
      // On iOS Safari the signature comes back on a fresh page load; DeepLinkResumer finishes the save.
      if (isDeferredSigner(connected?.adapter)) stageContinuation({ kind: "profile", wallet, profile: form, issuedAt });
      const sig = await signMessage(new TextEncoder().encode(message));
      setStatus("saving");
      const saved = await submitProfileClaim(wallet, form, issuedAt, Buffer.from(sig).toString("base64"));
      setProfile(saved);
      setStatus("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(/user rejected|rejected the request/i.test(message) ? "You cancelled the signature. Nothing was saved." : message);
      setStatus("idle");
    }
  }

  const pending = status === "signing" || status === "saving";

  return (
    <Sheet labelledBy={id} onClose={onClose} locked={pending} narrow>
      {status === "done" ? (
        <div className="text-center">
          <CheckCircleIcon className="mx-auto h-10 w-10 text-gain" />
          <h3 id={id}>Profile saved</h3>
          <p className="sheet-text">
            You&apos;re <b>@{form.handle.trim().toLowerCase()}</b> on Solera. Your name now shows wherever {emailAccount ? "you post" : "this wallet appears"}.
          </p>
          <button type="button" onClick={onClose} className="btn-primary w-full">
            Done
          </button>
        </div>
      ) : (
        <>
          <SheetHead eyebrow={emailAccount ? "Email account" : "Wallet"} title={existing ? "Edit your profile" : "Claim your profile"} id={id} onClose={pending ? undefined : onClose} />
          <p className="sheet-text">
            {emailAccount
              ? "A handle and a name people see on the tape and in rooms. Link a wallet later to trade live."
              : "Identity on Solera is your wallet. Saving asks it to sign a short message, which proves the wallet is yours. No email, no password, nothing to leak."}
          </p>
          <fieldset disabled={pending} className="m-0 min-w-0 space-y-3 border-0 p-0">
            <label className="field-label">
              <span>Handle</span>
              <div className="field">
                <span className="pl-3 text-muted">@</span>
                <input
                  value={form.handle}
                  onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
                  placeholder="yourname"
                  maxLength={20}
                  autoCapitalize="none"
                  autoComplete="username"
                  className="!pl-1"
                />
              </div>
            </label>
            <label className="field-label">
              <span>Display name</span>
              <div className="field">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="How you'd like to appear"
                  maxLength={NAME_MAX}
                  autoComplete="nickname"
                />
              </div>
            </label>
            <label className="field-label">
              <span>
                Bio{" "}
                <em className="font-sans text-[11px] font-medium normal-case tracking-normal not-italic">
                  {form.bio.length}/{BIO_MAX}
                </em>
              </span>
              <div className="field">
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="What you invest in, and why"
                  maxLength={BIO_MAX}
                  rows={2}
                  className="block resize-none"
                />
              </div>
            </label>
            <div className="flex items-center justify-between gap-3">
              <span className="eyebrow">Who can see it</span>
              <div className="seg" role="group" aria-label="Who can see your profile">
                {(["public", "private"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={form.visibility === v} onClick={() => setForm({ ...form, visibility: v })}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </fieldset>
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          <div className="sheet-actions mt-4">
            <button type="button" onClick={save} disabled={pending} aria-busy={pending} className="btn-primary flex-1">
              {status === "signing" ? "Waiting for your wallet…" : status === "saving" ? "Saving…" : emailAccount ? "Save" : "Sign & save"}
            </button>
            <button type="button" onClick={onClose} disabled={pending} className="btn-ghost">
              Not now
            </button>
          </div>
          <p className="sheet-foot">{emailAccount ? "Your account is the proof; nothing is signed." : "The signature proves the wallet is yours. No transaction, no fee."}</p>
        </>
      )}
    </Sheet>
  );
}
