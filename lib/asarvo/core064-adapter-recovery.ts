/** CORE064: conservative, deterministic retailer adapter response policy.
 * A decision is advisory, never creates product offers or bypasses access controls.
 */
export type AdapterRecoveryClass =
  | 'healthy' | 'blocked' | 'rate_limited' | 'temporary' | 'not_found'
  | 'auth_required' | 'client_error' | 'network_error' | 'parse_zero';

export interface AdapterRecoveryDecision {
  kind: AdapterRecoveryClass;
  allowRetry: boolean;
  delayMs: number;
  countAsWorkingStore: boolean;
  reason: string;
}

export function classifyAdapterRecovery(input: {
  status?: number | null;
  timedOut?: boolean;
  validProductCount?: number;
  retryAfterSeconds?: number | null;
  retryOrdinal?: number;
}): AdapterRecoveryDecision {
  const status = input.status ?? null;
  const count = input.validProductCount ?? 0;
  const ordinal = input.retryOrdinal ?? 0;
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(ordinal) || ordinal < 0) {
    return {kind:'client_error',allowRetry:false,delayMs:0,countAsWorkingStore:false,reason:'invalid-input'};
  }
  const reply = (kind: AdapterRecoveryClass, retry: boolean, delay: number, reason: string): AdapterRecoveryDecision => ({
    kind, allowRetry: retry && ordinal === 0, delayMs: retry && ordinal === 0 ? delay : 0,
    countAsWorkingStore: kind === 'healthy', reason
  });
  if (status === 401 || status === 407) return reply('auth_required',false,0,'authentication-needed');
  if (status === 403 || status === 451) return reply('blocked',false,0,'access-denied-do-not-bypass');
  if (status === 404 || status === 410) return reply('not_found',false,0,'endpoint-invalid');
  if (status === 429) {
    const sec = input.retryAfterSeconds;
    if (sec == null || !Number.isFinite(sec) || sec < 0 || sec > 30) return reply('rate_limited',false,0,'respect-retry-after-no-immediate-retry');
    return reply('rate_limited',true,Math.max(1000,Math.ceil(sec * 1000)),'retry-after-once');
  }
  if (status === 500 || status === 502 || status === 503 || status === 504) return reply('temporary',true,1500,'temporary-error-once');
  if (status == null && input.timedOut) return reply('network_error',true,1500,'timeout-once');
  if (status != null && status >= 200 && status < 300) {
    return count > 0 ? reply('healthy',false,0,'verified-products') : reply('parse_zero',false,0,'http-success-no-verified-products');
  }
  return reply(status == null ? 'network_error' : 'client_error',false,0,'unsupported-response');
}
