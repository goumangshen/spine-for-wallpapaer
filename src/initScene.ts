/**
 * @license
 * Spine Wallpaper Engine. This is a Spine animation player for wallpaper engine.
 * Copyright (C) 2023 Spicy Wolf
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import THREE from 'three';
import { Configs } from './config.type';
import { ASSET_PATH } from './constants';
import { initResponsiveLayout } from './responsiveLayout';

export let scene: THREE.Scene = null;
export let renderer: THREE.WebGLRenderer = null;
export let cursorX: number = 0;
export let cursorY: number = 0;
export let camera: THREE.PerspectiveCamera = null;

// 背景图片管理
let backgroundImages: string[] = [];
let currentBackgroundIndex: number = 0;
let backgroundImageFit: BackgroundImageFit = 'height';
let canvasAlignLeftPercent: number | null = null;
let canvasAlignRightPercent: number | null = null;
let backgroundContainer: HTMLDivElement | null = null;
let backgroundLayer1: HTMLDivElement | null = null;
let backgroundLayer2: HTMLDivElement | null = null;
let currentBackgroundLayer: HTMLDivElement | null = null;
let nextBackgroundLayer: HTMLDivElement | null = null;
let isTransitioning: boolean = false;

// Canvas 暂停/恢复控制
let canvasElement: HTMLCanvasElement | null = null;
let isCanvasPaused = false;

const DEFAULT_CANVAS_ALIGN_LEFT_PERCENT = 0.17;

function normalizePercentToRatio(value: number): number | null {
  // 支持 0~1 或 0~100 两种输入
  const v = Number(value);
  if (!Number.isFinite(v)) return null; // 无效值返回 null，表示不使用左对齐
  
  // 如果值不在有效范围内，返回 null
  if (v < 0 || v > 100) {
    return null; // 不在 0-100 范围内，返回 null 表示不使用左对齐
  }
  
  // 判断是 0-1 范围还是 0-100 范围
  if (v > 1) {
    // 百分比格式 (1-100)，转换为比例
    return v / 100;
  } else {
    // 比例格式 (0-1)，直接使用
    return v;
  }
}

function extractUrlFromCssBackgroundImage(value: string): string | null {
  // Expected forms:
  // - url("..."), url('...'), url(...)
  if (!value || value === 'none') return null;
  const match = value.match(/url\((['"]?)(.*?)\1\)/i);
  return match?.[2] ?? null;
}

const naturalSizeCache = new Map<string, Promise<{ w: number; h: number }>>();

function getImageNaturalSize(url: string): Promise<{ w: number; h: number }> {
  if (!url) return Promise.reject(new Error('Empty image url'));
  const cached = naturalSizeCache.get(url);
  if (cached) return cached;

  const promise = new Promise<{ w: number; h: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
  naturalSizeCache.set(url, promise);
  return promise;
}

type BackgroundImageFit = 'height' | 'width';

function centerCanvas(canvas: HTMLCanvasElement) {
  // 直接让canvas相对于viewport居中（不基于背景图）
  const viewportW = window.innerWidth;
  // 使用实际显示宽度（考虑CSS缩放）
  const canvasW = canvas.getBoundingClientRect().width || canvas.width;
  const desiredLeft = (viewportW - canvasW) / 2;
  
  canvas.style.position = 'fixed';
  canvas.style.top = '0px';
  canvas.style.left = `${desiredLeft}px`;
}

async function alignCanvasToBackgroundImage(
  canvas: HTMLCanvasElement,
  alignLeftPercent: number | null,
  alignRightPercent: number | null,
  backgroundImageFit: BackgroundImageFit
) {
  // 优先使用左对齐，如果左对齐无效则尝试右对齐，如果都无效则居中
  let alignPercent: number | null = null;
  let useRightAlign = false;
  
  if (alignLeftPercent !== null) {
    // 左对齐有效，优先使用
    alignPercent = alignLeftPercent;
    useRightAlign = false;
  } else if (alignRightPercent !== null) {
    // 左对齐无效，使用右对齐
    alignPercent = alignRightPercent;
    useRightAlign = true;
  } else {
    // 两个都无效，直接居中
    centerCanvas(canvas);
    return;
  }
  
  // 优先从背景层获取背景图片 URL，如果没有则从 body 获取
  let bgUrl: string | null = null;
  if (currentBackgroundLayer) {
    const layerStyle = getComputedStyle(currentBackgroundLayer);
    bgUrl = extractUrlFromCssBackgroundImage(layerStyle.backgroundImage);
  }
  if (!bgUrl) {
    const bodyStyle = getComputedStyle(document.body);
    bgUrl = extractUrlFromCssBackgroundImage(bodyStyle.backgroundImage);
  }
  if (!bgUrl) {
    // 如果没有背景图，也直接居中
    centerCanvas(canvas);
    return;
  }

  // 当前项目的背景设定为：background-size: auto 100%; background-position: center;
  // 因此背景图"实际显示区域"通常比 body 窄，左右会留白；我们要基于图片区域计算偏移。
  let natural: { w: number; h: number } | null = null;
  try {
    natural = await getImageNaturalSize(bgUrl);
  } catch (e) {
    // 如果图片加载失败，则直接居中，避免把 canvas 挪走导致不可见/不可点
    console.warn(e);
    centerCanvas(canvas);
    return;
  }

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  if (!viewportW || !viewportH || !natural.w || !natural.h) {
    centerCanvas(canvas);
    return;
  }

  // 计算背景图"实际渲染矩形"（由 backgroundImageFit 决定）
  let bgDrawW: number;
  let bgDrawH: number;
  let bgLeft: number;
  if (backgroundImageFit === 'width') {
    // background-size: 100% auto
    bgDrawW = viewportW;
    bgDrawH = (natural.h / natural.w) * bgDrawW;
    bgLeft = 0;
  } else {
    // background-size: auto 100%（默认）
    bgDrawH = viewportH;
    bgDrawW = (natural.w / natural.h) * bgDrawH;
    bgLeft = (viewportW - bgDrawW) / 2;
  }

  let desiredLeft: number;
  if (useRightAlign) {
    // 右对齐：从背景图右边缘向左偏移 alignPercent 比例
    // alignPercent = 0 时，canvas右边缘对齐背景图右边缘
    // alignPercent = 1 时，canvas右边缘对齐背景图左边缘
    const canvasW = canvas.getBoundingClientRect().width || canvas.width;
    const bgRight = bgLeft + bgDrawW;
    // canvas右边缘位置 = bgRight - bgDrawW * alignPercent
    // canvas左边缘位置 = canvas右边缘位置 - canvas宽度
    desiredLeft = bgRight - bgDrawW * alignPercent - canvasW;
  } else {
    // 左对齐：从背景图左边缘向右偏移 alignPercent 比例
    // alignPercent = 0 时，canvas左边缘对齐背景图左边缘
    // alignPercent = 1 时，canvas左边缘对齐背景图右边缘
    desiredLeft = bgLeft + bgDrawW * alignPercent;
  }

  canvas.style.position = 'fixed';
  canvas.style.top = '0px';
  canvas.style.left = `${desiredLeft}px`;
}

export const initScene = (configs: Configs) => {
  const width = configs.width ?? 2048;
  const height = configs.height ?? 2048;
  backgroundImageFit = configs.backgroundImageFit ?? 'height';
  canvasAlignLeftPercent = configs.canvasAlignLeftPercent !== undefined
    ? normalizePercentToRatio(configs.canvasAlignLeftPercent)
    : normalizePercentToRatio(DEFAULT_CANVAS_ALIGN_LEFT_PERCENT);
  canvasAlignRightPercent = configs.canvasAlignRightPercent !== undefined
    ? normalizePercentToRatio(configs.canvasAlignRightPercent)
    : null;
  
  // 处理背景图片（支持数组）
  if (configs.backgroundImage) {
    backgroundImages = Array.isArray(configs.backgroundImage) 
      ? configs.backgroundImage 
      : [configs.backgroundImage];
    currentBackgroundIndex = 0;
  } else {
    backgroundImages = [];
    currentBackgroundIndex = 0;
  }

  //#region BASIC SETUP
  // Create an empty scene
  scene = new THREE.Scene();

  // Create a basic perspective camera
  camera = new THREE.PerspectiveCamera(75, width / height, 1, 5000);
  camera.position.x = 0;
  camera.position.y = 0;
  camera.position.z = 0;
  // Create a renderer with Antialiasing and transparent background
  // 关键：开启 alpha，并保持 premultipliedAlpha 为 true（与 three.js 默认一致），避免透明混合异常/黑底
  // 性能优化：启用性能相关选项
  renderer = new THREE.WebGLRenderer({ 
    antialias: true, 
    alpha: true, 
    premultipliedAlpha: true,
    powerPreference: 'high-performance', // 优先使用高性能 GPU
    stencil: false, // 禁用模板缓冲区（如果不需要）
    depth: true, // 保留深度缓冲区（Spine 动画需要）
  });
  // Set renderer clear color to transparent
  renderer.setClearColor('#000000', 0); // 黑色，alpha=0
  // 性能优化：设置渲染器性能选项
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 限制最大像素比，避免过高分辨率
  renderer.sortObjects = false; // 禁用对象排序（如果不需要透明混合优化）
  // Set body background to transparent
  document.body.style.backgroundColor = 'transparent';
  
  // 创建背景容器和背景层（用于淡入淡出效果）
  if (backgroundImages.length > 0) {
    createBackgroundLayers();
    setBackgroundImage(backgroundImages[currentBackgroundIndex], false);
  }
  // Configure renderer size
  renderer.setSize(width, height);
  // Append Renderer to DOM
  canvasElement = renderer.domElement;
  document.body.appendChild(canvasElement);

  // 初始化响应式布局（可选）
  initResponsiveLayout(configs, canvasElement);

  // 让 canvas 基于"背景图片的实际渲染区域"进行对齐（而不是基于 body/背景色）
  void alignCanvasToBackgroundImage(canvasElement, canvasAlignLeftPercent, canvasAlignRightPercent, backgroundImageFit);
  //#endregion

  //#region event register
  // 性能优化：使用防抖优化 resize 事件处理
  let resizeTimeout: number | null = null;
  const RESIZE_DEBOUNCE_DELAY = 150; // 150ms 防抖延迟
  
  function onWindowResize() {
    // 清除之前的定时器
    if (resizeTimeout !== null) {
      clearTimeout(resizeTimeout);
    }
    
    // 设置新的定时器
    resizeTimeout = window.setTimeout(() => {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      void alignCanvasToBackgroundImage(renderer.domElement, canvasAlignLeftPercent, canvasAlignRightPercent, backgroundImageFit);
      resizeTimeout = null;
    }, RESIZE_DEBOUNCE_DELAY);
  }
  
  window.addEventListener('resize', onWindowResize, false);

  document.addEventListener('mousemove', onMouseMove, false);
  function onMouseMove(event: MouseEvent) {
    // Update the mouse variable
    event.preventDefault();
    cursorX = (event.clientX / window.innerWidth) * 2 - 1;
    cursorY = -(event.clientY / window.innerHeight) * 2 + 1;
  }
  //#endregion
};

/**
 * 创建背景层容器和两个背景层（用于淡入淡出效果）
 */
function createBackgroundLayers() {
  // 创建背景容器
  backgroundContainer = document.createElement('div');
  backgroundContainer.style.position = 'fixed';
  backgroundContainer.style.top = '0';
  backgroundContainer.style.left = '0';
  backgroundContainer.style.width = '100%';
  backgroundContainer.style.height = '100%';
  backgroundContainer.style.zIndex = '-1';
  backgroundContainer.style.pointerEvents = 'none';
  
  // 创建第一个背景层
  backgroundLayer1 = document.createElement('div');
  backgroundLayer1.style.position = 'absolute';
  backgroundLayer1.style.top = '0';
  backgroundLayer1.style.left = '0';
  backgroundLayer1.style.width = '100%';
  backgroundLayer1.style.height = '100%';
  backgroundLayer1.style.backgroundSize = backgroundImageFit === 'width' ? '100% auto' : 'auto 100%';
  backgroundLayer1.style.backgroundPosition = 'center';
  backgroundLayer1.style.backgroundRepeat = 'no-repeat';
  backgroundLayer1.style.opacity = '1';
  backgroundLayer1.style.transition = 'opacity 0.5s ease-in-out';
  
  // 创建第二个背景层
  backgroundLayer2 = document.createElement('div');
  backgroundLayer2.style.position = 'absolute';
  backgroundLayer2.style.top = '0';
  backgroundLayer2.style.left = '0';
  backgroundLayer2.style.width = '100%';
  backgroundLayer2.style.height = '100%';
  backgroundLayer2.style.backgroundSize = backgroundImageFit === 'width' ? '100% auto' : 'auto 100%';
  backgroundLayer2.style.backgroundPosition = 'center';
  backgroundLayer2.style.backgroundRepeat = 'no-repeat';
  backgroundLayer2.style.opacity = '0';
  backgroundLayer2.style.transition = 'opacity 0.5s ease-in-out';
  
  backgroundContainer.appendChild(backgroundLayer1);
  backgroundContainer.appendChild(backgroundLayer2);
  document.body.appendChild(backgroundContainer);
  
  // 设置当前背景层
  currentBackgroundLayer = backgroundLayer1;
  nextBackgroundLayer = backgroundLayer2;
}

/**
 * 设置背景图片
 * @param imageFileName 图片文件名
 * @param useTransition 是否使用过渡效果
 */
function setBackgroundImage(imageFileName: string, useTransition: boolean = true) {
  const backgroundImagePath = ASSET_PATH + imageFileName;
  
  if (!backgroundContainer || !backgroundLayer1 || !backgroundLayer2) {
    // 如果没有背景层，使用传统方式设置背景
    document.body.style.backgroundImage = `url(${backgroundImagePath})`;
    document.body.style.backgroundSize =
      backgroundImageFit === 'width' ? '100% auto' : 'auto 100%';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
    
    // 重新对齐 canvas
    if (canvasElement) {
      void alignCanvasToBackgroundImage(canvasElement, canvasAlignLeftPercent, canvasAlignRightPercent, backgroundImageFit);
    }
    return;
  }
  
  if (useTransition && isTransitioning) {
    return; // 如果正在过渡中，忽略新的切换请求
  }
  
  if (useTransition) {
    isTransitioning = true;
    
    // 设置新背景图片到下一个背景层
    nextBackgroundLayer!.style.backgroundImage = `url(${backgroundImagePath})`;
    
    // 当前层淡出，下一层淡入
    currentBackgroundLayer!.style.opacity = '0';
    nextBackgroundLayer!.style.opacity = '1';
    
    // 过渡完成后，交换层并重置状态
    setTimeout(() => {
      // 交换当前层和下一层
      const temp = currentBackgroundLayer;
      currentBackgroundLayer = nextBackgroundLayer;
      nextBackgroundLayer = temp;
      
      // 重置下一层的 opacity，准备下次切换
      nextBackgroundLayer!.style.opacity = '0';
      
      isTransitioning = false;
      
      // 重新对齐 canvas
      if (canvasElement) {
        void alignCanvasToBackgroundImage(canvasElement, canvasAlignLeftPercent, canvasAlignRightPercent, backgroundImageFit);
      }
    }, 500); // 与 CSS transition 时间一致
  } else {
    // 不使用过渡，直接设置（用于初始化）
    currentBackgroundLayer!.style.backgroundImage = `url(${backgroundImagePath})`;
    currentBackgroundLayer!.style.opacity = '1';
    nextBackgroundLayer!.style.opacity = '0';
    
    // 重新对齐 canvas
    if (canvasElement) {
      void alignCanvasToBackgroundImage(canvasElement, canvasAlignLeftPercent, canvasAlignRightPercent, backgroundImageFit);
    }
  }
}

/**
 * 切换到下一个背景图片（滚动式切换）
 */
export const switchBackgroundImage = () => {
  if (backgroundImages.length <= 1) {
    return; // 只有一个或没有背景图片，不需要切换
  }
  
  currentBackgroundIndex = (currentBackgroundIndex + 1) % backgroundImages.length;
  setBackgroundImage(backgroundImages[currentBackgroundIndex]);
};

/**
 * 暂停 canvas 渲染（用于视频播放时释放 GPU 资源）
 */
export const pauseCanvas = () => {
  if (!canvasElement || isCanvasPaused) return;
  
  isCanvasPaused = true;
  // 隐藏 canvas，释放 GPU 资源
  canvasElement.style.display = 'none';
  // 释放 WebGL 上下文（可选，但更彻底）
  if (renderer) {
    const gl = renderer.getContext();
    if (gl && 'getExtension' in gl) {
      // 强制释放 GPU 资源
      const loseContext = (gl as any).getExtension('WEBGL_lose_context');
      if (loseContext) {
        // 不调用 loseContext()，只是隐藏 canvas
        // loseContext.loseContext(); // 这会完全释放上下文，恢复时需要重新创建
      }
    }
  }
  console.log('Canvas paused for video playback');
};

/**
 * 恢复 canvas 渲染
 */
export const resumeCanvas = () => {
  if (!canvasElement || !isCanvasPaused) return;
  
  isCanvasPaused = false;
  // 恢复显示 canvas
  canvasElement.style.display = '';
  console.log('Canvas resumed after video playback');
};
