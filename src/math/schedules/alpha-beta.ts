import { clamp01 } from '../../util/misc';

export type AlphaBetaScheduleName = 'constant' | 'linear' | 'cosine';

export interface AlphaBetaSchedule {
  alpha: (t: number) => number;
  beta: (t: number) => number;
  alphaDerivative: (t: number) => number;
  betaDerivative: (t: number) => number;
  displayName: string;
}

export const ALPHA_BETA_SCHEDULES: Record<AlphaBetaScheduleName, AlphaBetaSchedule> = {
  constant: {
    displayName: 'Constant (Arc)',
    alpha: (t) => clamp01(t),
    beta: (t) => Math.sqrt(Math.max(0, 1 - clamp01(t) * clamp01(t))),
    alphaDerivative: () => 1.0,
    betaDerivative: (t) => {
      const tC = clamp01(t);
      const denom = Math.sqrt(Math.max(0.0001, 1 - tC * tC));
      return -tC / denom;
    }
  },
  linear: {
    displayName: 'Linear',
    alpha: (t) => clamp01(t),
    beta: (t) => 1 - clamp01(t),
    alphaDerivative: () => 1.0,
    betaDerivative: () => -1.0
  },
  cosine: {
    displayName: 'Cosine',
    alpha: (t) => Math.sin((Math.PI / 2) * clamp01(t)),
    beta: (t) => Math.cos((Math.PI / 2) * clamp01(t)),
    alphaDerivative: (t) => (Math.PI / 2) * Math.cos((Math.PI / 2) * clamp01(t)),
    betaDerivative: (t) => -(Math.PI / 2) * Math.sin((Math.PI / 2) * clamp01(t))
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

/** Display names for schedule dropdown */
export const SCHEDULE_NAMES: Record<AlphaBetaScheduleName, string> = Object.fromEntries(
  Object.entries(ALPHA_BETA_SCHEDULES).map(([k, v]) => [k, v.displayName])
) as Record<AlphaBetaScheduleName, string>;
