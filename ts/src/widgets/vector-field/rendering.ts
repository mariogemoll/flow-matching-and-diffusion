import { clearWebGl, drawPointsWebGl, drawPolylineWebGl } from 'web-ui-common/webgl';

import { COLORS } from '../colors';
import { CANVAS_HEIGHT,CANVAS_WIDTH } from '../constants';
import { demoVectorField } from '../demo-vector-field';
import { drawVectorField } from '../rendering/vector-field';
import type { Point2D } from '../types';
import type { WebGl } from '../webgl';
import type { VectorFieldWidgetState } from './types';

function getDotPositionAtTime(state: VectorFieldWidgetState): Point2D {
  if (state.trajectory.length === 0) {
    return state.startPos;
  }
  const trajectoryIndex = Math.floor(state.currentTime * (state.trajectory.length - 1));
  if (trajectoryIndex >= 0 && trajectoryIndex < state.trajectory.length) {
    return state.trajectory[trajectoryIndex];
  }
  return state.startPos;
}

export function render(rendering: WebGl, state: VectorFieldWidgetState): void {
  clearWebGl(rendering.context, COLORS.BACKGROUND_WEBGL);

  drawVectorField(
    rendering.lineRenderer, state.currentTime,
    (x, y, t) => demoVectorField(x, y, t, CANVAS_WIDTH, CANVAS_HEIGHT), {
      color: COLORS.VECTOR_FIELD_ARROW
    });

  if (state.showTrajectory && state.trajectory.length > 1) {
    drawPolylineWebGl(rendering.lineRenderer, state.trajectory, COLORS.VECTOR_FIELD_TRAJECTORY);
  }

  const dotPos = getDotPositionAtTime(state);
  drawPointsWebGl(rendering.pointRenderer, [dotPos], COLORS.VECTOR_FIELD_DOT, 16);
}
