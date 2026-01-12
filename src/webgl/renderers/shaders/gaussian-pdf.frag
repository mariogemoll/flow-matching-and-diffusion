#version 300 es
precision highp float;
uniform vec2 u_mean;
uniform float u_variance;
uniform vec2 u_canvasSize;
uniform mat3 u_dataToClip;
uniform vec4 u_color;

out vec4 fragColor;

void main() {
  // Get clip space position from fragment coordinates
  vec2 clipPos = vec2(
    (gl_FragCoord.x / u_canvasSize.x) * 2.0 - 1.0,
    (gl_FragCoord.y / u_canvasSize.y) * 2.0 - 1.0
  );

  // Transform from clip space back to data space
  // dataToClip matrix usually looks like:
  // [sx, 0, 0]
  // [0, sy, 0]
  // [tx, ty, 1]
  // In column-major order (standard GL), this is:
  // m[0][0] = sx, m[1][1] = sy, m[2][0] = tx, m[2][1] = ty
  
  float sx = u_dataToClip[0][0];
  float sy = u_dataToClip[1][1];
  float tx = u_dataToClip[2][0];
  float ty = u_dataToClip[2][1];

  vec2 dataPos = vec2(
    (clipPos.x - tx) / sx,
    (clipPos.y - ty) / sy
  );

  // Compute Gaussian PDF
  vec2 diff = dataPos - u_mean;
  float exponent = -(diff.x * diff.x + diff.y * diff.y) / (2.0 * u_variance);
  float prob = exp(exponent) / (2.0 * 3.14159265359 * u_variance);

  // Normalize by max probability at center for visualization consistency
  float maxProb = 1.0 / (2.0 * 3.14159265359 * u_variance);
  float normalized = prob / maxProb;

  float alpha = clamp(normalized * 0.8, 0.0, 0.8);
  fragColor = vec4(u_color.rgb, u_color.a * alpha);
}
