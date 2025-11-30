#!/usr/bin/env python3
"""
Community Highlighter - Desktop Launcher v2.0
==============================================

A user-friendly GUI for launching Community Highlighter.
Matches the app's beige/green color scheme.

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
import signal

# Try to import tkinter
try:
    import tkinter as tk
    from tkinter import ttk, messagebox
    from tkinter import font as tkfont
    HAS_TK = True
except ImportError:
    HAS_TK = False

# Configuration
APP_NAME = "Community Highlighter"
APP_VERSION = "6.0"
DEFAULT_PORT = 8000
GITHUB_RELEASES = "https://github.com/amateurmenace/community-highlighter/releases"
OPENAI_API_URL = "https://platform.openai.com/api-keys"

# Color scheme matching the web app
COLORS = {
    'bg': '#F7F3E9',        # Cream/beige background
    'bg_dark': '#EDE8DC',   # Slightly darker beige
    'green': '#1E7F63',     # Primary green
    'green_light': '#97D68D', # Mint green
    'green_hover': '#166b52', # Darker green for hover
    'text': '#1a1a1a',      # Near black text
    'text_light': '#666666', # Gray text
    'white': '#FFFFFF',
    'error': '#dc3545',
    'warning': '#ffc107',
    'success': '#28a745',
}


def get_app_dir():
    """Get the application directory"""
    if getattr(sys, 'frozen', False):
        # Running as compiled app
        if sys.platform == 'darwin':
            # macOS .app bundle - go up from MacOS to Resources
            return os.path.dirname(os.path.dirname(os.path.dirname(sys.executable)))
        return os.path.dirname(sys.executable)
    return os.path.dirname(os.path.abspath(__file__))


def find_project_root():
    """Find the project root directory containing backend/app.py or desktop_app.py"""
    app_dir = get_app_dir()
    
    # Check various possible locations
    candidates = [
        app_dir,
        os.path.join(app_dir, 'Resources'),  # Inside .app bundle
        os.path.dirname(app_dir),
        os.getcwd(),
    ]
    
    for candidate in candidates:
        # Check for desktop_app.py
        if os.path.exists(os.path.join(candidate, 'desktop_app.py')):
            return candidate
        # Check for backend/app.py
        if os.path.exists(os.path.join(candidate, 'backend', 'app.py')):
            return candidate
    
    return app_dir


def get_env_path():
    """Find the .env file location"""
    project_root = find_project_root()
    paths = [
        os.path.join(project_root, 'backend', '.env'),
        os.path.join(project_root, '.env'),
    ]
    for p in paths:
        if os.path.exists(p):
            return p
    # Default to backend/.env
    backend_dir = os.path.join(project_root, 'backend')
    if os.path.exists(backend_dir):
        return os.path.join(backend_dir, '.env')
    return os.path.join(project_root, '.env')


def load_api_key():
    """Load existing API key from .env"""
    env_path = get_env_path()
    if os.path.exists(env_path):
        try:
            with open(env_path, 'r') as f:
                for line in f:
                    if line.startswith('OPENAI_API_KEY='):
                        key = line.split('=', 1)[1].strip()
                        if key and key != 'your-openai-key-here' and len(key) > 10:
                            return key
        except:
            pass
    return ""


def save_api_key(api_key, youtube_key=""):
    """Save API key to .env file"""
    env_path = get_env_path()
    env_dir = os.path.dirname(env_path)
    
    if env_dir and not os.path.exists(env_dir):
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
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(1)
            return s.connect_ex(('127.0.0.1', port)) == 0
    except:
        return False


def find_logo_path():
    """Find the logo file"""
    project_root = find_project_root()
    candidates = [
        os.path.join(project_root, 'logo.png'),
        os.path.join(project_root, 'src', 'logo.png'),
        os.path.join(project_root, 'dist', 'logo.png'),
        os.path.join(project_root, 'assets', 'logo.png'),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return None


class CommunityHighlighterApp:
    """Main GUI Application"""
    
    def __init__(self):
        self.root = tk.Tk()
        self.root.title(APP_NAME)
        self.root.geometry("520x580")
        self.root.resizable(False, False)
        self.root.configure(bg=COLORS['bg'])
        
        # Center window
        self.root.eval('tk::PlaceWindow . center')
        
        # Server state
        self.server_process = None
        self.server_running = False
        self.server_thread = None
        
        # Try to load logo
        self.logo_image = None
        self.load_logo()
        
        # Build UI
        self.build_ui()
        
        # Load existing API key
        existing_key = load_api_key()
        if existing_key:
            self.api_key_var.set(existing_key)
            self.status_label.config(text="Ready to start")
            self.status_indicator.config(fg=COLORS['warning'])
        
        # Check if server is already running
        if is_port_in_use(DEFAULT_PORT):
            self.update_status(True)
    
    def load_logo(self):
        """Load the logo image"""
        try:
            logo_path = find_logo_path()
            if logo_path:
                from PIL import Image, ImageTk
                img = Image.open(logo_path)
                # Resize to fit header
                img = img.resize((60, 60), Image.Resampling.LANCZOS)
                self.logo_image = ImageTk.PhotoImage(img)
        except ImportError:
            print("PIL not available, logo won't be displayed")
        except Exception as e:
            print(f"Could not load logo: {e}")
    
    def build_ui(self):
        """Build the user interface"""
        # Main container with beige background
        main = tk.Frame(self.root, padx=28, pady=20, bg=COLORS['bg'])
        main.pack(fill='both', expand=True)
        
        # Header with logo
        header = tk.Frame(main, bg=COLORS['bg'])
        header.pack(fill='x', pady=(0, 12))
        
        # Logo and title row
        title_row = tk.Frame(header, bg=COLORS['bg'])
        title_row.pack()
        
        if self.logo_image:
            logo_label = tk.Label(title_row, image=self.logo_image, bg=COLORS['bg'])
            logo_label.pack(side='left', padx=(0, 12))
        
        title_text_frame = tk.Frame(title_row, bg=COLORS['bg'])
        title_text_frame.pack(side='left')
        
        title = tk.Label(title_text_frame, text=APP_NAME, 
                        font=('Helvetica', 24, 'bold'), 
                        fg=COLORS['green'], bg=COLORS['bg'])
        title.pack(anchor='w')
        
        subtitle = tk.Label(title_text_frame, text="AI-Powered Meeting Analysis",
                           font=('Helvetica', 11), 
                           fg=COLORS['text_light'], bg=COLORS['bg'])
        subtitle.pack(anchor='w')
        
        # Version badge
        version_frame = tk.Frame(header, bg=COLORS['bg'])
        version_frame.pack(pady=(8, 0))
        
        version = tk.Label(version_frame, text=f" v{APP_VERSION} ",
                          font=('Helvetica', 9, 'bold'),
                          fg=COLORS['white'], bg=COLORS['green'])
        version.pack()
        
        # Divider
        divider1 = tk.Frame(main, height=2, bg=COLORS['green_light'])
        divider1.pack(fill='x', pady=16)
        
        # API Key Section
        api_frame = tk.Frame(main, bg=COLORS['bg_dark'], padx=20, pady=16)
        api_frame.pack(fill='x', pady=(0, 16))
        
        # Add rounded corner effect with border
        api_frame.config(highlightbackground=COLORS['green_light'], 
                        highlightthickness=2)
        
        api_title = tk.Label(api_frame, text="API Configuration", 
                            font=('Helvetica', 13, 'bold'),
                            fg=COLORS['text'], bg=COLORS['bg_dark'])
        api_title.pack(anchor='w', pady=(0, 12))
        
        # OpenAI Key
        openai_label = tk.Label(api_frame, text="OpenAI API Key", 
                               font=('Helvetica', 10, 'bold'),
                               fg=COLORS['text'], bg=COLORS['bg_dark'])
        openai_label.pack(anchor='w')
        
        key_frame = tk.Frame(api_frame, bg=COLORS['bg_dark'])
        key_frame.pack(fill='x', pady=(4, 0))
        
        self.api_key_var = tk.StringVar()
        self.api_key_entry = tk.Entry(key_frame, textvariable=self.api_key_var,
                                      width=42, show='•', font=('Courier', 11),
                                      bg=COLORS['white'], fg=COLORS['text'],
                                      insertbackground=COLORS['green'],
                                      relief='solid', bd=1)
        self.api_key_entry.pack(side='left', fill='x', expand=True, ipady=4)
        
        self.show_key_var = tk.BooleanVar()
        show_btn = tk.Checkbutton(key_frame, text="Show", variable=self.show_key_var,
                                  command=self.toggle_key_visibility,
                                  bg=COLORS['bg_dark'], fg=COLORS['text'],
                                  selectcolor=COLORS['white'],
                                  activebackground=COLORS['bg_dark'])
        show_btn.pack(side='left', padx=(8, 0))
        
        # Get API Key link
        link_frame = tk.Frame(api_frame, bg=COLORS['bg_dark'])
        link_frame.pack(anchor='w', pady=(10, 0))
        
        tk.Label(link_frame, text="Need a key?", 
                fg=COLORS['text_light'], bg=COLORS['bg_dark'],
                font=('Helvetica', 9)).pack(side='left')
        
        get_key_link = tk.Label(link_frame, text=" Get one free from OpenAI →",
                               fg=COLORS['green'], bg=COLORS['bg_dark'],
                               font=('Helvetica', 9, 'bold'),
                               cursor='hand2')
        get_key_link.pack(side='left')
        get_key_link.bind('<Button-1>', lambda e: webbrowser.open(OPENAI_API_URL))
        get_key_link.bind('<Enter>', lambda e: get_key_link.config(fg=COLORS['green_hover']))
        get_key_link.bind('<Leave>', lambda e: get_key_link.config(fg=COLORS['green']))
        
        # Instructions
        instructions = tk.Label(api_frame, 
            text="Sign up at OpenAI → Create API key → Paste above",
            font=('Helvetica', 9), fg=COLORS['text_light'], 
            bg=COLORS['bg_dark'], justify='left')
        instructions.pack(anchor='w', pady=(6, 0))
        
        # Save button
        save_btn = tk.Button(api_frame, text="Save API Key", 
                            command=self.save_key,
                            bg=COLORS['bg'], fg=COLORS['green'],
                            font=('Helvetica', 10, 'bold'),
                            relief='solid', bd=1,
                            cursor='hand2',
                            padx=16, pady=4)
        save_btn.pack(anchor='w', pady=(12, 0))
        
        # Divider
        divider2 = tk.Frame(main, height=2, bg=COLORS['green_light'])
        divider2.pack(fill='x', pady=16)
        
        # Server Control Section
        server_frame = tk.Frame(main, bg=COLORS['bg_dark'], padx=20, pady=16)
        server_frame.pack(fill='x', pady=(0, 16))
        server_frame.config(highlightbackground=COLORS['green_light'], 
                           highlightthickness=2)
        
        server_title = tk.Label(server_frame, text="Server Control",
                               font=('Helvetica', 13, 'bold'),
                               fg=COLORS['text'], bg=COLORS['bg_dark'])
        server_title.pack(anchor='w', pady=(0, 12))
        
        # Status indicator
        status_frame = tk.Frame(server_frame, bg=COLORS['bg_dark'])
        status_frame.pack(fill='x', pady=(0, 12))
        
        tk.Label(status_frame, text="Status:", 
                font=('Helvetica', 10, 'bold'),
                fg=COLORS['text'], bg=COLORS['bg_dark']).pack(side='left')
        
        self.status_indicator = tk.Label(status_frame, text="●", 
                                         font=('Helvetica', 16), 
                                         fg=COLORS['text_light'],
                                         bg=COLORS['bg_dark'])
        self.status_indicator.pack(side='left', padx=(8, 4))
        
        self.status_label = tk.Label(status_frame, text="Not running",
                                     font=('Helvetica', 10),
                                     fg=COLORS['text_light'],
                                     bg=COLORS['bg_dark'])
        self.status_label.pack(side='left')
        
        # Buttons row
        btn_frame = tk.Frame(server_frame, bg=COLORS['bg_dark'])
        btn_frame.pack(fill='x')
        
        self.start_btn = tk.Button(btn_frame, text="▶  Start Server",
                                   command=self.start_server,
                                   bg=COLORS['green'], fg=COLORS['white'],
                                   font=('Helvetica', 12, 'bold'),
                                   relief='flat',
                                   padx=20, pady=10, 
                                   cursor='hand2',
                                   activebackground=COLORS['green_hover'],
                                   activeforeground=COLORS['white'])
        self.start_btn.pack(side='left', padx=(0, 8))
        
        self.stop_btn = tk.Button(btn_frame, text="■  Stop",
                                  command=self.stop_server,
                                  bg=COLORS['error'], fg=COLORS['white'],
                                  font=('Helvetica', 12, 'bold'),
                                  relief='flat',
                                  padx=20, pady=10,
                                  cursor='hand2',
                                  state='disabled')
        self.stop_btn.pack(side='left', padx=(0, 8))
        
        self.open_btn = tk.Button(btn_frame, text="Open Browser",
                                  command=self.open_browser,
                                  bg=COLORS['bg'], fg=COLORS['green'],
                                  font=('Helvetica', 10, 'bold'),
                                  relief='solid', bd=1,
                                  padx=12, pady=8,
                                  cursor='hand2',
                                  state='disabled')
        self.open_btn.pack(side='left')
        
        # URL display
        self.url_label = tk.Label(server_frame, text="",
                                  font=('Courier', 11), 
                                  fg=COLORS['green'],
                                  bg=COLORS['bg_dark'])
        self.url_label.pack(pady=(12, 0))
        
        # Footer
        footer = tk.Frame(main, bg=COLORS['bg'])
        footer.pack(side='bottom', fill='x')
        
        divider3 = tk.Frame(footer, height=1, bg=COLORS['green_light'])
        divider3.pack(fill='x', pady=(0, 8))
        
        footer_text = tk.Label(footer, 
            text="Made by Weird Machine • Brookline Interactive Group",
            font=('Helvetica', 9), fg=COLORS['text_light'], bg=COLORS['bg'])
        footer_text.pack()
        
        github_link = tk.Label(footer, text="View on GitHub",
                              font=('Helvetica', 9, 'underline'),
                              fg=COLORS['green'], bg=COLORS['bg'],
                              cursor='hand2')
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
            self.status_label.config(text="API key saved - Ready to start")
            self.status_indicator.config(fg=COLORS['warning'])
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
        self.status_indicator.config(fg=COLORS['warning'])
        self.start_btn.config(state='disabled')
        self.root.update()
        
        # Start server in background thread
        self.server_thread = threading.Thread(target=self._run_server, daemon=True)
        self.server_thread.start()
        
        # Wait for server in another thread
        threading.Thread(target=self._wait_and_open, daemon=True).start()
    
    def _run_server(self):
        """Run the server process"""
        project_root = find_project_root()
        print(f"[Launcher] Project root: {project_root}")
        
        # Set environment
        env = os.environ.copy()
        env['CLOUD_MODE'] = 'false'
        
        # Load .env file into environment
        env_path = get_env_path()
        if os.path.exists(env_path):
            with open(env_path, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        env[key.strip()] = value.strip()
        
        # Find the right script to run
        desktop_app = os.path.join(project_root, 'desktop_app.py')
        backend_app = os.path.join(project_root, 'backend', 'app.py')
        
        if os.path.exists(desktop_app):
            cmd = [sys.executable, desktop_app]
            cwd = project_root
            print(f"[Launcher] Running: {' '.join(cmd)}")
        elif os.path.exists(backend_app):
            cmd = [sys.executable, '-m', 'uvicorn', 'app:app', 
                   '--host', '127.0.0.1', '--port', str(DEFAULT_PORT)]
            cwd = os.path.join(project_root, 'backend')
            print(f"[Launcher] Running uvicorn in: {cwd}")
        else:
            error_msg = f"Could not find server files in:\n{project_root}"
            print(f"[Launcher] ERROR: {error_msg}")
            self.root.after(0, lambda: self._show_error(error_msg))
            return
        
        try:
            # Start the process
            self.server_process = subprocess.Popen(
                cmd,
                env=env,
                cwd=cwd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                bufsize=1,
                universal_newlines=True
            )
            
            # Read output in real-time for debugging
            for line in self.server_process.stdout:
                print(f"[Server] {line.rstrip()}")
                # Check for successful startup indicators
                if "Uvicorn running" in line or "Application startup complete" in line:
                    print("[Launcher] Server started successfully!")
                    
        except Exception as e:
            error_msg = f"Failed to start server:\n{e}"
            print(f"[Launcher] ERROR: {error_msg}")
            self.root.after(0, lambda: self._show_error(error_msg))
    
    def _show_error(self, message):
        """Show error message on main thread"""
        self.update_status(False)
        messagebox.showerror("Error", message)
    
    def _wait_and_open(self):
        """Wait for server and open browser"""
        print("[Launcher] Waiting for server to start...")
        
        # Wait up to 30 seconds for server
        for i in range(60):
            if is_port_in_use(DEFAULT_PORT):
                print(f"[Launcher] Server is ready on port {DEFAULT_PORT}")
                self.root.after(0, lambda: self.update_status(True))
                time.sleep(0.5)  # Brief delay before opening browser
                self.root.after(0, self.open_browser)
                return
            time.sleep(0.5)
        
        # Timeout
        print("[Launcher] Server startup timed out")
        self.root.after(0, lambda: self.update_status(False))
        self.root.after(0, lambda: messagebox.showerror("Error",
            "Server failed to start within 30 seconds.\n\n"
            "Check that all dependencies are installed:\n"
            "pip install -r requirements.txt"))
    
    def update_status(self, running):
        """Update the UI to reflect server status"""
        self.server_running = running
        
        if running:
            self.status_indicator.config(fg=COLORS['success'])
            self.status_label.config(text="Running", fg=COLORS['success'])
            self.url_label.config(text=f"http://127.0.0.1:{DEFAULT_PORT}")
            self.start_btn.config(state='disabled')
            self.stop_btn.config(state='normal')
            self.open_btn.config(state='normal')
        else:
            self.status_indicator.config(fg=COLORS['text_light'])
            self.status_label.config(text="Not running", fg=COLORS['text_light'])
            self.url_label.config(text="")
            self.start_btn.config(state='normal')
            self.stop_btn.config(state='disabled')
            self.open_btn.config(state='disabled')
    
    def stop_server(self):
        """Stop the server"""
        print("[Launcher] Stopping server...")
        
        if self.server_process:
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=5)
            except:
                self.server_process.kill()
            self.server_process = None
        
        # Also try to kill any process on the port
        try:
            if sys.platform == 'darwin' or sys.platform.startswith('linux'):
                os.system(f"lsof -ti:{DEFAULT_PORT} | xargs kill -9 2>/dev/null")
        except:
            pass
        
        self.update_status(False)
        self.status_label.config(text="Server stopped")
    
    def open_browser(self):
        """Open the app in browser"""
        url = f"http://127.0.0.1:{DEFAULT_PORT}"
        print(f"[Launcher] Opening browser: {url}")
        webbrowser.open(url)
    
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
                time.sleep(0.5)
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
    project_root = find_project_root()
    
    desktop_app = os.path.join(project_root, 'desktop_app.py')
    if os.path.exists(desktop_app):
        os.chdir(project_root)
        os.system(f'{sys.executable} {desktop_app}')
    else:
        print(f"[ERROR] desktop_app.py not found in {project_root}")


def main():
    if HAS_TK:
        app = CommunityHighlighterApp()
        app.run()
    else:
        run_terminal_mode()


if __name__ == "__main__":
    main()
