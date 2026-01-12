attribute float a_x;
attribute float a_y;
uniform float u_pointSize;
uniform mat3 u_matrix;
void main() {
  vec3 pos = u_matrix * vec3(a_x, a_y, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  gl_PointSize = u_pointSize;
}
