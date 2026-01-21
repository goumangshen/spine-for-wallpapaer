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

import * as THREE from 'three';
import * as threejsSpine from 'threejs-spine-3.8-runtime-es6';
import { SpineAnimator } from './animator';
import { Configs, SpineMeshConfig, OverlayMediaItem, SlotHideRule, SpecialEffectDefinition, SpecialEffectTrigger } from './config.type';
import { ASSET_PATH } from './constants';
import * as Scene from './initScene';
import { switchBackgroundImage, setMeshBackgroundImage, setMeshCanvasAlignment, setMeshCanvasEdgeTransition, updateCanvasSize, getCanvasSize } from './initScene';
import { playOverlayMediaItem, setOverlayMediaEndCallback, setOverlayMediaStartCallback } from './overlayMedia';
import { handleClickEffect, preloadClickEffectImages, areClickEffectsActive, areClickEffectsCountReached, clearAllClickEffects, setClickEffectCompleteCallback } from './clickEffect';
import { playSpecialEffectsSequence, setSpecialEffectCompleteCallback } from './specialEffect';
import { initNotes, syncNotes } from './note';

const main = async () => {
  let configs: Configs = await (await fetch('./assets/config.json')).json();
  Scene.initScene(configs);
  
  // 初始化便签功能（全局配置，不与 mesh 绑定）
  initNotes(configs.notes);

  /**
   * 初始化背景音乐
   */
  let backgroundMusic: HTMLAudioElement | null = null;
  if (configs.backgroundMusic?.fileName) {
    const musicPath = ASSET_PATH + configs.backgroundMusic.fileName;
    backgroundMusic = new Audio(musicPath);
    backgroundMusic.loop = true; // 自动循环播放
    backgroundMusic.volume = configs.backgroundMusic.volume ?? 1.0; // 默认音量1.0
    
    // 添加错误处理
    backgroundMusic.addEventListener('error', (e) => {
      console.error(`Failed to load background music: ${musicPath}`, e);
      console.error(`Please check if the file exists at: ${musicPath}`);
    });
    
    // 尝试播放背景音乐（可能需要用户交互后才能播放）
    backgroundMusic.addEventListener('canplaythrough', () => {
      backgroundMusic?.play().catch((error) => {
        console.warn('Background music autoplay blocked. User interaction required.', error);
        // 如果自动播放被阻止，在用户首次交互后播放
        const playMusicOnInteraction = () => {
          backgroundMusic?.play().catch(console.error);
          document.removeEventListener('click', playMusicOnInteraction);
          document.removeEventListener('touchstart', playMusicOnInteraction);
        };
        document.addEventListener('click', playMusicOnInteraction, { once: true });
        document.addEventListener('touchstart', playMusicOnInteraction, { once: true });
      });
    });
    
    // 预加载
    backgroundMusic.preload = 'auto';
  }

  /**
   * start here
   */
  let lastFrameTime = Date.now() / 1000;
  let spineAssetManager = new threejsSpine.AssetManager(ASSET_PATH);
  const meshUpdateCallbacks: Array<(delta: number) => void> = [];
  let renderAnimationFrameId: number | null = null;
  let isRenderingPaused = false;
  
  // 条件触发的 overlayMedia 相关变量（需要在 render 函数中访问）
  let conditionalOverlayMediaItems: OverlayMediaItem[] = [];
  const triggeredConditionalVideos: Set<OverlayMediaItem> = new Set();
  
  // 条件触发的 specialEffectTriggers 相关变量（需要在 render 函数中访问）
  let conditionalSpecialEffectTriggers: SpecialEffectTrigger[] = [];
  const triggeredSpecialEffectTriggers: Set<SpecialEffectTrigger> = new Set();
  // 时间触发的触发器：记录每天已触发的日期（格式：YYYY-MM-DD）
  const timeTriggeredDates = new Map<SpecialEffectTrigger, string>();
  
  // 累计计数触发的 specialEffectTriggers 相关变量
  let totalCountSpecialEffectTriggers: SpecialEffectTrigger[] = [];
  // 累计计数器：key 为 effectIdentifier，value 为当前计数
  const totalCounters = new Map<string, number>();
  // 累计计数触发的触发器映射：key 为 effectIdentifier，value 为包含该标识符的触发器数组
  const totalCountTriggerMap = new Map<string, SpecialEffectTrigger[]>();
  
  // 当前活动的 mesh 索引和配置
  let currentActiveMeshIndex = configs.activeMeshIndex ?? 0;
  let currentActiveMeshConfig = configs.meshes?.[currentActiveMeshIndex];
  
  // Spine 动画实例
  let spineAnimatorInstance: SpineAnimator | null = null;
  
  // 点击事件处理器的清理函数
  let cleanupClickHandlers: (() => void) | null = null;
  
  // 预加载相关的变量
  let pendingMeshSwitch: { targetIndex: number; assetManager: threejsSpine.AssetManager; config: SpineMeshConfig } | null = null;
  
  // 导出函数，供 overlayMedia.ts 检查是否有待切换的mesh
  (window as any).hasPendingMeshSwitch = () => pendingMeshSwitch !== null;

  /**
   * 加载指定 mesh 的 spine 资源
   */
  const loadSpineAssets = (meshConfig: SpineMeshConfig, assetManager: threejsSpine.AssetManager) => {
    if (meshConfig.type === 'spine') {
      // load skeleton
      if (meshConfig.skeletonFileName) {
        assetManager.loadBinary(meshConfig.skeletonFileName);
      } else if (meshConfig.jsonFileName) {
        assetManager.loadText(meshConfig.jsonFileName);
      } else {
        throw 'missing skeleton file';
      }
      // load atlas
      if (meshConfig.atlasFileName) {
        assetManager.loadTextureAtlas(
          meshConfig.atlasFileName,
          // onLoad callback
          (atlas: any) => {
            // 配置纹理优化设置
            if (atlas && atlas.pages) {
              atlas.pages.forEach((page: any) => {
                if (page.texture) {
                  page.texture.encoding = THREE.LinearEncoding;
                  page.texture.generateMipmaps = false;
                  page.texture.minFilter = THREE.LinearFilter;
                  page.texture.magFilter = THREE.LinearFilter;
                  page.texture.premultipliedAlpha = false;
                }
              });
            }
          },
          // onError callback
          (path: string, error: string) => {
            console.error('Cannot load spine', path, error, meshConfig);
          }
        );
      }
    }
  };

  /**
   * 卸载当前的 spine 动画（包括从场景移除、清理资源等）
   */
  const unloadSpineAnimator = () => {
    if (spineAnimatorInstance) {
      // 从场景中移除 parentMesh（包含 skeletonMesh）
      if (spineAnimatorInstance.parentMesh && Scene.scene) {
        Scene.scene.remove(spineAnimatorInstance.parentMesh);
        // 清理 Three.js 对象
        spineAnimatorInstance.parentMesh.traverse((child) => {
          if ((child as any).geometry) {
            (child as any).geometry.dispose();
          }
          if ((child as any).material) {
            if (Array.isArray((child as any).material)) {
              (child as any).material.forEach((mat: any) => mat.dispose());
            } else {
              (child as any).material.dispose();
            }
          }
        });
      }
      spineAnimatorInstance = null;
    }
    
    // 清空更新回调
    meshUpdateCallbacks.length = 0;
    
    // 清理点击事件处理器
    if (cleanupClickHandlers) {
      cleanupClickHandlers();
      cleanupClickHandlers = null;
    }
    
    // 清理资源管理器（移除所有资源）
    if (spineAssetManager) {
      spineAssetManager.removeAll();
    }
  };

  /**
   * 初始化 spine 动画
   */
  const initializeSpineAnimator = (meshConfig: SpineMeshConfig, assetManager: threejsSpine.AssetManager) => {
    if (meshConfig.type === 'spine') {
      const spineAnimator = new SpineAnimator(meshConfig, assetManager, configs.animationMix);
      spineAnimatorInstance = spineAnimator;
      meshUpdateCallbacks.push(function (delta: number) {
        spineAnimator.update(delta);
      });
      return spineAnimator;
    }
    return null;
  };

  /**
   * 预加载指定 mesh 的资源（在视频播放时调用）
   */
  const prepareMeshSwitch = (targetMeshIndex: number) => {
    if (targetMeshIndex < 0 || targetMeshIndex >= (configs.meshes?.length ?? 0)) {
      console.error(`Cannot prepare mesh switch to index ${targetMeshIndex}: out of range`);
      return;
    }
    
    if (targetMeshIndex === currentActiveMeshIndex) {
      console.log(`Already using mesh index ${targetMeshIndex}, no need to prepare`);
      return;
    }
    
    // 如果已经有待切换的 mesh，先清理
    if (pendingMeshSwitch) {
      pendingMeshSwitch.assetManager.removeAll();
    }
    
    console.log(`Preparing mesh switch from index ${currentActiveMeshIndex} to ${targetMeshIndex}`);
    
    // 立即卸载旧的 spine 动画（在视频播放时就开始清理）
    if (renderAnimationFrameId !== null) {
      cancelAnimationFrame(renderAnimationFrameId);
      renderAnimationFrameId = null;
    }
    isRenderingPaused = true;
    unloadSpineAnimator();
    
    const targetMeshConfig = configs.meshes?.[targetMeshIndex];
    if (!targetMeshConfig) {
      console.error(`Target mesh config not found for index ${targetMeshIndex}`);
      return;
    }
    
    // 创建新的资源管理器用于预加载
    const preloadAssetManager = new threejsSpine.AssetManager(ASSET_PATH);
    
    // 加载新的 mesh 资源
    loadSpineAssets(targetMeshConfig, preloadAssetManager);
    
    // 保存预加载信息
    pendingMeshSwitch = {
      targetIndex: targetMeshIndex,
      assetManager: preloadAssetManager,
      config: targetMeshConfig
    };
  };

  /**
   * 完成 mesh 切换（在视频结束时调用）
   */
  const completeMeshSwitch = () => {
    if (!pendingMeshSwitch) {
      return; // 没有待切换的 mesh
    }
    
    const { targetIndex, assetManager, config } = pendingMeshSwitch;
    
    console.log(`Completing mesh switch to index ${targetIndex}`);
    
    // 确保渲染循环已停止（旧动画已经在视频开始时卸载了）
    if (renderAnimationFrameId !== null) {
      cancelAnimationFrame(renderAnimationFrameId);
      renderAnimationFrameId = null;
    }
    // 确保渲染状态是暂停的
    isRenderingPaused = true;
    
    // 注意：旧的 spine 动画已经在视频开始时（prepareMeshSwitch）卸载了，这里不需要重复卸载
    
    // 清空条件触发视频标记
    triggeredConditionalVideos.clear();
    // 清空条件触发特效标记
    triggeredSpecialEffectTriggers.clear();
    // 清空时间触发记录（切换 mesh 后重新开始计时）
    timeTriggeredDates.clear();
    // 重置累计计数器
    totalCounters.clear();
    
    // 使用预加载的资源管理器
    spineAssetManager = assetManager;
    
    // 更新当前活动的 mesh
    currentActiveMeshIndex = targetIndex;
    currentActiveMeshConfig = config;
    
    // 检查资源是否已加载完成
    const waitLoad = () => {
      if (spineAssetManager.isLoadingComplete()) {
        // 初始化新的 spine 动画
        const newAnimator = initializeSpineAnimator(currentActiveMeshConfig!, spineAssetManager);
        
        // 从生效的 mesh 配置中获取条件触发的 overlayMedia
        const allOverlayMediaItemsForConditional = currentActiveMeshConfig!.overlayMedia
          ? (Array.isArray(currentActiveMeshConfig!.overlayMedia)
              ? currentActiveMeshConfig!.overlayMedia.filter((it: OverlayMediaItem) => !!it?.videoFileName)
              : [currentActiveMeshConfig!.overlayMedia].filter((it: OverlayMediaItem) => !!it?.videoFileName))
          : [];
        conditionalOverlayMediaItems = allOverlayMediaItemsForConditional.filter((it: OverlayMediaItem) => 
          !!it?.triggerSlotsWhenHidden || !!it?.triggerEffectsWhenActive
        );
        
        // 从生效的 mesh 配置中获取条件触发的 specialEffectTriggers
        const allSpecialEffectTriggers = currentActiveMeshConfig!.specialEffectTriggers
          ? (Array.isArray(currentActiveMeshConfig!.specialEffectTriggers)
              ? currentActiveMeshConfig!.specialEffectTriggers
              : [currentActiveMeshConfig!.specialEffectTriggers])
          : [];
        conditionalSpecialEffectTriggers = allSpecialEffectTriggers.filter((it: SpecialEffectTrigger) => 
          !!it?.triggerSlotsWhenHidden || !!it?.triggerEffectsWhenActive || !!it?.triggerEffectsWhenCountReached || (it?.triggerAtSecondOfDay !== undefined && it.triggerAtSecondOfDay >= 0)
        );
        
        // 初始化时间触发检查：如果当前时间已经超过目标时间+60秒，标记为已触发
        const now = new Date();
        const currentSecondOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
        const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const EXPIRED_THRESHOLD = 60; // 过期阈值（秒）
        
        for (const trigger of conditionalSpecialEffectTriggers) {
          if (trigger.triggerAtSecondOfDay !== undefined && trigger.triggerAtSecondOfDay >= 0) {
            const targetSecond = Number(trigger.triggerAtSecondOfDay); // 确保是数字类型
            // 如果当前时间已经超过目标时间+60秒，标记为已触发（今天不再触发）
            if (currentSecondOfDay > targetSecond + EXPIRED_THRESHOLD) {
              timeTriggeredDates.set(trigger, todayDateStr);
            }
          }
        }
        
        // 从生效的 mesh 配置中获取累计计数触发的 specialEffectTriggers
        totalCountSpecialEffectTriggers = allSpecialEffectTriggers.filter((it: SpecialEffectTrigger) => 
          !!it?.triggerEffectsWhenTotalCountReached && it.triggerEffectsWhenTotalCountReached.length > 0
        );
        
        // 初始化累计计数器和触发器映射
        totalCounters.clear();
        totalCountTriggerMap.clear();
        for (const trigger of totalCountSpecialEffectTriggers) {
          if (trigger.triggerEffectsWhenTotalCountReached) {
            for (const config of trigger.triggerEffectsWhenTotalCountReached) {
              const identifier = config.effectIdentifier;
              // 初始化计数器
              if (!totalCounters.has(identifier)) {
                totalCounters.set(identifier, 0);
              }
              // 建立映射关系
              if (!totalCountTriggerMap.has(identifier)) {
                totalCountTriggerMap.set(identifier, []);
              }
              totalCountTriggerMap.get(identifier)!.push(trigger);
            }
          }
        }
        
        // 设置点击特效完成计数回调
        setClickEffectCompleteCallback((imageFileName: string) => {
          const identifier = imageFileName;
          const currentCount = totalCounters.get(identifier) || 0;
          totalCounters.set(identifier, currentCount + 1);
          
          // 检查是否有触发器需要检查
          const triggers = totalCountTriggerMap.get(identifier);
          if (triggers) {
            for (const trigger of triggers) {
              checkAndTriggerTotalCount(trigger);
            }
          }
        });
        
        // 设置特殊特效完成计数回调
        setSpecialEffectCompleteCallback((effectIndices: number[]) => {
          // 为每个特效索引计数
          for (const effectIndex of effectIndices) {
            const identifier = `effect:${effectIndex}`;
            const currentCount = totalCounters.get(identifier) || 0;
            totalCounters.set(identifier, currentCount + 1);
            
            // 检查是否有触发器需要检查
            const triggers = totalCountTriggerMap.get(identifier);
            if (triggers) {
              for (const trigger of triggers) {
                checkAndTriggerTotalCount(trigger);
              }
            }
          }
        });
        
        // 性能优化：预加载点击特效图片
        if (currentActiveMeshConfig!.clickEffects) {
          preloadClickEffectImages(currentActiveMeshConfig!.clickEffects);
        }
        // 预加载插槽专属点击特效图片
        if (currentActiveMeshConfig!.slotClickEffects) {
          currentActiveMeshConfig!.slotClickEffects.forEach(slotEffectConfig => {
            preloadClickEffectImages(slotEffectConfig.effects);
          });
        }
        
        // 设置canvas点击事件（从生效的 mesh 配置中读取相关配置）
        cleanupClickHandlers = setupCanvasClickHandlers(
          backgroundMusic, 
          newAnimator, 
          configs, 
          currentActiveMeshConfig!, 
          conditionalOverlayMediaItems, 
          triggeredConditionalVideos
        );
        
        // 设置 mesh 的背景图片（优先使用 mesh 配置的背景图片，否则使用全局背景图片）
        setMeshBackgroundImage(
          currentActiveMeshConfig!.backgroundImage,
          configs.backgroundImage,
          true // 使用过渡效果
        );
        
        // 设置 mesh 的 canvas 尺寸（优先使用 mesh 配置的尺寸，否则使用全局尺寸）
        const meshWidth = currentActiveMeshConfig!.width;
        const meshHeight = currentActiveMeshConfig!.height;
        const targetWidth = meshWidth !== undefined ? meshWidth : configs.width;
        const targetHeight = meshHeight !== undefined ? meshHeight : configs.height;
        updateCanvasSize(targetWidth, targetHeight);
        
        // 设置 mesh 的 canvas 对齐（优先使用 mesh 配置的对齐值，否则使用全局对齐值）
        setMeshCanvasAlignment(
          currentActiveMeshConfig!.canvasAlignLeftPercent,
          currentActiveMeshConfig!.canvasAlignRightPercent,
          configs.canvasAlignLeftPercent,
          configs.canvasAlignRightPercent
        );

        // 设置 mesh 的 canvas 边缘过渡（优先使用 mesh 配置的边缘过渡值，否则使用全局边缘过渡值）
        setMeshCanvasEdgeTransition(
          currentActiveMeshConfig!.canvasEdgeTransition,
          currentActiveMeshConfig!.canvasEdgeTransitionImage,
          currentActiveMeshConfig!.canvasEdgeBorderColor,
          configs.canvasEdgeTransition,
          configs.canvasEdgeTransitionImage,
          configs.canvasEdgeBorderColor
        );
        
        // 清除待切换标记
        pendingMeshSwitch = null;
        
        // 恢复canvas显示
        Scene.resumeCanvas();
        
        // 恢复渲染循环（现在显示的是新的动画）
        isRenderingPaused = false;
        lastFrameTime = Date.now() / 1000;
        requestAnimationFrame(render);
      } else {
        requestAnimationFrame(waitLoad);
      }
    };
    
    requestAnimationFrame(waitLoad);
  };

  // 设置视频开始回调：预加载新的 mesh 资源（如果配置了 switchToMeshIndex）
  // 注意：这个回调可能会被 setupCanvasClickHandlers 中的回调覆盖，所以需要保存引用
  const meshSwitchStartCallback = (item: OverlayMediaItem | null) => {
    // 如果配置了 switchToMeshIndex，开始预加载新的 mesh 资源
    if (item?.switchToMeshIndex !== undefined) {
      prepareMeshSwitch(item.switchToMeshIndex);
    }
  };
  (window as any).__overlayMediaStartCallback = meshSwitchStartCallback;
  setOverlayMediaStartCallback(meshSwitchStartCallback);

  /**
   * 检查累计计数是否达到阈值，如果达到则触发特效并重置计数器
   */
  const checkAndTriggerTotalCount = (trigger: SpecialEffectTrigger) => {
    if (!trigger.triggerEffectsWhenTotalCountReached || trigger.triggerEffectsWhenTotalCountReached.length === 0) {
      return;
    }
    
    // 检查所有配置的特效是否都达到对应的累计次数
    let allReached = true;
    for (const config of trigger.triggerEffectsWhenTotalCountReached) {
      const identifier = config.effectIdentifier;
      const currentCount = totalCounters.get(identifier) || 0;
      if (currentCount < config.count) {
        allReached = false;
        break;
      }
    }
    
    // 如果所有条件都满足，触发特效
    if (allReached) {
      // 重置所有相关的计数器
      for (const config of trigger.triggerEffectsWhenTotalCountReached) {
        const identifier = config.effectIdentifier;
        totalCounters.set(identifier, 0);
      }
      
      // 从特效库中获取特效定义并播放
      if (configs.specialEffectLibrary && trigger.effectIndices && trigger.effectIndices.length > 0) {
        const effectDefinitions: SpecialEffectDefinition[] = [];
        let actualEffectIndices: number[] = [];
        
        // 判断是一维数组还是二维数组
        const isTwoDimensional = trigger.effectIndices.length > 0 && Array.isArray(trigger.effectIndices[0]);
        
        if (isTwoDimensional) {
          // 二维数组模式
          const effectGroups = trigger.effectIndices as number[][];
          
          if (trigger.random) {
            // 随机模式：随机选择一个一维数组，然后按顺序播放该数组内的特效
            const randomGroup = effectGroups[Math.floor(Math.random() * effectGroups.length)];
            actualEffectIndices = randomGroup || [];
            if (randomGroup && randomGroup.length > 0) {
              for (const index of randomGroup) {
                if (index >= 0 && index < configs.specialEffectLibrary.length) {
                  effectDefinitions.push(configs.specialEffectLibrary[index]);
                } else {
                  console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                }
              }
            }
          } else {
            // 顺序模式：按一维数组顺序播放，每个一维数组内的特效按顺序播放
            for (const group of effectGroups) {
              if (group && group.length > 0) {
                actualEffectIndices = actualEffectIndices.concat(group);
                for (const index of group) {
                  if (index >= 0 && index < configs.specialEffectLibrary.length) {
                    effectDefinitions.push(configs.specialEffectLibrary[index]);
                  } else {
                    console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                  }
                }
              }
            }
          }
        } else {
          // 一维数组模式（向后兼容）
          const effectIndices = trigger.effectIndices as number[];
          actualEffectIndices = [...effectIndices];
        
          if (trigger.random) {
            // 随机选择：从 effectIndices 中随机选取一个索引
            const randomIndex = effectIndices[Math.floor(Math.random() * effectIndices.length)];
            actualEffectIndices = [randomIndex];
            if (randomIndex >= 0 && randomIndex < configs.specialEffectLibrary.length) {
              effectDefinitions.push(configs.specialEffectLibrary[randomIndex]);
            } else {
              console.warn(`Special effect index ${randomIndex} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
            }
          } else {
            // 顺序播放：遍历所有索引
            for (const index of effectIndices) {
              if (index >= 0 && index < configs.specialEffectLibrary.length) {
                effectDefinitions.push(configs.specialEffectLibrary[index]);
              } else {
                console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
              }
            }
          }
        }
        
        if (effectDefinitions.length > 0) {
          playSpecialEffectsSequence(effectDefinitions, spineAnimatorInstance, actualEffectIndices);
          console.log(`Total count special effect triggered, effects: [${actualEffectIndices.join(', ')}]`);
        }
      }
    }
  };

  // 设置视频结束回调（需要在 completeMeshSwitch 定义之后）
  setOverlayMediaEndCallback((item: OverlayMediaItem | null) => {
    if (item && triggeredConditionalVideos.has(item)) {
      triggeredConditionalVideos.delete(item);
    }
    
    // 如果配置了 switchToMeshIndex，在视频结束时完成 mesh 切换
    if (item?.switchToMeshIndex !== undefined) {
      // 立即执行切换（旧的动画已经在 stopOverlayMedia 中卸载了）
      // 使用 requestAnimationFrame 确保在下一帧执行，避免与视频清理冲突
      requestAnimationFrame(() => {
        completeMeshSwitch();
      });
    }
  });

  /**
   * loader - 只加载生效的 mesh 元素
   */
  if (!currentActiveMeshConfig) {
    throw `activeMeshIndex ${currentActiveMeshIndex} is out of range. Total meshes: ${configs.meshes?.length ?? 0}`;
  }

  loadSpineAssets(currentActiveMeshConfig, spineAssetManager);

  /**
   * when everthing is fully loaded, setup each animation update() function
   */
  const waitLoad = () => {
    // if spine assets are loaded
    if (spineAssetManager.isLoadingComplete()) {
      // 初始化 spine 动画
      const newAnimator = initializeSpineAnimator(currentActiveMeshConfig!, spineAssetManager);

      // 从生效的 mesh 配置中获取条件触发的 overlayMedia
      const allOverlayMediaItemsForConditional = currentActiveMeshConfig!.overlayMedia
        ? (Array.isArray(currentActiveMeshConfig!.overlayMedia)
            ? currentActiveMeshConfig!.overlayMedia.filter((it: OverlayMediaItem) => !!it?.videoFileName)
            : [currentActiveMeshConfig!.overlayMedia].filter((it: OverlayMediaItem) => !!it?.videoFileName))
        : [];
      conditionalOverlayMediaItems = allOverlayMediaItemsForConditional.filter((it: OverlayMediaItem) => 
        !!it?.triggerSlotsWhenHidden || !!it?.triggerEffectsWhenActive
      );
      
      // 从生效的 mesh 配置中获取条件触发的 specialEffectTriggers
      const allSpecialEffectTriggers = currentActiveMeshConfig!.specialEffectTriggers
        ? (Array.isArray(currentActiveMeshConfig!.specialEffectTriggers)
            ? currentActiveMeshConfig!.specialEffectTriggers
            : [currentActiveMeshConfig!.specialEffectTriggers])
        : [];
      conditionalSpecialEffectTriggers = allSpecialEffectTriggers.filter((it: SpecialEffectTrigger) => 
        !!it?.triggerSlotsWhenHidden || !!it?.triggerEffectsWhenActive || !!it?.triggerEffectsWhenCountReached || (it?.triggerAtSecondOfDay !== undefined && it.triggerAtSecondOfDay >= 0)
      );
      
      // 初始化时间触发检查：如果当前时间已经超过目标时间+60秒，标记为已触发
      const now = new Date();
      const currentSecondOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
      const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      const EXPIRED_THRESHOLD = 60; // 过期阈值（秒）
      
      for (const trigger of conditionalSpecialEffectTriggers) {
        if (trigger.triggerAtSecondOfDay !== undefined && trigger.triggerAtSecondOfDay >= 0) {
          const targetSecond = Number(trigger.triggerAtSecondOfDay); // 确保是数字类型
          // 如果当前时间已经超过目标时间+60秒，标记为已触发（今天不再触发）
          if (currentSecondOfDay > targetSecond + EXPIRED_THRESHOLD) {
            timeTriggeredDates.set(trigger, todayDateStr);
          }
        }
      }
      
      // 从生效的 mesh 配置中获取累计计数触发的 specialEffectTriggers
      totalCountSpecialEffectTriggers = allSpecialEffectTriggers.filter((it: SpecialEffectTrigger) => 
        !!it?.triggerEffectsWhenTotalCountReached && it.triggerEffectsWhenTotalCountReached.length > 0
      );
      
      // 初始化累计计数器和触发器映射
      totalCounters.clear();
      totalCountTriggerMap.clear();
      for (const trigger of totalCountSpecialEffectTriggers) {
        if (trigger.triggerEffectsWhenTotalCountReached) {
          for (const config of trigger.triggerEffectsWhenTotalCountReached) {
            const identifier = config.effectIdentifier;
            // 初始化计数器
            if (!totalCounters.has(identifier)) {
              totalCounters.set(identifier, 0);
            }
            // 建立映射关系
            if (!totalCountTriggerMap.has(identifier)) {
              totalCountTriggerMap.set(identifier, []);
            }
            totalCountTriggerMap.get(identifier)!.push(trigger);
          }
        }
      }
      
      // 从生效的 mesh 配置中获取累计计数触发的 specialEffectTriggers
      totalCountSpecialEffectTriggers = allSpecialEffectTriggers.filter((it: SpecialEffectTrigger) => 
        !!it?.triggerEffectsWhenTotalCountReached && it.triggerEffectsWhenTotalCountReached.length > 0
      );
      
      // 初始化累计计数器和触发器映射
      totalCounters.clear();
      totalCountTriggerMap.clear();
      for (const trigger of totalCountSpecialEffectTriggers) {
        if (trigger.triggerEffectsWhenTotalCountReached) {
          for (const config of trigger.triggerEffectsWhenTotalCountReached) {
            const identifier = config.effectIdentifier;
            // 初始化计数器
            if (!totalCounters.has(identifier)) {
              totalCounters.set(identifier, 0);
            }
            // 建立映射关系
            if (!totalCountTriggerMap.has(identifier)) {
              totalCountTriggerMap.set(identifier, []);
            }
            totalCountTriggerMap.get(identifier)!.push(trigger);
          }
        }
      }
      
      // 设置点击特效完成计数回调
      setClickEffectCompleteCallback((imageFileName: string) => {
        const identifier = imageFileName;
        const currentCount = totalCounters.get(identifier) || 0;
        totalCounters.set(identifier, currentCount + 1);
        
        // 检查是否有触发器需要检查
        const triggers = totalCountTriggerMap.get(identifier);
        if (triggers) {
          for (const trigger of triggers) {
            checkAndTriggerTotalCount(trigger);
          }
        }
      });
      
      // 设置特殊特效完成计数回调
      setSpecialEffectCompleteCallback((effectIndices: number[]) => {
        // 为每个特效索引计数
        for (const effectIndex of effectIndices) {
          const identifier = `effect:${effectIndex}`;
          const currentCount = totalCounters.get(identifier) || 0;
          totalCounters.set(identifier, currentCount + 1);
          
          // 检查是否有触发器需要检查
          const triggers = totalCountTriggerMap.get(identifier);
          if (triggers) {
            for (const trigger of triggers) {
              checkAndTriggerTotalCount(trigger);
            }
          }
        }
      });
      
      // 性能优化：预加载点击特效图片
      if (currentActiveMeshConfig!.clickEffects) {
        preloadClickEffectImages(currentActiveMeshConfig!.clickEffects);
      }
      // 预加载插槽专属点击特效图片
      if (currentActiveMeshConfig!.slotClickEffects) {
        currentActiveMeshConfig!.slotClickEffects.forEach(slotEffectConfig => {
          preloadClickEffectImages(slotEffectConfig.effects);
        });
      }
      
      // 设置canvas点击事件（从生效的 mesh 配置中读取相关配置）
      cleanupClickHandlers = setupCanvasClickHandlers(
        backgroundMusic, 
        newAnimator, 
        configs, 
        currentActiveMeshConfig!, 
        conditionalOverlayMediaItems, 
        triggeredConditionalVideos
      );

      // 设置 mesh 的背景图片（优先使用 mesh 配置的背景图片，否则使用全局背景图片）
      setMeshBackgroundImage(
        currentActiveMeshConfig!.backgroundImage,
        configs.backgroundImage,
        false // 初始化时不使用过渡效果
      );

      // 设置 mesh 的 canvas 尺寸（优先使用 mesh 配置的尺寸，否则使用全局尺寸）
      const meshWidth = currentActiveMeshConfig!.width;
      const meshHeight = currentActiveMeshConfig!.height;
      const targetWidth = meshWidth !== undefined ? meshWidth : configs.width;
      const targetHeight = meshHeight !== undefined ? meshHeight : configs.height;
      updateCanvasSize(targetWidth, targetHeight);
      
      // 设置 mesh 的 canvas 对齐（优先使用 mesh 配置的对齐值，否则使用全局对齐值）
      setMeshCanvasAlignment(
        currentActiveMeshConfig!.canvasAlignLeftPercent,
        currentActiveMeshConfig!.canvasAlignRightPercent,
        configs.canvasAlignLeftPercent,
        configs.canvasAlignRightPercent
      );

      // 设置 mesh 的 canvas 边缘过渡（优先使用 mesh 配置的边缘过渡值，否则使用全局边缘过渡值）
      setMeshCanvasEdgeTransition(
        currentActiveMeshConfig!.canvasEdgeTransition,
        currentActiveMeshConfig!.canvasEdgeTransitionImage,
        currentActiveMeshConfig!.canvasEdgeBorderColor,
        configs.canvasEdgeTransition,
        configs.canvasEdgeTransitionImage,
        configs.canvasEdgeBorderColor
      );

      requestAnimationFrame(render);
    } else {
      requestAnimationFrame(waitLoad);
    }
  };

  // Render Loop
  // 性能优化：减少条件检查频率（每10帧检查一次，约每166ms检查一次）
  let frameCount = 0;
  const CONDITIONAL_CHECK_INTERVAL = 10; // 每10帧检查一次条件触发
  const MAX_DELTA = 0.1; // 最大 delta 时间（防止跳帧导致动画异常）
  
  const render = () => {
    if (isRenderingPaused) {
      renderAnimationFrameId = null;
      return;
    }
    
    const now = Date.now() / 1000;
    let delta = now - lastFrameTime;
    // 限制 delta 时间，防止跳帧导致动画异常
    if (delta > MAX_DELTA) {
      delta = MAX_DELTA;
    }
    lastFrameTime = now;
    meshUpdateCallbacks.forEach((callback) => callback(delta));
    
    // 性能优化：减少条件检查频率（每10帧检查一次）
    frameCount++;
    if (frameCount >= CONDITIONAL_CHECK_INTERVAL) {
      frameCount = 0;
      
      // 检查条件触发的 overlayMedia
      for (const item of conditionalOverlayMediaItems) {
        // 如果已经触发过，跳过
        if (triggeredConditionalVideos.has(item)) {
          continue;
        }
        
        let shouldTrigger = false;
        
        // 检查插槽隐藏条件
        if (item.triggerSlotsWhenHidden) {
          if (spineAnimatorInstance && spineAnimatorInstance.slotController) {
            const triggerSlots = Array.isArray(item.triggerSlotsWhenHidden)
              ? item.triggerSlotsWhenHidden
              : [item.triggerSlotsWhenHidden];
            
            // 检查所有插槽是否都隐藏
            const allSlotsHidden = triggerSlots.every(slotName => 
              spineAnimatorInstance.slotController.isSlotHidden(slotName)
            );
            
            if (allSlotsHidden) {
              shouldTrigger = true;
            }
          }
        }
        
        // 检查点击特效活跃条件
        if (!shouldTrigger && item.triggerEffectsWhenActive) {
          const triggerEffects = Array.isArray(item.triggerEffectsWhenActive)
            ? item.triggerEffectsWhenActive
            : [item.triggerEffectsWhenActive];
          
          // 检查所有特效是否都活跃
          if (areClickEffectsActive(triggerEffects)) {
            shouldTrigger = true;
          }
        }
        
        // 如果满足触发条件，播放视频
        if (shouldTrigger) {
          triggeredConditionalVideos.add(item);
          playOverlayMediaItem(item, configs, backgroundMusic);
        }
      }
      
      // 检查条件触发的 specialEffectTriggers
      for (const trigger of conditionalSpecialEffectTriggers) {
        // 如果已经触发过，跳过（避免同一帧重复触发）
        if (triggeredSpecialEffectTriggers.has(trigger)) {
          continue;
        }
        
        let shouldTrigger = false;
        let isSlotTriggered = false; // 标记是否由插槽隐藏触发
        let isEffectTriggered = false; // 标记是否由点触特效触发
        
        // 检查插槽隐藏条件
        if (trigger.triggerSlotsWhenHidden) {
          if (spineAnimatorInstance && spineAnimatorInstance.slotController) {
            const triggerSlots = Array.isArray(trigger.triggerSlotsWhenHidden)
              ? trigger.triggerSlotsWhenHidden
              : [trigger.triggerSlotsWhenHidden];
            
            // 检查所有插槽是否都隐藏
            const allSlotsHidden = triggerSlots.every(slotName => 
              spineAnimatorInstance.slotController.isSlotHidden(slotName)
            );
            
            if (allSlotsHidden) {
              shouldTrigger = true;
              isSlotTriggered = true; // 标记为由插槽隐藏触发
            }
          }
        }
        
        // 检查点击特效活跃条件
        if (!shouldTrigger && trigger.triggerEffectsWhenActive) {
          const triggerEffects = Array.isArray(trigger.triggerEffectsWhenActive)
            ? trigger.triggerEffectsWhenActive
            : [trigger.triggerEffectsWhenActive];
          
          // 检查所有特效是否都活跃
          if (areClickEffectsActive(triggerEffects)) {
            shouldTrigger = true;
            isEffectTriggered = true; // 标记为由点触特效触发
          }
        }
        
        // 检查点击特效数量条件
        if (!shouldTrigger && trigger.triggerEffectsWhenCountReached) {
          // 检查所有特效是否都达到对应的个数
          if (areClickEffectsCountReached(trigger.triggerEffectsWhenCountReached)) {
            shouldTrigger = true;
            isEffectTriggered = true; // 标记为由点触特效触发
          }
        }
        
        // 检查时间触发条件
        if (!shouldTrigger && trigger.triggerAtSecondOfDay !== undefined && trigger.triggerAtSecondOfDay >= 0) {
          const now = new Date();
          const currentSecondOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
          const targetSecond = Number(trigger.triggerAtSecondOfDay); // 确保是数字类型
          
          // 获取今天的日期字符串（用于判断是否已经触发过）
          const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const lastTriggeredDate = timeTriggeredDates.get(trigger);
          
          // 如果当前时间已经超过目标时间+60秒，即使今天还没触发过，也不触发
          const EXPIRED_THRESHOLD = 60; // 过期阈值（秒）
          if (currentSecondOfDay > targetSecond + EXPIRED_THRESHOLD) {
            // 已经过期，标记为已触发（避免后续检查）
            if (lastTriggeredDate !== todayDateStr) {
              timeTriggeredDates.set(trigger, todayDateStr);
            }
            // 不触发
          } else if (currentSecondOfDay >= targetSecond - 1 && currentSecondOfDay <= targetSecond + 1 && lastTriggeredDate !== todayDateStr) {
            // 检查是否到达目标秒数，且今天还没有触发过
            // 允许在目标秒数前后1秒内触发（避免因为检查频率问题错过）
            shouldTrigger = true;
            // 记录今天已触发
            timeTriggeredDates.set(trigger, todayDateStr);
          }
        }
        
        // 如果满足触发条件，播放特效序列
        if (shouldTrigger) {
          // 标记为已触发（避免同一帧重复触发）
          triggeredSpecialEffectTriggers.add(trigger);
          
          // 如果是由插槽隐藏触发的，恢复所有隐藏的插槽
          if (isSlotTriggered && spineAnimatorInstance && spineAnimatorInstance.slotController) {
            spineAnimatorInstance.slotController.restoreAllHiddenSlots();
          }
          
          // 如果是由点触特效触发的，清除所有在场的点触特效
          if (isEffectTriggered) {
            clearAllClickEffects();
          }
          
          // 从特效库中获取特效定义
          if (configs.specialEffectLibrary && trigger.effectIndices && trigger.effectIndices.length > 0) {
            const effectDefinitions: SpecialEffectDefinition[] = [];
            
            // 判断是一维数组还是二维数组
            const isTwoDimensional = trigger.effectIndices.length > 0 && Array.isArray(trigger.effectIndices[0]);
            
            if (isTwoDimensional) {
              // 二维数组模式
              const effectGroups = trigger.effectIndices as number[][];
              let actualEffectIndices: number[] = [];
              
              if (trigger.random) {
                // 随机模式：随机选择一个一维数组，然后按顺序播放该数组内的特效
                const randomGroup = effectGroups[Math.floor(Math.random() * effectGroups.length)];
                actualEffectIndices = randomGroup || [];
                if (randomGroup && randomGroup.length > 0) {
                  for (const index of randomGroup) {
                    if (index >= 0 && index < configs.specialEffectLibrary.length) {
                      effectDefinitions.push(configs.specialEffectLibrary[index]);
                    } else {
                      console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                    }
                  }
                }
              } else {
                // 顺序模式：按一维数组顺序播放，每个一维数组内的特效按顺序播放
                for (const group of effectGroups) {
                  if (group && group.length > 0) {
                    actualEffectIndices = actualEffectIndices.concat(group);
                    for (const index of group) {
                      if (index >= 0 && index < configs.specialEffectLibrary.length) {
                        effectDefinitions.push(configs.specialEffectLibrary[index]);
                      } else {
                        console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                      }
                    }
                  }
                }
              }
              
              if (effectDefinitions.length > 0) {
                playSpecialEffectsSequence(effectDefinitions, spineAnimatorInstance, actualEffectIndices);
              }
            } else {
              // 一维数组模式（向后兼容）
              const effectIndices = trigger.effectIndices as number[];
              let actualEffectIndices: number[] = [];
            
            if (trigger.random) {
              // 随机选择：从 effectIndices 中随机选取一个索引
                const randomIndex = effectIndices[Math.floor(Math.random() * effectIndices.length)];
                actualEffectIndices = [randomIndex];
              if (randomIndex >= 0 && randomIndex < configs.specialEffectLibrary.length) {
                effectDefinitions.push(configs.specialEffectLibrary[randomIndex]);
              } else {
                console.warn(`Special effect index ${randomIndex} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
              }
            } else {
              // 顺序播放：遍历所有索引
                actualEffectIndices = [...effectIndices];
                for (const index of effectIndices) {
                if (index >= 0 && index < configs.specialEffectLibrary.length) {
                  effectDefinitions.push(configs.specialEffectLibrary[index]);
                } else {
                  console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                  }
                }
              }
              
              if (effectDefinitions.length > 0) {
                playSpecialEffectsSequence(effectDefinitions, spineAnimatorInstance, actualEffectIndices);
              }
            }
          }
          
          // 在下一帧清除触发标记，允许再次触发
          requestAnimationFrame(() => {
            triggeredSpecialEffectTriggers.delete(trigger);
          });
        }
      }
    }
    
    Scene.renderer?.render(Scene.scene, Scene.camera);
    renderAnimationFrameId = requestAnimationFrame(render);
  };

  // 导出暂停/恢复渲染的函数
  (window as any).pauseRendering = () => {
    if (!isRenderingPaused) {
      isRenderingPaused = true;
      if (renderAnimationFrameId !== null) {
        cancelAnimationFrame(renderAnimationFrameId);
        renderAnimationFrameId = null;
      }
      console.log('Rendering paused');
    }
  };

  (window as any).resumeRendering = () => {
    if (isRenderingPaused) {
      isRenderingPaused = false;
      lastFrameTime = Date.now() / 1000; // 重置时间，避免 delta 过大
      renderAnimationFrameId = requestAnimationFrame(render);
      console.log('Rendering resumed');
    }
  };

  requestAnimationFrame(waitLoad);

  /**
   * 配置自动刷新功能
   * 当 refresh 为 true 时，每隔10秒重新读取配置文件并同步变动
   */
  let refreshTimer: number | null = null;
  let currentConfigs: Configs = configs; // 保存当前配置的引用

  const refreshConfig = async () => {
    try {
      const newConfigs: Configs = await (await fetch('./assets/config.json')).json();
      
      // 检查 refresh 配置是否变更
      const refreshChanged = currentConfigs.refresh !== newConfigs.refresh;
      if (refreshChanged) {
        if (newConfigs.refresh === true && !refreshTimer) {
          // 从 false 变为 true，启动刷新
          console.log('[Config Refresh] 已启用配置自动刷新（每10秒）');
          refreshTimer = window.setInterval(refreshConfig, 10000);
        } else if (newConfigs.refresh !== true && refreshTimer) {
          // 从 true 变为 false，停止刷新
          console.log('[Config Refresh] 已禁用配置自动刷新');
          clearInterval(refreshTimer);
          refreshTimer = null;
          // 更新配置后直接返回，不再执行后续同步
          currentConfigs = newConfigs;
          return;
        }
      }
      
      // 如果当前 refresh 为 false，直接返回（不应该执行到这里，但为了安全）
      if (newConfigs.refresh !== true) {
        return;
      }
      
      // 1. 同步便签配置
      if (JSON.stringify(currentConfigs.notes) !== JSON.stringify(newConfigs.notes)) {
        console.log('[Config Refresh] 便签配置已更新，正在同步...');
        syncNotes(newConfigs.notes);
      }

      // 2. 同步特殊特效库（更新引用）
      if (JSON.stringify(currentConfigs.specialEffectLibrary) !== JSON.stringify(newConfigs.specialEffectLibrary)) {
        console.log('[Config Refresh] 特殊特效库已更新');
        // 更新全局配置引用，新的触发会使用新的特效库
        currentConfigs.specialEffectLibrary = newConfigs.specialEffectLibrary;
        configs.specialEffectLibrary = newConfigs.specialEffectLibrary;
      }

      // 3. 同步特殊特效触发配置（需要重新初始化）
      // 注意：这里使用 currentActiveMeshConfig 变量（已在外部作用域定义）
      if (currentActiveMeshConfig && newConfigs.meshes?.[currentActiveMeshIndex]) {
        const newActiveMeshConfig = newConfigs.meshes[currentActiveMeshIndex];
        const currentTriggers = currentActiveMeshConfig.specialEffectTriggers
          ? (Array.isArray(currentActiveMeshConfig.specialEffectTriggers)
              ? currentActiveMeshConfig.specialEffectTriggers
              : [currentActiveMeshConfig.specialEffectTriggers])
          : [];
        const newTriggers = newActiveMeshConfig.specialEffectTriggers
          ? (Array.isArray(newActiveMeshConfig.specialEffectTriggers)
              ? newActiveMeshConfig.specialEffectTriggers
              : [newActiveMeshConfig.specialEffectTriggers])
          : [];

        if (JSON.stringify(currentTriggers) !== JSON.stringify(newTriggers)) {
          console.log('[Config Refresh] 特殊特效触发配置已更新，正在重新初始化...');
          
          // 更新配置引用（同时更新 configs 和 currentActiveMeshConfig）
          if (configs.meshes && configs.meshes[currentActiveMeshIndex]) {
            configs.meshes[currentActiveMeshIndex].specialEffectTriggers = newActiveMeshConfig.specialEffectTriggers;
          }
          currentActiveMeshConfig.specialEffectTriggers = newActiveMeshConfig.specialEffectTriggers;
          
          // 清空已触发的标记（允许重新触发）
          triggeredSpecialEffectTriggers.clear();
          timeTriggeredDates.clear();
          
          // 重新获取条件触发的 specialEffectTriggers
          const allSpecialEffectTriggers = newActiveMeshConfig.specialEffectTriggers
            ? (Array.isArray(newActiveMeshConfig.specialEffectTriggers)
                ? newActiveMeshConfig.specialEffectTriggers
                : [newActiveMeshConfig.specialEffectTriggers])
            : [];
          conditionalSpecialEffectTriggers = allSpecialEffectTriggers.filter((it: SpecialEffectTrigger) => 
            !!it?.triggerSlotsWhenHidden || !!it?.triggerEffectsWhenActive || !!it?.triggerEffectsWhenCountReached || (it?.triggerAtSecondOfDay !== undefined && it.triggerAtSecondOfDay >= 0)
          );
          
          // 重新初始化时间触发检查
          const now = new Date();
          const currentSecondOfDay = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
          const todayDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const EXPIRED_THRESHOLD = 60;
          
          for (const trigger of conditionalSpecialEffectTriggers) {
            if (trigger.triggerAtSecondOfDay !== undefined && trigger.triggerAtSecondOfDay >= 0) {
              const targetSecond = Number(trigger.triggerAtSecondOfDay);
              if (currentSecondOfDay > targetSecond + EXPIRED_THRESHOLD) {
                timeTriggeredDates.set(trigger, todayDateStr);
              }
            }
          }
          
          // 重新初始化累计计数触发的 specialEffectTriggers
          totalCountSpecialEffectTriggers = allSpecialEffectTriggers.filter((it: SpecialEffectTrigger) => 
            !!it?.triggerEffectsWhenTotalCountReached && it.triggerEffectsWhenTotalCountReached.length > 0
          );
          
          // 重新初始化累计计数器和触发器映射（保留当前计数）
          totalCountTriggerMap.clear();
          for (const trigger of totalCountSpecialEffectTriggers) {
            if (trigger.triggerEffectsWhenTotalCountReached) {
              for (const config of trigger.triggerEffectsWhenTotalCountReached) {
                const identifier = config.effectIdentifier;
                // 如果计数器不存在，初始化；否则保留当前计数
                if (!totalCounters.has(identifier)) {
                  totalCounters.set(identifier, 0);
                }
                // 建立映射关系
                if (!totalCountTriggerMap.has(identifier)) {
                  totalCountTriggerMap.set(identifier, []);
                }
                totalCountTriggerMap.get(identifier)!.push(trigger);
              }
            }
          }
        }
      }

      // 更新当前配置引用（在同步完成后）
      currentConfigs = newConfigs;
      // 同时更新 configs 的 refresh 配置（如果变更了）
      if (refreshChanged) {
        configs.refresh = newConfigs.refresh;
      }
      
      console.log('[Config Refresh] 配置刷新完成');
    } catch (error) {
      console.error('[Config Refresh] 配置刷新失败:', error);
    }
  };

  // 如果启用了自动刷新，设置定时器
  if (configs.refresh === true) {
    console.log('[Config Refresh] 已启用配置自动刷新（每10秒）');
    refreshTimer = window.setInterval(refreshConfig, 10000); // 10秒 = 10000毫秒
  }
};

/**
 * 设置canvas点击事件处理
 * @returns 清理函数，用于移除所有事件监听器
 */
function setupCanvasClickHandlers(
  backgroundMusic: HTMLAudioElement | null,
  spineAnimator: SpineAnimator | null,
  configs: Configs,
  activeMeshConfig: SpineMeshConfig,
  conditionalItems: OverlayMediaItem[],
  triggeredVideos: Set<OverlayMediaItem>
): () => void {
  const canvas = Scene.renderer?.domElement;
  if (!canvas) {
    return;
  }

  // 优先使用 mesh 的 canvas 尺寸，否则使用全局的尺寸
  const meshWidth = activeMeshConfig.width;
  const meshHeight = activeMeshConfig.height;
  const canvasWidth = meshWidth !== undefined ? meshWidth : (configs.width ?? 2048);
  const canvasHeight = meshHeight !== undefined ? meshHeight : (configs.height ?? 2048);
  
  // 从生效的 mesh 配置中获取控制插槽名称（支持数组格式）
  const backgroundMusicSlots = activeMeshConfig.controlSlots?.backgroundMusic 
    ? (Array.isArray(activeMeshConfig.controlSlots.backgroundMusic) 
        ? activeMeshConfig.controlSlots.backgroundMusic 
        : [activeMeshConfig.controlSlots.backgroundMusic])
    : [];
  const voiceAnimationSlots = activeMeshConfig.controlSlots?.voiceAnimation
    ? (Array.isArray(activeMeshConfig.controlSlots.voiceAnimation)
        ? activeMeshConfig.controlSlots.voiceAnimation
        : [activeMeshConfig.controlSlots.voiceAnimation])
    : [];
  
  // 从生效的 mesh 配置中获取 overlayMedia
  const allOverlayMediaItems = activeMeshConfig.overlayMedia
    ? (Array.isArray(activeMeshConfig.overlayMedia)
        ? activeMeshConfig.overlayMedia.filter((it: OverlayMediaItem) => !!it?.videoFileName)
        : [activeMeshConfig.overlayMedia].filter((it: OverlayMediaItem) => !!it?.videoFileName))
    : [];
  
  // 分离点击触发的和条件触发的 overlayMedia
  const overlayMediaItems = allOverlayMediaItems.filter((it: OverlayMediaItem) => !!it?.triggerSlot);
  
  // 从生效的 mesh 配置中获取点击触发的 specialEffectTriggers
  const allSpecialEffectTriggers = activeMeshConfig.specialEffectTriggers
    ? (Array.isArray(activeMeshConfig.specialEffectTriggers)
        ? activeMeshConfig.specialEffectTriggers
        : [activeMeshConfig.specialEffectTriggers])
    : [];
  const clickTriggerSpecialEffectTriggers = allSpecialEffectTriggers.filter((it: SpecialEffectTrigger) => !!it?.triggerSlot);
  
  // 从生效的 mesh 配置中获取插槽隐藏规则
  const slotHideRules = activeMeshConfig.slotHideRules || [];
  
  // 从生效的 mesh 配置中获取背景图片切换插槽（支持数组格式）
  const backgroundImageSwitchSlots = activeMeshConfig.backgroundImageSwitchSlot
    ? (Array.isArray(activeMeshConfig.backgroundImageSwitchSlot)
        ? activeMeshConfig.backgroundImageSwitchSlot
        : [activeMeshConfig.backgroundImageSwitchSlot])
    : [];
  
  // 从生效的 mesh 配置中获取插槽专属点击特效配置
  const slotClickEffects = activeMeshConfig.slotClickEffects || [];
  
  // 存储每个插槽的恢复定时器（用于自动恢复显示）
  const slotRestoreTimers: Map<string, number> = new Map();
  
  // 设置视频开始回调：清除所有定时器并恢复所有隐藏的 slot
  // 注意：这里会覆盖之前在 main 函数中设置的回调，所以需要合并逻辑
  const previousStartCallback = (window as any).__overlayMediaStartCallback as ((item: OverlayMediaItem | null) => void) | undefined;
  setOverlayMediaStartCallback((item: OverlayMediaItem | null) => {
    // 先执行清除定时器和恢复 slot 的逻辑
    slotRestoreTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    slotRestoreTimers.clear();
    
    // 恢复所有隐藏的 slot
    if (spineAnimator && spineAnimator.slotController) {
      spineAnimator.slotController.restoreAllHiddenSlots();
    }
    
    // 然后执行之前的回调（如果有的话，用于预加载 mesh）
    if (previousStartCallback) {
      previousStartCallback(item);
    }
  });

  const handleClick = (event: MouseEvent | TouchEvent) => {
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
    
    if (event instanceof MouseEvent) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else {
      // TouchEvent - 使用changedTouches因为touchend时touches可能为空
      const touch = event.changedTouches?.[0] || (event as any).touches?.[0];
      if (!touch) return;
      clientX = touch.clientX;
      clientY = touch.clientY;
    }

    // 计算相对于canvas的坐标
    const x = ((clientX - rect.left) / rect.width) * canvasWidth;
    const y = ((clientY - rect.top) / rect.height) * canvasHeight;

    // 检查是否点击在控制插槽上
    if (spineAnimator && spineAnimator.slotController) {
      // 检查是否点击在"全屏媒体覆盖层"触发插槽上（支持多个插槽）
      for (const item of overlayMediaItems) {
        if (!item.triggerSlot) continue;
        
        const triggerSlots = Array.isArray(item.triggerSlot) 
          ? item.triggerSlot 
          : [item.triggerSlot];
        
        for (const triggerSlot of triggerSlots) {
          if (
            spineAnimator.slotController.checkSlotClick(
              x,
              y,
              canvasWidth,
              canvasHeight,
              triggerSlot
            )
          ) {
            playOverlayMediaItem(item, configs, backgroundMusic);
            return;
          }
        }
      }

      // 检查是否点击在特殊特效触发插槽上
      for (const trigger of clickTriggerSpecialEffectTriggers) {
        if (!trigger.triggerSlot) continue;
        
        const triggerSlots = Array.isArray(trigger.triggerSlot) 
          ? trigger.triggerSlot 
          : [trigger.triggerSlot];
        
        for (const triggerSlot of triggerSlots) {
          if (
            spineAnimator.slotController.checkSlotClick(
              x,
              y,
              canvasWidth,
              canvasHeight,
              triggerSlot
            )
          ) {
            // 从特效库中获取特效定义
            if (configs.specialEffectLibrary && trigger.effectIndices && trigger.effectIndices.length > 0) {
              const effectDefinitions: SpecialEffectDefinition[] = [];
              let selectedIndices: number[] | null = null;
              
              // 判断是一维数组还是二维数组
              const isTwoDimensional = trigger.effectIndices.length > 0 && Array.isArray(trigger.effectIndices[0]);
              
              if (isTwoDimensional) {
                // 二维数组模式
                const effectGroups = trigger.effectIndices as number[][];
                
                if (trigger.random) {
                  // 随机模式：随机选择一个一维数组，然后按顺序播放该数组内的特效
                  const randomGroup = effectGroups[Math.floor(Math.random() * effectGroups.length)];
                  selectedIndices = randomGroup;
                  if (randomGroup && randomGroup.length > 0) {
                    for (const index of randomGroup) {
                      if (index >= 0 && index < configs.specialEffectLibrary.length) {
                        effectDefinitions.push(configs.specialEffectLibrary[index]);
                      } else {
                        console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                      }
                    }
                  }
                } else {
                  // 顺序模式：按一维数组顺序播放，每个一维数组内的特效按顺序播放
                  selectedIndices = [];
                  for (const group of effectGroups) {
                    if (group && group.length > 0) {
                      selectedIndices = selectedIndices.concat(group);
                      for (const index of group) {
                        if (index >= 0 && index < configs.specialEffectLibrary.length) {
                          effectDefinitions.push(configs.specialEffectLibrary[index]);
                        } else {
                          console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                        }
                      }
                    }
                  }
                }
              } else {
                // 一维数组模式（向后兼容）
                const effectIndices = trigger.effectIndices as number[];
              
              if (trigger.random) {
                // 随机选择：从 effectIndices 中随机选取一个索引
                  const randomIndex = effectIndices[Math.floor(Math.random() * effectIndices.length)];
                  selectedIndices = [randomIndex];
                if (randomIndex >= 0 && randomIndex < configs.specialEffectLibrary.length) {
                  effectDefinitions.push(configs.specialEffectLibrary[randomIndex]);
                } else {
                  console.warn(`Special effect index ${randomIndex} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                }
              } else {
                // 顺序播放：遍历所有索引
                  selectedIndices = [...effectIndices];
                  for (const index of effectIndices) {
                  if (index >= 0 && index < configs.specialEffectLibrary.length) {
                    effectDefinitions.push(configs.specialEffectLibrary[index]);
                  } else {
                    console.warn(`Special effect index ${index} is out of range. Library size: ${configs.specialEffectLibrary.length}`);
                    }
                  }
                }
              }
              
              if (effectDefinitions.length > 0) {
                const actualIndices = selectedIndices || (isTwoDimensional ? [] : (trigger.effectIndices as number[]));
                playSpecialEffectsSequence(effectDefinitions, spineAnimator, actualIndices);
                if (trigger.random && selectedIndices !== null) {
                  console.log(`Special effect sequence triggered for slot: ${triggerSlot}, effects: [random: ${selectedIndices.join(', ')}]`);
                } else {
                  const indicesStr = isTwoDimensional 
                    ? (trigger.effectIndices as number[][]).map(group => `[${group.join(', ')}]`).join(', ')
                    : (trigger.effectIndices as number[]).join(', ');
                  console.log(`Special effect sequence triggered for slot: ${triggerSlot}, effects: ${indicesStr}`);
                }
              }
            }
            return;
          }
        }
      }

      // 检查是否点击在背景音乐控制插槽上（支持多个插槽）
      if (backgroundMusicSlots.length > 0 && backgroundMusic) {
        for (const slot of backgroundMusicSlots) {
          if (spineAnimator.slotController.checkSlotClick(x, y, canvasWidth, canvasHeight, slot)) {
            if (backgroundMusic.paused) {
              backgroundMusic.play().catch((error) => {
                console.error('Failed to play background music:', error);
              });
              console.log('Background music: Play');
            } else {
              backgroundMusic.pause();
              console.log('Background music: Pause');
            }
            return;
          }
        }
      }

      // 检查是否点击在语音动画控制插槽上（支持多个插槽）
      if (voiceAnimationSlots.length > 0) {
        for (const slot of voiceAnimationSlots) {
          if (spineAnimator.slotController.checkSlotClick(x, y, canvasWidth, canvasHeight, slot)) {
            spineAnimator.requestVoiceAnimation();
            console.log('Voice animation requested');
            return;
          }
        }
      }

      // 检查是否点击在背景图片切换插槽上（支持多个插槽）
      if (backgroundImageSwitchSlots.length > 0) {
        for (const slot of backgroundImageSwitchSlots) {
          if (spineAnimator.slotController.checkSlotClick(x, y, canvasWidth, canvasHeight, slot)) {
            switchBackgroundImage();
            console.log('Background image switched');
            return;
          }
        }
      }

      // 检查是否点击在插槽隐藏规则的触发插槽上
      for (const rule of slotHideRules) {
        const triggerSlots = Array.isArray(rule.triggerSlots) ? rule.triggerSlots : [rule.triggerSlots];
        const hideSlots = Array.isArray(rule.hideSlots) ? rule.hideSlots : [rule.hideSlots];
        const hideDuration = rule.hideDuration ?? -1; // 默认不自动恢复
        
        // 检查是否点击了任何一个触发插槽
        for (const triggerSlot of triggerSlots) {
          if (spineAnimator.slotController.checkSlotClick(x, y, canvasWidth, canvasHeight, triggerSlot)) {
            // 如果 hideDuration 为 -1（不自动恢复），实现切换功能
            if (hideDuration === -1) {
              // 检查目标插槽的当前状态，实现切换
              for (const hideSlot of hideSlots) {
                const isCurrentlyHidden = spineAnimator.slotController.isSlotHidden(hideSlot);
                
                if (isCurrentlyHidden) {
                  // 如果已经隐藏，恢复显示
                  spineAnimator.slotController.showSlot(hideSlot);
                  // 清除可能存在的定时器（虽然不应该有，但为了安全）
                  const existingTimer = slotRestoreTimers.get(hideSlot);
                  if (existingTimer) {
                    clearTimeout(existingTimer);
                    slotRestoreTimers.delete(hideSlot);
                  }
                  console.log(`Slot "${hideSlot}" restored by toggle`);
                } else {
                  // 如果未隐藏，隐藏它
                  spineAnimator.slotController.hideSlot(hideSlot);
                  console.log(`Slot "${hideSlot}" hidden by toggle`);
                }
              }
            } else {
              // hideDuration >= 0：正常隐藏逻辑（总是隐藏，可能自动恢复）
              for (const hideSlot of hideSlots) {
                spineAnimator.slotController.hideSlot(hideSlot);
                
                // 如果配置了自动恢复时间（大于0），则设置定时器
                if (hideDuration > 0) {
                  // 清除该插槽之前的定时器（如果存在）
                  const existingTimer = slotRestoreTimers.get(hideSlot);
                  if (existingTimer) {
                    clearTimeout(existingTimer);
                  }
                  
                  // 设置新的定时器，在指定时间后恢复显示
                  const timer = window.setTimeout(() => {
                    if (spineAnimator && spineAnimator.slotController) {
                      spineAnimator.slotController.showSlot(hideSlot);
                      slotRestoreTimers.delete(hideSlot);
                    } else {
                      console.warn(`Cannot restore slot "${hideSlot}": spineAnimator or slotController is null`);
                    }
                  }, hideDuration);
                  
                  slotRestoreTimers.set(hideSlot, timer);
                }
              }
            }
            return;
          }
        }
      }

      // 检查是否点击在配置了专属点击特效的插槽上
      for (const slotEffectConfig of slotClickEffects) {
        const triggerSlots = Array.isArray(slotEffectConfig.triggerSlots)
          ? slotEffectConfig.triggerSlots
          : [slotEffectConfig.triggerSlots];
        
        for (const triggerSlot of triggerSlots) {
          if (spineAnimator.slotController.checkSlotClick(x, y, canvasWidth, canvasHeight, triggerSlot)) {
            // 点击在配置了专属特效的插槽上，触发专属特效
            // 使用屏幕坐标（clientX, clientY）用于点击特效显示
            handleClickEffect(clientX, clientY, slotEffectConfig.effects);
            console.log(`Slot-specific click effect triggered for slot: ${triggerSlot}`);
            return;
          }
        }
      }

    }
  };

  // 添加鼠标和触摸事件监听（用于插槽检测）
  canvas.addEventListener('click', handleClick);
  const touchEndHandler = (e: TouchEvent) => {
    e.preventDefault();
    handleClick(e);
  };
  canvas.addEventListener('touchend', touchEndHandler);

  // 为整个网页添加点击特效监听（独立于 canvas 点击处理）
  // 从生效的 mesh 配置中获取 clickEffects
  let handleGlobalClick: ((event: MouseEvent | TouchEvent) => void) | null = null;
  if (activeMeshConfig.clickEffects && activeMeshConfig.clickEffects.length > 0) {
    handleGlobalClick = (event: MouseEvent | TouchEvent) => {
      let clientX: number, clientY: number;
      
      if (event instanceof MouseEvent) {
        clientX = event.clientX;
        clientY = event.clientY;
      } else {
        // TouchEvent
        const touch = event.changedTouches?.[0] || (event as any).touches?.[0];
        if (!touch) return;
        clientX = touch.clientX;
        clientY = touch.clientY;
      }

      // 检查是否点击在配置了专属特效的插槽上
      // 如果点击在配置的插槽上，不触发全局特效
      if (spineAnimator && spineAnimator.slotController) {
        const rect = canvas.getBoundingClientRect();
        // 使用与 setupCanvasClickHandlers 相同的 canvas 尺寸逻辑
        const meshWidth = activeMeshConfig.width;
        const meshHeight = activeMeshConfig.height;
        const canvasWidthForClick = meshWidth !== undefined ? meshWidth : (configs.width ?? 2048);
        const canvasHeightForClick = meshHeight !== undefined ? meshHeight : (configs.height ?? 2048);
        const x = ((clientX - rect.left) / rect.width) * canvasWidthForClick;
        const y = ((clientY - rect.top) / rect.height) * canvasHeightForClick;
        
        // 检查是否点击在配置了专属特效的插槽上
        for (const slotEffectConfig of slotClickEffects) {
          const triggerSlots = Array.isArray(slotEffectConfig.triggerSlots)
            ? slotEffectConfig.triggerSlots
            : [slotEffectConfig.triggerSlots];
          
          for (const triggerSlot of triggerSlots) {
            if (spineAnimator.slotController.checkSlotClick(x, y, canvasWidthForClick, canvasHeightForClick, triggerSlot)) {
              // 点击在配置的插槽上，不触发全局特效
              return;
            }
          }
        }
      }

      // 没有点击在配置的插槽上，触发全局特效
      handleClickEffect(clientX, clientY, activeMeshConfig.clickEffects);
    };

    // 在整个文档上监听点击事件
    document.addEventListener('click', handleGlobalClick);
    document.addEventListener('touchend', handleGlobalClick);
  }
  
  // 返回清理函数
  return () => {
    canvas.removeEventListener('click', handleClick);
    canvas.removeEventListener('touchend', touchEndHandler);
    if (handleGlobalClick) {
      document.removeEventListener('click', handleGlobalClick);
      document.removeEventListener('touchend', handleGlobalClick);
    }
  };
}

main();
