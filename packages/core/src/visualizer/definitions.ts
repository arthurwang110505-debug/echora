// Professional lyrics visualizer definitions for Echora Stage
// Pure ambient motion canvas engines with distinct motion characters

import type { VisualizerDefinition, VisualizerContext, VisualizerParams } from './types';

// Helper for color alpha conversion
function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(98, 245, 196, ${alpha})`;
  const cleanHex = hex.replace('#', '');
  const fullHex = cleanHex.length === 3
    ? cleanHex.split('').map(c => c + c).join('')
    : cleanHex;
  const r = parseInt(fullHex.substring(0, 2), 16) || 0;
  const g = parseInt(fullHex.substring(2, 4), 16) || 0;
  const b = parseInt(fullHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const baseParams: VisualizerParams = {
  fontSize: 32,
  fontFamily: 'Outfit, sans-serif',
  opacity: 1,
  textAlign: 'center',
  letterSpacing: 2,
  lineHeight: 2,
  bgColor: '#07090e',
  bgOpacity: 0.8,
  showGeometricBg: true,
  geometricOpacity: 0.25,
  glowIntensity: 1.5,
  shadowEnabled: true,
  shadowBlur: 20,
  shadowColor: '#62f5c4',
  animSpeed: 1,
  animDirection: 'normal',
};

// 1. LIUGUANG (流光): Flowing horizontal light ribbons & soft waves
export const liuguangDefinition: VisualizerDefinition = {
  id: 'liuguang',
  name: 'Liuguang',
  nameZh: '流光',
  description: 'Flowing light ribbons with gentle breathing waves',
  descriptionZh: '流動光幕，輕柔呼吸波紋',
  defaultParams: { ...baseParams, animSpeed: 1.0 },
  paramsSchema: [],
  render: renderLiuguang,
};

function renderLiuguang(ctx: VisualizerContext, params: VisualizerParams) {
  const { canvas, width, height, theme, progress } = ctx;
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  ctx2d.clearRect(0, 0, width, height);
  const time = (performance.now() / 1000) * params.animSpeed;
  const isMoving = progress > 0.2;

  // Wave ribbons
  const waveCount = 3;
  for (let w = 0; w < waveCount; w++) {
    ctx2d.save();
    ctx2d.beginPath();
    const alpha = (0.12 - w * 0.03) * (isMoving ? 1 : 0.4);
    const color = w % 2 === 0 ? theme.accentColor : theme.primaryColor;
    ctx2d.fillStyle = hexToRgba(color, alpha);

    const baseHeight = height * (0.4 + w * 0.15);
    const freq = 0.003 + w * 0.001;
    const speed = isMoving ? time * 0.8 + w : time * 0.1;

    ctx2d.moveTo(0, height);
    ctx2d.lineTo(0, baseHeight);

    for (let x = 0; x <= width; x += 20) {
      const y = baseHeight + Math.sin(x * freq + speed) * 35 * Math.cos(speed * 0.5);
      ctx2d.lineTo(x, y);
    }

    ctx2d.lineTo(width, height);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.restore();
  }
}

// 2. XINXIANG (心象): Concentric breathing geometry & harmonic rings
export const xinxiangDefinition: VisualizerDefinition = {
  id: 'xinxiang',
  name: 'Xinxiang',
  nameZh: '心象',
  description: 'Concentric geometric breathing rings with harmonic resonance',
  descriptionZh: '幾何同心光環，隨音樂韻律呼吸',
  defaultParams: { ...baseParams, animSpeed: 0.8 },
  paramsSchema: [],
  render: renderXinxiang,
};

function renderXinxiang(ctx: VisualizerContext, params: VisualizerParams) {
  const { canvas, width, height, theme, progress } = ctx;
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  ctx2d.clearRect(0, 0, width, height);
  const time = (performance.now() / 1000) * params.animSpeed;
  const isMoving = progress > 0.2;
  const centerX = width / 2;
  const centerY = height / 2;

  const ringCount = 4;
  for (let i = 0; i < ringCount; i++) {
    const pulse = Math.sin(time * 1.2 + i * 0.6) * (isMoving ? 18 : 4);
    const radius = 90 + i * 75 + pulse;
    const rotation = (isMoving ? time * 0.15 : time * 0.02) * (i % 2 === 0 ? 1 : -1);

    ctx2d.save();
    ctx2d.translate(centerX, centerY);
    ctx2d.rotate(rotation);
    ctx2d.beginPath();
    ctx2d.arc(0, 0, Math.max(10, radius), 0, Math.PI * 2);
    ctx2d.strokeStyle = hexToRgba(i % 2 === 0 ? theme.accentColor : theme.primaryColor, 0.18 - i * 0.03);
    ctx2d.lineWidth = 1.5;
    ctx2d.stroke();

    // Geometric accent nodes
    const nodeCount = 3 + i * 2;
    for (let n = 0; n < nodeCount; n++) {
      const angle = (n / nodeCount) * Math.PI * 2;
      const nx = Math.cos(angle) * radius;
      const ny = Math.sin(angle) * radius;
      ctx2d.beginPath();
      ctx2d.arc(nx, ny, 2.5, 0, Math.PI * 2);
      ctx2d.fillStyle = hexToRgba(theme.accentColor, 0.35);
      ctx2d.fill();
    }

    ctx2d.restore();
  }
}

// 3. FUGUANG (浮光): Floating aurora orbs with deep drifting bokeh
export const fuguangDefinition: VisualizerDefinition = {
  id: 'fuguang',
  name: 'Fuguang',
  nameZh: '浮光',
  description: 'Floating aurora bokeh orbs gently drifting across the stage',
  descriptionZh: '極光光斑，如夢似幻浮動漂移',
  defaultParams: { ...baseParams, animSpeed: 0.6 },
  paramsSchema: [],
  render: renderFuguang,
};

function renderFuguang(ctx: VisualizerContext, params: VisualizerParams) {
  const { canvas, width, height, theme, progress } = ctx;
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  ctx2d.clearRect(0, 0, width, height);
  const time = (performance.now() / 1000) * params.animSpeed;
  const isMoving = progress > 0.2;

  const orbs = [
    { x: 0.25, y: 0.3, r: 160, color: theme.accentColor, speed: 0.7 },
    { x: 0.75, y: 0.65, r: 200, color: theme.primaryColor, speed: 0.5 },
    { x: 0.5, y: 0.8, r: 140, color: theme.secondaryColor, speed: 0.9 },
  ];

  for (const orb of orbs) {
    const offsetX = Math.cos(time * orb.speed) * (isMoving ? 45 : 10);
    const offsetY = Math.sin(time * orb.speed * 0.8) * (isMoving ? 35 : 8);
    const ox = width * orb.x + offsetX;
    const oy = height * orb.y + offsetY;

    const grad = ctx2d.createRadialGradient(ox, oy, 0, ox, oy, orb.r);
    grad.addColorStop(0, hexToRgba(orb.color, isMoving ? 0.22 : 0.1));
    grad.addColorStop(1, hexToRgba(orb.color, 0));

    ctx2d.fillStyle = grad;
    ctx2d.beginPath();
    ctx2d.arc(ox, oy, orb.r, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

// 4. YINLANG (音浪): Dynamic audio frequency ripple curves
export const yinlangDefinition: VisualizerDefinition = {
  id: 'yinlang',
  name: 'Yinlang',
  nameZh: '音浪',
  description: 'Subtle soundwave frequencies expanding outward',
  descriptionZh: '音樂頻率波紋，層疊向外擴散',
  defaultParams: { ...baseParams, animSpeed: 1.2 },
  paramsSchema: [],
  render: renderYinlang,
};

function renderYinlang(ctx: VisualizerContext, params: VisualizerParams) {
  const { canvas, width, height, theme, progress } = ctx;
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  ctx2d.clearRect(0, 0, width, height);
  const time = (performance.now() / 1000) * params.animSpeed;
  const isMoving = progress > 0.2;
  const centerY = height * 0.52;

  const barCount = 32;
  const step = width / barCount;

  ctx2d.save();
  for (let i = 0; i < barCount; i++) {
    const x = i * step + step / 2;
    const distFromCenter = Math.abs(i - barCount / 2) / (barCount / 2);
    const wave = Math.sin(time * 3 + i * 0.4) * (1 - distFromCenter * 0.6);
    const barHeight = Math.max(4, (isMoving ? 45 : 8) * (wave * 0.5 + 0.5));

    ctx2d.fillStyle = hexToRgba(theme.accentColor, 0.12 * (1 - distFromCenter * 0.5));
    ctx2d.fillRect(x - 2, centerY - barHeight / 2, 4, barHeight);
  }
  ctx2d.restore();
}

// 5. XINGCHEN (星辰): Harmonic stardust drifting particles
export const xingchenDefinition: VisualizerDefinition = {
  id: 'xingchen',
  name: 'Xingchen',
  nameZh: '星辰',
  description: 'Breathing stardust field floating gently in the cosmic stage',
  descriptionZh: '浩瀚星塵微粒，隨樂聲呼吸閃爍',
  defaultParams: { ...baseParams, animSpeed: 0.7 },
  paramsSchema: [],
  render: renderXingchen,
};

function renderXingchen(ctx: VisualizerContext, params: VisualizerParams) {
  const { canvas, width, height, theme, progress } = ctx;
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  ctx2d.clearRect(0, 0, width, height);
  const time = (performance.now() / 1000) * params.animSpeed;
  const isMoving = progress > 0.2;

  const starCount = 36;
  ctx2d.save();
  for (let i = 0; i < starCount; i++) {
    const seedX = ((i * 137.5) % 100) / 100;
    const seedY = ((i * 269.3) % 100) / 100;
    const speed = 0.2 + (i % 5) * 0.1;
    const driftY = (time * (isMoving ? speed * 15 : speed * 2)) % height;
    const x = seedX * width;
    const y = (seedY * height + driftY) % height;

    const twinkle = (Math.sin(time * 2 + i) + 1) / 2;
    const radius = 1 + (i % 3) * 0.8;
    const alpha = (0.15 + twinkle * 0.35) * (isMoving ? 1 : 0.4);

    ctx2d.beginPath();
    ctx2d.arc(x, y, radius, 0, Math.PI * 2);
    ctx2d.fillStyle = hexToRgba(i % 3 === 0 ? theme.accentColor : '#ffffff', alpha);
    ctx2d.fill();
  }
  ctx2d.restore();
}

// 6. SHENGTAI (生態): Fluid organic metaball pulses
export const shengtaiDefinition: VisualizerDefinition = {
  id: 'shengtai',
  name: 'Shengtai',
  nameZh: '生態',
  description: 'Organic cellular pulses that gently breathe with playback',
  descriptionZh: '有機流體脈動，展現生命般的溫潤起伏',
  defaultParams: { ...baseParams, animSpeed: 0.9 },
  paramsSchema: [],
  render: renderShengtai,
};

function renderShengtai(ctx: VisualizerContext, params: VisualizerParams) {
  const { canvas, width, height, theme, progress } = ctx;
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  ctx2d.clearRect(0, 0, width, height);
  const time = (performance.now() / 1000) * params.animSpeed;
  const isMoving = progress > 0.2;

  const centerX = width * 0.5;
  const centerY = height * 0.48;

  ctx2d.save();
  for (let p = 0; p < 3; p++) {
    const pulse = Math.sin(time * (1 + p * 0.3)) * (isMoving ? 25 : 6);
    const r = 120 + p * 50 + pulse;
    ctx2d.beginPath();
    ctx2d.arc(centerX, centerY, Math.max(10, r), 0, Math.PI * 2);
    ctx2d.fillStyle = hexToRgba(theme.accentColor, 0.06 - p * 0.015);
    ctx2d.fill();
  }
  ctx2d.restore();
}

// 7. MOLI (魔力): Prism refraction spectrum shifts
export const moliDefinition: VisualizerDefinition = {
  id: 'moli',
  name: 'Moli',
  nameZh: '魔力',
  description: 'Prism refraction shifts casting ambient spectral rays',
  descriptionZh: '稜鏡光譜折射，幻化奇幻色彩光芒',
  defaultParams: { ...baseParams, animSpeed: 0.75 },
  paramsSchema: [],
  render: renderMoli,
};

function renderMoli(ctx: VisualizerContext, params: VisualizerParams) {
  const { canvas, width, height, theme, progress } = ctx;
  if (!canvas) return;
  const ctx2d = canvas.getContext('2d');
  if (!ctx2d) return;

  ctx2d.clearRect(0, 0, width, height);
  const time = (performance.now() / 1000) * params.animSpeed;
  const isMoving = progress > 0.2;

  ctx2d.save();
  const rayCount = 5;
  for (let i = 0; i < rayCount; i++) {
    const angle = (time * (isMoving ? 0.2 : 0.04) + (i / rayCount) * Math.PI * 2);
    const grad = ctx2d.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, hexToRgba(theme.accentColor, 0.08));
    grad.addColorStop(0.5, hexToRgba(theme.primaryColor, 0.04));
    grad.addColorStop(1, 'transparent');

    ctx2d.fillStyle = grad;
    ctx2d.beginPath();
    ctx2d.moveTo(width / 2, height / 2);
    ctx2d.arc(width / 2, height / 2, Math.max(width, height) * 0.7, angle, angle + 0.35);
    ctx2d.closePath();
    ctx2d.fill();
  }
  ctx2d.restore();
}

// ============ VISUALIZER REGISTRY ============

export const visualizerRegistry: VisualizerDefinition[] = [
  liuguangDefinition,
  xinxiangDefinition,
  fuguangDefinition,
  yinlangDefinition,
  xingchenDefinition,
  shengtaiDefinition,
  moliDefinition,
];

export function getVisualizer(id: string): VisualizerDefinition | undefined {
  return visualizerRegistry.find(v => v.id === id);
}

export function getAllVisualizers(): VisualizerDefinition[] {
  return visualizerRegistry;
}
