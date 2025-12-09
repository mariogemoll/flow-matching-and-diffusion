import type { Pair } from 'web-ui-common/types';

import { initConditionalProbabilityPathView } from './conditional-probability-path-view';
import type { WidgetView } from './framework-controller';
import type { NoiseScheduler } from './math/noise-scheduler';

interface ScoreParamState extends Record<string, unknown> {
  time: number;
  position: Pair<number>;
  scheduler: NoiseScheduler;
  schedulerType: string;
}

export function initConditionalProbabilityPath(
  container: HTMLElement,
  initialPosition: Pair<number>,
  initialTime: number,
  initialScheduler: NoiseScheduler,
  onChange: (position: Pair<number>) => void
): WidgetView<ScoreParamState> {
  const updateView = initConditionalProbabilityPathView(
    container,
    initialPosition,
    initialTime,
    initialScheduler,
    onChange
  );

  return {
    render: (params: ScoreParamState): void => {
      updateView(params.position, params.time, params.scheduler);
    }
  };
}
