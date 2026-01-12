precision mediump float;
uniform vec4 u_color;
void main() {
  vec2 coord = gl_PointCoord - vec2(0.5);
  if (length(coord) > 0.5) discard;
  gl_FragColor = u_color;
}
