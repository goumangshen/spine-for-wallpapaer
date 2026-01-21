"""
主程序入口
提供目录选择和主窗口界面
"""
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
import os
from config_manager import ConfigManager
from alarm_interface import AlarmInterface
from note_interface import NoteInterface


class MainWindow:
    """主窗口类"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title("Config.json 编辑器")
        self.root.geometry("500x350")
        
        self.config_manager = ConfigManager()
        self.current_directory = None
        
        self._create_ui()
        self._load_last_directory()
    
    def _create_ui(self):
        """创建主界面"""
        # 主框架
        main_frame = ttk.Frame(self.root, padding="20")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 标题
        title_label = ttk.Label(main_frame, text="Config.json 编辑器", font=("Arial", 18, "bold"))
        title_label.pack(pady=(0, 20))
        
        # 目录选择框架
        dir_frame = ttk.LabelFrame(main_frame, text="工作目录", padding="10")
        dir_frame.pack(fill=tk.X, pady=(0, 20))
        
        # 目录输入框和按钮
        input_frame = ttk.Frame(dir_frame)
        input_frame.pack(fill=tk.X)
        
        self.dir_var = tk.StringVar()
        dir_entry = ttk.Entry(input_frame, textvariable=self.dir_var, width=50)
        dir_entry.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        # 绑定回车键自动验证
        dir_entry.bind('<Return>', lambda e: self._validate_directory())
        # 保存dir_entry引用，方便后续使用
        self.dir_entry = dir_entry
        
        ttk.Button(input_frame, text="浏览", command=self._browse_directory).pack(side=tk.LEFT)
        
        # 历史记录下拉框
        history_frame = ttk.Frame(dir_frame)
        history_frame.pack(fill=tk.X, pady=(10, 0))
        
        ttk.Label(history_frame, text="历史记录:").pack(side=tk.LEFT, padx=(0, 5))
        
        self.history_var = tk.StringVar()
        history_combo = ttk.Combobox(history_frame, textvariable=self.history_var, 
                                     state="readonly", width=45)
        history_combo.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 5))
        history_combo.bind('<<ComboboxSelected>>', self._on_history_select)
        
        self.history_combo = history_combo
        
        # 状态标签
        self.status_label = ttk.Label(dir_frame, text="请选择包含config.json的目录", 
                                      foreground="gray")
        self.status_label.pack(pady=(10, 0))
        
        # 功能按钮框架
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.alarm_button = ttk.Button(button_frame, text="闹钟设置", 
                                       command=self._open_alarm_interface, state=tk.DISABLED)
        self.alarm_button.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        
        self.note_button = ttk.Button(button_frame, text="便签管理", 
                                      command=self._open_note_interface, state=tk.DISABLED)
        self.note_button.pack(side=tk.LEFT, padx=5, fill=tk.X, expand=True)
        
        # 使用说明按钮
        ttk.Button(main_frame, text="使用说明", command=self._show_help).pack(pady=10)
    
    def _load_last_directory(self):
        """加载上次使用的目录"""
        history = self.config_manager.get_directory_history()
        if history:
            self.history_combo['values'] = history
            # 尝试加载第一个历史记录
            if history:
                self._set_directory(history[0])
    
    def _browse_directory(self):
        """浏览目录"""
        directory = filedialog.askdirectory(title="选择包含config.json的目录")
        if directory:
            self._set_directory(directory)
    
    def _on_history_select(self, event):
        """历史记录选择事件"""
        directory = self.history_var.get()
        if directory:
            self._set_directory(directory)
    
    def _set_directory(self, directory: str):
        """设置工作目录"""
        self.dir_var.set(directory)
        self.history_var.set("")
        
        # 验证目录
        if self.config_manager.set_directory(directory):
            # 加载配置
            if self.config_manager.load_config():
                self.current_directory = directory
                self.status_label.config(text=f"✓ 已加载: {directory}", foreground="green")
                self.alarm_button.config(state=tk.NORMAL)
                self.note_button.config(state=tk.NORMAL)
                
                # 更新历史记录下拉框
                history = self.config_manager.get_directory_history()
                self.history_combo['values'] = history
            else:
                self.status_label.config(text="✗ 加载配置文件失败", foreground="red")
                self.alarm_button.config(state=tk.DISABLED)
                self.note_button.config(state=tk.DISABLED)
        else:
            self.status_label.config(text="✗ 未找到config.json文件", foreground="red")
            self.alarm_button.config(state=tk.DISABLED)
            self.note_button.config(state=tk.DISABLED)
    
    def _validate_directory(self):
        """验证目录"""
        directory = self.dir_var.get().strip()
        if not directory:
            messagebox.showwarning("警告", "请输入目录路径")
            return
        
        if not os.path.exists(directory):
            messagebox.showerror("错误", "目录不存在")
            return
        
        self._set_directory(directory)
    
    def _open_alarm_interface(self):
        """打开闹钟设置界面"""
        if not self.current_directory:
            messagebox.showwarning("警告", "请先选择工作目录")
            return
        
        # 重新加载配置以确保数据最新
        self.config_manager.load_config()
        AlarmInterface(self.root, self.config_manager, self.current_directory)
    
    def _open_note_interface(self):
        """打开便签管理界面"""
        if not self.current_directory:
            messagebox.showwarning("警告", "请先选择工作目录")
            return
        
        # 重新加载配置以确保数据最新
        self.config_manager.load_config()
        NoteInterface(self.root, self.config_manager)
    
    def _show_help(self):
        """显示使用说明"""
        help_window = tk.Toplevel(self.root)
        help_window.title("使用说明")
        help_window.geometry("600x400")
        help_window.transient(self.root)
        help_window.grab_set()
        
        # 主框架
        help_frame = ttk.Frame(help_window, padding="20")
        help_frame.pack(fill=tk.BOTH, expand=True)
        
        # 标题
        title_label = ttk.Label(help_frame, text="使用说明", font=("Arial", 16, "bold"))
        title_label.pack(pady=(0, 20))
        
        # 说明内容
        help_text = """请在wallpaper内右击壁纸，点击"在资源管理器中打开"，之后会弹出一个文件夹，即该壁纸的目录。

进入该文件夹的assets文件夹，在上方的文件夹路径上右击，选择"复制地址"，即可将地址复制，之后将地址粘贴到工作路径中，按enter键即可将配置文件导入。"""
        
        # 使用Text组件显示说明，支持多行文本
        text_widget = tk.Text(help_frame, wrap=tk.WORD, font=("Microsoft YaHei", 10), 
                             padx=10, pady=10, relief=tk.FLAT, bg="#f5f5f5")
        text_widget.pack(fill=tk.BOTH, expand=True)
        text_widget.insert("1.0", help_text)
        text_widget.config(state=tk.DISABLED)  # 设置为只读
        
        # 关闭按钮
        button_frame = ttk.Frame(help_frame)
        button_frame.pack(fill=tk.X, pady=(20, 0))
        
        ttk.Button(button_frame, text="我知道了", command=help_window.destroy).pack()
    
    def run(self):
        """运行主程序"""
        self.root.mainloop()


if __name__ == "__main__":
    app = MainWindow()
    app.run()
