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
  /**
   * 响应式布局：当窗口变化导致 canvas 的实际显示尺寸变化时，
   * 自动把 mesh 的 scale / position.x / position.y 按比例缩放（用于把你在某个窗口尺寸下调好的参数“等比迁移”）
   */
  responsiveLayout?: {
    /** 是否启用，默认 false（不影响旧行为） */
    enabled?: boolean;
    /**
     * 基准 canvas 尺寸（不填则以“首次渲染时 canvas 的实际显示尺寸”作为基准）
     * 建议你在 1920x870 窗口下调参后，把 baseCanvasHeight 设为 870 并用 mode=height
     */
    baseCanvasWidth?: number;
    baseCanvasHeight?: number;
    /** 缩放比例计算方式，默认 'height' */
    mode?: 'height' | 'width' | 'min' | 'max';
    /**
     * 是否反向缩放（默认 false，旧字段，仍然兼容）
     * - false: r = current / base（canvas 变小 -> r 变小）
     * - true:  r = base / current（canvas 变小 -> r 变大）
     */
    invert?: boolean;
    /** 是否把比例应用到 position.x / position.y（默认 true） */
    positionEnabled?: boolean;
    /** 是否把比例应用到 scale（默认 true） */
    scaleEnabled?: boolean;
    /**
     * 是否对“位置”使用反向缩放（默认读取 invert；不填则与 invert 保持一致）
     */
    invertPosition?: boolean;
    /**
     * 是否对“缩放”使用反向缩放（默认读取 invert；不填则与 invert 保持一致）
     */
    invertScale?: boolean;
    /**
     * scale 响应幅度（默认 1）
     * - 1：完全按比例缩放
     * - 0.5：变化减半（更“保守”）
     * 计算方式：scaleRatio = 1 + (rawScaleRatio - 1) * scaleDamp
     */
    scaleDamp?: number;
  };
  backgroundColor?: {
    r: number;
    g: number;
    b: number;
  };
  backgroundImage?: string | string[]; // 背景图片文件名（相对于assets目录），支持多个，默认使用第一个
  /**
   * 背景图适配方式（对应 CSS background-size）
   * - "height": 高度 100%，宽度自适应（background-size: auto 100%）【默认】
   * - "width": 宽度 100%，高度自适应（background-size: 100% auto）
   */
  backgroundImageFit?: 'height' | 'width';
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
   * 点击指定插槽后，弹出“全屏覆盖层”同时播放视频与音频（覆盖背景与 canvas）
   */
  backgroundMusic?: {
    fileName: string;
    volume?: number; // 0-1 的音量值，默认1.0
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
};

export type OverlayMediaItem = {
  /** 触发该功能的插槽名（点击触发），例如 "bj_ren9" */
  triggerSlot?: string;
  /** 当这些插槽同时处于隐藏状态时触发（条件触发），支持一个或多个插槽 */
  triggerSlotsWhenHidden?: string | string[];
  /** 全屏播放的视频文件名（相对于 assets 目录） */
  videoFileName: string;
  /** 可选：同步播放的音频文件名（相对于 assets 目录），例如 mp3 */
  audioFileName?: string;
  /**
   * 可选：是否静音视频本身（Wallpaper Engine 环境更容易成功播放）
   * - 默认：如果配置了 audioFileName（外部 mp3）则自动静音；否则不静音
   */
  muteVideo?: boolean;
  /** 可选：点击覆盖层关闭，默认 true */
  closeOnClick?: boolean;
  /** 可选：播放时暂停背景音乐，结束后恢复，默认 true */
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
  /** 可选：点击指定插槽后，弹出"全屏覆盖层"同时播放视频与音频（覆盖背景与 canvas） */
  overlayMedia?: OverlayMediaItem | OverlayMediaItem[];
  /** 可选：插槽隐藏规则配置（可配置多个规则） */
  slotHideRules?: SlotHideRule[];
  /** 可选：点击指定插槽切换背景图片（滚动式切换） */
  backgroundImageSwitchSlot?: string | string[];
};

