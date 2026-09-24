const ACCESS_TOKEN_KEY = 'xgou_access_token';
const AUTHENTICATED_WALLET_KEY = 'xgou_authenticated_wallet';

export interface StoredSession {
  readonly accessToken: string;
  readonly walletAddress: string;
}

export function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const accessToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  const walletAddress = window.sessionStorage.getItem(AUTHENTICATED_WALLET_KEY);
  return accessToken && walletAddress ? { accessToken, walletAddress } : null;
}

export function writeSession(session: StoredSession): void {
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  window.sessionStorage.setItem(AUTHENTICATED_WALLET_KEY, session.walletAddress.toLowerCase());
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTHENTICATED_WALLET_KEY);
}

export function getAccessToken(): string | null {
  return readSession()?.accessToken ?? null;
}
