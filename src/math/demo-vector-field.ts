// SPDX-FileCopyrightText: 2026 Mario Gemoll
// SPDX-License-Identifier: 0BSD

/**
 * Demo vector field - a decorative vector field with eddies and swirls
 */

// import { dataToPixel, pixelToData } from "../util";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  NUM_TRAJECTORY_STEPS,
  X_DOMAIN,
  Y_DOMAIN
} from '../constants';
import type { Point2D, Points2D, Trajectories } from '../types';
import { makePoints2D } from '../util/points';
import { eulerMethodTrajectory } from './vector-field';

export function dataToPixel(dataPos: Point2D): Point2D {
  const [dataX, dataY] = dataPos;
  const xRatio = (dataX - X_DOMAIN[0]) / (X_DOMAIN[1] - X_DOMAIN[0]);
  const yRatio = (dataY - Y_DOMAIN[0]) / (Y_DOMAIN[1] - Y_DOMAIN[0]);
  return [xRatio * CANVAS_WIDTH, (1 - yRatio) * CANVAS_HEIGHT];
}

export function pixelToData(pixelPos: Point2D): Point2D {
  const [px, py] = pixelPos;
  const xRatio = px / CANVAS_WIDTH;
  const yRatio = 1 - py / CANVAS_HEIGHT;
  return [
    X_DOMAIN[0] + xRatio * (X_DOMAIN[1] - X_DOMAIN[0]),
    Y_DOMAIN[0] + yRatio * (Y_DOMAIN[1] - Y_DOMAIN[0])
  ];
}

/**
 * The demo vector field with eddies and swirls (works in pixel space internally)
 */
function demoVectorFieldRaw(
  x: number,
  y: number,
  t: number,
  canvasWidth: number,
  canvasHeight: number
): [number, number] {
  const phase = t * Math.PI * 2;
  const dataWidth = 200;
  const dataHeight = 150;
  const scaledX = (x / canvasWidth) * dataWidth;
  const scaledY = (y / canvasHeight) * dataHeight;

  const baseFlowX = 1.0 + 0.3 * Math.sin(phase * 0.4);
  const baseFlowY = 0.2 * Math.sin(scaledY / 100 + phase * 0.3);

  const eddies = [
    { x: dataWidth * 0.25, y: dataHeight * 0.3, strength: 0.6, rotation: 1 },
    { x: dataWidth * 0.6, y: dataHeight * 0.7, strength: 0.5, rotation: -1 },
    { x: dataWidth * 0.8, y: dataHeight * 0.2, strength: 0.4, rotation: 1 }
  ];

  const whirlX = dataWidth * 0.45;
  const whirlY = dataHeight * 0.55;
  const whirlStrength = 1.4;

  let eddyX = 0;
  let eddyY = 0;

  for (const eddy of eddies) {
    const dx = scaledX - eddy.x;
    const dy = scaledY - eddy.y;
    const r = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    if (r > 5) {
      const strength = eddy.strength * Math.exp(-r / 80) * (1 + 0.4 * Math.sin(phase + angle * 2));
      eddyX += -strength * Math.sin(angle) * eddy.rotation;
      eddyY += strength * Math.cos(angle) * eddy.rotation;
    }
  }

  const whirlDx = scaledX - whirlX;
  const whirlDy = scaledY - whirlY;
  const whirlR = Math.sqrt(whirlDx * whirlDx + whirlDy * whirlDy);
  const whirlAngle = Math.atan2(whirlDy, whirlDx);
  let whirlVx = 0;
  let whirlVy = 0;

  if (whirlR > 8) {
    const whirlForce = whirlStrength * Math.exp(-whirlR / 70) *
      (1 + 0.6 * Math.sin(phase * 1.1 + whirlAngle));
    whirlVx = -whirlForce * Math.sin(whirlAngle);
    whirlVy = whirlForce * Math.cos(whirlAngle);
  }

  const waveX = 0.8 * Math.sin(scaledY / 70 + phase * 0.6) * Math.cos(scaledX / 90);
  const waveY = 0.6 * Math.cos(scaledX / 80 + phase * 0.5) * Math.sin(scaledY / 110);

  let verticalY = 0;

  const current1X = dataWidth * 0.3;
  const dist1 = Math.abs(scaledX - current1X);
  if (dist1 < 120) {
    const strength1 = Math.exp(-dist1 / 60) * (1 + 0.5 * Math.sin(phase * 0.8));
    verticalY += 1.2 * strength1 * Math.sin(scaledY / 50 + phase);
  }

  const current2X = dataWidth * 0.7;
  const dist2 = Math.abs(scaledX - current2X);
  if (dist2 < 100) {
    const strength2 = Math.exp(-dist2 / 50) * (1 + 0.3 * Math.cos(phase * 1.2));
    verticalY += -0.9 * strength2 * Math.cos(scaledY / 60 + phase * 1.5);
  }

  const canvasScaleX = canvasWidth / dataWidth;
  const canvasScaleY = canvasHeight / dataHeight;

  return [
    (baseFlowX + eddyX + whirlVx + waveX) * 90 * canvasScaleX,
    (baseFlowY + eddyY + whirlVy + waveY + verticalY) * 90 * canvasScaleY
  ];
}

function demoVectorFieldPixelSpace(pos: Point2D, t: number): Point2D {
  const yUp = CANVAS_HEIGHT - pos[1];
  const [vx, vy] = demoVectorFieldRaw(pos[0], yUp, t, CANVAS_WIDTH, CANVAS_HEIGHT);
  return [vx, -vy];
}

/**
 * Demo vector field in data space coordinates
 */
export function demoVectorField(dataPos: Point2D, t: number): Point2D {
  const screenPos = dataToPixel(dataPos);
  const screenVel = demoVectorFieldPixelSpace(screenPos, t);

  // Transform velocity back to data space
  const [originDataX, originDataY] = pixelToData([0, 0]);
  const [vDataX, vDataY] = pixelToData(screenVel);

  return [vDataX - originDataX, vDataY - originDataY];
}

/**
 * Batched version: compute demo vector field for multiple points at once
 */
export function demoVectorFieldBatch(
  points: Points2D,
  t: number
): Points2D {
  const n = points.xs.length;
  const result = makePoints2D(n);
  const { xs: dataXs, ys: dataYs } = points;
  const { xs: vxs, ys: vys } = result;

  const [originDataX, originDataY] = pixelToData([0, 0]);

  for (let i = 0; i < n; i++) {
    const screenPos = dataToPixel([dataXs[i], dataYs[i]]);
    const screenVel = demoVectorFieldPixelSpace(screenPos, t);
    const [vDataX, vDataY] = pixelToData(screenVel);

    vxs[i] = vDataX - originDataX;
    vys[i] = vDataY - originDataY;
  }

  return result;
}

/**
 * Generate trajectory using demo vector field
 */
export function demoVectorFieldTrajectory(startPos: Point2D): Trajectories {
  return eulerMethodTrajectory(demoVectorField, NUM_TRAJECTORY_STEPS, startPos);
}

/**
 * Random starting position in data domain
 */
export function randomStartPos(): Point2D {
  // Left 2/3 of the domain, with margins
  const marginX = (X_DOMAIN[1] - X_DOMAIN[0]) * 0.1;
  const marginY = (Y_DOMAIN[1] - Y_DOMAIN[0]) * 0.1;
  const xRange = ((X_DOMAIN[1] - X_DOMAIN[0]) * 2) / 3 - 2 * marginX;
  const yRange = Y_DOMAIN[1] - Y_DOMAIN[0] - 2 * marginY;

  return [
    X_DOMAIN[0] + marginX + Math.random() * xRange,
    Y_DOMAIN[0] + marginY + Math.random() * yRange
  ];
}
