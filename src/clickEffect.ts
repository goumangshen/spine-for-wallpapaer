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
  // 重置元素状态
  element.style.opacity = '0';
  element.style.transform = '';
  element.style.left = '';
  element.style.top = '';
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
  effectElement.style.transform = `translate(-50%, -50%) scale(${scale})`;

  // 添加到页面
  document.body.appendChild(effectElement);

  // 触发显示动画
  requestAnimationFrame(() => {
    effectElement.style.opacity = '1';
    effectElement.style.transform = `translate(-50%, -50%) scale(${scale * 1.2})`;
  });

  // 设置持续时间并移除
  const duration = effectConfig.duration ?? 500;
  setTimeout(() => {
    effectElement.style.opacity = '0';
    effectElement.style.transform = `translate(-50%, -50%) scale(${scale * 0.8})`;
    
    setTimeout(() => {
      // 性能优化：回收到对象池而不是直接移除
      recycleEffectElement(effectElement);
    }, 300); // 等待淡出动画完成
  }, duration);
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
