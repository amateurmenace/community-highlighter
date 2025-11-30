# 🏛️ Community Highlighter

**Transform community meeting recordings into actionable insights with AI-powered analysis.**

![Beta](https://img.shields.io/badge/Status-BETA-yellow)
![License](https://img.shields.io/badge/License-MIT-green)

Community Highlighter is a web application that helps citizens, journalists, and community organizers extract meaningful insights from YouTube recordings of city council meetings, town halls, and other community gatherings.

## ✨ Features

### Core Features
- 📝 **AI-Powered Summaries** - Get key highlights and decisions extracted automatically
- 💬 **Conversational AI Assistant** - "Chat" with your meeting to ask questions naturally
- 📊 **Rich Analytics** - Topic heatmaps, decision timelines, sentiment analysis
- 🎬 **Clip Export** - Create highlight reels and export key moments
- 🌐 **Translation** - Translate transcripts to multiple languages
- 📥 **Downloads** - Export transcripts, summaries, and clips

### v5.0 Enhanced Features
- 🤖 **Enhanced AI Assistant** - Conversational memory, semantic search, follow-up suggestions
- 📈 **Meeting Comparison** - Compare topics, sentiment, and decisions across meetings
- 📚 **Knowledge Base** - Build a searchable archive of all your meetings
- 🔴 **Live Mode** - Monitor live meetings in real-time (experimental)

## 🚀 Quick Start

### Prerequisites
- Python 3.9+ 
- Node.js 18+
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))

### Local Development Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/amateurmenace/community-highlighter.git
   cd community-highlighter
   ```

2. **Set up the backend**
   ```bash
   # Create virtual environment (recommended)
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   
   # Install dependencies
   pip install -r requirements.txt
   
   # Download NLTK data (one-time)
   python -c "import nltk; nltk.download('punkt'); nltk.download('stopwords')"
   ```

3. **Set up environment variables**
   ```bash
   # Create .env file
   cp .env.example .env
   
   # Edit .env and add your keys:
   OPENAI_API_KEY=sk-your-key-here
   YOUTUBE_API_KEY=your-youtube-key  # Optional, for enhanced features
   ```

4. **Set up the frontend**
   ```bash
   npm install
   ```

5. **Run the development servers**
   
   Terminal 1 (Backend):
   ```bash
   python app.py
   ```
   
   Terminal 2 (Frontend):
   ```bash
   npm run dev
   ```

6. **Open the app**
   Visit `http://localhost:5173` in your browser

### Production Build

```bash
# Build the React frontend
npm run build

# The build will be in the 'dist' folder
# The FastAPI server will serve it automatically
python app.py
```

## 🎯 How to Use

1. **Paste a YouTube URL** of a community meeting with English captions
2. **Wait for processing** - the app will fetch the transcript and analyze it
3. **Explore the insights** - summaries, topics, decisions, and more
4. **Chat with the meeting** - ask natural questions like "What was said about the budget?"
5. **Export what you need** - download clips, transcripts, or the full summary

### Best YouTube URLs
✅ Works best: `https://www.youtube.com/watch?v=VIDEO_ID`  
⚠️ May not work: Short links (`youtu.be/...`) or Live links (`youtube.com/live/...`)

### Videos That Work Best
- City council meetings with official captions
- Town halls and public hearings
- Board meetings and committee sessions
- Any video with English subtitles enabled

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | Your OpenAI API key for AI features |
| `YOUTUBE_API_KEY` | No | YouTube API key for enhanced metadata |
| `PORT` | No | Server port (default: 8000) |

### Cost Considerations
- AI features use OpenAI's API (GPT-4o-mini for chat, GPT-4o for analysis)
- Typical cost: ~$0.10-$0.50 per meeting analyzed
- The app caches results to minimize repeat API calls

## 🌐 Deployment

### Deploy to Render (Recommended)

1. Push your code to GitHub
2. Go to [render.com](https://render.com) and create a new Web Service
3. Connect your GitHub repository
4. Configure:
   - **Build Command**: `pip install -r requirements.txt && npm install && npm run build`
   - **Start Command**: `python app.py`
   - **Environment Variables**: Add your `OPENAI_API_KEY`
5. Deploy!

### Deploy with Docker

```bash
docker build -t community-highlighter .
docker run -p 8000:8000 -e OPENAI_API_KEY=sk-... community-highlighter
```

## 📁 Project Structure

```
community-highlighter/
├── app.py              # FastAPI backend (main application)
├── api.js              # Frontend API client
├── App.jsx             # React frontend (main component)
├── index.css           # Styles
├── main.jsx            # React entry point
├── index.html          # HTML template
├── requirements.txt    # Python dependencies
├── package.json        # Node.js dependencies
├── vite.config.js      # Vite configuration
├── .env.example        # Environment template
└── README.md           # This file
```

## 🛠️ Tech Stack

- **Backend**: FastAPI, Python 3.9+
- **Frontend**: React 18, Vite
- **AI**: OpenAI GPT-4o, GPT-4o-mini
- **Vector DB**: ChromaDB (for knowledge base)
- **Transcripts**: youtube-transcript-api
- **NLP**: NLTK, TextBlob, Sentence-Transformers

## 🐛 Troubleshooting

### "Video doesn't have captions"
The video must have English captions/subtitles available on YouTube. Try:
- Official government meeting recordings
- TED Talks
- Videos with auto-generated captions enabled

### "OpenAI API error"
- Check your API key is valid
- Ensure you have API credits
- Check your rate limits

### "CORS error" during development
Make sure both servers are running:
- Backend on port 8000
- Frontend on port 5173

## 🤝 Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

## 💬 Feedback

This is a BETA release! We'd love your feedback:
- **Email**: stephen@weirdmachine.org
- **Issues**: [GitHub Issues](https://github.com/amateurmenace/community-highlighter/issues)

## 🙏 Credits

Created by [Stephen Walter](https://weirdmachine.org) at [Brookline Interactive Group](https://brooklineinteractive.org)

In partnership with [NeighborhoodAI.org](https://NeighborhoodAI.org)

---

**Built with ❤️ for community transparency and civic engagement.**
