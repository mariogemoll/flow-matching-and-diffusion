export const SQRT_TWO_PI = Math.sqrt(2 * Math.PI);

export interface GaussianParameters {
  mean: number;
  stdDev: number;
}

export interface GaussianComponent extends GaussianParameters {
  weight: number;
}

export function gaussianPdf(x: number, mean: number, stdDev: number): number {
  if (stdDev <= 0) {
    throw new Error('Gaussian standard deviation must be positive');
  }

  const centered = (x - mean) / stdDev;
  return Math.exp(-0.5 * centered * centered) / (SQRT_TWO_PI * stdDev);
}

export function normalizeGaussianComponents(
  components: GaussianComponent[]
): GaussianComponent[] {
  const totalWeight = components.reduce((sum, { weight }) => sum + weight, 0);

  if (totalWeight <= 0) {
    throw new Error('Gaussian mixture must have a positive total weight');
  }

  return components.map(({ weight, mean, stdDev }) => {
    if (stdDev <= 0) {
      throw new Error('Gaussian standard deviation must be positive');
    }

    return {
      weight: weight / totalWeight,
      mean,
      stdDev
    };
  });
}

export function makeGaussianMixture(components: GaussianComponent[]): (x: number) => number {
  return (x: number): number =>
    components.reduce(
      (sum, { weight, mean, stdDev }) => sum + weight * gaussianPdf(x, mean, stdDev),
      0
    );
}
