import { clamp01 } from '../../util/misc';

export type SigmaScheduleName = 'constant' | 'linear' | 'linear-reverse' | 'sine-bump';

export interface SigmaSchedule {
  sigma: (t: number, maxSigma: number) => number;
  displayName: string;
}

export const SIGMA_SCHEDULES: Record<SigmaScheduleName, SigmaSchedule> = {
  constant: {
    displayName: 'Constant',
    sigma: (_, maxSigma) => maxSigma
  },
  linear: {
    displayName: 'Linear',
    sigma: (t, maxSigma) => maxSigma * clamp01(t)
  },
  'linear-reverse': {
    displayName: 'Linear (Reverse)',
    sigma: (t, maxSigma) => maxSigma * (1 - clamp01(t))
  },
  'sine-bump': {
    displayName: 'Sine Bump',
    sigma: (t, maxSigma) => maxSigma * Math.sin(Math.PI * clamp01(t))
  }
};

export function getSigma(t: number, schedule: SigmaScheduleName, maxSigma: number): number {
  return SIGMA_SCHEDULES[schedule].sigma(t, maxSigma);
}
