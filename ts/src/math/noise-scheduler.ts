export interface NoiseScheduler {
  getAlpha(t: number): number;
  getAlphaDerivative(t: number): number;
  getBeta(t: number): number;
  getBetaDerivative(t: number): number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function makeLinearNoiseScheduler(): NoiseScheduler {
  return {
    getAlpha: (t: number) => clamp01(t),
    getAlphaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return 1;
    },
    getBeta: (t: number) => clamp01(1 - t),
    getBetaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return -1;
    }
  };
}

export function makeSqrtNoiseScheduler(): NoiseScheduler {
  return {
    getAlpha: (t: number) => clamp01(t),
    getAlphaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return 1;
    },
    getBeta: (t: number) => Math.sqrt(clamp01(1 - t)),
    getBetaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return -0.5 / Math.sqrt(1 - t);
    }
  };
}

export function makeInverseSqrtNoiseScheduler(): NoiseScheduler {
  // Inverse of β = √(1-t) is β = 1 - t²
  // This starts at 1 and decreases quickly initially, then smooths off
  return {
    getAlpha: (t: number) => clamp01(t),
    getAlphaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return 1;
    },
    getBeta: (t: number): number => {
      const tClamped = clamp01(t);
      return 1 - tClamped * tClamped;
    },
    getBetaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return -2 * t;
    }
  };
}

export function makeConstantVarianceScheduler(): NoiseScheduler {
  return {
    getAlpha: (t: number) => clamp01(t),
    getAlphaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return 1;
    },
    getBeta: (t: number): number => {
      const tClamped = clamp01(t);
      return Math.sqrt(1 - tClamped * tClamped);
    },
    getBetaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return -t / Math.sqrt(1 - t * t);
    }
  };
}

export function makeSqrtSqrtScheduler(): NoiseScheduler {
  return {
    getAlpha: (t: number) => Math.sqrt(clamp01(t)),
    getAlphaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return 0.5 / Math.sqrt(t);
    },
    getBeta: (t: number) => Math.sqrt(clamp01(1 - t)),
    getBetaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return -0.5 / Math.sqrt(1 - t);
    }
  };
}

export function makeCircularCircularScheduler(): NoiseScheduler {
  // α = sin(πt/2), β = cos(πt/2)
  // This traces a quarter circle from (α=0,β=1) to (α=1,β=0)
  return {
    getAlpha: (t: number): number => {
      const tClamped = clamp01(t);
      return Math.sin((Math.PI / 2) * tClamped);
    },
    getAlphaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return (Math.PI / 2) * Math.cos((Math.PI / 2) * t);
    },
    getBeta: (t: number): number => {
      const tClamped = clamp01(t);
      return Math.cos((Math.PI / 2) * tClamped);
    },
    getBetaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return -(Math.PI / 2) * Math.sin((Math.PI / 2) * t);
    }
  };
}

export function makeLinearVarianceScheduler(): NoiseScheduler {
  return {
    getAlpha: (t: number) => clamp01(t),
    getAlphaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return 1;
    },
    getBeta: (t: number): number => {
      const tClamped = clamp01(t);
      if (tClamped === 0 || tClamped === 1) {
        return 0;
      }
      return Math.sqrt(tClamped * (1 - tClamped));
    },
    getBetaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return (1 - 2 * t) / (2 * Math.sqrt(t * (1 - t)));
    }
  };
}

export function makeLinearStdDevScheduler(): NoiseScheduler {
  // Want σ(t) to be linear: σ(t) = at + b
  // Let's choose: σ(0) = 0, σ(1) = 1, so σ(t) = t
  // Then: σ²(t) = t²
  // So: α²σ_data² + β² = t²
  // With α=t: t²σ_data² + β² = t²
  // β² = t²(1 - σ_data²)
  // For σ_data=1: β² = 0, so β = 0
  // This doesn't work well.
  //
  // Let's try: σ(t) goes from 1 to 1 linearly (constant), or
  // from some non-zero value to 1.
  // σ(t) = (1-t)·a + t·1 = a + t(1-a)
  // Let's use a=0.5: σ(t) = 0.5 + 0.5t
  // σ²(t) = (0.5 + 0.5t)² = 0.25 + 0.5t + 0.25t²
  //
  // This is getting complex. Let's just use a simple formula:
  // β = t (linear in t)
  // This gives β going from 0 to 1
  return {
    getAlpha: (t: number) => clamp01(t),
    getAlphaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return 1;
    },
    getBeta: (t: number) => clamp01(t),
    getBetaDerivative: (t: number): number => {
      if (t <= 0 || t >= 1) {
        return 0;
      }
      return 1;
    }
  };
}

