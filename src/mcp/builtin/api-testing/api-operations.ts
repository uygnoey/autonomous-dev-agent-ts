/**
 * API 테스팅 작업 도구 / API testing operation tools
 *
 * @description
 * KR: HTTP 요청 전송, OpenAPI 스펙 파싱, 응답 스키마 검증을 MCP 도구로 제공한다.
 * EN: Provides HTTP request sending, OpenAPI spec parsing, and response schema validation as MCP tools.
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { McpTool } from 'mcp/types.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * API 테스팅 도구 입력 / API testing tool input
 */
export interface ApiTestInput {
  /** HTTP 메서드 / HTTP method */
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** 요청 URL / Request URL */
  readonly url?: string;
  /** 요청 헤더 / Request headers */
  readonly headers?: Readonly<Record<string, string>>;
  /** 요청 바디 / Request body */
  readonly body?: string;
  /** OpenAPI 스펙 파일 경로 / OpenAPI spec file path */
  readonly specPath?: string;
  /** 기대 스키마 / Expected response schema */
  readonly expectedSchema?: Record<string, unknown>;
  /** 응답 바디 / Response body to validate */
  readonly responseBody?: string;
  /** 작업 디렉토리 / Working directory */
  readonly cwd?: string;
}

/**
 * API 테스팅 도구 출력 / API testing tool output
 */
export interface ApiTestOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 도구 정의 / Tool Definitions ─────────────────────────────

/**
 * API 테스팅 MCP 도구 목록 / API testing MCP tools
 */
export const API_TESTING_TOOLS: readonly McpTool[] = [
  {
    name: 'api_request',
    description: 'HTTP 요청 전송 (GET/POST/PUT/DELETE/PATCH) / Send HTTP request',
    inputSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          description: 'HTTP 메서드 / HTTP method',
        },
        url: { type: 'string', description: '요청 URL / Request URL' },
        headers: {
          type: 'object',
          additionalProperties: { type: 'string' },
          description: '요청 헤더 / Request headers',
        },
        body: { type: 'string', description: '요청 바디 (JSON) / Request body (JSON)' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['method', 'url'],
    },
  },
  {
    name: 'api_parse_openapi',
    description:
      'OpenAPI 스펙 파싱 및 엔드포인트 목록 조회 / Parse OpenAPI spec and list endpoints',
    inputSchema: {
      type: 'object',
      properties: {
        specPath: {
          type: 'string',
          description: 'OpenAPI 스펙 파일 경로 / OpenAPI spec file path',
        },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['specPath'],
    },
  },
  {
    name: 'api_validate_response',
    description: '응답 JSON 스키마 검증 / Validate response against JSON schema',
    inputSchema: {
      type: 'object',
      properties: {
        responseBody: {
          type: 'string',
          description: '검증할 응답 바디 (JSON) / Response body to validate (JSON)',
        },
        expectedSchema: {
          type: 'object',
          description: '기대 JSON 스키마 / Expected JSON schema',
        },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['responseBody', 'expectedSchema'],
    },
  },
];

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * API 테스팅 작업 실행기 / API testing operations executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 curl 기반 HTTP 요청을 실행한다.
 * EN: Executes HTTP requests via curl using ProcessExecutor.
 */
export class ApiTestingExecutor {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'api-testing-executor' });
  }

  /**
   * curl 명령으로 HTTP 요청 실행 / Execute HTTP request via curl
   */
  private async executeHttpRequest(input: ApiTestInput): Promise<Result<string>> {
    const args: string[] = [
      '-s', // WHY: 진행 표시 비활성화
      '-w',
      '\n---HTTP_STATUS:%{http_code}---',
      '-X',
      input.method ?? 'GET',
    ];

    if (input.headers) {
      for (const [key, value] of Object.entries(input.headers)) {
        args.push('-H', `${key}: ${value}`);
      }
    }

    if (input.body) {
      args.push('-d', input.body);
      // WHY: body가 있으면 JSON Content-Type 자동 추가 (명시 헤더 없을 때)
      if (!(input.headers?.['Content-Type'] || input.headers?.['content-type'])) {
        args.push('-H', 'Content-Type: application/json');
      }
    }

    args.push(input.url ?? '');

    const result = await this.executor.execute('curl', args, { cwd: input.cwd });
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        new AdevError(
          'api_request_error',
          `HTTP 요청 실패: ${result.value.stderr || result.value.stdout}`,
        ),
      );
    }

    return ok(result.value.stdout);
  }

  /**
   * JSON 스키마 간이 검증 / Simple JSON schema validation
   *
   * @description
   * KR: 기본적인 타입/필수 필드 검증을 수행한다.
   *     전체 JSON Schema 스펙은 지원하지 않으며, 실용적 검증에 집중한다.
   * EN: Performs basic type/required field validation.
   *     Does not support full JSON Schema spec; focuses on practical validation.
   */
  private validateSchema(data: unknown, schema: Record<string, unknown>): string[] {
    const errors: string[] = [];

    if (schema.type === 'object' && typeof data === 'object' && data !== null) {
      const requiredFields = (schema.required as string[]) ?? [];
      const record = data as Record<string, unknown>;
      for (const field of requiredFields) {
        if (!(field in record)) {
          errors.push(`필수 필드 누락: ${field}`);
        }
      }

      const properties = (schema.properties as Record<string, Record<string, unknown>>) ?? {};
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in record && propSchema.type) {
          const actualType = Array.isArray(record[key]) ? 'array' : typeof record[key];
          if (actualType !== propSchema.type) {
            errors.push(
              `${key}: 타입 불일치 (기대: ${propSchema.type as string}, 실제: ${actualType})`,
            );
          }
        }
      }
    } else if (schema.type) {
      const expectedType = schema.type as string;
      const actualRootType = Array.isArray(data) ? 'array' : typeof data;
      if (actualRootType !== expectedType) {
        errors.push(`루트 타입 불일치 (기대: ${expectedType}, 실제: ${actualRootType})`);
      }
    }

    return errors;
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   */
  async executeTool(toolName: string, input: ApiTestInput): Promise<Result<ApiTestOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName });

    switch (toolName) {
      case 'api_request': {
        if (!input.url) {
          return ok({ success: false, message: 'url 필드 필수' });
        }
        if (!input.method) {
          return ok({ success: false, message: 'method 필드 필수' });
        }
        const result = await this.executeHttpRequest(input);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }

        // WHY: 상태 코드를 응답에서 분리하여 구조화
        const raw = result.value;
        const statusMatch = raw.match(/---HTTP_STATUS:(\d+)---/);
        const statusCode = statusMatch?.[1] ? Number.parseInt(statusMatch[1], 10) : 0;
        const body = raw.replace(/\n---HTTP_STATUS:\d+---$/, '');

        return ok({
          success: true,
          data: { statusCode, body },
          message: `HTTP ${input.method} ${input.url} → ${statusCode}`,
        });
      }

      case 'api_parse_openapi': {
        if (!input.specPath) {
          return ok({ success: false, message: 'specPath 필드 필수' });
        }
        // WHY: cat으로 파일을 읽고 JSON/YAML 파싱은 간단한 텍스트 분석으로 대체
        const result = await this.executor.execute('cat', [input.specPath], { cwd: input.cwd });
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        if (result.value.exitCode !== 0) {
          return ok({ success: false, message: `스펙 파일 읽기 실패: ${result.value.stderr}` });
        }

        // WHY: paths 키를 찾아 엔드포인트 목록을 추출
        const content = result.value.stdout;
        let endpoints: string[] = [];
        try {
          const parsed = JSON.parse(content) as Record<string, unknown>;
          const paths = parsed.paths as Record<string, unknown> | undefined;
          if (paths) {
            endpoints = Object.keys(paths);
          }
        } catch {
          // WHY: JSON 파싱 실패 시 YAML 패턴으로 간단 추출
          const pathMatches = content.match(/^\s{2}\/[^\s:]+/gm);
          if (pathMatches) {
            endpoints = pathMatches.map((p: string) => p.trim());
          }
        }

        return ok({
          success: true,
          data: { endpoints, raw: content },
          message: `OpenAPI 스펙 파싱 완료: ${endpoints.length}개 엔드포인트`,
        });
      }

      case 'api_validate_response': {
        if (!input.responseBody) {
          return ok({ success: false, message: 'responseBody 필드 필수' });
        }
        if (!input.expectedSchema) {
          return ok({ success: false, message: 'expectedSchema 필드 필수' });
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(input.responseBody);
        } catch {
          return ok({ success: false, message: '응답 바디 JSON 파싱 실패' });
        }

        const errors = this.validateSchema(parsed, input.expectedSchema);
        if (errors.length > 0) {
          return ok({
            success: false,
            data: { errors },
            message: `스키마 검증 실패: ${errors.length}개 오류`,
          });
        }

        return ok({
          success: true,
          data: { valid: true },
          message: '스키마 검증 통과',
        });
      }

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
