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

import * as threejsSpine from 'threejs-spine-3.8-runtime-es6';
import { SpineAnimator } from './animator';
import { Configs, SpineMeshConfig, OverlayMediaItem, SlotHideRule } from './config.type';
import { ASSET_PATH } from './constants';
import * as Scene from './initScene';
import { switchBackgroundImage, setMeshBackgroundImage, setMeshCanvasAlignment } from './initScene';
import { playOverlayMediaItem, setOverlayMediaEndCallback, setOverlayMediaStartCallback } from './overlayMedia';
import { handleClickEffect, preloadClickEffectImages, areClickEffectsActive } from './clickEffect';

const main = async () => {
  const configs: Configs = await (await fetch('./assets/config.json')).json();
  Scene.initScene(configs);

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
          () => {
            // skip
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
        
        // 设置 mesh 的 canvas 对齐（优先使用 mesh 配置的对齐值，否则使用全局对齐值）
        setMeshCanvasAlignment(
          currentActiveMeshConfig!.canvasAlignLeftPercent,
          currentActiveMeshConfig!.canvasAlignRightPercent,
          configs.canvasAlignLeftPercent,
          configs.canvasAlignRightPercent
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

      // 设置 mesh 的 canvas 对齐（优先使用 mesh 配置的对齐值，否则使用全局对齐值）
      setMeshCanvasAlignment(
        currentActiveMeshConfig!.canvasAlignLeftPercent,
        currentActiveMeshConfig!.canvasAlignRightPercent,
        configs.canvasAlignLeftPercent,
        configs.canvasAlignRightPercent
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

  const canvasWidth = configs.width ?? 2048;
  const canvasHeight = configs.height ?? 2048;
  
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
        const canvasWidth = configs.width ?? 2048;
        const canvasHeight = configs.height ?? 2048;
        const x = ((clientX - rect.left) / rect.width) * canvasWidth;
        const y = ((clientY - rect.top) / rect.height) * canvasHeight;
        
        // 检查是否点击在配置了专属特效的插槽上
        for (const slotEffectConfig of slotClickEffects) {
          const triggerSlots = Array.isArray(slotEffectConfig.triggerSlots)
            ? slotEffectConfig.triggerSlots
            : [slotEffectConfig.triggerSlots];
          
          for (const triggerSlot of triggerSlots) {
            if (spineAnimator.slotController.checkSlotClick(x, y, canvasWidth, canvasHeight, triggerSlot)) {
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
