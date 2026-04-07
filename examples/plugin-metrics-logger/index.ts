/**
 * Metrics Logger Plugin — tracks phase durations and logs summary
 *
 * Install: copy this folder to ~/.adev/plugins/metrics-logger/
 * This plugin measures time spent in each phase and writes a
 * summary at pipeline completion.
 */
import type { AdevPlugin, PhaseChangeInfo } from 'core/plugin-types.js';

interface PhaseMetric {
  phase: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
}

const metrics: PhaseMetric[] = [];
let currentPhase: PhaseMetric | null = null;

const metricsLoggerPlugin: AdevPlugin = {
  async onInit(ctx) {
    metrics.length = 0;
    currentPhase = null;
    ctx.logger.info('[metrics-logger] Tracking enabled');
  },

  async onPhaseChange(ctx, info: PhaseChangeInfo) {
    const now = Date.now();

    // Close previous phase
    if (currentPhase) {
      currentPhase.endedAt = now;
      currentPhase.durationMs = now - currentPhase.startedAt;
      ctx.logger.info(
        `[metrics-logger] ${currentPhase.phase} completed in ${currentPhase.durationMs}ms`,
      );
    }

    // Start new phase
    currentPhase = { phase: info.to, startedAt: now };
    metrics.push(currentPhase);

    ctx.emitEvent('phase_metric', {
      phase: info.to,
      previousPhase: info.from,
      featureId: info.featureId,
      timestamp: now,
    });
  },

  async onComplete(ctx, result) {
    const now = Date.now();

    // Close last phase
    if (currentPhase && !currentPhase.endedAt) {
      currentPhase.endedAt = now;
      currentPhase.durationMs = now - currentPhase.startedAt;
    }

    const totalMs = metrics.reduce((sum, m) => sum + (m.durationMs ?? 0), 0);

    ctx.logger.info('[metrics-logger] === Pipeline Summary ===');
    ctx.logger.info(`[metrics-logger] Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
    ctx.logger.info(`[metrics-logger] Total duration: ${totalMs}ms`);

    for (const m of metrics) {
      const pct = totalMs > 0 ? ((m.durationMs ?? 0) / totalMs * 100).toFixed(1) : '0';
      ctx.logger.info(`[metrics-logger]   ${m.phase}: ${m.durationMs ?? '?'}ms (${pct}%)`);
    }

    ctx.emitEvent('pipeline_summary', {
      success: result.success,
      totalMs,
      phases: metrics.map(m => ({ phase: m.phase, durationMs: m.durationMs })),
    });
  },

  async onDestroy(ctx) {
    metrics.length = 0;
    currentPhase = null;
    ctx.logger.info('[metrics-logger] Cleaned up');
  },
};

export default metricsLoggerPlugin;
