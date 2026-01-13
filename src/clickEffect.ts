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

import { ClickEffectConfig } from './config.type';
import { ASSET_PATH } from './constants';

// 性能优化：对象池和预加载
const effectImageCache = new Map<string, HTMLImageElement>();
const effectElementPool: HTMLImageElement[] = [];
const MAX_POOL_SIZE = 10; // 对象池最大大小

// 跟踪当前活跃的特效元素（用于条件触发）
const activeEffectElements = new Map<string, Set<HTMLImageElement>>();

// 跟踪每个特效元素关联的定时器（用于清除时取消定时器）
const effectElementTimers = new Map<HTMLImageElement, { fadeOutTimer?: number; removeTimer?: number }>();

// 点击特效完成计数回调（当特效消失时调用）
// 参数：特效图片文件名
type ClickEffectCompleteCallback = (imageFileName: string) => void;
let clickEffectCompleteCallback: ClickEffectCompleteCallback | null = null;

// 动画 keyframes 的创建标记
let shakeKeyframesAdded = false;
let pulseKeyframesAdded = false;

/**
 * 添加摇晃动画的 keyframes（如果还没有添加）
 */
function ensureShakeKeyframes(): void {
  if (shakeKeyframesAdded) return;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes click-effect-shake {
      0%, 100% { transform: translate(-50%, -50%) rotate(0deg); }
      25% { transform: translate(-50%, -50%) rotate(-5deg); }
      75% { transform: translate(-50%, -50%) rotate(5deg); }
    }
  `;
  document.head.appendChild(style);
  shakeKeyframesAdded = true;
}

/**
 * 添加放大缩小动画的 keyframes（如果还没有添加）
 */
function ensurePulseKeyframes(): void {
  if (pulseKeyframesAdded) return;
  
  const style = document.createElement('style');
  style.textContent = `
    @keyframes click-effect-pulse {
      0%, 100% { transform: translate(-50%, -50%) scale(1); }
      50% { transform: translate(-50%, -50%) scale(1.15); }
    }
  `;
  document.head.appendChild(style);
  pulseKeyframesAdded = true;
}

/**
 * 预加载特效图片
 */
export function preloadClickEffectImages(effects: ClickEffectConfig[] | undefined): void {
  if (!effects || effects.length === 0) {
    return;
  }

  effects.forEach((effect) => {
    if (effect.imageFileName && !effectImageCache.has(effect.imageFileName)) {
      const img = new Image();
      img.src = ASSET_PATH + effect.imageFileName;
      effectImageCache.set(effect.imageFileName, img);
    }
  });
}

/**
 * 从对象池获取或创建特效元素
 */
function getEffectElement(): HTMLImageElement {
  if (effectElementPool.length > 0) {
    return effectElementPool.pop()!;
  }
  return document.createElement('img');
}

/**
 * 将特效元素回收到对象池
 */
function recycleEffectElement(element: HTMLImageElement): void {
  // 清除关联的定时器（如果还有的话）
  const timers = effectElementTimers.get(element);
  if (timers) {
    if (timers.fadeOutTimer !== undefined) {
      clearTimeout(timers.fadeOutTimer);
    }
    if (timers.removeTimer !== undefined) {
      clearTimeout(timers.removeTimer);
    }
    effectElementTimers.delete(element);
  }
  
  // 重置元素状态
  element.style.opacity = '0';
  element.style.transform = '';
  element.style.left = '';
  element.style.top = '';
  element.style.animation = ''; // 清除动画
  element.style.transition = ''; // 清除过渡
  element.style.willChange = ''; // 清除 willChange
  element.src = '';
  
  // 如果对象池未满，回收元素
  if (effectElementPool.length < MAX_POOL_SIZE) {
    effectElementPool.push(element);
  } else {
    // 对象池已满，直接移除
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }
}

/**
 * 根据权重随机选择一个特效配置
 */
function selectEffectByWeight(effects: ClickEffectConfig[]): ClickEffectConfig | null {
  if (!effects || effects.length === 0) {
    return null;
  }

  // 计算总权重
  const totalWeight = effects.reduce((sum, effect) => sum + (effect.weight || 0), 0);
  if (totalWeight <= 0) {
    // 如果总权重为0，随机选择一个
    return effects[Math.floor(Math.random() * effects.length)];
  }

  // 生成随机数（0 到 totalWeight）
  const random = Math.random() * totalWeight;
  
  // 根据权重选择
  let currentWeight = 0;
  for (const effect of effects) {
    currentWeight += effect.weight || 0;
    if (random <= currentWeight) {
      return effect;
    }
  }

  // 兜底：返回最后一个
  return effects[effects.length - 1];
}

/**
 * 显示点击特效
 */
export function showClickEffect(
  pageX: number,
  pageY: number,
  effectConfig: ClickEffectConfig
): void {
  if (!effectConfig || !effectConfig.imageFileName) {
    return;
  }

  // 性能优化：从对象池获取元素
  const effectElement = getEffectElement();
  
  // 性能优化：使用缓存的图片（如果已预加载）
  const cachedImage = effectImageCache.get(effectConfig.imageFileName);
  if (cachedImage && cachedImage.complete) {
    effectElement.src = cachedImage.src;
  } else {
    effectElement.src = ASSET_PATH + effectConfig.imageFileName;
  }
  
  effectElement.style.position = 'fixed';
  effectElement.style.left = `${pageX}px`;
  effectElement.style.top = `${pageY}px`;
  effectElement.style.pointerEvents = 'none';
  effectElement.style.zIndex = '9999';
  effectElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
  effectElement.style.opacity = '0';
  effectElement.style.willChange = 'opacity, transform'; // 性能优化：提示浏览器优化

  // 设置缩放
  const scale = effectConfig.scale ?? 1.0;
  const baseTransform = `translate(-50%, -50%) scale(${scale})`;
  effectElement.style.transform = baseTransform;
  
  // 根据 effect 配置应用附加动画效果
  const effect = effectConfig.effect ?? 0;
  
  // 确保清除之前的动画（特别是从对象池获取的元素）
  if (effect === 0) {
    effectElement.style.animation = ''; // 明确清除动画
  }
  
  if (effect === 1) {
    // 摇晃（摇摆）效果
    ensureShakeKeyframes();
    // 创建包含 scale 的摇晃动画（如果还没有）
    // 为不同的 scale 值创建不同的 keyframes，确保缩放效果正确
    const scaleKey = scale.toString().replace('.', '-');
    const styleId = `shake-style-${scaleKey}`;
    let shakeStyle = document.getElementById(styleId) as HTMLStyleElement;
    if (!shakeStyle) {
      shakeStyle = document.createElement('style');
      shakeStyle.id = styleId;
      shakeStyle.textContent = `
        @keyframes click-effect-shake-${scaleKey} {
          0%, 100% { transform: translate(-50%, -50%) rotate(0deg) scale(${scale}); }
          25% { transform: translate(-50%, -50%) rotate(-5deg) scale(${scale}); }
          75% { transform: translate(-50%, -50%) rotate(5deg) scale(${scale}); }
        }
      `;
      document.head.appendChild(shakeStyle);
    }
    effectElement.style.animation = `click-effect-shake-${scaleKey} 0.3s ease-in-out infinite`;
  } else if (effect === 2) {
    // 放大缩小效果
    ensurePulseKeyframes();
    // 创建包含 scale 的放大缩小动画（如果还没有）
    // 为不同的 scale 值创建不同的 keyframes，确保缩放效果正确
    const scaleKey = scale.toString().replace('.', '-');
    const styleId = `pulse-style-${scaleKey}`;
    let pulseStyle = document.getElementById(styleId) as HTMLStyleElement;
    if (!pulseStyle) {
      pulseStyle = document.createElement('style');
      pulseStyle.id = styleId;
      pulseStyle.textContent = `
        @keyframes click-effect-pulse-${scaleKey} {
          0%, 100% { transform: translate(-50%, -50%) scale(${scale}); }
          50% { transform: translate(-50%, -50%) scale(${scale * 1.15}); }
        }
      `;
      document.head.appendChild(pulseStyle);
    }
    effectElement.style.animation = `click-effect-pulse-${scaleKey} 0.6s ease-in-out infinite`;
  }

  // 添加到页面
  document.body.appendChild(effectElement);

  // 跟踪活跃特效（用于条件触发）
  const imageFileName = effectConfig.imageFileName;
  if (!activeEffectElements.has(imageFileName)) {
    activeEffectElements.set(imageFileName, new Set());
  }
  activeEffectElements.get(imageFileName)!.add(effectElement);

  // 触发显示动画
  requestAnimationFrame(() => {
    effectElement.style.opacity = '1';
    // 如果启用了附加动画效果（effect !== 0），保持动画；否则更新 transform
    if (effect === 0) {
      effectElement.style.transform = `translate(-50%, -50%) scale(${scale * 1.2})`;
    }
  });

  // 设置持续时间并移除
  const duration = effectConfig.duration ?? 500;
  const fadeOutTimer = window.setTimeout(() => {
    // 检查元素是否还在活跃列表中（可能已被 clearAllClickEffects 清除）
    const activeSet = activeEffectElements.get(imageFileName);
    if (!activeSet || !activeSet.has(effectElement)) {
      // 元素已被清除，不再处理
      effectElementTimers.delete(effectElement);
      return;
    }

    effectElement.style.opacity = '0';
    // 停止附加动画效果
    if (effect !== 0) {
      effectElement.style.animation = '';
    }
    effectElement.style.transform = `translate(-50%, -50%) scale(${scale * 0.8})`;
    
    const removeTimer = window.setTimeout(() => {
      // 再次检查元素是否还在活跃列表中
      const activeSet = activeEffectElements.get(imageFileName);
      if (!activeSet || !activeSet.has(effectElement)) {
        // 元素已被清除，不再处理
        effectElementTimers.delete(effectElement);
        return;
      }

      // 从活跃特效中移除
      if (activeSet) {
        activeSet.delete(effectElement);
        if (activeSet.size === 0) {
          activeEffectElements.delete(imageFileName);
        }
      }
      
      // 清除定时器记录
      effectElementTimers.delete(effectElement);
      
      // 触发完成计数回调（特效消失时计数）
      if (clickEffectCompleteCallback) {
        clickEffectCompleteCallback(imageFileName);
      }
      
      // 性能优化：回收到对象池而不是直接移除
      recycleEffectElement(effectElement);
    }, 300); // 等待淡出动画完成

    // 更新定时器记录
    const timers = effectElementTimers.get(effectElement);
    if (timers) {
      timers.removeTimer = removeTimer;
    }
  }, duration);

  // 记录定时器
  effectElementTimers.set(effectElement, { fadeOutTimer });
}

/**
 * 处理点击事件并显示特效
 */
export function handleClickEffect(
  pageX: number,
  pageY: number,
  effects: ClickEffectConfig[] | undefined
): void {
  if (!effects || effects.length === 0) {
    return;
  }

  // 根据权重选择特效
  const selectedEffect = selectEffectByWeight(effects);
  if (selectedEffect) {
    showClickEffect(pageX, pageY, selectedEffect);
  }
}

/**
 * 检查指定的点击特效是否都存在于页面上（还未消失）
 * @param imageFileNames 要检查的特效图片文件名数组
 * @returns 如果所有特效都存在且未消失，返回 true
 */
export function areClickEffectsActive(imageFileNames: string[]): boolean {
  if (!imageFileNames || imageFileNames.length === 0) {
    return false;
  }

  // 检查每个特效是否都有至少一个活跃的元素
  for (const imageFileName of imageFileNames) {
    const activeSet = activeEffectElements.get(imageFileName);
    if (!activeSet || activeSet.size === 0) {
      return false;
    }
    
    // 进一步检查：元素是否还在 DOM 中且可见（opacity > 0）
    let hasVisibleElement = false;
    for (const element of activeSet) {
      if (element.parentNode && element.parentNode === document.body) {
        const opacity = parseFloat(getComputedStyle(element).opacity);
        if (opacity > 0) {
          hasVisibleElement = true;
          break;
        }
      }
    }
    
    if (!hasVisibleElement) {
      return false;
    }
  }

  return true;
}

/**
 * 检查指定的特效图片是否严格等于对应的个数
 * @param countConfigs 配置数组，每个配置项包含特效图片文件名和需要严格等于的个数
 * @returns 如果所有特效图片的数量都严格等于配置的个数，返回 true（大于或小于都不触发）
 */
export function areClickEffectsCountReached(
  countConfigs: Array<{ imageFileName: string; count: number }>
): boolean {
  if (!countConfigs || countConfigs.length === 0) {
    return false;
  }

  // 检查每个特效是否都严格等于配置的个数
  for (const config of countConfigs) {
    const activeSet = activeEffectElements.get(config.imageFileName);
    if (!activeSet) {
      return false;
    }
    
    // 统计可见的元素数量
    let visibleCount = 0;
    for (const element of activeSet) {
      if (element.parentNode && element.parentNode === document.body) {
        const opacity = parseFloat(getComputedStyle(element).opacity);
        if (opacity > 0) {
          visibleCount++;
        }
      }
    }
    
    // 如果当前特效的数量不等于配置的个数，返回 false（严格相等）
    if (visibleCount !== config.count) {
      return false;
    }
  }
  
  return true;
}

/**
 * 设置点击特效完成计数回调
 * @param callback 回调函数，当点击特效消失时调用，参数为特效图片文件名
 */
export function setClickEffectCompleteCallback(callback: ClickEffectCompleteCallback | null): void {
  clickEffectCompleteCallback = callback;
}

/**
 * 清除所有当前活跃的点击特效
 */
export function clearAllClickEffects(): void {
  // 遍历所有活跃的特效元素
  for (const [imageFileName, activeSet] of activeEffectElements.entries()) {
    for (const element of activeSet) {
      // 清除关联的定时器
      const timers = effectElementTimers.get(element);
      if (timers) {
        if (timers.fadeOutTimer !== undefined) {
          clearTimeout(timers.fadeOutTimer);
        }
        if (timers.removeTimer !== undefined) {
          clearTimeout(timers.removeTimer);
        }
        effectElementTimers.delete(element);
      }
      
      // 立即停止所有动画和过渡
      element.style.animation = '';
      element.style.transition = '';
      
      // 立即移除元素（不等待动画完成）
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      
      // 重置元素状态
      element.style.opacity = '0';
      element.style.transform = '';
      element.style.left = '';
      element.style.top = '';
      element.style.willChange = '';
      element.src = '';
      
      // 回收到对象池（如果对象池未满）
      if (effectElementPool.length < MAX_POOL_SIZE) {
        effectElementPool.push(element);
      }
    }
    activeSet.clear();
  }
  
  // 清空所有跟踪记录
  activeEffectElements.clear();
}
