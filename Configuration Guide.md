# Spine Wallpaper Engine 配置指南

## 目录

- [项目简介](#项目简介)
- [快速开始](#快速开始)
- [配置文件结构](#配置文件结构)
- [全局配置详解](#全局配置详解)
- [Mesh 配置详解](#mesh-配置详解)
- [特殊特效库配置](#特殊特效库配置)
- [触发机制详解](#触发机制详解)
- [配置优先级](#配置优先级)
- [配置编辑器使用](#配置编辑器使用)
- [示例配置](#示例配置)
- [常见问题](#常见问题)

---

## 项目简介

Spine Wallpaper Engine 是一个基于 Three.js 和 Spine 运行时库的动画播放器，专为 Wallpaper Engine 设计。注意目前只支持3.8版本的spine文件。它支持：

- ✅ Spine 2D 骨骼动画播放
- ✅ 多动画随机/权重播放
- ✅ 点击特效和特殊特效
- ✅ 全屏视频播放
- ✅ 插槽交互控制
- ✅ 背景音乐和音效
- ✅ 多 Mesh 切换
- ✅ 条件触发机制

---

## 快速开始

### 1. 配置文件位置

主配置文件位于：`public/assets/config.json`

### 2. 基本配置结构

```json
{
  "width": 1920,
  "height": 1080,
  "meshes": [
    {
      "type": "spine",
      "jsonFileName": "animation.json",
      "atlasFileName": "animation.atlas",
      "scale": 1.0,
      "position": { "x": 0, "y": 0, "z": 0 }
    }
  ],
  "activeMeshIndex": 0
}
```

### 3. 使用配置编辑器

打开 `config-editor.html` 进行可视化编辑：
- 导入现有 JSON 配置
- 可视化编辑所有配置项
- 导出配置为 JSON 文件

---

## 配置文件结构

配置文件采用 JSON 格式，包含以下主要部分：

```json
{
  // 全局配置
  "width": number,
  "height": number,
  "backgroundImage": string | string[],
  "backgroundMusic": {...},
  "specialEffectLibrary": [...],
  
  // Mesh 配置数组
  "meshes": [
    {
      "type": "spine",
      // Mesh 相关配置
    }
  ],
  
  // 生效的 Mesh 索引
  "activeMeshIndex": number
}
```

---

## 全局配置详解

### 基础配置

#### `width` (必需)
- **类型**: `number`
- **说明**: Canvas 宽度（像素）
  - 由于设置了高100%，此处的宽高实际是只是比例
- **示例**: `1920`

#### `height` (必需)
- **类型**: `number`
- **说明**: Canvas 高度（像素）
  - 由于设置了高100%，此处的宽高实际是只是比例
- **示例**: `1080`

### 背景图片配置

#### `backgroundImage`
- **类型**: `string | string[]`
- **说明**: 背景图片文件名（相对于 `assets` 目录）
  - 字符串：单个背景图
  - 数组：多个背景图，默认使用第一个
- **示例**: 
  ```json
  "backgroundImage": "bg.jpg"
  // 或
  "backgroundImage": ["bg1.jpg", "bg2.jpg", "bg3.jpg"]
  ```

#### `backgroundImageFit`
- **类型**: `'height' | 'width' | 'auto'`
- **默认**: `'height'`
- **说明**: 背景图适配方式
  - `height`: 高度 100%，宽度自适应
  - `width`: 宽度 100%，高度自适应
  - `auto`: 自动选择，优先保证填满屏幕

### Canvas 对齐配置

#### `canvasAlignLeftPercent`
- **类型**: `number`
- **说明**: Canvas 相对背景图左对齐百分比
  - `0~1`: 按比例（如 `0.17` 表示 17%）
  - `0~100`: 按百分数（如 `17` 表示 17%）
  - 非法值：如果右对齐也非法，则居中
- **示例**: `0.17` 或 `17`

#### `canvasAlignRightPercent`
- **类型**: `number`
- **说明**: Canvas 相对背景图右对齐百分比
  - 格式同 `canvasAlignLeftPercent`
  - **优先级**: 左对齐和右对齐都有效时，优先使用左对齐

### Canvas 边缘过渡

#### `canvasEdgeTransition`
- **类型**: `0 | 1 | 2 | 3`
- **默认**: `1`
- **说明**: Canvas 边缘过渡方式
  - `0`: 不过渡（无羽化效果）
  - `1`: 羽化（左右边缘渐变）
  - `2`: 图片覆盖（使用指定图片覆盖）
  - `3`: 边框（内凹圆角双层画框）

#### `canvasEdgeTransitionImage`
- **类型**: `string`
- **说明**: 边缘过渡图片文件名（当 `canvasEdgeTransition` 为 `2` 时使用）
- **示例**: `"edge.png"`

#### `canvasEdgeBorderColor`
- **类型**: `string`
- **默认**: `"#c0a062"`
- **说明**: Canvas 边框颜色（当 `canvasEdgeTransition` 为 `3` 时使用）
- **示例**: `"#c0a062"`, `"rgb(192, 160, 98)"`, `"gold"`

### 背景音乐配置

#### `backgroundMusic`
- **类型**: `object`
- **说明**: 背景音乐配置
- **字段**:
  - `fileName` (必需): 音频文件名（相对于 `assets` 目录）
  - `volume` (可选): 音量 0-1，默认 `1.0`
- **示例**:
  ```json
  "backgroundMusic": {
    "fileName": "bg.flac",
    "volume": 0.5
  }
  ```

### 动画混合配置

#### `animationMix`
- **类型**: `object`
- **说明**: 动画混合时间配置
- **字段**:
  - `enabled` (可选): 是否启用，默认 `false`
  - `duration` (可选): 混合时间（秒），默认 `0.2`
- **示例**:
  ```json
  "animationMix": {
    "enabled": true,
    "duration": 0.2
  }
  ```

### 特殊特效库

#### `specialEffectLibrary`
- **类型**: `SpecialEffectDefinition[]`
- **说明**: 全局特殊特效库，所有 mesh 共享
- **详细说明**: 见 [特殊特效库配置](#特殊特效库配置)

### Mesh 配置数组

#### `meshes`
- **类型**: `SpineMeshConfig[]`
- **说明**: Mesh 配置数组
- **详细说明**: 见 [Mesh 配置详解](#mesh-配置详解)

### 生效的 Mesh 索引

#### `activeMeshIndex`
- **类型**: `number`
- **默认**: `0`
- **说明**: 生效的 mesh 元素索引（从 0 开始）
  - 只有此索引的 mesh 会被加载和渲染
  - 其他 mesh 作为备用，不会被加载

---

## Mesh 配置详解

每个 mesh 配置包含以下部分：

### 基础配置

#### `type`
- **类型**: `'spine'`
- **必需**: 是
- **说明**: Mesh 类型，目前仅支持 `'spine'`

#### `scale`
- **类型**: `number`
- **必需**: 是
- **说明**: 缩放比例
- **示例**: `1.0`, `5.5`, `6.3`

#### `position`
- **类型**: `object`
- **必需**: 是
- **说明**: 3D 位置坐标
- **字段**:
  - `x`: X 轴位置
  - `y`: Y 轴位置
  - `z`: Z 轴位置（深度）
- **示例**:
  ```json
  "position": {
    "x": 0,
    "y": 0,
    "z": -1200
  }
  ```

### Spine 文件配置

#### `skeletonFileName` 或 `jsonFileName`
- **类型**: `string`
- **必需**: 至少一个
- **说明**: Spine 骨架文件
  - `skeletonFileName`: 二进制格式（.skel）
  - `jsonFileName`: JSON 格式（.json）
- **示例**: `"animation.json"` 或 `"animation.skel"`

#### `atlasFileName`
- **类型**: `string`
- **必需**: 是
- **说明**: 纹理图集文件（.atlas）
- **示例**: `"animation.atlas"`

### 动画配置

#### `animations` (推荐)
- **类型**: `SpineAnimationConfig[]`
- **说明**: 多动画配置，支持权重和音频
- **字段**:
  - `name` (必需): 动画名称
  - `weight` (必需): 权重值 0-100，权重越高播放概率越大
  - `audioFileName` (可选): 播放此动画时的音频文件
- **示例**:
  ```json
  "animations": [
    {
      "name": "battlestand",
      "weight": 80
    },
    {
      "name": "casting1",
      "weight": 10,
      "audioFileName": "cast.mp3"
    },
    {
      "name": "idle1",
      "weight": 10,
      "audioFileName": "idle.mp3"
    }
  ]
  ```
- **权重计算**: 系统会根据权重随机选择动画播放

#### `animationName` (旧版，向后兼容)
- **类型**: `string`
- **说明**: 单动画配置（旧版），建议使用 `animations` 数组

### Canvas 配置（Mesh 级别）

以下配置项在 mesh 级别优先于全局配置：

#### `width` / `height`
- **类型**: `number`
- **说明**: Canvas 尺寸（优先于全局配置）

#### `backgroundImage`
- **类型**: `string | string[]`
- **说明**: Mesh 专属背景图片（优先于全局配置）

#### `canvasAlignLeftPercent` / `canvasAlignRightPercent`
- **类型**: `number`
- **说明**: Canvas 对齐方式（优先于全局配置）

#### `canvasEdgeTransition` / `canvasEdgeTransitionImage` / `canvasEdgeBorderColor`
- **类型**: 见全局配置说明
- **说明**: Canvas 边缘过渡（优先于全局配置）

#### `premultipliedAlpha`
- **类型**: `boolean`
- **默认**: `false`
- **说明**: 是否预乘 alpha 通道

#### `alphaTest`
- **类型**: `number`
- **默认**: `0`
- **说明**: Alpha 测试阈值，小于此值的像素将被丢弃
  - `0`: 不进行 alpha 测试

### 插槽配置

#### `hiddenSlots`
- **类型**: `string[]`
- **说明**: 初始隐藏的插槽名称列表
- **示例**: `["slot1", "slot2"]`

#### `controlSlots`
- **类型**: `object`
- **说明**: 控制插槽配置
- **字段**:
  - `backgroundMusic` (可选): 控制背景音乐播放/暂停的插槽（支持数组）
  - `voiceAnimation` (可选): 触发语音动画的插槽（支持数组）
- **示例**:
  ```json
  "controlSlots": {
    "backgroundMusic": ["pingzi2"],
    "voiceAnimation": ["shu_2", "shu_3"]
  }
  ```

#### `slotHideRules`
- **类型**: `SlotHideRule[]`
- **说明**: 插槽隐藏规则配置
- **字段**:
  - `triggerSlots` (必需): 触发插槽（字符串或数组）
  - `hideSlots` (必需): 要隐藏的插槽（字符串或数组）
  - `hideDuration` (可选): 隐藏持续时间（毫秒）
    - `> 0`: 自动恢复显示
    - `<= 0`: 不自动恢复（切换模式）
- **示例**:
  ```json
  "slotHideRules": [
    {
      "triggerSlots": "button1",
      "hideSlots": ["slot1", "slot2"],
      "hideDuration": 10000
    },
    {
      "triggerSlots": ["button2", "button3"],
      "hideSlots": "slot3",
      "hideDuration": -1
    }
  ]
  ```

#### `backgroundImageSwitchSlot`
- **类型**: `string | string[]`
- **说明**: 点击指定插槽切换背景图片（滚动式切换）
- **示例**: `"diqiuyi"` 或 `["slot1", "slot2"]`

### 点击特效配置

#### `clickEffects`
- **类型**: `ClickEffectConfig[]`
- **说明**: 全局点击特效配置（点击屏幕任意位置触发）
- **字段**:
  - `imageFileName` (必需): 特效图片文件名
  - `weight` (必需): 权重值 0-100
  - `duration` (可选): 显示持续时间（毫秒），默认 `500`
  - `scale` (可选): 缩放比例，默认 `1.0`
  - `effect` (可选): 附加动画效果
    - `0`: 无额外动画
    - `1`: 摇晃（摇摆）
    - `2`: 放大缩小
- **示例**:
  ```json
  "clickEffects": [
    {
      "imageFileName": "effect1.png",
      "weight": 50,
      "duration": 500,
      "scale": 0.2,
      "effect": 0
    },
    {
      "imageFileName": "effect2.png",
      "weight": 50,
      "duration": 500,
      "scale": 0.3,
      "effect": 1
    }
  ]
  ```

#### `slotClickEffects`
- **类型**: `Array<{triggerSlots: string | string[], effects: ClickEffectConfig[]}>`
- **说明**: 插槽专属点击特效（点击指定插槽时触发，不触发全局点击特效）
- **示例**:
  ```json
  "slotClickEffects": [
    {
      "triggerSlots": ["special_slot1", "special_slot2"],
      "effects": [
        {
          "imageFileName": "special_effect.png",
          "weight": 100,
          "duration": 800,
          "scale": 0.5
        }
      ]
    }
  ]
  ```

### 覆盖媒体配置

#### `overlayMedia`
- **类型**: `OverlayMediaItem | OverlayMediaItem[]`
- **说明**: 全屏视频播放配置（覆盖背景与 canvas）
- **触发方式**:
  1. **点击触发**: `triggerSlot`
  2. **条件触发**: `triggerSlotsWhenHidden`（插槽隐藏时）
  3. **条件触发**: `triggerEffectsWhenActive`（点击特效活跃时）
- **字段**:
  - `triggerSlot` (可选): 触发插槽（字符串或数组）
  - `triggerSlotsWhenHidden` (可选): 当这些插槽都隐藏时触发
  - `triggerEffectsWhenActive` (可选): 当这些点击特效都活跃时触发
  - `videoFileName` (必需): 视频文件名（字符串或数组，数组时随机选择）
  - `audioFileName` (可选): 同步播放的音频文件
  - `muteVideo` (可选): 是否静音视频，默认根据是否有 `audioFileName` 决定
  - `closeOnClick` (可选): 点击覆盖层关闭，默认 `false`
  - `pauseBackgroundMusic` (可选): 播放时暂停背景音乐，默认 `false`
  - `videoVolume` (可选): 视频音量 0-1，默认 `1`
  - `audioVolume` (可选): 音频音量 0-1，默认 `1`
  - `loopVideo` (可选): 视频是否循环，默认 `false`
  - `switchToMeshIndex` (可选): 视频播放结束时切换到指定的 mesh 索引
- **示例**:
  ```json
  "overlayMedia": [
    {
      "triggerSlot": "video_trigger",
      "videoFileName": "video.webm",
      "audioFileName": "audio.mp3",
      "pauseBackgroundMusic": true
    },
    {
      "triggerSlotsWhenHidden": ["slot1", "slot2"],
      "videoFileName": ["video1.webm", "video2.webm"],
      "pauseBackgroundMusic": true
    }
  ]
  ```

### 特殊特效触发配置

#### `specialEffectTriggers`
- **类型**: `SpecialEffectTrigger | SpecialEffectTrigger[]`
- **说明**: 特殊特效触发配置（引用特效库中的索引）
- **触发方式**:
  1. **点击触发**: `triggerSlot`
  2. **条件触发**: `triggerSlotsWhenHidden`（插槽隐藏时）
  3. **条件触发**: `triggerEffectsWhenActive`（点击特效活跃时）
  4. **条件触发**: `triggerEffectsWhenCountReached`（点击特效数量达到时）
  5. **累计触发**: `triggerEffectsWhenTotalCountReached`（累计计数达到时）
- **字段**:
  - `triggerSlot` (可选): 触发插槽（字符串或数组）
  - `triggerSlotsWhenHidden` (可选): 当这些插槽都隐藏时触发
  - `triggerEffectsWhenActive` (可选): 当这些点击特效都活跃时触发
  - `triggerEffectsWhenCountReached` (可选): 当特效数量达到时触发
  - `triggerEffectsWhenTotalCountReached` (可选): 当累计次数达到时触发
  - `effectIndices` (必需): 特效索引数组（引用 `specialEffectLibrary`）
    - 一维数组: `[0, 1, 2]` - 按顺序播放
    - 二维数组: `[[0, 1], [2, 3]]` - 分组播放
  - `random` (可选): 是否随机选择，默认 `false`
- **示例**:
  ```json
  "specialEffectTriggers": [
    {
      "triggerSlot": ["slot1", "slot2"],
      "effectIndices": [0],
      "random": false
    },
    {
      "triggerSlotsWhenHidden": ["slot3", "slot4"],
      "effectIndices": [[0, 1], [2]],
      "random": true
    },
    {
      "triggerEffectsWhenCountReached": [
        {
          "imageFileName": "effect1.png",
          "count": 3
        }
      ],
      "effectIndices": [0]
    },
    {
      "triggerEffectsWhenTotalCountReached": [
        {
          "effectIdentifier": "effect1.png",
          "count": 10
        },
        {
          "effectIdentifier": "effect:0",
          "count": 5
        }
      ],
      "effectIndices": [1]
    }
  ]
  ```

---

## 特殊特效库配置

特殊特效库 (`specialEffectLibrary`) 定义可复用的特效，通过索引在 `specialEffectTriggers` 中引用。

### 特效类型 1: 单图特效（常用于响应）

显示一张图片，然后渐隐消失。

```json
{
  "type": 1,
  "image1FileName": "effect1.png",
  "image1Duration": 500,
  "image1Scale": 1.0,
  "fadeOutDuration": 500,
  "audioFileName": "sound.mp3",
  "animationName": "casting1"
}
```

**字段说明**:
- `type`: `1`（必需）
- `image1FileName` (必需): 第一张图片文件名（推荐尺寸 460×900）
- `image1Duration` (可选): 显示持续时间（毫秒），默认 `500`
- `image1Scale` (可选): 缩放比例，默认 `1.0`
- `fadeOutDuration` (可选): 渐隐持续时间（毫秒），默认 `500`
- `audioFileName` (可选): 语音文件（会播放到结束，不会在特效结束时停止）
- `animationName` (可选): Spine 动画名称（会立即停止当前动画并播放）

### 特效类型 2: 三图特效（常用于用牌特效）

显示三张图片，第二、三张图片有缩放动画。

```json
{
  "type": 2,
  "image1FileName": "p1.webp",
  "image2FileName": "e1.png",
  "image3FileName": "t1.png",
  "image1Duration": 400,
  "image1Scale": 0.8,
  "scaleDuration": 100,
  "fadeOutDuration": 1500,
  "image2InitialScale": 2.0,
  "image2FinalScale": 1.0,
  "image3InitialScale": 0.5,
  "image3FinalScale": 1.0,
  "image2AlignPercent": 60,
  "audioFileName": "p1.mp3",
  "animationName": "casting1"
}
```

**字段说明**:
- `type`: `2`（必需）
- `image1FileName` (必需): 第一张图片（推荐尺寸 460×900）
- `image2FileName` (必需): 第二张图片
- `image3FileName` (必需): 第三张图片
- `image1Duration` (可选): 第一张图片显示时间，默认 `500`
- `image1Scale` (可选): 第一张图片缩放，默认 `0.8`
- `scaleDuration` (可选): 第二、三张图片缩放动画时间，默认 `800`
- `fadeOutDuration` (可选): 渐隐时间，默认 `500`
- `image2InitialScale` (可选): 第二张图片初始缩放，默认 `2.0`
- `image2FinalScale` (可选): 第二张图片最终缩放，默认 `1.0`
- `image3InitialScale` (可选): 第三张图片初始缩放，默认 `0.5`
- `image3FinalScale` (可选): 第三张图片最终缩放，默认 `1.0`
- `image2AlignPercent` (可选): 第二张图片对齐位置（0-100），默认 `60`
- `audioFileName` (可选): 语音文件
- `animationName` (可选): Spine 动画名称

### 特效类型 3: 右侧进入特效（常用于觉醒）

从右侧进入，靠右显示，停留后放大渐隐。

```json
{
  "type": 3,
  "image1FileName": "effect.png",
  "initialScale": 1.0,
  "finalScale": 1.5,
  "enterDuration": 300,
  "stayDuration": 800,
  "fadeOutDuration": 500,
  "displayWidthRatio": 1.0,
  "audioFileName": "sound.mp3",
  "animationName": "casting1"
}
```

**字段说明**:
- `type`: `3`（必需）
- `image1FileName` (必需): 图片文件名
- `initialScale` (可选): 初始缩放，默认 `1.0`
- `finalScale` (可选): 最终缩放，默认 `1.5`
- `enterDuration` (可选): 进入时间，默认 `300`
- `stayDuration` (可选): 停留时间，默认 `800`
- `fadeOutDuration` (可选): 渐隐时间，默认 `500`
- `displayWidthRatio` (可选): 显示宽度比例（0-1），默认 `1.0`（完整显示）
- `audioFileName` (可选): 语音文件
- `animationName` (可选): Spine 动画名称

### 特效类型 4: 缩放特效（常用于气绝）

类似类型 2 的第二张图片效果。

```json
{
  "type": 4,
  "image1FileName": "effect.png",
  "initialScale": 2.0,
  "finalScale": 1.0,
  "scaleDuration": 300,
  "fadeOutDuration": 500,
  "alignPercent": 50,
  "audioFileName": "sound.mp3",
  "animationName": "casting1"
}
```

**字段说明**:
- `type`: `4`（必需）
- `image1FileName` (必需): 图片文件名
- `initialScale` (可选): 初始缩放，默认 `2.0`
- `finalScale` (可选): 最终缩放，默认 `1.0`
- `scaleDuration` (可选): 缩放动画时间，默认 `300`
- `fadeOutDuration` (可选): 渐隐时间，默认 `500`
- `alignPercent` (可选): 垂直对齐位置（0-100），默认 `50`（居中）
- `audioFileName` (可选): 语音文件
- `animationName` (可选): Spine 动画名称

### 特效类型 5: 插槽随机切换特效（主要用于营造诡异/电子氛围，不常用）

随机隐藏/显示插槽。

```json
{
  "type": 5,
  "duration": 5000,
  "audioFileName": ["sound1.mp3", "sound2.mp3"],
  "slotNames": [
    ["slot1", "slot2"],
    "slot3",
    ["slot4", "slot5"]
  ],
  "toggleIntervalRange": [100, 500],
  "showDelayRange": [200, 800],
  "animationName": "casting1"
}
```

**字段说明**:
- `type`: `5`（必需）
- `duration` (必需): 特效持续时间（毫秒）
- `audioFileName` (可选): 语音文件（字符串或数组，随机选择）
- `slotNames` (必需): 插槽名称配置
  - 字符串: 单个插槽，独立切换
  - 一维数组: 多个插槽，每个独立切换
  - 二维数组: 多个插槽组，同组内一起隐藏/显示
- `toggleIntervalRange` (必需): 切换间隔范围 `[min, max]`（毫秒）
- `showDelayRange` (必需): 显示延迟范围 `[min, max]`（毫秒）
- `animationName` (可选): Spine 动画名称

---

## 触发机制详解

### 1. 点击触发

点击指定插槽触发功能。

**适用配置**:
- `overlayMedia.triggerSlot`
- `specialEffectTriggers.triggerSlot`
- `slotClickEffects.triggerSlots`

**示例**:
```json
{
  "triggerSlot": "button_slot"
  // 或
  "triggerSlot": ["slot1", "slot2"]
}
```

### 2. 插槽隐藏条件触发

当指定插槽都处于隐藏状态时触发。

**适用配置**:
- `overlayMedia.triggerSlotsWhenHidden`
- `specialEffectTriggers.triggerSlotsWhenHidden`

**示例**:
```json
{
  "triggerSlotsWhenHidden": ["slot1", "slot2"]
}
```

**注意**: 所有插槽都必须隐藏才会触发。

### 3. 点击特效活跃条件触发

当指定的点击特效图片都存在于页面上（还未消失）时触发。

**适用配置**:
- `overlayMedia.triggerEffectsWhenActive`
- `specialEffectTriggers.triggerEffectsWhenActive`

**示例**:
```json
{
  "triggerEffectsWhenActive": ["effect1.png", "effect2.png"]
}
```

**注意**: 所有特效都必须同时活跃才会触发。

### 4. 点击特效数量条件触发

当指定的点击特效图片达到对应个数时触发。

**适用配置**:
- `specialEffectTriggers.triggerEffectsWhenCountReached`

**示例**:
```json
{
  "triggerEffectsWhenCountReached": [
    {
      "imageFileName": "effect1.png",
      "count": 3
    },
    {
      "imageFileName": "effect2.png",
      "count": 2
    }
  ]
}
```

**注意**: 所有特效都必须达到对应个数才会触发。

### 5. 累计计数触发

当指定的特效累计出现次数达到设定值时触发，触发后重置计数器。

**适用配置**:
- `specialEffectTriggers.triggerEffectsWhenTotalCountReached`

**计数时机**:
- 点击特效：在消失时计数
- 特殊特效：在播放完（包括语音播放完）时计数

**特效标识格式**:
- 点击特效：使用图片文件名，如 `"effect1.png"`
- 特殊特效：使用 `"effect:索引"`，如 `"effect:0"`（索引从 0 开始）

**示例**:
```json
{
  "triggerEffectsWhenTotalCountReached": [
    {
      "effectIdentifier": "effect1.png",
      "count": 10
    },
    {
      "effectIdentifier": "effect:0",
      "count": 5
    }
  ]
}
```

**注意**: 所有特效都必须达到对应累计次数才会触发，触发后所有计数器重置。

---

## 配置优先级

### Mesh 配置优先于全局配置

以下配置项在 mesh 级别优先于全局配置：

- `width` / `height`
- `backgroundImage`
- `canvasAlignLeftPercent` / `canvasAlignRightPercent`
- `canvasEdgeTransition` / `canvasEdgeTransitionImage` / `canvasEdgeBorderColor`

### 左对齐优先于右对齐

当 `canvasAlignLeftPercent` 和 `canvasAlignRightPercent` 都有效时，优先使用左对齐。

### 插槽专属特效优先于全局特效

当点击配置了 `slotClickEffects` 的插槽时，只触发专属特效，不触发全局 `clickEffects`。

---

## 配置编辑器使用

### 打开编辑器

在浏览器中打开 `config-editor.html`。

### 导入配置

1. 点击"导入 JSON"按钮
2. 选择配置文件（JSON 格式）
3. 配置会自动加载到编辑器中

### 编辑配置

1. 使用表单编辑各项配置
2. 点击"添加"按钮添加数组项
3. 点击"删除"按钮删除项
4. 使用右侧导航栏快速跳转

### 导出配置

1. 编辑完成后点击"导出 JSON"
2. 配置文件会自动下载
3. 将文件保存为 `public/assets/config.json`

### 导航功能

- 鼠标移动到右下角触发区域显示导航栏
- 点击导航项快速跳转到对应配置
- 支持折叠/展开配置项

---

## 示例配置

### 基础配置示例

```json
{
  "width": 1920,
  "height": 1080,
  "backgroundImage": "bg.jpg",
  "backgroundImageFit": "auto",
  "meshes": [
    {
      "type": "spine",
      "jsonFileName": "animation.json",
      "atlasFileName": "animation.atlas",
      "scale": 1.0,
      "position": {
        "x": 0,
        "y": 0,
        "z": 0
      },
      "animations": [
        {
          "name": "idle",
          "weight": 100
        }
      ]
    }
  ],
  "activeMeshIndex": 0
}
```

### 完整功能配置示例

```json
{
  "width": 4000,
  "height": 1920,
  "backgroundImage": ["bg1.jpg", "bg2.jpg"],
  "backgroundImageFit": "auto",
  "canvasAlignLeftPercent": -1,
  "canvasAlignRightPercent": -1,
  "canvasEdgeTransition": 1,
  "backgroundMusic": {
    "fileName": "bg.flac",
    "volume": 0.5
  },
  "animationMix": {
    "enabled": true,
    "duration": 0.2
  },
  "specialEffectLibrary": [
    {
      "type": 2,
      "image1FileName": "p1.webp",
      "image2FileName": "e1.png",
      "image3FileName": "t1.png",
      "audioFileName": "p1.mp3",
      "image1Scale": 0.8,
      "image1Duration": 400,
      "scaleDuration": 100,
      "fadeOutDuration": 1500
    }
  ],
  "meshes": [
    {
      "type": "spine",
      "jsonFileName": "animation.json",
      "atlasFileName": "animation.atlas",
      "scale": 6,
      "position": {
        "x": -300,
        "y": 0,
        "z": -1200
      },
      "animations": [
        {
          "name": "battlestand",
          "weight": 80
        },
        {
          "name": "casting1",
          "weight": 10,
          "audioFileName": "cast.mp3"
        },
        {
          "name": "idle1",
          "weight": 10,
          "audioFileName": "idle.mp3"
        }
      ],
      "controlSlots": {
        "backgroundMusic": ["pingzi2"],
        "voiceAnimation": ["shu_2", "shu_3"]
      },
      "clickEffects": [
        {
          "imageFileName": "effect1.png",
          "weight": 50,
          "duration": 500,
          "scale": 0.2,
          "effect": 0
        }
      ],
      "specialEffectTriggers": [
        {
          "triggerSlot": ["slot1", "slot2"],
          "effectIndices": [0]
        }
      ],
      "slotHideRules": [
        {
          "triggerSlots": "button1",
          "hideSlots": ["slot1", "slot2"],
          "hideDuration": 10000
        }
      ],
      "overlayMedia": [
        {
          "triggerSlot": "video_trigger",
          "videoFileName": "video.webm",
          "audioFileName": "audio.mp3",
          "pauseBackgroundMusic": true
        }
      ]
    }
  ],
  "activeMeshIndex": 0
}
```

---

## 常见问题

### Q1: 配置文件应该放在哪里？

**A**: 主配置文件应放在 `public/assets/config.json`。

### Q2: 如何切换不同的 Mesh？

**A**: 修改 `activeMeshIndex` 字段，指定要生效的 mesh 索引（从 0 开始）。

### Q3: 如何实现动画随机播放？

**A**: 使用 `animations` 数组配置多个动画，设置不同的 `weight` 值。权重越高，播放概率越大。

### Q4: 如何实现点击插槽播放视频？

**A**: 在 `overlayMedia` 中配置 `triggerSlot`，指定触发插槽和视频文件。

### Q5: 如何实现条件触发（如插槽隐藏时播放视频）？

**A**: 使用 `triggerSlotsWhenHidden`、`triggerEffectsWhenActive` 等条件触发字段。

### Q6: 如何配置多个背景图片？

**A**: 将 `backgroundImage` 设置为数组，如 `["bg1.jpg", "bg2.jpg"]`。默认使用第一个，可以通过 `backgroundImageSwitchSlot` 切换。

### Q7: 点击特效的权重如何计算？

**A**: 系统会根据所有权重值计算概率。例如，两个特效权重分别为 50 和 50，则各占 50% 概率。

### Q8: 特殊特效如何引用？

**A**: 在 `specialEffectTriggers` 中使用 `effectIndices` 数组，引用 `specialEffectLibrary` 中的索引（从 0 开始）。

### Q9: 如何实现累计计数触发？

**A**: 使用 `triggerEffectsWhenTotalCountReached` 配置累计计数。注意特效标识格式：
- 点击特效：使用图片文件名
- 特殊特效：使用 `"effect:索引"` 格式

### Q10: Canvas 对齐如何设置？

**A**: 使用 `canvasAlignLeftPercent` 或 `canvasAlignRightPercent`。值可以是 0-1（比例）或 0-100（百分数）。两个都无效时居中。

### Q11: 如何配置插槽隐藏规则？

**A**: 使用 `slotHideRules` 配置：
- `hideDuration > 0`: 自动恢复显示
- `hideDuration <= 0`: 切换模式（点击切换显示/隐藏）

### Q12: spine动画无法加载？

**A**: 目前项目只支持3.8版本的spine动画，请检查版本并在必要时使用版本转换工具。

### Q13: 如何配置插槽专属点击特效？

**A**: 使用 `slotClickEffects` 配置。点击配置的插槽时，只触发专属特效，不触发全局 `clickEffects`。

### Q14: 视频播放时如何切换 Mesh？

**A**: 在 `overlayMedia` 中配置 `switchToMeshIndex`。视频播放时开始预加载新 mesh，视频结束时切换。

### Q15: 如何调试配置问题？

**A**: 
1. 打开浏览器开发者工具（F12）
2. 查看 Console 中的错误信息
3. 检查配置文件 JSON 格式是否正确
4. 确认资源文件路径是否正确
5. 使用配置编辑器验证配置结构

---

## 总结

本配置指南涵盖了 Spine Wallpaper Engine 的所有配置项和使用方法。建议：

1. **新手**: 从基础配置开始，逐步添加功能
2. **进阶**: 使用配置编辑器可视化编辑
3. **参考**: 查看 `config/` 目录下的示例配置
4. **调试**: 使用浏览器开发者工具排查问题

如有问题，请参考示例配置或查看源代码中的类型定义 (`src/config.type.ts`)。

---

**最后更新**: 2026年
**版本**: 1.0.0
