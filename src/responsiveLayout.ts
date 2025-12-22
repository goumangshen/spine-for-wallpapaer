import { Configs } from './config.type';

type Mode = 'height' | 'width' | 'min' | 'max';

let canvasRef: HTMLCanvasElement | null = null;
let enabled = false;
let baseW: number | null = null;
let baseH: number | null = null;
let mode: Mode = 'height';
let invertLegacy = false;
let positionEnabled = true;
let scaleEnabled = true;
let invertPosition = false;
let invertScale = false;
let scaleDamp = 1;

function getCanvasRect() {
  const rect = canvasRef?.getBoundingClientRect();
  if (!rect) return null;
  return { w: rect.width, h: rect.height };
}

export function initResponsiveLayout(configs: Configs, canvas: HTMLCanvasElement) {
  canvasRef = canvas;
  enabled = !!configs.responsiveLayout?.enabled;
  mode = configs.responsiveLayout?.mode ?? 'height';
  invertLegacy = !!configs.responsiveLayout?.invert;
  positionEnabled = configs.responsiveLayout?.positionEnabled ?? true;
  scaleEnabled = configs.responsiveLayout?.scaleEnabled ?? true;
  invertPosition = configs.responsiveLayout?.invertPosition ?? invertLegacy;
  invertScale = configs.responsiveLayout?.invertScale ?? invertLegacy;
  const sd = configs.responsiveLayout?.scaleDamp;
  scaleDamp = typeof sd === 'number' ? Math.min(1, Math.max(0, sd)) : 1;

  if (!enabled) {
    baseW = null;
    baseH = null;
    invertLegacy = false;
    positionEnabled = true;
    scaleEnabled = true;
    invertPosition = false;
    invertScale = false;
    scaleDamp = 1;
    return;
  }

  // 如果用户提供了基准尺寸就用；否则用首次渲染时的 canvas 实际显示尺寸作为基准
  const bw = configs.responsiveLayout?.baseCanvasWidth;
  const bh = configs.responsiveLayout?.baseCanvasHeight;
  baseW = typeof bw === 'number' && bw > 0 ? bw : null;
  baseH = typeof bh === 'number' && bh > 0 ? bh : null;

  if (!baseW || !baseH) {
    const rect = getCanvasRect();
    if (rect) {
      baseW = baseW || rect.w || null;
      baseH = baseH || rect.h || null;
    }
  }
}

function computeBaseRatio(): number {
  if (!enabled) return 1;
  const rect = getCanvasRect();
  if (!rect || !rect.w || !rect.h) return 1;
  if (!baseW || !baseH) return 1;

  const rx = rect.w / baseW;
  const ry = rect.h / baseH;

  let r: number;
  switch (mode) {
    case 'width':
      r = rx;
      break;
    case 'height':
      r = ry;
      break;
    case 'max':
      r = Math.max(rx, ry);
      break;
    case 'min':
    default:
      r = Math.min(rx, ry);
      break;
  }
  if (!Number.isFinite(r) || r <= 0) return 1;
  return r;
}

export function getResponsiveLayoutParams(): {
  positionRatio: number;
  scaleTargetRatio: number;
} {
  const r = computeBaseRatio();
  const posRatio = !enabled || !positionEnabled ? 1 : invertPosition ? 1 / r : r;
  const rawScaleRatio = !enabled || !scaleEnabled ? 1 : invertScale ? 1 / r : r;
  // 把缩放变化“压小”：scaleDamp=0.5 时，偏离 1 的幅度减半
  const scaleRatio = 1 + (rawScaleRatio - 1) * scaleDamp;
  return {
    positionRatio: Number.isFinite(posRatio) && posRatio > 0 ? posRatio : 1,
    scaleTargetRatio: Number.isFinite(scaleRatio) && scaleRatio > 0 ? scaleRatio : 1,
  };
}


