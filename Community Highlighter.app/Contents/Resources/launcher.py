#!/usr/bin/env python3
"""
Community Highlighter - Desktop Launcher
=========================================

A user-friendly GUI for launching Community Highlighter.
Features:
- One-click server start/stop
- Easy API key setup with helpful links
- Server status indicator
- Auto-opens browser when ready
"""

import os
import sys
import subprocess
import threading
import webbrowser
import socket
import time

# Try to import tkinter
try:
    import tkinter as tk
    from tkinter import ttk, messagebox
    HAS_TK = True
except ImportError:
    HAS_TK = False

# Configuration
APP_NAME = "Community Highlighter"
APP_VERSION = "6.0"
DEFAULT_PORT = 8000
GITHUB_RELEASES = "https://github.com/amateurmenace/community-highlighter/releases"
OPENAI_API_URL = "https://platform.openai.com/api-keys"
YOUTUBE_API_URL = "https://console.cloud.google.com/apis/credentials"

def get_app_dir():
    """Get the application directory"""
    if getattr(sys, 'frozen', False):
        # Running as compiled app
        if sys.platform == 'darwin':
            # macOS .app bundle
            return os.path.dirname(os.path.dirname(os.path.dirname(sys.executable)))
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))

def get_env_path():
    """Find the .env file location"""
    app_dir = get_app_dir()
    paths = [
        os.path.join(app_dir, 'backend', '.env'),
        os.path.join(app_dir, '.env'),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    # Default to backend/.env
    backend_dir = os.path.join(app_dir, 'backend')
    if os.path.exists(backend_dir):
        return os.path.join(backend_dir, '.env')
    return os.path.join(app_dir, '.env')

def load_api_key():
    """Load existing API key from .env"""
    env_path = get_env_path()
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r') as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        key = line.split('=', 1)[1].strip()
                        if key and key != 'your-openai-key-here':
                            return key
        except:
            pass
    return ""

def save_api_key(api_key, youtube_key=""):
    """Save API key to .env file"""
    env_path = get_env_path()
    env_dir = os.path.dirname(env_path)
    
    if not os.path.exists(env_dir):
        os.makedirs(env_dir, exist_ok=True)
    
    content = f"OPENAI_API_KEY={api_key}\n"
    if youtube_key:
        content += f"YOUTUBE_API_KEY={youtube_key}\n"
    
    with open(env_path, 'w') as f:
        f.write(content)
    
    os.environ['OPENAI_API_KEY'] = api_key
    if youtube_key:
        os.environ['YOUTUBE_API_KEY'] = youtube_key

def is_port_in_use(port):
    """Check if a port is in use"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('127.0.0.1', port)) == 0

def wait_for_server(port, timeout=30):
    """Wait for server to be ready"""
    start = time.time()
    while time.time() - start < timeout:
        if is_port_in_use(port):
            return True
        time.sleep(0.5)
    return False


class CommunityHighlighterApp:
    """Main GUI Application"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(f"{APP_NAME} v{APP_VERSION}")
        self.root.geometry("480x520")
        self.root.resizable(False, False)
        
        # Center window
        self.root.eval('tk::PlaceWindow . center')
        
        # Server process
        self.server_process = None
        self.server_running = False
        
        # Build UI
        self.build_ui()
        
        # Load existing API key
        existing_key = load_api_key()
        if existing_key:
            self.api_key_var.set(existing_key)
            self.status_label.config(text="API key loaded. Ready to start!")
    
    def build_ui(self):
        """Build the user interface"""
        # Main container
        main = tk.Frame(self.root, padx=24, pady=20)
        main.pack(fill='both', expand=True)
        
        # Header
        header = tk.Frame(main)
        header.pack(fill='x', pady=(0, 16))
        
        title = tk.Label(header, text=APP_NAME, 
                        font=('Helvetica', 22, 'bold'), fg='#1E7F63')
        title.pack()
        
        subtitle = tk.Label(header, text="AI-Powered Meeting Analysis",
                           font=('Helvetica', 11), fg='#666')
        subtitle.pack()
        
        version = tk.Label(header, text=f"Version {APP_VERSION}",
                          font=('Helvetica', 9), fg='#999')
        version.pack()
        
        # Divider
        ttk.Separator(main, orient='horizontal').pack(fill='x', pady=12)
        
        # API Key Section
        api_frame = tk.LabelFrame(main, text=" API Configuration ", 
                                  font=('Helvetica', 11, 'bold'), padx=16, pady=12)
        api_frame.pack(fill='x', pady=(0, 16))
        
        # OpenAI Key
        openai_label = tk.Label(api_frame, text="OpenAI API Key (required):", 
                               font=('Helvetica', 10))
        openai_label.pack(anchor='w')
        
        key_frame = tk.Frame(api_frame)
        key_frame.pack(fill='x', pady=(4, 0))
        
        self.api_key_var = tk.StringVar()
        self.api_key_entry = tk.Entry(key_frame, textvariable=self.api_key_var,
                                      width=38, show='•', font=('Courier', 11))
        self.api_key_entry.pack(side='left', fill='x', expand=True)
        
        self.show_key_var = tk.BooleanVar()
        show_btn = tk.Checkbutton(key_frame, text="Show", variable=self.show_key_var,
                                  command=self.toggle_key_visibility)
        show_btn.pack(side='left', padx=(8, 0))
        
        # Get API Key link
        link_frame = tk.Frame(api_frame)
        link_frame.pack(anchor='w', pady=(8, 0))
        
        tk.Label(link_frame, text="Don't have a key?", fg='#666',
                font=('Helvetica', 9)).pack(side='left')
        
        get_key_link = tk.Label(link_frame, text="Get one free from OpenAI →",
                               fg='#1E7F63', font=('Helvetica', 9, 'underline'),
                               cursor='hand2')
        get_key_link.pack(side='left', padx=(4, 0))
        get_key_link.bind('<Button-1>', lambda e: webbrowser.open(OPENAI_API_URL))
        
        # Instructions
        instructions = tk.Label(api_frame, 
            text="1. Click the link above to go to OpenAI\n"
                 "2. Sign up or log in (free account)\n"
                 "3. Click 'Create new secret key'\n"
                 "4. Copy the key (starts with sk-) and paste above",
            font=('Helvetica', 9), fg='#666', justify='left')
        instructions.pack(anchor='w', pady=(8, 0))
        
        # Save button
        save_btn = tk.Button(api_frame, text="Save API Key", 
                            command=self.save_key,
                            bg='#e0e0e0', font=('Helvetica', 10))
        save_btn.pack(anchor='w', pady=(12, 0))
        
        # Divider
        ttk.Separator(main, orient='horizontal').pack(fill='x', pady=12)
        
        # Server Control Section
        server_frame = tk.LabelFrame(main, text=" Server Control ",
                                     font=('Helvetica', 11, 'bold'), padx=16, pady=12)
        server_frame.pack(fill='x', pady=(0, 16))
        
        # Status indicator
        status_frame = tk.Frame(server_frame)
        status_frame.pack(fill='x', pady=(0, 12))
        
        tk.Label(status_frame, text="Status:", font=('Helvetica', 10)).pack(side='left')
        
        self.status_indicator = tk.Label(status_frame, text="●", 
                                         font=('Helvetica', 14), fg='#999')
        self.status_indicator.pack(side='left', padx=(8, 4))
        
        self.status_label = tk.Label(status_frame, text="Not running",
                                     font=('Helvetica', 10), fg='#666')
        self.status_label.pack(side='left')
        
        # Buttons
        btn_frame = tk.Frame(server_frame)
        btn_frame.pack(fill='x')
        
        self.start_btn = tk.Button(btn_frame, text="▶  Start Server",
                                   command=self.start_server,
                                   bg='#1E7F63', fg='white',
                                   font=('Helvetica', 12, 'bold'),
                                   padx=20, pady=8, cursor='hand2')
        self.start_btn.pack(side='left', padx=(0, 8))
        
        self.stop_btn = tk.Button(btn_frame, text="■  Stop",
                                  command=self.stop_server,
                                  bg='#dc3545', fg='white',
                                  font=('Helvetica', 12, 'bold'),
                                  padx=20, pady=8, cursor='hand2',
                                  state='disabled')
        self.stop_btn.pack(side='left', padx=(0, 8))
        
        self.open_btn = tk.Button(btn_frame, text="🌐 Open Browser",
                                  command=self.open_browser,
                                  font=('Helvetica', 10),
                                  padx=12, pady=6,
                                  state='disabled')
        self.open_btn.pack(side='left')
        
        # URL display
        self.url_label = tk.Label(server_frame, text="",
                                  font=('Courier', 10), fg='#1E7F63')
        self.url_label.pack(pady=(12, 0))
        
        # Footer
        footer = tk.Frame(main)
        footer.pack(side='bottom', fill='x')
        
        ttk.Separator(footer, orient='horizontal').pack(fill='x', pady=(0, 8))
        
        footer_text = tk.Label(footer, 
            text="Made by Weird Machine • Brookline Interactive Group",
            font=('Helvetica', 9), fg='#999')
        footer_text.pack()
        
        github_link = tk.Label(footer, text="View on GitHub",
                              font=('Helvetica', 9, 'underline'),
                              fg='#1E7F63', cursor='hand2')
        github_link.pack()
        github_link.bind('<Button-1>', lambda e: webbrowser.open(GITHUB_RELEASES))
    
    def toggle_key_visibility(self):
        """Toggle API key visibility"""
        if self.show_key_var.get():
            self.api_key_entry.config(show='')
        else:
            self.api_key_entry.config(show='•')
    
    def save_key(self):
        """Save the API key"""
        key = self.api_key_var.get().strip()
        
        if not key:
            messagebox.showwarning("Missing Key", 
                "Please enter your OpenAI API key.")
            return
        
        if not key.startswith('sk-'):
            if not messagebox.askyesno("Unusual Key Format",
                "OpenAI API keys usually start with 'sk-'.\n\n"
                "Are you sure this key is correct?"):
                return
        
        try:
            save_api_key(key)
            self.status_label.config(text="API key saved! Ready to start.")
            messagebox.showinfo("Saved", "API key saved successfully!")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to save API key:\n{e}")
    
    def start_server(self):
        """Start the backend server"""
        # Check API key
        if not self.api_key_var.get().strip():
            messagebox.showwarning("API Key Required",
                "Please enter your OpenAI API key first.\n\n"
                "Click the link to get a free key from OpenAI.")
            return
        
        # Save key if not saved
        save_api_key(self.api_key_var.get().strip())
        
        # Check if already running
        if is_port_in_use(DEFAULT_PORT):
            self.update_status(True)
            messagebox.showinfo("Already Running",
                f"Server is already running on port {DEFAULT_PORT}.\n"
                "Opening browser...")
            self.open_browser()
            return
        
        # Update UI
        self.status_label.config(text="Starting server...")
        self.status_indicator.config(fg='#ffc107')
        self.start_btn.config(state='disabled')
        self.root.update()
        
        # Start server in background thread
        thread = threading.Thread(target=self._run_server, daemon=True)
        thread.start()
        
        # Wait for server in another thread
        threading.Thread(target=self._wait_and_open, daemon=True).start()
    
    def _run_server(self):
        """Run the server process"""
        app_dir = get_app_dir()
        os.chdir(app_dir)
        
        # Set environment
        env = os.environ.copy()
        env['CLOUD_MODE'] = 'false'
        
        # Find the right script to run
        if os.path.exists(os.path.join(app_dir, 'desktop_app.py')):
            cmd = [sys.executable, 'desktop_app.py']
        elif os.path.exists(os.path.join(app_dir, 'backend', 'app.py')):
            cmd = [sys.executable, '-m', 'uvicorn', 'backend.app:app', 
                   '--host', '127.0.0.1', '--port', str(DEFAULT_PORT)]
        else:
            self.root.after(0, lambda: messagebox.showerror("Error", 
                "Could not find server files. Please reinstall."))
            return
        
        try:
            self.server_process = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=app_dir
            )
        except Exception as e:
            self.root.after(0, lambda: messagebox.showerror("Error", 
                f"Failed to start server:\n{e}"))
    
    def _wait_and_open(self):
        """Wait for server and open browser"""
        if wait_for_server(DEFAULT_PORT, timeout=30):
            self.root.after(0, lambda: self.update_status(True))
            self.root.after(500, self.open_browser)
        else:
            self.root.after(0, lambda: self.update_status(False))
            self.root.after(0, lambda: messagebox.showerror("Error",
                "Server failed to start. Check that all files are present."))
    
    def update_status(self, running):
        """Update the UI to reflect server status"""
        self.server_running = running
        
        if running:
            self.status_indicator.config(fg='#28a745')
            self.status_label.config(text="Running")
            self.url_label.config(text=f"http://127.0.0.1:{DEFAULT_PORT}")
            self.start_btn.config(state='disabled')
            self.stop_btn.config(state='normal')
            self.open_btn.config(state='normal')
        else:
            self.status_indicator.config(fg='#999')
            self.status_label.config(text="Not running")
            self.url_label.config(text="")
            self.start_btn.config(state='normal')
            self.stop_btn.config(state='disabled')
            self.open_btn.config(state='disabled')
    
    def stop_server(self):
        """Stop the server"""
        if self.server_process:
            self.server_process.terminate()
            self.server_process = None
        
        self.update_status(False)
        self.status_label.config(text="Server stopped")
    
    def open_browser(self):
        """Open the app in browser"""
        webbrowser.open(f"http://127.0.0.1:{DEFAULT_PORT}")
    
    def run(self):
        """Run the application"""
        # Handle window close
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.mainloop()
    
    def on_close(self):
        """Handle window close"""
        if self.server_running:
            if messagebox.askyesno("Stop Server?",
                "The server is still running.\n\nStop it and quit?"):
                self.stop_server()
                self.root.destroy()
        else:
            self.root.destroy()


def run_terminal_mode():
    """Fallback terminal mode if tkinter not available"""
    print("\n" + "=" * 50)
    print(f"  {APP_NAME} v{APP_VERSION}")
    print("=" * 50)
    print("\n[!] GUI not available. Running in terminal mode.\n")
    
    # Check for API key
    key = load_api_key()
    if not key:
        print("OpenAI API Key required!")
        print(f"Get one at: {OPENAI_API_URL}\n")
        key = input("Enter your API key: ").strip()
        if key:
            save_api_key(key)
            print("[OK] API key saved!\n")
    
    # Start server
    print("[*] Starting server...")
    app_dir = get_app_dir()
    os.chdir(app_dir)
    
    if os.path.exists('desktop_app.py'):
        os.system(f'{sys.executable} desktop_app.py')
    else:
        print("[ERROR] desktop_app.py not found!")


def main():
    if HAS_TK:
        app = CommunityHighlighterApp()
        app.run()
    else:
        run_terminal_mode()


if __name__ == "__main__":
    main()
