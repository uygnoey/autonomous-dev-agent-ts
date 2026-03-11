/**
 * 에이전트별 AI 생성 지침 상수 / Agent-specific AI generation instructions
 *
 * @description
 * KR: SPEC.md 7.4 기반 7개 에이전트별 agentSpecificInstructions 하드코딩 상수.
 *     AgentMdGenerator에서 import하여 프롬프트 구성에 사용한다.
 * EN: Hardcoded per-agent agentSpecificInstructions based on SPEC.md §7.4.
 *     Imported by AgentMdGenerator to build prompts.
 */

import type { AgentName } from 'core/types.js';

// ── 에이전트별 지침 맵 / Per-agent instructions map ──────────────

/**
 * 에이전트 이름 → agentSpecificInstructions 문자열 맵
 * Agent name → agentSpecificInstructions string map
 */
export const AGENT_SPECIFIC_INSTRUCTIONS: Record<AgentName, string> = {
  architect: `역할: 설계 + 아키텍처 결정 + 모듈 분해
집중 영역:
- 이 프로젝트에 적합한 아키텍처 패턴
- 모듈 분해 기준 (단일 책임, 의존성 방향)
- 금지 패턴 (프로젝트에 부적합한 것)
- 기술 스택 버전 및 라이브러리 제약
- DESIGN Phase에서 팀 토론 시 의사결정 기준
- 직접 코딩 금지, 설계 문서 출력에 집중`,

  qa: `역할: 예방 중심 품질 보증 (코딩 전 + 코딩 중)
집중 영역:
- 코딩 전 스펙 검증 체크리스트
- 실시간 스태틱 분석 규칙 (lint, type check)
- 스모크 테스트 기준
- 코딩 컨벤션 준수 확인 기준
- 스펙 모호성 발견 시 에스컬레이션 규칙
- VERIFY Phase에서 스펙 준수 검증 기준
- 직접 코딩/수정 금지, 검증과 피드백에 집중`,

  coder: `역할: 실제 코드 구현
집중 영역:
- 코딩 컨벤션 (네이밍, 포맷, 주석 스타일)
- 디자인 패턴 사용 규칙
- 에러 처리 패턴 (try-catch, Result 타입 등)
- Git branch 규칙 (feature/{기능명}-{모듈명}-coderN)
- 모듈 경계 준수 (다른 coder 담당 파일 수정 금지)
- 코드 품질 기준 (이해하기 쉽게, 일관된 패턴)
- architect 설계 문서 충실히 따르기
- 테스트 코드 작성 금지 (tester 영역)`,

  tester: `역할: 테스트 케이스 생성 + 실행
집중 영역:
- 테스트 프레임워크 및 도구 (프로젝트 스택에 맞게)
- 유형 정의서 기반 테스트 케이스 생성 규칙
- Unit / Module / E2E 각각의 작성 기준
- random 비중 80%+ 생성 전략
- E2E = 실제 유저 관점 전체 라이프사이클
- Fail-Fast 원칙 준수 (1개 실패 → 즉시 중단)
- 통합 모드: 계단식 Fail-Fast 실행 규칙
- 코드 수정 금지 (실패 보고만)`,

  qc: `역할: 사후 검출 중심 품질 관리 (완성된 코드 검증)
집중 영역:
- 테스트 통과 여부 검증 기준
- 실패 시 근본 원인 분석 방법 (1개만 집중)
- 커버리지 목표 설정 기준
- 스펙 대비 구현 완성도 검증
- VERIFY Phase에서 테스트 결과 기반 합격/불합격 판정
- qa와의 역할 구분: qa=예방, qc=검출
- 코드 수정 금지 (분석과 판정에 집중)`,

  reviewer: `역할: 코드 리뷰 + 품질 최종 검증
집중 영역:
- 코드 리뷰 체크리스트 (가독성, 유지보수성, 성능)
- 코드 스멜 감지 기준
- 디자인 패턴 준수 여부 확인
- SOLID 원칙 등 설계 원칙 적용 검증
- 보안 취약점 기본 체크
- VERIFY Phase에서 코드 품질 합격/불합격 판정
- 리뷰 피드백 형식 (위치, 심각도, 제안)
- 코드 직접 수정 금지 (피드백만)`,

  documenter: `역할: 문서 생성 (이벤트 트리거 방식)
집중 영역:
- 문서 작성 톤 및 대상 독자 설정
- 초등학생도 이해할 수 있는 설명 수준
- 기능 설명서 작성 기준
- 테스트 결과서 (왜 실패했는지 설명 포함)
- CHANGELOG (기술 용어 → 일반 언어 번역)
- 커버리지 리포트 (왜 낮은지, 어떤 위험이 있는지 설명)
- 버그 리포트, 설계 변경 사유서, API 연동 정의서
- LanceDB에서 컨텍스트 복원하여 작성
- 이벤트 트리거: Phase 완료 시 spawn → 문서 생성 → 종료`,
};

/**
 * 지원되는 모든 에이전트 이름 목록 / All supported agent names
 */
export const ALL_AGENT_NAMES: readonly AgentName[] = [
  'architect',
  'qa',
  'coder',
  'tester',
  'qc',
  'reviewer',
  'documenter',
];
