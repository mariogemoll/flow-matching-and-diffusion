// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

import type { Points2D, Trajectories } from '../types';
import { makeTrajectories } from '../util/trajectories';
import type { Tensor2D } from './types';

/**
 * Minimal duck-typed interface for a generative model that can be
 * visualized by the generation widget. Flow matching (ODE) and
 * diffusion (SDE) models both satisfy it.
 */
export interface GenerativeModel {
  generate(z: Tensor2D, numSteps?: number): Tensor2D[];
  predictVelocity?(x: Tensor2D, t: Tensor2D): Tensor2D;
}

/**
 * Run the full generation pipeline: sample noise, integrate the ODE/SDE,
 * and return every frame plus per-sample trajectories.
 */
export async function generateData(
  model: GenerativeModel,
  numSamples: number,
  numSteps = 100
): Promise<{ frames: Points2D[]; trajectories: Trajectories }> {
  const noise: Tensor2D = tf.randomNormal([numSamples, 2]);
  return generateDataFromTensor(model, noise, numSteps);
}

export async function generateDataFromPoints(
  model: GenerativeModel,
  points: Points2D,
  numSteps = 100
): Promise<{ frames: Points2D[]; trajectories: Trajectories }> {
  const numSamples = points.xs.length;
  const pointData = new Float32Array(numSamples * 2);
  for (let i = 0; i < numSamples; i++) {
    pointData[i * 2] = points.xs[i];
    pointData[i * 2 + 1] = points.ys[i];
  }
  const initialPoints = tf.tensor2d(pointData, [numSamples, 2]);
  return generateDataFromTensor(model, initialPoints, numSteps);
}

async function generateDataFromTensor(
  model: GenerativeModel,
  initialPoints: Tensor2D,
  numSteps: number
): Promise<{ frames: Points2D[]; trajectories: Trajectories }> {
  const tensorFrames = model.generate(initialPoints, numSteps);
  const numFrames = tensorFrames.length;
  const stackedFrames = tf.stack(tensorFrames);
  const stackedData = await stackedFrames.data() as Float32Array;
  const numSamples = initialPoints.shape[0];

  const frames: Points2D[] = [];
  const trajectories = makeTrajectories(numFrames, numSamples);

  for (let f = 0; f < numFrames; f++) {
    const xs = new Float32Array(numSamples);
    const ys = new Float32Array(numSamples);
    for (let j = 0; j < numSamples; j++) {
      const baseIndex = (f * numSamples + j) * 2;
      xs[j] = stackedData[baseIndex];
      ys[j] = stackedData[baseIndex + 1];
      trajectories.xs[j * numFrames + f] = xs[j];
      trajectories.ys[j * numFrames + f] = ys[j];
    }
    frames.push({ xs, ys, version: 0 });
  }

  stackedFrames.dispose();
  for (const tensor of tensorFrames) {
    tensor.dispose();
  }

  return { frames, trajectories };
}

/**
 * Linearly interpolate between pre-computed frames at continuous time t ∈ [0, 1].
 */
export function interpolateFrames(
  frames: Points2D[], t: number, out: Points2D
): void {
  const idx = t * (frames.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, frames.length - 1);
  const frac = idx - lo;

  const a = frames[lo];
  const b = frames[hi];
  const n = a.xs.length;

  for (let i = 0; i < n; i++) {
    out.xs[i] = a.xs[i] + frac * (b.xs[i] - a.xs[i]);
    out.ys[i] = a.ys[i] + frac * (b.ys[i] - a.ys[i]);
  }
  out.version++;
}

/**
 * Predict velocity vectors for a batch of 2D points at a given time.
 */
export async function predictVelocityBatch(
  model: GenerativeModel,
  points: Points2D,
  t: number
): Promise<Points2D> {
  if (model.predictVelocity === undefined) {
    throw new Error('Model does not implement predictVelocity');
  }
  const n = points.xs.length;
  const xArr = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    xArr[i * 2] = points.xs[i];
    xArr[i * 2 + 1] = points.ys[i];
  }

  const x = tf.tensor2d(xArr, [n, 2]);
  const tTensor: Tensor2D = tf.fill([n, 1], t);
  const velocity = model.predictVelocity(x, tTensor);
  const data = await velocity.data() as Float32Array;
  velocity.dispose();
  tTensor.dispose();
  x.dispose();

  const result: Points2D = {
    xs: new Float32Array(n),
    ys: new Float32Array(n),
    version: 0
  };
  for (let i = 0; i < n; i++) {
    result.xs[i] = data[i * 2];
    result.ys[i] = data[i * 2 + 1];
  }

  return result;
}
