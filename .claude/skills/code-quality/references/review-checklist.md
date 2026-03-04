# 코드 리뷰 체크리스트

## 1. 구조
- [ ] 한 파일 한 책임 (300줄 이내)
- [ ] 모듈 의존성 방향 준수 (ARCHITECTURE.md)
- [ ] 순환 의존 없음

## 2. 타입 안전성
- [ ] any 사용 없음
- [ ] noUncheckedIndexedAccess 대응 (optional chaining 또는 타입 가드)
- [ ] Result<T,E> 패턴 적용 (실패 가능한 함수)
- [ ] 외부 입력 검증 (unknown → 타입 가드)

## 3. 에러 처리
- [ ] throw 대신 Result 반환
- [ ] try-catch는 외부 라이브러리 경계에서만
- [ ] 에러 코드가 에러 분류표에 등록됨
- [ ] 에러 메시지가 디버깅에 충분한 정보 포함

## 4. 코드 스타일
- [ ] 네이밍 컨벤션 준수 (camelCase/PascalCase/UPPER_SNAKE)
- [ ] 파일명 kebab-case
- [ ] JSDoc: public 함수/인터페이스
- [ ] 인라인 주석: WHY만

## 5. 테스트
- [ ] 단위 테스트 존재
- [ ] 정상/경계/에러 케이스 커버
- [ ] Arrange-Act-Assert 패턴

## 6. 보안
- [ ] credential 하드코딩 없음
- [ ] 사용자 입력 검증
- [ ] 경로 탐색 방지
