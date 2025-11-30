#!/usr/bin/env python3
"""
Community Highlighter - Desktop Launcher v2.1
==============================================

Simplified, reliable launcher that:
1. Works on first run (installs dependencies)
2. Shows clear progress and errors
3. Handles all edge cases
"""

import os
import sys
import subprocess
import threading
import webbrowser
import socket
import time

# Configuration
APP_NAME = "Community Highlighter"
APP_VERSION = "6.0"
DEFAULT_PORT = 8000
OPENAI_API_URL = "https://platform.openai.com/api-keys"

# Colors matching the web app
COLORS = {
    'bg': '#F7F3E9',
    'bg_dark': '#EDE8DC',
    'green': '#1E7F63',
    'green_light': '#97D68D',
    'green_hover': '#166b52',
    'text': '#1a1a1a',
    'text_light': '#666666',
    'white': '#FFFFFF',
    'error': '#dc3545',
    'warning': '#ffc107',
    'success': '#28a745',
}


def get_project_root():
    """Get the project root directory"""
    # Start from script location
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Check if we're in an .app bundle
    if '.app/Contents/Resources' in script_dir:
        return script_dir
    
    # Check if desktop_app.py exists here or in parent
    for candidate in [script_dir, os.path.dirname(script_dir)]:
        if os.path.exists(os.path.join(candidate, 'desktop_app.py')):
            return candidate
        if os.path.exists(os.path.join(candidate, 'backend', 'app.py')):
            return candidate
    
    return script_dir


def get_env_path():
    """Get .env file path"""
    root = get_project_root()
    backend_env = os.path.join(root, 'backend', '.env')
    root_env = os.path.join(root, '.env')
    
    if os.path.exists(backend_env):
        return backend_env
    if os.path.exists(root_env):
        return root_env
    
    # Default to backend/.env
    backend_dir = os.path.join(root, 'backend')
    if os.path.exists(backend_dir):
        return backend_env
    return root_env


def load_api_key():
    """Load API key from .env"""
    env_path = get_env_path()
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r') as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        key = line.split('=', 1)[1].strip()
                        if key and len(key) > 10:
                            return key
        except:
            pass
    return ""


def save_api_key(key):
    """Save API key to .env"""
    env_path = get_env_path()
    env_dir = os.path.dirname(env_path)
    
    if env_dir and not os.path.exists(env_dir):
        os.makedirs(env_dir, exist_ok=True)
    
    with open(env_path, 'w') as f:
        f.write(f"OPENAI_API_KEY={key}\n")
    
    os.environ['OPENAI_API_KEY'] = key


def is_port_in_use(port):
    """Check if port is in use"""
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except:
        return False


def check_dependencies():
    """Check if key dependencies are installed"""
    try:
        import fastapi
        import uvicorn
        return True
    except ImportError:
        return False


def install_dependencies(status_callback=None):
    """Install dependencies from requirements.txt"""
    root = get_project_root()
    
    # Find requirements.txt
    req_paths = [
        os.path.join(root, 'requirements.txt'),
        os.path.join(root, 'backend', 'requirements.txt'),
    ]
    
    req_file = None
    for p in req_paths:
        if os.path.exists(p):
            req_file = p
            break
    
    if not req_file:
        return False, "requirements.txt not found"
    
    if status_callback:
        status_callback("Installing dependencies (this may take several minutes)...")
    
    print(f"[Launcher] Installing from: {req_file}")
    
    try:
        # Use pip install with current Python
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '-r', req_file, '--quiet'],
            capture_output=True,
            text=True,
            timeout=600  # 10 minute timeout
        )
        
        if result.returncode != 0:
            print(f"[Launcher] pip error: {result.stderr}")
            return False, result.stderr[:300]
        
        return True, "Dependencies installed"
        
    except subprocess.TimeoutExpired:
        return False, "Installation timed out (10 minutes)"
    except Exception as e:
        return False, str(e)


def start_server_process():
    """Start the server and return the process"""
    root = get_project_root()
    
    # Set environment
    env = os.environ.copy()
    env['CLOUD_MODE'] = 'false'
    
    # Load .env
    env_path = get_env_path()
    if os.path.exists(env_path):
        with open(env_path, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    env[k.strip()] = v.strip()
    
    # Find server script
    desktop_app = os.path.join(root, 'desktop_app.py')
    
    if os.path.exists(desktop_app):
        cmd = [sys.executable, desktop_app]
        cwd = root
    else:
        return None, "desktop_app.py not found"
    
    print(f"[Launcher] Starting: {' '.join(cmd)}")
    print(f"[Launcher] Working dir: {cwd}")
    
    try:
        process = subprocess.Popen(
            cmd,
            env=env,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        return process, None
    except Exception as e:
        return None, str(e)


# ============== GUI ==============

try:
    import tkinter as tk
    from tkinter import messagebox
    HAS_TK = True
except ImportError:
    HAS_TK = False


class LauncherApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(APP_NAME)
        self.root.geometry("500x520")
        self.root.resizable(False, False)
        self.root.configure(bg=COLORS['bg'])
        
        # Center window
        self.root.eval('tk::PlaceWindow . center')
        
        # State
        self.server_process = None
        self.is_running = False
        
        self.build_ui()
        
        # Load existing key
        key = load_api_key()
        if key:
            self.api_key_var.set(key)
            self.status_var.set("Ready - Click Start Server")
    
    def build_ui(self):
        # Main frame
        main = tk.Frame(self.root, bg=COLORS['bg'], padx=30, pady=20)
        main.pack(fill='both', expand=True)
        
        # Title
        title = tk.Label(main, text=APP_NAME,
                        font=('Helvetica', 22, 'bold'),
                        fg=COLORS['green'], bg=COLORS['bg'])
        title.pack(pady=(0, 5))
        
        subtitle = tk.Label(main, text="AI-Powered Meeting Analysis",
                           font=('Helvetica', 11),
                           fg=COLORS['text_light'], bg=COLORS['bg'])
        subtitle.pack(pady=(0, 20))
        
        # API Key Section
        api_frame = tk.Frame(main, bg=COLORS['bg_dark'], padx=20, pady=15)
        api_frame.pack(fill='x', pady=(0, 20))
        
        tk.Label(api_frame, text="OpenAI API Key",
                font=('Helvetica', 11, 'bold'),
                fg=COLORS['text'], bg=COLORS['bg_dark']).pack(anchor='w')
        
        self.api_key_var = tk.StringVar()
        key_entry = tk.Entry(api_frame, textvariable=self.api_key_var,
                            width=45, show='•', font=('Courier', 11))
        key_entry.pack(fill='x', pady=(5, 10))
        
        link = tk.Label(api_frame, text="→ Get free API key from OpenAI",
                       font=('Helvetica', 10, 'underline'),
                       fg=COLORS['green'], bg=COLORS['bg_dark'],
                       cursor='hand2')
        link.pack(anchor='w')
        link.bind('<Button-1>', lambda e: webbrowser.open(OPENAI_API_URL))
        
        # Server Section
        server_frame = tk.Frame(main, bg=COLORS['bg_dark'], padx=20, pady=15)
        server_frame.pack(fill='x', pady=(0, 20))
        
        tk.Label(server_frame, text="Server Control",
                font=('Helvetica', 11, 'bold'),
                fg=COLORS['text'], bg=COLORS['bg_dark']).pack(anchor='w', pady=(0, 10))
        
        # Status
        status_row = tk.Frame(server_frame, bg=COLORS['bg_dark'])
        status_row.pack(fill='x', pady=(0, 10))
        
        self.status_dot = tk.Label(status_row, text="●",
                                   font=('Helvetica', 16),
                                   fg=COLORS['text_light'],
                                   bg=COLORS['bg_dark'])
        self.status_dot.pack(side='left')
        
        self.status_var = tk.StringVar(value="Not running")
        self.status_label = tk.Label(status_row, textvariable=self.status_var,
                                     font=('Helvetica', 10),
                                     fg=COLORS['text_light'],
                                     bg=COLORS['bg_dark'])
        self.status_label.pack(side='left', padx=(5, 0))
        
        # Buttons
        btn_row = tk.Frame(server_frame, bg=COLORS['bg_dark'])
        btn_row.pack(fill='x')
        
        self.start_btn = tk.Button(btn_row, text="▶ Start Server",
                                   command=self.start_server,
                                   bg=COLORS['green'], fg=COLORS['white'],
                                   font=('Helvetica', 12, 'bold'),
                                   padx=20, pady=8,
                                   relief='flat', cursor='hand2')
        self.start_btn.pack(side='left', padx=(0, 10))
        
        self.stop_btn = tk.Button(btn_row, text="■ Stop",
                                  command=self.stop_server,
                                  bg=COLORS['error'], fg=COLORS['white'],
                                  font=('Helvetica', 12, 'bold'),
                                  padx=20, pady=8,
                                  relief='flat', cursor='hand2',
                                  state='disabled')
        self.stop_btn.pack(side='left', padx=(0, 10))
        
        self.browser_btn = tk.Button(btn_row, text="Open Browser",
                                     command=self.open_browser,
                                     bg=COLORS['bg'], fg=COLORS['green'],
                                     font=('Helvetica', 10, 'bold'),
                                     padx=15, pady=6,
                                     relief='solid', bd=1,
                                     cursor='hand2', state='disabled')
        self.browser_btn.pack(side='left')
        
        # URL
        self.url_var = tk.StringVar()
        tk.Label(server_frame, textvariable=self.url_var,
                font=('Courier', 11), fg=COLORS['green'],
                bg=COLORS['bg_dark']).pack(pady=(10, 0))
        
        # Log area
        log_frame = tk.Frame(main, bg=COLORS['bg'])
        log_frame.pack(fill='both', expand=True, pady=(0, 10))
        
        tk.Label(log_frame, text="Log:",
                font=('Helvetica', 9),
                fg=COLORS['text_light'], bg=COLORS['bg']).pack(anchor='w')
        
        self.log_text = tk.Text(log_frame, height=6, width=50,
                               font=('Courier', 9),
                               bg=COLORS['white'], fg=COLORS['text'])
        self.log_text.pack(fill='both', expand=True)
        
        # Footer
        tk.Label(main, text="Made by Weird Machine",
                font=('Helvetica', 9),
                fg=COLORS['text_light'], bg=COLORS['bg']).pack()
    
    def log(self, message):
        """Add message to log"""
        self.log_text.insert('end', f"{message}\n")
        self.log_text.see('end')
        self.root.update()
    
    def set_status(self, message, color=None):
        """Update status"""
        self.status_var.set(message)
        if color:
            self.status_dot.config(fg=color)
        self.root.update()
    
    def start_server(self):
        """Start the server"""
        # Validate API key
        key = self.api_key_var.get().strip()
        if not key:
            messagebox.showwarning("API Key Required",
                "Please enter your OpenAI API key first.")
            return
        
        # Save key
        save_api_key(key)
        self.log("API key saved")
        
        # Check if already running
        if is_port_in_use(DEFAULT_PORT):
            self.set_status("Already running", COLORS['success'])
            self.url_var.set(f"http://127.0.0.1:{DEFAULT_PORT}")
            self.start_btn.config(state='disabled')
            self.stop_btn.config(state='normal')
            self.browser_btn.config(state='normal')
            self.is_running = True
            self.open_browser()
            return
        
        # Disable start button
        self.start_btn.config(state='disabled')
        self.set_status("Checking dependencies...", COLORS['warning'])
        
        # Run startup in thread
        threading.Thread(target=self._startup_thread, daemon=True).start()
    
    def _startup_thread(self):
        """Handle startup in background thread"""
        # Check if dependencies installed
        if not check_dependencies():
            self.root.after(0, lambda: self.log("Installing dependencies (first run)..."))
            self.root.after(0, lambda: self.set_status("Installing dependencies (5-10 min)...", COLORS['warning']))
            
            success, msg = install_dependencies(
                status_callback=lambda m: self.root.after(0, lambda: self.log(m))
            )
            
            if not success:
                self.root.after(0, lambda: self.log(f"ERROR: {msg}"))
                self.root.after(0, lambda: self.set_status("Install failed", COLORS['error']))
                self.root.after(0, lambda: self.start_btn.config(state='normal'))
                self.root.after(0, lambda: messagebox.showerror("Install Failed", 
                    f"Could not install dependencies:\n\n{msg}\n\nTry running in Terminal:\npip install -r requirements.txt"))
                return
            
            self.root.after(0, lambda: self.log("Dependencies installed!"))
        
        # Start server
        self.root.after(0, lambda: self.set_status("Starting server...", COLORS['warning']))
        self.root.after(0, lambda: self.log("Starting server..."))
        
        process, error = start_server_process()
        
        if error:
            self.root.after(0, lambda: self.log(f"ERROR: {error}"))
            self.root.after(0, lambda: self.set_status("Failed to start", COLORS['error']))
            self.root.after(0, lambda: self.start_btn.config(state='normal'))
            return
        
        self.server_process = process
        
        # Read server output in separate thread
        threading.Thread(target=self._read_output, daemon=True).start()
        
        # Wait for server to be ready
        self.root.after(0, lambda: self.log("Waiting for server..."))
        
        for i in range(120):  # 2 minute timeout
            if is_port_in_use(DEFAULT_PORT):
                self.root.after(0, self._server_ready)
                return
            time.sleep(1)
            
            # Log progress every 10 seconds
            if i > 0 and i % 10 == 0:
                self.root.after(0, lambda i=i: self.log(f"Still starting... ({i}s)"))
        
        # Timeout
        self.root.after(0, lambda: self.log("Server startup timed out"))
        self.root.after(0, lambda: self.set_status("Startup timed out", COLORS['error']))
        self.root.after(0, lambda: self.start_btn.config(state='normal'))
    
    def _read_output(self):
        """Read server output"""
        if self.server_process:
            for line in self.server_process.stdout:
                line = line.rstrip()
                if line:
                    print(f"[Server] {line}")
                    # Only log important lines to GUI
                    if any(x in line.lower() for x in ['error', 'warning', 'started', 'running', 'uvicorn']):
                        self.root.after(0, lambda l=line: self.log(l[:80]))
    
    def _server_ready(self):
        """Called when server is ready"""
        self.is_running = True
        self.set_status("Running", COLORS['success'])
        self.url_var.set(f"http://127.0.0.1:{DEFAULT_PORT}")
        self.stop_btn.config(state='normal')
        self.browser_btn.config(state='normal')
        self.log("Server is ready!")
        self.open_browser()
    
    def stop_server(self):
        """Stop the server"""
        self.log("Stopping server...")
        
        if self.server_process:
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=5)
            except:
                self.server_process.kill()
            self.server_process = None
        
        # Kill anything on the port
        try:
            if sys.platform == 'darwin':
                os.system(f"lsof -ti:{DEFAULT_PORT} | xargs kill -9 2>/dev/null")
        except:
            pass
        
        self.is_running = False
        self.set_status("Stopped", COLORS['text_light'])
        self.url_var.set("")
        self.start_btn.config(state='normal')
        self.stop_btn.config(state='disabled')
        self.browser_btn.config(state='disabled')
        self.log("Server stopped")
    
    def open_browser(self):
        """Open browser"""
        webbrowser.open(f"http://127.0.0.1:{DEFAULT_PORT}")
    
    def run(self):
        """Run the app"""
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)
        self.root.mainloop()
    
    def on_close(self):
        """Handle window close"""
        if self.is_running:
            if messagebox.askyesno("Stop Server?",
                "Server is running. Stop it and quit?"):
                self.stop_server()
                time.sleep(0.5)
                self.root.destroy()
        else:
            self.root.destroy()


# ============== TERMINAL MODE ==============

def run_terminal():
    """Run in terminal mode"""
    print(f"\n{'='*50}")
    print(f"  {APP_NAME} v{APP_VERSION}")
    print(f"{'='*50}\n")
    
    # Check API key
    key = load_api_key()
    if not key:
        print("OpenAI API Key required!")
        print(f"Get one at: {OPENAI_API_URL}\n")
        key = input("Enter API key: ").strip()
        if key:
            save_api_key(key)
            print("Key saved!\n")
    
    # Check dependencies
    if not check_dependencies():
        print("Installing dependencies (this may take several minutes)...")
        success, msg = install_dependencies()
        if not success:
            print(f"ERROR: {msg}")
            print("\nTry manually: pip install -r requirements.txt")
            return
        print("Dependencies installed!\n")
    
    # Start server
    print("Starting server...")
    root = get_project_root()
    desktop_app = os.path.join(root, 'desktop_app.py')
    
    if os.path.exists(desktop_app):
        os.chdir(root)
        os.system(f'{sys.executable} {desktop_app}')
    else:
        print(f"ERROR: desktop_app.py not found in {root}")


# ============== MAIN ==============

if __name__ == "__main__":
    if HAS_TK:
        app = LauncherApp()
        app.run()
    else:
        run_terminal()
