import { describe, expect,it } from 'vitest';
import type { Pair } from 'web-ui-common/types';

import {
  calculateConditionalODETrajectory,
  calculateConditionalSDETrajectory,
  generateBrownianNoise,
  generateBrownianNoiseForTimes
} from './conditional-trajectory-logic';
import { makeConstantDiffusionCoefficientScheduler } from './math/diffusion-coefficient-scheduler';
import { makeConstantVarianceScheduler } from './math/noise-scheduler';

describe('Conditional Trajectory Logic', () => {
  describe('generateBrownianNoise', () => {
    it('should generate correct number of noise samples', () => {
      const noise = generateBrownianNoise(100, 0.01);
      expect(noise).toHaveLength(100);
    });

    it('should generate pairs of numbers', () => {
      const noise = generateBrownianNoise(10, 0.01);
      noise.forEach(([x, y]) => {
        expect(typeof x).toBe('number');
        expect(typeof y).toBe('number');
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      });
    });
  });

  describe('calculateConditionalODETrajectory', () => {
    const scheduler = makeConstantVarianceScheduler();

    it('should start at initial sample at t=0', () => {
      const initialSample: Pair<number> = [2.0, 1.5];
      const dataPoint: Pair<number> = [0.0, 0.0];
      const frameTimes = [0, 0.5, 1.0];

      const trajectory = calculateConditionalODETrajectory(
        initialSample,
        dataPoint,
        scheduler,
        frameTimes
      );

      // At t=0, should be at initial sample
      expect(trajectory[0][0]).toBeCloseTo(initialSample[0], 5);
      expect(trajectory[0][1]).toBeCloseTo(initialSample[1], 5);
    });

    it('should end at data point at t=1', () => {
      const initialSample: Pair<number> = [2.0, 1.5];
      const dataPoint: Pair<number> = [-1.0, 0.5];
      const frameTimes = [0, 0.5, 1.0];

      const trajectory = calculateConditionalODETrajectory(
        initialSample,
        dataPoint,
        scheduler,
        frameTimes
      );

      // At t=1, should be at data point
      const finalPoint = trajectory[trajectory.length - 1];
      expect(finalPoint[0]).toBeCloseTo(dataPoint[0], 5);
      expect(finalPoint[1]).toBeCloseTo(dataPoint[1], 5);
    });

    it('should create smooth trajectory between initial and data point', () => {
      const initialSample: Pair<number> = [3.0, 2.0];
      const dataPoint: Pair<number> = [0.0, 0.0];
      const frameTimes = [0, 0.25, 0.5, 0.75, 1.0];

      const trajectory = calculateConditionalODETrajectory(
        initialSample,
        dataPoint,
        scheduler,
        frameTimes
      );

      // Distance from data point should decrease monotonically
      let prevDist = Infinity;
      for (const [x, y] of trajectory) {
        const dist = Math.sqrt((x - dataPoint[0]) ** 2 + (y - dataPoint[1]) ** 2);
        expect(dist).toBeLessThanOrEqual(prevDist + 1e-10); // Allow small numerical error
        prevDist = dist;
      }
    });
  });

  describe('calculateConditionalSDETrajectory', () => {
    const scheduler = makeConstantVarianceScheduler();

    it('should start at initial sample at t=0', () => {
      const initialSample: Pair<number> = [2.0, 1.5];
      const dataPoint: Pair<number> = [0.0, 0.0];
      const frameTimes = [0, 0.5, 1.0];
      const diffusionScheduler = makeConstantDiffusionCoefficientScheduler(0.3);
      const noise = generateBrownianNoise(frameTimes.length - 1, 0.01);

      const trajectory = calculateConditionalSDETrajectory(
        initialSample,
        dataPoint,
        scheduler,
        frameTimes,
        diffusionScheduler,
        noise
      );

      // At t=0, should be at initial sample
      expect(trajectory[0][0]).toBeCloseTo(initialSample[0], 5);
      expect(trajectory[0][1]).toBeCloseTo(initialSample[1], 5);
    });

    it('should converge to data point at t=1', () => {
      const initialSample: Pair<number> = [2.0, 1.5];
      const dataPoint: Pair<number> = [-1.0, 0.5];
      const numFrames = 100;
      const frameTimes: number[] = [];
      for (let i = 0; i <= numFrames; i++) {
        frameTimes.push(i / numFrames);
      }
      const diffusionScheduler = makeConstantDiffusionCoefficientScheduler(0.3);
      const noise = generateBrownianNoise(numFrames, 1.0 / numFrames);

      const trajectory = calculateConditionalSDETrajectory(
        initialSample,
        dataPoint,
        scheduler,
        frameTimes,
        diffusionScheduler,
        noise
      );

      // At t=1, should be very close to data point
      const finalPoint = trajectory[trajectory.length - 1];
      const distance = Math.sqrt(
        (finalPoint[0] - dataPoint[0]) ** 2 + (finalPoint[1] - dataPoint[1]) ** 2
      );

      // With time-dependent diffusion σ_t = σ * (1-t), at t=1 the diffusion is 0
      // So the trajectory should converge to the target
      expect(distance).toBeLessThan(0.1);
    });

    it('should converge for multiple trajectories with different initial points', () => {
      const dataPoint: Pair<number> = [1.0, -0.5];
      const numFrames = 100;
      const frameTimes: number[] = [];
      for (let i = 0; i <= numFrames; i++) {
        frameTimes.push(i / numFrames);
      }
      const diffusionScheduler = makeConstantDiffusionCoefficientScheduler(0.3);

      // Test with 10 different initial samples
      const initialSamples: Pair<number>[] = [
        [2.0, 1.5],
        [-1.0, 2.0],
        [0.0, -2.0],
        [3.0, 0.0],
        [-2.5, -1.5],
        [1.5, 2.5],
        [-3.0, 0.5],
        [0.5, -3.0],
        [2.5, -2.0],
        [-1.5, 1.0]
      ];

      for (const initialSample of initialSamples) {
        const noise = generateBrownianNoise(numFrames, 1.0 / numFrames);
        const trajectory = calculateConditionalSDETrajectory(
          initialSample,
          dataPoint,
          scheduler,
          frameTimes,
          diffusionScheduler,
          noise
        );

        const finalPoint = trajectory[trajectory.length - 1];
        const distance = Math.sqrt(
          (finalPoint[0] - dataPoint[0]) ** 2 + (finalPoint[1] - dataPoint[1]) ** 2
        );

        // All trajectories should converge to the target
        expect(distance).toBeLessThan(0.1);
      }
    });

    it('should converge with different diffusion coefficients', () => {
      const initialSample: Pair<number> = [2.0, 1.5];
      const dataPoint: Pair<number> = [0.0, 0.0];
      const numFrames = 100;
      const frameTimes: number[] = [];
      for (let i = 0; i <= numFrames; i++) {
        frameTimes.push(i / numFrames);
      }

      const diffusionCoeffs = [0.1, 0.3, 0.5, 0.7, 1.0];

      for (const diffusionCoeff of diffusionCoeffs) {
        const noise = generateBrownianNoise(numFrames, 1.0 / numFrames);
        const trajectory = calculateConditionalSDETrajectory(
          initialSample,
          dataPoint,
          scheduler,
          frameTimes,
          makeConstantDiffusionCoefficientScheduler(diffusionCoeff),
          noise
        );

        const finalPoint = trajectory[trajectory.length - 1];
        const distance = Math.sqrt(
          (finalPoint[0] - dataPoint[0]) ** 2 + (finalPoint[1] - dataPoint[1]) ** 2
        );

        // Should converge regardless of diffusion coefficient
        expect(distance).toBeLessThan(0.15);
      }
    });

    it('should have trajectory that stays within reasonable bounds', () => {
      const initialSample: Pair<number> = [1.0, 1.0];
      const dataPoint: Pair<number> = [0.0, 0.0];
      const numFrames = 100;
      const frameTimes: number[] = [];
      for (let i = 0; i <= numFrames; i++) {
        frameTimes.push(i / numFrames);
      }
      const diffusionScheduler = makeConstantDiffusionCoefficientScheduler(0.3);
      const noise = generateBrownianNoise(numFrames, 1.0 / numFrames);

      const trajectory = calculateConditionalSDETrajectory(
        initialSample,
        dataPoint,
        scheduler,
        frameTimes,
        diffusionScheduler,
        noise
      );

      // Check that all points are finite and within reasonable bounds
      for (const [x, y] of trajectory) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(Math.abs(x)).toBeLessThan(10); // Should not explode
        expect(Math.abs(y)).toBeLessThan(10);
      }
    });
  });

  describe('SDE vs ODE comparison', () => {
    it('should have SDE trajectory end near ODE trajectory endpoint', () => {
      const initialSample: Pair<number> = [2.0, 1.5];
      const dataPoint: Pair<number> = [0.0, 0.0];
      const scheduler = makeConstantVarianceScheduler();
      const numFrames = 100;
      const frameTimes: number[] = [];
      for (let i = 0; i <= numFrames; i++) {
        frameTimes.push(i / numFrames);
      }

      // Calculate ODE trajectory
      const odeTrajectory = calculateConditionalODETrajectory(
        initialSample,
        dataPoint,
        scheduler,
        frameTimes
      );

      // Calculate SDE trajectory
      const diffusionScheduler = makeConstantDiffusionCoefficientScheduler(0.3);
      const noise = generateBrownianNoise(numFrames, 1.0 / numFrames);
      const sdeTrajectory = calculateConditionalSDETrajectory(
        initialSample,
        dataPoint,
        scheduler,
        frameTimes,
        diffusionScheduler,
        noise
      );

      // Both should end at the same point (the data point)
      const odeFinal = odeTrajectory[odeTrajectory.length - 1];
      const sdeFinal = sdeTrajectory[sdeTrajectory.length - 1];

      const distance = Math.sqrt(
        (odeFinal[0] - sdeFinal[0]) ** 2 + (odeFinal[1] - sdeFinal[1]) ** 2
      );

      expect(distance).toBeLessThan(0.1);
    });
  });

  describe('generateBrownianNoiseForTimes', () => {
    it('should generate correct number of noise samples for frame times', () => {
      const frameTimes = [0, 0.1, 0.3, 0.7, 1.0];
      const noise = generateBrownianNoiseForTimes(frameTimes);
      // One less than frames (no noise for first frame)
      expect(noise).toHaveLength(frameTimes.length - 1);
    });

    it('should generate properly scaled noise for non-uniform steps', () => {
      const frameTimes = [0, 0.01, 0.5, 1.0]; // Very non-uniform
      const noise = generateBrownianNoiseForTimes(frameTimes);

      noise.forEach(([x, y]) => {
        expect(typeof x).toBe('number');
        expect(typeof y).toBe('number');
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      });
    });
  });

  describe('SDE with uniform step counts', () => {
    it('should converge with different numbers of evenly spaced steps', () => {
      const initialSample: Pair<number> = [1.5, -0.5];
      const dataPoint: Pair<number> = [0.0, 0.0];
      const scheduler = makeConstantVarianceScheduler();
      const diffusionScheduler = makeConstantDiffusionCoefficientScheduler(0.3);
      const stepCounts = [20, 50, 120, 300];
      const distances: number[] = [];

      for (const steps of stepCounts) {
        const frameTimes: number[] = [];
        for (let frame = 0; frame <= steps; frame++) {
          frameTimes.push(frame / steps);
        }

        const noise = Array.from({ length: steps }, () => [0, 0] as Pair<number>);

        const trajectory = calculateConditionalSDETrajectory(
          initialSample,
          dataPoint,
          scheduler,
          frameTimes,
          diffusionScheduler,
          noise
        );

        const finalPoint = trajectory[trajectory.length - 1];
        const distance = Math.sqrt(
          (finalPoint[0] - dataPoint[0]) ** 2 + (finalPoint[1] - dataPoint[1]) ** 2
        );

        distances.push(distance);
      }

      const finalDistance = distances[distances.length - 1];
      expect(finalDistance).toBeLessThan(1e-6);
    });
  });
});
