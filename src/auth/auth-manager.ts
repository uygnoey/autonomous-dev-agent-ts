/**
 * 인증 공급자 팩토리 / Authentication provider factory
 *
 * @description
 * KR: 환경변수에 따라 적절한 AuthProvider(ApiKeyAuth 또는 SubscriptionAuth)를
 *     생성하여 반환하는 팩토리 함수.
 * EN: Factory function that creates the appropriate AuthProvider (ApiKeyAuth or SubscriptionAuth)
 *     based on environment variables.
 */

import { loadEnvironment } from '../core/config.js';
import { AuthError } from '../core/errors.js';
import type { Logger } from '../core/logger.js';
import { err, ok } from '../core/types.js';
import type { Result } from '../core/types.js';
import { ApiKeyAuth } from './api-key-auth.js';
import { SubscriptionAuth } from './subscription-auth.js';
import type { AuthProvider } from './types.js';

// ── createAuthProvider ──────────────────────────────────────

/**
 * 환경변수 기반으로 AuthProvider를 생성한다 / Creates AuthProvider based on environment variables
 *
 * @description
 * KR: loadEnvironment()로 인증 방식을 결정하고 해당 AuthProvider를 생성한다.
 *     ConfigError는 AuthError로 변환하여 반환한다.
 * EN: Determines auth mode via loadEnvironment() and creates the corresponding AuthProvider.
 *     Maps ConfigError to AuthError.
 *
 * @param logger - 로거 인스턴스 / Logger instance
 * @returns 성공 시 AuthProvider, 실패 시 AuthError / AuthProvider on success, AuthError on failure
 *
 * @example
 * const result = createAuthProvider(logger);
 * if (result.ok) {
 *   const headers = result.value.getAuthHeader();
 * }
 */
export function createAuthProvider(logger: Logger): Result<AuthProvider, AuthError> {
  const envResult = loadEnvironment();

  if (!envResult.ok) {
    return err(new AuthError('auth_env_load_failed', envResult.error.message, envResult.error));
  }

  const env = envResult.value;

  switch (env.authMode) {
    case 'api-key': {
      if (env.anthropicApiKey === undefined) {
        return err(
          new AuthError(
            'auth_missing_credential',
            'authMode가 api-key이지만 ANTHROPIC_API_KEY가 없습니다.',
          ),
        );
      }
      logger.info('API Key 인증 공급자 생성 / Creating API Key auth provider');
      return ok(new ApiKeyAuth(env.anthropicApiKey, logger));
    }
    case 'oauth-token': {
      if (env.claudeCodeOauthToken === undefined) {
        return err(
          new AuthError(
            'auth_missing_credential',
            'authMode가 oauth-token이지만 CLAUDE_CODE_OAUTH_TOKEN이 없습니다.',
          ),
        );
      }
      logger.info('Subscription 인증 공급자 생성 / Creating Subscription auth provider');
      return ok(new SubscriptionAuth(env.claudeCodeOauthToken, logger));
    }
    default: {
      // WHY: exhaustive check — 새로운 AuthMode 추가 시 컴파일 타임 오류 유도
      const _exhaustive: never = env.authMode;
      return err(
        new AuthError('auth_unknown_mode', `알 수 없는 인증 모드: ${String(_exhaustive)}`),
      );
    }
  }
}
