import { describe, expect, it } from 'bun:test';
import { getAuthErrorGuidance } from 'auth/auth-manager.js';

describe('getAuthErrorGuidance()', () => {
  it('[edge] 401 + oauth-token → setup-token 재실행 안내 포함', () => {
    const msg = getAuthErrorGuidance(401, 'oauth-token');
    expect(msg).not.toBeNull();
    expect(msg).toContain('setup-token');
  });

  it('[edge] 401 + api-key → console.anthropic.com 안내 포함', () => {
    const msg = getAuthErrorGuidance(401, 'api-key');
    expect(msg).not.toBeNull();
    expect(msg).toContain('console.anthropic.com');
  });

  it('[edge] 200 → null 반환', () => {
    expect(getAuthErrorGuidance(200, 'api-key')).toBeNull();
  });

  it('[edge] 403 → null 반환 (401만 처리)', () => {
    expect(getAuthErrorGuidance(403, 'oauth-token')).toBeNull();
  });

  it('[edge] 429 → null 반환', () => {
    expect(getAuthErrorGuidance(429, 'api-key')).toBeNull();
  });

  it('[normal] 401 + oauth-token 안내에 adev auth 포함', () => {
    const msg = getAuthErrorGuidance(401, 'oauth-token');
    expect(msg).toContain('adev auth');
  });

  it('[normal] 401 + api-key 안내에 ANTHROPIC_API_KEY 포함', () => {
    const msg = getAuthErrorGuidance(401, 'api-key');
    expect(msg).toContain('ANTHROPIC_API_KEY');
  });
});
