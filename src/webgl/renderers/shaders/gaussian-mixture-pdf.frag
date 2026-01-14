#version 300 es
precision highp float;

const int MAX_NUM_COMPONENTS = 20;

uniform int u_numComponents;
uniform vec2 u_means[MAX_NUM_COMPONENTS];
uniform float u_weights[MAX_NUM_COMPONENTS];
uniform mat2 u_covariances[MAX_NUM_COMPONENTS];
uniform vec2 u_canvasSize;
uniform mat3 u_dataToClip;
uniform vec4 u_color;

out vec4 fragColor;

float gaussianValue(vec2 pos, vec2 mean, mat2 cov) {
  vec2 diff = pos - mean;
  float det = cov[0][0] * cov[1][1] - cov[0][1] * cov[1][0];
  if (abs(det) < 1e-10) {
    return 0.0;
  }

  mat2 invCov = mat2(
    cov[1][1] / det, -cov[0][1] / det,
    -cov[1][0] / det, cov[0][0] / det
  );

  vec2 temp = invCov * diff;
  float quadForm = dot(diff, temp);
  float exponent = -0.5 * quadForm;
  float normalization = 1.0 / (2.0 * 3.14159265359 * sqrt(abs(det)));
  return normalization * exp(exponent);
}

void main() {
  vec2 clipPos = vec2(
    (gl_FragCoord.x / u_canvasSize.x) * 2.0 - 1.0,
    (gl_FragCoord.y / u_canvasSize.y) * 2.0 - 1.0
  );

  float sx = u_dataToClip[0][0];
  float sy = u_dataToClip[1][1];
  float tx = u_dataToClip[2][0];
  float ty = u_dataToClip[2][1];

  vec2 dataPos = vec2(
    (clipPos.x - tx) / sx,
    (clipPos.y - ty) / sy
  );

  float value = 0.0;
  float maxValue = 0.0;
  for (int i = 0; i < MAX_NUM_COMPONENTS; i++) {
    if (i >= u_numComponents) break;

    mat2 cov = u_covariances[i];
    vec2 mean = u_means[i];
    float valueAtMean = u_weights[i] * gaussianValue(mean, mean, cov);
    maxValue = max(maxValue, valueAtMean);
  }

  for (int i = 0; i < MAX_NUM_COMPONENTS; i++) {
    if (i >= u_numComponents) break;

    mat2 cov = u_covariances[i];
    vec2 mean = u_means[i];
    value += u_weights[i] * gaussianValue(dataPos, mean, cov);
  }

  float normalized = maxValue > 0.0 ? value / maxValue : 0.0;
  float alpha = clamp(normalized * 0.8, 0.0, 0.8);

  fragColor = vec4(u_color.rgb, u_color.a * alpha);
}
