const ACCESS_TOKEN_KEY = 'xgou_access_token';
const AUTHENTICATED_WALLET_KEY = 'xgou_authenticated_wallet';
const CSRF_TOKEN_KEY = 'xgou_csrf_token';

export interface StoredSession {
  readonly accessToken: string;
  readonly walletAddress: string;
  readonly csrfToken?: string;
}

export function readSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const accessToken = window.sessionStorage.getItem(ACCESS_TOKEN_KEY);
  const walletAddress = window.sessionStorage.getItem(AUTHENTICATED_WALLET_KEY);
  const csrfToken = window.sessionStorage.getItem(CSRF_TOKEN_KEY);
  return accessToken && walletAddress ? { accessToken, walletAddress, ...(csrfToken ? { csrfToken } : {}) } : null;
}

export function writeSession(session: StoredSession): void {
  window.sessionStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken);
  window.sessionStorage.setItem(AUTHENTICATED_WALLET_KEY, session.walletAddress.toLowerCase());
  if (session.csrfToken) window.sessionStorage.setItem(CSRF_TOKEN_KEY, session.csrfToken);
}

export function clearSession(): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  window.sessionStorage.removeItem(AUTHENTICATED_WALLET_KEY);
  window.sessionStorage.removeItem(CSRF_TOKEN_KEY);
}

export function getAccessToken(): string | null {
  return readSession()?.accessToken ?? null;
}

export type ApiErrorCode = 'AUTH_REQUIRED' | 'WRONG_NETWORK' | 'INSUFFICIENT_BALANCE' | 'INSUFFICIENT_GAS' | 'APPROVAL_REJECTED' | 'TX_REJECTED' | 'TX_REVERTED' | 'DEPOSIT_TIMEOUT' | 'API_UNAVAILABLE' | 'UNKNOWN';

export class XgouApiError extends Error {
  constructor(readonly code: ApiErrorCode, message: string, readonly status?: number) { super(message); this.name = 'XgouApiError'; }
}

const cookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  return document.cookie.split(';').map((value) => value.trim()).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
};

const errorFor = (status: number): XgouApiError => status === 401
  ? new XgouApiError('AUTH_REQUIRED', '请连接钱包并完成 SIWE 登录。', status)
  : new XgouApiError('API_UNAVAILABLE', '数据暂时不可用，请稍后刷新。', status);

export async function apiRequest<T>(baseUrl: string, path: string, init: RequestInit = {}, retryRefresh = true): Promise<T> {
  const session = readSession();
  const headers = new Headers(init.headers);
  if (session?.accessToken) headers.set('authorization', `Bearer ${session.accessToken}`);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  let response: Response;
  try { response = await fetch(`${baseUrl}${path}`, { ...init, headers, credentials: 'include' }); }
  catch { throw new XgouApiError('API_UNAVAILABLE', '无法连接 XGOU API。'); }
  if (response.status === 401 && retryRefresh && session) {
    const csrf = session.csrfToken ?? cookie('xgou_csrf');
    if (csrf) {
      const refreshed = await fetch(`${baseUrl}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'x-csrf-token': decodeURIComponent(csrf) } }).catch(() => null);
      if (refreshed?.ok) {
        const tokens = await refreshed.json() as { accessToken: string; csrfToken: string };
        writeSession({ ...session, accessToken: tokens.accessToken, csrfToken: tokens.csrfToken });
        return apiRequest<T>(baseUrl, path, init, false);
      }
    }
    clearSession();
  }
  if (!response.ok) throw errorFor(response.status);
  return response.json() as Promise<T>;
}
