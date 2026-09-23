/**
 * The claimed-profile check (design-system §4.12): shown only beside a name
 * that was claimed with a wallet signature through /api/profile. It means
 * "this handle is this wallet", nothing else.
 */
export function Verified() {
  return (
    <i className="verified" role="img" aria-label="Verified wallet" title="Claimed with a wallet signature">
      <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M2.5 6.4l2.3 2.3L9.6 3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </i>
  );
}
