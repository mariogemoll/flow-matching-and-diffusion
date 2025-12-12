// Schedules for the diffusion coefficient g(t)
export interface DiffusionCoefficientScheduler {
  getDiffusion(t: number): number;
  getMaxDiffusion(): number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function makeConstantDiffusionCoefficientScheduler(
  maxDiffusion: number
): DiffusionCoefficientScheduler {
  return {
    getDiffusion: (): number => maxDiffusion,
    getMaxDiffusion: (): number => maxDiffusion
  };
}

export function makeLinearDiffusionCoefficientScheduler(
  maxDiffusion: number
): DiffusionCoefficientScheduler {
  return {
    getDiffusion: (t: number): number => clamp01(t) * maxDiffusion,
    getMaxDiffusion: (): number => maxDiffusion
  };
}

export function makeLinearReverseDiffusionCoefficientScheduler(
  maxDiffusion: number
): DiffusionCoefficientScheduler {
  return {
    getDiffusion: (t: number): number => clamp01(1 - t) * maxDiffusion,
    getMaxDiffusion: (): number => maxDiffusion
  };
}

export function makeSineBumpDiffusionCoefficientScheduler(
  maxDiffusion: number
): DiffusionCoefficientScheduler {
  return {
    getDiffusion: (t: number): number => {
      const tClamped = clamp01(t);
      // sin(π*t) goes from 0 to 1 (at t=0.5) back to 0
      return Math.sin(Math.PI * tClamped) * maxDiffusion;
    },
    getMaxDiffusion: (): number => maxDiffusion
  };
}
