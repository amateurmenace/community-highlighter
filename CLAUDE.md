# Community Highlighter

AI-powered desktop + web app for analyzing civic meeting recordings. Extracts transcripts from YouTube videos, generates AI summaries, entity extraction, highlight reels, and video clip downloads. Features a video-editor-first UI with a professional timeline, clip basket, and one-click highlight reel generation. Installable as a PWA with mobile-optimized UI.

## Architecture

- **Frontend**: React 19 + Vite + vite-plugin-pwa, built to `dist/`. Monolithic `src/App.jsx` (~9200 lines) with 25+ inline sub-components
- **Backend**: FastAPI (`backend/app.py`, ~300KB monolith), served by Uvicorn on port 8000. 70 API endpoints
- **Desktop packaging**: PyInstaller bundles into macOS `.app` (signed+notarized) and Windows `.exe`
- **Cloud deployment**: Render (https://community-highlighter.onrender.com/) — video download disabled in cloud mode
- **GitHub**: https://github.com/amateurmenace/community-highlighter
- **Latest release**: https://github.com/amateurmenace/community-highlighter/releases/latest

## Key Entry Points

| File | Purpose |
|------|---------|
| `app_launcher.py` | PyInstaller bundle entry point — cross-platform (macOS + Windows) |
| `launcher.py` | Tkinter GUI launcher for development (API key input + server control) |
| `desktop_app.py` | Server process launcher (starts Uvicorn, opens browser/pywebview) |
| `backend/app.py` | FastAPI application (all API endpoints) |
| `src/App.jsx` | React frontend (large monolithic component) |
| `src/api.js` | API client (all fetch calls to backend) |

## User Workflow

1. Paste YouTube URL → Load Video
2. Transcript auto-extracted (YouTubeTranscriptApi → YouTube Data API → yt-dlp fallback chain)
3. AI generates summary + 10 key highlights with direct quotes (GPT-4o/GPT-5.1, map-reduce for long transcripts)
4. User can: search transcript, view analytics (entities, decisions, topics, participation), build highlight reels
5. Three paths to reels: (a) one-click AI auto-reel, (b) clip basket from search/timeline, (c) manual transcript selection
6. **Highlight reels load into the timeline editor** for review, trimming, reordering, and editing before export
7. Backend renders clips via ffmpeg, user downloads MP4/ZIP
8. **Celebration modal** with confetti animation on render completion, download history tracking

## UI Layout (Video-Editor-First Design)

The interface prioritizes video editing over data visualization:

1. **Video Player** — top of page, embedded YouTube iframe
2. **Hero Button** — "Make a 2-Minute Highlight Reel" directly below video player, one-click with sensible defaults
3. **Template Presets** — Quick Share (720p/60s/social), Meeting Brief (1080p/5min), News Clip (720p/90s/titled)
4. **Quick Action Buttons** — prominent row: "AI Highlight Reel", "Social Media Reel", "Export Clips"
5. **Full Video Download** — separate amber gradient section with integrated resolution picker
6. **Timeline Editor** — professional NLE-style timeline with:
   - Drag-to-reorder clips on a horizontal track (desktop)
   - Vertical clip cards with -1s/+1s trim buttons (mobile < 768px)
   - Per-clip trim handles (adjust start/end)
   - Waveform visualization per clip
   - Thumbnail strip for visual reference
   - Playback head / scrubber
   - Zoom in/out on timeline
   - Light theme (white/gray background, not dark)
7. **Settings Panel** — always visible, grouped into Quality/Effects/Branding sections (no hidden toggle)
8. **Clip Basket** — clips added from search results, transcript selections, or AI highlights
9. **Transcript Panel** — searchable, clickable timestamps, touch "+" buttons on mobile
10. **Analytics/Data Viz** — pushed below the fold (entities, decisions, topics, participation)
11. **Share Panel** — Web Share API on mobile, Copy/Twitter/Facebook/Email on desktop
12. **Download History** — header badge with recent downloads dropdown, toast notifications

## Video Processing Pipeline

### Download
- yt-dlp with format `best[ext=mp4]/best`, 10-min timeout
- Cached in `backend/cache/{videoId}.mp4`
- Non-MP4 outputs remuxed via `ffmpeg -c copy -movflags +faststart`
- Optional Webshare residential proxy for YouTube blocks
- **Resolution choices**: User can select download quality (best/1080p/720p/480p/360p)

### Cache Management
- **Automatic cleanup**: `cleanup_cache()` runs on startup and every 6 hours via FastAPI `lifespan`
- Deletes `.mp4`, `.zip`, `.srt` files older than 24 hours (configurable via `CACHE_MAX_AGE_HOURS` env var)
- Manual trigger: `POST /api/cache/cleanup` with optional `{"max_age_hours": N}`

### Clip Rendering (`POST /api/render_clips`, `POST /api/highlight_reel`)
- **Encoder**: `libx264 -preset fast -crf 20` — consistent high quality across all encodes
- **Audio**: `aac -ar 44100 -b:a 192k` — explicit bitrate on all encodes
- **Audio normalization**: EBU R128 `loudnorm` (I=-16, TP=-1.5, LRA=11) enabled by default
- **Font**: Bundled DejaVu Sans Bold (`backend/fonts/`) for reliable cross-platform text overlays
- **Seeking**: Input seeking (`-ss` before `-i`) + output trim, 1s buffer for keyframe alignment
- **Text overlays**: `drawtext` filter, 6% of video height, green (#22C55E), DejaVu Sans Bold
- **Lower thirds**: Speaker name + highlight text bar at 82% height, brand green (#1e7f63) background, fade-in animation, enabled via `lowerThirds` video option
- **Captions**: SRT subtitles via `subtitles` filter with pill-style backgrounds (`BorderStyle=4`, semi-transparent black)
- **Color filters**: 8 presets (vintage, warm, cool, high_contrast, bw, sepia, vibrant, cinematic)
- **Transitions**: `fade` in/out, `xfade` between clips, 0.5s duration
- **Speed**: `setpts` + `atempo` for 0.5x-2.0x
- **Social format**: Scale to 1080x1920 (9:16), blur-fill background (not black bars)
- **Concatenation**: ffmpeg concat demuxer, always re-encodes
- **Intro/outro slides**: Animated title cards with brand-colored (#1e7f63) background, wired into render pipeline
- **Music ducking**: `sidechaincompress` filter auto-lowers background music during speech
- **Progress tracking**: `run_ffmpeg_with_progress()` provides real-time per-clip percentage updates via `-progress pipe:1`

### Quote-to-Timestamp Matching
- `find_quote_timestamp()`: Matches first 8 words of AI-generated quote against transcript segments
- Configurable padding (default 4s before/after)
- If >5 highlights: selects 5 evenly-spaced clips
- Fallback: clips at regular intervals if no timestamps matched

### Remaining Opportunities
- Hardware acceleration (detected but not used — libx264 for reliability)

## API Endpoints (70 total, Key Categories)

### Video/Clips
- `POST /api/download_mp4` — Download full YouTube video
- `POST /api/render_clips` — Render clips from selections
- `POST /api/render_multi_video_clips` — Multi-video export
- `POST /api/highlight_reel` — AI-generated highlight reel
- `GET /api/video_formats/{video_id}` — List available resolutions
- `POST /api/clip_thumbnails` — Generate timeline preview thumbnails
- `GET /api/job_status` — Poll render job progress
- `GET /api/video_capabilities` — Available editing features
- `POST /api/cache/cleanup` — Manual cache cleanup

### AI Analysis
- `POST /api/summary_ai` — Map-reduce summary (concise/detailed/highlights_with_quotes)
- `POST /api/analytics/extended` — Entity extraction
- `POST /api/analytics/policy_impact`, `action_items`, `budget_impact`, `meeting_efficiency`
- `POST /api/assistant/chat` — RAG-based meeting Q&A

### Transcript
- `POST /api/transcript` — Fetch with 3-layer fallback
- `POST /api/translate` — Translate transcript
- `POST /api/wordfreq` — Word frequency analysis

### Knowledge Base
- `POST /api/knowledge/add_meeting`, `search`, `find_related` — ChromaDB-backed cross-meeting search

### Issues & Subscriptions
- `POST /api/issues/create`, `list`, `add_meeting`, `auto_track`, `{id}/timeline`
- `POST /api/subscriptions/create`, `list`, `delete`, `check_matches`

## Frontend State Management

- All React hooks (useState/useRef), no Redux/Context
- ~35+ top-level state variables in App.jsx
- 25+ inline sub-components (CelebrationModal, OnboardingWizard, SharePanel, TemplatePresets, ExportModal, FeedbackModal, ProgressIndicator, etc.)
- YouTube embedded via iframe (no programmatic play/pause control)
- Job polling: `setInterval` every 1.5s, no exponential backoff
- Timeline editor state: `clipBasket` array with per-clip start/end/title/thumbnail
- Download history: persisted in localStorage (`ch_downloads`), max 20 entries
- Onboarding: first-visit wizard tracked via localStorage (`ch_onboarding_done`)
- Toast notifications: auto-dismiss after 4s, fixed bottom-right

## PWA Support

- **Plugin**: `vite-plugin-pwa` with `generateSW` mode and `autoUpdate` registration
- **Manifest**: `Community Highlighter`, theme color `#1E7F63`, standalone display
- **Service Worker**: Workbox precaches static assets, network-first for `/api/*`, network-only for YouTube
- **iOS**: Apple touch icon, mobile-web-app-capable meta tags
- **Install**: Browser-native install prompt (Chrome/Edge/Safari)

## Build & Distribution

### Development
```bash
npm run dev          # Vite dev server on :5173, proxies API to :8000
python desktop_app.py  # Start backend in desktop mode
```

### Production Build — macOS
```bash
npm run build                        # Build React to dist/
./build_mac_app_signed.sh           # Full signed+notarized .app + .dmg
```

### Production Build — Windows
```bash
# Option 1: Build locally on a Windows machine
build_windows.bat

# Option 2: Build via GitHub Actions (from any machine)
gh workflow run build-windows.yml -f version=v7.1.0
```

### Build Scripts
- `build_mac_app_signed.sh` — Signed + notarized macOS build (`.app` + `.dmg`)
- `build_windows.bat` — Windows build (`.exe` in portable ZIP)
- `CommunityHighlighter.spec` — PyInstaller spec for macOS
- `CommunityHighlighter-Windows.spec` — PyInstaller spec for Windows
- `entitlements.plist` — macOS entitlements for code signing
- `.github/workflows/build-windows.yml` — GitHub Actions workflow for Windows builds

### PyInstaller Bundling Notes
- Both specs **exclude** `backend/venv/`, `.venv/`, `dist/`, `build/`, `cache/` to avoid bundling virtualenvs and old build artifacts
- macOS build script removes nested `__dot__app` bundles before signing
- All nested binaries (`.dylib`, `.so`) are signed with `--timestamp --options runtime` for notarization
- The `favicon.ico` is auto-generated from `logo.png` via Pillow

### Code Signing Setup (one-time, macOS only)
1. Install "Developer ID Application" certificate from Apple Developer portal
2. Store notarization credentials:
   ```
   xcrun notarytool store-credentials community-highlighter-notarize \
     --apple-id YOUR@EMAIL.COM --team-id 6M536MV7GT \
     --password APP_SPECIFIC_PASSWORD
   ```
3. Generate app-specific password at https://appleid.apple.com/account/manage

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes | OpenAI API key for analysis |
| `YOUTUBE_API_KEY` | No | Improves transcript fetching (optional, app works without it) |
| `CLOUD_MODE` | Auto | `true` on Render, `false` for desktop |
| `DESKTOP_MODE` | Auto | Set by app_launcher.py |
| `FFMPEG_PATH` | Auto | Auto-detected from Homebrew (macOS) or PATH (Windows) |
| `CACHE_MAX_AGE_HOURS` | No | Cache cleanup threshold in hours (default: 24) |

`.env` file locations (checked in order):
1. `backend/.env`
2. `./.env`
3. `~/.community-highlighter/.env` (for bundled app)

## External Dependencies

- **ffmpeg**: Required for video processing
  - macOS: `brew install ffmpeg`
  - Windows: `winget install ffmpeg`
- **yt-dlp**: Required for YouTube downloads. Auto-updated to nightly on each launch because YouTube aggressively blocks old versions

## Known Issues & Gotchas

- `argv_emulation` in PyInstaller spec MUST be `False` — `True` causes infinite app relaunch on macOS
- All nested binaries (.dylib, .so) must be signed with entitlements AND `--timestamp` for notarization
- PyInstaller specs must EXCLUDE `backend/venv/`, `.venv/`, `dist/`, `build/`, `cache/` — bundling these causes notarization failure (unsigned nested binaries) and massive app size
- `backend/app.py` is a ~300KB monolith — changes require care
- `src/App.jsx` is ~9200 lines — also monolithic, 25+ inline components
- PyInstaller bundles torch/scipy/sklearn (huge) — could exclude unused ML deps to shrink app further
- yt-dlp download timeout (10 min) can fail on long videos
- YouTube API key is optional — transcript fetching falls back to YouTubeTranscriptApi → yt-dlp without it
- Windows builds use `msvcrt` for instance locking (macOS uses `fcntl`)

## Version

Current: 7.2.0
Bundle ID: `com.communityhighlighter.app`
Developer: Stephen Walter (6M536MV7GT)
