# CLI 설계: commands/project.ts

## 1. 개요

**목적**: 프로젝트 CRUD

**위치**: `src/cli/commands/project.ts`

**의존성**: cli → core

**핵심 책임**:
- 프로젝트 추가 (add)
- 프로젝트 제거 (remove)
- 프로젝트 목록 조회 (list)
- 활성 프로젝트 전환 (switch)
- 프로젝트 정보 수정 (update)

**사용법**:
```bash
adev project add /path/to/project         # 프로젝트 등록 + .adev/ 생성
adev project remove proj-1                # 프로젝트 제거
adev project remove proj-1 --delete-data  # .adev/ 디렉토리도 삭제
adev project list                         # 프로젝트 목록
adev project switch proj-2                # 활성 프로젝트 전환
adev project update proj-1 --name "새 이름" # 프로젝트 정보 수정
```

---

## 2. 인터페이스 정의

```typescript
export interface IProjectCommand extends CliCommandHandler<ProjectOptions> {
  /**
   * 프로젝트를 추가한다 / Add project
   */
  add(path: string): Promise<Result<ProjectInfo>>;

  /**
   * 프로젝트를 제거한다 / Remove project
   */
  remove(id: string, deleteData: boolean): Promise<Result<void>>;

  /**
   * 프로젝트 목록을 조회한다 / List projects
   */
  list(): Promise<Result<readonly ProjectInfo[]>>;

  /**
   * 활성 프로젝트를 전환한다 / Switch active project
   */
  switch(id: string): Promise<Result<void>>;

  /**
   * 프로젝트 정보를 수정한다 / Update project info
   */
  update(id: string, updates: Partial<ProjectInfo>): Promise<Result<void>>;
}
```

---

## 3. 주요 로직

### add()
1. `path`를 절대 경로로 변환
2. 경로에 `.adev/` 존재하지 않으면 `adev init` 실행
3. `ProjectInfo` 생성 (id: UUID, name: 폴더명, path, createdAt)
4. `projects.json`에 추가
5. `activeProjectId` 설정

### remove()
1. `projects.json`에서 프로젝트 조회
2. 없으면 에러
3. `deleteData === true`이면:
   - 유저에게 확인 프롬프트 ("정말 삭제하시겠습니까? (y/N)")
   - 확인 시 `.adev/` 디렉토리 삭제
4. `projects.json`에서 제거
5. 활성 프로젝트였으면 `activeProjectId` null로 설정

### list()
1. `projects.json` 읽기
2. 프로젝트 목록 출력 (표 형식)
   ```
   ID         Name              Path                    Status
   ────────────────────────────────────────────────────────────
   proj-1     쇼핑몰 API         /home/user/shopping-api  active
   proj-2     블로그 서비스      /home/user/blog          active
   ```

### switch()
1. `projects.json`에서 프로젝트 조회
2. 없으면 에러
3. `activeProjectId` 변경
4. 변경 성공 메시지

### update()
1. `projects.json`에서 프로젝트 조회
2. `updates` 필드 병합
3. `projects.json` 저장

---

## 4. 의존성

```
ProjectCommand
├─→ Logger
├─→ ProjectManager (cli/project-manager.ts)
└─→ InitCommand (cli/commands/init.ts) — add 시 초기화
```

---

## 5. 구현 우선순위

1. 인터페이스 + list
2. add (InitCommand 재사용)
3. remove, switch, update
4. 단위 테스트 + 통합 테스트

---

## 6. 참고 문서

- `SPEC.md` Section 5.5 — 프로젝트 관리
- `src/cli/types.ts` — ProjectInfo, ProjectRegistry
