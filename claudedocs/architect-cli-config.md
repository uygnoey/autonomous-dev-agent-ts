# CLI 설계: commands/config.ts

## 1. 개요

**목적**: 설정 조회/변경

**위치**: `src/cli/commands/config.ts`

**의존성**: cli → core

**핵심 책임**:
- 설정 조회 (get, list)
- 설정 변경 (set)
- 설정 초기화 (reset)
- 글로벌 vs 프로젝트 설정 구분

**사용법**:
```bash
adev config list                         # 모든 설정 조회
adev config get authMethod               # 특정 설정 조회
adev config set logLevel debug           # 설정 변경
adev config set embeddingProvider jina --global # 글로벌 설정 변경
adev config reset                        # 설정 초기화 (기본값)
```

---

## 2. 인터페이스 정의

```typescript
export interface IConfigCommand extends CliCommandHandler<ConfigOptions> {
  /**
   * 설정 목록을 조회한다 / List all config
   */
  list(global: boolean): Promise<Result<AdevConfig>>;

  /**
   * 특정 설정을 조회한다 / Get specific config
   */
  get(key: string, global: boolean): Promise<Result<unknown>>;

  /**
   * 설정을 변경한다 / Set config
   */
  set(key: string, value: string, global: boolean): Promise<Result<void>>;

  /**
   * 설정을 초기화한다 / Reset config to default
   */
  reset(global: boolean): Promise<Result<void>>;
}
```

---

## 3. 주요 로직

### execute()
1. `subCommand`에 따라 분기 (list, get, set, reset)
2. `--global` 플래그 확인 (글로벌 설정 vs 프로젝트 설정)
3. 해당 메서드 호출
4. 결과 출력

### list()
1. `global ? '~/.adev/config.json' : '.adev/config.json'` 읽기
2. JSON 파싱
3. 포맷팅하여 출력

### get()
1. 설정 파일 읽기
2. `config[key]` 값 조회
3. 없으면 에러

### set()
1. 설정 파일 읽기
2. `config[key] = value` 변경
3. 파일 저장
4. 검증 (타입 체크)

### reset()
1. `DEFAULT_CONFIG` 사용
2. 설정 파일 덮어쓰기

---

## 4. 의존성

```
ConfigCommand
├─→ Logger
└─→ ConfigManager (core/config.ts) — 설정 파일 관리
```

---

## 5. 구현 우선순위

1. 인터페이스 + list, get
2. set, reset
3. 단위 테스트 + 통합 테스트

---

## 6. 참고 문서

- `SPEC.md` Section 5.4 — 설정 우선순위
- `src/cli/types.ts` — AdevConfig
