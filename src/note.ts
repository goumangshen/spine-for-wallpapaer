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

import { NoteConfig } from './config.type';
import { ASSET_PATH } from './constants';

/**
 * 根据容器尺寸自动调整字体大小，保证有边距并尽量填充。
 */
function autoFitText(
  textEl: HTMLElement,
  boxEl: HTMLElement,
  minPx: number,
  maxPx: number,
  paddingPx: number
): void {
  const boxRect = boxEl.getBoundingClientRect();
  const targetW = Math.max(0, boxRect.width - paddingPx * 2);
  const targetH = Math.max(0, boxRect.height - paddingPx * 2);

  let fontSize = maxPx;
  textEl.style.fontSize = `${fontSize}px`;

  // 简单迭代缩小，避免复杂测量逻辑
  for (let i = 0; i < 24; i++) {
    const w = textEl.scrollWidth;
    const h = textEl.scrollHeight;
    if (w <= targetW && h <= targetH) break;
    fontSize = Math.max(minPx, Math.floor(fontSize * 0.9));
    textEl.style.fontSize = `${fontSize}px`;
    if (fontSize <= minPx) break;
  }
}

/**
 * 创建单个便签
 */
function createNote(noteConfig: NoteConfig, index: number, totalNotes: number): HTMLElement | null {
  if (noteConfig.visible === false) {
    return null; // 不显示此便签
  }

  const container = document.createElement('div');
  container.className = `note-container note-${index}`;
  container.style.position = 'fixed';
  container.style.pointerEvents = 'auto';
  container.style.zIndex = '9998'; // 在特效之下，但在普通内容之上
  container.style.cursor = 'default';
  container.style.willChange = 'transform, left, top';

  // 背景图片
  const bgImage = document.createElement('img');
  bgImage.src = ASSET_PATH + (noteConfig.backgroundImage ?? 'note.png');
  bgImage.style.display = 'block';
  bgImage.style.width = '100%';
  bgImage.style.height = '100%';
  bgImage.style.userSelect = 'none';
  (bgImage.style as any).webkitUserSelect = 'none';
  bgImage.style.pointerEvents = 'none';

  // 文字层（覆盖在图片上）
  const textBox = document.createElement('div');
  textBox.style.position = 'absolute';
  textBox.style.left = '50%';
  textBox.style.top = '50%';
  textBox.style.transform = 'translate(-50%, -50%)';
  textBox.style.width = '100%';
  textBox.style.height = '100%';
  textBox.style.display = 'flex';
  textBox.style.alignItems = 'center';
  textBox.style.justifyContent = 'center';
  textBox.style.textAlign = 'center';
  textBox.style.pointerEvents = 'none';

  const textEl = document.createElement('div');
  textEl.textContent = noteConfig.text ?? '';
  textEl.style.maxWidth = '100%';
  textEl.style.maxHeight = '100%';
  textEl.style.whiteSpace = 'pre-wrap';
  textEl.style.wordBreak = 'break-word';
  textEl.style.lineHeight = '1.2';
  textEl.style.fontWeight = '700';
  textEl.style.color = '#000';
  textEl.style.fontFamily = '楷体, KaiTi, STKaiti, serif';
  textEl.style.textShadow = '0 1px 2px rgba(255,255,255,0.5)';
  textEl.style.padding = '8%'; // 与图片边缘留一点距离
  textEl.style.boxSizing = 'border-box';

  textBox.appendChild(textEl);
  container.appendChild(bgImage);
  container.appendChild(textBox);

  // 状态管理
  let isMoving = false;
  let isCollapsed = false;
  let initialX = 0;
  let initialY = 0;
  let currentX = 0;
  let currentY = 0;
  let offsetX = 0;
  let offsetY = 0;
  let collapseDirection: 'left' | 'right' | 'top' | 'bottom' | null = null;
  let collapseTimeout: number | null = null;
  let expandTimeout: number | null = null; // 展开后自动收起的定时器
  let expandedPosition: { x: number; y: number } | null = null; // 展开时的位置
  let currentScale = noteConfig.scale ?? 0.5; // 当前缩放比例

  // 计算上边缘区域（用于点击检测）
  const TOP_EDGE_HEIGHT = 20; // 上边缘高度（像素）
  // 计算角落区域（用于点击检测）
  const CORNER_SIZE = 30; // 角落区域大小（像素）

  // 鼠标按下事件（检测是否点击上边缘、左下角或右下角）
  const handleMouseDown = (e: MouseEvent) => {
    const rect = container.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const containerWidth = rect.width;
    const containerHeight = rect.height;

    // 检查是否点击在左下角（缩小）
    if (localX <= CORNER_SIZE && localY >= containerHeight - CORNER_SIZE) {
      e.preventDefault();
      e.stopPropagation();
      if (!isCollapsed) {
        scaleNote(0.9); // 缩小到90%
      }
      return;
    }

    // 检查是否点击在右下角（放大）
    if (localX >= containerWidth - CORNER_SIZE && localY >= containerHeight - CORNER_SIZE) {
      e.preventDefault();
      e.stopPropagation();
      if (!isCollapsed) {
        scaleNote(1.1); // 放大到110%
      }
      return;
    }

    // 检查是否点击在上边缘
    if (localY <= TOP_EDGE_HEIGHT) {
      e.preventDefault();
      e.stopPropagation();

      if (isCollapsed) {
        // 如果已收起，点击上边缘展开
        expandNote();
      } else {
        // 切换跟随模式
        isMoving = !isMoving;
        if (isMoving) {
          container.style.cursor = 'move';
          // 记录点击位置相对于便签的偏移（用于跟随）
          offsetX = e.clientX - rect.left;
          offsetY = e.clientY - rect.top;
        } else {
          container.style.cursor = 'default';
        }
      }
    }
  };
  
  // 缩放便签
  const scaleNote = (scaleFactor: number) => {
    const minScale = 0.3; // 最小缩放比例
    const maxScale = 2.0; // 最大缩放比例
    
    currentScale = Math.max(minScale, Math.min(maxScale, currentScale * scaleFactor));
    
    // 获取图片原始尺寸
    if (!bgImage.complete || bgImage.naturalWidth === 0) {
      return; // 图片未加载完成，不处理
    }
    
    // 计算新的尺寸
    const newWidth = bgImage.naturalWidth * currentScale;
    const newHeight = bgImage.naturalHeight * currentScale;
    
    // 计算缩放中心点（保持便签中心位置不变）
    const rect = container.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // 更新容器尺寸
    container.style.width = `${newWidth}px`;
    container.style.height = `${newHeight}px`;
    
    // 调整位置以保持中心点不变
    const newX = centerX - newWidth / 2;
    const newY = centerY - newHeight / 2;
    
    // 限制在视口内
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const clampedX = Math.max(0, Math.min(newX, viewportWidth - newWidth));
    const clampedY = Math.max(0, Math.min(newY, viewportHeight - newHeight));
    
    container.style.left = `${clampedX}px`;
    container.style.top = `${clampedY}px`;
    currentX = clampedX;
    currentY = clampedY;
    
    // 更新文字大小
    const base = Math.min(bgImage.naturalWidth, bgImage.naturalHeight) * currentScale;
    const maxPx = Math.max(16, Math.min(120, Math.floor(base / 6)));
    const minPx = 10;
    autoFitText(textEl, bgImage, minPx, maxPx, Math.floor(base * 0.08));
    
    // 清除展开位置记录（因为便签已改变）
    expandedPosition = null;
  };

  // 鼠标移动事件（跟随模式）
  const handleMouseMove = (e: MouseEvent) => {
    if (!isMoving || isCollapsed) return;

    // 便签跟随鼠标移动（使用记录的偏移量）
    const rect = container.getBoundingClientRect();
    currentX = e.clientX - offsetX;
    currentY = e.clientY - offsetY;

    // 限制在视口内
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const containerWidth = rect.width;
    const containerHeight = rect.height;

    currentX = Math.max(0, Math.min(currentX, viewportWidth - containerWidth));
    currentY = Math.max(0, Math.min(currentY, viewportHeight - containerHeight));

    container.style.left = `${currentX}px`;
    container.style.top = `${currentY}px`;
    container.style.transform = '';
    
    // 便签被移动，清除展开位置记录（表示用户已移动便签，不需要自动收起）
    if (expandedPosition) {
      expandedPosition = null;
      if (expandTimeout) {
        clearTimeout(expandTimeout);
        expandTimeout = null;
      }
    }

    // 检查是否靠近边缘
    const collapseThreshold = 30; // 收起阈值（像素）

    if (currentX <= collapseThreshold) {
      // 靠近左边缘，收起
      collapseNote('left');
    } else if (currentX >= viewportWidth - containerWidth - collapseThreshold) {
      // 靠近右边缘，收起
      collapseNote('right');
    } else if (currentY <= collapseThreshold) {
      // 靠近上边缘，收起
      collapseNote('top');
    } else if (currentY >= viewportHeight - containerHeight - collapseThreshold) {
      // 靠近下边缘，收起
      collapseNote('bottom');
    } else {
      // 远离边缘，取消收起
      if (collapseTimeout) {
        clearTimeout(collapseTimeout);
        collapseTimeout = null;
      }
      collapseDirection = null;
    }
  };

  // 收起便签
  const collapseNote = (direction: 'left' | 'right' | 'top' | 'bottom') => {
    if (isCollapsed || collapseDirection === direction) return;

    collapseDirection = direction;
    
    // 延迟执行收起，避免快速移动时频繁触发
    if (collapseTimeout) {
      clearTimeout(collapseTimeout);
    }
    
    collapseTimeout = window.setTimeout(() => {
      if (!isMoving) return; // 如果已经停止移动，不收起

      isCollapsed = true;
      isMoving = false;
      container.style.cursor = 'default';
      
      // 设置滑入动画
      container.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';

      const rect = container.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // 露出的部分大小（像素）
      const EXPOSED_SIZE = 20; // 露出30px

      let targetX = currentX;
      let targetY = currentY;

      if (direction === 'left') {
        targetX = -rect.width + EXPOSED_SIZE; // 只露出指定像素
      } else if (direction === 'right') {
        targetX = viewportWidth - EXPOSED_SIZE; // 只露出指定像素
      } else if (direction === 'top') {
        targetY = -rect.height + EXPOSED_SIZE; // 只露出指定像素
      } else if (direction === 'bottom') {
        targetY = viewportHeight - EXPOSED_SIZE; // 只露出指定像素
      }

      // 使用 requestAnimationFrame 确保 transition 生效
      requestAnimationFrame(() => {
        container.style.left = `${targetX}px`;
        container.style.top = `${targetY}px`;
      });
      
      collapseTimeout = null;
    }, 300); // 300ms 延迟
  };

  // 展开便签
  const expandNote = () => {
    if (!isCollapsed) return;

    const savedDirection = collapseDirection;
    isCollapsed = false;
    container.style.transition = 'transform 0.3s ease-out, left 0.3s ease-out, top 0.3s ease-out';

    const rect = container.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let targetX = currentX;
    let targetY = currentY;

    // 根据收起方向计算展开位置
    if (savedDirection === 'left') {
      targetX = 0;
    } else if (savedDirection === 'right') {
      targetX = viewportWidth - rect.width;
    } else if (savedDirection === 'top') {
      targetY = 0;
    } else if (savedDirection === 'bottom') {
      targetY = viewportHeight - rect.height;
    }

    currentX = targetX;
    currentY = targetY;
    container.style.left = `${targetX}px`;
    container.style.top = `${targetY}px`;
    
    // 记录展开时的位置（用于判断是否被移动）
    expandedPosition = { x: targetX, y: targetY };
    
    // 清除之前的自动收起定时器
    if (expandTimeout) {
      clearTimeout(expandTimeout);
      expandTimeout = null;
    }
    
    // 展开后重置方向
    setTimeout(() => {
      collapseDirection = null;
      container.style.transition = '';
    }, 300);
  };
  
  // 检查并自动收起（如果便签没有被移动）
  const checkAndAutoCollapse = () => {
    if (isCollapsed || isMoving) return;
    
    // 检查便签位置是否与展开时相同（允许1px误差）
    if (expandedPosition) {
      const positionChanged = Math.abs(currentX - expandedPosition.x) > 1 || Math.abs(currentY - expandedPosition.y) > 1;
      
      if (!positionChanged) {
        // 位置没有变化，自动收起
        const rect = container.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        
        // 判断应该从哪个方向收起（选择最近的方向）
        const distToLeft = currentX;
        const distToRight = viewportWidth - (currentX + rect.width);
        const distToTop = currentY;
        const distToBottom = viewportHeight - (currentY + rect.height);
        
        const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
        let direction: 'left' | 'right' | 'top' | 'bottom';
        
        if (minDist === distToLeft) {
          direction = 'left';
        } else if (minDist === distToRight) {
          direction = 'right';
        } else if (minDist === distToTop) {
          direction = 'top';
        } else {
          direction = 'bottom';
        }
        
        // 直接收起（不需要延迟）
        collapseDirection = direction;
        isCollapsed = true;
        container.style.transition = 'left 0.3s ease-out, top 0.3s ease-out';
        
        const EXPOSED_SIZE = 30;
        let targetX = currentX;
        let targetY = currentY;
        
        if (direction === 'left') {
          targetX = -rect.width + EXPOSED_SIZE;
        } else if (direction === 'right') {
          targetX = viewportWidth - EXPOSED_SIZE;
        } else if (direction === 'top') {
          targetY = -rect.height + EXPOSED_SIZE;
        } else if (direction === 'bottom') {
          targetY = viewportHeight - EXPOSED_SIZE;
        }
        
        requestAnimationFrame(() => {
          container.style.left = `${targetX}px`;
          container.style.top = `${targetY}px`;
        });
        
        expandedPosition = null;
      } else {
        // 位置已变化，清除展开位置记录
        expandedPosition = null;
      }
    }
  };

  // 使用鼠标移动事件来检测靠近收起的便签
  const handleGlobalMouseMove = (e: MouseEvent) => {
    if (isCollapsed && collapseDirection !== null) {
      const rect = container.getBoundingClientRect();
      const PROXIMITY_THRESHOLD = 50; // 靠近阈值（像素）
      
      let shouldExpand = false;
      if (collapseDirection === 'left' && e.clientX <= PROXIMITY_THRESHOLD && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        shouldExpand = true;
      } else if (collapseDirection === 'right' && e.clientX >= window.innerWidth - PROXIMITY_THRESHOLD && e.clientY >= rect.top && e.clientY <= rect.bottom) {
        shouldExpand = true;
      } else if (collapseDirection === 'top' && e.clientY <= PROXIMITY_THRESHOLD && e.clientX >= rect.left && e.clientX <= rect.right) {
        shouldExpand = true;
      } else if (collapseDirection === 'bottom' && e.clientY >= window.innerHeight - PROXIMITY_THRESHOLD && e.clientX >= rect.left && e.clientX <= rect.right) {
        shouldExpand = true;
      }
      
      if (shouldExpand) {
        expandNote();
      }
    }
    
    // 检查鼠标是否在便签区域内
    if (!isCollapsed && expandedPosition) {
      const rect = container.getBoundingClientRect();
      const isMouseOver = e.clientX >= rect.left && e.clientX <= rect.right && 
                          e.clientY >= rect.top && e.clientY <= rect.bottom;
      
      // 清除之前的自动收起定时器
      if (expandTimeout) {
        clearTimeout(expandTimeout);
        expandTimeout = null;
      }
      
      // 如果鼠标不在便签区域内，延迟后检查是否需要自动收起
      if (!isMouseOver) {
        expandTimeout = window.setTimeout(() => {
          checkAndAutoCollapse();
          expandTimeout = null;
        }, 1000); // 1秒后检查（给用户时间移动便签）
      }
    }
  };
  
  // 鼠标进入便签区域时，取消自动收起
  const handleMouseEnter = () => {
    if (expandTimeout) {
      clearTimeout(expandTimeout);
      expandTimeout = null;
    }
  };
  
  // 鼠标离开便签区域时，延迟后检查是否需要自动收起
  const handleMouseLeave = () => {
    if (!isCollapsed && expandedPosition && !isMoving) {
      expandTimeout = window.setTimeout(() => {
        checkAndAutoCollapse();
        expandTimeout = null;
      }, 1000); // 1秒后检查
    }
  };

  // 等待图片加载完成后设置尺寸和文字
  const setupNote = () => {
    if (!bgImage.complete || bgImage.naturalWidth === 0) {
      bgImage.addEventListener('load', setupNote, { once: true });
      return;
    }

    // 设置容器尺寸为图片原始尺寸（应用缩放）
    container.style.width = `${bgImage.naturalWidth * currentScale}px`;
    container.style.height = `${bgImage.naturalHeight * currentScale}px`;

    // 初始位置：随机分布在屏幕上（避免重叠）
    const scaledWidth = bgImage.naturalWidth * currentScale;
    const scaledHeight = bgImage.naturalHeight * currentScale;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxX = Math.max(0, viewportWidth - scaledWidth);
    const maxY = Math.max(0, viewportHeight - scaledHeight);
    
    // 使用索引来分散位置，避免重叠
    const cols = Math.ceil(Math.sqrt(totalNotes));
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = cols > 1 ? (maxX / (cols - 1)) * col : maxX / 2;
    const y = cols > 1 ? (maxY / (cols - 1)) * row : maxY / 2;

    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
    currentX = x;
    currentY = y;

    // 自适应文字大小（考虑缩放）
    const base = Math.min(bgImage.naturalWidth, bgImage.naturalHeight) * currentScale;
    const maxPx = Math.max(16, Math.min(120, Math.floor(base / 6)));
    const minPx = 10;
    autoFitText(textEl, bgImage, minPx, maxPx, Math.floor(base * 0.08));

    // 添加事件监听
    container.addEventListener('mousedown', handleMouseDown);
    container.addEventListener('mouseenter', handleMouseEnter);
    container.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousemove', handleGlobalMouseMove);
  };

  setupNote();

  return container;
}

// 存储当前所有便签元素的映射：key 为索引，value 为便签元素
const noteElementsMap = new Map<number, HTMLElement>();

/**
 * 初始化便签功能
 * @param notes 便签配置数组
 */
export function initNotes(notes: NoteConfig[] | undefined): void {
  if (!notes || notes.length === 0) {
    return;
  }

  // 创建所有便签
  notes.forEach((noteConfig, index) => {
    const noteElement = createNote(noteConfig, index, notes.length);
    if (noteElement) {
      document.body.appendChild(noteElement);
      noteElementsMap.set(index, noteElement);
    }
  });
}

/**
 * 同步便签配置（删除、修改、新增）
 * @param newNotes 新的便签配置数组
 */
export function syncNotes(newNotes: NoteConfig[] | undefined): void {
  const newNotesArray = newNotes || [];
  const newNotesMap = new Map<number, NoteConfig>();
  
  // 构建新配置的映射
  newNotesArray.forEach((noteConfig, index) => {
    newNotesMap.set(index, noteConfig);
  });

  // 1. 删除：移除在新配置中不存在的便签
  for (const [index, element] of noteElementsMap.entries()) {
    if (!newNotesMap.has(index)) {
      // 便签已被删除
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      noteElementsMap.delete(index);
    }
  }

  // 2. 修改和新增：遍历新配置
  newNotesArray.forEach((noteConfig, index) => {
    const existingElement = noteElementsMap.get(index);
    
    if (existingElement) {
      // 便签已存在，检查是否需要更新
      const bgImage = existingElement.querySelector('img') as HTMLImageElement;
      const textEl = existingElement.querySelector('div > div') as HTMLElement;
      
      if (!bgImage || !textEl) {
        // 元素结构异常，重新创建
        if (existingElement.parentNode) {
          existingElement.parentNode.removeChild(existingElement);
        }
        noteElementsMap.delete(index);
        
        const newElement = createNote(noteConfig, index, newNotesArray.length);
        if (newElement) {
          document.body.appendChild(newElement);
          noteElementsMap.set(index, newElement);
        }
        return;
      }
      
      // 检查配置是否有变化
      const currentBgSrc = bgImage.src;
      const newBgSrc = ASSET_PATH + (noteConfig.backgroundImage ?? 'note.png');
      const currentText = textEl.textContent;
      const newText = noteConfig.text ?? '';
      const currentScale = parseFloat(existingElement.style.width) / (bgImage.naturalWidth || 1);
      const newScale = noteConfig.scale ?? 0.5;
      
      let needsUpdate = false;
      
      // 检查背景图片
      if (currentBgSrc !== newBgSrc) {
        bgImage.src = newBgSrc;
        needsUpdate = true;
      }
      
      // 检查文字内容
      if (currentText !== newText) {
        textEl.textContent = newText;
        needsUpdate = true;
      }
      
      // 检查可见性
      if (noteConfig.visible === false) {
        existingElement.style.display = 'none';
      } else {
        existingElement.style.display = '';
      }
      
      // 如果配置有变化，需要重新设置尺寸和文字大小
      if (needsUpdate || Math.abs(currentScale - newScale) > 0.01) {
        // 等待图片加载完成后更新
        if (bgImage.complete && bgImage.naturalWidth > 0) {
          updateNoteSize(existingElement, bgImage, textEl, newScale);
        } else {
          bgImage.addEventListener('load', () => {
            updateNoteSize(existingElement, bgImage, textEl, newScale);
          }, { once: true });
        }
      }
    } else {
      // 便签不存在，创建新的
      if (noteConfig.visible !== false) {
        const newElement = createNote(noteConfig, index, newNotesArray.length);
        if (newElement) {
          document.body.appendChild(newElement);
          noteElementsMap.set(index, newElement);
        }
      }
    }
  });
}

/**
 * 更新便签尺寸和文字大小
 */
function updateNoteSize(
  container: HTMLElement,
  bgImage: HTMLImageElement,
  textEl: HTMLElement,
  scale: number
): void {
  if (!bgImage.complete || bgImage.naturalWidth === 0) {
    return;
  }
  
  const base = Math.min(bgImage.naturalWidth, bgImage.naturalHeight) * scale;
  const maxPx = Math.max(16, Math.min(120, Math.floor(base / 6)));
  const minPx = 10;
  autoFitText(textEl, bgImage, minPx, maxPx, Math.floor(base * 0.08));
  
  // 更新容器尺寸
  container.style.width = `${bgImage.naturalWidth * scale}px`;
  container.style.height = `${bgImage.naturalHeight * scale}px`;
}
