"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { BIO_MAX, NAME_MAX, buildProfileClaimMessage, validateProfileInput, type Profile, type ProfileInput } from "@/lib/profiles";
import { setProfile } from "@/hooks/use-profiles";

/**
 * Claim or edit the connected wallet's profile. Saving asks the wallet to
 * sign a plain-text message that spells out exactly what's being saved;
 * the server checks that signature before writing. No email, no password.
 */
export function ProfileSheet({ existing, onClose }: { existing: Profile | null; onClose: () => void }) {
  const { publicKey, signMessage } = useWallet();
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
    if (!publicKey || !signMessage) {
      setError("Your wallet can't sign messages. Try Phantom or Solflare.");
      return;
    }
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStatus("signing");
    try {
      const wallet = publicKey.toBase58();
      const issuedAt = Date.now();
      const message = buildProfileClaimMessage(wallet, form, issuedAt);
      const sig = await signMessage(new TextEncoder().encode(message));
      setStatus("saving");
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet, profile: form, issuedAt, signature: Buffer.from(sig).toString("base64") }),
      });
      const data = (await res.json()) as { profile?: Profile; error?: string };
      if (!res.ok || !data.profile) throw new Error(data.error ?? "Couldn't save your profile.");
      setProfile(data.profile);
      setStatus("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(/user rejected|rejected the request/i.test(message) ? "You cancelled the signature. Nothing was saved." : message);
      setStatus("idle");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-neutral-900/40 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Your profile"
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {status === "done" ? (
          <div className="text-center">
            <h2 className="text-lg font-semibold text-neutral-900">Profile saved</h2>
            <p className="mt-2 text-sm text-neutral-600">
              You&apos;re <span className="font-semibold">@{form.handle.trim().toLowerCase()}</span> on Solera. Your name now
              shows wherever this wallet appears.
            </p>
            <button type="button" onClick={onClose} className="btn-primary mt-4 w-full">
              Done
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-neutral-900">{existing ? "Edit your profile" : "Claim your profile"}</h2>
            <p className="mt-1 text-xs leading-relaxed text-neutral-500">
              Identity on Solera is your wallet. Saving asks it to sign a short message, which proves the wallet is yours.
              No email, no password, nothing to leak.
            </p>
            <fieldset disabled={status !== "idle"} className="mt-4 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-neutral-600">Handle</span>
                <div className="mt-1 flex items-center rounded-xl border border-neutral-200 px-3">
                  <span className="text-neutral-400">@</span>
                  <input
                    value={form.handle}
                    onChange={(e) => setForm({ ...form, handle: e.target.value.toLowerCase() })}
                    placeholder="yourname"
                    maxLength={20}
                    autoCapitalize="none"
                    className="w-full bg-transparent py-2 text-sm outline-none"
                  />
                </div>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-neutral-600">Display name</span>
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="How you'd like to appear"
                  maxLength={NAME_MAX}
                  className="mt-1 w-full rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-neutral-600">Bio</span>
                <textarea
                  value={form.bio}
                  onChange={(e) => setForm({ ...form, bio: e.target.value })}
                  placeholder="What you invest in, and why"
                  maxLength={BIO_MAX}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-xl border border-neutral-200 px-3 py-2 text-sm outline-none"
                />
                <span className="text-[10px] text-neutral-400">{form.bio.length}/{BIO_MAX}</span>
              </label>
              <div className="flex items-center justify-between text-xs">
                <span className="text-neutral-500">Who can see it</span>
                <div className="flex rounded-full bg-neutral-100 p-0.5 font-semibold">
                  {(["public", "private"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm({ ...form, visibility: v })}
                      className={`rounded-full px-3 py-1 capitalize ${form.visibility === v ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </fieldset>
            {error && (
              <p role="alert" className="mt-3 text-xs text-rose-600">
                {error}
              </p>
            )}
            <button type="button" onClick={save} disabled={status !== "idle"} className="btn-primary mt-4 w-full disabled:opacity-50">
              {status === "signing" ? "Waiting for your wallet…" : status === "saving" ? "Saving…" : "Sign & save"}
            </button>
            <button type="button" onClick={onClose} className="mt-2 w-full rounded-full py-2 text-sm font-semibold text-neutral-500">
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
