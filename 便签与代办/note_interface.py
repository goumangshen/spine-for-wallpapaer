"""
便签排布界面模块
用于编辑notes配置
"""
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from typing import Dict, List, Optional, Any
from config_manager import ConfigManager


class NoteInterface:
    """便签排布界面类"""
    
    def __init__(self, parent: tk.Tk, config_manager: ConfigManager):
        self.parent = parent
        self.config_manager = config_manager
        
        # 创建窗口
        self.window = tk.Toplevel(parent)
        self.window.title("便签管理")
        self.window.geometry("700x500")
        
        # 数据存储
        self.notes: List[Dict[str, Any]] = []
        
        self._load_data()
        self._create_ui()
        self._refresh_note_list()
    
    def _load_data(self):
        """加载数据"""
        self.notes = self.config_manager.get_notes()
        # 确保每个便签都有visible字段
        for note in self.notes:
            if "visible" not in note:
                note["visible"] = True
    
    def _create_ui(self):
        """创建界面"""
        # 主框架
        main_frame = ttk.Frame(self.window, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # 标题
        title_label = ttk.Label(main_frame, text="便签管理", font=("Arial", 16, "bold"))
        title_label.pack(pady=(0, 10))
        
        # 便签列表框架
        list_frame = ttk.LabelFrame(main_frame, text="便签列表", padding="10")
        list_frame.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        
        # 创建Treeview显示便签
        columns = ("visible", "text")
        self.note_tree = ttk.Treeview(list_frame, columns=columns, show="tree headings", height=10)
        self.note_tree.heading("#0", text="序号")
        self.note_tree.heading("visible", text="显示")
        self.note_tree.heading("text", text="内容")
        self.note_tree.column("#0", width=60)
        self.note_tree.column("visible", width=60)
        self.note_tree.column("text", width=500)
        
        # 滚动条
        scrollbar = ttk.Scrollbar(list_frame, orient=tk.VERTICAL, command=self.note_tree.yview)
        self.note_tree.configure(yscrollcommand=scrollbar.set)
        
        self.note_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        scrollbar.pack(side=tk.RIGHT, fill=tk.Y)
        
        self.note_tree.bind('<Double-1>', self._on_note_double_click)
        
        # 按钮框架
        button_frame = ttk.Frame(main_frame)
        button_frame.pack(fill=tk.X, pady=(0, 10))
        
        ttk.Button(button_frame, text="添加便签", command=self._add_note).pack(side=tk.LEFT, padx=(0, 5))
        ttk.Button(button_frame, text="编辑便签", command=self._edit_selected_note).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="删除便签", command=self._delete_note).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="保存", command=self._save_notes).pack(side=tk.RIGHT)
    
    def _refresh_note_list(self):
        """刷新便签列表显示"""
        # 清空现有项
        for item in self.note_tree.get_children():
            self.note_tree.delete(item)
        
        # 添加便签
        for i, note in enumerate(self.notes):
            visible = "✓" if note.get("visible", True) else "✗"
            text = note.get("text", "")[:50]  # 只显示前50个字符
            if len(note.get("text", "")) > 50:
                text += "..."
            
            self.note_tree.insert("", tk.END, text=str(i + 1), values=(visible, text))
    
    def _on_note_double_click(self, event):
        """双击便签时编辑"""
        self._edit_selected_note()
    
    def _edit_selected_note(self):
        """编辑选中的便签"""
        selection = self.note_tree.selection()
        if not selection:
            messagebox.showwarning("警告", "请先选择要编辑的便签")
            return
        
        item = self.note_tree.item(selection[0])
        index = int(item["text"]) - 1
        
        if 0 <= index < len(self.notes):
            self._edit_note(index)
    
    def _add_note(self):
        """添加新便签"""
        self._edit_note(-1)
    
    def _edit_note(self, index: int):
        """编辑便签（index=-1表示新建）"""
        # 创建编辑窗口
        edit_window = tk.Toplevel(self.window)
        edit_window.title("编辑便签" if index >= 0 else "添加便签")
        edit_window.geometry("500x300")
        edit_window.transient(self.window)
        edit_window.grab_set()
        
        # 获取当前便签数据
        if index >= 0:
            note = self.notes[index].copy()
        else:
            note = {
                "visible": True,
                "backgroundImage": "note.png",  # 默认值
                "text": "",
                "scale": 0.5  # 默认值
            }
        
        # 创建表单
        form_frame = ttk.Frame(edit_window, padding="20")
        form_frame.pack(fill=tk.BOTH, expand=True)
        
        # 显示状态
        visible_var = tk.BooleanVar(value=note.get("visible", True))
        ttk.Checkbutton(form_frame, text="显示", variable=visible_var).pack(anchor=tk.W, pady=5)
        
        # 内容
        ttk.Label(form_frame, text="内容:").pack(anchor=tk.W, pady=(10, 5))
        text_widget = scrolledtext.ScrolledText(form_frame, height=8, width=50, wrap=tk.WORD)
        text_widget.pack(fill=tk.BOTH, expand=True, pady=(0, 10))
        text_widget.insert("1.0", note.get("text", ""))
        
        # 按钮框架
        button_frame = ttk.Frame(form_frame)
        button_frame.pack(fill=tk.X, pady=10)
        
        def save_note():
            text_content = text_widget.get("1.0", tk.END).strip()
            if not text_content:
                messagebox.showwarning("警告", "便签内容不能为空")
                return
            
            # 更新或添加便签
            note_data = {
                "visible": visible_var.get(),
                "backgroundImage": note.get("backgroundImage", "note.png"),
                "text": text_content,
                "scale": note.get("scale", 0.5)
            }
            
            if index >= 0:
                self.notes[index] = note_data
            else:
                self.notes.append(note_data)
            
            edit_window.destroy()
            self._refresh_note_list()
        
        ttk.Button(button_frame, text="确定", command=save_note).pack(side=tk.LEFT, padx=5)
        ttk.Button(button_frame, text="取消", command=edit_window.destroy).pack(side=tk.LEFT, padx=5)
    
    def _delete_note(self):
        """删除便签"""
        selection = self.note_tree.selection()
        if not selection:
            messagebox.showwarning("警告", "请先选择要删除的便签")
            return
        
        if messagebox.askyesno("确认", "确定要删除选中的便签吗？"):
            item = self.note_tree.item(selection[0])
            index = int(item["text"]) - 1
            
            if 0 <= index < len(self.notes):
                self.notes.pop(index)
                self._refresh_note_list()
    
    def _save_notes(self):
        """保存便签配置"""
        self.config_manager.set_notes(self.notes)
        
        if self.config_manager.save_config():
            messagebox.showinfo("成功", "便签配置已保存")
        else:
            messagebox.showerror("错误", "保存配置失败")
