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

import { SpecialEffectItem } from './config.type';
import { ASSET_PATH } from './constants';
import { SpineAnimator } from './animator';
import { clearAllClickEffects } from './clickEffect';

/**
 * 播放特殊特效（三图片特效）
 */
export function playSpecialEffect(item: SpecialEffectItem, spineAnimator: SpineAnimator | null = null): void {
  if (!item?.image1FileName || !item?.image2FileName || !item?.image3FileName) {
    return;
  }

  const image1Duration = item.image1Duration ?? 500;
  const image1Scale = item.image1Scale ?? 1.0;
  const scaleDuration = item.scaleDuration ?? 800;
  const fadeOutDuration = item.fadeOutDuration ?? 500;
  const image2InitialScale = item.image2InitialScale ?? 5.0;
  const image2FinalScale = item.image2FinalScale ?? 1.0;
  const image3InitialScale = item.image3InitialScale ?? 0.5;
  const image3FinalScale = item.image3FinalScale ?? 1.0;
  const image2AlignPercent = item.image2AlignPercent ?? 50; // 默认50%（中心位置）

  // 播放语音（如果配置了）
  if (item.audioFileName) {
    const audioElement = new Audio(ASSET_PATH + item.audioFileName);
    audioElement.preload = 'auto';
    audioElement.volume = 1.0;
    
    // 添加错误处理
    audioElement.addEventListener('error', (e) => {
      console.error(`Failed to load special effect audio: ${ASSET_PATH + item.audioFileName}`, e);
    });
    
    // 播放语音（不等待加载完成，让浏览器自动处理）
    // 语音会一直播放到结束，不会在特效结束时停止
    audioElement.play().catch((error) => {
      console.warn('Special effect audio autoplay blocked:', error);
    });
  }

  // 播放 Spine 动画（如果配置了）
  if (item.animationName && spineAnimator && spineAnimator.skeletonMesh) {
    // 立即停止当前动画并播放指定动画（播放一次，不循环）
    spineAnimator.skeletonMesh.state.setAnimation(0, item.animationName, false);
    console.log(`Special effect animation triggered: ${item.animationName}`);
  }

  // 如果是由点触特效触发的，清除所有在场的点触特效
  if (item.triggerEffectsWhenActive) {
    clearAllClickEffects();
  }

  // 创建容器
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '50%';
  container.style.top = '50%';
  container.style.transform = 'translate(-50%, -50%)';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '10000';
  container.style.willChange = 'opacity, transform';

  // 第一张图片
  const image1 = document.createElement('img');
  image1.src = ASSET_PATH + item.image1FileName;
  image1.style.position = 'absolute';
  image1.style.left = '50%';
  image1.style.top = '50%';
  image1.style.transform = `translate(-50%, -50%) scale(${image1Scale})`;
  image1.style.opacity = '1';
  image1.style.transition = 'opacity 0.1s ease-out';
  image1.style.willChange = 'opacity';

  // 第二张图片
  const image2 = document.createElement('img');
  image2.src = ASSET_PATH + item.image2FileName;
  image2.style.position = 'absolute';
  image2.style.left = '50%';
  image2.style.transform = `translateX(-50%) scale(${image2InitialScale})`; // 使用配置的初始缩放
  image2.style.opacity = '0';
  image2.style.transition = ''; // 初始不设置 transition，避免从默认状态过渡
  image2.style.willChange = 'opacity, transform';
  image2.style.zIndex = '2';

  // 第三张图片
  const image3 = document.createElement('img');
  image3.src = ASSET_PATH + item.image3FileName;
  image3.style.position = 'absolute';
  image3.style.left = '50%';
  image3.style.top = '50%';
  image3.style.transform = `translate(-50%, -50%) scale(${image3InitialScale})`; // 使用配置的初始缩放
  image3.style.opacity = '0';
  image3.style.transition = ''; // 初始不设置 transition，避免从默认状态过渡
  image3.style.willChange = 'opacity, transform';
  image3.style.zIndex = '1';

  container.appendChild(image1);
  container.appendChild(image2);
  container.appendChild(image3);
  document.body.appendChild(container);

  // 等待第一张图片加载完成
  const waitForImage1 = () => {
    if (image1.complete) {
      startEffect();
    } else {
      image1.addEventListener('load', startEffect, { once: true });
      image1.addEventListener('error', () => {
        console.error(`Failed to load image: ${item.image1FileName}`);
        container.remove();
      }, { once: true });
    }
  };

  const startEffect = () => {
    // 显示第一张图片
    requestAnimationFrame(() => {
      image1.style.opacity = '1';
    });

    // 第一张图片显示后消失，转为第二、三张图片
    setTimeout(() => {
      // 第一张图片直接消失
      image1.style.opacity = '0';

      // 等待第一张图片淡出完成
      setTimeout(() => {
        image1.remove();

        // 获取第三张图片的实际尺寸（用于对齐计算）
        const waitForImage3 = () => {
          if (image3.complete && image3.naturalHeight > 0) {
            setupImages2And3();
          } else {
            image3.addEventListener('load', setupImages2And3, { once: true });
            image3.addEventListener('error', () => {
              console.error(`Failed to load image: ${item.image3FileName}`);
              container.remove();
            }, { once: true });
          }
        };

        const setupImages2And3 = () => {
          // 等待第二张图片加载
          const waitForImage2 = () => {
            if (image2.complete && image2.naturalHeight > 0 && image3.complete && image3.naturalHeight > 0) {
              const image2Height = image2.naturalHeight;
              const image3Height = image3.naturalHeight;
              
              // 第三张图片居中显示（center 50%），高度为 image3Height
              // 计算第三张图片的对齐位置（从顶部算起）
              // 第三张图片中心在50%，顶部在 50% - image3Height/2
              // 对齐位置 = 50% - image3Height/2 + (image3Height * image2AlignPercent / 100)
              // 简化：对齐位置 = 50% + image3Height * (image2AlignPercent / 100 - 0.5)
              
              // 第二张图片下端要对齐到这个位置
              // 第二张图片的bottom = top + height，所以 top = bottom - height
              // bottom = 对齐位置，所以 top = 对齐位置 - image2Height
              
              // 使用calc计算
              const alignOffset = image3Height * (image2AlignPercent / 100 - 0.5);
              image2.style.top = `calc(50% + ${alignOffset}px - ${image2Height}px)`;
              image2.style.transformOrigin = 'center bottom';
              
              // 第三张图片保持居中
              image3.style.top = '50%';
              image3.style.transformOrigin = 'center center';
              
              // 显示第二、三张图片并开始动画
              requestAnimationFrame(() => {
                // 先显示图片（不添加 transition，保持初始 scale）
                image2.style.opacity = '1';
                image3.style.opacity = '1';
                
                // 在下一个 frame 中添加 transition 并开始缩放动画
                requestAnimationFrame(() => {
                  // 添加 transition
                  image2.style.transition = `transform ${scaleDuration}ms ease-out, opacity ${fadeOutDuration}ms ease-out`;
                  image3.style.transition = `transform ${scaleDuration}ms ease-out, opacity ${fadeOutDuration}ms ease-out`;
                  
                  // 在下一个 frame 中触发缩放动画
                  requestAnimationFrame(() => {
                    // 第二张图片缩放到最终大小
                    image2.style.transform = `translateX(-50%) scale(${image2FinalScale})`;
                    
                    // 第三张图片放大到最终大小
                    image3.style.transform = `translate(-50%, -50%) scale(${image3FinalScale})`;
                  });
                });
              });
            } else {
              image2.addEventListener('load', waitForImage2, { once: true });
              image2.addEventListener('error', () => {
                console.error(`Failed to load image: ${item.image2FileName}`);
                container.remove();
              }, { once: true });
            }
          };
          
          waitForImage2();
        };

        waitForImage3();
      }, 100); // 等待第一张图片淡出
    }, image1Duration);

    // 缩放动画完成后渐隐消失
    setTimeout(() => {
      image2.style.opacity = '0';
      image3.style.opacity = '0';
      
      // 等待渐隐完成后移除
      setTimeout(() => {
        container.remove();
      }, fadeOutDuration);
    }, image1Duration + 100 + scaleDuration);
  };

  waitForImage1();
}

