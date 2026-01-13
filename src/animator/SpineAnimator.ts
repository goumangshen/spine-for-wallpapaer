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
import { SpineMeshConfig, SpineAnimationConfig } from '@src/config.type';
import * as Scene from '@src/initScene';
import { ASSET_PATH } from '@src/constants';
import { SpineSlotController } from './SpineSlotController';
import { isOverlayMediaActive, OVERLAY_MEDIA_ACTIVE_EVENT } from '@src/overlayMedia';

export class SpineAnimator {
  public readonly skeletonMesh: threejsSpine.SkeletonMesh; // 公开 skeletonMesh 以便外部控制动画
  private animations: SpineAnimationConfig[];
  private currentAnimationIndex: number = -1;
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private currentAudio: HTMLAudioElement | null = null;
  private isVoicePlaying: boolean = false; // 标记当前是否有语音正在播放且未完成
  private voiceAudioEndHandler: (() => void) | null = null; // 语音播放结束的回调
  private pendingAudioAnimation: SpineAnimationConfig | null = null; // 待播放音频的动画（用于 addAnimation 时延迟播放）
  public readonly slotController: SpineSlotController; // 插槽控制器
  public readonly parentMesh: THREE.Mesh; // 父网格对象（用于从场景中移除）
  private baseParentX: number = 0;
  private baseParentY: number = 0;
  private baseSkeletonScaleX: number = 1;
  private baseSkeletonScaleY: number = 1;
  private slotsToHide: string[] = []; // 需要隐藏的插槽名称列表
  private slotsHiddenInitialized: boolean = false; // 标记是否已经初始化隐藏插槽
  private isFirstAnimation: boolean = true; // 标记是否是第一个动画（用于决定使用 setAnimation 还是 addAnimation）

  constructor(
    meshConfig: SpineMeshConfig,
    spineAssetManager: threejsSpine.AssetManager,
    animationMixConfig?: { enabled?: boolean; duration?: number }
  ) {
    const geometry = new THREE.BoxGeometry(100, 100, 100);
    const material = new THREE.MeshBasicMaterial({
      color: 0x000000,
      opacity: 0,
      alphaTest: 1,
    });
    const mesh = new THREE.Mesh(geometry, material);
    this.parentMesh = mesh;
    this.baseParentX = meshConfig?.position?.x ?? 0;
    this.baseParentY = meshConfig?.position?.y ?? 0;
    mesh.position.set(this.baseParentX, this.baseParentY, meshConfig?.position?.z ?? 0);
    Scene.scene?.add(mesh);

    const atlas = spineAssetManager.get(meshConfig.atlasFileName);
    const atlasLoader = new threejsSpine.AtlasAttachmentLoader(atlas);
    let skeletonJsonOrBinary:
      | threejsSpine.SkeletonJson
      | threejsSpine.SkeletonBinary;
    if (meshConfig.jsonFileName) {
      skeletonJsonOrBinary = new threejsSpine.SkeletonJson(atlasLoader);
    } else if (meshConfig.skeletonFileName) {
      skeletonJsonOrBinary = new threejsSpine.SkeletonBinary(atlasLoader);
    } else {
      throw 'please provide a skeleton file';
    }

    skeletonJsonOrBinary.scale = meshConfig.scale ?? 1;
    const skeletonData = skeletonJsonOrBinary.readSkeletonData(
      spineAssetManager.get(
        meshConfig.jsonFileName ?? meshConfig.skeletonFileName
      )
    );

    // Create a SkeletonMesh from the data and attach it to the scene
    // 读取配置的 premultipliedAlpha 和 alphaTest，如果没有配置则使用默认值
    const premultipliedAlpha = meshConfig.premultipliedAlpha ?? false;
    const alphaTest = meshConfig.alphaTest ?? 0;
    this.skeletonMesh = new threejsSpine.SkeletonMesh(
      skeletonData,
      (parameters: any) => {
        parameters.depthTest = true;
        parameters.depthWrite = false;
        parameters.premultipliedAlpha = premultipliedAlpha;
        parameters.transparent = true;
        parameters.blending = THREE.NormalBlending;
        parameters.alphaTest = alphaTest;
      }
    );
    // 记录基础缩放
    this.baseSkeletonScaleX = this.skeletonMesh.skeleton.scaleX || 1;
    this.baseSkeletonScaleY = this.skeletonMesh.skeleton.scaleY || 1;
    
    // 设置动画混合时间，用于平滑过渡
    // 如果配置了 animationMix，使用配置的值；否则使用默认值（禁用，0.2秒）
    const mixEnabled = animationMixConfig?.enabled === true; // 默认禁用
    const mixDuration = animationMixConfig?.duration ?? 0.2; // 默认0.2秒
    this.skeletonMesh.state.data.defaultMix = mixEnabled ? mixDuration : 0;

    // 处理动画配置
    if (meshConfig.animations && meshConfig.animations.length > 0) {
      // 使用新的多动画配置
      this.animations = meshConfig.animations;
      // 验证并规范化权重
      this.normalizeWeights();
      // 预加载音频文件
      this.preloadAudios();
      // 随机选择第一个动画
      this.playRandomAnimation();
    } else if (meshConfig.animationName) {
      // 向后兼容：使用单个动画名称
      this.animations = [{ name: meshConfig.animationName, weight: 100 }];
      this.preloadAudios();
      this.skeletonMesh.state.setAnimation(0, meshConfig.animationName, true);
      // 播放对应的音频（如果有）
      this.playAudio(this.animations[0]);
    } else {
      throw 'please provide either animationName or animations array';
    }

    // 监听动画完成事件
    this.skeletonMesh.state.addListener({
      start: (entry: any) => {
        // 当新动画真正开始时，播放待播放的音频（用于 addAnimation 的情况）
        if (this.pendingAudioAnimation) {
          const animationToPlay = this.pendingAudioAnimation;
          // 检查动画名称是否匹配（确保是同一个动画）
          if (entry.animation && entry.animation.name === animationToPlay.name) {
            // 清除待播放标记
            this.pendingAudioAnimation = null;
            // 播放音频
            this.playAudio(animationToPlay);
          } else {
            // 动画名称不匹配，可能是动画被跳过了，清除待播放标记
            console.warn(`Pending audio animation "${animationToPlay.name}" does not match started animation "${entry.animation?.name || 'unknown'}", clearing pending audio`);
            this.pendingAudioAnimation = null;
          }
        }
      },
      interrupt: () => {},
      end: (entry: any) => {
        // end 回调在动画结束时触发（当动画被移除时）
        // 对于循环动画，end 回调不会在每次循环结束时触发
        // 清除待播放的音频（如果动画被中断）
        if (this.pendingAudioAnimation) {
          this.pendingAudioAnimation = null;
        }
      },
      dispose: () => {},
      complete: (entry: any) => {
        // complete 回调在每次循环完成时触发（包括循环动画的每次循环结束）
        // 根据 Spine 源码，对于循环动画，complete 会在每次循环结束时触发
          // 动画播放完成后，随机选择下一个动画
          // 如果当前有语音正在播放，切换动画但不播放新动画的语音
          // 检查是否已经有下一个动画在队列中，避免重复添加
          const currentTrack = this.skeletonMesh.state.tracks[0];
          if (this.animations.length > 1 && (!currentTrack || !currentTrack.next)) {
            this.playRandomAnimation();
        }
      },
      event: () => {},
    });

    // overlay 播放期间不允许播放"语音音频"：开始时立刻停掉当前语音
    window.addEventListener(OVERLAY_MEDIA_ACTIVE_EVENT, ((e: Event) => {
      const active = (e as CustomEvent).detail?.active;
      if (active) {
        this.stopCurrentAudio(true); // 强制停止语音
      }
    }) as EventListener);

    // 初始化插槽控制器
    this.slotController = new SpineSlotController(this.skeletonMesh);
    
    // 打印所有可用的插槽名称（用于调试）
    const allSlotNames = this.slotController.getAllSlotNames();
    console.log('Available slot names:', allSlotNames);
    
    // 从配置中读取需要隐藏的插槽名称（延迟到update中执行，确保动画已经开始）
    this.slotsToHide = meshConfig.hiddenSlots || [];

    mesh.add(this.skeletonMesh); // skeletonMesh.parent === mesh
  }

  /**
   * 规范化权重值，确保在0-100范围内
   */
  private normalizeWeights() {
    const totalWeight = this.animations.reduce((sum, anim) => {
      const weight = Math.max(0, Math.min(100, anim.weight));
      anim.weight = weight;
      return sum + weight;
    }, 0);

    // 如果所有权重为0，则平均分配
    if (totalWeight === 0) {
      const equalWeight = 100 / this.animations.length;
      this.animations.forEach((anim) => {
        anim.weight = equalWeight;
      });
    }
  }

  /**
   * 基于权重随机选择并播放动画
   */
  private playRandomAnimation() {
    if (!this.animations || this.animations.length === 0) {
      return;
    }

    // 计算总权重
    const totalWeight = this.animations.reduce((sum, anim) => sum + anim.weight, 0);
    
    // 生成0到总权重之间的随机数
    let random = Math.random() * totalWeight;
    
    // 根据权重选择动画
    let selectedIndex = 0;
    for (let i = 0; i < this.animations.length; i++) {
      random -= this.animations[i].weight;
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    const selectedAnimation = this.animations[selectedIndex];
    const isRepeating = selectedIndex === this.currentAnimationIndex;
    
    this.currentAnimationIndex = selectedIndex;
    
    // 检查是否有语音正在播放
    const hasVoicePlaying = this.isVoicePlaying;
    
    // 停止当前播放的音频（如果语音未播放完，不会真正停止）
    this.stopCurrentAudio();
    
    // 判断动画是否应该循环播放
    // 如果动画有语音，则不循环（只播放一次，与音频同步结束）
    // 如果动画没有语音，则循环播放
    const shouldLoop = !selectedAnimation.audioFileName;
    
    // 播放选中的动画
    // 使用 addAnimation 而不是 setAnimation，实现平滑过渡，避免闪屏
    // 第一个动画使用 setAnimation，后续动画使用 addAnimation 进行平滑混合
    if (this.isFirstAnimation) {
      // 第一个动画，使用 setAnimation（立即播放）
      this.skeletonMesh.state.setAnimation(0, selectedAnimation.name, shouldLoop);
      this.isFirstAnimation = false;
      
      // 第一个动画立即播放，可以立即播放音频
      if (!isRepeating && !hasVoicePlaying && selectedAnimation.audioFileName) {
        this.playAudio(selectedAnimation);
      }
    } else {
      // 后续动画，使用 addAnimation 进行平滑混合
      // addAnimation 会在当前动画结束后排队播放新动画，并使用混合时间平滑过渡
      const trackEntry = this.skeletonMesh.state.addAnimation(0, selectedAnimation.name, shouldLoop, 0);
      // 如果 trackEntry 存在，可以进一步配置混合时间
      if (trackEntry) {
        // 使用默认混合时间（已在初始化时设置）
        // 如果需要，可以在这里为特定动画设置不同的混合时间
      }
      
      // 对于 addAnimation 的情况，音频应该在动画真正开始时播放（在 start 事件中）
      // 如果动画重复，不播放音频
      // 如果当前有语音正在播放，也不播放新动画的音频（让语音继续播放）
      if (!isRepeating && !hasVoicePlaying && selectedAnimation.audioFileName) {
        // 保存待播放的音频动画，等待动画真正开始时播放
        this.pendingAudioAnimation = selectedAnimation;
      } else if (!isRepeating && hasVoicePlaying) {
        // 有语音正在播放，不播放新动画的音频
        console.log('Voice still playing, skipping audio for next animation');
        this.pendingAudioAnimation = null;
      } else {
        this.pendingAudioAnimation = null;
      }
    }
  }

  /**
   * 预加载所有动画的音频文件
   */
  private preloadAudios() {
    this.animations.forEach((anim) => {
      if (anim.audioFileName) {
        const audioPath = ASSET_PATH + anim.audioFileName;
        const audio = new Audio(audioPath);
        audio.preload = 'auto';
        audio.volume = 1.0;
        
        // 添加错误处理
        audio.addEventListener('error', (e) => {
          console.error(`Failed to load audio file: ${audioPath}`, e);
          console.error(`Please check if the file exists at: ${audioPath}`);
          console.error(`Note: File names are case-sensitive in web environments.`);
        });
        
        // 添加加载成功提示（可选，用于调试）
        audio.addEventListener('canplaythrough', () => {
          console.log(`Audio loaded successfully: ${audioPath}`);
        });
        
        this.audioElements.set(anim.name, audio);
      }
    });
  }

  /**
   * 播放动画对应的音频
   */
  private playAudio(animation: SpineAnimationConfig, allowPlay: boolean = true) {
    if (!animation.audioFileName) {
      return;
    }
    // 全屏视频 overlay 播放期间，禁用动画语音播放
    if (isOverlayMediaActive()) {
      return;
    }
    
    // 如果当前有语音正在播放，不允许播放新语音
    if (!allowPlay || this.isVoicePlaying) {
      return;
    }

    const audio = this.audioElements.get(animation.name);
    if (audio) {
      // 重置音频到开始位置
      audio.currentTime = 0;
      
      // 设置语音播放标记
      this.isVoicePlaying = true;
      
      // 移除之前的结束监听器（如果存在）
      if (this.voiceAudioEndHandler) {
        audio.removeEventListener('ended', this.voiceAudioEndHandler);
      }
      
      // 创建新的结束监听器
      this.voiceAudioEndHandler = () => {
        this.isVoicePlaying = false;
        this.voiceAudioEndHandler = null;
        console.log('Voice audio finished playing');
      };
      
      audio.addEventListener('ended', this.voiceAudioEndHandler, { once: true });
      
      // 播放音频
      audio.play().catch((error) => {
        console.warn('Failed to play audio:', animation.audioFileName, error);
        this.isVoicePlaying = false;
        this.voiceAudioEndHandler = null;
      });
      
      this.currentAudio = audio;
    }
  }

  /**
   * 停止当前播放的音频
   * @param forceStop 是否强制停止（即使语音未播放完）
   */
  private stopCurrentAudio(forceStop: boolean = false) {
    if (this.currentAudio) {
      // 如果语音正在播放且未完成，且不是强制停止，则继续播放
      if (this.isVoicePlaying && !forceStop) {
        // 不停止音频，让它继续播放
        // 但清除 currentAudio 引用，这样下一个动画不会干扰它
        this.currentAudio = null;
        return;
      }
      
      // 移除结束监听器
      if (this.voiceAudioEndHandler && this.currentAudio) {
        this.currentAudio.removeEventListener('ended', this.voiceAudioEndHandler);
        this.voiceAudioEndHandler = null;
      }
      
      this.currentAudio.pause();
      this.currentAudio.currentTime = 0;
      this.currentAudio = null;
      this.isVoicePlaying = false;
    }
  }

  /**
   * 播放有语音的动画（从所有配置了audioFileName的动画中随机选择）
   */
  private playVoiceAnimation() {
    // 找到所有有语音的动画
    const voiceAnimations = this.animations.filter((anim) => anim.audioFileName);
    
    if (voiceAnimations.length === 0) {
      console.warn('No voice animations available');
      // 如果没有语音动画，继续正常随机播放
      if (this.animations.length > 1) {
        this.playRandomAnimation();
      }
      return;
    }

    // 随机选择一个有语音的动画
    const randomIndex = Math.floor(Math.random() * voiceAnimations.length);
    const selectedVoiceAnimation = voiceAnimations[randomIndex];
    
    // 找到该动画在原始数组中的索引
    const selectedIndex = this.animations.findIndex(
      (anim) => anim.name === selectedVoiceAnimation.name
    );

    if (selectedIndex === -1) {
      console.error('Voice animation not found in animations array');
      return;
    }

    // 检查当前正在播放的动画是否已经是选中的语音动画
    const currentTrack = this.skeletonMesh.state.tracks[0];
    if (currentTrack && currentTrack.animation && currentTrack.animation.name === selectedVoiceAnimation.name) {
      // 如果当前动画已经是选中的语音动画，只确保音频播放（如果还没有播放）
      if (!this.isVoicePlaying) {
        this.stopCurrentAudio(true);
        this.playAudio(selectedVoiceAnimation);
      }
      return;
    }

    this.currentAnimationIndex = selectedIndex;
    
    // 停止当前播放的音频（用户主动请求语音动画，强制停止当前音频）
    this.stopCurrentAudio(true);
    
    // 清除待播放的音频（因为这是立即切换，不需要延迟播放）
    this.pendingAudioAnimation = null;
    
    // 清除所有待播放的动画队列，确保只播放当前语音动画
    this.skeletonMesh.state.clearTracks();
    
    // 立即停止当前动画并播放选中的语音动画（只播放一次，不循环）
    // 使用 setAnimation 立即切换，不使用 addAnimation 平滑过渡
    this.skeletonMesh.state.setAnimation(0, selectedVoiceAnimation.name, false);
      this.isFirstAnimation = false;
    
    // 播放对应的音频（立即切换，可以立即播放）
    this.playAudio(selectedVoiceAnimation);
  }

  /**
   * 请求立即播放语音动画（立即停止当前动画并播放随机语音动画）
   */
  public requestVoiceAnimation() {
    // 立即播放语音动画，不再等待当前动画结束
    this.playVoiceAnimation();
  }

  public update = (delta: number) => {
    if (this.parentMesh) {
      this.parentMesh.position.x = this.baseParentX;
      this.parentMesh.position.y = this.baseParentY;
    }

    if (this.skeletonMesh?.skeleton) {
      // 使用 skeleton.scaleX/scaleY，确保插槽点击计算也能正确跟随缩放
      this.skeletonMesh.skeleton.scaleX = this.baseSkeletonScaleX;
      this.skeletonMesh.skeleton.scaleY = this.baseSkeletonScaleY;
    }
    // the rest bone animation updates
    this.skeletonMesh.update(delta);
    
    // 延迟初始化隐藏/卸载插槽（确保动画已经开始，slot已经有attachment）
    if (!this.slotsHiddenInitialized && this.skeletonMesh?.skeleton) {
      // 检查是否至少有一个slot有attachment，说明动画已经开始
      const hasActiveSlots = this.skeletonMesh.skeleton.slots.some(slot => slot.attachment !== null);
      if (hasActiveSlots) {
        // 卸载指定的插槽（从setup pose中移除，节省资源）
        this.slotsToHide.forEach(slotName => {
          this.slotController.unloadSlot(slotName);
        });
        this.slotsHiddenInitialized = true;
        console.log('Initialized and unloaded slots:', this.slotsToHide);
      }
    }
    
    // 更新插槽控制器（保持需要强制隐藏的插槽处于隐藏状态）
    // 在skeletonMesh.update之后立即更新，确保隐藏状态不被动画覆盖
    this.slotController.update();
  };
}

