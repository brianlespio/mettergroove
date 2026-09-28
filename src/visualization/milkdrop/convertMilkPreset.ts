import type { ButterchurnPreset } from 'butterchurn';

export class MilkPresetError extends Error {
  constructor(message = 'Preset incompatible') {
    super(message);
    this.name = 'MilkPresetError';
  }
}

const BUILTIN_SAMPLERS = new Set([
  'sampler_main',
  'sampler_fc_main',
  'sampler_pw_main',
  'sampler_fw_main',
  'sampler_pc_main',
  'sampler_noise_lq',
  'sampler_noise_mq',
  'sampler_noise_hq',
  'sampler_noisevol_lq',
  'sampler_noisevol_hq',
  'sampler_blur1',
  'sampler_blur2',
  'sampler_blur3',
]);

export function assertMilkSource(text: string): void {
  if (!text.includes('[preset00]')) {
    throw new MilkPresetError('Preset incompatible');
  }
}

export function customSamplerNames(shaderSource: string): string[] {
  const found = new Set<string>();
  const pattern = /\bsampler_([A-Za-z0-9_]+)\b/g;
  for (const match of shaderSource.matchAll(pattern)) {
    const name = `sampler_${match[1]}`;
    if (!BUILTIN_SAMPLERS.has(name)) found.add(name);
  }
  return [...found];
}

/**
 * The HLSL translator turns `a * b + c` into a boolean `&&` and drops the
 * operator. Parentheses around each multiply keep the real arithmetic, which
 * is what carries MilkDrop's color. `rad` and `ang` are locals of Butterchurn's
 * main, so the translated function has to receive them or the shader is black.
 */
export function repairMilkSource(text: string): string {
  return repairSection(repairSection(text, 'warp'), 'comp');
}

function repairSection(text: string, kind: 'warp' | 'comp'): string {
  const lines = text.split(/\r?\n/);
  const indexes: number[] = [];
  const parts: string[] = [];
  lines.forEach((line, index) => {
    const match = line.match(new RegExp(`^${kind}_\\d+=\`(.*)$`));
    if (!match) return;
    indexes.push(index);
    parts.push(match[1]);
  });
  if (indexes.length === 0) return text;
  const shader = parenthesizeMultiplies(expandBuiltinCalls(stripLineComments(parts.join('\n')))).replace(/\s+/g, ' ').trim();
  const kept = lines.filter((_, index) => !indexes.includes(index));
  kept.splice(indexes[0], 0, `${kind}_1=\`${shader}`);
  return kept.join('\n');
}

function stripLineComments(source: string): string {
  return source.split('\n').map((line) => {
    const comment = line.indexOf('//');
    return comment === -1 ? line : line.slice(0, comment);
  }).join('\n');
}

const HOST_SAMPLERS = new Set([
  ...BUILTIN_SAMPLERS,
  'sampler_noise_lq_lite',
  'sampler_pw_noise_lq',
  'sampler_pw_noise_mq',
  'sampler_pw_noise_hq',
]);

export function bindShaderBuiltins(shader: string): string {
  const hosted = shader.replace(/(?:uniform\s+)?sampler(2D|3D)\s+(sampler_[A-Za-z0-9_]+)\s*;/g, (_full, kind: string, name: string) => {
    if (HOST_SAMPLERS.has(name)) return '';
    return `uniform sampler${kind} ${name};`;
  });
  if (!hosted.includes('main_shader_sentinel')) return hosted;
  const hue = /\bhue_shader\b/.test(hosted);
  const params = hue ? 'vec2 uv, float rad, float ang, vec3 hue_shader' : 'vec2 uv, float rad, float ang';
  const args = hue ? 'uv, rad, ang, hue_shader' : 'uv, rad, ang';
  return hosted
    .replace(/vec4 main_shader_sentinel\(vec2 uv\)/g, `vec4 main_shader_sentinel(${params})`)
    .replace(/main_shader_sentinel\(uv\)/g, `main_shader_sentinel(${args})`);
}

export async function convertMilkPreset(text: string): Promise<ButterchurnPreset> {
  assertMilkSource(text);
  const module = await import('milkdrop-preset-converter');
  const convert = module.convertPreset;
  if (typeof convert !== 'function') {
    throw new MilkPresetError('El conversor MilkDrop no está disponible');
  }
  let converted: ButterchurnPreset;
  try {
    converted = await convert(repairMilkSource(text));
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'error de conversión';
    throw new MilkPresetError(`Preset incompatible: ${detail}`);
  }
  if (!converted || typeof converted !== 'object' || !converted.baseVals) {
    throw new MilkPresetError('Preset incompatible');
  }
  return {
    ...converted,
    shapes: Array.isArray(converted.shapes) ? converted.shapes : [],
    waves: Array.isArray(converted.waves) ? converted.waves : [],
    warp: bindShaderBuiltins(typeof converted.warp === 'string' ? converted.warp : ''),
    comp: bindShaderBuiltins(typeof converted.comp === 'string' ? converted.comp : ''),
  };
}

function expandBuiltinCalls(source: string): string {
  let output = '';
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      output += source.slice(index, stop);
      index = stop;
      continue;
    }
    const call = builtinCallAt(source, index);
    if (!call) {
      output += source[index];
      index += 1;
      continue;
    }
    const inner = expandBuiltinCalls(call.argument);
    output += builtinReplacement(call.name, inner);
    index = call.end;
  }
  return output;
}

function builtinCallAt(source: string, index: number): { name: string; argument: string; end: number } | null {
  const names = ['GetBlur1', 'GetBlur2', 'GetBlur3', 'GetPixel', 'GetMain'];
  if (index > 0 && /[A-Za-z0-9_]/.test(source[index - 1])) return null;
  for (const name of names) {
    if (!source.startsWith(name, index)) continue;
    let cursor = index + name.length;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (source[cursor] !== '(') continue;
    const close = matchingParen(source, cursor);
    if (close === -1) return null;
    return { name, argument: source.slice(cursor + 1, close), end: close + 1 };
  }
  return null;
}

function builtinReplacement(name: string, argument: string): string {
  if (name === 'GetBlur1') return `((tex2D(sampler_blur1, ${argument}).xyz * scale1) + bias1)`;
  if (name === 'GetBlur2') return `((tex2D(sampler_blur2, ${argument}).xyz * scale2) + bias2)`;
  if (name === 'GetBlur3') return `((tex2D(sampler_blur3, ${argument}).xyz * scale3) + bias3)`;
  return `(tex2D(sampler_main, ${argument}).xyz)`;
}

const CONTROL_FLOW = new Set(['return', 'if', 'while', 'for', 'do', 'switch', 'else', 'discard']);

function parenthesizeMultiplies(source: string): string {
  const factors = parenthesizeOperator(
    source,
    (token) => token === '*' || token === '/' || token === '%',
    false,
  );
  return parenthesizeOperator(
    factors,
    (token, tokens, index) => (token === '+' || token === '-') && isBinaryMinus(tokens, index),
    true,
  );
}

function isBinaryMinus(tokens: ShaderToken[], index: number): boolean {
  const previous = previousCode(tokens, index - 1);
  if (previous === -1) return false;
  const text = tokens[previous].text;
  return text === ')' || text === ']' || /^[A-Za-z0-9_.]/.test(text);
}

function parenthesizeOperator(
  source: string,
  match: (token: string, tokens: ShaderToken[], index: number) => boolean,
  spanTerm: boolean,
): string {
  const tokens = tokenizeShader(source);
  const code = tokens.map((token, index) => ({ token, index })).filter((item) => item.token.kind === 'code');
  for (let cursor = 0; cursor < code.length; cursor += 1) {
    if (!match(code[cursor].token.text, tokens, code[cursor].index)) continue;
    const left = walkLeft(tokens, code[cursor].index - 1, spanTerm);
    const right = walkRight(tokens, code[cursor].index + 1);
    if (left === -1 || right === -1) continue;
    const before = previousCode(tokens, left - 1);
    const after = nextCode(tokens, right + 1);
    if (before !== -1 && tokens[before].text === '(' && after !== -1 && tokens[after].text === ')') continue;
    tokens.splice(right + 1, 0, { kind: 'code', text: ')' });
    tokens.splice(left, 0, { kind: 'code', text: '(' });
    return parenthesizeOperator(tokens.map((token) => token.text).join(''), match, spanTerm);
  }
  return source;
}

type ShaderToken = { kind: 'code' | 'gap'; text: string };

function tokenizeShader(source: string): ShaderToken[] {
  const tokens: ShaderToken[] = [];
  let index = 0;
  while (index < source.length) {
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index);
      const stop = end === -1 ? source.length : end;
      tokens.push({ kind: 'gap', text: source.slice(index, stop) });
      index = stop;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      const stop = end === -1 ? source.length : end + 2;
      tokens.push({ kind: 'gap', text: source.slice(index, stop) });
      index = stop;
      continue;
    }
    if (/\s/.test(source[index])) {
      let end = index + 1;
      while (end < source.length && /\s/.test(source[end])) end += 1;
      tokens.push({ kind: 'gap', text: source.slice(index, end) });
      index = end;
      continue;
    }
    if (/[A-Za-z_]/.test(source[index])) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end += 1;
      tokens.push({ kind: 'code', text: source.slice(index, end) });
      index = end;
      continue;
    }
    if (/[0-9.]/.test(source[index])) {
      let end = index + 1;
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1;
      tokens.push({ kind: 'code', text: source.slice(index, end) });
      index = end;
      continue;
    }
    const pair = source.slice(index, index + 2);
    if (['*=', '+=', '-=', '/=', '==', '!=', '<=', '>=', '&&', '||', '++', '--'].includes(pair)) {
      tokens.push({ kind: 'code', text: pair });
      index += 2;
      continue;
    }
    tokens.push({ kind: 'code', text: source[index] });
    index += 1;
  }
  return tokens;
}

function includeCallee(tokens: ShaderToken[], open: number): number {
  const name = previousCode(tokens, open - 1);
  if (name === -1) return open;
  const text = tokens[name].text;
  if (!/^[A-Za-z_]/.test(text) || CONTROL_FLOW.has(text)) return open;
  return tokens[open].text === '(' || tokens[open].text === '[' ? name : open;
}

function walkLeft(tokens: ShaderToken[], end: number, spanTerm = false): number {
  let index = previousCode(tokens, end);
  if (index === -1) return -1;
  if (tokens[index].text === ')' || tokens[index].text === ']') {
    const open = matchingOpen(tokens, index);
    if (open === -1) return -1;
    index = includeCallee(tokens, open);
  }
  while (index > 0) {
    const dot = previousCode(tokens, index - 1);
    if (dot === -1 || tokens[dot].text !== '.') break;
    const owner = previousCode(tokens, dot - 1);
    if (owner === -1) break;
    index = owner;
    if (tokens[index].text === ')' || tokens[index].text === ']') {
      const open = matchingOpen(tokens, index);
      if (open === -1) return -1;
      index = includeCallee(tokens, open);
    }
  }
  if (!spanTerm) return index;
  while (index > 0) {
    const operator = previousCode(tokens, index - 1);
    if (operator === -1) break;
    const text = tokens[operator].text;
    if ((text === '-' || text === '+') && !isBinaryMinus(tokens, operator)) {
      index = operator;
      continue;
    }
    break;
  }
  return index;
}

function walkRight(tokens: ShaderToken[], start: number): number {
  let index = nextCode(tokens, start);
  if (index === -1) return -1;
  while (tokens[index].text === '+' || tokens[index].text === '-') {
    const next = nextCode(tokens, index + 1);
    if (next === -1) return -1;
    index = next;
  }
  if (tokens[index].text === '(' || tokens[index].text === '[') {
    const close = matchingClose(tokens, index);
    if (close === -1) return -1;
    index = close;
  } else if (/^[A-Za-z_]/.test(tokens[index].text) && !CONTROL_FLOW.has(tokens[index].text)) {
    const open = nextCode(tokens, index + 1);
    if (open !== -1 && (tokens[open].text === '(' || tokens[open].text === '[')) {
      const close = matchingClose(tokens, open);
      if (close === -1) return -1;
      index = close;
    }
  }
  while (index !== -1) {
    const suffix = nextCode(tokens, index + 1);
    if (suffix === -1) break;
    if (tokens[suffix].text === '.') {
      const member = nextCode(tokens, suffix + 1);
      if (member === -1) break;
      index = member;
      continue;
    }
    if (tokens[suffix].text === '(' || tokens[suffix].text === '[') {
      const close = matchingClose(tokens, suffix);
      if (close === -1) return index;
      index = close;
      continue;
    }
    break;
  }
  return index;
}

function previousCode(tokens: ShaderToken[], index: number): number {
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    if (tokens[cursor].kind === 'code') return cursor;
  }
  return -1;
}

function nextCode(tokens: ShaderToken[], index: number): number {
  for (let cursor = index; cursor < tokens.length; cursor += 1) {
    if (tokens[cursor].kind === 'code') return cursor;
  }
  return -1;
}

function matchingClose(tokens: ShaderToken[], open: number): number {
  const close = tokens[open].text === '(' ? ')' : ']';
  let depth = 0;
  for (let index = open; index < tokens.length; index += 1) {
    if (tokens[index].kind !== 'code') continue;
    if (tokens[index].text === tokens[open].text) depth += 1;
    else if (tokens[index].text === close) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchingOpen(tokens: ShaderToken[], close: number): number {
  const open = tokens[close].text === ')' ? '(' : '[';
  let depth = 0;
  for (let index = close; index >= 0; index -= 1) {
    if (tokens[index].kind !== 'code') continue;
    if (tokens[index].text === tokens[close].text) depth += 1;
    else if (tokens[index].text === open) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}
