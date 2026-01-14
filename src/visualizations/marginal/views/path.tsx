import React, { useEffect, useRef } from 'react';

import { makeGmm } from '../../../math/gmm';
import { type AlphaBetaScheduleName } from '../../../math/schedules/alpha-beta';
import { writeGmm } from '../../../math/std-gaussian-to-gmm';
import { type GaussianMixture } from '../../../types';
import { clearWebGl, type WebGl } from '../../../webgl';
import {
  createGaussianMixturePdfRenderer,
  type GaussianMixturePdfRenderer
} from '../../../webgl/renderers/gaussian-mixture-pdf';
import { ViewContainer } from '../../components/layout';
import { WebGlCanvas } from '../../components/webgl-canvas';
import { COLORS } from '../../constants';
import { useEngine } from '../../engine';
import { type MargPathActions, type MargPathState } from '../index';

export function MargPathView(): React.ReactElement {
  const engine = useEngine<MargPathState, MargPathActions>();
  const webGlRef = useRef<WebGl | null>(null);
  const pdfRendererRef = useRef<GaussianMixturePdfRenderer | null>(null);
  const mixtureRef = useRef<GaussianMixture>(makeGmm(0));
  const baseMixtureRef = useRef<GaussianMixture>({
    components: engine.frame.state.components,
    version: 0
  });
  const lastUpdateRef = useRef<{
    t: number;
    schedule: AlphaBetaScheduleName;
    components: MargPathState['components'] | null;
  }>({ t: NaN, schedule: 'linear', components: null });

  useEffect(() => {
    return engine.register((frame) => {
      const webGl = webGlRef.current;
      if (!webGl) { return; }

      if (pdfRendererRef.current?.gl !== webGl.gl) {
        pdfRendererRef.current = createGaussianMixturePdfRenderer(webGl.gl);
      }

      const t = frame.clock.t;
      const schedule: AlphaBetaScheduleName = frame.state.schedule;
      const components = frame.state.components;
      const lastUpdate = lastUpdateRef.current;

      if (
        lastUpdate.t !== t ||
        lastUpdate.schedule !== schedule ||
        lastUpdate.components !== components
      ) {
        baseMixtureRef.current.components = components;
        if (mixtureRef.current.components.length !== components.length) {
          mixtureRef.current = makeGmm(components.length);
        }
        writeGmm(
          baseMixtureRef.current,
          schedule,
          t,
          mixtureRef.current
        );
        lastUpdateRef.current = { t, schedule, components };
      }

      clearWebGl(webGl, COLORS.background);
      pdfRendererRef.current.render(
        webGl.dataToClipMatrix,
        mixtureRef.current,
        COLORS.pdf
      );
    });
  }, [engine]);

  return (
    <ViewContainer>
      <WebGlCanvas webGlRef={webGlRef} />
    </ViewContainer>
  );
}
