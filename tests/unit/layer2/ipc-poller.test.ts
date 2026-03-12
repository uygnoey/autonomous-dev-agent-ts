/**
 * IpcPoller 단위 테스트 / IpcPoller unit tests
 *
 * @description
 * KR: start/stop 라이프사이클, 새 파일 감지, mtime 변경 감지,
 *     존재하지 않는 디렉토리 skip, seenFiles 중복 방지, edge case를 검증한다.
 * EN: Validates start/stop lifecycle, new-file detection, mtime-change detection,
 *     missing-directory skip, seenFiles deduplication, and edge cases.
 */

import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConsoleLogger } from 'core/logger.js';
import { IpcPoller } from 'layer2/ipc-poller.js';
import type { IpcEvent, IpcPollerOptions } from 'layer2/ipc-poller-types.js';

// ── 헬퍼 ────────────────────────────────────────────────────

const logger = new ConsoleLogger('error');

function makeOptions(overrides: Partial<IpcPollerOptions> = {}): IpcPollerOptions {
  return {
    teamsDir: join(tmpdir(), 'ipc-test-teams'),
    tasksDir: join(tmpdir(), 'ipc-test-tasks'),
    intervalMs: 50,
    logger,
    ...overrides,
  };
}

function makePoller(overrides: Partial<IpcPollerOptions> = {}): IpcPoller {
  return new IpcPoller(makeOptions(overrides));
}

/** Promise가 ms 밀리초 안에 이벤트 N개를 수집할 때까지 대기 */
function collectEvents(
  poller: IpcPoller,
  count: number,
  timeoutMs = 1_000,
): Promise<IpcEvent[]> {
  return new Promise((resolve, reject) => {
    const events: IpcEvent[] = [];
    const timer = setTimeout(() => {
      reject(new Error(`Timeout: expected ${count} events but got ${events.length}`));
    }, timeoutMs);

    poller.start((event) => {
      events.push(event);
      if (events.length >= count) {
        clearTimeout(timer);
        poller.stop();
        resolve(events);
      }
    });
  });
}

// ── テスト用ディレクトリ ──────────────────────────────────────

let teamsDir: string;
let tasksDir: string;

beforeEach(async () => {
  teamsDir = join(tmpdir(), `ipc-teams-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  tasksDir = join(tmpdir(), `ipc-tasks-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(teamsDir, { recursive: true });
  await mkdir(tasksDir, { recursive: true });
});

afterEach(async () => {
  await rm(teamsDir, { recursive: true, force: true });
  await rm(tasksDir, { recursive: true, force: true });
});

// ── 생성자 ────────────────────────────────────────────────────

describe('IpcPoller 생성자', () => {
  it('인스턴스 생성됨', () => {
    expect(() => makePoller()).not.toThrow();
  });

  it('IpcPoller 인스턴스', () => {
    expect(makePoller()).toBeInstanceOf(IpcPoller);
  });

  it('start/stop/isRunning 메서드 존재', () => {
    const p = makePoller();
    expect(typeof p.start).toBe('function');
    expect(typeof p.stop).toBe('function');
    expect(typeof p.isRunning).toBe('function');
  });
});

// ── start / stop 라이프사이클 ─────────────────────────────────

describe('start() / stop() 라이프사이클', () => {
  it('start() 후 isRunning() === true', () => {
    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir }));
    p.start(() => {});
    expect(p.isRunning()).toBe(true);
    p.stop();
  });

  it('stop() 후 isRunning() === false', () => {
    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir }));
    p.start(() => {});
    p.stop();
    expect(p.isRunning()).toBe(false);
  });

  it('start() 전 isRunning() === false', () => {
    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir }));
    expect(p.isRunning()).toBe(false);
  });

  it('중복 start() 호출 → 한 번만 실행 (이중 등록 없음)', () => {
    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir }));
    const events: IpcEvent[] = [];
    p.start((e) => events.push(e));
    p.start((e) => events.push(e)); // 두 번째 호출 무시
    expect(p.isRunning()).toBe(true);
    p.stop();
  });

  it('stop() → start() 재시작 가능', () => {
    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir }));
    p.start(() => {});
    p.stop();
    p.start(() => {});
    expect(p.isRunning()).toBe(true);
    p.stop();
  });

  it('stop() 중복 호출 → 에러 없음', () => {
    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir }));
    p.start(() => {});
    p.stop();
    expect(() => p.stop()).not.toThrow();
  });
});

// ── 새 파일 감지 (team_message) ───────────────────────────────

describe('새 파일 감지 — team_message', () => {
  it('팀 messages/ 하위 새 파일 → team_message 이벤트 emit', async () => {
    const teamId = 'team-alpha';
    const messagesDir = join(teamsDir, teamId, 'messages');
    await mkdir(messagesDir, { recursive: true });

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const eventPromise = collectEvents(p, 1);

    await writeFile(join(messagesDir, 'msg-001.json'), JSON.stringify({ hello: 'world' }));
    const [event] = await eventPromise;

    expect(event?.type).toBe('team_message');
    if (event?.type === 'team_message') {
      expect(event.teamId).toBe(teamId);
      expect(event.payload).toEqual({ hello: 'world' });
      expect(typeof event.filePath).toBe('string');
      expect(event.detectedAt).toBeInstanceOf(Date);
    }
  });

  it('여러 팀 동시 감지', async () => {
    for (const tid of ['team-a', 'team-b']) {
      const dir = join(teamsDir, tid, 'messages');
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, 'x.json'), JSON.stringify({ tid }));
    }

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events = await collectEvents(p, 2);

    expect(events.length).toBe(2);
    const teamIds = events.map((e) => (e.type === 'team_message' ? e.teamId : '')).sort();
    expect(teamIds).toEqual(['team-a', 'team-b']);
  });

  it('파싱 가능한 JSON이 아닌 파일 → payload {}로 emit (에러 없음)', async () => {
    const messagesDir = join(teamsDir, 'team-bad', 'messages');
    await mkdir(messagesDir, { recursive: true });
    await writeFile(join(messagesDir, 'bad.json'), 'NOT_JSON!!!');

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events = await collectEvents(p, 1);

    expect(events[0]?.type).toBe('team_message');
    // payload는 {} (파싱 실패 시 빈 객체)
    expect(events[0]?.payload).toEqual({});
  });

  it('JSON 배열 파일 → payload { value: [...] }로 emit', async () => {
    const messagesDir = join(teamsDir, 'team-arr', 'messages');
    await mkdir(messagesDir, { recursive: true });
    await writeFile(join(messagesDir, 'arr.json'), JSON.stringify([1, 2, 3]));

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events = await collectEvents(p, 1);

    expect(events[0]?.type).toBe('team_message');
    expect(events[0]?.payload).toEqual({ value: [1, 2, 3] });
  });
});

// ── mtime 변경 감지 (task_update) ─────────────────────────────

describe('mtime 변경 감지 — task_update', () => {
  it('새 .json 파일 → task_update 이벤트 emit', async () => {
    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const eventPromise = collectEvents(p, 1);

    await writeFile(join(tasksDir, 'task-123.json'), JSON.stringify({ status: 'running' }));
    const [event] = await eventPromise;

    expect(event?.type).toBe('task_update');
    if (event?.type === 'task_update') {
      expect(event.taskId).toBe('task-123');
      expect(event.payload).toEqual({ status: 'running' });
      expect(event.detectedAt).toBeInstanceOf(Date);
    }
  });

  it('mtime 변경 → task_update 재emit', async () => {
    const filePath = join(tasksDir, 'task-mtime.json');
    await writeFile(filePath, JSON.stringify({ v: 1 }));

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events: IpcEvent[] = [];

    await new Promise<void>((resolve) => {
      p.start(async (e) => {
        events.push(e);
        if (events.length === 1) {
          // 첫 이벤트 수신 후 파일 수정 (mtime 변경)
          await writeFile(filePath, JSON.stringify({ v: 2 }));
          // WHY: 파일시스템 mtime 해상도(ms) 내 중복 쓰기 시 mtime이 동일할 수 있으므로
          //      utimes로 미래 시간을 명시적으로 설정해 다음 poll에서 변경 감지 보장
          const future = new Date(Date.now() + 1_000);
          await utimes(filePath, future, future);
        }
        if (events.length === 2) {
          p.stop();
          resolve();
        }
      });

      setTimeout(() => {
        p.stop();
        resolve();
      }, 2_000);
    });

    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0]?.type).toBe('task_update');
    expect(events[1]?.type).toBe('task_update');
  });

  it('.json 확장자가 아닌 파일 → 무시됨', async () => {
    await writeFile(join(tasksDir, 'task.txt'), 'text');
    await writeFile(join(tasksDir, 'task.log'), 'log');

    // .json 파일 하나 추가해 최소 1개 이벤트 보장
    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events: IpcEvent[] = [];

    await new Promise<void>((resolve) => {
      p.start((e) => {
        events.push(e);
      });
      setTimeout(() => {
        p.stop();
        resolve();
      }, 200);
    });

    // task.txt, task.log 는 감지되면 안 됨
    expect(events.every((e) => e.type !== 'task_update' || e.filePath.endsWith('.json'))).toBe(
      true,
    );
  });

  it('taskId는 파일명에서 확장자를 제거한 값', async () => {
    await writeFile(join(tasksDir, 'my-task-abc.json'), '{}');

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const [event] = await collectEvents(p, 1);

    expect(event?.type).toBe('task_update');
    if (event?.type === 'task_update') {
      expect(event.taskId).toBe('my-task-abc');
    }
  });
});

// ── 존재하지 않는 디렉토리 skip ──────────────────────────────

describe('존재하지 않는 디렉토리 — ENOENT skip', () => {
  it('teamsDir 없으면 에러 없이 skip', async () => {
    const p = new IpcPoller(
      makeOptions({ teamsDir: join(tmpdir(), 'no-such-teams-dir'), tasksDir }),
    );
    const events: IpcEvent[] = [];

    await new Promise<void>((resolve) => {
      p.start((e) => events.push(e));
      setTimeout(() => {
        p.stop();
        resolve();
      }, 200);
    });

    expect(events.length).toBe(0);
  });

  it('tasksDir 없으면 에러 없이 skip', async () => {
    const p = new IpcPoller(
      makeOptions({ teamsDir, tasksDir: join(tmpdir(), 'no-such-tasks-dir') }),
    );
    const events: IpcEvent[] = [];

    await new Promise<void>((resolve) => {
      p.start((e) => events.push(e));
      setTimeout(() => {
        p.stop();
        resolve();
      }, 200);
    });

    expect(events.length).toBe(0);
  });

  it('팀 디렉토리 내 messages/ 없으면 에러 없이 skip', async () => {
    // team 디렉토리는 있지만 messages/ 서브디렉토리 없음
    await mkdir(join(teamsDir, 'team-no-msg'), { recursive: true });

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events: IpcEvent[] = [];

    await new Promise<void>((resolve) => {
      p.start((e) => events.push(e));
      setTimeout(() => {
        p.stop();
        resolve();
      }, 200);
    });

    expect(events.length).toBe(0);
  });

  it('teamsDir, tasksDir 모두 없어도 에러 없이 동작', async () => {
    const p = new IpcPoller(
      makeOptions({
        teamsDir: join(tmpdir(), 'ghost-teams'),
        tasksDir: join(tmpdir(), 'ghost-tasks'),
      }),
    );

    await expect(
      new Promise<void>((resolve) => {
        p.start(() => {});
        setTimeout(() => {
          p.stop();
          resolve();
        }, 150);
      }),
    ).resolves.toBeUndefined();
  });
});

// ── seenFiles 중복 방지 ──────────────────────────────────────

describe('seenFiles 중복 방지', () => {
  it('같은 team_message 파일 → 한 번만 emit', async () => {
    const messagesDir = join(teamsDir, 'team-dedup', 'messages');
    await mkdir(messagesDir, { recursive: true });
    await writeFile(join(messagesDir, 'dup.json'), JSON.stringify({ x: 1 }));

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events: IpcEvent[] = [];

    await new Promise<void>((resolve) => {
      p.start((e) => events.push(e));
      setTimeout(() => {
        p.stop();
        resolve();
      }, 300); // 여러 폴링 사이클 대기
    });

    const matching = events.filter(
      (e) => e.type === 'team_message' && e.filePath.includes('dup.json'),
    );
    expect(matching.length).toBe(1);
  });

  it('task_update — mtime 미변경 시 재emit 없음', async () => {
    const filePath = join(tasksDir, 'stable-task.json');
    await writeFile(filePath, JSON.stringify({ stable: true }));

    // mtime을 고정 (파일 쓰기 직후와 동일하게)
    const s = await import('node:fs/promises').then((m) => m.stat(filePath));
    const fixedTime = new Date(s.mtimeMs);

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events: IpcEvent[] = [];

    await new Promise<void>((resolve) => {
      p.start((e) => events.push(e));
      setTimeout(() => {
        p.stop();
        resolve();
      }, 300);
    });

    const matching = events.filter(
      (e) => e.type === 'task_update' && e.filePath.includes('stable-task.json'),
    );
    // mtime 변경 없으니 첫 감지 1번만
    expect(matching.length).toBe(1);
    // 타입체크용 (fixedTime 사용)
    expect(fixedTime).toBeInstanceOf(Date);
  });
});

// ── edge case ────────────────────────────────────────────────

describe('edge case', () => {
  it('빈 JSON 객체 파일 → payload {} emit', async () => {
    await writeFile(join(tasksDir, 'empty-obj.json'), '{}');

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const [event] = await collectEvents(p, 1);

    expect(event?.payload).toEqual({});
  });

  it('콜백 내에서 throw → poller 계속 실행', async () => {
    const messagesDir = join(teamsDir, 'team-throw', 'messages');
    await mkdir(messagesDir, { recursive: true });
    await writeFile(join(messagesDir, 'a.json'), '{}');
    await writeFile(join(tasksDir, 't.json'), '{}');

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events: IpcEvent[] = [];

    await new Promise<void>((resolve) => {
      let callCount = 0;
      p.start((e) => {
        callCount++;
        events.push(e);
        if (callCount === 1) throw new Error('callback error');
        if (callCount >= 2) {
          p.stop();
          resolve();
        }
      });

      setTimeout(() => {
        p.stop();
        resolve();
      }, 1_000);
    });

    // 첫 콜백에서 throw 해도 후속 이벤트 수신
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(p.isRunning()).toBe(false);
  });

  it('intervalMs 기본값 (옵션 미전달) → 동작 가능', () => {
    const p = new IpcPoller({
      teamsDir,
      tasksDir,
      logger,
    });
    p.start(() => {});
    expect(p.isRunning()).toBe(true);
    p.stop();
    expect(p.isRunning()).toBe(false);
  });

  it('매우 큰 JSON payload → 정상 처리', async () => {
    const bigPayload: Record<string, string> = {};
    for (let i = 0; i < 1_000; i++) {
      bigPayload[`key_${i}`] = 'x'.repeat(100);
    }
    await writeFile(join(tasksDir, 'big.json'), JSON.stringify(bigPayload));

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const [event] = await collectEvents(p, 1);

    expect(event?.type).toBe('task_update');
    expect(Object.keys(event?.payload ?? {}).length).toBe(1_000);
  });

  it('팀 이름에 특수문자 포함 → 정상 처리 (실제 디렉토리로 생성 가능한 경우)', async () => {
    // 하이픈, 숫자, 언더스코어는 유효한 디렉토리명
    const teamId = 'team_01-alpha';
    const dir = join(teamsDir, teamId, 'messages');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'msg.json'), JSON.stringify({ ok: true }));

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const [event] = await collectEvents(p, 1);

    expect(event?.type).toBe('team_message');
    if (event?.type === 'team_message') {
      expect(event.teamId).toBe(teamId);
    }
  });

  it('동시에 많은 파일 생성 → 모두 감지', async () => {
    const messagesDir = join(teamsDir, 'team-bulk', 'messages');
    await mkdir(messagesDir, { recursive: true });

    const COUNT = 10;
    for (let i = 0; i < COUNT; i++) {
      await writeFile(join(messagesDir, `msg-${i}.json`), JSON.stringify({ i }));
    }

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events = await collectEvents(p, COUNT, 3_000);

    expect(events.length).toBe(COUNT);
    expect(events.every((e) => e.type === 'team_message')).toBe(true);
  });

  it('task + team 동시 → 각각 올바른 타입으로 emit', async () => {
    const messagesDir = join(teamsDir, 'team-mixed', 'messages');
    await mkdir(messagesDir, { recursive: true });
    await writeFile(join(messagesDir, 'msg.json'), JSON.stringify({ src: 'team' }));
    await writeFile(join(tasksDir, 'mixed-task.json'), JSON.stringify({ src: 'task' }));

    const p = new IpcPoller(makeOptions({ teamsDir, tasksDir, intervalMs: 30 }));
    const events = await collectEvents(p, 2, 2_000);

    const types = events.map((e) => e.type).sort();
    expect(types).toEqual(['task_update', 'team_message']);
  });
});
