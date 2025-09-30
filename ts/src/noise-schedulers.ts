const clamp01 = (value: number): number => {
  if (value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return 1;
  }
  return value;
};

export interface NoiseSchedulePoint {
  alpha: number;
  beta: number;
}

export interface NoiseScheduleDerivatives {
  alphaDot: number;
  betaDot: number;
}

export type NoiseScheduler = (t: number) => NoiseSchedulePoint;
export type NoiseSchedulerDerivative = (t: number) => NoiseScheduleDerivatives;

export const linearNoiseScheduler: NoiseScheduler = (t) => {
  const clamped = clamp01(t);
  return { alpha: clamped, beta: 1 - clamped };
};

export const linearNoiseSchedulerDerivative: NoiseSchedulerDerivative = (t) => {
  if (t <= 0 || t >= 1) {
    return { alphaDot: 0, betaDot: 0 };
  }
  return { alphaDot: 1, betaDot: -1 };
};

export const smoothstepNoiseScheduler: NoiseScheduler = (t) => {
  const clamped = clamp01(t);
  const alpha = clamped * clamped * (3 - 2 * clamped);
  return { alpha, beta: 1 - alpha };
};

export const smoothstepNoiseSchedulerDerivative: NoiseSchedulerDerivative = (t) => {
  if (t <= 0 || t >= 1) {
    return { alphaDot: 0, betaDot: 0 };
  }
  const clamped = clamp01(t);
  // d/dt [t²(3 - 2t)] = 6t - 6t²
  const alphaDot = 6 * clamped * (1 - clamped);
  return { alphaDot, betaDot: -alphaDot };
};
