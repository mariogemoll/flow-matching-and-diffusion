import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  X_DOMAIN,
  Y_DOMAIN
} from '../../constants';
import { type Point2D } from '../../types';
import { clamp01 } from '../../util/misc';
import { createWebGl, type WebGl } from '../../webgl';

export interface PointerCanvasHandle {
  webGl: WebGl | null;
}

export interface PointerCanvasProps {
  /** Callback when position changes via pointer interaction */
  onPositionChange: (pos: Point2D) => void;
  /** Custom x-domain, defaults to global X_DOMAIN */
  xDomain?: [number, number];
  /** Custom y-domain, defaults to global Y_DOMAIN */
  yDomain?: [number, number];
  /** Custom width, defaults to CANVAS_WIDTH */
  width?: number;
  /** Custom height, defaults to CANVAS_HEIGHT */
  height?: number;
  /** Called when drag starts */
  onDragStart?: (pos: Point2D) => void;
  /** Called when drag ends */
  onDragEnd?: () => void;
}

/**
 * A canvas component that handles:
 * - WebGL initialization (exposed via ref.webGl)
 * - Pointer events (mouse, touch, pen) for position picking
 *
 * Parent is responsible for registering draw function with engine.
 */
export const PointerCanvas = forwardRef<PointerCanvasHandle, PointerCanvasProps>(
  function PointerCanvas(
    {
      onPositionChange,
      xDomain = X_DOMAIN,
      yDomain = Y_DOMAIN,
      width = CANVAS_WIDTH,
      height = CANVAS_HEIGHT,
      onDragStart,
      onDragEnd
    },
    ref
  ): React.JSX.Element {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const webGlRef = useRef<WebGl | null>(null);

    // Expose webGl via imperative handle
    useImperativeHandle(ref, (): PointerCanvasHandle => ({
      get webGl(): WebGl | null {
        return webGlRef.current;
      }
    }));

    // Convert pointer event to data coordinates
    const pointerToData = (e: React.PointerEvent<HTMLCanvasElement>): Point2D => {
      const canvas = canvasRef.current;
      if (!canvas) { return [0, 0]; }

      const rect = canvas.getBoundingClientRect();
      const xCss = e.clientX - rect.left;
      const yCss = e.clientY - rect.top;

      // Normalize to 0-1 range
      const xNorm = rect.width > 0 ? clamp01(xCss / rect.width) : 0.5;
      const yNorm = rect.height > 0 ? clamp01(yCss / rect.height) : 0.5;

      // Convert to data coordinates
      const dataX = xDomain[0] + xNorm * (xDomain[1] - xDomain[0]);
      const dataY = yDomain[0] + (1 - yNorm) * (yDomain[1] - yDomain[0]);

      return [dataX, dataY];
    };

    // Initialize WebGL
    useEffect((): (() => void) | undefined => {
      const canvas = canvasRef.current;
      if (!canvas) { return; }
      const webGl = createWebGl(canvas, width, height, xDomain, yDomain);
      webGlRef.current = webGl;
      return () => {
        webGl.gl.getExtension('WEBGL_lose_context')?.loseContext();
        webGlRef.current = null;
      };
    }, []);

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
      canvasRef.current?.setPointerCapture(e.pointerId);
      const pos = pointerToData(e);
      onPositionChange(pos);
      onDragStart?.(pos);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
      if (e.buttons !== 1) { return; }
      onPositionChange(pointerToData(e));
    };

    const handlePointerEnd = (): void => {
      onDragEnd?.();
    };

    return (
      <canvas
        ref={canvasRef}
        className="view"
        style={{ width, height, cursor: 'crosshair' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
      />
    );
  }
);
