/**
 * DefaultPluginContext 단위 테스트
 *
 * @description
 * KR: PluginContext 생성, 로거 격리, 이벤트 발행 테스트. 80%+ 경계값 비율.
 * EN: Tests for DefaultPluginContext. 80%+ edge/invalid ratio.
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { ConsoleLogger } from 'core/logger.js';
import { DefaultPluginContext } from 'core/plugin-context.js';
import type { PluginEventListener } from 'core/plugin-context.js';
import type { PluginConfigAccess, PluginManifestV2 } from 'core/plugin-types.js';

const logger = new ConsoleLogger('error');

const testManifest: PluginManifestV2 = {
  name: 'test-plugin',
  version: '1.0.0',
  entryPoint: 'index.ts',
  capabilities: ['phase_hook'],
  permissions: ['fs_read'],
};

const testConfig: PluginConfigAccess = {
  projectRoot: '/tmp/test-project',
  adevVersion: '0.1.0',
  pluginConfig: { customKey: 'customValue' },
};

// ── 생성자 ────────────────────────────────────────────────────

describe('DefaultPluginContext 생성자', () => {
  it('정상적으로 생성된다', () => {
    expect(() => new DefaultPluginContext(testManifest, logger, testConfig)).not.toThrow();
  });

  it('이벤트 리스너 없이 생성된다', () => {
    const ctx = new DefaultPluginContext(testManifest, logger, testConfig);
    expect(ctx.logger).toBeDefined();
    expect(ctx.config).toBe(testConfig);
  });

  it('이벤트 리스너와 함께 생성된다', () => {
    const listener: PluginEventListener = () => {};
    const ctx = new DefaultPluginContext(testManifest, logger, testConfig, listener);
    expect(ctx).toBeDefined();
  });
});

// ── logger ────────────────────────────────────────────────────

describe('DefaultPluginContext.logger', () => {
  it('플러그인 이름이 포함된 child 로거이다', () => {
    const ctx = new DefaultPluginContext(testManifest, logger, testConfig);
    // WHY: child 로거가 정상 동작하는지 호출 테스트
    expect(() => ctx.logger.debug('test message')).not.toThrow();
    expect(() => ctx.logger.info('test message')).not.toThrow();
    expect(() => ctx.logger.warn('test message')).not.toThrow();
    expect(() => ctx.logger.error('test message')).not.toThrow();
  });
});

// ── config ────────────────────────────────────────────────────

describe('DefaultPluginContext.config', () => {
  it('설정 접근이 가능하다', () => {
    const ctx = new DefaultPluginContext(testManifest, logger, testConfig);
    expect(ctx.config.projectRoot).toBe('/tmp/test-project');
    expect(ctx.config.adevVersion).toBe('0.1.0');
    expect(ctx.config.pluginConfig).toEqual({ customKey: 'customValue' });
  });

  it('빈 pluginConfig도 접근 가능하다', () => {
    const emptyConfig: PluginConfigAccess = {
      projectRoot: '/tmp',
      adevVersion: '0.1.0',
      pluginConfig: {},
    };
    const ctx = new DefaultPluginContext(testManifest, logger, emptyConfig);
    expect(ctx.config.pluginConfig).toEqual({});
  });
});

// ── emitEvent ────────────────────────────────────────────────

describe('DefaultPluginContext.emitEvent', () => {
  it('리스너 없이 이벤트 발행해도 에러 없다', () => {
    const ctx = new DefaultPluginContext(testManifest, logger, testConfig);
    expect(() => ctx.emitEvent('test_event')).not.toThrow();
  });

  it('리스너가 플러그인 이름과 이벤트를 받는다', () => {
    let receivedPlugin = '';
    let receivedEvent = '';
    let receivedData: Record<string, unknown> | undefined;

    const listener: PluginEventListener = (pluginName, eventName, data) => {
      receivedPlugin = pluginName;
      receivedEvent = eventName;
      receivedData = data;
    };

    const ctx = new DefaultPluginContext(testManifest, logger, testConfig, listener);
    ctx.emitEvent('my_event', { key: 'value' });

    expect(receivedPlugin).toBe('test-plugin');
    expect(receivedEvent).toBe('my_event');
    expect(receivedData).toEqual({ key: 'value' });
  });

  it('data 없이 이벤트를 발행할 수 있다', () => {
    let receivedData: Record<string, unknown> | undefined = { initial: true };

    const listener: PluginEventListener = (_p, _e, data) => {
      receivedData = data;
    };

    const ctx = new DefaultPluginContext(testManifest, logger, testConfig, listener);
    ctx.emitEvent('no_data_event');

    expect(receivedData).toBeUndefined();
  });

  it('빈 이벤트 이름도 허용된다', () => {
    let receivedEvent = 'not-empty';
    const listener: PluginEventListener = (_p, e) => {
      receivedEvent = e;
    };

    const ctx = new DefaultPluginContext(testManifest, logger, testConfig, listener);
    ctx.emitEvent('');
    expect(receivedEvent).toBe('');
  });

  it('다른 매니페스트 이름은 다른 pluginName을 전달한다', () => {
    const otherManifest: PluginManifestV2 = {
      ...testManifest,
      name: 'other-plugin',
    };

    let receivedPlugin = '';
    const listener: PluginEventListener = (p) => {
      receivedPlugin = p;
    };

    const ctx = new DefaultPluginContext(otherManifest, logger, testConfig, listener);
    ctx.emitEvent('test');
    expect(receivedPlugin).toBe('other-plugin');
  });
});
