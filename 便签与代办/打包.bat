@echo off
chcp 65001 >nul
echo 正在打包Config.json编辑器...
echo.

REM 检查是否安装了PyInstaller
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo 正在安装PyInstaller...
    pip install pyinstaller
)

echo.
echo 开始打包...
pyinstaller --name=ConfigEditor --onefile --windowed --clean --noconfirm --hidden-import=pygame --hidden-import=tkinter --collect-all=pygame main.py

if errorlevel 1 (
    echo.
    echo 打包失败！请检查错误信息。
    pause
    exit /b 1
)

echo.
echo 打包完成！
echo exe文件位置: dist\ConfigEditor.exe
echo.
pause
