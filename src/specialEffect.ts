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

import { SpecialEffectDefinition } from './config.type';
import { ASSET_PATH } from './constants';
import { SpineAnimator } from './animator';
import { clearAllClickEffects } from './clickEffect';

// 特殊特效完成计数回调（当特效和语音都播放完时调用）
// 参数：特效索引数组（实际播放的特效索引）
type SpecialEffectCompleteCallback = (effectIndices: number[]) => void;
let specialEffectCompleteCallback: SpecialEffectCompleteCallback | null = null;

/**
 * 设置特殊特效完成计数回调
 * @param callback 回调函数，当特殊特效播放完（包括语音播放完）时调用，参数为实际播放的特效索引数组
 */
export function setSpecialEffectCompleteCallback(callback: SpecialEffectCompleteCallback | null): void {
  specialEffectCompleteCallback = callback;
}

/**
 * 播放单个特殊特效（三图片特效）
 * @param definition 特效定义
 * @param spineAnimator Spine 动画控制器
 * @returns 返回音频元素（如果有）和特效总时长（毫秒）
 */
export function playSingleSpecialEffect(
  definition: SpecialEffectDefinition,
  spineAnimator: SpineAnimator | null = null
): { audioElement: HTMLAudioElement | null; totalDuration: number } {
  // 处理 type 5 特效：插槽随机隐藏显示切换特效（不需要 image1FileName）
  if (definition.type === 5) {
    return playType5Effect(definition, spineAnimator);
  }

  // 处理 type 3 特效：从右侧进入靠右显示，停留后放大渐隐
  if (definition.type === 3) {
    return playType3Effect(definition, spineAnimator);
  }

  // 处理 type 4 特效：效果等同于特效2的第二张图片相关
  if (definition.type === 4) {
    return playType4Effect(definition, spineAnimator);
  }

  // 其他类型需要 image1FileName
  if (!definition?.image1FileName) {
    return { audioElement: null, totalDuration: 0 };
  }

  const image1Duration = definition.image1Duration ?? 500;
  const image1Scale = definition.image1Scale ?? 0.8;
  const fadeOutDuration = definition.fadeOutDuration ?? 500;
  
  // 根据 type 字段判断特效类型，如果没有 type 字段则使用旧的逻辑（向后兼容）
  // 使用类型守卫来安全访问可能不存在的属性
  const isSimpleEffect = definition.type === 1 || (definition.type === undefined && !('image2FileName' in definition && (definition as any).image2FileName) && !('image3FileName' in definition && (definition as any).image3FileName));
  const hasImage2 = definition.type === 2 ? true : (definition.type === undefined ? !!('image2FileName' in definition && (definition as any).image2FileName) : false);
  const hasImage3 = definition.type === 2 ? true : (definition.type === undefined ? !!('image3FileName' in definition && (definition as any).image3FileName) : false);

  // 计算特效总时长
  let totalDuration: number;
  if (isSimpleEffect) {
    // 只有 image1：显示时间 + 淡出时间
    totalDuration = image1Duration + fadeOutDuration;
  } else {
    // 有三张图片：显示时间 + 过渡时间 + 缩放时间 + 淡出时间
    const scaleDuration = definition.scaleDuration ?? 800;
    totalDuration = image1Duration + 100 + scaleDuration + fadeOutDuration;
  }

  let audioElement: HTMLAudioElement | null = null;

  // 播放语音（如果配置了）
  if (definition.audioFileName) {
    audioElement = new Audio(ASSET_PATH + definition.audioFileName);
    audioElement.preload = 'auto';
    audioElement.volume = 1.0;
    
    // 添加错误处理
    audioElement.addEventListener('error', (e) => {
      console.error(`Failed to load special effect audio: ${ASSET_PATH + definition.audioFileName}`, e);
    });
    
    // 播放语音（不等待加载完成，让浏览器自动处理）
    // 语音会一直播放到结束，不会在特效结束时停止
    audioElement.play().catch((error) => {
      console.warn('Special effect audio autoplay blocked:', error);
    });
  }

  // 播放 Spine 动画（如果配置了）
  if (definition.animationName && spineAnimator && spineAnimator.skeletonMesh) {
    // 立即停止当前动画并播放指定动画（播放一次，不循环）
    spineAnimator.skeletonMesh.state.setAnimation(0, definition.animationName, false);
    console.log(`Special effect animation triggered: ${definition.animationName}`);
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
  image1.src = ASSET_PATH + definition.image1FileName;
  image1.style.position = 'absolute';
  image1.style.left = '50%';
  image1.style.top = '50%';
  image1.style.transform = `translate(-50%, -50%) scale(${image1Scale})`;
  image1.style.opacity = '0';
  if (isSimpleEffect) {
    // 简单特效：淡入和淡出使用相同的 transition
    image1.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
  } else {
    // 复杂特效：初始淡入使用短 transition
    image1.style.transition = 'opacity 0.1s ease-out';
  }
  image1.style.willChange = 'opacity';

  container.appendChild(image1);
  
  // 如果有 image2 和 image3，创建它们
  let image2: HTMLImageElement | null = null;
  let image3: HTMLImageElement | null = null;
  
  if (!isSimpleEffect) {
    const scaleDuration = definition.scaleDuration ?? 800;
    const image2InitialScale = definition.image2InitialScale ?? 2.0;
    const image2FinalScale = definition.image2FinalScale ?? 0.45;
    const image3InitialScale = definition.image3InitialScale ?? 0.5;
    const image3FinalScale = definition.image3FinalScale ?? 1.0;
    const image2AlignPercent = definition.image2AlignPercent ?? 60; // 默认50%（中心位置）

    // 第二张图片
    if (hasImage2) {
      image2 = document.createElement('img');
      image2.src = ASSET_PATH + (definition.type === 2 ? definition.image2FileName : (definition as any).image2FileName);
      image2.style.position = 'absolute';
      image2.style.left = '50%';
      image2.style.transform = `translateX(-50%) scale(${image2InitialScale})`;
      image2.style.opacity = '0';
      image2.style.transition = '';
      image2.style.willChange = 'opacity, transform';
      image2.style.zIndex = '2';
      container.appendChild(image2);
    }

    // 第三张图片
    if (hasImage3) {
      image3 = document.createElement('img');
      image3.src = ASSET_PATH + (definition.type === 2 ? definition.image3FileName : (definition as any).image3FileName);
      image3.style.position = 'absolute';
      image3.style.left = '50%';
      image3.style.top = '50%';
      image3.style.transform = `translate(-50%, -50%) scale(${image3InitialScale})`;
      image3.style.opacity = '0';
      image3.style.transition = '';
      image3.style.willChange = 'opacity, transform';
      image3.style.zIndex = '1';
      container.appendChild(image3);
    }
  }

  document.body.appendChild(container);

  // 等待第一张图片加载完成
  const waitForImage1 = () => {
    if (image1.complete) {
      startEffect();
    } else {
      image1.addEventListener('load', startEffect, { once: true });
      image1.addEventListener('error', () => {
        console.error(`Failed to load image: ${definition.image1FileName}`);
        container.remove();
      }, { once: true });
    }
  };

  const startEffect = () => {
    // 显示第一张图片
    requestAnimationFrame(() => {
      image1.style.opacity = '1';
    });

    if (isSimpleEffect) {
      // 简单特效：只显示 image1，然后淡出
      setTimeout(() => {
        // 更新 transition 以确保淡出动画正确
        image1.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        image1.style.opacity = '0';
        
        // 等待淡出完成后移除
        setTimeout(() => {
          container.remove();
        }, fadeOutDuration);
      }, image1Duration);
    } else {
      // 复杂特效：第一张图片显示后消失，转为第二、三张图片
      const scaleDuration = definition.scaleDuration ?? 800;
      const image2InitialScale = definition.image2InitialScale ?? 2.0;
      const image2FinalScale = definition.image2FinalScale ?? 0.45;
      const image3InitialScale = definition.image3InitialScale ?? 0.5;
      const image3FinalScale = definition.image3FinalScale ?? 1.0;
      const image2AlignPercent = definition.image2AlignPercent ?? 60;

      setTimeout(() => {
        // 第一张图片直接消失
        image1.style.opacity = '0';

        // 等待第一张图片淡出完成
        setTimeout(() => {
          image1.remove();

          // 获取第三张图片的实际尺寸（用于对齐计算）
          const waitForImage3 = () => {
            if (image3 && image3.complete && image3.naturalHeight > 0) {
              setupImages2And3();
            } else if (image3) {
              image3.addEventListener('load', setupImages2And3, { once: true });
              image3.addEventListener('error', () => {
                console.error(`Failed to load image: ${definition.type === 2 ? definition.image3FileName : (definition as any).image3FileName}`);
                container.remove();
              }, { once: true });
            } else {
              // 如果没有 image3，直接设置 image2
              if (image2) {
                setupImage2Only();
              } else {
                container.remove();
              }
            }
          };

          const setupImage2Only = () => {
            if (!image2) return;
            
            const waitForImage2 = () => {
              if (image2!.complete && image2!.naturalHeight > 0) {
                image2!.style.top = '50%';
                image2!.style.transformOrigin = 'center center';
                
                requestAnimationFrame(() => {
                  image2!.style.opacity = '1';
                  
                  requestAnimationFrame(() => {
                    image2!.style.transition = `transform ${scaleDuration}ms ease-out, opacity ${fadeOutDuration}ms ease-out`;
                    
                    requestAnimationFrame(() => {
                      image2!.style.transform = `translate(-50%, -50%) scale(${image2FinalScale})`;
                    });
                  });
                });
              } else {
                image2!.addEventListener('load', waitForImage2, { once: true });
                image2!.addEventListener('error', () => {
                  console.error(`Failed to load image: ${definition.type === 2 ? definition.image2FileName : (definition as any).image2FileName}`);
                  container.remove();
                }, { once: true });
              }
            };
            
            waitForImage2();
          };

          const setupImages2And3 = () => {
            if (!image2 || !image3) {
              if (image2) setupImage2Only();
              return;
            }

            // 等待第二张图片加载
            const waitForImage2 = () => {
              if (image2!.complete && image2!.naturalHeight > 0 && image3!.complete && image3!.naturalHeight > 0) {
                const image2Height = image2!.naturalHeight;
                const image3Height = image3!.naturalHeight;
                
                // 使用calc计算对齐位置
                const alignOffset = image3Height * (image2AlignPercent / 100 - 0.5);
                image2!.style.top = `calc(50% + ${alignOffset}px - ${image2Height}px)`;
                image2!.style.transformOrigin = 'center bottom';
                
                // 第三张图片保持居中
                image3!.style.top = '50%';
                image3!.style.transformOrigin = 'center center';
                
                // 显示第二、三张图片并开始动画
                requestAnimationFrame(() => {
                  image2!.style.opacity = '1';
                  image3!.style.opacity = '1';
                  
                  requestAnimationFrame(() => {
                    image2!.style.transition = `transform ${scaleDuration}ms ease-out, opacity ${fadeOutDuration}ms ease-out`;
                    image3!.style.transition = `transform ${scaleDuration}ms ease-out, opacity ${fadeOutDuration}ms ease-out`;
                    
                    requestAnimationFrame(() => {
                      image2!.style.transform = `translateX(-50%) scale(${image2FinalScale})`;
                      image3!.style.transform = `translate(-50%, -50%) scale(${image3FinalScale})`;
                    });
                  });
                });
              } else {
                image2!.addEventListener('load', waitForImage2, { once: true });
                image2!.addEventListener('error', () => {
                  console.error(`Failed to load image: ${definition.type === 2 ? definition.image2FileName : (definition as any).image2FileName}`);
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
        if (image2) image2.style.opacity = '0';
        if (image3) image3.style.opacity = '0';
        
        // 等待渐隐完成后移除
        setTimeout(() => {
          container.remove();
        }, fadeOutDuration);
      }, image1Duration + 100 + (definition.scaleDuration ?? 800));
    }
  };

  waitForImage1();

  return { audioElement, totalDuration };
}

/**
 * 按序播放多个特殊特效
 * @param definitions 特效定义数组
 * @param spineAnimator Spine 动画控制器
 * @param effectIndices 可选：实际播放的特效索引数组（用于计数回调）
 */
export function playSpecialEffectsSequence(
  definitions: SpecialEffectDefinition[],
  spineAnimator: SpineAnimator | null = null,
  effectIndices?: number[]
): void {
  if (!definitions || definitions.length === 0) {
    return;
  }

  let currentIndex = 0;
  // 存储所有音频元素，用于等待所有语音播放完
  const audioElements: HTMLAudioElement[] = [];

  const playNext = () => {
    if (currentIndex >= definitions.length) {
      // 所有特效播放完毕，等待所有语音播放完
      if (audioElements.length > 0) {
        // 等待所有音频播放完
        let completedCount = 0;
        const totalAudioCount = audioElements.length;
        
        const checkAllAudioComplete = () => {
          completedCount++;
          if (completedCount >= totalAudioCount) {
            // 所有语音都播放完了，触发完成回调
            if (specialEffectCompleteCallback && effectIndices) {
              specialEffectCompleteCallback(effectIndices);
            }
          }
        };
        
        // 为每个音频元素添加完成监听
        audioElements.forEach(audioElement => {
          if (audioElement.ended) {
            // 音频已经播放完
            checkAllAudioComplete();
          } else {
            // 监听音频播放完成
            const handleAudioEnd = () => {
              audioElement.removeEventListener('ended', handleAudioEnd);
              audioElement.removeEventListener('error', handleAudioError);
              checkAllAudioComplete();
            };
            
            const handleAudioError = () => {
              audioElement.removeEventListener('ended', handleAudioEnd);
              audioElement.removeEventListener('error', handleAudioError);
              checkAllAudioComplete();
            };
            
            audioElement.addEventListener('ended', handleAudioEnd, { once: true });
            audioElement.addEventListener('error', handleAudioError, { once: true });
          }
        });
      } else {
        // 没有语音，直接触发完成回调
        if (specialEffectCompleteCallback && effectIndices) {
          specialEffectCompleteCallback(effectIndices);
        }
      }
      return;
    }

    const definition = definitions[currentIndex];
    const { audioElement, totalDuration } = playSingleSpecialEffect(definition, spineAnimator);
    
    // 如果有音频，添加到数组中
    if (audioElement) {
      audioElements.push(audioElement);
    }

    currentIndex++;

    // 决定下一个特效的触发时机
    if (audioElement) {
      // 如果有语音，等待语音播放结束
      let audioHandled = false;
      
      const handleAudioEnd = () => {
        if (audioHandled) return;
        audioHandled = true;
        audioElement.removeEventListener('ended', handleAudioEnd);
        audioElement.removeEventListener('error', handleAudioError);
        playNext();
      };
      
      const handleAudioError = () => {
        if (audioHandled) return;
        audioHandled = true;
        audioElement.removeEventListener('ended', handleAudioEnd);
        audioElement.removeEventListener('error', handleAudioError);
        // 如果音频加载失败或无法播放，使用特效时长作为后备
        setTimeout(playNext, totalDuration);
      };
      
      // 检查音频是否已经可以播放
      if (audioElement.readyState >= 2) {
        // 音频已经加载，可以监听 ended 事件
        audioElement.addEventListener('ended', handleAudioEnd, { once: true });
        audioElement.addEventListener('error', handleAudioError, { once: true });
        
        // 如果音频已经播放完毕（可能发生在快速连续触发时）
        if (audioElement.ended) {
          handleAudioEnd();
        }
      } else {
        // 音频还在加载，等待加载完成后再监听
        const handleCanPlay = () => {
          audioElement.removeEventListener('canplay', handleCanPlay);
          audioElement.addEventListener('ended', handleAudioEnd, { once: true });
          audioElement.addEventListener('error', handleAudioError, { once: true });
        };
        audioElement.addEventListener('canplay', handleCanPlay, { once: true });
        audioElement.addEventListener('error', handleAudioError, { once: true });
      }
    } else {
      // 没有语音，等待当前特效结束后触发下一个
      setTimeout(playNext, totalDuration);
    }
  };

  playNext();
}

/**
 * 播放 type 3 特效：从右侧进入靠右显示，停留后放大渐隐
 * @param definition 特效定义（type 3）
 * @param spineAnimator Spine 动画控制器
 * @returns 返回音频元素（如果有）和特效总时长（毫秒）
 */
function playType3Effect(
  definition: Extract<SpecialEffectDefinition, { type: 3 }>,
  spineAnimator: SpineAnimator | null = null
): { audioElement: HTMLAudioElement | null; totalDuration: number } {
  const initialScale = definition.initialScale ?? 1.0;
  const finalScale = definition.finalScale ?? 1.5;
  const enterDuration = definition.enterDuration ?? 300;
  const stayDuration = definition.stayDuration ?? 800;
  const fadeOutDuration = definition.fadeOutDuration ?? 500;
  const displayWidthRatio = definition.displayWidthRatio ?? 1.0;

  const totalDuration = enterDuration + stayDuration + fadeOutDuration;

  let audioElement: HTMLAudioElement | null = null;

  if (definition.audioFileName) {
    audioElement = new Audio(ASSET_PATH + definition.audioFileName);
    audioElement.preload = 'auto';
    audioElement.volume = 1.0;
    audioElement.play().catch(() => {});
  }

  if (definition.animationName && spineAnimator?.skeletonMesh) {
    spineAnimator.skeletonMesh.state.setAnimation(
      0,
      definition.animationName,
      false
    );
  }

  /** ---------------- 容器 ---------------- */
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '50%';
  container.style.right = '0';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.pointerEvents = 'none';
  container.style.zIndex = '10000';
  container.style.transform = 'translateY(-50%) translateX(100%)';
  container.style.willChange = 'transform, opacity';

  /** ---------------- 图片 ---------------- */
  const image = document.createElement('img');
  image.src = ASSET_PATH + definition.image1FileName;
  image.style.position = 'absolute';
  image.style.right = '0';
  image.style.top = '50%';
  image.style.opacity = '0';
  image.style.margin = '0';
  image.style.padding = '0';
  image.style.willChange = 'opacity, transform, width, height';

  /** 🔴 关键：缩放锚点固定在右侧 */
  image.style.transformOrigin = 'right center';

  /** ---------- 裁剪模式 ---------- */
  if (displayWidthRatio < 1.0) {
    const setup = () => {
      if (!image.naturalWidth) return;

      image.style.objectFit = 'none';
      image.style.objectPosition = 'left center';

      const w = image.naturalWidth * displayWidthRatio * initialScale;
      const h = image.naturalHeight * initialScale;

      image.style.width = `${w}px`;
      image.style.height = `${h}px`;
      image.style.transform = 'translateY(-50%)';
    };

    image.complete ? setup() : image.addEventListener('load', setup, { once: true });
  } 
  /** ---------- 完整显示（scale） ---------- */
  else {
    image.style.transform = `translateY(-50%) scale(${initialScale})`;
  }

  container.appendChild(image);
  document.body.appendChild(container);

  /** ---------------- 动画 ---------------- */
  const startEffect = () => {
    requestAnimationFrame(() => {
      container.style.transition = `transform ${enterDuration}ms ease-out`;
      container.style.transform = 'translateY(-50%) translateX(0)';

      if (displayWidthRatio < 1.0) {
        image.style.transition = `opacity ${enterDuration}ms ease-out`;
        image.style.opacity = '1';
      } else {
        image.style.transition = `opacity ${enterDuration}ms ease-out, transform ${enterDuration}ms ease-out`;
        image.style.opacity = '1';
        image.style.transform = `translateY(-50%) scale(${initialScale})`;
      }
    });

    setTimeout(() => {
      requestAnimationFrame(() => {
        if (displayWidthRatio < 1.0) {
          const w = image.naturalWidth * displayWidthRatio * finalScale;
          const h = image.naturalHeight * finalScale;

          image.style.transition = `
            opacity ${fadeOutDuration}ms ease-out,
            width ${fadeOutDuration}ms ease-out,
            height ${fadeOutDuration}ms ease-out
          `;
          image.style.opacity = '0';
          image.style.width = `${w}px`;
          image.style.height = `${h}px`;
        } else {
          image.style.transition = `
            opacity ${fadeOutDuration}ms ease-out,
            transform ${fadeOutDuration}ms ease-out
          `;
          image.style.opacity = '0';
          image.style.transform = `translateY(-50%) scale(${finalScale})`;
        }
      });

      setTimeout(() => container.remove(), fadeOutDuration);
    }, enterDuration + stayDuration);
  };

  image.complete
    ? startEffect()
    : image.addEventListener('load', startEffect, { once: true });

  return { audioElement, totalDuration };
}

/**
 * 播放 type 4 特效：效果等同于特效2的第二张图片相关
 * @param definition 特效定义（type 4）
 * @param spineAnimator Spine 动画控制器
 * @returns 返回音频元素（如果有）和特效总时长（毫秒）
 */
function playType4Effect(
  definition: Extract<SpecialEffectDefinition, { type: 4 }>,
  spineAnimator: SpineAnimator | null = null
): { audioElement: HTMLAudioElement | null; totalDuration: number } {
  const initialScale = definition.initialScale ?? 2.0;
  const finalScale = definition.finalScale ?? 1.0;
  const scaleDuration = definition.scaleDuration ?? 300;
  const fadeOutDuration = definition.fadeOutDuration ?? 500;
  const alignPercent = definition.alignPercent ?? 50;

  // 计算特效总时长：缩放时间 + 渐隐时间
  const totalDuration = scaleDuration + fadeOutDuration;

  let audioElement: HTMLAudioElement | null = null;

  // 播放语音（如果配置了）
  if (definition.audioFileName) {
    audioElement = new Audio(ASSET_PATH + definition.audioFileName);
    audioElement.preload = 'auto';
    audioElement.volume = 1.0;
    
    audioElement.addEventListener('error', (e) => {
      console.error(`Failed to load special effect audio: ${ASSET_PATH + definition.audioFileName}`, e);
    });
    
    audioElement.play().catch((error) => {
      console.warn('Special effect audio autoplay blocked:', error);
    });
  }

  // 播放 Spine 动画（如果配置了）
  if (definition.animationName && spineAnimator && spineAnimator.skeletonMesh) {
    spineAnimator.skeletonMesh.state.setAnimation(0, definition.animationName, false);
    console.log(`Special effect animation triggered: ${definition.animationName}`);
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

  // 创建图片
  const image = document.createElement('img');
  image.src = ASSET_PATH + definition.image1FileName;
  image.style.position = 'absolute';
  image.style.left = '50%';
  image.style.transform = `translateX(-50%) scale(${initialScale})`;
  image.style.opacity = '0';
  image.style.transition = '';
  image.style.willChange = 'opacity, transform';

  container.appendChild(image);
  document.body.appendChild(container);

  // 等待图片加载完成
  const waitForImage = () => {
    if (image.complete && image.naturalHeight > 0) {
      // 根据 alignPercent 设置垂直位置
      if (alignPercent === 50) {
        // 居中显示
        image.style.top = '50%';
        image.style.transformOrigin = 'center center';
      } else {
        // 根据 alignPercent 计算位置（相对于容器中心）
        // alignPercent: 0 = 顶部, 50 = 中心, 100 = 底部
        const imageHeight = image.naturalHeight;
        const alignOffset = imageHeight * (alignPercent / 100 - 0.5);
        image.style.top = `calc(50% + ${alignOffset}px - ${imageHeight}px)`;
        image.style.transformOrigin = 'center bottom';
      }

      // 显示图片并开始缩放动画
      requestAnimationFrame(() => {
        image.style.opacity = '1';
        
        requestAnimationFrame(() => {
          image.style.transition = `transform ${scaleDuration}ms ease-out, opacity ${fadeOutDuration}ms ease-out`;
          
          requestAnimationFrame(() => {
            if (alignPercent === 50) {
              image.style.transform = `translate(-50%, -50%) scale(${finalScale})`;
            } else {
              image.style.transform = `translateX(-50%) scale(${finalScale})`;
            }
          });
        });
      });
    } else {
      image.addEventListener('load', waitForImage, { once: true });
      image.addEventListener('error', () => {
        console.error(`Failed to load image: ${definition.image1FileName}`);
        container.remove();
      }, { once: true });
    }
  };

  waitForImage();

  // 缩放动画完成后渐隐消失
  setTimeout(() => {
    image.style.opacity = '0';
    
    // 等待渐隐完成后移除
    setTimeout(() => {
      container.remove();
    }, fadeOutDuration);
  }, scaleDuration);

  return { audioElement, totalDuration };
}

/**
 * 播放 type 5 特效：插槽随机隐藏显示切换特效
 * @param definition 特效定义（type 5）
 * @param spineAnimator Spine 动画控制器
 * @returns 返回音频元素（如果有）和特效总时长（毫秒）
 */
function playType5Effect(
  definition: Extract<SpecialEffectDefinition, { type: 5 }>,
  spineAnimator: SpineAnimator | null = null
): { audioElement: HTMLAudioElement | null; totalDuration: number } {
  const duration = definition.duration;
  const toggleIntervalRange = definition.toggleIntervalRange;
  const showDelayRange = definition.showDelayRange;

  // 处理插槽名称：判断是一维数组还是二维数组
  let slotGroups: string[][];
  if (typeof definition.slotNames === 'string') {
    // 单个插槽
    slotGroups = [[definition.slotNames]];
  } else if (Array.isArray(definition.slotNames) && definition.slotNames.length > 0) {
    // 判断是二维数组还是一维数组
    const isTwoDimensional = Array.isArray(definition.slotNames[0]);
    if (isTwoDimensional) {
      // 二维数组：每个一维数组是一组插槽
      slotGroups = definition.slotNames as string[][];
    } else {
      // 一维数组：每个插槽独立成组
      slotGroups = (definition.slotNames as string[]).map(slot => [slot]);
    }
  } else {
    console.warn('Invalid slotNames configuration for type 5 effect');
    return { audioElement: null, totalDuration: duration };
  }

  // 如果没有插槽控制器，无法执行
  if (!spineAnimator || !spineAnimator.slotController) {
    console.warn('SpineAnimator or slotController not available for type 5 effect');
    return { audioElement: null, totalDuration: duration };
  }

  let audioElement: HTMLAudioElement | null = null;

  // 处理语音播放（如果配置了）
  if (definition.audioFileName) {
    // 随机选择一个语音文件
    const audioFileNames = Array.isArray(definition.audioFileName)
      ? definition.audioFileName
      : [definition.audioFileName];
    
    if (audioFileNames.length > 0) {
      const selectedAudioFileName = audioFileNames[Math.floor(Math.random() * audioFileNames.length)];
      
      audioElement = new Audio(ASSET_PATH + selectedAudioFileName);
      audioElement.preload = 'auto';
      audioElement.volume = 1.0;
      
      audioElement.addEventListener('error', (e) => {
        console.error(`Failed to load special effect audio: ${ASSET_PATH + selectedAudioFileName}`, e);
      });
      
      // 在随机时间播放语音（在持续时间内随机）
      const audioPlayDelay = Math.random() * duration;
      setTimeout(() => {
        if (audioElement) {
          audioElement.play().catch((error) => {
            console.warn('Special effect audio autoplay blocked:', error);
          });
        }
      }, audioPlayDelay);
    }
  }

  // 播放 Spine 动画（如果配置了）
  if (definition.animationName && spineAnimator && spineAnimator.skeletonMesh) {
    spineAnimator.skeletonMesh.state.setAnimation(0, definition.animationName, false);
    console.log(`Special effect animation triggered: ${definition.animationName}`);
  }

  // 存储所有活动的计时器
  const activeTimers: Set<number> = new Set();
  let isEffectActive = true; // 标记特效是否还在活动状态

  // 随机数生成辅助函数
  const randomInRange = (min: number, max: number): number => {
    return Math.random() * (max - min) + min;
  };

  // 切换插槽组状态的函数（支持一组插槽一起切换）
  const toggleSlotGroup = (slotGroup: string[]) => {
    if (!spineAnimator || !spineAnimator.slotController) {
      return;
    }

    // 检查组内第一个插槽的状态（假设组内所有插槽状态一致）
    const firstSlotName = slotGroup[0];
    if (!firstSlotName) return;
    
    const isHidden = spineAnimator.slotController.isSlotHidden(firstSlotName);
    
    if (isHidden) {
      // 当前是隐藏状态，切换到显示（组内所有插槽一起显示）
      slotGroup.forEach(slotName => {
        spineAnimator.slotController.showSlot(slotName);
      });
      
      // 只有在特效还在活动状态时，才安排下一次切换（隐藏）
      if (isEffectActive) {
        const nextToggleDelay = randomInRange(toggleIntervalRange[0], toggleIntervalRange[1]);
        const timer = window.setTimeout(() => {
          activeTimers.delete(timer);
          toggleSlotGroup(slotGroup);
        }, nextToggleDelay);
        activeTimers.add(timer);
      }
      // 如果特效已结束，不再安排新的切换，插槽保持显示状态
    } else {
      // 当前是显示状态
      // 只有在特效还在活动状态时，才允许切换到隐藏
      if (!isEffectActive) {
        // 特效已结束，不允许隐藏，保持显示状态
        return;
      }
      
      // 切换到隐藏（组内所有插槽一起隐藏）
      slotGroup.forEach(slotName => {
        spineAnimator.slotController.hideSlot(slotName);
      });
      
      // 从隐藏到显示的延迟
      const showDelay = randomInRange(showDelayRange[0], showDelayRange[1]);
      const timer = window.setTimeout(() => {
        activeTimers.delete(timer);
        toggleSlotGroup(slotGroup);
      }, showDelay);
      activeTimers.add(timer);
    }
  };

  // 为每个插槽组启动第一次切换
  slotGroups.forEach(slotGroup => {
    // 初始状态：随机决定是隐藏还是显示
    const startHidden = Math.random() < 0.5;
    
    if (startHidden) {
      // 组内所有插槽一起隐藏
      slotGroup.forEach(slotName => {
        spineAnimator.slotController.hideSlot(slotName);
      });
      // 从隐藏到显示的延迟
      const showDelay = randomInRange(showDelayRange[0], showDelayRange[1]);
      const timer = window.setTimeout(() => {
        activeTimers.delete(timer);
        toggleSlotGroup(slotGroup);
      }, showDelay);
      activeTimers.add(timer);
    } else {
      // 初始显示，安排第一次隐藏
      const firstToggleDelay = randomInRange(toggleIntervalRange[0], toggleIntervalRange[1]);
      const timer = window.setTimeout(() => {
        activeTimers.delete(timer);
        toggleSlotGroup(slotGroup);
      }, firstToggleDelay);
      activeTimers.add(timer);
    }
  });

  // 持续时间结束时，停止新的切换，但保留未完成的计时器
  setTimeout(() => {
    isEffectActive = false;
    // 注意：不清理 activeTimers，让未完成的计时器继续执行
    // 这样确保所有正在进行的切换都能完成
  }, duration);

  return { audioElement, totalDuration: duration };
}



