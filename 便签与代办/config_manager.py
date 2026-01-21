"""
配置管理器模块
处理JSON文件的读取、保存和目录记忆功能
"""
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Any


class ConfigManager:
    """配置管理器类"""
    
    def __init__(self):
        self.config_path = None
        self.config_data: Optional[Dict[str, Any]] = None
        self.history_file = "config_history.json"
    
    def set_directory(self, directory: str) -> bool:
        """
        设置工作目录并检查config.json是否存在
        
        Args:
            directory: 目录路径
            
        Returns:
            bool: 如果config.json存在返回True，否则返回False
        """
        config_file = os.path.join(directory, "config.json")
        if os.path.exists(config_file):
            self.config_path = config_file
            self.save_directory_to_history(directory)
            return True
        return False
    
    def load_config(self) -> bool:
        """
        加载config.json文件
        
        Returns:
            bool: 加载成功返回True，否则返回False
        """
        if not self.config_path or not os.path.exists(self.config_path):
            return False
        
        try:
            with open(self.config_path, 'r', encoding='utf-8') as f:
                self.config_data = json.load(f)
            return True
        except Exception as e:
            print(f"加载配置失败: {e}")
            return False
    
    def save_config(self) -> bool:
        """
        保存config.json文件
        
        Returns:
            bool: 保存成功返回True，否则返回False
        """
        if not self.config_path or not self.config_data:
            return False
        
        try:
            with open(self.config_path, 'w', encoding='utf-8') as f:
                json.dump(self.config_data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"保存配置失败: {e}")
            return False
    
    def get_notes(self) -> List[Dict[str, Any]]:
        """获取便签列表"""
        if not self.config_data:
            return []
        return self.config_data.get("notes", [])
    
    def set_notes(self, notes: List[Dict[str, Any]]):
        """设置便签列表"""
        if self.config_data:
            self.config_data["notes"] = notes
    
    def get_type6_effects(self) -> List[Dict[str, Any]]:
        """获取type6类型的特殊特效"""
        if not self.config_data:
            return []
        effects = self.config_data.get("specialEffectLibrary", [])
        return [e for e in effects if e.get("type") == 6]
    
    def set_type6_effect(self, index: int, effect: Dict[str, Any]):
        """设置指定索引的type6特效"""
        if not self.config_data:
            return
        
        if "specialEffectLibrary" not in self.config_data:
            self.config_data["specialEffectLibrary"] = []
        
        effects = self.config_data["specialEffectLibrary"]
        # 找到type6特效的索引
        type6_indices = [i for i, e in enumerate(effects) if e.get("type") == 6]
        
        if 0 <= index < len(type6_indices):
            actual_index = type6_indices[index]
            effects[actual_index] = effect
    
    def add_type6_effect(self, effect: Dict[str, Any]) -> int:
        """添加新的type6特效，返回在specialEffectLibrary中的索引"""
        if not self.config_data:
            return -1
        
        if "specialEffectLibrary" not in self.config_data:
            self.config_data["specialEffectLibrary"] = []
        
        self.config_data["specialEffectLibrary"].append(effect)
        # 返回新添加的特效在specialEffectLibrary中的索引
        return len(self.config_data["specialEffectLibrary"]) - 1
    
    def remove_type6_effect(self, index: int):
        """删除指定索引的type6特效"""
        if not self.config_data:
            return
        
        effects = self.config_data.get("specialEffectLibrary", [])
        type6_indices = [i for i, e in enumerate(effects) if e.get("type") == 6]
        
        if 0 <= index < len(type6_indices):
            actual_index = type6_indices[index]
            effects.pop(actual_index)
    
    def get_time_triggers(self) -> List[Dict[str, Any]]:
        """获取带triggerAtSecondOfDay的触发配置"""
        if not self.config_data:
            return []
        
        meshes = self.config_data.get("meshes", [])
        if not meshes:
            return []
        
        triggers = meshes[0].get("specialEffectTriggers", [])
        return [t for t in triggers if "triggerAtSecondOfDay" in t]
    
    def set_time_triggers(self, triggers: List[Dict[str, Any]]):
        """设置时间触发配置"""
        if not self.config_data:
            return
        
        meshes = self.config_data.get("meshes", [])
        if not meshes:
            return
        
        # 获取所有非时间触发的配置
        all_triggers = meshes[0].get("specialEffectTriggers", [])
        non_time_triggers = [t for t in all_triggers if "triggerAtSecondOfDay" not in t]
        
        # 合并时间触发和非时间触发
        meshes[0]["specialEffectTriggers"] = non_time_triggers + triggers
    
    def save_directory_to_history(self, directory: str):
        """保存目录到历史记录"""
        try:
            history = []
            if os.path.exists(self.history_file):
                with open(self.history_file, 'r', encoding='utf-8') as f:
                    history = json.load(f)
            
            # 如果目录已存在，先移除
            if directory in history:
                history.remove(directory)
            
            # 添加到最前面
            history.insert(0, directory)
            
            # 只保留最近10个
            history = history[:10]
            
            with open(self.history_file, 'w', encoding='utf-8') as f:
                json.dump(history, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"保存目录历史失败: {e}")
    
    def get_directory_history(self) -> List[str]:
        """获取目录历史记录"""
        try:
            if os.path.exists(self.history_file):
                with open(self.history_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            print(f"读取目录历史失败: {e}")
        return []
    
    def get_directory(self) -> Optional[str]:
        """获取当前工作目录"""
        if self.config_path:
            return os.path.dirname(self.config_path)
        return None
