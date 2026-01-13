import { Configs, OverlayMediaItem } from './config.type';
import { ASSET_PATH } from './constants';
import * as Scene from './initScene';
import { clearAllClickEffects } from './clickEffect';

type BackgroundImageFit = 'height' | 'width' | 'auto';

export const OVERLAY_MEDIA_ACTIVE_EVENT = 'overlayMedia:active';

let overlayContainer: HTMLDivElement | null = null;
let overlayVideo: HTMLVideoElement | null = null;
let overlayAudio: HTMLAudioElement | null = null;
let pausedBgMusicToResume: HTMLAudioElement | null = null;
let currentOverlayMediaItem: OverlayMediaItem | null = null;
let overlayMediaEndCallback: ((item: OverlayMediaItem | null) => void) | null = null;
let overlayMediaStartCallback: ((item: OverlayMediaItem | null) => void) | null = null;
let isAudioPlaying: boolean = false; // 标记音频是否正在播放
let audioEndHandler: (() => void) | null = null; // 音频播放结束的回调
let endCallbackCalled: boolean = false; // 标记是否已经调用过结束回调（用于避免重复调用）

export function isOverlayMediaActive(): boolean {
  return !!overlayContainer;
}

/**
 * 设置视频结束回调函数
 */
export function setOverlayMediaEndCallback(callback: (item: OverlayMediaItem | null) => void) {
  overlayMediaEndCallback = callback;
}

/**
 * 设置视频开始回调函数
 */
export function setOverlayMediaStartCallback(callback: (item: OverlayMediaItem | null) => void) {
  overlayMediaStartCallback = callback;
}

function dispatchOverlayActive(active: boolean) {
  window.dispatchEvent(new CustomEvent(OVERLAY_MEDIA_ACTIVE_EVENT, { detail: { active } }));
}

export function stopOverlayMedia(forceStop: boolean = false) {
  // 保存当前视频项，用于回调
  const item = currentOverlayMediaItem;
  
  // 重置回调调用标记
  endCallbackCalled = false;
  
  // 如果音频正在播放且不是强制停止，只关闭视频容器，让音频继续播放
  if (isAudioPlaying && !forceStop && overlayAudio) {
    console.log('Video ended but audio still playing, closing video container only');
    
    // 只关闭视频容器，不停止音频
    if (overlayVideo) {
      overlayVideo.pause();
      overlayVideo.src = '';
      overlayVideo.load();
      overlayVideo.removeAttribute('src');
      overlayVideo.load();
      overlayVideo = null;
    }
    
    if (overlayContainer) {
      overlayContainer.remove();
      overlayContainer = null;
    }
    
    // 设置 overlayMedia 为非活动状态（视频已关闭，但音频还在播放）
    // 注意：这里设置为 false，但音频结束处理器会再次确保设置为 false
    dispatchOverlayActive(false);
    
    // 恢复 canvas 渲染（音频还在播放，但视频已关闭）
    // 视频结束时立即恢复 canvas 显示，不等待音频播放完成
    // 即使有 pendingMeshSwitch，也应该立即恢复 canvas，因为视频已经结束了
    const hasPendingMeshSwitch = (window as any).hasPendingMeshSwitch && (window as any).hasPendingMeshSwitch();
    
    if (hasPendingMeshSwitch) {
      // 如果有待切换的 mesh，立即完成切换（视频已结束，可以切换了）
      // 注意：completeMeshSwitch 会恢复 canvas 和渲染
      console.log('Video ended, completing mesh switch immediately (audio still playing)');
      // 通过回调通知完成 mesh 切换
      if (overlayMediaEndCallback && item) {
        endCallbackCalled = true; // 标记已调用
        overlayMediaEndCallback(item);
      }
    } else {
      // 没有待切换的 mesh，立即恢复 canvas 显示
      Scene.resumeCanvas();
      if ((window as any).resumeRendering) {
        (window as any).resumeRendering();
      }
      console.log('Canvas resumed after video ended (audio still playing, no mesh switch)');
    }
    
    // 不恢复背景音乐，等音频播放完成后再恢复
    // 不清理 currentOverlayMediaItem，音频结束处理器需要它
    
    return; // 提前返回，不执行后续清理
  }
  
  // 强制停止或音频未播放：完全清理
  try {
    if (overlayVideo) {
      // 移除所有事件监听器以避免内存泄漏
      overlayVideo.pause();
      overlayVideo.src = '';
      overlayVideo.load();
      // 清理视频资源
      overlayVideo.removeAttribute('src');
      overlayVideo.load();
    }
    if (overlayAudio) {
      // 移除音频结束监听器
      if (audioEndHandler) {
        overlayAudio.removeEventListener('ended', audioEndHandler);
        audioEndHandler = null;
      }
      overlayAudio.pause();
      overlayAudio.src = '';
      overlayAudio.removeAttribute('src');
      isAudioPlaying = false;
    }
  } finally {
    overlayVideo = null;
    overlayAudio = null;
    currentOverlayMediaItem = null;

    if (overlayContainer) {
      overlayContainer.remove();
      overlayContainer = null;
    }

    if (pausedBgMusicToResume) {
      pausedBgMusicToResume.play().catch(() => {
        // 用户可能没有再次交互，恢复播放失败时忽略
      });
      pausedBgMusicToResume = null;
    }

    dispatchOverlayActive(false);

    // 恢复 canvas 渲染（如果有待切换的mesh，不恢复渲染，让 completeMeshSwitch 来恢复）
    const hasPendingMeshSwitch = (window as any).hasPendingMeshSwitch && (window as any).hasPendingMeshSwitch();
    if (!hasPendingMeshSwitch) {
      // 如果没有待切换的mesh，正常恢复渲染
      Scene.resumeCanvas();
      if ((window as any).resumeRendering) {
        (window as any).resumeRendering();
      }
    }
    // 如果有待切换的mesh，旧动画已经在视频开始时卸载了，这里不需要再处理
    
    // 通知视频结束，清除条件触发标记（仅在视频正常结束时调用，手动停止时不调用）
    // 注意：视频正常结束时会通过 ended 事件调用 cleanup，这里不重复调用
  }
}

export function playOverlayMediaItem(
  item: OverlayMediaItem,
  configs: Configs,
  backgroundMusic: HTMLAudioElement | null
) {
  if (!item?.videoFileName) return;

  // 处理视频文件名：如果是数组，随机选择一个
  let selectedVideoFileName: string;
  if (Array.isArray(item.videoFileName)) {
    if (item.videoFileName.length === 0) return;
    selectedVideoFileName = item.videoFileName[Math.floor(Math.random() * item.videoFileName.length)];
  } else {
    selectedVideoFileName = item.videoFileName;
  }

  // 单实例：重复触发时重启
  stopOverlayMedia();
  
  // 清除所有在场的点击特效
  clearAllClickEffects();
  
  // 保存当前播放的视频项
  currentOverlayMediaItem = item;

  const fit: BackgroundImageFit = configs.backgroundImageFit ?? 'height';
  const closeOnClick = item.closeOnClick ?? false;
  const pauseBgMusic = item.pauseBackgroundMusic ?? false;
  const muteVideo = item.muteVideo ?? !!item.audioFileName;

  if (pauseBgMusic && backgroundMusic && !backgroundMusic.paused) {
    backgroundMusic.pause();
    pausedBgMusicToResume = backgroundMusic;
  }

  const container = document.createElement('div');
  overlayContainer = container;

  container.style.position = 'fixed';
  container.style.left = '0';
  container.style.top = '0';
  container.style.width = '100vw';
  container.style.height = '100vh';
  container.style.zIndex = '2147483647'; // 尽可能置顶
  container.style.backgroundColor = 'black';
  container.style.overflow = 'hidden';
  container.style.pointerEvents = 'auto';
  // 启用硬件加速优化容器渲染
  container.style.willChange = 'contents';
  container.style.transform = 'translateZ(0)';
  container.style.backfaceVisibility = 'hidden';

  const video = document.createElement('video');
  overlayVideo = video;
  video.src = ASSET_PATH + selectedVideoFileName;
  video.preload = 'auto';
  video.playsInline = true;
  video.autoplay = true;
  video.controls = false;
  video.loop = item.loopVideo ?? false;
  // 优化视频播放性能
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  // Wallpaper Engine 环境里，未静音视频经常会被拦截导致 play() 失败
  video.muted = muteVideo;
  if (muteVideo) {
    video.setAttribute('muted', '');
    (video as any).defaultMuted = true;
  }
  video.volume = item.videoVolume ?? 1.0;

  // 让 video 的高宽适配方式统一使用 width 模式，并保持居中
  video.style.position = 'absolute';
  video.style.left = '50%';
  video.style.top = '50%';
  video.style.transform = 'translate(-50%, -50%) translateZ(0)';
  // 启用硬件加速优化视频渲染
  video.style.willChange = 'transform';
  video.style.backfaceVisibility = 'hidden';
  video.style.perspective = '1000px';
  // 优化视频渲染质量
  video.style.imageRendering = 'auto';
  video.style.objectFit = 'contain';
  // 统一使用 width 模式：宽度100%，高度自适应，允许高度超出视口并被裁切
  video.style.width = '100%';
  video.style.height = 'auto';
  video.style.maxWidth = '100%';
  video.style.maxHeight = 'none';

  const cleanup = () => {
    const item = currentOverlayMediaItem;
    // 视频结束时，如果音频还在播放，只关闭视频容器，让音频继续播放
    stopOverlayMedia(false);
    
    // 如果音频未播放或已播放完成，立即调用回调
    // 如果音频还在播放，回调会在音频结束时调用
    if (!isAudioPlaying && overlayMediaEndCallback && item) {
      overlayMediaEndCallback(item);
    }
  };
  video.addEventListener('ended', cleanup);
  
  // 监听视频等待事件，优化播放性能
  video.addEventListener('waiting', () => {
    // 视频缓冲不足时，可以显示提示或暂停其他资源消耗
    console.log('Video buffering...');
  });
  
  video.addEventListener('playing', () => {
    // 视频开始播放时，确保流畅性
    console.log('Video playing');
  });

  container.appendChild(video);

  if (item.audioFileName) {
    const audio = new Audio(ASSET_PATH + item.audioFileName);
    overlayAudio = audio;
    audio.preload = 'auto';
    audio.volume = item.audioVolume ?? 1.0;
    
    // 设置音频播放标记和结束监听器
    isAudioPlaying = false; // 初始化为 false，播放时设置为 true
    
    // 创建音频结束监听器
    audioEndHandler = () => {
      console.log('Overlay audio finished playing');
      isAudioPlaying = false;
      audioEndHandler = null;
      
      // 音频播放完成，完全清理 overlayMedia
      const item = currentOverlayMediaItem;
      
      // 清理音频资源
      if (overlayAudio) {
        overlayAudio.pause();
        overlayAudio.src = '';
        overlayAudio.removeAttribute('src');
        overlayAudio = null;
      }
      
      // 恢复背景音乐
      if (pausedBgMusicToResume) {
        pausedBgMusicToResume.play().catch(() => {
          // 用户可能没有再次交互，恢复播放失败时忽略
        });
        pausedBgMusicToResume = null;
      }
      
      // 清理 currentOverlayMediaItem
      currentOverlayMediaItem = null;
      
      // 设置 overlayMedia 为非活动状态
      dispatchOverlayActive(false);
      
      // 注意：canvas 已经在视频结束时恢复了（如果有 pendingMeshSwitch，则通过 completeMeshSwitch 恢复）
      // 这里只需要恢复背景音乐
      // 如果之前已经在视频结束时调用过回调（因为有 pendingMeshSwitch），这里不再调用，避免重复调用
      if (!endCallbackCalled && overlayMediaEndCallback && item) {
        // 之前没有调用过回调，这里调用（没有 pendingMeshSwitch 的情况）
        overlayMediaEndCallback(item);
      }
      
      // 重置标记
      endCallbackCalled = false;
    };
    
    audio.addEventListener('ended', audioEndHandler, { once: true });
  }

  if (closeOnClick) {
    // 先用于“重试播放”，播放成功后再允许点击关闭
    // （在 Wallpaper Engine 里，第一次 play() 可能失败，需要用户再点一次）
  }

  document.body.appendChild(container);
  dispatchOverlayActive(true);

  // 调用视频开始回调（清除定时器并恢复 slot 显示，以及预加载新的 mesh）
  if (overlayMediaStartCallback) {
    overlayMediaStartCallback(item);
  }

  // 暂停 canvas 渲染以释放 GPU 资源
  Scene.pauseCanvas();
  if ((window as any).pauseRendering) {
    (window as any).pauseRendering();
  }

  // 覆盖层提示（仅在需要时显示）
  const hint = document.createElement('div');
  hint.textContent = '点击播放';
  hint.style.position = 'absolute';
  hint.style.left = '50%';
  hint.style.top = '50%';
  hint.style.transform = 'translate(-50%, -50%)';
  hint.style.padding = '12px 18px';
  hint.style.borderRadius = '10px';
  hint.style.background = 'rgba(0,0,0,0.55)';
  hint.style.color = 'white';
  hint.style.fontSize = '16px';
  hint.style.userSelect = 'none';
  hint.style.pointerEvents = 'none';
  hint.style.display = 'none';
  container.appendChild(hint);

  let started = false;
  let bufferingCheckTimeout: number | null = null;
  const showHint = (text: string) => {
    hint.textContent = text;
    hint.style.display = 'block';
  };
  const hideHint = () => {
    hint.style.display = 'none';
  };

  // 检查视频缓冲状态，确保有足够的缓冲再播放
  const waitForBuffer = (): Promise<void> => {
    return new Promise((resolve) => {
      const checkBuffer = () => {
        if (!video) {
          resolve();
          return;
        }
        
        // 检查是否有足够的缓冲（至少3秒或已缓冲到50%）
        const buffered = video.buffered;
        const currentTime = video.currentTime;
        const duration = video.duration;
        
        if (duration > 0 && !isNaN(duration)) {
          // 检查已缓冲的时间范围
          let bufferedEnd = 0;
          for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= currentTime && buffered.end(i) > currentTime) {
              bufferedEnd = buffered.end(i);
              break;
            }
          }
          
          // 如果已缓冲超过3秒或已缓冲50%以上，可以播放
          const bufferedAhead = bufferedEnd - currentTime;
          const bufferedPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;
          
          if (bufferedAhead >= 3 || bufferedPercent >= 50 || video.readyState >= 3) {
            resolve();
            return;
          }
        } else if (video.readyState >= 3) {
          // 如果视频元数据已加载，也可以尝试播放
          resolve();
          return;
        }
        
        // 继续等待缓冲
        if (bufferingCheckTimeout) {
          clearTimeout(bufferingCheckTimeout);
        }
        bufferingCheckTimeout = window.setTimeout(checkBuffer, 100);
      };
      
      // 监听缓冲进度事件
      const onProgress = () => {
        checkBuffer();
      };
      
      const onCanPlay = () => {
        video?.removeEventListener('progress', onProgress);
        video?.removeEventListener('canplay', onCanPlay);
        video?.removeEventListener('canplaythrough', onCanPlay);
        if (bufferingCheckTimeout) {
          clearTimeout(bufferingCheckTimeout);
          bufferingCheckTimeout = null;
        }
        resolve();
      };
      
      video.addEventListener('progress', onProgress);
      video.addEventListener('canplay', onCanPlay);
      video.addEventListener('canplaythrough', onCanPlay);
      
      // 立即检查一次
      checkBuffer();
      
      // 设置超时，避免无限等待
      bufferingCheckTimeout = window.setTimeout(() => {
        video?.removeEventListener('progress', onProgress);
        video?.removeEventListener('canplay', onCanPlay);
        video?.removeEventListener('canplaythrough', onCanPlay);
        resolve(); // 超时后也继续尝试播放
      }, 5000);
    });
  };

  const tryStart = async (): Promise<boolean> => {
    try {
      // 等待视频缓冲到一定程度
      if (video.readyState < 2) {
        showHint('正在加载视频...');
        await waitForBuffer();
      }
      
      // 确保视频已准备好
      if (video.readyState < 2) {
        await new Promise<void>((resolve) => {
          const onLoadedData = () => {
            video?.removeEventListener('loadeddata', onLoadedData);
            resolve();
          };
          video.addEventListener('loadeddata', onLoadedData);
          // 超时保护
          setTimeout(() => {
            video?.removeEventListener('loadeddata', onLoadedData);
            resolve();
          }, 3000);
        });
      }
      
      await video.play();
      try {
        if (overlayAudio) {
          await overlayAudio.play();
          // 音频开始播放，设置标记
          isAudioPlaying = true;
        }
      } catch {
        // 音频被拦截时不影响视频
        isAudioPlaying = false;
      }
      started = true;
      hideHint();
      
      // 清理缓冲检查定时器
      if (bufferingCheckTimeout) {
        clearTimeout(bufferingCheckTimeout);
        bufferingCheckTimeout = null;
      }
      
      return true;
    } catch (err) {
      // 不要立刻关闭（否则就会出现“黑屏一闪”）
      console.warn('Overlay video play() failed:', err);
      // 如果是编码/解码问题，error 里通常会有信息
      const mediaErr = video.error;
      if (mediaErr) {
        showHint('无法播放：视频编码不支持（建议 H.264/AAC 或 WebM），点击重试');
      } else {
        showHint('点击重试播放');
      }
      
      // 清理缓冲检查定时器
      if (bufferingCheckTimeout) {
        clearTimeout(bufferingCheckTimeout);
        bufferingCheckTimeout = null;
      }
      
      return false;
    }
  };

  // 尝试自动启动（尽量成功）；失败则留在覆盖层上等待再次点击
  void tryStart();

  container.addEventListener('click', async () => {
    if (!started) {
      await tryStart();
      return;
    }
    if (closeOnClick) {
      // 用户手动关闭，强制停止（包括音频）
      stopOverlayMedia(true);
      // 手动关闭时，立即调用回调
      if (overlayMediaEndCallback && currentOverlayMediaItem) {
        overlayMediaEndCallback(currentOverlayMediaItem);
      }
    }
  });
}


