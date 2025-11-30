#!/usr/bin/env python3
"""
Community Highlighter - Setup Wizard
====================================
A simple GUI to help users configure their API keys on first run.
"""

import os
import sys
import subprocess
import webbrowser

def check_tkinter():
    """Check if tkinter is available"""
    try:
        import tkinter
        return True
    except ImportError:
        return False

def run_gui_setup():
    """Run the GUI setup wizard"""
    import tkinter as tk
    from tkinter import messagebox, ttk
    
    class SetupWizard:
        def __init__(self):
            self.root = tk.Tk()
            self.root.title("Community Highlighter - Setup")
            self.root.geometry("500x400")
            self.root.resizable(False, False)
            
            # Center window
            self.root.eval('tk::PlaceWindow . center')
            
            # Main frame
            main_frame = tk.Frame(self.root, padx=30, pady=20)
            main_frame.pack(fill='both', expand=True)
            
            # Title
            title = tk.Label(main_frame, text="Community Highlighter", 
                           font=('Helvetica', 20, 'bold'), fg='#1E7F63')
            title.pack(pady=(0, 5))
            
            subtitle = tk.Label(main_frame, text="Setup Wizard", 
                              font=('Helvetica', 12), fg='#666')
            subtitle.pack(pady=(0, 20))
            
            # Instructions
            instructions = tk.Label(main_frame, 
                text="To use Community Highlighter, you need an OpenAI API key.\n"
                     "This key allows the app to generate summaries and analyze meetings.",
                wraplength=400, justify='center', fg='#333')
            instructions.pack(pady=(0, 20))
            
            # API Key entry
            key_frame = tk.Frame(main_frame)
            key_frame.pack(fill='x', pady=(0, 10))
            
            key_label = tk.Label(key_frame, text="OpenAI API Key:", font=('Helvetica', 11))
            key_label.pack(anchor='w')
            
            self.api_key_var = tk.StringVar()
            self.api_key_entry = tk.Entry(key_frame, textvariable=self.api_key_var, 
                                         width=50, show='*', font=('Courier', 10))
            self.api_key_entry.pack(fill='x', pady=(5, 0))
            
            # Show/Hide toggle
            self.show_key = tk.BooleanVar()
            show_check = tk.Checkbutton(key_frame, text="Show key", 
                                       variable=self.show_key, command=self.toggle_key_visibility)
            show_check.pack(anchor='w', pady=(5, 0))
            
            # Get API key link
            link_frame = tk.Frame(main_frame)
            link_frame.pack(pady=(0, 20))
            
            link_text = tk.Label(link_frame, text="Don't have an API key? ", fg='#666')
            link_text.pack(side='left')
            
            link = tk.Label(link_frame, text="Get one here", fg='#1E7F63', 
                          cursor='hand2', font=('Helvetica', 10, 'underline'))
            link.pack(side='left')
            link.bind('<Button-1>', lambda e: webbrowser.open('https://platform.openai.com/api-keys'))
            
            # YouTube API Key (optional)
            yt_frame = tk.Frame(main_frame)
            yt_frame.pack(fill='x', pady=(0, 20))
            
            yt_label = tk.Label(yt_frame, text="YouTube API Key (optional):", font=('Helvetica', 11))
            yt_label.pack(anchor='w')
            
            self.yt_key_var = tk.StringVar()
            self.yt_key_entry = tk.Entry(yt_frame, textvariable=self.yt_key_var, 
                                        width=50, font=('Courier', 10))
            self.yt_key_entry.pack(fill='x', pady=(5, 0))
            
            yt_note = tk.Label(yt_frame, text="Improves transcript fetching. Get one at console.cloud.google.com",
                             font=('Helvetica', 9), fg='#999')
            yt_note.pack(anchor='w', pady=(2, 0))
            
            # Buttons
            button_frame = tk.Frame(main_frame)
            button_frame.pack(pady=(10, 0))
            
            save_btn = tk.Button(button_frame, text="Save & Start App", 
                               command=self.save_and_start,
                               bg='#1E7F63', fg='white', 
                               font=('Helvetica', 12, 'bold'),
                               padx=20, pady=8, cursor='hand2')
            save_btn.pack(side='left', padx=(0, 10))
            
            skip_btn = tk.Button(button_frame, text="Skip Setup", 
                               command=self.skip_setup,
                               font=('Helvetica', 10),
                               padx=15, pady=6)
            skip_btn.pack(side='left')
        
        def toggle_key_visibility(self):
            if self.show_key.get():
                self.api_key_entry.config(show='')
            else:
                self.api_key_entry.config(show='*')
        
        def save_and_start(self):
            api_key = self.api_key_var.get().strip()
            yt_key = self.yt_key_var.get().strip()
            
            if not api_key:
                messagebox.showwarning("Missing API Key", 
                    "Please enter your OpenAI API key to use the app's AI features.")
                return
            
            if not api_key.startswith('sk-'):
                messagebox.showwarning("Invalid API Key", 
                    "OpenAI API keys usually start with 'sk-'. Please check your key.")
                return
            
            # Save to .env file
            env_content = f"OPENAI_API_KEY={api_key}\n"
            if yt_key:
                env_content += f"YOUTUBE_API_KEY={yt_key}\n"
            
            # Find the right location
            script_dir = os.path.dirname(os.path.abspath(__file__))
            backend_dir = os.path.join(script_dir, 'backend')
            
            if os.path.exists(backend_dir):
                env_path = os.path.join(backend_dir, '.env')
            else:
                env_path = os.path.join(script_dir, '.env')
            
            try:
                with open(env_path, 'w') as f:
                    f.write(env_content)
                
                messagebox.showinfo("Success", 
                    "API keys saved! The app will now start.")
                self.root.destroy()
                self.start_app = True
            except Exception as e:
                messagebox.showerror("Error", f"Failed to save API keys: {e}")
        
        def skip_setup(self):
            if messagebox.askyesno("Skip Setup?", 
                "Without an API key, AI features won't work.\n\nContinue anyway?"):
                self.root.destroy()
                self.start_app = True
        
        def run(self):
            self.start_app = False
            self.root.mainloop()
            return self.start_app
    
    wizard = SetupWizard()
    return wizard.run()

def check_env_exists():
    """Check if .env file exists with API key"""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    env_paths = [
        os.path.join(script_dir, 'backend', '.env'),
        os.path.join(script_dir, '.env'),
    ]
    
    for env_path in env_paths:
        if os.path.exists(env_path):
            with open(env_path, 'r') as f:
                content = f.read()
                if 'OPENAI_API_KEY=' in content:
                    key = content.split('OPENAI_API_KEY=')[1].split('\n')[0].strip()
                    if key and key != 'your-key-here':
                        return True
    return False

def main():
    print("\n" + "=" * 50)
    print("  Community Highlighter v6.0")
    print("=" * 50 + "\n")
    
    # Check if setup is needed
    if not check_env_exists():
        print("[*] First time setup detected...")
        
        if check_tkinter():
            print("[*] Opening setup wizard...")
            if not run_gui_setup():
                print("[!] Setup cancelled.")
                sys.exit(0)
        else:
            print("[!] GUI not available. Please create a .env file with your OPENAI_API_KEY")
            sys.exit(1)
    
    # Start the main app
    print("[*] Starting Community Highlighter...")
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    desktop_app = os.path.join(script_dir, 'desktop_app.py')
    
    if os.path.exists(desktop_app):
        os.system(f'python3 "{desktop_app}"')
    else:
        print("[!] desktop_app.py not found!")
        sys.exit(1)

if __name__ == "__main__":
    main()
