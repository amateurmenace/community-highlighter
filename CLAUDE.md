# Community Highlighter

AI-powered desktop + web app for analyzing civic meeting recordings. Extracts transcripts from YouTube videos, generates AI summaries, entity extraction, highlight reels, and video clip downloads. Features a video-editor-first UI with a professional timeline, clip basket, and one-click highlight reel generation. Installable as a PWA with mobile-optimized UI.

## Architecture

- **Frontend**: React 19 + Vite + vite-plugin-pwa, built to `dist/`. Monolithic `src/App.jsx` (~11800 lines) with 35+ inline sub-components (includes ReelPlayer, AboutPage, TranscriptUploadPrompt, GuidedTour, SectionPreviews)
- **Backend**: FastAPI (`backend/app.py`, ~340KB monolith), served by Uvicorn on port 8000. 85+ API endpoints (includes SSE streaming, WebSocket job status)
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
3. AI auto-generates a 4-5 sentence executive brief with **clickable timestamps** (fast, cached). Terminal-style loading animation shows progress. "Generate Full Report" button **streams text in real-time** via SSE
3b. "Generate AI Highlights with Quotes" produces 10 highlights AND auto-loads top 5 into the editor timeline
3c. Clicking any timestamp pill: scrolls to Highlight section, opens Full Transcript, seeks search player, highlights active transcript cue with auto-tracking as video plays
4. **Hero "Make AI Highlight Reel" button** — prominent green CTA directly below video, one-click with sensible defaults
5. User selects reel style from collapsible "Choose Reel Style" panel: Decisions, Comments, Controversial, Budget, Actions, Social (with descriptions)
6. **Top 5 of 10 AI highlights auto-load into dark timeline editor** — user can add remaining 5 from the Highlights panel (shows "✓ In timeline" / "+ Add" per highlight)
7. User can also: search transcript (rich result cards with Watch/+Timeline/Context/Investigate), view analytics, build clips manually
8. Export via labeled "Export N Clips as Video" button + "Download Full Video" button (muted, inline in secondary toolbar row next to Import) → backend renders via ffmpeg → MP4/ZIP download
9. **Celebration modal** with confetti animation on render completion, download history tracking
10. **Share Reel Link** triggers background summary precomputation (`/api/share/precompute`) so viewers get instant cached results

## UI Layout (Video Editor — Dark Workspace Design)

Both desktop and cloud users get the same full video editor. Cloud users can build and preview reels, then share via link or export as `.chreel` file for desktop rendering. The interface uses a unified dark editing workspace inspired by professional NLEs (Premiere Pro / DaVinci Resolve):

0. **Section Navigation Bar** — appears after video loads, 3 pill-style buttons with icons that smooth-scroll to each section:
   - **Highlight** (search icon) — "Search & discover key moments"
   - **Edit** (play icon) — "Build & export highlight reels"
   - **Analyze** (bar chart icon) — "Entities, topics & trends"
   - Each section divider has a description subtitle below the title
   - **Model selector** visible on landing page before video loads (GPT-4o, GPT-4o Mini, Gemini 2.5 Flash, GPT-5.1)
   - **Logo click** reloads the homepage
1. **Search & Discover Zone** — appears ABOVE the editor, white card with neo-brutalist borders:
   - **Search Bar** — full-width, green-highlighted input (green border, light green gradient bg), "Investigate" text button (no emoji), Translate, Download, Full Transcript toggle, language selector (8 languages). Search results show instruction: "Click + Timeline to add a clip. Or click See in Transcript then highlight text to create custom clips."
   - **Search Sparkline** — timeline distribution bar (50 bins) when searching
   - **Two-column grid**:
     - **Left**: Word Cloud Hero (420px min-height, dark blueprint bg, 80 words logarithmic sizing, top 3 glow) OR Full Transcript overlay OR Search Result Cards (when searching). "View Full Transcript" button overlays word cloud with scrollable transcript (text selection creates clips)
     - **Right**: Small preview video (240px YouTube embed, `searchPlayerRef`) + "View in Transcript" button (opens Full Transcript, syncs to current player timestamp, auto-highlights cues as video plays) + Jargon Translator + compact Highlights list
   - Search result "▶ Watch" seeks the small preview player; timeline clips seek the big editor player
2. **Dark Editing Workspace** (`#0f1419` background) — video + toolbar + timeline as one connected unit:
   - **Video Player** — full-width, 520px height, embedded YouTube iframe (`playerRef`)
   - **Hero AI Reel Button** — full-width green gradient CTA "Make AI Highlight Reel" (loads top 5 of 10 highlights)
   - **Collapsible Reel Styles** — "🎬 Choose Reel Style" toggle reveals 6 cards with descriptions
   - **Compact Toolbar** — two-row layout adapts to environment:
     - **Row 1 (primary)**: clip count + zoom | Export/Share button | Settings
     - **Row 2 (secondary, when clips exist)**: Shuffle | Regenerate | Clear | Titles ON/OFF | Download Full Video + resolution picker | Import .chreel (desktop)
     - **Cloud**: Share Reel Link (blue), Render in Desktop App (green, downloads `.chreel`)
   - **Timeline Editor** — dark-themed NLE track with drag-to-reorder, trim handles, loading animation, tooltips, per-clip thumbnails (backend 360p segment extraction with YouTube fallback). Track min-height 200px, clip height 150px for comfortable viewing without scroll
   - **Highlights Panel** — always-visible panel under timeline showing all 10 AI highlights with "✓ In timeline" / "+ Add" status
   - **Clip Inspector** — dark-themed panel when clip selected
   - **Job Status** — progress bar during render
3. **Bottom Panel** — AI Summary, Key Highlights
4. **Meeting Analyzer Section** — separated by "📊 Meeting Analyzer" section divider:
   - ALL data visualizations always visible: Entities, Participation, Topics, Timeline, Disagreements, Dynamics, Cross-References, Subscriptions, Issue Tracker
   - Three named section dividers separate the page: "Meeting Highlighter", "Highlight Video Editor", "Meeting Analyzer" (no emojis)
   - Section titles are large (38px), bold (900 weight), left-aligned with line above
5. **Settings Drawer** — slides from right edge (400px), triggered by "⚙️ Customize Settings":
   - Quality: Resolution, Speed, Audio Normalize
   - Effects: Captions, Color Filter, Transitions, Background Music
   - Branding: Intro/Outro Title/Subtitle/CTA, Chapter Titles, Watermark, Speaker Labels
   - Full Video Download with resolution picker (desktop only)
9. **Meeting Analytics** — pushed below the fold (entities, decisions, topics, participation)
10. **Share Reel Link** — available on both desktop and cloud, copies URL with `mode=play` for cinematic Reel Player
11. **About Page** — full Philosophy + Technology page, accessible via `?page=about` permanent link, About button in header and footer

## Onboarding & First-Visit Experience

- **Guided Tour** (replaced OnboardingWizard + HowToGuide): SVG spotlight overlay with floating tooltip bubbles. 4 steps:
  1. Welcome — "Paste any YouTube meeting URL above to get started"
  2. Search & Highlight — targets `#preview-highlight` card
  3. Edit & Export Reels — targets `#preview-edit` card
  4. Deep Analysis — targets `#preview-analyze` card
  - Keyboard nav: Arrow keys, Enter to advance, Escape to close
  - Spotlight cutout animates between targets with `cubic-bezier` transitions
  - Recalculates position on scroll/resize
- **Section Preview Cards** (`SectionPreviews` component): 3-column grid on landing page (above URL input) showing skeleton mockups:
  - Search & Highlight: dark word cloud skeleton with shimmer blocks + search bar
  - Edit & Export: dark timeline editor with colored clip blocks
  - Analyze & Discover: bar chart skeletons with stats row
  - Responsive: `auto-fit, minmax(160px, 1fr)` — stacks on mobile
- **First-clip tooltip**: When AI loads clips into timeline, first clip shows tip: "Click to edit, drag edges to trim, drag to reorder, click Customize Settings for effects"
- **.chreel Import Zone** (desktop only): Dark drag-and-drop zone on landing page, positioned BELOW the Civic Meeting Finder
- **Batch Processing** (landing page): Collapsible multi-URL textarea for queuing up to 20 videos
- Tracked via localStorage (`ch_onboarding_done`) — only shows once

## Landing Page Layout (Before Video Loaded)

1. **Section Preview Cards** — 3-column grid at top (Highlight, Edit, Analyze)
2. **URL Input Hero** — green highlighter effect (`.url-input-hero`): green border, green-tinted gradient background, `::before` highlighter stroke, 16px font, green placeholder
3. **Bridge Text** — "Don't have the link? Use our AI search tool to find the most recent civic meetings near you."
4. **Civic Meeting Finder** — integrated inline (no longer a separate section), with search, filters, channel import
5. **Tip Text** — styled card with border, visible text: "Tip: This app works best with YouTube videos that have captions..." + "Learn more about how Community Highlighter works" link to About page
6. **.chreel Import Zone** — dark drag-and-drop (desktop only)
7. **Batch Processing** — collapsible

## Reel Player Mode

When a shared reel link is opened with `?mode=play`, the app renders a cinematic `ReelPlayer` component instead of the full editor:
- Sequential clip playback via YouTube iframe src changes with CSS fade transitions (0.5s)
- Title overlays as CSS-animated lower thirds during each clip
- Segmented progress bar showing position across all clips (clickable segments)
- Play/pause, skip forward/back, clip counter ("2 / 5")
- End card with Replay, Open in Editor, Download Desktop App CTAs
- "Powered by Community Highlighter" branding
- Zero server cost — entirely client-side iframe orchestration

## Transcript Upload

- **Backend**: `POST /api/transcript/upload` accepts multipart form with `video_id` + file
- Supports `.vtt` (WebVTT), `.srt` (SubRip), `.txt` (plain text — auto-segmented into ~10s chunks)
- Stores in `STORED_TRANSCRIPTS[video_id]` and returns VTT format
- **Frontend**: When transcript fetch fails, shows `TranscriptUploadPrompt` card with file input
- On successful upload, continues with normal analysis flow (word frequency, AI summary, etc.)

## About Page

- Full-page overlay accessible via About button in header, footer link, or `?page=about` URL parameter
- **Philosophy section**: The Problem / Our Approach two-column layout, "Features and Why They Exist" (10 feature cards with "Barrier removed:" callouts)
- **Technology section**: YouTube downloading challenges + yt-dlp, Cloud vs Desktop design, Reel Player trick, AI pipeline (map-reduce, quote-to-timestamp), video rendering pipeline
- **Credits**: Brookline Interactive Group (Producer), NeighborhoodAI (Advisor), Stephen Walter (Designer + Developer)
- Licensed under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)

## Cloud/Desktop Dev Toggle

- `POST /api/dev/toggle-cloud` toggles `CLOUD_MODE` at runtime on the backend
- Frontend uses `localStorage('dev_cloud_override')` for instant switching without backend dependency
- Toggle button visible only on localhost, positioned left of language selector in header
- `useCloudMode()` hook checks localStorage override first, falls back to `/api/health`

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
- **Encoder**: Hardware-accelerated when available (VideoToolbox on macOS, NVENC on NVIDIA GPUs), falls back to `libx264 -preset veryfast -crf 20`
- **Parallel extraction**: Segment downloads use ThreadPoolExecutor(3), clip encoding uses ThreadPoolExecutor(2-3 based on CPU count)
- **Segment merging**: Adjacent clips within 30s are merged into single download groups, reducing yt-dlp invocations
- **Error recovery**: Failed clips are skipped and logged — partial renders succeed with remaining clips
- **Audio**: `aac -ar 44100 -b:a 192k` — explicit bitrate on all encodes
- **Audio normalization**: EBU R128 `loudnorm` (I=-16, TP=-1.5, LRA=11) enabled by default
- **Font**: Bundled DejaVu Sans Bold (`backend/fonts/`) for reliable cross-platform text overlays
- **Seeking**: Input seeking (`-ss` before `-i`) + output trim, 1s buffer for keyframe alignment
- **Text overlays**: `drawtext` filter, 6% of video height, green (#22C55E), DejaVu Sans Bold
- **Lower thirds**: Speaker name + highlight text bar at 82% height, brand green (#1e7f63) background, fade-in animation, enabled via `lowerThirds` video option
- **Captions**: SRT subtitles via `subtitles` filter with pill-style backgrounds (`BorderStyle=4`, semi-transparent black). Default OFF — user must enable via toggle. Frontend sends `captions` flag in export request.
- **Color filters**: 8 presets (vintage, warm, cool, high_contrast, bw, sepia, vibrant, cinematic)
- **Transitions**: `fade` in/out, `xfade` between clips, 0.5s duration
- **Speed**: `setpts` + `atempo` for 0.5x-2.0x
- **Social format**: Scale to 1080x1920 (9:16), blur-fill background (not black bars)
- **Concatenation**: ffmpeg concat demuxer, always re-encodes
- **Intro/outro slides**: Animated title cards with brand-colored (#1e7f63) background, wired into render pipeline
- **Music ducking**: `sidechaincompress` filter auto-lowers background music during speech
- **Progress tracking**: `run_ffmpeg_with_progress()` provides real-time per-clip percentage updates via `-progress pipe:1`

### AI Summary Pipeline (Two-Tier + Streaming)
- **Executive Brief** (auto-loads): 4-5 sentence summary with clickable timestamps, uses user's selected model, 1000 max tokens, cached by `(video_id, strategy_ts, model)` via `ai_cache.py`
  - **Timestamp-aware**: Sends transcript segments with `[MM:SS]` prefixes, AI returns JSON `{sentences: [{text, timestamp_seconds}]}`. Frontend renders clickable green `[MM:SS]` timestamp pills that seek the YouTube player
  - **Truncation repair**: Backend fixes Gemini's truncated JSON (closes open brackets, extracts last complete sentence). Frontend fallback also parses partial JSON via regex
  - **Backward-compatible**: Handles both old plain-text cache and new structured JSON format
- **Full Report** (on-demand, **streaming**): News-article style with headline, inverted pyramid, bold subheadings, direct quotes. 2000 max tokens. Text streams progressively via SSE with shimmer cursor. Collapsible with Share (copies URL) and Export (downloads .md) buttons
- **SSE Streaming** (`POST /api/summary_ai/stream`): `StreamingResponse` for report and highlights strategies. Backend functions: `call_openai_api_stream()` (parses OpenAI SSE delta chunks), `call_gemini_api_stream()` (uses `:streamGenerateContent?alt=sse`), `call_ai_api_stream()` (smart router). Frontend: `streamSummaryAI()` in api.js uses `fetch()` + `getReader()` (POST body needed, can't use EventSource). Cached results stream in one chunk.
- **Highlights**: 10 AI-generated highlights with quotes, collapsible display, auto-loads top 5 into editor timeline
- **Model selector**: Dropdown visible on landing page (before video loads) AND in settings. Default: **Gemini 2.5 Flash (Recommended)**. Options: Gemini 2.5 Flash (Recommended), GPT-4o, GPT-4o Mini (Faster), GPT-5.1 (Deep Analysis). Users can change model at any time.
- **Gemini provider**: `call_gemini_api()` in `backend/app.py` — REST API (no SDK dependency), uses `systemInstruction` field. 1M token context means NO chunking needed. `maxOutputTokens` auto-scaled 4x for Gemini (different tokenization). Falls back to OpenAI if no `GOOGLE_API_KEY`
- **Smart routing**: `call_ai_api()` wrapper auto-routes Gemini models to `call_gemini_api()`, everything else to `call_openai_api()`. Used by entity extraction, translation, full summary, and all analytics endpoints that accept user model selection
- **Response caching**: All summary results cached to disk via `ai_cache.py` — `get_cached_result()` / `save_to_cache()` keyed by `(video_id, strategy, model)`. Instant response on repeat views
- **Share precompute**: `POST /api/share/precompute` — spawns background thread to generate executive brief when user creates a share link. Fire-and-forget from frontend via `apiSharePrecompute()`
- **Brooklyn→Brookline fix**: `fix_brooklyn()` applied to all AI summary/highlight output at the endpoint level
- **Loading terminal** (`SummaryLoadingTerminal`): macOS-style dark terminal window with typewriter animation (35ms/char). Shows immediately when user clicks Load Video. 10 lines from "Fetching transcript from YouTube..." through "Finalizing...", ~26s total. Green prompt icons, blinking cursor on active line. Appears in the summary card area.
- **Loading feedback**: Rotating progress messages in the green progress bar every 3s with progressive percent updates (60%→90%)
- **Timestamp click** (`jumpToTimestamp`): Clicking any timestamp pill scrolls to Highlight section, opens Full Transcript, seeks `searchPlayerRef` to that time, finds closest transcript cue and highlights it with green left-border accent. Auto-tracks playback (updates highlighted cue every 1s for 2 minutes).
- **Report timestamps** (`renderLineWithTimestamps`): Parses `(MM:SS)` and `(H:MM:SS)` patterns in report text, replaces with clickable green timestamp pills. Works in both final and streaming report display.
- **Encoding fix**: `fix_brooklyn()` now also repairs UTF-8 mojibake (`â€"` → `—`, `â€™` → `'`, etc.)

### Map-Reduce Pipeline (for OpenAI long transcripts)
- Long transcripts (>40K chars) split into 2-4 chunks
- **Parallel chunk processing**: `ThreadPoolExecutor(max_workers=3)` — all chunks fire simultaneously (was sequential)
- Inter-chunk delay: 0.5s for chunk 3+ only (was 3s per chunk)
- Each chunk: key point extraction via GPT with JSON response format (decisions, discussions, action items, quotes)
- Results synthesized into unified summary or highlights
- If all chunks fail: returns error state (no fallback dummy text)
- **Gemini skips chunking entirely** — sends full transcript in one call (up to 500K chars)

### Frontend Performance
- **Parallel API calls**: `loadAll` fires metadata + wordfreq + executive summary + entity extraction simultaneously via `Promise.allSettled`
- Word frequency: 150+ stopwords including civic meeting title words (council, board, committee, etc.)

### Quote-to-Timestamp Matching
- `find_quote_timestamp()`: Matches first 8 words of AI-generated quote against transcript segments
- Configurable padding (default 4s before/after)
- If >5 highlights: selects 5 evenly-spaced clips
- Fallback: clips at regular intervals if no timestamps matched

### Remaining Opportunities
- ~~Render pipeline double-encoding~~ **FIXED**: Concat now uses `-c copy` (stream copy) when no intro/outro slides
- ~~Slow encoding preset~~ **FIXED**: Changed from `-preset fast` to `-preset veryfast` for all clip extraction
- ~~Sequential clip processing~~ **FIXED**: Clip downloads (3 workers) and encoding (2-3 workers) now run in parallel via ThreadPoolExecutor
- ~~Per-clip segment downloads~~ **FIXED**: Adjacent clips within 30s merged into single download groups
- ~~Hardware acceleration unused~~ **FIXED**: Auto-detects VideoToolbox (macOS) / NVENC (NVIDIA), falls back to libx264
- ~~Large PyInstaller bundle~~ **FIXED**: Excludes torch/scipy/sklearn/matplotlib/tkinter/jupyter (~500MB savings)
- ~~Fixed polling interval~~ **FIXED**: WebSocket-first (`/ws/job/{job_id}`) with HTTP polling fallback. Adaptive backoff (1s → 5s) with reset on progress changes
- ~~No streaming for AI responses~~ **FIXED**: SSE streaming endpoint (`/api/summary_ai/stream`) for Full Report and Highlights. Progressive text display with shimmer cursor
- ~~Summary lacks timestamps~~ **FIXED**: Executive brief returns structured `{sentences: [{text, timestamp_seconds}]}`. Clickable green timestamp pills seek YouTube player
- ~~Gemini JSON truncation~~ **FIXED**: Truncation repair (closes open brackets), regex text extraction fallback, increased max_tokens to 1000
- ~~openai_client undefined in find_relevant_documents~~ **FIXED**: Replaced with `call_ai_api()` wrapper

## Civic Meeting Finder

- **Integrated into landing page**: No longer a separate section — merged inline below the URL input with bridge text "Don't have the link? Use our AI search tool..."
- **Clear button**: Red "Clear" button appears when filters are active or results exist — resets search, results, and all filters to defaults
- **No emoji in heading**: "Find Civic Meetings" (castle emoji removed from all instances)
- **YouTube Search**: Multi-query strategy searches 5 civic-focused queries in parallel via YouTube Data API
- **yt-dlp Fallback**: Automatic fallback when no YouTube API key is configured OR when quota is exceeded (403 `quotaExceeded`). Backend detects `"QUOTA_EXCEEDED"` sentinel from failed queries and switches to `_ytdlp_search()` transparently
- **Fallback user notice**: Yellow warning banner shown in results area: "Using direct YouTube search (API quota exceeded). Results may be less comprehensive." Response includes `fallback: true` and `fallback_reason` fields
- **Civic Scoring**: Results scored by civic keyword density + channel/title matching for the queried municipality
- **Tiered Sorting**: High civic relevance (3+ keywords) → medium (1-2) → low (0), then by date within tiers
- **Quota management**: YouTube Data API v3 daily quota is 10,000 units. Each civic search costs ~500 units (5 queries x 100 units). ~20 searches/day exhausts quota. Resets at midnight Pacific

## API Endpoints (78 total, Key Categories)

### Video/Clips
- `POST /api/download_mp4` — Download full YouTube video
- `POST /api/render_clips` — Render clips from selections (rate limited)
- `POST /api/render_multi_video_clips` — Multi-video export
- `POST /api/highlight_reel` — AI-generated highlight reel (rate limited)
- `POST /api/import_chreel` — Import .chreel file, returns parsed reel data
- `GET /api/video_formats/{video_id}` — List available resolutions
- `POST /api/clip_thumbnails` — Generate timeline preview thumbnails
- `GET /api/job_status` — Poll render job progress (HTTP fallback)
- `WS /ws/job/{job_id}` — **WebSocket** real-time job status push (500ms intervals)
- `GET /api/video_capabilities` — Available editing features
- `POST /api/cache/cleanup` — Manual cache cleanup

### Batch Processing
- `POST /api/batch/queue` — Queue multiple YouTube URLs for transcript fetching (max 20)
- `GET /api/batch/{batch_id}` — Check batch processing status

### YouTube Search & Status
- `GET /api/youtube-search` — Civic meeting search with `days`, `meetingType` filters and channel detection (YouTube API with yt-dlp fallback)
- `GET /api/youtube-channel-videos` — Get latest videos from a YouTube channel by @handle or URL
- `GET /api/youtube-status` — Check if YouTube API key is configured
- `GET /api/youtube-playlist` — Get videos from a YouTube playlist

### AI Analysis
- `POST /api/summary_ai` — Map-reduce summary (concise/detailed/executive/highlights_with_quotes/report)
- `POST /api/summary_ai/stream` — **SSE streaming** for report and highlights (StreamingResponse, text/event-stream)
- `POST /api/share/precompute` — Precompute and cache summary for shared video links (background thread)
- `POST /api/analytics/extended` — Entity extraction (with truncated JSON repair for Gemini)
- `POST /api/analytics/policy_impact`, `action_items`, `budget_impact`, `meeting_efficiency`
- `POST /api/assistant/chat` — RAG-based meeting Q&A
- `POST /api/find-relevant-documents` — AI-powered document search (uses `call_ai_api` not direct OpenAI client)

### Transcript
- `POST /api/transcript` — Fetch with 3-layer fallback
- `POST /api/transcript/upload` — Upload .vtt/.srt/.txt transcript file for videos without captions
- `POST /api/translate` — Translate transcript (AI-powered, may truncate long transcripts — frontend offers Google Translate fallback for transcripts >30K chars)
- `POST /api/wordfreq` — Word frequency analysis (with extensive civic stopword filtering)

### System/Dev
- `GET /api/ytdlp/status` — Check current yt-dlp version
- `POST /api/ytdlp/update` — Update yt-dlp to latest nightly (desktop only)
- `POST /api/dev/toggle-cloud` — Toggle CLOUD_MODE at runtime (dev only)

### Knowledge Base
- `POST /api/knowledge/add_meeting`, `search`, `find_related` — ChromaDB-backed cross-meeting search

### Issues & Subscriptions
- `POST /api/issues/create`, `list`, `add_meeting`, `auto_track`, `{id}/timeline`
- `POST /api/subscriptions/create`, `list`, `delete`, `check_matches`

## Frontend State Management

- All React hooks (useState/useRef), no Redux/Context
- ~35+ top-level state variables in App.jsx
- 25+ inline sub-components (CelebrationModal, GuidedTour, SectionPreviews, SharePanel, TemplatePresets, ExportModal, FeedbackModal, ProgressIndicator, etc.)
- YouTube embedded via iframe (no programmatic play/pause control)
- Job status: **WebSocket-first** (`/ws/job/{job_id}`) with HTTP polling fallback. `connectJobWebSocket()` in api.js, `pollJobStatus()` tries WS then falls back to adaptive setTimeout
- Timeline editor state: `clipBasket` array with per-clip start/end/title/thumbnail
- Settings drawer state: `showSettingsDrawer` — slides from right, closes on Escape
- Two-column analysis grid: layout adapts based on search state (results left + word cloud right, or word cloud left + insights right)
- Download history: persisted in localStorage (`ch_downloads`), max 20 entries
- Onboarding: first-visit guided tour tracked via localStorage (`ch_onboarding_done`)
- Toast notifications: auto-dismiss after 4s, fixed bottom-right
- Job polling: adaptive backoff (1s → 5s), resets on progress changes, uses `setTimeout` chain instead of `setInterval`
- Keyboard shortcuts: Ctrl+Z/Y (undo/redo), Delete/Backspace, Arrow keys (nudge), S (split), Space (preview), I/O (in/out), J/K/L (seek/pause playback)
- .chreel import: drag-and-drop on page + "Import .chreel" button (desktop mode)
- Batch processing: collapsible multi-URL textarea on landing page, polls `/api/batch/{id}` for status

## PWA Support

- **Plugin**: `vite-plugin-pwa` with `generateSW` mode and `autoUpdate` registration
- **Manifest**: `Community Highlighter`, theme color `#1E7F63`, standalone display
- **Service Worker**: Workbox precaches static assets, network-first for `/api/*`, network-only for YouTube
- **Transcript caching**: Workbox caches `/api/transcript` responses for 7 days; IndexedDB (`transcriptCache.js`) stores parsed cue arrays for fully offline transcript browsing
- **iOS**: Apple touch icon, mobile-web-app-capable meta tags
- **Install**: Browser-native install prompt (Chrome/Edge/Safari)

## Rate Limiting (Cloud Mode)

- **AI endpoints** (summary_ai, highlight_reel, assistant/chat): 10 req/min per IP
- **Render endpoints** (render_clips): 5 req/min per IP
- **General endpoints**: 60 req/min per IP
- Sliding-window implementation in `RateLimiter` class, only active when `CLOUD_MODE=true`
- Returns `{"error": "Rate limit exceeded...", "retry_after": 60}` on limit

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
| `GOOGLE_API_KEY` | No | Google Gemini API key — enables Gemini 2.5 Flash model option (1M context, no chunking) |
| `YOUTUBE_API_KEY` | No | Improves transcript fetching and civic meeting search (optional — falls back to yt-dlp without it) |
| `YOUTUBE_API_KEY_SECONDARY` | No | Backup YouTube API key — auto-failover when primary quota is exceeded |
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
- `backend/app.py` is a ~330KB monolith — changes require care
- `src/App.jsx` is ~11500 lines — also monolithic, 35+ inline components
- PyInstaller bundles torch/scipy/sklearn (huge) — could exclude unused ML deps to shrink app further
- yt-dlp download timeout (10 min) can fail on long videos
- YouTube API key is optional — transcript fetching and civic meeting search fall back to yt-dlp without it
- Windows builds use `msvcrt` for instance locking (macOS uses `fcntl`)
- Optimization stats endpoint polled once on mount (was every 30s — caused noisy terminal logs)
- AI translation truncates long transcripts — frontend now offers Google Translate fallback for transcripts >30K chars

## Version

Current: 8.0.1 (default AI: Gemini 2.5 Flash)
Bundle ID: `com.communityhighlighter.app`
Developer: Stephen Walter (6M536MV7GT)
