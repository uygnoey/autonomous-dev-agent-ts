/**
 * 배포 작업 도구 / Deployment operation tools
 *
 * @description
 * KR: Docker 컨테이너 상태 조회, 배포 트리거, 롤백 명령을 MCP 도구로 제공한다.
 * EN: Provides Docker container status, deploy trigger, and rollback commands as MCP tools.
 */

import { AdevError } from 'core/errors.js';
import type { Logger } from 'core/logger.js';
import type { ProcessExecutor } from 'core/process-executor.js';
import { err, ok } from 'core/types.js';
import type { Result } from 'core/types.js';
import type { McpTool } from 'mcp/types.js';

// ── 타입 / Types ────────────────────────────────────────────

/**
 * 배포 도구 입력 / Deployment tool input
 */
export interface DeployInput {
  /** 컨테이너 이름 또는 ID / Container name or ID */
  readonly container?: string;
  /** CI/CD 웹훅 URL / CI/CD webhook URL */
  readonly webhookUrl?: string;
  /** 웹훅 페이로드 / Webhook payload */
  readonly payload?: string;
  /** 롤백 대상 이미지 태그 / Rollback target image tag */
  readonly imageTag?: string;
  /** Docker Compose 파일 경로 / Docker Compose file path */
  readonly composePath?: string;
  /** 서비스 이름 / Service name */
  readonly service?: string;
  /** 작업 디렉토리 / Working directory */
  readonly cwd?: string;
}

/**
 * 배포 도구 출력 / Deployment tool output
 */
export interface DeployOutput {
  readonly success: boolean;
  readonly data?: unknown;
  readonly message: string;
}

// ── 도구 정의 / Tool Definitions ─────────────────────────────

/**
 * 배포 MCP 도구 목록 / Deployment MCP tools
 */
export const DEPLOYMENT_TOOLS: readonly McpTool[] = [
  {
    name: 'deploy_container_status',
    description: 'Docker 컨테이너 상태 조회 / Get Docker container status',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: '컨테이너 이름/ID (미지정 시 전체) / Container name/ID (all if omitted)' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
    },
  },
  {
    name: 'deploy_container_logs',
    description: 'Docker 컨테이너 로그 조회 / Get Docker container logs',
    inputSchema: {
      type: 'object',
      properties: {
        container: { type: 'string', description: '컨테이너 이름/ID / Container name or ID' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['container'],
    },
  },
  {
    name: 'deploy_trigger',
    description: '배포 트리거 (CI/CD 웹훅) / Trigger deployment via CI/CD webhook',
    inputSchema: {
      type: 'object',
      properties: {
        webhookUrl: { type: 'string', description: 'CI/CD 웹훅 URL / CI/CD webhook URL' },
        payload: { type: 'string', description: '웹훅 페이로드 (JSON) / Webhook payload (JSON)' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['webhookUrl'],
    },
  },
  {
    name: 'deploy_rollback',
    description: 'Docker 서비스 롤백 / Rollback Docker service',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string', description: '서비스 이름 / Service name' },
        imageTag: { type: 'string', description: '롤백 대상 이미지 태그 / Target image tag for rollback' },
        composePath: { type: 'string', description: 'Docker Compose 파일 경로 / Docker Compose file path' },
        cwd: { type: 'string', description: '작업 디렉토리 / Working directory' },
      },
      required: ['service', 'imageTag'],
    },
  },
];

// ── 도구 실행기 / Tool Executor ────────────────────────────

/**
 * 배포 작업 실행기 / Deployment operations executor
 *
 * @description
 * KR: ProcessExecutor를 사용하여 Docker CLI 명령을 실행한다.
 * EN: Executes Docker CLI commands using ProcessExecutor.
 */
export class DeploymentExecutor {
  constructor(
    private readonly executor: ProcessExecutor,
    private readonly logger: Logger,
  ) {
    this.logger = logger.child({ module: 'deployment-executor' });
  }

  /**
   * Docker 명령 실행 헬퍼 / Helper to execute Docker commands
   */
  private async executeDocker(args: readonly string[], cwd?: string): Promise<Result<string>> {
    const result = await this.executor.execute('docker', args, { cwd });
    if (!result.ok) {
      return err(result.error);
    }

    if (result.value.exitCode !== 0) {
      return err(
        new AdevError(
          'docker_command_error',
          `Docker 명령 실패: ${result.value.stderr || result.value.stdout}`,
        ),
      );
    }

    return ok(result.value.stdout);
  }

  /**
   * MCP 도구 실행 (통합 인터페이스) / Execute MCP tool
   */
  async executeTool(toolName: string, input: DeployInput): Promise<Result<DeployOutput>> {
    this.logger.debug('MCP 도구 실행', { toolName });

    switch (toolName) {
      case 'deploy_container_status': {
        const args = input.container
          ? ['ps', '--filter', `name=${input.container}`, '--format', 'json']
          : ['ps', '--format', 'json'];
        const result = await this.executeDocker(args, input.cwd);
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '컨테이너 상태 조회 성공' });
      }

      case 'deploy_container_logs': {
        if (!input.container) {
          return ok({ success: false, message: 'container 필드 필수' });
        }
        // WHY: 마지막 100줄만 조회하여 출력 제한
        const result = await this.executeDocker(
          ['logs', '--tail', '100', input.container],
          input.cwd,
        );
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        return ok({ success: true, data: result.value, message: '컨테이너 로그 조회 성공' });
      }

      case 'deploy_trigger': {
        if (!input.webhookUrl) {
          return ok({ success: false, message: 'webhookUrl 필드 필수' });
        }
        // WHY: curl로 웹훅 트리거
        const curlArgs: string[] = ['-s', '-X', 'POST'];
        curlArgs.push('-H', 'Content-Type: application/json');
        if (input.payload) {
          curlArgs.push('-d', input.payload);
        }
        curlArgs.push(input.webhookUrl);

        const result = await this.executor.execute('curl', curlArgs, { cwd: input.cwd });
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        if (result.value.exitCode !== 0) {
          return ok({ success: false, message: `웹훅 트리거 실패: ${result.value.stderr}` });
        }
        return ok({
          success: true,
          data: result.value.stdout,
          message: '배포 웹훅 트리거 성공',
        });
      }

      case 'deploy_rollback': {
        if (!input.service) {
          return ok({ success: false, message: 'service 필드 필수' });
        }
        if (!input.imageTag) {
          return ok({ success: false, message: 'imageTag 필드 필수' });
        }

        // WHY: docker compose를 사용하여 특정 이미지 태그로 롤백
        const composePath = input.composePath ?? 'docker-compose.yml';
        const envOverride = `${input.service.toUpperCase().replace(/-/g, '_')}_IMAGE_TAG=${input.imageTag}`;

        const result = await this.executor.execute(
          'sh',
          ['-c', `${envOverride} docker compose -f ${composePath} up -d ${input.service}`],
          { cwd: input.cwd },
        );
        if (!result.ok) {
          return ok({ success: false, message: result.error.message });
        }
        if (result.value.exitCode !== 0) {
          return ok({ success: false, message: `롤백 실패: ${result.value.stderr || result.value.stdout}` });
        }
        return ok({
          success: true,
          data: result.value.stdout,
          message: `${input.service}를 ${input.imageTag}로 롤백 성공`,
        });
      }

      default:
        return err(new AdevError('unknown_tool', `알 수 없는 도구: ${toolName}`));
    }
  }
}
