/**
 * Hello World Plugin — minimal adev plugin example
 *
 * Install: copy this folder to ~/.adev/plugins/hello-world/
 * This plugin logs a message on each lifecycle event.
 */
import type { AdevPlugin } from 'core/plugin-types.js';

const helloWorldPlugin: AdevPlugin = {
  async onInit(ctx) {
    ctx.logger.info('[hello-world] Plugin initialized');
  },

  async onPhaseChange(ctx, info) {
    ctx.logger.info(
      `[hello-world] Phase transition: ${info.from ?? 'start'} -> ${info.to} (feature: ${info.featureId})`,
    );
  },

  async onComplete(ctx, result) {
    const status = result.success ? 'SUCCESS' : 'FAILED';
    ctx.logger.info(
      `[hello-world] Pipeline ${status} — phases completed: ${result.phasesCompleted.join(', ')}`,
    );
  },

  async onDestroy(ctx) {
    ctx.logger.info('[hello-world] Plugin destroyed');
  },
};

export default helloWorldPlugin;
