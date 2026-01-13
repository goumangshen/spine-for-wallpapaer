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

// Canvas 尺寸存储（用于更新）
let currentCanvasWidth: number = 2048;
let currentCanvasHeight: number = 2048;

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

type BackgroundImageFit = 'height' | 'width' | 'auto';

/**
 * 根据图片和屏幕尺寸自动决定使用 height 还是 width 模式
 * 优先保证背景图片填满屏幕（类似 CSS cover 效果）
 * @param imageNaturalSize 图片原始尺寸
 * @param viewportW 屏幕宽度
 * @param viewportH 屏幕高度
 * @returns 'height' 或 'width'
 */
function determineAutoFit(
  imageNaturalSize: { w: number; h: number },
  viewportW: number,
  viewportH: number
): 'height' | 'width' {
  if (!imageNaturalSize.w || !imageNaturalSize.h || !viewportW || !viewportH) {
    return 'height'; // 默认值
  }
  
  const imageAspectRatio = imageNaturalSize.w / imageNaturalSize.h;
  const viewportAspectRatio = viewportW / viewportH;
  
  // 如果图片宽高比 > 屏幕宽高比，使用 height（高度100%），否则使用 width（宽度100%）
  // 这样可以优先保证背景图片填满屏幕
  return imageAspectRatio > viewportAspectRatio ? 'height' : 'width';
}

/**
 * 根据 backgroundImageFit 设置 CSS background-size
 * 如果是 auto 模式，需要异步获取图片尺寸
 * @param element 要设置样式的元素
 * @param imageUrl 图片 URL（用于 auto 模式）
 * @param fit 适配模式
 */
async function setBackgroundSize(
  element: HTMLElement,
  imageUrl: string,
  fit: BackgroundImageFit
) {
  if (fit === 'auto') {
    // auto 模式：需要获取图片尺寸来决定使用 height 还是 width
    try {
      const natural = await getImageNaturalSize(imageUrl);
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;
      const actualFit = determineAutoFit(natural, viewportW, viewportH);
      element.style.backgroundSize = actualFit === 'width' ? '100% auto' : 'auto 100%';
    } catch (e) {
      // 如果获取图片尺寸失败，使用默认的 height 模式
      console.warn('Failed to get image size for auto fit, using height mode:', e);
      element.style.backgroundSize = 'auto 100%';
    }
  } else if (fit === 'width') {
    element.style.backgroundSize = '100% auto';
  } else {
    // 'height' 或默认
    element.style.backgroundSize = 'auto 100%';
  }
}

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
  // 如果是 auto 模式，根据图片和屏幕尺寸自动决定使用 height 还是 width
  const actualFit: 'height' | 'width' = backgroundImageFit === 'auto'
    ? determineAutoFit(natural, viewportW, viewportH)
    : backgroundImageFit;
  
  let bgDrawW: number;
  let bgDrawH: number;
  let bgLeft: number;
  if (actualFit === 'width') {
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
  // 优先使用全局配置，如果全局没有设置，则检查 activeMeshIndex 对应的 mesh 配置
  const activeMeshIndex = configs.activeMeshIndex ?? 0;
  const activeMesh = configs.meshes?.[activeMeshIndex];
  
  // 处理 canvas 尺寸：优先使用全局配置，否则使用 mesh 配置，最后使用默认值
  const initialWidth = configs.width ?? activeMesh?.width ?? 2048;
  const initialHeight = configs.height ?? activeMesh?.height ?? 2048;
  currentCanvasWidth = initialWidth;
  currentCanvasHeight = initialHeight;
  const width = currentCanvasWidth;
  const height = currentCanvasHeight;
  
  backgroundImageFit = configs.backgroundImageFit ?? 'height';
  
  // 处理 canvas 对齐：优先使用 mesh 配置，如果 mesh 没有设置，则使用全局配置
  // 根据配置类型注释，mesh 的配置优先于全局配置
  let initialAlignLeftPercent: number | undefined;
  let initialAlignRightPercent: number | undefined;
  
  if (activeMesh) {
    // 优先使用 mesh 的对齐配置
    initialAlignLeftPercent = activeMesh.canvasAlignLeftPercent ?? configs.canvasAlignLeftPercent;
    initialAlignRightPercent = activeMesh.canvasAlignRightPercent ?? configs.canvasAlignRightPercent;
  } else {
    // 如果没有 activeMesh，使用全局配置
    initialAlignLeftPercent = configs.canvasAlignLeftPercent;
    initialAlignRightPercent = configs.canvasAlignRightPercent;
  }
  
  canvasAlignLeftPercent = initialAlignLeftPercent !== undefined
    ? normalizePercentToRatio(initialAlignLeftPercent)
    : normalizePercentToRatio(DEFAULT_CANVAS_ALIGN_LEFT_PERCENT);
  canvasAlignRightPercent = initialAlignRightPercent !== undefined
    ? normalizePercentToRatio(initialAlignRightPercent)
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
  
  // 应用 canvas 边缘过渡方式（优先使用 mesh 配置，否则使用全局配置）
  let initialEdgeTransition: 0 | 1 | 2 | 3 = 1; // 默认使用羽化
  let initialTransitionImage: string | undefined;
  let initialBorderColor: string | undefined;
  
  if (activeMesh) {
    // 优先使用 mesh 的边缘过渡配置
    initialEdgeTransition = activeMesh.canvasEdgeTransition ?? configs.canvasEdgeTransition ?? 1;
    initialTransitionImage = activeMesh.canvasEdgeTransitionImage ?? configs.canvasEdgeTransitionImage;
    initialBorderColor = activeMesh.canvasEdgeBorderColor ?? configs.canvasEdgeBorderColor;
  } else {
    // 如果没有 activeMesh，使用全局配置
    initialEdgeTransition = configs.canvasEdgeTransition ?? 1;
    initialTransitionImage = configs.canvasEdgeTransitionImage;
    initialBorderColor = configs.canvasEdgeBorderColor;
  }
  
  applyCanvasEdgeTransition(initialEdgeTransition, initialTransitionImage, initialBorderColor);
  
  document.body.appendChild(canvasElement);


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
      camera.aspect = currentCanvasWidth / currentCanvasHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(currentCanvasWidth, currentCanvasHeight);
      void alignCanvasToBackgroundImage(renderer.domElement, canvasAlignLeftPercent, canvasAlignRightPercent, backgroundImageFit);
      
      // 更新图片覆盖层位置（如果存在）
      const overlayContainer = document.getElementById('canvas-edge-transition-overlay');
      if (overlayContainer && canvasElement) {
        const canvasRect = canvasElement.getBoundingClientRect();
        overlayContainer.style.left = `${canvasRect.left}px`;
        overlayContainer.style.top = `${canvasRect.top}px`;
        overlayContainer.style.width = `${canvasRect.width}px`;
        overlayContainer.style.height = `${canvasRect.height}px`;
      }
      
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
  // backgroundSize 会在设置背景图片时根据 auto 模式动态设置
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
  // backgroundSize 会在设置背景图片时根据 auto 模式动态设置
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
    // 使用辅助函数设置 background-size（支持 auto 模式）
    void setBackgroundSize(document.body, backgroundImagePath, backgroundImageFit);
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
    // 根据 auto 模式动态设置 background-size
    void setBackgroundSize(nextBackgroundLayer!, backgroundImagePath, backgroundImageFit);
    
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
    // 根据 auto 模式动态设置 background-size
    void setBackgroundSize(currentBackgroundLayer!, backgroundImagePath, backgroundImageFit);
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
 * 设置 mesh 的背景图片（优先使用 mesh 配置的背景图片，否则使用全局背景图片）
 * @param meshBackgroundImage mesh 配置的背景图片（可选）
 * @param globalBackgroundImage 全局配置的背景图片（可选）
 * @param useTransition 是否使用过渡效果
 */
export const setMeshBackgroundImage = (
  meshBackgroundImage?: string | string[],
  globalBackgroundImage?: string | string[],
  useTransition: boolean = true
) => {
  // 优先使用 mesh 的背景图片，否则使用全局的背景图片
  let targetBackgroundImage: string | string[] | undefined;
  
  if (meshBackgroundImage) {
    // mesh 配置了背景图片，优先使用
    targetBackgroundImage = meshBackgroundImage;
  } else if (globalBackgroundImage) {
    // mesh 没有配置背景图片，使用全局的背景图片
    targetBackgroundImage = globalBackgroundImage;
  }
  
  if (!targetBackgroundImage) {
    // 都没有配置背景图片，不设置
    return;
  }
  
  // 处理数组格式（取第一个）
  const imageFileName = Array.isArray(targetBackgroundImage) 
    ? targetBackgroundImage[0] 
    : targetBackgroundImage;
  
  // 如果背景层还没有创建，先创建背景层
  if (!backgroundContainer && imageFileName) {
    createBackgroundLayers();
  }
  
  // 设置背景图片
  setBackgroundImage(imageFileName, useTransition);
};

/**
 * 设置 mesh 的 canvas 对齐（优先使用 mesh 配置的对齐值，否则使用全局对齐值）
 * @param meshAlignLeftPercent mesh 配置的左对齐百分比（可选）
 * @param meshAlignRightPercent mesh 配置的右对齐百分比（可选）
 * @param globalAlignLeftPercent 全局配置的左对齐百分比（可选）
 * @param globalAlignRightPercent 全局配置的右对齐百分比（可选）
 */
export const setMeshCanvasAlignment = (
  meshAlignLeftPercent?: number,
  meshAlignRightPercent?: number,
  globalAlignLeftPercent?: number,
  globalAlignRightPercent?: number
) => {
  // 优先使用 mesh 的对齐配置，否则使用全局的对齐配置
  let targetAlignLeftPercent: number | undefined;
  let targetAlignRightPercent: number | undefined;
  
  if (meshAlignLeftPercent !== undefined) {
    // mesh 配置了左对齐，优先使用
    targetAlignLeftPercent = meshAlignLeftPercent;
  } else if (globalAlignLeftPercent !== undefined) {
    // mesh 没有配置左对齐，使用全局的左对齐
    targetAlignLeftPercent = globalAlignLeftPercent;
  }
  
  if (meshAlignRightPercent !== undefined) {
    // mesh 配置了右对齐，优先使用
    targetAlignRightPercent = meshAlignRightPercent;
  } else if (globalAlignRightPercent !== undefined) {
    // mesh 没有配置右对齐，使用全局的右对齐
    targetAlignRightPercent = globalAlignRightPercent;
  }
  
  // 规范化对齐值并更新全局变量（用于 resize 事件）
  canvasAlignLeftPercent = targetAlignLeftPercent !== undefined
    ? normalizePercentToRatio(targetAlignLeftPercent)
    : normalizePercentToRatio(DEFAULT_CANVAS_ALIGN_LEFT_PERCENT);
  canvasAlignRightPercent = targetAlignRightPercent !== undefined
    ? normalizePercentToRatio(targetAlignRightPercent)
    : null;
  
  // 应用对齐
  if (canvasElement) {
    void alignCanvasToBackgroundImage(
      canvasElement,
      canvasAlignLeftPercent,
      canvasAlignRightPercent,
      backgroundImageFit
    );
  }
};

/**
 * 清理 canvas 边缘过渡覆盖层
 */
function clearCanvasEdgeTransition() {
  const overlayContainer = document.getElementById('canvas-edge-transition-overlay');
  if (overlayContainer) {
    overlayContainer.remove();
  }
  if (canvasElement) {
    canvasElement.style.maskImage = 'none';
    canvasElement.style.webkitMaskImage = 'none';
    canvasElement.style.clipPath = 'none';
    (canvasElement.style as any).webkitClipPath = 'none';
  }
}

/**
 * 应用 canvas 边缘过渡方式
 * @param edgeTransition 边缘过渡方式：0=不过渡，1=羽化，2=图片覆盖，3=边框
 * @param transitionImage 边缘过渡图片文件名（当 edgeTransition 为 2 时使用）
 * @param borderColor 边框颜色（当 edgeTransition 为 3 时使用）
 */
function applyCanvasEdgeTransition(
  edgeTransition: 0 | 1 | 2 | 3,
  transitionImage?: string,
  borderColor?: string
) {
  if (!canvasElement) return;
  
  // 先清理旧的覆盖层
  clearCanvasEdgeTransition();
  
  if (edgeTransition === 1) {
    // 羽化：使用 mask-image 实现左右边缘渐变
    canvasElement.style.maskImage = 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)';
    canvasElement.style.webkitMaskImage = 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)';
  } else if (edgeTransition === 2) {
    // 图片覆盖：创建覆盖层，使用指定图片覆盖 canvas
    if (transitionImage) {
      // 创建覆盖层容器
      const overlayContainer = document.createElement('div');
      overlayContainer.id = 'canvas-edge-transition-overlay';
      overlayContainer.style.position = 'fixed';
      overlayContainer.style.top = '0';
      overlayContainer.style.left = '0';
      overlayContainer.style.width = '100%';
      overlayContainer.style.height = '100%';
      overlayContainer.style.pointerEvents = 'none';
      overlayContainer.style.zIndex = '10001'; // 确保在 canvas 之上
      
      // 创建覆盖图片元素
      const overlayImage = document.createElement('img');
      overlayImage.src = ASSET_PATH + transitionImage;
      overlayImage.style.position = 'absolute';
      overlayImage.style.width = '100%';
      overlayImage.style.height = '100%';
      overlayImage.style.objectFit = 'fill'; // 拉伸填充
      overlayImage.style.pointerEvents = 'none';
      
      // 等待图片加载完成后，根据 canvas 的实际位置和尺寸定位覆盖层
      const updateOverlayPosition = () => {
        if (!canvasElement) return;
        
        const canvasRect = canvasElement.getBoundingClientRect();
        overlayContainer.style.left = `${canvasRect.left}px`;
        overlayContainer.style.top = `${canvasRect.top}px`;
        overlayContainer.style.width = `${canvasRect.width}px`;
        overlayContainer.style.height = `${canvasRect.height}px`;
      };
      
      overlayImage.addEventListener('load', () => {
        updateOverlayPosition();
        // 监听窗口大小变化和 canvas 位置变化
        window.addEventListener('resize', updateOverlayPosition);
        // 使用 MutationObserver 监听 canvas 样式变化
        const observer = new MutationObserver(updateOverlayPosition);
        if (canvasElement) {
          observer.observe(canvasElement, {
            attributes: true,
            attributeFilter: ['style']
          });
        }
      });
      
      overlayContainer.appendChild(overlayImage);
      document.body.appendChild(overlayContainer);
    } else {
      console.warn('canvasEdgeTransition is set to 2 but canvasEdgeTransitionImage is not provided');
    }
  } else if (edgeTransition === 3) {
    // 边框：使用内凹圆角双层画框
    const borderColorValue = borderColor ?? '#c0a062';
    
    // 边框参数（参照 temple.html）
    const outerMargin = 0;  // 外框触及网页上下边缘，margin为0
    const frameGap = 5;     // 外框 → 次框 的间距
    const radius = 20;      // 内外框统一凹角半径
    
    // 创建覆盖层容器（覆盖整个viewport）
    const overlayContainer = document.createElement('div');
    overlayContainer.id = 'canvas-edge-transition-overlay';
    overlayContainer.style.position = 'fixed';
    overlayContainer.style.top = '0';
    overlayContainer.style.left = '0';
    overlayContainer.style.width = '100%';
    overlayContainer.style.height = '100%';
    overlayContainer.style.pointerEvents = 'none';
    overlayContainer.style.zIndex = '10001'; // 确保在 canvas 之上
    
    // 创建用于绘制边框的 canvas
    const borderCanvas = document.createElement('canvas');
    borderCanvas.style.position = 'absolute';
    borderCanvas.style.pointerEvents = 'none';
    borderCanvas.style.imageRendering = 'crisp-edges'; // 保持边框清晰
    
    const borderCtx = borderCanvas.getContext('2d');
    if (!borderCtx) {
      console.error('Failed to get 2D context for border canvas');
    } else {
      // 内凹圆角矩形路径函数（参照 temple.html）
      const concaveRectPath = (x: number, y: number, w: number, h: number, r: number) => {
        borderCtx.beginPath();
        
        // 上
        borderCtx.moveTo(x + r, y);
        borderCtx.lineTo(x + w - r, y);
        borderCtx.arc(x + w, y, r, Math.PI, Math.PI / 2, true);
        
        // 右
        borderCtx.lineTo(x + w, y + h - r);
        borderCtx.arc(x + w, y + h, r, -Math.PI / 2, Math.PI, true);
        
        // 下
        borderCtx.lineTo(x + r, y + h);
        borderCtx.arc(x, y + h, r, 0, -Math.PI / 2, true);
        
        // 左
        borderCtx.lineTo(x, y + r);
        borderCtx.arc(x, y, r, Math.PI / 2, 0, true);
        
        borderCtx.closePath();
      };
      
      // 生成clip-path路径字符串（用于裁剪canvas内容）
      const generateClipPath = (canvasWidth: number, viewportHeight: number): string => {
        const clipTop = outerMargin;
        const clipRight = outerMargin;
        const clipBottom = outerMargin;
        const clipLeft = outerMargin;
        
        const clipW = canvasWidth - clipLeft - clipRight;
        const clipH = viewportHeight - clipTop - clipBottom;
        
        const r = radius;
        const points: number[] = [];
        
        const generateArcPoints = (centerX: number, centerY: number, startAngle: number, endAngle: number, radius: number, numPoints: number = 8): Array<[number, number]> => {
          const points: Array<[number, number]> = [];
          for (let i = 0; i <= numPoints; i++) {
            const angle = startAngle + (endAngle - startAngle) * (i / numPoints);
            points.push([centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius]);
          }
          return points;
        };
        
        points.push(clipLeft + r, clipTop);
        points.push(clipLeft + clipW - r, clipTop);
        
        const topRightArc = generateArcPoints(clipLeft + clipW, clipTop, Math.PI, Math.PI / 2, r);
        topRightArc.forEach(([x, y]) => points.push(x, y));
        
        points.push(clipLeft + clipW, clipTop + r);
        points.push(clipLeft + clipW, clipTop + clipH - r);
        
        const bottomRightArc = generateArcPoints(clipLeft + clipW, clipTop + clipH, -Math.PI / 2, Math.PI, r);
        bottomRightArc.forEach(([x, y]) => points.push(x, y));
        
        points.push(clipLeft + clipW - r, clipTop + clipH);
        points.push(clipLeft + r, clipTop + clipH);
        
        const bottomLeftArc = generateArcPoints(clipLeft, clipTop + clipH, 0, -Math.PI / 2, r);
        bottomLeftArc.forEach(([x, y]) => points.push(x, y));
        
        points.push(clipLeft, clipTop + clipH - r);
        points.push(clipLeft, clipTop + r);
        
        const topLeftArc = generateArcPoints(clipLeft, clipTop, Math.PI / 2, 0, r);
        topLeftArc.forEach(([x, y]) => points.push(x, y));
        
        const polygonPoints: string[] = [];
        for (let i = 0; i < points.length; i += 2) {
          polygonPoints.push(`${points[i]}px ${points[i + 1]}px`);
        }
        return `polygon(${polygonPoints.join(', ')})`;
      };
      
      const drawBorder = () => {
        if (!canvasElement) return;
        
        const canvasRect = canvasElement.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const canvasW = canvasRect.width;
        const canvasLeft = canvasRect.left;
        
        borderCanvas.width = window.innerWidth;
        borderCanvas.height = viewportH;
        
        borderCtx.clearRect(0, 0, borderCanvas.width, borderCanvas.height);
        
        const borderX = canvasLeft + outerMargin;
        const borderY = outerMargin;
        const borderW = canvasW - outerMargin * 2;
        const borderH = viewportH - outerMargin * 2;
        
        borderCtx.strokeStyle = borderColorValue;
        borderCtx.lineWidth = 2;
        concaveRectPath(borderX, borderY, borderW, borderH, radius);
        borderCtx.stroke();
        
        borderCtx.strokeStyle = borderColorValue;
        borderCtx.lineWidth = 1;
        concaveRectPath(borderX + frameGap, borderY + frameGap, borderW - frameGap * 2, borderH - frameGap * 2, radius);
        borderCtx.stroke();
      };
      
      const updateOverlayPosition = () => {
        if (!canvasElement) return;
        
        const canvasRect = canvasElement.getBoundingClientRect();
        const viewportH = window.innerHeight;
        
        overlayContainer.style.left = '0px';
        overlayContainer.style.top = '0px';
        overlayContainer.style.width = '100%';
        overlayContainer.style.height = '100%';
        
        drawBorder();
        
        const clipPath = generateClipPath(canvasRect.width, viewportH);
        canvasElement.style.clipPath = clipPath;
        (canvasElement.style as any).webkitClipPath = clipPath;
      };
      
      updateOverlayPosition();
      
      window.addEventListener('resize', updateOverlayPosition);
      const observer = new MutationObserver(updateOverlayPosition);
      if (canvasElement) {
        observer.observe(canvasElement, {
          attributes: true,
          attributeFilter: ['style']
        });
      }
    }
    
    overlayContainer.appendChild(borderCanvas);
    document.body.appendChild(overlayContainer);
  } else {
    // 不过渡：移除 mask
    canvasElement.style.maskImage = 'none';
    canvasElement.style.webkitMaskImage = 'none';
  }
}

/**
 * 设置 mesh 的 canvas 边缘过渡（优先使用 mesh 配置的边缘过渡值，否则使用全局边缘过渡值）
 * @param meshEdgeTransition mesh 配置的边缘过渡方式（可选）
 * @param meshTransitionImage mesh 配置的边缘过渡图片文件名（可选）
 * @param meshBorderColor mesh 配置的边框颜色（可选）
 * @param globalEdgeTransition 全局配置的边缘过渡方式（可选）
 * @param globalTransitionImage 全局配置的边缘过渡图片文件名（可选）
 * @param globalBorderColor 全局配置的边框颜色（可选）
 */
export const setMeshCanvasEdgeTransition = (
  meshEdgeTransition?: 0 | 1 | 2 | 3,
  meshTransitionImage?: string,
  meshBorderColor?: string,
  globalEdgeTransition?: 0 | 1 | 2 | 3,
  globalTransitionImage?: string,
  globalBorderColor?: string
) => {
  // 优先使用 mesh 的边缘过渡配置，否则使用全局的边缘过渡配置
  const targetEdgeTransition = meshEdgeTransition !== undefined
    ? meshEdgeTransition
    : (globalEdgeTransition !== undefined ? globalEdgeTransition : 1); // 默认使用羽化
  
  const targetTransitionImage = meshTransitionImage !== undefined
    ? meshTransitionImage
    : globalTransitionImage;
  
  const targetBorderColor = meshBorderColor !== undefined
    ? meshBorderColor
    : globalBorderColor;
  
  // 应用边缘过渡
  applyCanvasEdgeTransition(targetEdgeTransition, targetTransitionImage, targetBorderColor);
};

/**
 * 更新 canvas 尺寸
 * @param width canvas 宽度（可选，如果不提供则保持当前值）
 * @param height canvas 高度（可选，如果不提供则保持当前值）
 */
export const updateCanvasSize = (width?: number, height?: number) => {
  if (width !== undefined && width > 0) {
    currentCanvasWidth = width;
  }
  if (height !== undefined && height > 0) {
    currentCanvasHeight = height;
  }
  
  if (renderer && camera) {
    // 更新 camera 的宽高比
    camera.aspect = currentCanvasWidth / currentCanvasHeight;
    camera.updateProjectionMatrix();
    // 更新 renderer 尺寸
    renderer.setSize(currentCanvasWidth, currentCanvasHeight);
    // 更新 canvas 对齐
    if (canvasElement) {
      void alignCanvasToBackgroundImage(
        canvasElement,
        canvasAlignLeftPercent,
        canvasAlignRightPercent,
        backgroundImageFit
      );
    }
    
    // 更新图片覆盖层位置（如果存在）
    const overlayContainer = document.getElementById('canvas-edge-transition-overlay');
    if (overlayContainer && canvasElement) {
      const canvasRect = canvasElement.getBoundingClientRect();
      overlayContainer.style.left = `${canvasRect.left}px`;
      overlayContainer.style.top = `${canvasRect.top}px`;
      overlayContainer.style.width = `${canvasRect.width}px`;
      overlayContainer.style.height = `${canvasRect.height}px`;
    }
  }
};

/**
 * 获取当前 canvas 尺寸
 * @returns 当前 canvas 的宽度和高度
 */
export const getCanvasSize = (): { width: number; height: number } => {
  return { width: currentCanvasWidth, height: currentCanvasHeight };
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
