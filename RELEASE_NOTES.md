# Community Highlighter v7.0.0 - Desktop App for macOS

**AI-powered civic meeting analysis tool** - Automatically summarize, search, and create highlights from local government meeting recordings.

---

## 📥 Installation (macOS)

### Method 1: DMG Installer (Recommended)

1. **Download** `CommunityHighlighter-7.0.0-macOS.dmg`
2. **Open** the DMG file
3. **Drag** "Community Highlighter" to your Applications folder
4. **First launch**: Right-click the app → "Open" (required for unsigned apps)

### Method 2: ZIP Archive

1. **Download** `CommunityHighlighter-7.0.0-macOS.zip`
2. **Unzip** the file
3. **Move** "Community Highlighter.app" to your Applications folder
4. **First launch**: Right-click the app → "Open"

---

## ⚙️ Setup (Required)

### 1. Install ffmpeg (for video features)

Open Terminal and run:
```bash
brew install ffmpeg
```

Don't have Homebrew? Install it first:
```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 2. Configure API Keys

Create a configuration file:

```bash
mkdir -p ~/.community-highlighter
nano ~/.community-highlighter/.env
```

Add your API keys:
```
OPENAI_API_KEY=sk-your-openai-key-here
YOUTUBE_API_KEY=your-youtube-api-key-here
```

Save and exit (Ctrl+X, then Y, then Enter).

### Getting API Keys

| Service | How to Get Key |
|---------|---------------|
| **OpenAI** | Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys) → Create new key |
| **YouTube** | Go to [console.cloud.google.com](https://console.cloud.google.com) → Create project → Enable "YouTube Data API v3" → Create credentials → API Key |

---

## 🚀 Running the App

1. Open "Community Highlighter" from your Applications folder
2. The app will open in your default browser at `http://127.0.0.1:8000`
3. Paste a YouTube URL of a civic meeting and click "Load"

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🏛️ **Civic Meeting Finder** | Search for government meetings by city/town |
| 📊 **AI Summaries** | Get key highlights and decisions automatically |
| 🔍 **Smart Search** | Search within transcripts with timestamps |
| 👥 **Entity Extraction** | Identify people, places, and organizations |
| 🎬 **Highlight Reels** | Create video clips of key moments |
| 📥 **Video Download** | Download meetings for offline viewing |
| 🌐 **Translation** | Translate transcripts to multiple languages |

---

## 🔧 Troubleshooting

### "App is damaged and can't be opened"

This happens because the app isn't signed with an Apple Developer certificate.

**Fix:**
```bash
xattr -cr /Applications/Community\ Highlighter.app
```

Then try opening again.

### "Cannot verify developer"

Right-click the app → "Open" → Click "Open" in the dialog.

### App won't start

1. Check that your `.env` file exists: `cat ~/.community-highlighter/.env`
2. Make sure ffmpeg is installed: `which ffmpeg`
3. Check Console.app for error messages

### Video download not working

Update yt-dlp (the app does this automatically, but you can force it):
```bash
pip install -U https://github.com/yt-dlp/yt-dlp/archive/master.tar.gz
```

---

## 📋 System Requirements

- **macOS**: 10.15 (Catalina) or later
- **Processor**: Intel or Apple Silicon (M1/M2/M3)
- **RAM**: 4GB minimum, 8GB recommended
- **Storage**: 500MB for app + space for downloaded videos
- **Internet**: Required for API calls and YouTube access

---

## 🔒 Privacy

- All processing happens locally on your machine
- API keys are stored only in your local `.env` file
- No data is sent to third parties except OpenAI (for AI analysis) and YouTube (for video access)
- Downloaded videos are stored in your local Downloads folder

---

## 📝 Changelog

### v7.0.0
- ✅ Proper macOS app bundle (drag to Applications)
- ✅ Fixed emoji encoding issues
- ✅ Civic Meeting Finder on landing page
- ✅ Locked video features show prompt to download desktop app (cloud version)
- ✅ Auto-updates yt-dlp on every launch
- ✅ Improved search (20 results, civic-keyword sorting)

---

## 🐛 Report Issues

Found a bug? [Open an issue on GitHub](https://github.com/amateurmenace/community-highlighter/issues)

---

## 📜 License

Open source - MIT License
