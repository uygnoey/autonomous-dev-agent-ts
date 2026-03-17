# Fix Instruction: ISSUE-001 ~ ISSUE-004 (일괄 수정)

## 파일
`src/layer2/v2-session-executor.ts`

## 문제
biome check에서 4개 에러 발생:
1. line 117: 포맷팅 — logger.info 인라인 객체 줄 길이 초과
2. line 136-138: 포맷팅 — 삼항 연산자 포맷
3. line 232: lint/performance/noDelete — `delete baseEnv.CLAUDECODE`
4. line 240: lint/performance/noDelete — `delete baseEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`

## 수정 방법

### Step 1: 자동 포맷 적용 (ISSUE-003, ISSUE-004)
```bash
bunx biome format src/layer2/v2-session-executor.ts --write
```

### Step 2: noDelete lint 에러 수정 (ISSUE-001, ISSUE-002)

**중요**: 단순히 `= undefined`로 바꾸면 안 됩니다. 환경변수 객체에서 키를 완전히 제거해야 서브프로세스에 해당 환경변수가 전달되지 않습니다. `= undefined`는 키가 존재하면서 값만 undefined가 되어 환경변수로 `"undefined"` 문자열이 전달될 수 있습니다.

따라서 biome-ignore 주석을 추가합니다:

**line 232 앞에 추가:**
```typescript
// biome-ignore lint/performance/noDelete: 환경변수 키 자체 제거 필요 — undefined 할당 시 서브프로세스에 "undefined" 문자열 전달됨
delete baseEnv.CLAUDECODE;
```

**line 240 앞에 추가:**
```typescript
// biome-ignore lint/performance/noDelete: 환경변수 키 자체 제거 필요 — undefined 할당 시 서브프로세스에 "undefined" 문자열 전달됨
delete baseEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
```

## 수정 후 검증
```bash
bunx biome check src/layer2/v2-session-executor.ts
bun test tests/unit/layer2/v2-session-executor.test.ts
```
