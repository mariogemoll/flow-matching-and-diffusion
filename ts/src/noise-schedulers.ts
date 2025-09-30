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

export type NoiseScheduler = (t: number) => NoiseSchedulePoint;

export const linearNoiseScheduler: NoiseScheduler = (t) => {
  const clamped = clamp01(t);
  return { alpha: clamped, beta: 1 - clamped };
};

export const smoothstepNoiseScheduler: NoiseScheduler = (t) => {
  const clamped = clamp01(t);
  const alpha = clamped * clamped * (3 - 2 * clamped);
  return { alpha, beta: 1 - alpha };
};

export const sqrtNoiseScheduler: NoiseScheduler = (t) => {
  const clamped = clamp01(t);
  const alpha = Math.sqrt(clamped);
  const beta = Math.sqrt(1 - clamped);
  return { alpha, beta };
};
