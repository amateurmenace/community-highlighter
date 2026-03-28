# Community Highlighter

AI-powered desktop + web app for analyzing civic meeting recordings. Extracts transcripts from YouTube videos, generates AI summaries, entity extraction, highlight reels, and video clip downloads. Features a video-editor-first UI with a professional timeline, clip basket, and one-click highlight reel generation. Installable as a PWA with mobile-optimized UI.

## Architecture

- **Frontend**: React 19 + Vite + vite-plugin-pwa, built to `dist/`. Monolithic `src/App.jsx` (~9400 lines) with 25+ inline sub-components
- **Backend**: FastAPI (`backend/app.py`, ~304KB monolith), served by Uvicorn on port 8000. 69 API endpoints
- **Desktop packaging**: PyInstaller bundles into macOS `.app` (signed+notarized) and Windows `.exe`
- **Cloud deployment**: Render (https://community-highlighter.onrender.com/) — full video editor with Share Reel Link + Desktop Handoff (.chreel); video download/render disabled in cloud mode
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
4. **Hero "Make AI Highlight Reel" button** — prominent green CTA directly below video, one-click with sensible defaults
5. User selects reel style from collapsible "Choose Reel Style" panel: Decisions, Comments, Controversial, Budget, Actions, Social (with descriptions)
6. **Top 5 of 10 AI highlights auto-load into dark timeline editor** — user can add remaining 5 from the Highlights panel (shows "✓ In timeline" / "+ Add" per highlight)
7. User can also: search transcript (rich result cards with Watch/+Timeline/Context/Investigate), view analytics, build clips manually
8. Export via labeled "Export N Clips as Video" button + "Download Full Video" button (orange, with resolution picker) in toolbar → backend renders via ffmpeg → MP4/ZIP download
9. **Celebration modal** with confetti animation on render completion, download history tracking

## UI Layout (Video Editor — Dark Workspace Design)

Both desktop and cloud users get the same full video editor. Cloud users can build and preview reels, then share via link or export as `.chreel` file for desktop rendering. The interface uses a unified dark editing workspace inspired by professional NLEs (Premiere Pro / DaVinci Resolve):

1. **Search & Discover Zone** — appears ABOVE the editor, white card with neo-brutalist borders:
   - **Search Bar** — full-width, large input (15px), 🔬 Investigate, 🌐 Translate, ⬇️ Download, language selector (8 languages)
   - **Search Sparkline** — timeline distribution bar (50 bins) when searching
   - **Two-column grid**:
     - **Left**: Word Cloud Hero (420px min-height, dark blueprint bg, ALL words, top 3 glow) OR Search Result Cards (when searching)
     - **Right**: Small preview video (240px YouTube embed, `searchPlayerRef`) + Jargon Translator + compact Highlights list
   - Search result "▶ Watch" seeks the small preview player; timeline clips seek the big editor player
2. **Dark Editing Workspace** (`#0f1419` background) — video + toolbar + timeline as one connected unit:
   - **Video Player** — full-width, 520px height, embedded YouTube iframe (`playerRef`)
   - **Hero AI Reel Button** — full-width green gradient CTA "Make AI Highlight Reel" (loads top 5 of 10 highlights)
   - **Collapsible Reel Styles** — "🎬 Choose Reel Style" toggle reveals 6 cards with descriptions
   - **Compact Toolbar** — adapts to environment:
     - **Desktop**: Export button (green), Download Full Video (orange) with resolution picker
     - **Cloud**: Share Reel Link (blue), Render in Desktop App (green, downloads `.chreel`)
     - **Both**: clip count, zoom, Chapter Titles ON/OFF, Shuffle/Regenerate/Clear, "⚙️ Customize Settings"
   - **Timeline Editor** — dark-themed NLE track with drag-to-reorder, trim handles, loading animation, tooltips
   - **Clip Inspector** — dark-themed panel when clip selected
   - **Job Status** — progress bar during render
3. **Bottom Panel** — AI Summary, Key Highlights, Transcript Tools (Translate/Download/View Full Transcript)
4. **Meeting Analyzer Section** — separated by "📊 Meeting Analyzer" section divider:
   - ALL data visualizations always visible: Scorecard, Entities, Participation, Topics, Timeline, Disagreements, Dynamics, Cross-References, Subscriptions, Issue Tracker
   - Three named section dividers separate the page: "🔍 Video Searcher", "🎬 Video Highlighter", "📊 Meeting Analyzer"
5. **Settings Drawer** — slides from right edge (400px), triggered by "⚙️ Customize Settings":
   - Quality: Resolution, Speed, Audio Normalize
   - Effects: Captions, Color Filter, Transitions, Background Music
   - Branding: Intro/Outro Title/Subtitle/CTA, Chapter Titles, Watermark, Speaker Labels
   - Full Video Download with resolution picker (desktop only)
9. **Meeting Analytics** — pushed below the fold (entities, decisions, topics, participation)
10. **Share Panel** — integrated in insights panel and bottom panel
11. **Download History** — header badge with recent downloads dropdown, toast notifications
10. **Share Panel** — integrated in insights panel and bottom panel
11. **Download History** — header badge with recent downloads dropdown, toast notifications

## Onboarding & First-Visit Experience

- **Onboarding Wizard**: 3-step first-visit overlay introducing key features
- **First-clip tooltip**: When AI loads clips into timeline, first clip shows tip: "Click to edit, drag edges to trim, drag to reorder, click Customize Settings for effects"
- Tracked via localStorage (`ch_onboarding_done`) — only shows once
- Steps: (1) Paste a YouTube URL, (2) AI generates highlights, (3) Build and export reels

## Video Processing Pipeline

### Download
- yt-dlp with format `bv*[height<=H]+ba/b` + `-S res:H,ext:mp4` for proper DASH stream support (1080p+ are separate video+audio on YouTube)
- `--merge-output-format mp4` merges DASH streams into MP4
- Cached in `backend/cache/{videoId}_{resolution}.mp4` (resolution-specific to avoid cache collisions)
- Async download with progress tracking via JOBS system (polls every 1.5s, shows percentage)
- Non-MP4 outputs remuxed via `ffmpeg -c copy -movflags +faststart`
- Optional Webshare residential proxy for YouTube blocks
- **Resolution choices**: User can select download quality (best/2160p/1440p/1080p/720p/480p/360p)

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
- ~~Render pipeline double-encoding~~ **FIXED**: Concat now uses `-c copy` (stream copy) when no intro/outro slides — skips the expensive second re-encode pass
- ~~Slow encoding preset~~ **FIXED**: Changed from `-preset fast` to `-preset veryfast` for all clip extraction
- **Sequential clip processing**: All clips processed one at a time — parallelizing extraction (2-4 threads) would save 30-50%
- **Per-clip segment downloads**: Each clip triggers a separate yt-dlp download — merging adjacent segments would reduce network overhead
- Hardware acceleration (detected but not used — libx264 for reliability)
- Shrink PyInstaller bundle by excluding unused ML deps (torch/scipy/sklearn)
- Exponential backoff for job polling (currently fixed 1.5s interval)

## Civic Meeting Finder

- **YouTube Search**: Multi-query strategy searches 5 civic-focused queries in parallel via YouTube Data API
- **yt-dlp Fallback**: When no YouTube API key is configured, falls back to yt-dlp search (no API key required)
- **Civic Scoring**: Results scored by civic keyword density + channel/title matching for the queried municipality
- **Tiered Sorting**: High civic relevance (3+ keywords) → medium (1-2) → low (0), then by date within tiers

## API Endpoints (69 total, Key Categories)

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

### YouTube Search & Status
- `GET /api/youtube-search` — Civic meeting search (YouTube API with yt-dlp fallback)
- `GET /api/youtube-status` — Check if YouTube API key is configured
- `GET /api/youtube-playlist` — Get videos from a YouTube playlist

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
- Settings drawer state: `showSettingsDrawer` — slides from right, closes on Escape
- Two-column analysis grid: layout adapts based on search state (results left + word cloud right, or word cloud left + insights right)
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
gh workflow run build-windows.yml -f version=v7.2.0
```

### Build Scripts
- `build_mac_app_signed.sh` — Signed + notarized macOS build (`.app` + `.dmg`), v7.2.0
- `build_windows.bat` — Windows build (`.exe` in portable ZIP)
- `CommunityHighlighter.spec` — PyInstaller spec for macOS
- `CommunityHighlighter-Windows.spec` — PyInstaller spec for Windows
- `entitlements.plist` — macOS entitlements for code signing
- `.github/workflows/build-windows.yml` — GitHub Actions workflow for Windows builds

### PyInstaller Bundling Notes
- Both specs **exclude** `backend/venv/`, `.venv/`, `dist/`, `build/`, `cache/` to avoid bundling virtualenvs and old build artifacts
- macOS build script removes nested `__dot__app` bundles before signing
- All nested binaries (`.dylib`, `.so`) are signed with `--timestamp --options runtime` for notarization
- Signing uses `sort -u` deduplication and `-not -type l` symlink exclusion to prevent "No such file" errors
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
| `YOUTUBE_API_KEY` | No | Improves transcript fetching and civic meeting search (optional — falls back to yt-dlp without it) |
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
- macOS code signing: `find` for `.so`/`.dylib` must use `sort -u` and `[ -f "$f" ]` guards to avoid duplicate/symlink errors
- `backend/app.py` is a ~304KB monolith — changes require care
- `src/App.jsx` is ~9400 lines — also monolithic, 25+ inline components
- PyInstaller bundles torch/scipy/sklearn (huge) — could exclude unused ML deps to shrink app further
- yt-dlp download timeout (10 min) can fail on long videos
- YouTube API key is optional — transcript fetching and civic meeting search fall back to yt-dlp without it
- Windows builds use `msvcrt` for instance locking (macOS uses `fcntl`)

## Version

Current: 7.2.0
Bundle ID: `com.communityhighlighter.app`
Developer: Stephen Walter (6M536MV7GT)
