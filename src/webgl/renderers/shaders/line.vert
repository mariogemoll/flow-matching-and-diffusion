attribute float a_x;
attribute float a_y;
uniform mat3 u_matrix;
void main() {
  vec2 transformed = (u_matrix * vec3(a_x, a_y, 1.0)).xy;
  gl_Position = vec4(transformed, 0.0, 1.0);
}
