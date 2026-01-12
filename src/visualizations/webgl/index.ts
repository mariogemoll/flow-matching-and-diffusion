import { clearWebGl,type WebGl } from '../../webgl';
import { COLORS } from '../constants';


/**
 * Clears the WebGL canvas with the centralized background color.
 */
export function clear(webGl: WebGl): void {
  clearWebGl(webGl, COLORS.background);
}
