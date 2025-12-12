/**
 * Generate a random normal value using Box-Muller transform
 */
function randomNormal(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return z0 * stdDev + mean;
}

/**
 * Generate base noise for Brownian motion (without sigma scaling)
 */
export function generateBrownianNoise(
  numPaths: number,
  numSteps: number,
  dt: number
): number[][][] {
  const stdDev = Math.sqrt(dt);
  const noise: number[][][] = [];

  // Generate random increments for x and y coordinates
  // Shape: [numPaths, numSteps, 2]
  for (let path = 0; path < numPaths; path++) {
    const pathNoise: number[][] = [];
    for (let step = 0; step < numSteps; step++) {
      const dWx = randomNormal(0, stdDev);
      const dWy = randomNormal(0, stdDev);
      pathNoise.push([dWx, dWy]);
    }
    noise.push(pathNoise);
  }

  return noise;
}

/**
 * Generate Brownian motion paths from pre-generated noise
 */
export function computeBrownianMotion(
  noise: number[][][],
  sigma: number
): number[][][] {
  const paths: number[][][] = [];

  // Scale noise by sigma and compute cumulative sum for each path
  for (const pathNoise of noise) {
    const path: number[][] = [];
    let cumulativeX = 0;
    let cumulativeY = 0;

    // Start at the origin
    path.push([0, 0]);

    for (const [dWx, dWy] of pathNoise) {
      cumulativeX += dWx * sigma;
      cumulativeY += dWy * sigma;
      path.push([cumulativeX, cumulativeY]);
    }

    paths.push(path);
  }

  return paths;
}
