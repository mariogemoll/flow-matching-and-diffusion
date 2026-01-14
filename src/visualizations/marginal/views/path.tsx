import React, { useEffect, useRef, useState } from 'react';

import { CANVAS_HEIGHT, CANVAS_WIDTH } from '../../../constants';
import { makeGmm } from '../../../math/gmm';
import { type AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import { writeGmm } from '../../../math/std-gaussian-to-gmm';
import { type GaussianComponent, type GaussianMixture } from '../../../types';
import { clearWebGl, type WebGl } from '../../../webgl';
import {
  createGaussianMixturePdfRenderer,
  type GaussianMixturePdfRenderer
} from '../../../webgl/renderers/gaussian-mixture-pdf';
import { Button } from '../../components/button';
import { GaussianMixtureEditor } from '../../components/gaussian-mixture-editor';
import { ViewContainer, ViewControls } from '../../components/layout';
import { WebGlCanvas } from '../../components/webgl-canvas';
import { COLORS, X_DOMAIN, Y_DOMAIN } from '../../constants';
import { useEngine } from '../../engine';
import { type MargPathActions, type MargPathState } from '../index';

export function MargPathView({ compact = true }: { compact?: boolean }): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();
  const webGlRef = useRef<WebGl | null>(null);
  const pdfRendererRef = useRef<GaussianMixturePdfRenderer | null>(null);
  const mixtureRef = useRef<GaussianMixture>(makeGmm(0));
  const baseMixtureRef = useRef<GaussianMixture>({
    components: engine.frame.state.components,
    version: 0
  });

  const [editMode, setEditMode] = useState(engine.frame.state.editMode);
  // Local state for components to sync with engine updates for the editor
  const [components, setComponents] = useState<GaussianComponent[]>(engine.frame.state.components);

  const lastUpdateRef = useRef<{
    t: number;
    schedule: AlphaBetaScheduleName;
    components: MargPathState['components'] | null;
    editMode: boolean;
    timestamp: number;
  }>({
    t: NaN,
    schedule: 'linear',
    components: null,
    editMode: false,
    timestamp: 0
  });

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      if (pdfRendererRef.current?.gl !== webGl.gl) {
        pdfRendererRef.current = createGaussianMixturePdfRenderer(webGl.gl);
      }

      const t = frame.clock.t;
      const schedule: AlphaBetaScheduleName = frame.state.schedule;
      const currentComponents = frame.state.components;
      const lastUpdate = lastUpdateRef.current;
      const now = performance.now();

      // Sync Edit Mode
      if (frame.state.editMode !== lastUpdate.editMode) {
        lastUpdate.editMode = frame.state.editMode;
        setEditMode(frame.state.editMode);
      }

      // Auto-exit edit mode if user starts playing or scrubbing
      if (frame.state.editMode) {
        if (frame.clock.playing || frame.clock.scrubbing || t !== 1) {
          frame.state.editMode = false;
          frame.state.wasPlayingBeforeEdit = false;
          // Force update next frame to reflect exit
          lastUpdate.editMode = false;
          setEditMode(false);
        }
      }

      // Sync Components to React state for Editor
      // Throttle to avoid excessive re-renders during high-freq updates
      if (currentComponents !== lastUpdate.components) {
        const syncThreshold = 50; // ms
        if (!frame.clock.playing || (now - lastUpdate.timestamp > syncThreshold)) {
          setComponents(currentComponents);
          lastUpdate.timestamp = now;
        }
      }

      // Render Logic for PDF
      if (
        lastUpdate.t !== t ||
        lastUpdate.schedule !== schedule ||
        lastUpdate.components !== currentComponents
      ) {
        baseMixtureRef.current.components = currentComponents;
        if (mixtureRef.current.components.length !== currentComponents.length) {
          mixtureRef.current = makeGmm(currentComponents.length);
        }
        writeGmm(
          baseMixtureRef.current,
          schedule,
          t,
          mixtureRef.current
        );
        lastUpdate.t = t;
        lastUpdate.schedule = schedule;
        lastUpdate.components = currentComponents;
      }

      clearWebGl(webGl, COLORS.background);
      pdfRendererRef.current.render(
        webGl.dataToClipMatrix,
        mixtureRef.current,
        COLORS.pdf
      );
    });
  }, [engine]);

  const handleEditToggle = (): void => {
    if (editMode) {
      engine.actions.exitEditMode();
    } else {
      engine.actions.enterEditMode();
    }
  };



  const controls = (
    <>

      <Button onClick={handleEditToggle}>
        {editMode ? 'OK' : 'Edit'}
      </Button>
    </>
  );

  return (
    <ViewContainer>
      <WebGlCanvas
        webGlRef={webGlRef}
        xDomain={X_DOMAIN}
        yDomain={Y_DOMAIN}
      />
      <GaussianMixtureEditor
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        components={components}
        onChange={engine.actions.setComponents}
        hidden={!editMode}
      />
      <ViewControls>
        {compact ? (
          <div className="view-controls-group">
            {controls}
          </div>
        ) : (
          <div className="view-controls-group">
            {controls}
          </div>
        )}
      </ViewControls>
    </ViewContainer>
  );
}
