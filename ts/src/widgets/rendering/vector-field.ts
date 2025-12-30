import { drawLineSegments, type WebGlLineRenderer } from 'web-ui-common/webgl';

import { CANVAS_HEIGHT,CANVAS_WIDTH } from '../constants';
import type { Point2D } from '../types';

type LineSegment = [Point2D, Point2D];
type ArrowSegments = [LineSegment, LineSegment, LineSegment];
type VectorFieldFunction = (x: number, y: number, t: number) => [number, number];

export interface VectorFieldRenderOptions {
  gridSizeX?: number;
  gridSizeY?: number;
  headLength?: number;
  headAngle?: number;
  maxArrowLength?: number;
  minArrowLength?: number;
  arrowScale?: number;
  color?: string;
}

const DEFAULT_OPTIONS: Required<VectorFieldRenderOptions> = {
  gridSizeX: 25,
  gridSizeY: 19,
  headLength: 3,
  headAngle: Math.PI / 6,
  maxArrowLength: 8,
  minArrowLength: 2,
  arrowScale: 3,
  color: 'rgba(255, 255, 255, 0.6)'
};

function createArrowShaft(
  start: Point2D,
  vx: number,
  vy: number,
  options: Required<VectorFieldRenderOptions>
): LineSegment {
  const arrowLength = Math.sqrt(vx * vx + vy * vy);
  const scaledLength = Math.max(
    options.minArrowLength,
    Math.min(arrowLength * options.arrowScale, options.maxArrowLength)
  );
  const dx = (vx / arrowLength) * scaledLength;
  const dy = (vy / arrowLength) * scaledLength;

  const end: Point2D = [start[0] + dx, start[1] + dy];
  return [start, end];
}

function createArrowHead(
  tip: Point2D,
  angle: number,
  headLength: number,
  headAngle: number
): [LineSegment, LineSegment] {
  const leftX = tip[0] - headLength * Math.cos(angle - headAngle);
  const leftY = tip[1] - headLength * Math.sin(angle - headAngle);
  const rightX = tip[0] - headLength * Math.cos(angle + headAngle);
  const rightY = tip[1] - headLength * Math.sin(angle + headAngle);

  return [
    [tip, [leftX, leftY]],
    [tip, [rightX, rightY]]
  ];
}

function createArrowSegments(
  px: number,
  py: number,
  vx: number,
  vy: number,
  options: Required<VectorFieldRenderOptions>
): ArrowSegments {
  const start: Point2D = [px, py];
  const shaft = createArrowShaft(start, vx, vy, options);
  const tip = shaft[1];

  const angle = Math.atan2(tip[1] - start[1], tip[0] - start[0]);
  const [headLeft, headRight] = createArrowHead(tip, angle, options.headLength, options.headAngle);

  return [shaft, headLeft, headRight];
}

export function drawVectorField(
  lineRenderer: WebGlLineRenderer,
  t: number,
  vectorFieldFn: VectorFieldFunction,
  options: VectorFieldRenderOptions = {}
): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const segments: LineSegment[] = [];

  for (let i = 0; i < opts.gridSizeX; i++) {
    for (let j = 0; j < opts.gridSizeY; j++) {
      const px = (i + 0.5) * (CANVAS_WIDTH / opts.gridSizeX);
      const py = (j + 0.5) * (CANVAS_HEIGHT / opts.gridSizeY);
      const [vx, vy] = vectorFieldFn(px, py, t);
      const arrowLength = Math.sqrt(vx * vx + vy * vy);

      if (arrowLength > 0.0001) {
        const arrowSegments = createArrowSegments(px, py, vx, vy, opts);
        segments.push(...arrowSegments);
      }
    }
  }

  drawLineSegments(lineRenderer, segments, opts.color);
}
