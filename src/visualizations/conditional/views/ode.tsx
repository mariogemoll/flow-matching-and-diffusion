import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { type Point2D } from '../../../types';
import { clearWebGl } from '../../../webgl';
import { ViewContainer, ViewControls } from '../../components/layout';
import { PointerCanvas, type PointerCanvasHandle } from '../../components/pointer-canvas';
import {
  ResampleTrajectoriesButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox,
  ShowVectorFieldCheckbox
} from '../../components/standard-controls';
import {
  COLORS
} from '../../constants';
import { useEngine } from '../../engine';
import { type CondOdeRenderer, createCondOdeRenderer } from '../../webgl/conditional/ode';
import { type CondPathActions, type CondPathParams } from '../index';

export function CondOdeView(): React.ReactElement {
  const engine = useEngine<CondPathParams, CondPathActions>();
  const pointerCanvasRef = useRef<PointerCanvasHandle>(null);

  const rendererRef = useRef<CondOdeRenderer | null>(null);

  // Local state
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showVectorField, setShowVectorField] = useState(false);
  const [showSamples, setShowSamples] = useState(true);

  const paramsRef = useRef({
    showTrajectories,
    showVectorField,
    showSamples,
    recalcRequested: true
  });

  // Sync params ref
  useEffect(() => {
    paramsRef.current.showTrajectories = showTrajectories;
    paramsRef.current.showVectorField = showVectorField;
    paramsRef.current.showSamples = showSamples;
    engine.renderOnce();
  }, [showTrajectories, showVectorField, showSamples, engine]);

  // Register draw function
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = pointerCanvasRef.current?.webGl;
      if (!webGl) { return; }

      rendererRef.current ??= createCondOdeRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const params = paramsRef.current;

      // Sync settings
      renderer.setShowTrajectories(params.showTrajectories);
      renderer.setShowVectorField(params.showVectorField);
      renderer.setShowSamples(params.showSamples);

      if (params.recalcRequested) {
        // Only needed if we want to force resample from UI
        // But internal renderer handles update based on state changes
        params.recalcRequested = false;
      }

      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleResample = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resample();
      engine.renderOnce();
    } else {
      // If renderer is not ready, we request recalc next frame
      paramsRef.current.recalcRequested = true;
    }
  };

  return (
    <ViewContainer>
      <PointerCanvas
        ref={pointerCanvasRef}
        onPositionChange={(pos: Point2D) => { engine.actions.setZ(pos); }}
        xDomain={X_DOMAIN}
        yDomain={Y_DOMAIN}
      />
      <ViewControls>
        <ShowTrajectoriesCheckbox
          checked={showTrajectories}
          onChange={setShowTrajectories}
        />
        <ShowVectorFieldCheckbox
          checked={showVectorField}
          onChange={setShowVectorField}
        />
        <ShowSamplesCheckbox
          checked={showSamples}
          onChange={setShowSamples}
        />
        <ResampleTrajectoriesButton onClick={handleResample} />
      </ViewControls>
    </ViewContainer>
  );
}
