"""
工具函数模块
包含音频播放、文件查找等工具函数
"""
import os
from pathlib import Path
from typing import List, Optional
import pygame
import threading


class AudioPlayer:
    """音频播放器类"""
    
    def __init__(self):
        pygame.mixer.init()
        self.current_channel = None
    
    def play_audio(self, file_path: str, loop: bool = False):
        """
        播放音频文件
        
        Args:
            file_path: 音频文件路径
            loop: 是否循环播放
        """
        try:
            if self.current_channel:
                self.current_channel.stop()
            
            if os.path.exists(file_path):
                self.current_channel = pygame.mixer.Sound(file_path)
                if loop:
                    self.current_channel.play(-1)  # -1表示循环播放
                else:
                    self.current_channel.play()
        except Exception as e:
            print(f"播放音频失败: {e}")
    
    def stop_audio(self):
        """停止播放音频"""
        if self.current_channel:
            self.current_channel.stop()
            self.current_channel = None
    
    def is_playing(self) -> bool:
        """检查是否正在播放"""
        if self.current_channel:
            return self.current_channel.get_num_channels() > 0
        return False


def find_mp3_files(directory: str) -> List[str]:
    """
    查找目录下的所有mp3文件
    
    Args:
        directory: 目录路径
        
    Returns:
        List[str]: mp3文件名列表（不含路径）
    """
    mp3_files = []
    try:
        if os.path.exists(directory):
            for file in os.listdir(directory):
                if file.lower().endswith('.mp3'):
                    mp3_files.append(file)
        mp3_files.sort()
    except Exception as e:
        print(f"查找mp3文件失败: {e}")
    return mp3_files


def seconds_to_time(seconds: int) -> str:
    """
    将秒数转换为时间字符串 (HH:MM)
    
    Args:
        seconds: 秒数（0-86399）
        
    Returns:
        str: 时间字符串，格式为 "HH:MM"
    """
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    return f"{hours:02d}:{minutes:02d}"


def time_to_seconds(time_str: str) -> int:
    """
    将时间字符串转换为秒数
    
    Args:
        time_str: 时间字符串，格式为 "HH:MM" 或 "H:MM"
        
    Returns:
        int: 秒数（0-86399），失败返回-1
    """
    try:
        parts = time_str.split(':')
        if len(parts) == 2:
            hours = int(parts[0])
            minutes = int(parts[1])
            if 0 <= hours < 24 and 0 <= minutes < 60:
                return hours * 3600 + minutes * 60
    except Exception as e:
        print(f"时间转换失败: {e}")
    return -1
