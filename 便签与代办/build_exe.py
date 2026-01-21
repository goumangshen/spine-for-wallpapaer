"""
打包脚本 - 使用PyInstaller将项目打包成exe
"""
import PyInstaller.__main__
import os

# 获取当前目录
current_dir = os.path.dirname(os.path.abspath(__file__))

# PyInstaller参数
args = [
    'main.py',  # 主程序入口
    '--name=ConfigEditor',  # 生成的exe名称
    '--onefile',  # 打包成单个exe文件
    '--windowed',  # 不显示控制台窗口（GUI应用）
    '--clean',  # 清理临时文件
    '--noconfirm',  # 覆盖输出目录而不询问
    '--add-data=config.type.ts;.',  # 包含类型定义文件（如果需要）
    '--hidden-import=pygame',  # 确保pygame被包含
    '--hidden-import=tkinter',  # 确保tkinter被包含
    '--hidden-import=json',  # 确保json被包含
    '--collect-all=pygame',  # 收集pygame的所有数据文件
    '--icon=NONE',  # 如果有图标文件，可以指定路径
]

# 执行打包
PyInstaller.__main__.run(args)
