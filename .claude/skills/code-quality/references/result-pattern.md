# Result<T, E> 패턴 상세

## 정의

```typescript
/** 성공 또는 실패를 명시적으로 표현 */
type Result<T, E = AdevError> = 
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };

/** Result 생성 헬퍼 */
function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
```

## 사용 규칙

1. 실패 가능한 모든 public 함수는 `Result<T, E>`를 반환
2. 호출자는 반드시 `ok` 필드를 확인 후 값에 접근
3. throw는 프로그래밍 버그(assertion)에만 사용
4. try-catch는 외부 라이브러리 호출 경계에서만

```typescript
// 올바른 사용
const result = await loadConfig(path);
if (!result.ok) {
  logger.error('Config load failed', { error: result.error });
  return err(result.error);
}
const config = result.value;

// 잘못된 사용 (금지)
try {
  const config = await loadConfig(path); // throw하면 안 됨
} catch (e) { ... }
```

## Result 체이닝

```typescript
async function processFeature(id: string): Promise<Result<Feature>> {
  const contractResult = await loadContract(id);
  if (!contractResult.ok) return contractResult;

  const designResult = await runDesign(contractResult.value);
  if (!designResult.ok) return designResult;

  return runImplementation(designResult.value);
}
```

## 외부 라이브러리 래핑

```typescript
/** LanceDB 호출을 Result로 래핑 */
async function safeQuery<T>(fn: () => Promise<T>): Promise<Result<T, RagError>> {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    return err(new RagError('query_failed', String(error)));
  }
}
```
