import { clamp01 } from '../../util/misc';

export type SigmaScheduleName =
  | 'constant'
  | 'linear-decay'
  | 'linear-increase'
  | 'sine'
  | 'cosine-decay'
  | 'step';

export interface SigmaSchedule {
  sigma: (t: number, maxSigma: number) => number;
  displayName: string;
}

export const SIGMA_SCHEDULES: Record<SigmaScheduleName, SigmaSchedule> = {
  constant: {
    displayName: 'σ(t) = σ_max',
    sigma: (_, maxSigma) => maxSigma
  },

  'linear-decay': {
    displayName: 'σ(t) = σ_max · (1 - t)',
    sigma: (t, maxSigma) => maxSigma * (1 - clamp01(t))
  },

  'linear-increase': {
    displayName: 'σ(t) = σ_max · t',
    sigma: (t, maxSigma) => maxSigma * clamp01(t)
  },

  sine: {
    displayName: 'σ(t) = σ_max · sin(πt)',
    sigma: (t, maxSigma) => maxSigma * Math.sin(Math.PI * clamp01(t))
  },

  'cosine-decay': {
    displayName: 'σ(t) = σ_max · cos(πt/2)',
    sigma: (t, maxSigma) => maxSigma * Math.cos((Math.PI / 2) * clamp01(t))
  },

  step: {
    displayName: 'σ(t) = σ_max · (⌊5t⌋ % 2)',
    sigma: (t, maxSigma) => {
      const step = Math.floor(clamp01(t) * 5);
      return step % 2 === 0 ? maxSigma : 0;
    }
  }
};

export function getSigma(t: number, schedule: SigmaScheduleName, maxSigma: number): number {
  return SIGMA_SCHEDULES[schedule].sigma(t, maxSigma);
}
