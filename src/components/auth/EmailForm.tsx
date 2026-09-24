"use client";

import { useId, useState } from "react";
import { completeEmailSignIn } from "@/hooks/use-session";
import { NAME_MAX } from "@/lib/profiles";
import { friendlyAuthError, PASSWORD_MIN, validateEmailForm } from "@/lib/auth-copy";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { clearRecoveryPending } from "@/hooks/use-auth-user";

/**
 * Email + password on Supabase Auth (pages.md §1.7). Sign-up carries the
 * display name in user metadata; both paths trade the Supabase access
 * token for Solera's 30-day session, so every route sees one kind of
 * bearer. Email confirmation is expected to be off; if it is on, the sheet
 * says to confirm first instead of pretending the person is in.
 */
export function EmailForm({ tab, onSignedIn }: { tab: "login" | "signup"; onSignedIn?: () => void }) {
  const id = useId();
  const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function forgot() {
    const supabase = getSupabaseBrowser();
    if (!supabase || busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Type the email you signed up with first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?auth=account` });
      if (resetError) throw resetError;
      setNotice("Check your inbox for a reset link. It brings you back here to set a new password.");
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || busy) return;
    const problem = validateEmailForm(tab, { name, email, password });
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const cleanEmail = email.trim();
      if (tab === "signup") {
        // Confirmation links come back to this deployment, not the project's Site URL (Supabase falls back to that, and it defaults to localhost).
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { data: { display_name: name.trim() }, emailRedirectTo: `${window.location.origin}/?auth=account` },
        });
        if (signUpError) throw signUpError;
        if (!data.session) {
          setNotice("Check your inbox to confirm the email, then log in.");
          return;
        }
        await completeEmailSignIn(data.session.access_token);
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: cleanEmail, password });
        if (signInError) throw signInError;
        await completeEmailSignIn(data.session.access_token);
      }
      onSignedIn?.();
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-describedby={`${id}-note`} noValidate>
      <fieldset disabled={!configured || busy} className="m-0 min-w-0 space-y-2.5 border-0 p-0 disabled:[&_input]:opacity-60">
        {tab === "signup" && (
          <label className="field-label">
            <span>Display name</span>
            <div className="field">
              <input type="text" placeholder="How you'd like to appear" autoComplete="nickname" maxLength={NAME_MAX} value={name} onChange={(e) => setName(e.target.value)} data-autofocus />
            </div>
          </label>
        )}
        <label className="field-label">
          <span>Email</span>
          <div className="field">
            <input type="email" placeholder="you@example.com" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus={tab === "login" ? "" : undefined} />
          </div>
        </label>
        <label className="field-label">
          <span>Password</span>
          <div className="field">
            <input
              type="password"
              placeholder={tab === "signup" ? `At least ${PASSWORD_MIN} characters` : "Your password"}
              autoComplete={tab === "signup" ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </label>
        <button type="submit" className="btn-primary w-full" aria-busy={busy}>
          {busy ? (tab === "signup" ? "Creating your account…" : "Logging in…") : tab === "signup" ? "Create account" : "Log in"}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className="field-error mt-2">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-[11px] leading-relaxed text-fg">
          {notice}
        </p>
      )}
      <p id={`${id}-note`} className="mt-2 text-[11px] leading-relaxed text-muted">
        {configured ? (
          tab === "signup" ? (
            "Your name shows on the tape and in rooms. Practice only until you link a wallet."
          ) : (
            <>
              Forgot the password?{" "}
              <button type="button" className="text-link underline underline-offset-2" onClick={forgot} disabled={busy}>
                Email me a reset link
              </button>
              .
            </>
          )
        ) : (
          "Email sign-up isn't enabled on this deployment. Continue with your wallet."
        )}
      </p>
    </form>
  );
}

/** After a reset link signed the person in: set the new password once, then the account is ordinary again. */
export function NewPasswordForm() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowser();
    if (!supabase || busy) return;
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      clearRecoveryPending();
    } catch (err) {
      setError(friendlyAuthError(err instanceof Error ? err.message : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-3 rounded-[var(--radius-control)] border border-line bg-inset p-3" noValidate>
      <p className="text-xs text-fg">You came in from a reset link. Set a new password to finish.</p>
      <label className="field-label mt-2">
        <span>New password</span>
        <div className="field">
          <input type="password" autoComplete="new-password" placeholder={`At least ${PASSWORD_MIN} characters`} value={password} onChange={(e) => setPassword(e.target.value)} data-autofocus />
        </div>
      </label>
      <button type="submit" className="btn-primary mt-2 w-full" disabled={busy} aria-busy={busy}>
        {busy ? "Saving…" : "Save new password"}
      </button>
      {error && (
        <p role="alert" className="field-error mt-2">
          {error}
        </p>
      )}
    </form>
  );
}
