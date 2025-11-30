# Community Highlighter v6.0

**AI-Powered Meeting Analysis for Community Engagement**

Transform long community meetings into actionable insights. Community Highlighter uses AI to analyze YouTube videos of town halls, city council meetings, school board sessions, and more.

![Community Highlighter](https://img.shields.io/badge/version-6.0-green) ![Python](https://img.shields.io/badge/python-3.9+-blue) ![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- **AI-Powered Summaries** - Get concise summaries of hours-long meetings
- **Entity Extraction** - Automatically identify people, places, organizations, and projects
- **Decision Timeline** - Track when key decisions were made
- **Cross-Meeting Analysis** - Compare multiple meetings and build knowledge graphs
- **Clip Creation** - Select and export video clips (desktop app only)
- **AI Meeting Assistant** - Ask questions about the meeting content
- **Transcript Search** - Full-text search with timestamp navigation
- **Multi-language Support** - Translate transcripts to 8+ languages

---

## Quick Start

### Mac Users

**Option A: App Bundle (Recommended)**
1. Download and extract the ZIP file
2. Drag `Community Highlighter.app` to your Applications folder
3. Double-click to launch
4. Enter your OpenAI API key when prompted
5. Click "Start Server" - the app opens in your browser!

**First Launch Security Note:**
If you see "Community Highlighter can't be opened because it is from an unidentified developer":
1. **Right-click** (or Control-click) on the app
2. Select **"Open"** from the menu
3. Click **"Open"** in the dialog that appears
4. This is only needed once - future launches work normally

**Option B: Command Line**
```bash
cd community-highlighter-v6.0
python3 launcher.py
```

### Windows Users

1. Download and extract the ZIP file
2. Double-click `Community-Highlighter.bat`
3. Enter your OpenAI API key when prompted
4. The app opens in your browser!

**Security Note:** If Windows SmartScreen appears, click "More info" then "Run anyway"

---

## Getting Your OpenAI API Key

An OpenAI API key is required to use the AI features. Here's how to get one:

### Step-by-Step:

1. **Go to OpenAI's website**
   - Visit: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)

2. **Create an account** (or sign in)
   - Click "Sign up" if you don't have an account
   - You can sign up with Google, Microsoft, or email

3. **Add payment method** (required for API access)
   - Go to Settings → Billing
   - Add a payment method
   - Note: You only pay for what you use (~$0.10-0.30 per meeting)

4. **Create an API key**
   - Go to API Keys section
   - Click "Create new secret key"
   - Give it a name like "Community Highlighter"
   - **Copy the key immediately** (it starts with `sk-`)
   - You won't be able to see it again!

5. **Paste in the app**
   - Launch Community Highlighter
   - Paste your API key in the field
   - Click "Save API Key"

### Cost Information

OpenAI charges based on usage:
- **Typical 2-hour meeting**: $0.10 - $0.30
- **You control the spending**: Set limits in your OpenAI dashboard
- **Free tier**: New accounts get $5 free credits

---

## Optional: YouTube API Key

A YouTube API key improves transcript fetching reliability but is not required.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable the **YouTube Data API v3**
4. Create credentials (API Key)
5. Add it to the app settings

---

## System Requirements

- **Python:** 3.9 or higher
- **OS:** Windows 10+, macOS 10.14+, or Linux
- **RAM:** 4GB minimum, 8GB recommended
- **Internet:** Required for AI features and YouTube access

---

## Troubleshooting

### "Python not found"
- Install Python from [python.org/downloads](https://www.python.org/downloads/)
- On Windows, check "Add Python to PATH" during installation
- On Mac, you may need to install from python.org even if you have the system Python

### macOS Security Warnings
If the app won't open:
1. **Right-click** the app (not double-click)
2. Select **"Open"** from the context menu
3. Click **"Open"** in the security dialog
4. This only needs to be done once

Or in Terminal:
```bash
xattr -cr "/Applications/Community Highlighter.app"
```

### "API key invalid"
- Make sure your key starts with `sk-`
- Check that you've added billing to your OpenAI account
- Verify the key is saved (check the app's status message)

### "Transcript not available"
- The video must have captions (auto-generated or manual)
- Try a different video to test
- Some videos block third-party access to captions

### App doesn't start
- Make sure you have Python 3.9 or higher: `python3 --version`
- Check that all dependencies installed correctly
- Try running from Terminal to see error messages:
  ```bash
  cd "/Applications/Community Highlighter.app/Contents/Resources"
  python3 launcher.py
  ```

---

## Project Structure

```
community-highlighter-v6.0/
├── Community Highlighter.app  # macOS application (Mac only)
├── Community-Highlighter.bat  # Windows launcher
├── launcher.py                # GUI launcher
├── desktop_app.py             # Server launcher
├── requirements.txt           # Python dependencies
├── README.md                  # This file
├── backend/
│   ├── app.py                 # FastAPI server
│   └── .env.example           # API key template
└── dist/                      # Frontend build
```

---

## Building from Source

```bash
# Clone the repository
git clone https://github.com/amateurmenace/community-highlighter.git
cd community-highlighter

# Install frontend dependencies
npm install

# Build frontend
npm run build

# Install backend dependencies
pip install -r requirements.txt

# Build Mac app
python build_mac_app.py

# Or run directly
python launcher.py
```

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Credits

Designed and developed by [Stephen Walter](https://weirdmachine.org) at [Brookline Interactive Group](https://brooklineinteractive.org)

In partnership with [NeighborhoodAI.org](https://neighborhoodai.org)

Built with React, FastAPI, OpenAI GPT, and Community

---

## Support

- **Issues:** [GitHub Issues](https://github.com/amateurmenace/community-highlighter/issues)
- **Email:** stephen@weirdmachine.org
- **Website:** [weirdmachine.org](https://weirdmachine.org)
