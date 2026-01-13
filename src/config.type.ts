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

export type Configs = {
  width: number;
  height: number;
  /** 可选：特殊特效库（全局配置，所有 mesh 共享） */
  specialEffectLibrary?: SpecialEffectDefinition[];
  backgroundImage?: string | string[]; // 背景图片文件名（相对于assets目录），支持多个，默认使用第一个
  /**
   * 背景图适配方式（对应 CSS background-size）
   * - "height": 高度 100%，宽度自适应（background-size: auto 100%）【默认】
   * - "width": 宽度 100%，高度自适应（background-size: 100% auto）
   * - "auto": 自动根据背景图片及屏幕的大小设置是宽100%还是高100%，优先保证背景图片填满屏幕
   */
  backgroundImageFit?: 'height' | 'width' | 'auto';
  /**
   * canvas 相对"背景图片实际显示区域"的左对齐百分比
   * - 0~1：按比例（例如 0.17 表示 17%）
   * - 0~100：按百分数（例如 17 表示 17%）
   * - 非法值时，如果右对齐也非法，则canvas居中
   */
  canvasAlignLeftPercent?: number;
  /**
   * canvas 相对"背景图片实际显示区域"的右对齐百分比
   * - 0~1：按比例（例如 0.17 表示 17%）
   * - 0~100：按百分数（例如 17 表示 17%）
   * - 非法值时，如果左对齐也非法，则canvas居中
   * - 当左对齐和右对齐都有效时，优先使用左对齐
   */
  canvasAlignRightPercent?: number;
  /**
   * canvas 边缘过渡方式
   * - 0：不过渡（无羽化效果）
   * - 1：羽化（使用 mask-image 实现左右边缘渐变）
   * - 2：图片覆盖（使用指定图片覆盖 canvas，图片自动拉伸填充到 canvas 尺寸）
   * - 3：边框（使用内凹圆角双层画框）
   * - 默认：1（羽化）
   */
  canvasEdgeTransition?: 0 | 1 | 2 | 3;
  /**
   * canvas 边缘过渡图片文件名（当 canvasEdgeTransition 为 2 时使用）
   * 相对于 assets 目录
   */
  canvasEdgeTransitionImage?: string;
  /**
   * canvas 边框颜色（当 canvasEdgeTransition 为 3 时使用）
   * 支持 CSS 颜色值，例如 "#c0a062"、"rgb(192, 160, 98)"、"gold" 等
   * 默认值："#c0a062"
   */
  canvasEdgeBorderColor?: string;
  /**
   * 背景音乐
   */
  backgroundMusic?: {
    fileName: string;
    volume?: number; // 0-1 的音量值，默认1.0
  };
  /**
   * 动画混合时间配置
   */
  animationMix?: {
    /** 是否启用动画混合时间，默认 false（启用混合可以避免动画切换时的闪屏） */
    enabled?: boolean;
    /** 混合时间（秒），默认 0.2 秒。设置为 0 表示不使用混合，立即切换 */
    duration?: number;
  };
  meshes: Array<SpineMeshConfig>;
  /**
   * 生效的 mesh 元素索引（从 0 开始），只有此索引的 mesh 会被加载和渲染
   * 其他 mesh 元素作为备用，不会被加载，避免冲突
   */
  activeMeshIndex?: number;
};

export type ClickEffectConfig = {
  /** 特效图片文件名（相对于 assets 目录） */
  imageFileName: string;
  /** 权重值（0-100），用于随机选择特效，权重越高被选中的概率越大 */
  weight: number;
  /** 可选：特效显示持续时间（毫秒），默认 500 */
  duration?: number;
  /** 可选：特效缩放比例，默认 1.0 */
  scale?: number;
  /** 可选：附加的动画效果，0=无额外动画，1=摇晃（摇摆），2=放大缩小，默认 0 */
  effect?: number;
};

export type OverlayMediaItem = {
  /** 触发该功能的插槽名（点击触发），例如 "bj_ren9"，支持一个或多个插槽 */
  triggerSlot?: string | string[];
  /** 当这些插槽同时处于隐藏状态时触发（条件触发），支持一个或多个插槽 */
  triggerSlotsWhenHidden?: string | string[];
  /** 当这些点击特效图片都存在于页面上还未消失时触发（条件触发），支持一个或多个特效图片文件名 */
  triggerEffectsWhenActive?: string | string[];
  /** 
   * 全屏播放的视频文件名（相对于 assets 目录）
   * - 字符串：播放指定的视频
   * - 字符串数组：随机选择一个视频播放
   */
  videoFileName: string | string[];
  /** 可选：同步播放的音频文件名（相对于 assets 目录），例如 mp3 */
  audioFileName?: string;
  /**
   * 可选：是否静音视频本身（Wallpaper Engine 环境更容易成功播放）
   * - 默认：如果配置了 audioFileName（外部 mp3）则自动静音；否则不静音
   */
  muteVideo?: boolean;
  /** 可选：点击覆盖层关闭，默认 false */
  closeOnClick?: boolean;
  /** 可选：播放时暂停背景音乐，结束后恢复，默认 false */
  pauseBackgroundMusic?: boolean;
  /** 可选：视频音量 0~1，默认 1 */
  videoVolume?: number;
  /** 可选：音频音量 0~1，默认 1 */
  audioVolume?: number;
  /** 可选：视频是否循环，默认 false */
  loopVideo?: boolean;
  /** 可选：视频播放结束时切换到指定的 mesh 索引（从 0 开始），会卸载当前 spine 动画并加载新的 */
  switchToMeshIndex?: number;
};

/**
 * 特效定义（特效库中的单个特效）
 */
export type SpecialEffectDefinition = 
  | {
      /** 特效类型：1 = 只有第一张图的特效，2 = 三张齐全的特效 */
      type: 1;
      /** 第一张图片文件名（相对于 assets 目录） 宽高应为460*900*/
      image1FileName: string;
      /** 可选：第一张图片显示持续时间（毫秒），默认 500 */
      image1Duration?: number;
      /** 可选：第一张图片缩放比例，默认 1.0 */
      image1Scale?: number;
      /** 可选：渐隐消失持续时间（毫秒），默认 500 */
      fadeOutDuration?: number;
      /** 可选：特效开始时播放的语音文件名（相对于 assets 目录），语音会一直播放到结束，不会在特效结束时停止 */
      audioFileName?: string;
      /** 可选：特效开始时播放的 Spine 动画名称，会立即停止当前动画并播放一次指定动画 */
      animationName?: string;
    }
  | {
      /** 特效类型：1 = 只有第一张图的特效，2 = 三张齐全的特效 */
      type: 2;
      /** 第一张图片文件名（相对于 assets 目录） 宽高应为460*900*/
      image1FileName: string;
      /** 第二张图片文件名（相对于 assets 目录） */
      image2FileName: string;
      /** 第三张图片文件名（相对于 assets 目录） */
      image3FileName: string;
      /** 可选：第一张图片显示持续时间（毫秒），默认 500 */
      image1Duration?: number;
      /** 可选：第一张图片缩放比例，默认 0.8 */
      image1Scale?: number;
      /** 可选：第二、三张图片缩放动画持续时间（毫秒），默认 800 */
      scaleDuration?: number;
      /** 可选：渐隐消失持续时间（毫秒），默认 500 */
      fadeOutDuration?: number;
      /** 可选：第二张图片初始缩放比例，默认 2.0 */
      image2InitialScale?: number;
      /** 可选：第二张图片最终缩放比例，默认 1.0 */
      image2FinalScale?: number;
      /** 可选：第三张图片初始缩放比例，默认 0.5 */
      image3InitialScale?: number;
      /** 可选：第三张图片最终缩放比例，默认 1.0 */
      image3FinalScale?: number;
      /** 可选：第二张图片下端相对于第三张图片的对齐位置（百分比，0-100），0表示顶部，50表示中心，100表示底部，默认 60 */
      image2AlignPercent?: number;
      /** 可选：特效开始时播放的语音文件名（相对于 assets 目录），语音会一直播放到结束，不会在特效结束时停止 */
      audioFileName?: string;
      /** 可选：特效开始时播放的 Spine 动画名称，会立即停止当前动画并播放一次指定动画 */
      animationName?: string;
    }
  | {
      /** 特效类型：3 = 从右侧进入靠右显示，停留后放大渐隐的特效 */
      type: 3;
      /** 图片文件名（相对于 assets 目录） */
      image1FileName: string;
      /** 可选：初始缩放比例，默认 1.0 */
      initialScale?: number;
      /** 可选：最终缩放比例，默认 1.5 */
      finalScale?: number;
      /** 可选：右侧进入到完全显示的时间（毫秒），默认 300 */
      enterDuration?: number;
      /** 可选：停留时间（毫秒），默认 800 */
      stayDuration?: number;
      /** 可选：渐隐消失持续时间（毫秒），默认 500 */
      fadeOutDuration?: number;
      /** 可选：显示图片从左到右的比例（0-1），例如 0.5 表示只显示图片右侧50%的部分，默认 1.0（完整显示） */
      displayWidthRatio?: number;
      /** 可选：特效开始时播放的语音文件名（相对于 assets 目录），语音会一直播放到结束，不会在特效结束时停止 */
      audioFileName?: string;
      /** 可选：特效开始时播放的 Spine 动画名称，会立即停止当前动画并播放一次指定动画 */
      animationName?: string;
    }
  | {
      /** 特效类型：4 = 效果等同于特效2的第二张图片相关 */
      type: 4;
      /** 图片文件名（相对于 assets 目录） */
      image1FileName: string;
      /** 可选：初始缩放比例，默认 2.0 */
      initialScale?: number;
      /** 可选：最终缩放比例，默认 1.0 */
      finalScale?: number;
      /** 可选：缩放动画持续时间（毫秒），默认 300 */
      scaleDuration?: number;
      /** 可选：渐隐消失持续时间（毫秒），默认 500 */
      fadeOutDuration?: number;
      /** 可选：图片垂直对齐位置（百分比，0-100），0表示顶部，50表示中心，100表示底部，默认 50（居中） */
      alignPercent?: number;
      /** 可选：特效开始时播放的语音文件名（相对于 assets 目录），语音会一直播放到结束，不会在特效结束时停止 */
      audioFileName?: string;
      /** 可选：特效开始时播放的 Spine 动画名称，会立即停止当前动画并播放一次指定动画 */
      animationName?: string;
    }
  | {
      /** 特效类型：5 = 插槽随机隐藏显示切换特效 */
      type: 5;
      /** 特效持续时间（毫秒） */
      duration: number;
      /** 可选：语音文件名（相对于 assets 目录），支持多个，随机选择一个播放。语音会在随机的时间播放一次，并且播放不应持续时间结束而停止 */
      audioFileName?: string | string[];
      /** 
       * 要控制的插槽名称
       * - 字符串：单个插槽
       * - 一维数组：多个插槽，每个插槽独立切换
       * - 二维数组：多个插槽组，同一个一维数组里的插槽一起隐藏一起显示
       */
      slotNames: string | string[] | string[][];
      /** 插槽隐藏/显示切换的随机时间间隔范围（毫秒），例如 [100, 500] 表示间隔在 100-500ms 之间随机 */
      toggleIntervalRange: [number, number];
      /** 从隐藏到显示的随机时间间隔范围（毫秒），例如 [200, 800] 表示间隔在 200-800ms 之间随机 */
      showDelayRange: [number, number];
      /** 可选：特效开始时播放的 Spine 动画名称，会立即停止当前动画并播放一次指定动画 */
      animationName?: string;
    };

/**
 * 特效触发配置（绑定到 mesh 元素）
 */
export type SpecialEffectTrigger = {
  /** 触发该功能的插槽名（点击触发），例如 "bj_ren9"，支持一个或多个插槽 */
  triggerSlot?: string | string[];
  /** 当这些插槽同时处于隐藏状态时触发（条件触发），支持一个或多个插槽 */
  triggerSlotsWhenHidden?: string | string[];
  /** 当这些点击特效图片都存在于页面上还未消失时触发（条件触发），支持一个或多个特效图片文件名 */
  triggerEffectsWhenActive?: string | string[];
  /** 
   * 当指定的特效图片达到对应个数时触发（条件触发）
   * 每个配置项包含特效图片文件名和需要达到的个数
   * 当所有配置的特效图片都达到对应的个数时触发
   */
  triggerEffectsWhenCountReached?: Array<{
    /** 特效图片文件名（相对于 assets 目录） */
    imageFileName: string;
    /** 需要达到的个数 */
    count: number;
  }>;
  /** 
   * 当指定的特效图片或特殊特效累计出现次数达到设定值时触发（累计计数触发）
   * 每个配置项包含特效标识和需要达到的累计次数
   * 当所有配置的特效都达到对应的累计次数时触发，触发后重置所有计数器
   * 计数时机：点击特效在消失时计数，特殊特效在播放完（包括语音播放完）时计数
   */
  triggerEffectsWhenTotalCountReached?: Array<{
    /** 
     * 特效标识
     * - 如果是点击特效图片，使用图片文件名（相对于 assets 目录）
     * - 如果是特殊特效，使用特效库中的索引（从0开始），格式为 "effect:索引"，例如 "effect:0"
     */
    effectIdentifier: string;
    /** 需要达到的累计次数 */
    count: number;
  }>;
  /** 
   * 要触发的特效索引数组（引用特效库中的索引，从0开始）
   * - 一维数组：每个数字是一个特效索引，按顺序播放
   * - 二维数组：每个一维数组是一组完整特效，顺序播放模式下按一维数组顺序播放，随机模式下随机选择一个一维数组按序播放配置的特效
   */
  effectIndices: number[] | number[][];
  /** 可选：是否随机选择特效，当为 true 时，从 effectIndices 中随机选取一个特效播放，而不是按顺序播放，默认 false */
  random?: boolean;
};

export type ActionAnimation = {
  animationName: string;
  boneName: string;
  maxFollowDistance: number;
};

type MeshConfig = {
  scale: number;
  position: {
    x: number;
    y: number;
    z: number;
  };
};

export type SpineAnimationConfig = {
  name: string;
  weight: number; // 0-100 的权重值
  audioFileName?: string; // 可选的音频文件名
};

/**
 * 插槽隐藏规则配置
 * 点击触发插槽（一个或多个，只要其中一个被点击即可）时，隐藏指定的插槽（一个或多个）
 */
export type SlotHideRule = {
  /** 触发插槽名称（一个或多个，只要其中一个被点击即可触发） */
  triggerSlots: string | string[];
  /** 要隐藏的插槽名称（一个或多个） */
  hideSlots: string | string[];
  /** 可选：隐藏持续时间（毫秒），超过指定时间后自动恢复显示。如果设置为负值或0，则不自动恢复 */
  hideDuration?: number;
};

export type SpineMeshConfig = MeshConfig & {
  type: 'spine';
  skeletonFileName: string;
  jsonFileName: string;
  atlasFileName: string;
  animationName?: string; // 保留向后兼容
  animations?: SpineAnimationConfig[]; // 新的多动画配置
  cursorFollow?: ActionAnimation;
  cursorPress?: ActionAnimation;
  /** 可选：需要隐藏的插槽名称列表 */
  hiddenSlots?: string[];
  /** 可选：控制插槽配置 */
  controlSlots?: {
    backgroundMusic?: string | string[]; // 控制背景音乐播放/暂停的插槽名称（支持多个插槽）
    voiceAnimation?: string | string[]; // 触发语音动画的插槽名称（支持多个插槽）
  };
  /** 可选：点击特效配置 */
  clickEffects?: ClickEffectConfig[];
  /** 可选：插槽专属点击特效配置（点击指定插槽时触发专属特效，不触发原有的全局点击特效） */
  slotClickEffects?: Array<{
    /** 触发该特效的插槽名称（一个或多个，只要点击其中任意一个即可触发） */
    triggerSlots: string | string[];
    /** 特效配置列表（一个或多个，支持权重和持续时间） */
    effects: ClickEffectConfig[];
  }>;
  /** 可选：点击指定插槽后，弹出"全屏覆盖层"同时播放视频与音频（覆盖背景与 canvas） */
  overlayMedia?: OverlayMediaItem | OverlayMediaItem[];
  /** 可选：特殊特效触发配置（使用特效库中的索引引用特效） */
  specialEffectTriggers?: SpecialEffectTrigger | SpecialEffectTrigger[];
  /** 可选：插槽隐藏规则配置（可配置多个规则） */
  slotHideRules?: SlotHideRule[];
  /** 可选：点击指定插槽切换背景图片（滚动式切换） */
  backgroundImageSwitchSlot?: string | string[];
  /** 可选：mesh 绑定的背景图片（字符串或字符串数组），如果配置了此项，优先使用此背景图片；否则使用全局的 backgroundImage */
  backgroundImage?: string | string[];
  /**
   * 可选：canvas 宽度
   * - 如果配置了此项，优先使用此值；否则使用全局的 width
   */
  width?: number;
  /**
   * 可选：canvas 高度
   * - 如果配置了此项，优先使用此值；否则使用全局的 height
   */
  height?: number;
  /**
   * 可选：canvas 相对"背景图片实际显示区域"的左对齐百分比
   * - 0~1：按比例（例如 0.17 表示 17%）
   * - 0~100：按百分数（例如 17 表示 17%）
   * - 非法值时，如果右对齐也非法，则canvas居中
   * - 如果配置了此项，优先使用此值；否则使用全局的 canvasAlignLeftPercent
   */
  canvasAlignLeftPercent?: number;
  /**
   * 可选：canvas 相对"背景图片实际显示区域"的右对齐百分比
   * - 0~1：按比例（例如 0.17 表示 17%）
   * - 0~100：按百分数（例如 17 表示 17%）
   * - 非法值时，如果左对齐也非法，则canvas居中
   * - 当左对齐和右对齐都有效时，优先使用左对齐
   * - 如果配置了此项，优先使用此值；否则使用全局的 canvasAlignRightPercent
   */
  canvasAlignRightPercent?: number;
  /**
   * 可选：是否预乘alpha通道（默认 false）
   * - true：启用预乘alpha
   * - false：不预乘alpha（默认）
   */
  premultipliedAlpha?: boolean;
  /**
   * 可选：alpha测试阈值（默认 0）
   * - 小于此值的像素将被丢弃
   * - 0：不进行alpha测试（默认）
   */
  alphaTest?: number;
  /**
   * 可选：canvas 边缘过渡方式
   * - 0：不过渡（无羽化效果）
   * - 1：羽化（使用 mask-image 实现左右边缘渐变）
   * - 2：图片覆盖（使用指定图片覆盖 canvas，图片自动拉伸填充到 canvas 尺寸）
   * - 3：边框（使用内凹圆角双层画框）
   * - 默认：使用全局的 canvasEdgeTransition，如果全局也未设置则为 1（羽化）
   * - 如果配置了此项，优先使用此值；否则使用全局的 canvasEdgeTransition
   */
  canvasEdgeTransition?: 0 | 1 | 2 | 3;
  /**
   * 可选：canvas 边缘过渡图片文件名（当 canvasEdgeTransition 为 2 时使用）
   * - 相对于 assets 目录
   * - 如果配置了此项，优先使用此值；否则使用全局的 canvasEdgeTransitionImage
   */
  canvasEdgeTransitionImage?: string;
  /**
   * 可选：canvas 边框颜色（当 canvasEdgeTransition 为 3 时使用）
   * - 支持 CSS 颜色值，例如 "#c0a062"、"rgb(192, 160, 98)"、"gold" 等
   * - 默认值：使用全局的 canvasEdgeBorderColor，如果全局也未设置则为 "#c0a062"
   * - 如果配置了此项，优先使用此值；否则使用全局的 canvasEdgeBorderColor
   */
  canvasEdgeBorderColor?: string;
};

