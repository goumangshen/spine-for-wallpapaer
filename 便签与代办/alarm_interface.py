"""
闹钟设置界面模块
用于编辑specialEffectTriggers中带triggerAtSecondOfDay的配置
"""
import tkinter as tk
from tkinter import ttk, messagebox
from typing import Dict, List, Optional, Any
import os
from config_manager import ConfigManager
from utils import AudioPlayer, find_mp3_files, seconds_to_time, time_to_seconds


class AlarmInterface:
    """闹钟设置界面类"""
    
    def __init__(self, parent: tk.Tk, config_manager: ConfigManager, directory: str):
        self.parent = parent
        self.config_manager = config_manager
        self.directory = directory
        self.audio_player = AudioPlayer()
        
        # 创建窗口
        self.window = tk.Toplevel(parent)
        self.window.title("闹钟设置")
        self.window.geometry("600x500")
        
        # 数据存储
        self.alarms: List[Dict[str, Any]] = []
        self.type6_effects: List[Dict[str, Any]] = []
        self.mp3_files: List[str] = []
        
        self._load_data()
        self._create_ui()
        self._refresh_alarm_list()
    
    def _load_data(self):
        """加载数据"""
        # 获取所有特效（用于建立索引映射）
        all_effects = self.config_manager.config_data.get("specialEffectLibrary", [])
        
        # 建立type6特效在specialEffectLibrary中的实际索引映射
        self.type6_to_actual_index = {}  # type6索引 -> specialEffectLibrary实际索引
        type6_count = 0
        for i, effect in enumerate(all_effects):
            if effect.get("type") == 6:
                self.type6_to_actual_index[type6_count] = i
                type6_count += 1
        
        # 加载type6特效
        self.type6_effects = self.config_manager.get_type6_effects()
        
        # 加载时间触发配置
        time_triggers = self.config_manager.get_time_triggers()
        
        # 建立实际索引到type6索引的反向映射
        actual_to_type6_index = {v: k for k, v in self.type6_to_actual_index.items()}
        
        # 转换为闹钟格式
        self.alarms = []
        self.trigger_to_alarm_map = {}  # trigger在time_triggers中的索引 -> alarm索引
        
        for trigger_idx, trigger in enumerate(time_triggers):
            seconds_str = trigger.get("triggerAtSecondOfDay", "0")
            try:
                seconds = int(seconds_str)
            except (ValueError, TypeError):
                seconds = 0
            
            if seconds >= 100000:  # 关闭的闹钟
                enabled = False
                seconds = seconds - 100000  # 恢复原始时间
            else:
                enabled = True
            
            effect_indices = trigger.get("effectIndices", [])
            if effect_indices and len(effect_indices) > 0:
                actual_index = effect_indices[0] if isinstance(effect_indices[0], int) else effect_indices[0][0]
                # 转换为type6索引
                type6_index = actual_to_type6_index.get(actual_index, -1)
                if 0 <= type6_index < len(self.type6_effects):
                    effect = self.type6_effects[type6_index]
                    alarm = {
                        "seconds": seconds,
                        "enabled": enabled,
                        "name": effect.get("text", ""),
                        "audio_file": effect.get("audioFileName", ""),
                        "loop": effect.get("loop", False),
                        "type6_index": type6_index,  # type6特效列表中的索引
                        "actual_index": actual_index,  # specialEffectLibrary中的实际索引
                        "trigger": trigger.copy(),  # 保存完整的trigger对象
                        "trigger_index": trigger_idx  # trigger在time_triggers中的索引
                    }
                    self.alarms.append(alarm)
                    self.trigger_to_alarm_map[trigger_idx] = len(self.alarms) - 1
        
        # 加载mp3文件列表
        self.mp3_files = find_mp3_files(self.directory)
    
    def _create_ui(self):
        """创建界面"""
        # 主框架
        main_frame = ttk.Frame(self.window, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 标题
        title_label = ttk.Label(main_frame, text="闹钟设置", font=("Arial", 16, "bold"))
        title_label.pack(pady=(0, 10))
        
        # 闹钟列表框架
        list_frame = ttk.LabelFrame(main_frame, text="闹钟列表", padding="10")
        list_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # 列表和滚动条
        list_scroll = ttk.Scrollbar(list_frame)
        list_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.alarm_listbox = tk.Listbox(list_frame, yscrollcommand=list_scroll.set, height=10)
        self.alarm_listbox.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        list_scroll.config(command=self.alarm_listbox.yview)
        
        self.alarm_listbox.bind('<<ListboxSelect>>', self._on_alarm_select)
        
        # 按钮框架
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Button(button_frame, text="添加闹钟", command=self._add_alarm).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(button_frame, text="删除闹钟", command=self._delete_alarm).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="保存", command=self._save_alarms).pack(side=tk.RIGHT)
    
    def _refresh_alarm_list(self):
        """刷新闹钟列表显示"""
        self.alarm_listbox.delete(0, tk.END)
        for alarm in self.alarms:
            status = "✓" if alarm["enabled"] else "✗"
            time_str = seconds_to_time(alarm["seconds"])
            name = alarm["name"] if alarm["name"] else "未命名"
            self.alarm_listbox.insert(tk.END, f"{status} {time_str} - {name}")
    
    def _on_alarm_select(self, event):
        """选择闹钟时的事件处理"""
        selection = self.alarm_listbox.curselection()
        if selection:
            index = selection[0]
            self._edit_alarm(index)
    
    def _add_alarm(self):
        """添加新闹钟"""
        self._edit_alarm(-1)
    
    def _edit_alarm(self, index: int):
        """编辑闹钟（index=-1表示新建）"""
        # 创建编辑窗口
        edit_window = tk.Toplevel(self.window)
        edit_window.title("编辑闹钟" if index >= 0 else "添加闹钟")
        edit_window.geometry("400x350")
        edit_window.transient(self.window)
        edit_window.grab_set()
        
        # 获取当前闹钟数据
        if index >= 0:
            alarm = self.alarms[index].copy()
            # 确保actual_index存在
            if "actual_index" not in alarm or alarm["actual_index"] is None:
                alarm["actual_index"] = self.type6_to_actual_index.get(alarm.get("type6_index", 0), -1)
        else:
            alarm = {
                "seconds": 0,
                "enabled": True,
                "name": "",
                "audio_file": "",
                "loop": False,
                "type6_index": 0,
                "actual_index": -1
            }
        
        # 创建表单
        form_frame = ttk.Frame(edit_window, padding="20")
        form_frame.pack(fill=tk.BOTH, expand=True)
        
        # 时间设置
        ttk.Label(form_frame, text="时间 (HH:MM):").grid(row=0, column=0, sticky=tk.W, pady=5)
        time_var = tk.StringVar(value=seconds_to_time(alarm["seconds"]))
        time_entry = ttk.Entry(form_frame, textvariable=time_var, width=10)
        time_entry.grid(row=0, column=1, sticky=tk.W, pady=5, padx=(10, 0))
        
        # 启用状态
        enabled_var = tk.BooleanVar(value=alarm["enabled"])
        ttk.Checkbutton(form_frame, text="启用", variable=enabled_var).grid(row=1, column=0, columnspan=2, sticky=tk.W, pady=5)
        
        # 名称
        ttk.Label(form_frame, text="名称:").grid(row=2, column=0, sticky=tk.W, pady=5)
        name_var = tk.StringVar(value=alarm["name"])
        name_entry = ttk.Entry(form_frame, textvariable=name_var, width=30)
        name_entry.grid(row=2, column=1, sticky=tk.W, pady=5, padx=(10, 0))
        
        # 音乐文件
        ttk.Label(form_frame, text="音乐:").grid(row=3, column=0, sticky=tk.W, pady=5)
        audio_var = tk.StringVar(value=alarm["audio_file"])
        audio_combo = ttk.Combobox(form_frame, textvariable=audio_var, values=self.mp3_files, width=27, state="readonly")
        audio_combo.grid(row=3, column=1, sticky=tk.W, pady=5, padx=(10, 0))
        
        # 试听按钮
        def play_preview():
            audio_file = audio_var.get()
            if audio_file:
                file_path = os.path.join(self.directory, audio_file)
                self.audio_player.play_audio(file_path, loop_var.get())
        
        ttk.Button(form_frame, text="试听", command=play_preview).grid(row=3, column=2, padx=(5, 0))
        
        # 循环播放
        loop_var = tk.BooleanVar(value=alarm["loop"])
        ttk.Checkbutton(form_frame, text="循环播放", variable=loop_var).grid(row=4, column=0, columnspan=2, sticky=tk.W, pady=5)
        
        # 按钮框架
        button_frame = ttk.Frame(form_frame)
        button_frame.grid(row=5, column=0, columnspan=3, pady=20)
        
        def save_alarm():
            # 验证时间
            time_str = time_var.get()
            seconds = time_to_seconds(time_str)
            if seconds < 0:
                messagebox.showerror("错误", "时间格式不正确，请使用 HH:MM 格式")
                return
            
            # 停止试听
            self.audio_player.stop_audio()
            
            if index >= 0:
                # 更新现有闹钟
                old_alarm = self.alarms[index]
                type6_index = old_alarm["type6_index"]
                actual_index = old_alarm["actual_index"]
                
                # 获取原有的type6特效，保留其他字段
                old_effect = self.type6_effects[type6_index].copy()
                
                # 更新对应的type6特效（保留原有字段，只更新text、audioFileName和loop）
                effect_data = old_effect.copy()
                effect_data["text"] = name_var.get()
                if audio_var.get():
                    effect_data["audioFileName"] = audio_var.get()
                else:
                    effect_data.pop("audioFileName", None)
                
                if loop_var.get():
                    effect_data["loop"] = True
                else:
                    effect_data.pop("loop", None)
                
                self.config_manager.set_type6_effect(type6_index, effect_data)
                
                # 更新trigger（保留原有trigger的其他字段）
                trigger = old_alarm.get("trigger", {}).copy()
                trigger["triggerAtSecondOfDay"] = str(seconds if enabled_var.get() else seconds + 100000)
                trigger["effectIndices"] = [actual_index]
                
                alarm_data = {
                    "seconds": seconds,
                    "enabled": enabled_var.get(),
                    "name": name_var.get(),
                    "audio_file": audio_var.get(),
                    "loop": loop_var.get(),
                    "type6_index": type6_index,
                    "actual_index": actual_index,
                    "trigger": trigger,
                    "trigger_index": old_alarm["trigger_index"]
                }
                self.alarms[index] = alarm_data
            else:
                # 添加新闹钟
                # 创建新的type6特效
                effect_data = {
                    "type": 6,
                    "image1FileName": "dhk.png",  # 默认值，可以后续扩展
                    "initialScale": 0.5,
                    "finalScale": 1,
                    "initialRotation": 90,
                    "finalRotation": 0,
                    "alignLeftPercent": 0.52,
                    "alignRightPercent": -1,
                    "verticalFromBottomPercent": 85,
                    "text": name_var.get(),
                    "scaleDuration": 500,
                    "fadeOutDuration": -1
                }
                
                if audio_var.get():
                    effect_data["audioFileName"] = audio_var.get()
                
                if loop_var.get():
                    effect_data["loop"] = True
                
                actual_index = self.config_manager.add_type6_effect(effect_data)
                
                # 重新加载以更新索引映射
                old_alarm_count = len(self.alarms)
                self._load_data()
                
                # 找到新添加的闹钟对应的type6_index
                type6_index = None
                for t6_idx, act_idx in self.type6_to_actual_index.items():
                    if act_idx == actual_index:
                        type6_index = t6_idx
                        break
                
                if type6_index is not None:
                    # 创建新的trigger
                    trigger = {
                        "triggerAtSecondOfDay": str(seconds if enabled_var.get() else seconds + 100000),
                        "effectIndices": [actual_index]
                    }
                    
                    alarm_data = {
                        "seconds": seconds,
                        "enabled": enabled_var.get(),
                        "name": name_var.get(),
                        "audio_file": audio_var.get(),
                        "loop": loop_var.get(),
                        "type6_index": type6_index,
                        "actual_index": actual_index,
                        "trigger": trigger,
                        "trigger_index": old_alarm_count
                    }
                    self.alarms.append(alarm_data)
            
            edit_window.destroy()
            self._refresh_alarm_list()
        
        ttk.Button(button_frame, text="确定", command=save_alarm).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="取消", command=lambda: (self.audio_player.stop_audio(), edit_window.destroy())).pack(side=tk.LEFT, padx=5)
    
    def _delete_alarm(self):
        """删除闹钟"""
        selection = self.alarm_listbox.curselection()
        if not selection:
            messagebox.showwarning("警告", "请先选择要删除的闹钟")
            return
        
        if messagebox.askyesno("确认", "确定要删除选中的闹钟吗？"):
            index = selection[0]
            alarm = self.alarms[index]
            
            # 先删除对应的trigger
            self._remove_time_trigger(alarm["trigger_index"])
            
            # 获取要删除的actual_index
            actual_index_to_delete = alarm["actual_index"]
            
            # 删除对应的type6特效（这会改变索引）
            type6_index = alarm["type6_index"]
            self.config_manager.remove_type6_effect(type6_index)
            
            # 重新加载数据以更新索引映射（因为删除特效后索引会变化）
            self._load_data()
            self._refresh_alarm_list()
    
    def _remove_time_trigger(self, trigger_index: int):
        """删除指定索引的时间触发配置"""
        if not self.config_manager.config_data:
            return
        
        meshes = self.config_manager.config_data.get("meshes", [])
        if not meshes:
            return
        
        triggers = meshes[0].get("specialEffectTriggers", [])
        time_triggers = [t for t in triggers if "triggerAtSecondOfDay" in t]
        
        if 0 <= trigger_index < len(time_triggers):
            # 找到要删除的trigger在完整列表中的位置
            time_trigger = time_triggers[trigger_index]
            # 通过比较triggerAtSecondOfDay和effectIndices来找到要删除的trigger
            for i, trigger in enumerate(triggers):
                if trigger.get("triggerAtSecondOfDay") == time_trigger.get("triggerAtSecondOfDay") and \
                   trigger.get("effectIndices") == time_trigger.get("effectIndices"):
                    triggers.pop(i)
                    break
    
    def _save_alarms(self):
        """保存闹钟配置"""
        # 重新建立索引映射（因为可能删除了特效，索引会变化）
        all_effects = self.config_manager.config_data.get("specialEffectLibrary", [])
        type6_to_actual_index = {}
        type6_count = 0
        for i, effect in enumerate(all_effects):
            if effect.get("type") == 6:
                type6_to_actual_index[type6_count] = i
                type6_count += 1
        
        # 构建时间触发配置
        triggers = []
        for alarm in self.alarms:
            seconds = alarm["seconds"]
            if not alarm["enabled"]:
                seconds = seconds + 100000  # 关闭的闹钟
            
            # 从type6_index计算最新的actual_index
            type6_index = alarm.get("type6_index")
            actual_index = type6_to_actual_index.get(type6_index, -1)
            
            if actual_index >= 0:
                # 使用保存的trigger对象（如果存在），更新时间和effectIndices
                trigger = alarm.get("trigger", {}).copy()
                trigger["triggerAtSecondOfDay"] = str(seconds)
                trigger["effectIndices"] = [actual_index]
                triggers.append(trigger)
        
        # 保存到配置管理器
        self.config_manager.set_time_triggers(triggers)
        
        # 保存配置文件
        if self.config_manager.save_config():
            messagebox.showinfo("成功", "闹钟配置已保存")
            # 重新加载以同步数据并更新索引
            self._load_data()
            self._refresh_alarm_list()
        else:
            messagebox.showerror("错误", "保存配置失败")
