export const FULLSCREEN_VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

const PREAMBLE = `#version 300 es
precision highp float;
out vec4 fragColor;
in vec2 v_uv;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_amplitude;
uniform float u_beat;
uniform float u_seed;
uniform float u_symmetry;
uniform float u_speed;
uniform float u_noise;
uniform float u_scale;
uniform float u_rotation;
uniform float u_feedback;
uniform float u_brightness;
uniform float u_displacement;
uniform float u_twist;
uniform float u_formula;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;
uniform sampler2D u_wave;
uniform sampler2D u_prev;

vec2 aspect(vec2 uv) {
  float aspectRatio = u_resolution.x / max(u_resolution.y, 1.0);
  return (uv - 0.5) * vec2(aspectRatio, 1.0);
}

vec2 rotate(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
}

vec2 fold(vec2 p, float sides) {
  float n = max(2.0, sides);
  float ang = atan(p.y, p.x);
  float rad = length(p);
  float slice = 6.28318530718 / n;
  ang = mod(ang, slice);
  ang = abs(ang - slice * 0.5);
  return vec2(cos(ang), sin(ang)) * rad;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed) * 43758.5453);
}

float waveAt(float x) {
  return texture(u_wave, vec2(fract(x), 0.5)).r * 2.0 - 1.0;
}
`;

export const BLIT_FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;
in vec2 v_uv;
uniform sampler2D u_prev;
void main() {
  fragColor = texture(u_prev, v_uv);
}
`;

export const VECTOR_FIELD_FRAG = `${PREAMBLE}
vec2 field(vec2 p) {
  float n = u_noise * (0.75 + mod(u_formula, 3.0) * 0.55);
  float t = u_time * u_speed;
  float variant = mod(floor(u_formula + 0.5), 3.0);
  if (variant < 0.5) {
    float s = sin(p.y * n + t) + cos(p.x * n * 0.7 - t * 0.6);
    float c = cos(p.x * n + s) - sin(p.y * n * 1.3 + t);
    return vec2(c, s);
  }
  if (variant < 1.5) {
    float radius = length(p) + 0.15;
    float angle = atan(p.y, p.x);
    return vec2(-p.y, p.x) / radius * sin(angle * n + t) + vec2(cos(radius * n - t), sin(radius * n + t));
  }
  float warp = sin(p.x * n + t) * cos(p.y * (n + 1.3) - t);
  return vec2(cos(warp + p.y * 2.0), sin(warp - p.x * 2.0));
}

void main() {
  vec2 p = fold(rotate(aspect(v_uv) / max(u_scale, 0.2), u_rotation), u_symmetry);
  vec2 q = p;
  vec3 color = vec3(0.0);
  for (int i = 0; i < 18; i++) {
    vec2 f = field(q);
    q += f * 0.045;
    float d = length(field(q));
    float band = float(i) / 18.0;
    color += mix(u_colorA, u_colorB, band) * exp(-d * 1.6) * 0.085;
  }
  vec2 prevUv = fract(v_uv + field(p) * 0.004 * u_bass);
  vec3 history = texture(u_prev, prevUv).rgb * u_feedback;
  float spark = exp(-length(p) * (2.2 - u_treble)) * u_amplitude;
  color = color * (0.55 + u_brightness) + history * 0.65 + u_colorC * spark;
  color += u_beat * u_colorC * 0.25;
  fragColor = vec4(color, 1.0);
}
`;

export const INTERFERENCE_FRAG = `${PREAMBLE}
void main() {
  vec2 p = fold(rotate(aspect(v_uv), u_rotation), u_symmetry) * u_scale;
  float t = u_time * u_speed;
  float acc = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec2 center = vec2(cos(fi + t + u_seed), sin(fi * 1.7 - t * 0.8));
    center *= 0.25 + u_bass * 0.2;
    float phase = length(p - center) * (4.0 + u_formula * 1.7 + u_noise * 6.0) - t * (1.5 + fi * 0.2);
    acc += sin(phase + waveAt(fi * 0.13 + p.x) * u_displacement * 3.0);
    if (mod(u_formula, 2.0) > 0.5) acc += 0.65 * cos(phase * (0.35 + fi * 0.05));
  }
  acc /= 6.0;
  float rings = 0.5 + 0.5 * acc;
  vec3 color = mix(u_colorA, u_colorB, rings);
  color = mix(color, u_colorC, smoothstep(0.7, 1.0, rings) * u_treble);
  vec3 history = texture(u_prev, fract(v_uv * (0.98 + u_mid * 0.02))).rgb * u_feedback;
  color = color * (0.45 + u_brightness) + history * 0.55;
  color += u_beat * 0.2;
  fragColor = vec4(color, 1.0);
}
`;

export const SPIRAL_FRAG = `${PREAMBLE}
void main() {
  vec2 p = rotate(aspect(v_uv), u_rotation + u_bass * 0.4);
  float rad = length(p);
  float ang = atan(p.y, p.x);
  float arms = max(2.0, u_symmetry + mod(u_formula, 5.0));
  float spiral = ang * arms + rad * (6.0 + u_noise * 8.0) - u_time * u_speed * 2.0;
  if (mod(u_formula, 3.0) > 1.5) spiral = rad * ang * (3.0 + u_formula) + sin(rad * u_noise * 6.0 - u_time);
  spiral += waveAt(fract(rad)) * u_displacement * 4.0;
  float blade = pow(abs(sin(spiral)), 0.45 + u_mid);
  float core = exp(-rad * (1.4 / max(u_scale, 0.25)));
  vec3 color = mix(u_colorA, u_colorB, blade);
  color += u_colorC * core * (0.4 + u_treble);
  vec2 swirl = vec2(cos(ang + 0.4), sin(ang + 0.4)) * 0.01 * u_bass;
  vec3 history = texture(u_prev, fract(v_uv + swirl)).rgb * u_feedback;
  color = color * (0.5 + u_brightness) * (0.35 + blade) + history * 0.6;
  color += u_beat * core;
  fragColor = vec4(color, 1.0);
}
`;

export const FRACTAL_FRAG = `${PREAMBLE}
void main() {
  vec2 p = rotate(aspect(v_uv), u_rotation) / max(u_scale, 0.35);
  vec2 c = vec2(
    -0.82 + mod(u_formula, 5.0) * 0.2 + u_bass * 0.12,
    -0.22 + mod(u_formula * 1.7, 4.0) * 0.16 + u_mid * 0.08
  );
  c += vec2(cos(u_time * 0.15 * u_speed), sin(u_time * 0.11 * u_speed)) * 0.04 * u_noise;
  vec2 z = p;
  float m = 0.0;
  for (int i = 0; i < 28; i++) {
    z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
    if (dot(z, z) > 8.0) break;
    m += 1.0;
  }
  float shade = m / 28.0;
  shade = pow(shade, 0.85);
  vec3 color = mix(u_colorA, u_colorB, shade);
  color = mix(color, u_colorC, smoothstep(0.65, 1.0, shade));
  vec3 history = texture(u_prev, v_uv).rgb * (u_feedback * 0.92);
  color = color * (0.55 + u_brightness) + history * 0.35;
  color += u_beat * shade * 0.35;
  fragColor = vec4(color, 1.0);
}
`;

export const WAVEFORM_FRAG = `${PREAMBLE}
void main() {
  vec2 p = rotate(aspect(v_uv), u_rotation);
  float rad = length(p);
  float ang = atan(p.y, p.x);
  float sampleX = fract(ang / 6.28318530718 + 0.5);
  float waveSample = waveAt(sampleX);
  float lobes = 1.0 + mod(floor(u_formula + 0.5), 4.0);
  float radius = (0.18 + u_bass * 0.16) * u_scale + waveSample * 0.16 * u_displacement;
  float ring = exp(-abs(rad - radius) * (28.0 - u_treble * 10.0));
  if (lobes > 1.5) ring = exp(-abs(rad - radius * (0.65 + 0.35 * abs(sin(ang * lobes)))) * 22.0);
  float harmonic = exp(-abs(rad - radius * (1.6 + u_mid * 0.4)) * 16.0);
  vec3 color = u_colorA * ring + u_colorB * harmonic;
  float grid = abs(sin(ang * u_symmetry)) * exp(-rad * 1.5);
  color += u_colorC * grid * (0.15 + u_amplitude);
  vec3 history = texture(u_prev, fract(v_uv * 0.995 + 0.0025)).rgb * u_feedback;
  color = color + history * 0.72;
  color *= 0.45 + u_brightness;
  color += u_beat * ring;
  fragColor = vec4(color, 1.0);
}
`;

export const KALEIDOSCOPE_FRAG = `${PREAMBLE}
void main() {
  vec2 p = fold(rotate(aspect(v_uv), u_rotation), u_symmetry + mod(u_formula, 6.0));
  p = rotate(p, p.x * u_twist);
  float t = u_time * u_speed;
  float field = sin(p.x * u_noise * (3.0 + u_formula) + t) * cos(p.y * u_noise * (2.0 + mod(u_formula, 3.0)) - t * 0.7);
  field += sin(length(p) * 10.0 * u_scale - t * 2.0 + waveAt(p.x) * u_displacement);
  vec3 ink = mix(u_colorA, u_colorB, 0.5 + 0.5 * sin(field));
  ink = mix(ink, u_colorC, 0.5 + 0.5 * cos(field * 1.7 + u_treble));
  vec2 zoom = (v_uv - 0.5) * (0.96 + u_bass * 0.03) + 0.5;
  vec3 history = texture(u_prev, fract(rotate(zoom - 0.5, 0.15 + u_mid * 0.2) + 0.5)).rgb;
  vec3 color = ink * (0.28 + u_brightness * 0.4) + history * u_feedback;
  color += u_beat * 0.18;
  fragColor = vec4(color, 1.0);
}
`;
