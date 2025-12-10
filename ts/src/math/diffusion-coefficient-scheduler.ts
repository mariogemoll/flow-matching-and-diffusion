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

export function makeQuadraticDiffusionCoefficientScheduler(
  maxDiffusion: number
): DiffusionCoefficientScheduler {
  return {
    getDiffusion: (t: number): number => {
      const tClamped = clamp01(t);
      return tClamped * tClamped * maxDiffusion;
    },
    getMaxDiffusion: (): number => maxDiffusion
  };
}

export function makeSqrtDiffusionCoefficientScheduler(
  maxDiffusion: number
): DiffusionCoefficientScheduler {
  return {
    getDiffusion: (t: number): number => Math.sqrt(clamp01(t)) * maxDiffusion,
    getMaxDiffusion: (): number => maxDiffusion
  };
}

export function makeCosineDiffusionCoefficientScheduler(
  maxDiffusion: number
): DiffusionCoefficientScheduler {
  return {
    getDiffusion: (t: number): number => {
      const tClamped = clamp01(t);
      // Cosine schedule: 0.5 * (1 - cos(π*t)) goes from 0 to 1
      return 0.5 * (1 - Math.cos(Math.PI * tClamped)) * maxDiffusion;
    },
    getMaxDiffusion: (): number => maxDiffusion
  };
}
