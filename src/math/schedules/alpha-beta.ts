import { clamp01 } from '../../util/misc';

export type AlphaBetaScheduleName = 'linear' | 'cosine' | 'ddpm' | 'sigmoid';

export interface AlphaBetaSchedule {
  alpha: (t: number) => number;
  beta: (t: number) => number;
  alphaDerivative: (t: number) => number;
  betaDerivative: (t: number) => number;
  displayName: string;
}

export const ALPHA_BETA_SCHEDULES: Record<AlphaBetaScheduleName, AlphaBetaSchedule> = {
  linear: {
    displayName: 'α(t) = t, β(t) = 1 - t',
    alpha: (t) => clamp01(t),
    beta: (t) => 1 - clamp01(t),
    alphaDerivative: () => 1.0,
    betaDerivative: () => -1.0
  },
  cosine: {
    displayName: 'α(t) = sin(πt/2), β(t) = cos(πt/2)',
    alpha: (t) => Math.sin((Math.PI / 2) * clamp01(t)),
    beta: (t) => Math.cos((Math.PI / 2) * clamp01(t)),
    alphaDerivative: (t) => (Math.PI / 2) * Math.cos((Math.PI / 2) * clamp01(t)),
    betaDerivative: (t) => -(Math.PI / 2) * Math.sin((Math.PI / 2) * clamp01(t))
  },
  ddpm: {
    displayName: 'α(t) = √t, β(t) = √(1 - t)',
    alpha: (t) => Math.sqrt(Math.max(0, clamp01(t))),
    beta: (t) => Math.sqrt(Math.max(0, 1 - clamp01(t))),
    alphaDerivative: (t) => {
      const tC = Math.max(1e-5, clamp01(t));
      return 0.5 / Math.sqrt(tC);
    },
    betaDerivative: (t) => {
      const tC = Math.min(1 - 1e-5, clamp01(t));
      return -0.5 / Math.sqrt(1 - tC);
    }
  },
  sigmoid: {
    displayName: 'α(t) = σ(6(t-0.5)), β(t) = σ(-6(t-0.5))',
    alpha: (t) => {
      const x = 6 * (clamp01(t) - 0.5);
      return 1 / (1 + Math.exp(-x));
    },
    beta: (t) => {
      const x = 6 * (clamp01(t) - 0.5);
      return 1 / (1 + Math.exp(x));
    },
    alphaDerivative: (t) => {
      const x = 6 * (clamp01(t) - 0.5);
      const s = 1 / (1 + Math.exp(-x));
      return 6 * s * (1 - s);
    },
    betaDerivative: (t) => {
      const x = 6 * (clamp01(t) - 0.5);
      const s = 1 / (1 + Math.exp(x));
      return -6 * s * (1 - s);
    }
  }
};

export function getAlpha(t: number, schedule: AlphaBetaScheduleName): number {
  return ALPHA_BETA_SCHEDULES[schedule].alpha(t);
}

export function getBeta(t: number, schedule: AlphaBetaScheduleName): number {
  return ALPHA_BETA_SCHEDULES[schedule].beta(t);
}

export function getAlphaDerivative(t: number, schedule: AlphaBetaScheduleName): number {
  return ALPHA_BETA_SCHEDULES[schedule].alphaDerivative(t);
}

export function getBetaDerivative(t: number, schedule: AlphaBetaScheduleName): number {
  return ALPHA_BETA_SCHEDULES[schedule].betaDerivative(t);
}

export const SCHEDULE_NAMES: Record<AlphaBetaScheduleName, string> = Object.fromEntries(
  Object.entries(ALPHA_BETA_SCHEDULES).map(([k, v]) => [k, v.displayName])
) as Record<AlphaBetaScheduleName, string>;
