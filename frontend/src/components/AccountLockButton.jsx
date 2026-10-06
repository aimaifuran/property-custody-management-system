import Skeleton from './Skeleton';

// Lock artwork and animation adapted from Uiverse.io by mobinkakei.
export default function AccountLockButton({ locked, username, busy = false, disabled = false, onClick }) {
  return <button type="button" role="switch" aria-checked={Boolean(locked)} aria-label={`Account lock for ${username}`} aria-busy={busy} title={`${locked ? 'Unlock' : 'Lock'} ${username}`} className="account-lock" disabled={disabled || busy} onClick={onClick}>
    {busy && <Skeleton className="h-4 w-4" style={{ position: 'absolute' }} label="Updating account lock" />}<svg style={{ visibility: busy ? 'hidden' : undefined }} width="36" height="40" viewBox="0 0 36 40" aria-hidden="true">
      <path className="account-lock__body" d="M27 27C27 34.1797 21.1797 40 14 40C6.8203 40 1 34.1797 1 27C1 19.8203 6.8203 14 14 14C21.1797 14 27 19.8203 27 27ZM15.6298 26.5191C16.4544 25.9845 17 25.056 17 24C17 22.3431 15.6569 21 14 21C12.3431 21 11 22.3431 11 24C11 25.056 11.5456 25.9845 12.3702 26.5191L11 32H17L15.6298 26.5191Z" />
      <path className="account-lock__shackle" d="M6 21V10C6 5.58172 9.58172 2 14 2V2C18.4183 2 22 5.58172 22 10V21" />
      <path className="account-lock__bling" d="M29 20L31 22" />
      <path className="account-lock__bling" d="M31.5 15H34.5" />
      <path className="account-lock__bling" d="M29 10L31 8" />
    </svg>
  </button>;
}
