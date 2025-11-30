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

### Option 1: Double-Click Launcher (Easiest)

**Mac Users:**
1. Download and extract the ZIP file
2. Double-click `Community-Highlighter.command`
3. On first run, enter your OpenAI API key when prompted
4. The app opens in your browser!

**Windows Users:**
1. Download and extract the ZIP file
2. Double-click `Community-Highlighter.bat`
3. On first run, enter your OpenAI API key when prompted
4. The app opens in your browser!

### Option 2: Manual Setup

```bash
# 1. Extract the ZIP and navigate to the folder
cd community-highlighter-v6.0

# 2. Create a virtual environment
python3 -m venv venv

# 3. Activate it
# Mac/Linux:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Set up your API key
cp backend/.env.example backend/.env
# Edit backend/.env and add your OpenAI API key

# 6. Run the app
python desktop_app.py
```

---

## Getting Your API Key

### OpenAI API Key (Required)

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Navigate to **API Keys** in the sidebar
4. Click **Create new secret key**
5. Copy the key (starts with `sk-`)

**Cost:** OpenAI charges based on usage. Analyzing a typical 2-hour meeting costs approximately $0.10-0.30.

### YouTube API Key (Optional)

Improves transcript fetching reliability.

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project
3. Enable the **YouTube Data API v3**
4. Create credentials (API Key)
5. Copy the key

---

## Configuration

Create a `.env` file in the `backend/` folder:

```env
# Required
OPENAI_API_KEY=sk-your-openai-key-here

# Optional - improves transcript fetching
YOUTUBE_API_KEY=your-youtube-key-here
```

---

## Usage

1. **Start the app** - Double-click the launcher or run `python desktop_app.py`
2. **Paste a YouTube URL** - Any public YouTube video with captions/transcripts
3. **Wait for analysis** - AI processes the transcript (1-3 minutes for long meetings)
4. **Explore the results:**
   - Read the AI summary
   - Browse the decision timeline
   - Search the transcript
   - Ask the AI assistant questions
   - Create video clips

---

## New in v6.0

### Cross-Meeting Analysis
- Add multiple YouTube URLs to compare meetings
- Visual knowledge graph showing topic connections
- Track how issues evolve across meetings

### Improved Clip Basket
- Thumbnail previews for saved clips
- Clip duration display
- Transcript text preview

### Cloud Mode Improvements
- Clear prompts to download desktop app for video features
- Locked button indicators for unavailable features

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

### "API key invalid"
- Make sure your key starts with `sk-`
- Check that you've added billing to your OpenAI account
- Verify the key is in `backend/.env`

### "Transcript not available"
- The video must have captions (auto-generated or manual)
- Try a different video to test
- Install yt-dlp: `pip install yt-dlp`

### "Rate limit exceeded"
- Wait a few minutes and try again
- OpenAI has usage limits on new accounts

### App doesn't start
- Check that all dependencies installed: `pip install -r requirements.txt`
- Try running directly: `cd backend && python app.py`

---

## Project Structure

```
community-highlighter-v6.0/
├── Community-Highlighter.command  # Mac launcher
├── Community-Highlighter.bat      # Windows launcher
├── desktop_app.py                 # Main desktop app
├── setup_wizard.py                # First-run setup GUI
├── requirements.txt               # Python dependencies
├── README.md                      # This file
├── backend/
│   ├── app.py                     # FastAPI server
│   ├── .env.example               # API key template
│   └── ...
└── dist/                          # Frontend build
    └── ...
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

# Run
python desktop_app.py
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
