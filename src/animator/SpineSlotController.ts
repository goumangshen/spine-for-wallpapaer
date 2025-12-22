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

/**
 * 插槽交互配置
 */
export interface SlotInteractionConfig {
  /** 插槽名称 */
  slotName: string;
  /** 点击时的回调函数 */
  onClick?: () => void;
  /** 是否应该被强制隐藏 */
  forceHidden?: boolean;
}

/**
 * Spine插槽控制器
 * 负责管理插槽的显示/隐藏和点击检测
 */
export class SpineSlotController {
  private skeletonMesh: threejsSpine.SkeletonMesh;
  private forceHiddenSlots: Map<string, boolean> = new Map(); // 记录需要强制隐藏的插槽
  private originalGetAttachment: ((slot: any) => any) | null = null; // 保存原始的getAttachment方法
  private unloadedSlots: Set<string> = new Set(); // 记录已卸载的插槽

  constructor(skeletonMesh: threejsSpine.SkeletonMesh) {
    this.skeletonMesh = skeletonMesh;
    // 拦截slot的getAttachment方法，确保隐藏的slot始终返回null
    this.interceptGetAttachment();
  }

  /**
   * 拦截所有slot的getAttachment方法（初始化时调用）
   */
  private interceptGetAttachment(): void {
    // 这个方法现在主要用于初始化，实际的拦截在hideSlot和update中进行
    // 因为slot可能在动画开始后才创建
  }

  /**
   * 获取所有可用的插槽名称
   * @returns 所有插槽名称的数组
   */
  public getAllSlotNames(): string[] {
    return this.skeletonMesh.skeleton.slots.map(s => s.data.name);
  }

  /**
   * 卸载指定名称的插槽（从setup pose中移除attachment，使其永远不会被加载）
   * @param slotName 插槽名称
   */
  public unloadSlot(slotName: string): void {
    const skeleton = this.skeletonMesh.skeleton;
    const slot = skeleton.findSlot(slotName);
    if (slot) {
      // 修改slot的setup pose数据，移除attachmentName
      // 这样在动画重置到setup pose时，这个slot就不会有attachment
      if (slot.data) {
        slot.data.attachmentName = null;
      }
      
      // 立即移除当前的attachment
      slot.attachment = null;
      slot.color.a = 0;
      
      // 标记为已卸载
      this.unloadedSlots.add(slotName);
      this.forceHiddenSlots.set(slotName, true);
      
      // 拦截getAttachment方法
      this.interceptSlotGetAttachment(slot);
      
      console.log(`Slot "${slotName}" has been unloaded`);
    } else {
      const availableSlots = skeleton.slots.map(s => s.data.name);
      console.warn(`Slot "${slotName}" not found. Available slots:`, availableSlots);
      // 尝试模糊匹配（包含下划线的插槽名称）
      const similarSlots = availableSlots.filter(name => 
        name.includes('_') && name.toLowerCase().includes(slotName.toLowerCase().replace(/_/g, ''))
      );
      if (similarSlots.length > 0) {
        console.warn(`Did you mean one of these?`, similarSlots);
      }
    }
  }

  /**
   * 隐藏指定名称的插槽（运行时隐藏，但不卸载资源）
   * @param slotName 插槽名称
   */
  public hideSlot(slotName: string): void {
    // 如果已经卸载，直接返回
    if (this.unloadedSlots.has(slotName)) {
      return;
    }
    
    const skeleton = this.skeletonMesh.skeleton;
    if (!skeleton) {
      console.warn(`Cannot hide slot "${slotName}": skeleton is null`);
      return;
    }
    
    const slot = skeleton.findSlot(slotName);
    if (slot) {
      // 设置颜色alpha为0，确保完全透明
      slot.color.a = 0;
      // 同时将attachment设置为null，完全移除渲染
      slot.attachment = null;
      this.forceHiddenSlots.set(slotName, true);
      
      // 拦截getAttachment方法，确保即使动画重新设置attachment，也会返回null
      this.interceptSlotGetAttachment(slot);
    } else {
      const availableSlots = skeleton.slots.map(s => s.data.name);
      console.warn(`Slot "${slotName}" not found. Available slots:`, availableSlots);
      // 尝试模糊匹配（包含下划线的插槽名称）
      const similarSlots = availableSlots.filter(name => 
        name.includes('_') && name.toLowerCase().includes(slotName.toLowerCase().replace(/_/g, ''))
      );
      if (similarSlots.length > 0) {
        console.warn(`Did you mean one of these?`, similarSlots);
      }
    }
  }

  /**
   * 拦截单个slot的getAttachment方法
   */
  private interceptSlotGetAttachment(slot: any): void {
    if (!slot || slot._originalGetAttachment) return; // 已经拦截过了
    
    // 保存原始的getAttachment方法
    slot._originalGetAttachment = slot.getAttachment || (() => slot.attachment);
    
    // 重写getAttachment方法
    slot.getAttachment = () => {
      // 如果这个slot需要被隐藏，返回null
      if (this.forceHiddenSlots.get(slot.data.name) === true) {
        return null;
      }
      // 否则调用原始方法
      return slot._originalGetAttachment.call(slot);
    };
  }

  /**
   * 显示指定名称的插槽
   * @param slotName 插槽名称
   */
  public showSlot(slotName: string): void {
    const skeleton = this.skeletonMesh.skeleton;
    if (!skeleton) {
      console.warn(`Cannot show slot "${slotName}": skeleton is null`);
      return;
    }
    
    const slot = skeleton.findSlot(slotName);
    if (slot) {
      // 从强制隐藏列表中完全删除（而不是设置为false），这样 update 方法就不会再处理它
      this.forceHiddenSlots.delete(slotName);
      
      // 恢复alpha值
      slot.color.a = 1;
      
      // 恢复原始的 getAttachment 方法（如果被拦截过）
      const slotAny = slot as any;
      if (slotAny._originalGetAttachment) {
        slot.getAttachment = slotAny._originalGetAttachment;
        delete slotAny._originalGetAttachment;
      }
      
      // 手动恢复 attachment（如果 slot.data.attachmentName 存在）
      if (slot.data && slot.data.attachmentName) {
        try {
          const attachment = skeleton.getAttachment(slot.data.index, slot.data.attachmentName);
          if (attachment) {
            slot.attachment = attachment;
          } else {
            console.warn(`Attachment "${slot.data.attachmentName}" not found for slot "${slotName}"`);
          }
        } catch (e) {
          console.warn(`Failed to restore attachment for "${slotName}":`, e);
        }
      }
    } else {
      const availableSlots = skeleton.slots.map(s => s.data.name);
      console.warn(`Slot "${slotName}" not found. Available slots:`, availableSlots);
      // 尝试模糊匹配（包含下划线的插槽名称）
      const similarSlots = availableSlots.filter(name => 
        name.includes('_') && name.toLowerCase().includes(slotName.toLowerCase().replace(/_/g, ''))
      );
      if (similarSlots.length > 0) {
        console.warn(`Did you mean one of these?`, similarSlots);
      }
    }
  }

  /**
   * 切换指定插槽的显示/隐藏状态
   * @param slotName 插槽名称
   * @returns 切换后的状态，true表示显示，false表示隐藏
   */
  public toggleSlotVisibility(slotName: string): boolean {
    const skeleton = this.skeletonMesh.skeleton;
    const slot = skeleton.findSlot(slotName);
    if (!slot) {
      const availableSlots = skeleton.slots.map(s => s.data.name);
      console.warn(`Slot "${slotName}" not found. Available slots:`, availableSlots);
      // 尝试模糊匹配（包含下划线的插槽名称）
      const similarSlots = availableSlots.filter(name => 
        name.includes('_') && name.toLowerCase().includes(slotName.toLowerCase().replace(/_/g, ''))
      );
      if (similarSlots.length > 0) {
        console.warn(`Did you mean one of these?`, similarSlots);
      }
      return false;
    }

    // 切换显示状态：如果当前是隐藏的（在forceHiddenSlots中），则显示，否则隐藏
    const isCurrentlyHidden = this.forceHiddenSlots.get(slotName) === true;
    if (isCurrentlyHidden) {
      // 显示：恢复alpha值，attachment会由动画自动设置
      slot.color.a = 1;
      this.forceHiddenSlots.set(slotName, false);
      console.log(`Slot "${slotName}" is now visible`);
      return true; // 切换后是显示的
    } else {
      // 隐藏：设置alpha为0并移除attachment
      slot.color.a = 0;
      slot.attachment = null;
      this.forceHiddenSlots.set(slotName, true);
      console.log(`Slot "${slotName}" is now hidden`);
      return false; // 切换后是隐藏的
    }
  }

  /**
   * 设置插槽的可见性
   * @param slotName 插槽名称
   * @param visible 是否可见
   */
  public setSlotVisibility(slotName: string, visible: boolean): void {
    if (visible) {
      this.showSlot(slotName);
    } else {
      this.hideSlot(slotName);
    }
  }

  /**
   * 检查点击位置是否在指定插槽上
   * @param screenX 屏幕X坐标（相对于canvas，原点在左上角）
   * @param screenY 屏幕Y坐标（相对于canvas，原点在左上角）
   * @param canvasWidth canvas宽度
   * @param canvasHeight canvas高度
   * @param slotName 插槽名称
   * @returns 如果点击在插槽上返回true
   */
  public checkSlotClick(
    screenX: number,
    screenY: number,
    canvasWidth: number,
    canvasHeight: number,
    slotName: string
  ): boolean {
    const skeleton = this.skeletonMesh.skeleton;
    const slot = skeleton.findSlot(slotName);

    if (!slot) {
      const availableSlots = skeleton.slots.map(s => s.data.name);
      console.log(`Slot "${slotName}" not found. Available slots:`, availableSlots);
      // 尝试模糊匹配（包含下划线的插槽名称）
      const similarSlots = availableSlots.filter(name => 
        name.includes('_') && name.toLowerCase().includes(slotName.toLowerCase().replace(/_/g, ''))
      );
      if (similarSlots.length > 0) {
        console.log(`Did you mean one of these?`, similarSlots);
      }
      return false;
    }

    if (!slot.attachment) {
      console.log(`Slot "${slotName}" has no attachment`);
      return false;
    }

    if (!slot.bone.active) {
      console.log(`Slot "${slotName}" bone is not active`);
      return false;
    }

    const attachment = slot.attachment;
    const tempVertices: number[] = [];

    // 计算附件的世界顶点（Spine坐标系，2D）
    let vertices: ArrayLike<number> | null = null;
    let verticesLength = 0;

    // 检查附件类型并计算世界顶点
    if ((attachment as any).computeWorldVertices) {
      // RegionAttachment或MeshAttachment
      if ((attachment as any).worldVerticesLength !== undefined) {
        // MeshAttachment
        verticesLength = (attachment as any).worldVerticesLength;
        tempVertices.length = verticesLength;
        (attachment as any).computeWorldVertices(slot, 0, verticesLength, tempVertices, 0, 2);
        vertices = tempVertices;
      } else {
        // RegionAttachment (8个值: x1,y1,x2,y2,x3,y3,x4,y4)
        verticesLength = 8;
        tempVertices.length = verticesLength;
        (attachment as any).computeWorldVertices(slot.bone, tempVertices, 0, 2);
        vertices = tempVertices;
      }
    }

    if (!vertices || verticesLength === 0) {
      console.log(`Slot "${slotName}" has no valid vertices`);
      return false;
    }

    // 计算插槽的边界框（Spine坐标系）
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let i = 0; i < verticesLength; i += 2) {
      const x = vertices[i];
      const y = vertices[i + 1];
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    // 获取skeleton的位置和缩放
    const skeletonX = skeleton.x;
    const skeletonY = skeleton.y;
    const skeletonScaleX = skeleton.scaleX;
    const skeletonScaleY = skeleton.scaleY;

    // 获取skeletonMesh的父对象（mesh）的位置
    const parentMesh = this.skeletonMesh.parent as THREE.Mesh;
    const parentX = parentMesh ? parentMesh.position.x : 0;
    const parentY = parentMesh ? parentMesh.position.y : 0;

    // 将Spine坐标转换为屏幕坐标
    // Spine坐标系：原点在skeleton中心（或根据skeleton.x/y偏移），Y轴向上
    // 屏幕坐标系：原点在canvas左上角，Y轴向下
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;

    // 计算插槽在屏幕上的位置
    // 需要考虑：skeleton的位置、缩放、父mesh的位置
    // 注意：Spine的Y轴向上，屏幕Y轴向下，所以需要翻转Y
    const slotScreenMinX = centerX + (minX * skeletonScaleX + skeletonX + parentX);
    const slotScreenMaxX = centerX + (maxX * skeletonScaleX + skeletonX + parentX);
    const slotScreenMinY = centerY - (maxY * skeletonScaleY + skeletonY + parentY);
    const slotScreenMaxY = centerY - (minY * skeletonScaleY + skeletonY + parentY);

    // 检查点击位置是否在边界框内
    const isInside = (
      screenX >= slotScreenMinX &&
      screenX <= slotScreenMaxX &&
      screenY >= slotScreenMinY &&
      screenY <= slotScreenMaxY
    );

    // 添加调试信息
    if (isInside || Math.abs(screenX - (slotScreenMinX + slotScreenMaxX) / 2) < 100) {
      console.log(`Slot "${slotName}" check:`, {
        screenX,
        screenY,
        slotBounds: { slotScreenMinX, slotScreenMaxX, slotScreenMinY, slotScreenMaxY },
        spineBounds: { minX, maxX, minY, maxY },
        skeleton: { x: skeletonX, y: skeletonY, scaleX: skeletonScaleX, scaleY: skeletonScaleY },
        parent: { x: parentX, y: parentY },
        isInside
      });
    }

    return isInside;
  }

  /**
   * 获取所有当前隐藏的插槽名称列表
   * @returns 隐藏的插槽名称数组
   */
  public getAllHiddenSlotNames(): string[] {
    const hiddenSlots: string[] = [];
    this.forceHiddenSlots.forEach((shouldHide, slotName) => {
      if (shouldHide) {
        hiddenSlots.push(slotName);
      }
    });
    return hiddenSlots;
  }

  /**
   * 恢复所有隐藏的插槽
   */
  public restoreAllHiddenSlots(): void {
    const hiddenSlotNames = this.getAllHiddenSlotNames();
    hiddenSlotNames.forEach(slotName => {
      this.showSlot(slotName);
    });
  }

  /**
   * 检查指定插槽是否处于隐藏状态
   * @param slotName 插槽名称
   * @returns 如果插槽隐藏返回 true，否则返回 false
   */
  public isSlotHidden(slotName: string): boolean {
    // 检查是否在强制隐藏列表中
    if (this.forceHiddenSlots.get(slotName) === true) {
      return true;
    }
    
    // 检查是否已卸载
    if (this.unloadedSlots.has(slotName)) {
      return true;
    }
    
    // 检查插槽的实际状态
    const skeleton = this.skeletonMesh.skeleton;
    if (!skeleton) {
      return false;
    }
    
    const slot = skeleton.findSlot(slotName);
    if (!slot) {
      return false;
    }
    
    // 如果插槽的 alpha 为 0 或没有 attachment，则认为隐藏
    return slot.color.a === 0 || slot.attachment === null;
  }

  /**
   * 更新方法，应该在每帧调用
   * 用于持续保持需要强制隐藏的插槽处于隐藏状态
   */
  public update(): void {
    const skeleton = this.skeletonMesh.skeleton;
    if (!skeleton) return;

    // 如果插槽应该被强制隐藏，则持续隐藏它（防止动画改变其alpha值或重新设置attachment）
    this.forceHiddenSlots.forEach((shouldHide, slotName) => {
      if (shouldHide) {
        const slot = skeleton.findSlot(slotName);
        if (slot) {
          // 确保alpha始终为0，完全透明
          slot.color.a = 0;
          
          // 对于已卸载的插槽，确保setup pose数据中的attachmentName为null
          if (this.unloadedSlots.has(slotName) && slot.data) {
            slot.data.attachmentName = null;
          }
          
          // 移除attachment，完全停止渲染（防止动画重新设置attachment后显示）
          slot.attachment = null;
          
          // 确保getAttachment方法被拦截（如果slot是新创建的或方法被覆盖）
          this.interceptSlotGetAttachment(slot);
        }
      }
    });
  }
}

