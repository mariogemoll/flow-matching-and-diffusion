import React, { useEffect, useRef, useState } from 'react';

import {
  X_DOMAIN,
  Y_DOMAIN
} from '../../../constants';
import { clearWebGl, type WebGl } from '../../../webgl';
import { ViewContainer, ViewControls } from '../../components/layout';
import {
  ResampleTrajectoriesButton,
  ShowSamplesCheckbox,
  ShowTrajectoriesCheckbox,
  ShowVectorFieldCheckbox
} from '../../components/standard-controls';
import { WebGlCanvas } from '../../components/webgl-canvas';
import { COLORS } from '../../constants';
import { useEngine } from '../../engine';
import { createMargOdeRenderer, type MargOdeRenderer } from '../../webgl/marginal/ode';
import type { MargPathActions, MargPathState } from '../index';

export function MargOdeView({ compact = true }: { compact?: boolean }): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();

  const webGlRef = useRef<WebGl | null>(null);
  const rendererRef = useRef<MargOdeRenderer | null>(null);

  // Local UI state
  const [showTrajectories, setShowTrajectories] = useState(true);
  const [showVectorField, setShowVectorField] = useState(false);
  const [showSamples, setShowSamples] = useState(true);

  const paramsRef = useRef({
    showTrajectories,
    showVectorField,
    showSamples
  });

  // Sync local UI state into ref and trigger render
  useEffect(() => {
    paramsRef.current.showTrajectories = showTrajectories;
    paramsRef.current.showVectorField = showVectorField;
    paramsRef.current.showSamples = showSamples;
    engine.renderOnce();
  }, [showTrajectories, showVectorField, showSamples, engine]);

  // Register render loop
  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      rendererRef.current ??= createMargOdeRenderer(webGl.gl);
      const renderer = rendererRef.current;
      const params = paramsRef.current;

      // Update renderer configuration
      renderer.setShowTrajectories(params.showTrajectories);
      renderer.setShowVectorField(params.showVectorField);
      renderer.setShowSamples(params.showSamples);

      // Render
      renderer.update(frame);
      clearWebGl(webGl, COLORS.background);
      renderer.render(webGl);
    });
  }, [engine]);

  const handleResampleTrajectories = (): void => {
    if (rendererRef.current) {
      rendererRef.current.resample();
      engine.renderOnce();
    }
  };

  const checkboxControls = (
    <>
      <ShowTrajectoriesCheckbox
        checked={showTrajectories}
        onChange={setShowTrajectories}
      />
      <ShowVectorFieldCheckbox
        checked={showVectorField}
        onChange={setShowVectorField}
      />
      <ShowSamplesCheckbox checked={showSamples} onChange={setShowSamples} />
    </>
  );

  const restControls = (
    <>
      <ResampleTrajectoriesButton onClick={handleResampleTrajectories} />
    </>
  );

  return (
    <ViewContainer>
      <WebGlCanvas webGlRef={webGlRef} xDomain={X_DOMAIN} yDomain={Y_DOMAIN} />

      <ViewControls>
        {compact ? (
          <div className="view-controls-group">
            {checkboxControls}
            {restControls}
          </div>
        ) : (
          <>
            <div className="view-controls-group">{checkboxControls}</div>
            <div className="view-controls-group">{restControls}</div>
          </>
        )}
      </ViewControls>
    </ViewContainer>
  );
}
