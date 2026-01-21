#!/bin/bash

echo "正在打包Config.json编辑器..."
echo ""

# 检查是否安装了PyInstaller
python3 -c "import PyInstaller" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "正在安装PyInstaller..."
    pip3 install pyinstaller
fi

echo ""
echo "开始打包..."
pyinstaller --name=ConfigEditor --onefile --windowed --clean --noconfirm --hidden-import=pygame --hidden-import=tkinter --collect-all=pygame main.py

if [ $? -eq 0 ]; then
    echo ""
    echo "打包完成！"
    echo "exe文件位置: dist/ConfigEditor.exe"
else
    echo ""
    echo "打包失败！请检查错误信息。"
    exit 1
fi
