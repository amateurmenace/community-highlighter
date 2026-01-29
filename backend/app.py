import os, json, uuid, tempfile, shutil, subprocess, threading, re, html, asyncio
from collections import Counter, defaultdict
from datetime import datetime
from urllib.parse import quote, unquote
import nltk
from nltk.corpus import stopwords
from textblob import TextBlob
from typing import List, Dict, Any, Optional
from fastapi import (
    FastAPI,
    Request,
    Response,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from youtube_transcript_api import YouTubeTranscriptApi
try:
    from youtube_transcript_api.proxies import WebshareProxyConfig
    WEBSHARE_IMPORT_OK = True
except ImportError:
    WEBSHARE_IMPORT_OK = False
    print("[!] youtube-transcript-api proxy support not available - update the package")
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import yt_dlp
import zipfile
import httpx
import time

# NEW IMPORTS FOR ENHANCED FEATURES (v4.0)
import numpy as np

# ChromaDB and embeddings - optional for cloud deployment
try:
    import chromadb
    from chromadb.utils import embedding_functions
    from sentence_transformers import SentenceTransformer
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False
    print("[!] ChromaDB/SentenceTransformers not available - Knowledge Base disabled")

# Live Chat Support - disabled in v5.2
LIVE_CHAT_AVAILABLE = False


def fix_brooklyn(text):
    """Replace Brooklyn with Brookline AND fix Martin Luther -> Martin Luther King"""
    if not text:
        return text
    import re
    text = re.sub(r'\bBrooklyn\b', 'Brookline', text)
    text = re.sub(r'\bBROOKLYN\b', 'BROOKLINE', text)
    text = re.sub(r'\bbrooklyn\b', 'brookline', text)
    # v6.0: Fix Martin Luther truncation - always use full name
    text = re.sub(r'\bMartin Luther\b(?! King)', 'Martin Luther King', text, flags=re.IGNORECASE)
    return text


# AI Optimization Support (optional)
try:
    from ai_cache import cached_ai_analysis, get_cache_stats, clear_cache
    from smart_sampling import smart_sample_transcript, should_use_sampling
    from hybrid_rules import extract_all_structured_data
    from optimized_prompts import (
        get_entity_extraction_prompt,
        get_summary_prompt,
        get_decision_extraction_prompt,
    )

    OPTIMIZATIONS_AVAILABLE = False  # Disabled for now
except ImportError:
    OPTIMIZATIONS_AVAILABLE = False
    print("  AI optimizations not installed (app runs in standard mode)")

try:
    from dotenv import load_dotenv

    load_dotenv()
except:
    pass

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

# Webshare Residential Proxy Configuration
# Sign up at https://www.webshare.io/ and get rotating residential proxy credentials
WEBSHARE_PROXY_USERNAME = os.getenv("WEBSHARE_PROXY_USERNAME", "")
WEBSHARE_PROXY_PASSWORD = os.getenv("WEBSHARE_PROXY_PASSWORD", "")
# Optional: custom proxy host:port (check your Webshare dashboard for the correct endpoint)
WEBSHARE_PROXY_HOST = os.getenv("WEBSHARE_PROXY_HOST", "p.webshare.io:80")

# Build proxy URL with proper URL encoding for special characters
WEBSHARE_PROXY_URL = None
if WEBSHARE_PROXY_USERNAME and WEBSHARE_PROXY_PASSWORD:
    from urllib.parse import quote
    # URL-encode credentials in case they have special characters like @, #, etc.
    # Add -1 suffix for rotating residential proxies (Webshare session format)
    username_with_session = WEBSHARE_PROXY_USERNAME
    if not WEBSHARE_PROXY_USERNAME.endswith(('-1', '-rotate', '-country-us')):
        username_with_session = f"{WEBSHARE_PROXY_USERNAME}-1"
    
    encoded_user = quote(username_with_session, safe='')
    encoded_pass = quote(WEBSHARE_PROXY_PASSWORD, safe='')
    
    proxy_host = WEBSHARE_PROXY_HOST
    
    WEBSHARE_PROXY_URL = f"http://{encoded_user}:{encoded_pass}@{proxy_host}/"
    print(f"[OK] Proxy URL built: {username_with_session}@{proxy_host}")

# Initialize YouTube Transcript API - with proxy if available
if WEBSHARE_IMPORT_OK and WEBSHARE_PROXY_USERNAME and WEBSHARE_PROXY_PASSWORD:
    print("[OK] Webshare residential proxy configured for YouTube access")
    ytt_api = YouTubeTranscriptApi(
        proxy_config=WebshareProxyConfig(
            proxy_username=WEBSHARE_PROXY_USERNAME,
            proxy_password=WEBSHARE_PROXY_PASSWORD,
        )
    )
    PROXY_ENABLED = True
else:
    if not WEBSHARE_PROXY_USERNAME:
        print("[!] No WEBSHARE_PROXY_USERNAME set - YouTube may block cloud server requests")
    ytt_api = YouTubeTranscriptApi()
    PROXY_ENABLED = False

# Cloud deployment mode - disables video download features (yt-dlp blocked by YouTube)
# Set CLOUD_MODE=true in Render to enable this
CLOUD_MODE = os.getenv("CLOUD_MODE", "false").lower() == "true"
if CLOUD_MODE:
    print("[!] CLOUD_MODE enabled - video download/clip features disabled")
    print("    (Transcripts, AI analysis, and all analytics still work!)")


# Define BASE_DIR early for static files
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files from React build (for production)
# Check multiple possible locations for dist folder
def find_dist_dir():
    """Find the dist directory in various possible locations"""
    # Get the directory containing this script
    script_dir = BASE_DIR
    
    candidates = [
        os.path.join(script_dir, "dist"),                    # Same dir as app.py (backend/dist)
        os.path.join(os.path.dirname(script_dir), "dist"),   # Parent dir (community-highlighter-V21/dist)
        os.path.abspath("dist"),                              # Current working dir
        os.path.join(script_dir, "..", "dist"),              # Relative parent
    ]
    
    print(f"[DEBUG] Script directory: {script_dir}")
    print(f"[DEBUG] Searching for dist folder in:")
    
    for candidate in candidates:
        abs_candidate = os.path.abspath(candidate)
        exists = os.path.exists(abs_candidate)
        has_assets = os.path.exists(os.path.join(abs_candidate, "assets")) if exists else False
        print(f"  - {abs_candidate} (exists={exists}, has_assets={has_assets})")
        
        if exists and has_assets:
            # List the assets to verify
            assets_dir = os.path.join(abs_candidate, "assets")
            try:
                files = os.listdir(assets_dir)
                print(f"    Found {len(files)} files in assets/")
                for f in files[:5]:  # Show first 5
                    print(f"      - {f}")
                if len(files) > 5:
                    print(f"      ... and {len(files) - 5} more")
            except Exception as e:
                print(f"    Error listing assets: {e}")
            return abs_candidate
    
    return None

DIST_DIR = find_dist_dir()

if DIST_DIR:
    print(f"[OK] Using dist folder: {DIST_DIR}")
    DIST_ASSETS_DIR = os.path.join(DIST_DIR, "assets")
    
    # Mount assets FIRST
    try:
        # List what files exist in assets
        print(f"[DEBUG] Assets directory: {DIST_ASSETS_DIR}")
        if os.path.exists(DIST_ASSETS_DIR):
            asset_files = os.listdir(DIST_ASSETS_DIR)
            print(f"[DEBUG] Found {len(asset_files)} asset files:")
            for f in sorted(asset_files)[:10]:
                fpath = os.path.join(DIST_ASSETS_DIR, f)
                fsize = os.path.getsize(fpath) if os.path.isfile(fpath) else 0
                print(f"        - {f} ({fsize:,} bytes)")
            if len(asset_files) > 10:
                print(f"        ... and {len(asset_files) - 10} more files")
        else:
            print(f"[ERROR] Assets directory does not exist!")
        
        app.mount("/assets", StaticFiles(directory=DIST_ASSETS_DIR), name="assets")
        print(f"[OK] Mounted /assets -> {DIST_ASSETS_DIR}")
    except Exception as e:
        print(f"[ERROR] Failed to mount assets: {e}")
        import traceback
        traceback.print_exc()
    
    # Also mount the whole dist folder for other static files (favicon, etc.)
    try:
        app.mount("/static", StaticFiles(directory=DIST_DIR), name="static")
        print(f"[OK] Mounted /static -> {DIST_DIR}")
    except Exception as e:
        print(f"[ERROR] Failed to mount static: {e}")
    
    print("[OK] React catch-all routes will be registered at end of file")
else:
    print("[!] No dist folder found - frontend not available")
    print("[!] Make sure to run 'npm run build' from the project root")
    print(f"[!] BASE_DIR is: {BASE_DIR}")

FILES_DIR = os.path.join(BASE_DIR, "cache")
os.makedirs(FILES_DIR, exist_ok=True)

# NEW: Knowledge Base Directory (v4.0)
KB_DIR = os.path.join(BASE_DIR, "knowledge_base")
os.makedirs(KB_DIR, exist_ok=True)

JOBS = {}
STORED_TRANSCRIPTS = {}
CONVERSATION_HISTORY = {}  # v5.0: Conversation memory
MEETING_CACHE = {}  # v5.0: Meeting summaries cache  # Cache for transcripts


# ============================================================================
# Ãƒâ€šÃ‚  NEW: VECTOR DATABASE SETUP (ChromaDB for Knowledge Base)
# ============================================================================

# Initialize ChromaDB only if available
chroma_db_path = os.path.join(KB_DIR, "chroma_db")
chroma_client = None
meetings_collection = None
embedding_model = None

if CHROMADB_AVAILABLE:
    try:
        chroma_client = chromadb.PersistentClient(path=chroma_db_path)
        chroma_client.list_collections()
        embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        
        try:
            meetings_collection = chroma_client.get_collection(
                name="community_meetings",
                embedding_function=embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name="all-MiniLM-L6-v2"
                ),
            )
            print("[OK] ChromaDB collection loaded")
        except:
            meetings_collection = chroma_client.create_collection(
                name="community_meetings",
                embedding_function=embedding_functions.SentenceTransformerEmbeddingFunction(
                    model_name="all-MiniLM-L6-v2"
                ),
            )
            print("[OK] ChromaDB collection created")
    except Exception as e:
        print(f"[!] ChromaDB init failed: {e}")
        CHROMADB_AVAILABLE = False
        chroma_client = None
        meetings_collection = None
else:
    print("[!] Knowledge Base disabled")

#  NEW: WEBSOCKET CONNECTIONS FOR LIVE MODE
# ============================================================================


class LiveMeetingManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        self.live_transcripts: Dict[str, List] = {}
        self.live_highlights: Dict[str, List] = {}

    async def connect(self, websocket: WebSocket, meeting_id: str):
        await websocket.accept()
        self.active_connections[meeting_id] = websocket
        self.live_transcripts[meeting_id] = []
        self.live_highlights[meeting_id] = []
        print(f" Live connection established for meeting: {meeting_id}")

    async def disconnect(self, meeting_id: str):
        if meeting_id in self.active_connections:
            del self.active_connections[meeting_id]
            print(f" Live connection closed for meeting: {meeting_id}")

    async def send_transcript_update(self, meeting_id: str, transcript_segment: dict):
        if meeting_id in self.active_connections:
            await self.active_connections[meeting_id].send_json(
                {"type": "transcript", "data": transcript_segment}
            )
            self.live_transcripts[meeting_id].append(transcript_segment)

    async def send_highlight(self, meeting_id: str, highlight: dict):
        if meeting_id in self.active_connections:
            await self.active_connections[meeting_id].send_json(
                {"type": "highlight", "data": highlight}
            )
            self.live_highlights[meeting_id].append(highlight)


live_manager = LiveMeetingManager()


async def get_transcript_via_api(video_id):
    """Use YouTube API for caption tracks"""
    if not YOUTUBE_API_KEY:
        return None

    try:
        url = f"https://www.googleapis.com/youtube/v3/captions?videoId={video_id}&key={YOUTUBE_API_KEY}&part=snippet"

        async with httpx.AsyncClient() as client:
            response = await client.get(url)
            data = response.json()

            if "items" in data and len(data["items"]) > 0:
                caption_id = data["items"][0]["id"]
                caption_url = f"https://www.googleapis.com/youtube/v3/captions/{caption_id}?key={YOUTUBE_API_KEY}&tfmt=vtt"
                caption_response = await client.get(caption_url)

                if caption_response.status_code == 200:
                    return caption_response.text

        return None
    except Exception as e:
        print(f"YouTube API error: {e}")
        return None


def clean_text(text):
    """Clean HTML entities and >> symbols from text"""
    if not text:
        return text
    text = html.unescape(text)
    text = re.sub(r"&gt;+", "", text)
    text = re.sub(r"&lt;+", "", text)
    text = re.sub(r"&amp;+", "&", text)
    text = re.sub(r"&nbsp;+", " ", text)
    text = re.sub(r">>+", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


# FIXED: Balanced chunking strategy - eliminates excessive chunks
def chunk_transcript_with_overlap(transcript, model="gpt-5.1", strategy="balanced"):
    """
    SIMPLIFIED CHUNKING - Max 3-4 chunks to avoid rate limiting
    Fast and reliable approach
    """
    transcript_length = len(transcript)
    print(f" Transcript length: {transcript_length:,} characters")

    # SIMPLE APPROACH: Never more than 4 chunks
    if transcript_length <= 50000:  # Short (<15 min)
        return [transcript], False
    elif transcript_length <= 150000:  # Medium (15-45 min)
        # Split into 2 chunks
        mid = transcript_length // 2
        return [transcript[:mid], transcript[mid:]], True
    elif transcript_length <= 300000:  # Long (45-90 min)
        # Split into 3 chunks
        third = transcript_length // 3
        return [
            transcript[:third],
            transcript[third : third * 2],
            transcript[third * 2 :],
        ], True
    else:  # Very long (90+ min)
        # Split into 4 chunks max
        quarter = transcript_length // 4
        return [
            transcript[:quarter],
            transcript[quarter : quarter * 2],
            transcript[quarter * 2 : quarter * 3],
            transcript[quarter * 3 :],
        ], True


def extract_key_points_from_chunk(chunk, chunk_num, total_chunks, model="gpt-5.1"):
    """Extract key points from a single chunk with minimal delay"""
    if not OPENAI_API_KEY:
        return None

    # Minimal delay between chunks (since we have max 4 chunks)
    if chunk_num > 1:
        time.sleep(1)  # Just 1 second delay between chunks

    system_prompt = """You are an expert analyst specializing in civic and government meetings. 
Your task is to extract the most important information from this segment of a meeting transcript."""

    user_prompt = f"""This is segment {chunk_num} of {total_chunks} from a civic/government meeting.

Extract the following from THIS SEGMENT:
1. KEY DECISIONS made (votes, approvals, rejections)
2. MAJOR DISCUSSIONS (important topics, debates, concerns raised)
3. ACTION ITEMS (tasks assigned, deadlines, next steps)
4. NOTABLE QUOTES (exact quotes that capture important moments)

Be specific. Include names, dates, and concrete details.

SEGMENT {chunk_num}/{total_chunks}:
{chunk[:50000]}  

Respond in this JSON format:
{{
  "decisions": ["decision 1", "decision 2", ...],
  "discussions": ["topic 1", "topic 2", ...],
  "action_items": ["action 1", "action 2", ...],
  "notable_quotes": ["quote 1", "quote 2", ...]
}}"""

    result = call_openai_api(
        prompt=user_prompt,
        max_tokens=1500,
        model=model,
        temperature=0.2,
        system_prompt=system_prompt,
        response_format="json_object",
        retry_on_rate_limit=True,
    )

    return result


def synthesize_full_meeting(all_key_points, model="gpt-5.1", strategy="concise"):
    """Synthesize all extracted key points into final summary"""
    if not OPENAI_API_KEY or not all_key_points:
        return None

    # Combine all key points
    combined_decisions = []
    combined_discussions = []
    combined_actions = []
    combined_quotes = []

    for kp in all_key_points:
        if kp:
            try:
                data = json.loads(kp)
                combined_decisions.extend(data.get("decisions", []))
                combined_discussions.extend(data.get("discussions", []))
                combined_actions.extend(data.get("action_items", []))
                combined_quotes.extend(data.get("notable_quotes", []))
            except:
                continue

    # FIXED: Use dict.fromkeys to remove duplicates while preserving order
    combined_decisions = list(dict.fromkeys(combined_decisions))
    combined_discussions = list(dict.fromkeys(combined_discussions))
    combined_actions = list(dict.fromkeys(combined_actions))
    combined_quotes = list(dict.fromkeys(combined_quotes))

    if strategy == "highlights_with_quotes":
        system_prompt = """You are an expert at creating compelling, newsworthy highlights from civic meetings.
Your goal is to identify the most IMPACTFUL moments that citizens would want to see.

PRIORITIZE these types of moments (in order):
1. VOTES & DECISIONS - Any official votes, approvals, denials, or formal decisions
2. BUDGET & MONEY - Specific dollar amounts, funding allocations, tax implications
3. EMOTIONAL MOMENTS - Passionate speeches, disagreements, standing ovations, frustration
4. PUBLIC COMMENTS - Resident testimonials, community concerns, personal stories
5. KEY ANNOUNCEMENTS - New projects, policy changes, timeline updates
6. CONTROVERSIES - Debates, split opinions, contentious issues

CRITICAL REQUIREMENTS:
- You MUST return EXACTLY 10 highlights - no more, no less
- Each highlight must be SPECIFIC with names, numbers, or concrete details
- Quotes must be COMPLETE sentences, never fragments
- Prioritize diversity - cover DIFFERENT topics, not multiple highlights about same thing
- Include at least 2 public comments/resident voices if present
- Flag any votes with the vote count (e.g., "passed 4-1")
- If you cannot find 10 distinct highlights, create highlights for procedural items like "call to order" or "adjournment\""""

        user_prompt = f"""Based on the key information extracted from a civic meeting, create EXACTLY 10 compelling highlights with supporting quotes.

KEY INFORMATION FROM MEETING:

DECISIONS & VOTES MADE:
{chr(10).join(f" • {d}" for d in combined_decisions[:20])}

MAJOR DISCUSSIONS:
{chr(10).join(f" • {d}" for d in combined_discussions[:20])}

ACTION ITEMS:
{chr(10).join(f" • {a}" for a in combined_actions[:15])}

NOTABLE QUOTES (use ONLY complete quotes):
{chr(10).join(f' "{q}"' for q in combined_quotes[:20])}

MANDATORY: Create EXACTLY 10 highlights. This is critical - the array MUST have exactly 10 items.

Requirements for the 10 highlights:
1. At least 2 highlights about VOTES or DECISIONS (include vote counts if available)
2. At least 1 highlight about BUDGET or MONEY (include specific dollar amounts)
3. At least 2 highlights featuring PUBLIC COMMENTS or resident voices
4. Remaining highlights should cover DIFFERENT topics for variety
5. Each quote must be a COMPLETE sentence from the meeting
6. DO NOT skip any highlights - return all 10

For each highlight, also provide:
- category: one of "vote", "budget", "public_comment", "announcement", "controversy", "action_item"
- importance: 1-5 (5 = most important)
- speaker: who said the quote (if identifiable)

Respond in this EXACT JSON format with EXACTLY 10 items in the highlights array:
{{
  "highlights": [
    {{
      "highlight": "Brief summary of key point",
      "quote": "Complete supporting quote from the meeting",
      "category": "vote",
      "importance": 5,
      "speaker": "Mayor Smith"
    }},
    // ... 9 more items for a total of 10
  ],
  "meeting_stats": {{
    "total_votes": 0,
    "total_decisions": 0,
    "public_comments_count": 0,
    "controversial_items": 0,
    "budget_items_discussed": 0
  }}
}}"""

        max_tokens = 4000  # Increased for 10 full highlights

    else:
        system_prompt = """You are an expert at writing executive summaries for civic and government meetings.
Your summaries are conversational, clear, factual, and focus on outcomes that matter to residents.
Write in flowing paragraphs, NOT bullet points or quote fragments."""

        if strategy == "concise":
            user_prompt = f"""Based on the key information extracted from a civic meeting, write a concise executive summary.

KEY INFORMATION FROM MEETING:

DECISIONS MADE:
{chr(10).join(f" {d}" for d in combined_decisions[:20])}

MAJOR DISCUSSIONS:
{chr(10).join(f" {d}" for d in combined_discussions[:20])}

ACTION ITEMS:
{chr(10).join(f" {a}" for a in combined_actions[:15])}

Write a 3-5 sentence executive summary that:
1. MUST start with "At this meeting," - do not use any other opening
2. Covers key topics discussed and decisions made
3. Mentions important action items and next steps
4. Uses conversational, flowing language (no bullet points)
5. Is written for residents/stakeholders

CRITICAL: Always begin with "At this meeting," and write in complete paragraphs."""
            max_tokens = 500
        else:
            user_prompt = f"""Based on the key information extracted from a civic meeting, write a comprehensive executive summary.

KEY INFORMATION FROM MEETING:

DECISIONS MADE:
{chr(10).join(f" {d}" for d in combined_decisions[:20])}

MAJOR DISCUSSIONS:
{chr(10).join(f" {d}" for d in combined_discussions[:20])}

ACTION ITEMS:
{chr(10).join(f" {a}" for a in combined_actions[:15])}

Write a 2-3 paragraph executive summary that:
1. MUST start with "At this meeting," - do not use any other opening
2. Describes key topics discussed with context
3. Explains decisions made and their implications
4. Highlights action items and next steps
5. Uses conversational, flowing language

CRITICAL: Always begin with "At this meeting," and write in complete, flowing paragraphs."""
            max_tokens = 1000

    result = call_openai_api(
        prompt=user_prompt,
        max_tokens=max_tokens,
        model=model,
        temperature=0.5 if strategy == "highlights_with_quotes" else 0.3,
        system_prompt=system_prompt,
        response_format="json_object" if strategy == "highlights_with_quotes" else None,
    )

    return result


def call_openai_api(
    prompt,
    max_tokens=400,
    model="gpt-5.1",
    temperature=0.3,
    system_prompt=None,
    response_format=None,
    retry_on_rate_limit=True,
):
    """Enhanced OpenAI API call with GPT-5.1 support and automatic fallback.
    
    Args:
        prompt: User prompt
        max_tokens: Maximum output tokens
        model: Model identifier (gpt-5.1, gpt-4o, etc.)
        temperature: Response randomness (0-1)
        system_prompt: System instructions
        response_format: "json_object" for JSON mode
        retry_on_rate_limit: Whether to retry on 429 errors
    """
    if not OPENAI_API_KEY:
        print("[OpenAI] ERROR: No API key configured")
        return None

    # Model fallback chain
    models_to_try = [model]
    if model not in ["gpt-4o", "gpt-4o-mini"]:
        models_to_try.append("gpt-4o")
    if "gpt-4o-mini" not in models_to_try:
        models_to_try.append("gpt-4o-mini")

    max_retries = 2
    retry_delay = 1

    for current_model in models_to_try:
        print(f"[OpenAI] Trying model: {current_model}")
        
        for attempt in range(max_retries):
            try:
                headers = {
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                }

                if system_prompt is None:
                    system_prompt = (
                        "You are a helpful assistant that analyzes meeting transcripts."
                    )

                data = {
                    "model": current_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": max_tokens,
                    "temperature": temperature,
                }

                if response_format == "json_object":
                    data["response_format"] = {"type": "json_object"}

                response = httpx.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers,
                    json=data,
                    timeout=180.0,
                )

                if response.status_code == 200:
                    result = response.json()
                    content = result["choices"][0]["message"]["content"]
                    
                    # Log token usage for cost monitoring
                    usage = result.get("usage", {})
                    if usage:
                        print(f"[OpenAI] Success with {current_model}: {len(content)} chars, tokens: {usage.get('total_tokens', 'N/A')}")
                    else:
                        print(f"[OpenAI] Success with {current_model}: {len(content)} chars")
                    return content

                elif response.status_code == 429 and retry_on_rate_limit:
                    print(f"[OpenAI] Rate limited on {current_model}, waiting {retry_delay}s...")
                    time.sleep(retry_delay)
                    retry_delay *= 2
                    continue

                elif response.status_code == 404:
                    # Model not found - try next model
                    print(f"[OpenAI] Model {current_model} not found (404), trying fallback...")
                    break  # Move to next model

                else:
                    try:
                        error_body = response.json()
                        error_msg = error_body.get("error", {}).get("message", "Unknown error")
                        print(f"[OpenAI] API error {response.status_code}: {error_msg}")
                        
                        # Check for specific errors
                    except:
                        print(f"[OpenAI] API error {response.status_code}: {response.text[:200]}")
                    
                    if response.status_code >= 500:
                        # Server error - retry
                        time.sleep(retry_delay)
                        continue
                    else:
                        # Client error - try next model
                        break

            except httpx.TimeoutException:
                print(f"[OpenAI] Timeout on attempt {attempt + 1}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue
            except Exception as e:
                print(f"[OpenAI] Exception: {type(e).__name__}: {e}")
                if attempt < max_retries - 1:
                    time.sleep(retry_delay)
                    continue

    print("[OpenAI] All models failed")
    return None


def generate_fallback_summary(transcript):
    """Generate a sensible generic summary when AI is unavailable.
    NEVER includes raw transcript text to avoid nonsensical output."""
    transcript = clean_text(transcript)
    
    # Extract meeting metadata hints from transcript
    sentences = [s.strip() for s in transcript.split(".") if len(s.strip()) > 20]
    transcript_lower = transcript.lower()
    
    # Detect meeting type
    meeting_type = "civic meeting"
    if "select board" in transcript_lower or "selectboard" in transcript_lower:
        meeting_type = "Select Board meeting"
    elif "city council" in transcript_lower:
        meeting_type = "City Council meeting"
    elif "school committee" in transcript_lower or "school board" in transcript_lower:
        meeting_type = "School Committee meeting"
    elif "planning board" in transcript_lower or "planning commission" in transcript_lower:
        meeting_type = "Planning Board meeting"
    elif "zoning" in transcript_lower:
        meeting_type = "Zoning Board meeting"
    elif "finance committee" in transcript_lower:
        meeting_type = "Finance Committee meeting"
    elif "town meeting" in transcript_lower:
        meeting_type = "Town Meeting"
    
    # Count key activities
    vote_count = len(re.findall(r'\b(vote[ds]?|motion|approve[ds]?|pass(?:ed)?|unanimous)\b', transcript_lower))
    discussion_count = len(re.findall(r'\b(discuss(?:ed|ion)?|consider(?:ed)?|review(?:ed)?|present(?:ed|ation)?)\b', transcript_lower))
    public_comment = 'public comment' in transcript_lower or 'resident' in transcript_lower
    
    # Build a clean, generic summary
    summary_parts = [f"At this {meeting_type}, "]
    
    if vote_count > 3:
        summary_parts.append("several votes were taken on various agenda items. ")
    elif vote_count > 0:
        summary_parts.append("votes were held on key agenda items. ")
    
    if discussion_count > 5:
        summary_parts.append("The board engaged in extensive discussion on multiple topics of community interest. ")
    elif discussion_count > 0:
        summary_parts.append("Various matters were discussed by the committee. ")
    
    if public_comment:
        summary_parts.append("Residents participated in the public comment period. ")
    
    # Estimate meeting length
    word_count = len(transcript.split())
    if word_count > 10000:
        summary_parts.append("This was a comprehensive meeting covering numerous agenda items. ")
    elif word_count > 5000:
        summary_parts.append("Multiple agenda items were addressed during this session. ")
    
    summary_parts.append("Please review the full transcript or watch the video for complete details on specific decisions and discussions.")
    
    summary = "".join(summary_parts)
    summary = re.sub(r"\s+", " ", summary).strip()
    
    return summary


def generate_fallback_highlights(transcript):
    """Generate sensible generic highlights when AI is unavailable.
    Returns 10 highlights with generic but relevant content - NEVER raw transcript."""
    
    transcript_lower = transcript.lower()
    
    # Detect topics mentioned in the transcript
    detected_topics = []
    
    topic_patterns = [
        ("budget", "Budget and Financial Review", "Financial matters and budget allocations were discussed during this portion of the meeting."),
        ("vote", "Voting on Agenda Items", "The board voted on various items requiring official action."),
        ("motion", "Motions and Approvals", "Formal motions were made and seconded for consideration."),
        ("public comment", "Public Comment Period", "Community members had the opportunity to address the board during public comment."),
        ("zoning", "Zoning and Land Use", "Zoning regulations and land use matters were reviewed."),
        ("permit", "Permits and Applications", "Permit applications and related matters were considered."),
        ("school", "Education and Schools", "Educational matters and school-related topics were discussed."),
        ("police", "Public Safety", "Public safety and law enforcement matters were addressed."),
        ("road", "Infrastructure and Roads", "Infrastructure projects and road maintenance were discussed."),
        ("park", "Parks and Recreation", "Parks, recreation, and community spaces were discussed."),
        ("water", "Water and Utilities", "Water, sewer, and utility matters were reviewed."),
        ("tax", "Tax and Revenue", "Tax rates and revenue matters were discussed."),
        ("appoint", "Appointments and Personnel", "Board appointments and personnel matters were addressed."),
        ("contract", "Contracts and Agreements", "Contracts and formal agreements were reviewed."),
        ("plan", "Planning and Development", "Planning initiatives and development projects were considered."),
    ]
    
    for keyword, title, description in topic_patterns:
        if keyword in transcript_lower:
            detected_topics.append({
                "highlight": title,
                "quote": description,
                "category": "announcement",
                "importance": 3
            })
    
    # Fill remaining slots with generic civic meeting topics
    generic_topics = [
        {"highlight": "Meeting Called to Order", "quote": "The meeting was officially opened with roll call and approval of the agenda.", "category": "announcement", "importance": 2},
        {"highlight": "Approval of Minutes", "quote": "Minutes from previous meetings were reviewed and approved.", "category": "announcement", "importance": 2},
        {"highlight": "Committee Reports", "quote": "Various committee chairs presented updates on their activities.", "category": "announcement", "importance": 2},
        {"highlight": "New Business Discussion", "quote": "New items were introduced for the board's consideration.", "category": "announcement", "importance": 3},
        {"highlight": "Old Business Follow-up", "quote": "Previously tabled items were revisited for further action.", "category": "announcement", "importance": 3},
        {"highlight": "Administrative Updates", "quote": "Administrative staff provided updates on ongoing operations.", "category": "announcement", "importance": 2},
        {"highlight": "Future Agenda Items", "quote": "Items for upcoming meetings were discussed and scheduled.", "category": "announcement", "importance": 2},
        {"highlight": "Meeting Adjournment", "quote": "The meeting was formally adjourned following completion of all agenda items.", "category": "announcement", "importance": 1},
    ]
    
    # Combine detected and generic, prioritizing detected
    highlights = detected_topics[:10]
    
    # Fill remaining slots with generic topics
    generic_index = 0
    while len(highlights) < 10 and generic_index < len(generic_topics):
        if generic_topics[generic_index]["highlight"] not in [h["highlight"] for h in highlights]:
            highlights.append(generic_topics[generic_index])
        generic_index += 1
    
    return highlights[:10]


def generate_fallback_entities(transcript):
    """v5.2: STRICT fallback - only full names and proper nouns"""
    entities = []
    words = transcript.split()
    seen = set()
    
    # Skip common words that aren't entities
    skip_words = {"the", "this", "that", "there", "they", "thank", "thanks", "and", "but", 
                  "what", "when", "where", "why", "how", "will", "would", "could", "should",
                  "have", "has", "had", "been", "being", "are", "was", "were", "is", "it"}
    
    for i in range(len(words) - 1):
        word1 = re.sub(r"[^\w\s-]", "", words[i]).strip()
        word2 = re.sub(r"[^\w\s-]", "", words[i + 1]).strip()
        
        # Must have two capitalized words (full name pattern)
        if (word1 and word2 and len(word1) > 1 and len(word2) > 1 and
            word1[0].isupper() and word2[0].isupper() and
            word1.lower() not in skip_words and word2.lower() not in skip_words):
            
            full_name = f"{word1} {word2}"
            key = full_name.lower()
            
            if key not in seen:
                seen.add(key)
                
                # Determine type based on keywords
                entity_type = "PERSON"
                place_words = ["Street", "Road", "Avenue", "Park", "Building", "Center", 
                              "City", "County", "State", "Drive", "Boulevard", "Lane"]
                org_words = ["Department", "Board", "Committee", "Council", "Commission", 
                            "Office", "Agency", "Corporation", "Company", "Association"]
                
                if any(t in full_name for t in place_words):
                    entity_type = "PLACE"
                elif any(t in full_name for t in org_words):
                    entity_type = "ORG"
                
                # Count occurrences
                count = transcript.lower().count(full_name.lower())
                if count >= 1:
                    entities.append({"text": full_name, "count": max(count, 1), "type": entity_type})
    
    # Sort by count and return top 30 (quality over quantity)
    entities.sort(key=lambda x: x["count"], reverse=True)
    return entities[:30]


def to_vtt(transcript_list):
    """Convert transcript to VTT format"""
    out = ["WEBVTT", ""]
    for item in transcript_list:
        start = float(item.get("start", 0))
        duration = float(item.get("duration", 0))
        end = start + duration

        def format_time(seconds):
            hours = int(seconds // 3600)
            minutes = int((seconds % 3600) // 60)
            secs = int(seconds % 60)
            millis = int((seconds % 1) * 1000)
            return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"

        text = clean_text(item.get("text", "").strip())
        if text:
            out.append(f"{format_time(start)} --> {format_time(end)}")
            out.append(text)
            out.append("")

    return "\n".join(out)


def get_video_id(url):
    """Extract video ID from various YouTube URL formats"""
    if not url:
        return None

    if len(url) == 11 and url.isalnum():
        return url

    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11}).*",
        r"(?:embed\/)([0-9A-Za-z_-]{11})",
        r"(?:watch\?v=)([0-9A-Za-z_-]{11})",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
    ]

    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)

    return None


@app.get("/")
async def root():
    """Serve React app at root"""
    if DIST_DIR:
        index_path = os.path.join(DIST_DIR, "index.html")
        if os.path.exists(index_path):
            return FileResponse(index_path)
    # Fallback to API info if no frontend
    return {
        "message": "Community Highlighter API v5.0 - Enhanced AI Assistant",
        "status": "running",
        "note": "No frontend dist folder found"
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint for deployment monitoring"""
    return {
        "status": "healthy",
        "version": "5.5",
        "cloud_mode": CLOUD_MODE,
        "proxy_enabled": PROXY_ENABLED,
        "features": {
            "transcripts": True,
            "ai_assistant": bool(OPENAI_API_KEY),
            "ai_summaries": bool(OPENAI_API_KEY),
            "entity_extraction": bool(OPENAI_API_KEY),
            "word_frequency": True,
            "sentiment_analysis": True,
            "knowledge_base": CHROMADB_AVAILABLE,
            "video_clips": not CLOUD_MODE,
            "video_download": not CLOUD_MODE,
            "live_mode": False
        },
        "notes": "Video download features disabled in cloud mode (YouTube blocks cloud IPs)" if CLOUD_MODE else None
    }


@app.get("/api/system/status")
async def system_status():
    """Detailed system status including desktop download information"""
    return {
        "version": "5.5",
        "environment": "cloud" if CLOUD_MODE else "desktop",
        "cloud_mode": CLOUD_MODE,
        "proxy_enabled": PROXY_ENABLED,
        "features": {
            "transcripts": {"available": True, "description": "Fetch YouTube video transcripts"},
            "ai_analysis": {"available": bool(OPENAI_API_KEY), "description": "AI-powered summaries and insights"},
            "entity_extraction": {"available": bool(OPENAI_API_KEY), "description": "Extract people, places, organizations"},
            "word_frequency": {"available": True, "description": "Analyze common words and phrases"},
            "sentiment_analysis": {"available": True, "description": "Analyze sentiment over time"},
            "action_items": {"available": bool(OPENAI_API_KEY), "description": "Extract action items and decisions"},
            "knowledge_base": {"available": CHROMADB_AVAILABLE, "description": "Compare multiple meetings"},
            "video_clips": {
                "available": not CLOUD_MODE,
                "description": "Download and create video clips",
                "cloud_note": "Requires desktop app - YouTube blocks cloud servers" if CLOUD_MODE else None
            },
            "highlight_reels": {
                "available": not CLOUD_MODE,
                "description": "Create highlight compilation videos",
                "cloud_note": "Requires desktop app - YouTube blocks cloud servers" if CLOUD_MODE else None
            }
        },
        "desktop_app": {
            "required_for": ["video_clips", "highlight_reels"] if CLOUD_MODE else [],
            "download_url": "https://github.com/amateurmenace/community-highlighter/releases",
            "platforms": {
                "mac": {
                    "name": "macOS",
                    "filename": "CommunityHighlighter-mac.zip",
                    "requirements": "macOS 10.15 or later"
                },
                "windows": {
                    "name": "Windows",
                    "filename": "CommunityHighlighter-windows.zip",
                    "requirements": "Windows 10 or later"
                }
            }
        }
    }



def parse_vtt_to_transcript(vtt_content: str) -> list:
    """Parse VTT content into transcript format for AI assistant
    
    Handles YouTube's rolling captions which often have overlapping/duplicate text.
    Also detects and removes internal repetition within a single caption.
    """
    transcript_data = []
    lines = vtt_content.split("\n")
    i = 0
    
    # Track seen text to avoid duplicates
    seen_texts = set()
    last_text = ""
    
    def remove_internal_repetition(text):
        """Detect and remove repeated phrases within text.
        
        Example: "hello world hello world" -> "hello world"
        """
        if not text or len(text) < 10:
            return text
        
        # Normalize whitespace
        text = ' '.join(text.split())
            
        words = text.split(' ')
        n = len(words)
        if n < 4:
            return text
        
        # Try splitting in half first (most common case: exact 2x repeat)
        half = n // 2
        first_half = ' '.join(words[:half])
        second_half = ' '.join(words[half:half*2])
        if first_half == second_half:
            return first_half
        
        # Try splitting in thirds (3x repeat)
        third = n // 3
        if third >= 2:
            p1 = ' '.join(words[:third])
            p2 = ' '.join(words[third:third*2])
            p3 = ' '.join(words[third*2:third*3])
            if p1 == p2 == p3:
                return p1
        
        # Try to find where the text starts repeating by looking for first word appearing again
        first_word = words[0].lower()
        for i in range(2, half + 2):
            if i < n and words[i].lower() == first_word:
                # Potential repeat starting at position i
                candidate = ' '.join(words[:i])
                rest = ' '.join(words[i:])
                # Check if rest starts with candidate (allowing partial at end)
                if rest == candidate or rest.startswith(candidate + ' ') or candidate.startswith(rest):
                    return candidate
        
        return text

    while i < len(lines):
        line = lines[i].strip()

        # Skip WEBVTT header and empty lines
        if not line or line.startswith("WEBVTT") or line.startswith("NOTE"):
            i += 1
            continue

        # Look for timestamp lines (HH:MM:SS.mmm --> HH:MM:SS.mmm)
        if "-->" in line:
            try:
                timestamp_parts = line.split("-->")
                start_time = timestamp_parts[0].strip()
                end_time = (
                    timestamp_parts[1].strip()
                    if len(timestamp_parts) > 1
                    else start_time
                )

                # Convert timestamp to seconds
                def time_to_seconds(time_str):
                    # Remove any position or alignment info
                    time_str = time_str.split()[0].replace(",", ".")
                    parts = time_str.split(":")
                    if len(parts) == 3:
                        h, m, s = parts
                        return float(h) * 3600 + float(m) * 60 + float(s)
                    elif len(parts) == 2:
                        m, s = parts
                        return float(m) * 60 + float(s)
                    else:
                        return float(parts[0])

                start_seconds = time_to_seconds(start_time)
                end_seconds = time_to_seconds(end_time)
                duration = max(end_seconds - start_seconds, 0.5)

                # Get the text (next non-empty lines)
                i += 1
                text_lines = []
                while i < len(lines):
                    text_line = lines[i].strip()
                    if not text_line or "-->" in text_line:
                        break
                    # Remove VTT formatting tags
                    text_line = re.sub(r"<[^>]+>", "", text_line)  # Remove all tags
                    text_line = re.sub(r"\{[^}]+\}", "", text_line)  # Remove style info
                    text_lines.append(text_line)
                    i += 1

                text = " ".join(text_lines).strip()
                
                if text:
                    # FIRST: Remove internal repetition (e.g., "hello hello hello" -> "hello")
                    text = remove_internal_repetition(text)
                    
                    # Deduplicate: Check for exact duplicates and rolling text
                    text_normalized = text.lower().strip()
                    
                    # Skip if exact duplicate
                    if text_normalized in seen_texts:
                        continue
                    
                    # Check for rolling/overlapping text (YouTube captions often show partial updates)
                    # If new text is contained in last text, or last text is contained in new text, skip
                    is_rolling = False
                    if last_text:
                        last_normalized = last_text.lower().strip()
                        # Check if one contains the other (rolling caption)
                        if text_normalized in last_normalized or last_normalized in text_normalized:
                            # Keep the longer one
                            if len(text_normalized) > len(last_normalized):
                                # Replace last entry with this longer one
                                if transcript_data:
                                    transcript_data[-1]["text"] = text
                                    seen_texts.add(text_normalized)
                                    last_text = text
                            is_rolling = True
                        # Check for significant overlap (more than 50% of words match)
                        elif not is_rolling:
                            words_new = set(text_normalized.split())
                            words_last = set(last_normalized.split())
                            if words_new and words_last:
                                overlap = len(words_new & words_last) / min(len(words_new), len(words_last))
                                if overlap > 0.7:  # 70% overlap = likely rolling caption
                                    # Keep the longer text
                                    if len(text) > len(last_text) and transcript_data:
                                        transcript_data[-1]["text"] = text
                                        last_text = text
                                    is_rolling = True
                    
                    if not is_rolling:
                        seen_texts.add(text_normalized)
                        transcript_data.append(
                            {"text": text, "start": start_seconds, "duration": duration}
                        )
                        last_text = text
                        
            except Exception as e:
                print(f"   Warning: Could not parse timestamp: {e}")

        i += 1

    print(f"   Parsed {len(transcript_data)} segments from VTT (deduplicated)")
    return transcript_data


@app.post("/api/transcript")
async def get_transcript(req: Request):
    from typing import Dict, Any, Optional
    import random

    data = await req.json()
    url = data.get("url")
    video_id = data.get("videoId") or get_video_id(url)

    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL or video ID")

    print(f"[*][>] Getting transcript for video: {video_id}")

    # Try YouTube Transcript API FIRST with retry logic
    max_retries = 3
    last_error = None
    
    for attempt in range(max_retries):
        try:
            if attempt > 0:
                wait_time = (attempt * 2) + random.uniform(0.5, 1.5)
                print(f"   Retry {attempt + 1}/{max_retries} after {wait_time:.1f}s...")
                await asyncio.sleep(wait_time)
            
            print("   Trying YouTubeTranscriptApi...")
            if PROXY_ENABLED:
                print("   Using Webshare residential proxy")
            
            # New v1.0+ API: use fetch() directly, returns FetchedTranscript object
            # Convert to dict list with .to_raw_data()
            fetched_transcript = ytt_api.fetch(video_id, languages=['en'])
            transcript_data = fetched_transcript.to_raw_data()

            # Store for AI assistant
            STORED_TRANSCRIPTS[video_id] = transcript_data
            print(f"[OK] STORED {len(transcript_data)} segments (YouTubeTranscriptApi)")

            vtt = to_vtt(transcript_data)
            return Response(content=vtt, media_type="text/vtt")

        except Exception as e:
            last_error = e
            error_msg = str(e).lower()
            print(f"   YouTubeTranscriptApi attempt {attempt + 1} failed: {e}")
            
            # Don't retry if captions are definitely not available
            if "disabled" in error_msg or "no transcript" in error_msg:
                print("   Captions disabled for this video")
                break
            
            if attempt < max_retries - 1:
                continue
    
    print(f"   YouTubeTranscriptApi failed after {max_retries} attempts")

    # Fallback: YouTube Data API
    if YOUTUBE_API_KEY:
        try:
            print("   Trying YouTube Data API...")
            vtt = await get_transcript_via_api(video_id)
            if vtt:
                print(f" Got VTT via YouTube Data API")

                # Try to parse and store
                try:
                    transcript_data = parse_vtt_to_transcript(vtt)
                    if transcript_data:
                        STORED_TRANSCRIPTS[video_id] = transcript_data
                        print(
                            f" STORED {len(transcript_data)} segments (Method: YouTube Data API)"
                        )
                except Exception as parse_error:
                    print(f"Ãƒâ€šÃ‚   Could not parse YouTube Data API VTT: {parse_error}")

                return Response(content=vtt, media_type="text/vtt")
        except Exception as e:
            print(f"Ãƒâ€šÃ‚   YouTube Data API failed: {e}")

    # Last resort: yt-dlp
    try:
        print("   Trying yt-dlp...")
        ydl_opts: Dict[str, Any] = {
            "writesubtitles": True,
            "writeautomaticsub": True,
            "subtitleslangs": ["en"],
            "skip_download": True,
            "quiet": True,
        }
        
        # Add proxy if available (uses URL-encoded credentials)
        if WEBSHARE_PROXY_URL:
            ydl_opts["proxy"] = WEBSHARE_PROXY_URL
            print("   Using Webshare proxy for yt-dlp")

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", download=False
            )

            if info and "subtitles" in info:
                subs = info.get("subtitles", {}).get("en") or info.get(
                    "automatic_captions", {}
                ).get("en")

                if subs and isinstance(subs, list):
                    vtt_url: Optional[str] = None
                    for sub in subs:
                        if isinstance(sub, dict) and sub.get("ext") == "vtt":
                            vtt_url = sub.get("url")
                            break

                    if vtt_url:
                        # Create httpx client, with proxy if available
                        client_kwargs = {}
                        if WEBSHARE_PROXY_URL:
                            client_kwargs["proxies"] = {"http://": WEBSHARE_PROXY_URL, "https://": WEBSHARE_PROXY_URL}
                        
                        async with httpx.AsyncClient(**client_kwargs) as client:
                            resp = await client.get(vtt_url)
                            if resp.status_code == 200:
                                vtt_content = resp.text
                                print(f"  Got VTT via yt-dlp")

                                #  CRITICAL: Parse and store for AI assistant
                                try:
                                    transcript_data = parse_vtt_to_transcript(
                                        vtt_content
                                    )
                                    if transcript_data:
                                        STORED_TRANSCRIPTS[video_id] = transcript_data
                                        print(
                                            f" STORED {len(transcript_data)} segments (Method: yt-dlp)"
                                        )
                                    else:
                                        print(f"Ãƒâ€šÃ‚   VTT parsing returned no data")
                                except Exception as parse_error:
                                    print(
                                        f"Ãƒâ€šÃ‚   Could not parse yt-dlp VTT: {parse_error}"
                                    )

                                return Response(
                                    content=vtt_content, media_type="text/vtt"
                                )

    except Exception as e:
        print(f"Ãƒâ€šÃ‚   yt-dlp failed: {e}")

    raise HTTPException(
        status_code=404,
        detail="Could not get transcript. Video may not have captions available.",
    )


@app.get("/api/debug/cache")
async def debug_cache():
    """Check what's in the transcript cache"""
    return {
        "video_ids_in_cache": list(STORED_TRANSCRIPTS.keys()),
        "count": len(STORED_TRANSCRIPTS),
        "details": {
            vid: {"segments": len(data)} for vid, data in STORED_TRANSCRIPTS.items()
        },
    }


@app.post("/api/wordfreq")
async def wordfreq(req: Request):
    data = await req.json()
    transcript = clean_text(data.get("transcript", ""))

    if not transcript:
        return {"words": []}

    try:
        stop_words = set(stopwords.words("english"))
    except:
        try:
            nltk.download("stopwords", quiet=True)
            stop_words = set(stopwords.words("english"))
        except:
            stop_words = set()

    civic_stopwords = {
        "the",
        "and",
        "for",
        "with",
        "that",
        "this",
        "from",
        "into",
        "your",
        "about",
        "have",
        "will",
        "they",
        "them",
        "were",
        "has",
        "had",
        "not",
        "but",
        "are",
        "our",
        "you",
        "its",
        "it's",
        "we're",
        "there",
        "here",
        "been",
        "was",
    }

    stop_words.update(civic_stopwords)

    words = re.findall(r"\b[a-zA-Z]{3,}\b", transcript.lower())
    word_counts = Counter(w for w in words if w not in stop_words)

    top_words = [
        {"text": fix_brooklyn(word), "count": count} for word, count in word_counts.most_common(50)
    ]

    return {"words": top_words}


@app.post("/api/summary_ai")
async def summary_ai(req: Request):
    """Smart map-reduce strategy for long transcripts - FIXED duplication"""
    data = await req.json()
    transcript = clean_text(data.get("transcript", ""))
    language = data.get("language", "en")
    model = data.get("model", "gpt-4o")
    strategy = data.get("strategy", "concise")
    force_refresh = data.get("forceRefresh", False)  # New: bypass cache and get fresh results

    # Validate and normalize model name - ensure we use a valid OpenAI model
    valid_models = ["gpt-5.1", "gpt-5.1-chat-latest", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"]
    if model not in valid_models:
        print(f"[summary_ai] Invalid model '{model}', defaulting to gpt-5.1")
        model = "gpt-5.1"

    if not transcript:
        raise HTTPException(400, "No transcript provided")

    print(f"[summary_ai] Processing transcript: {len(transcript):,} characters, strategy={strategy}, model={model}, force_refresh={force_refresh}")

    chunks, needs_processing = chunk_transcript_with_overlap(transcript, model)

    if needs_processing and len(chunks) > 1:
        print(f"[summary_ai] Using map-reduce for {len(chunks)} chunks")

        all_key_points = []
        for i, chunk in enumerate(chunks):
            print(f"   Analyzing chunk {i+1}/{len(chunks)}...")
            key_points = extract_key_points_from_chunk(chunk, i + 1, len(chunks), model)
            if key_points:
                all_key_points.append(key_points)

        if not all_key_points:
            print("Ãƒâ€šÃ‚  Key point extraction failed, using fallback")
            if strategy == "highlights_with_quotes":
                return {
                    "summarySentences": json.dumps(
                        generate_fallback_highlights(transcript)
                    ),
                    "strategy": "fallback",
                }
            return {
                "summarySentences": generate_fallback_summary(transcript),
                "strategy": "fallback",
            }

        print(f"[summary_ai] Synthesizing final {strategy}...")
        ai_result = synthesize_full_meeting(all_key_points, model, strategy)

        if ai_result:
            if strategy == "highlights_with_quotes":
                try:
                    parsed = json.loads(ai_result)
                    highlights = parsed.get("highlights", [])

                    if isinstance(highlights, list) and len(highlights) > 0:
                        print(f"[summary_ai] Generated {len(highlights)} highlights")
                        return {
                            "summarySentences": json.dumps(highlights),
                            "strategy": strategy,
                        }
                except json.JSONDecodeError:
                    print("Ãƒâ€šÃ‚  JSON parsing failed")
            else:
                print(f"[summary_ai] Generated summary ({len(ai_result)} chars)")
                return {"summarySentences": ai_result, "strategy": strategy}

    else:
        print("[summary_ai] Transcript fits in one chunk")

        if strategy == "highlights_with_quotes":
            system_prompt = """You are an expert at analyzing civic and government meetings. 
You identify the most important moments, decisions, and discussions that matter to residents.
You ALWAYS return exactly 10 highlights, no more, no less."""

            user_prompt = f"""Analyze this civic meeting transcript and create EXACTLY 10 key highlights with direct quotes.

TRANSCRIPT:
{transcript[:80000]}

MANDATORY: Return EXACTLY 10 highlights. The highlights array MUST have 10 items.

For each highlight:
1. Write a brief summary of the key point
2. Include a COMPLETE quote (full sentence) from the transcript supporting it
3. Assign a category: "vote", "budget", "public_comment", "announcement", "controversy", or "action_item"
4. Rate importance 1-5 (5 = most critical)
5. Identify the speaker if possible

Cover DIFFERENT topics - don't repeat similar highlights.
Include: votes/decisions, budget items, public comments, announcements.

Respond in this EXACT JSON format with EXACTLY 10 items:
{{
  "highlights": [
    {{
      "highlight": "Summary of key point",
      "quote": "Complete direct quote from transcript",
      "category": "vote",
      "importance": 5,
      "speaker": "Speaker name or Unknown"
    }},
    // ... must have exactly 10 items total
  ]
}}"""

            ai_result = call_openai_api(
                prompt=user_prompt,
                max_tokens=4000,
                model=model,
                temperature=0.5,
                system_prompt=system_prompt,
                response_format="json_object",
            )

            if ai_result:
                try:
                    parsed = json.loads(ai_result)
                    highlights = parsed.get("highlights", [])
                    print(f"[summary_ai] Single chunk returned {len(highlights)} highlights")
                    if isinstance(highlights, list) and len(highlights) > 0:
                        # Don't pad - if GPT-5.1 returns fewer than 10, show what it returned
                        # Quality over quantity - no placeholder text
                        return {
                            "summarySentences": json.dumps(highlights[:10]),
                            "strategy": strategy,
                        }
                except Exception as e:
                    print(f"[summary_ai] JSON parse error: {e}")

        else:
            system_prompt = """You are an expert at summarizing civic and government meetings.
Write clear, concise summaries that help residents understand what happened.
Always start with "At this meeting," and write in flowing paragraphs without bullet points."""

            if strategy == "concise":
                user_prompt = f"""Summarize this civic meeting transcript in 3-5 sentences.

TRANSCRIPT:
{transcript[:60000]}

Requirements:
1. Start with "At this meeting,"
2. Cover the main topics discussed
3. Mention any key decisions or votes
4. Note important next steps if any
5. Write in clear, conversational paragraphs - no bullet points

Write a focused 3-5 sentence summary."""
            else:
                user_prompt = f"""Summarize this civic meeting transcript in 2-3 paragraphs.

TRANSCRIPT:
{transcript[:60000]}

Requirements:
1. Start with "At this meeting,"
2. Cover all major topics discussed
3. Detail any decisions, votes, or approvals
4. Explain implications for residents
5. Note upcoming action items
6. Write in flowing paragraphs - no bullet points

Write a comprehensive 2-3 paragraph summary."""

            ai_result = call_openai_api(
                prompt=user_prompt,
                max_tokens=800 if strategy == "detailed" else 500,
                model=model,
                temperature=0.3,
                system_prompt=system_prompt,
            )

            if ai_result:
                return {"summarySentences": ai_result, "strategy": strategy}

    print("[summary_ai] All AI methods failed, using improved fallback")
    if strategy == "highlights_with_quotes":
        return {
            "summarySentences": json.dumps(generate_fallback_highlights(transcript)),
            "strategy": "fallback",
        }
    return {
        "summarySentences": generate_fallback_summary(transcript),
        "strategy": "fallback",
    }


@app.post("/api/summary_full")
async def summary_full(req: Request):
    """Generate summary using full transcript with GPT-4"""
    data = await req.json()
    transcript = clean_text(data.get("transcript", ""))
    model = data.get("model", "gpt-4o")  # Default to GPT-4

    if not transcript:
        raise HTTPException(400, "No transcript provided")

    print(f" Full transcript analysis: {len(transcript):,} characters with {model}")

    # Check if transcript fits in context
    max_chars = 400000 if "gpt-4" in model else 48000

    if len(transcript) > max_chars:
        print(
            f"[!] Transcript too long ({len(transcript):,} chars), truncating to {max_chars:,}"
        )
        transcript = transcript[:max_chars]

    system_prompt = """You are an expert at analyzing civic and government meetings.
Create a comprehensive summary that captures ALL important aspects of this meeting."""

    user_prompt = f"""Analyze this complete meeting transcript and provide a detailed summary.

Include:
1. Meeting overview and main purpose
2. All key decisions and votes
3. Major discussions and debates
4. Action items and next steps
5. Important quotes and statements
6. Attendees and their positions

COMPLETE TRANSCRIPT:
{transcript}

Write a thorough, well-organized summary that captures the full scope of the meeting."""

    ai_result = call_openai_api(
        prompt=user_prompt,
        max_tokens=3000,  # More tokens for comprehensive summary
        model=model,
        temperature=0.3,
        system_prompt=system_prompt,
        retry_on_rate_limit=True,
    )

    if ai_result:
        print(f" Generated full summary ({len(ai_result)} chars)")
        return {
            "summarySentences": ai_result,
            "strategy": "full_transcript",
            "model": model,
        }
    else:
        raise HTTPException(500, "Failed to generate summary")


@app.post("/api/translate")
async def translate_transcript(req: Request):
    """Translate transcript"""
    data = await req.json()
    text = clean_text(data.get("text", ""))
    target_lang = data.get("target_lang", "Spanish")
    model = data.get("model", "gpt-4o")

    if not text:
        raise HTTPException(400, "No text provided")

    max_chars = 40000 if "gpt-4o" in model else 12000
    if len(text) > max_chars:
        text = text[:max_chars] + "..."

    prompt = f"""Translate this civic meeting transcript to {target_lang}. 
Maintain formal tone appropriate for government proceedings.
Preserve names of people, places, and organizations.

TRANSCRIPT:
{text}

TRANSLATION ({target_lang}):"""

    ai_result = call_openai_api(prompt, max_tokens=4000, model=model, temperature=0.3)

    if ai_result:
        print(f" Translated to {target_lang}")
        return {"translation": ai_result, "target_language": target_lang}

    raise HTTPException(500, "Translation failed")


@app.post("/api/metadata")
async def get_metadata(req: Request):
    """Get video metadata"""
    data = await req.json()
    video_id = data.get("videoId", "")

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    try:
        ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        
        # Add proxy if available
        if WEBSHARE_PROXY_URL:
            
            ydl_opts["proxy"] = WEBSHARE_PROXY_URL

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(
                f"https://www.youtube.com/watch?v={video_id}", download=False
            )

            return {
                "title": info.get("title", ""),
                "description": info.get("description", "")[:500],
                "duration": info.get("duration", 0),
                "uploader": info.get("uploader", ""),
                "upload_date": info.get("upload_date", ""),
            }

    except Exception as e:
        print(f"Metadata error: {e}")
        return {"title": "", "description": "", "duration": 0}


async def get_ai_entities_improved(transcript, model="gpt-5.1"):
    """v5.2: STRICT entity extraction - full names, places, organizations only"""
    if not OPENAI_API_KEY:
        print("[!] No OpenAI key, using fallback")
        return generate_fallback_entities(transcript)

    max_chars = 60000
    if len(transcript) > max_chars:
        chunk_size = max_chars // 3
        sample = (
            transcript[:chunk_size]
            + " ... "
            + transcript[len(transcript) // 2 : len(transcript) // 2 + chunk_size]
            + " ... "
            + transcript[-chunk_size:]
        )
        transcript = sample

    system_prompt = """You are a STRICT Named Entity Recognition system. 
Extract ONLY high-quality, properly named entities.

STRICT RULES:

1. PEOPLE - MUST EITHER have first AND last name or a formal title 
   YES: "John Smith", "President Trump", "Dr. Michael Chen", "Commissioner Garcia"
   NO: "John", "the mayor", "someone", single names

2. PLACES - MUST be specific named locations  
   YES: "Brookline Town Hall", "Harvard Street", "Lincoln Park", "Washington D.C.", "Olmstead Road"
   NO: "the building", "downtown", "a park"

3. ORGANIZATIONS - MUST be official names
   YES: "Google", "Department of Transportation", "Brookline School Committee", "Brookline Select Board", "ICE", "Flock"
   NO: "the department", "a company", "the board"

4. TECHNOLOGY - MUST be specific product names
   YES: "Microsoft Teams", "Zoom", "iPhone", "Flock", "AI", "Surveillance", "iPhone", "Smartphones", "Computer"
   NO: "Internet", "software", "device"

5. CULTURALLY SIGNIFICANT ENTITIES - Include names of landmarks, historical sites, well-known public figures, major events, and widely recognized organizations relevant to civic contexts, as well as items in the current news.
   YES: "Statue of Liberty", "Martin Luther King", "ICE", "Surveillance", "Capitalism","World War II", "United Nations", "Social Media", Popular Platforms like "Facebook" and "TikTok"
   NO: Generic or vague references like "a monument", "a leader", "an event"

6. WHENEVER THE TRANSCRIPT MENTIONS "BROOKLYN" ALWAYS READ IT AND TAG IT AS "BROOKLINE" and make sure all outputs respell it to Brookline.

7. If there's even a single entry of the work "Flock" or "ICE" include them as returns.

NEVER include:
- Single first names only
- Generic descriptions
- Vague references
- Common nouns

Return 15-40 HIGH-QUALITY entities only. Quality over quantity."""

    user_prompt = f"""Extract ONLY specific named entities from this transcript.
Full names required for people. Proper names required for places/orgs.

TRANSCRIPT:
{transcript}

Return valid JSON:
{{
  "entities": [
    {{"text": "Full Name Here", "type": "PERSON|PLACE|ORG|TECH", "count": number}}
  ]
}}

Be strict - fewer high-quality entities is better than many low-quality ones."""

    try:
        ai_result = call_openai_api(
            prompt=user_prompt,
            max_tokens=2000,
            model=model,
            temperature=0.1,
            system_prompt=system_prompt,
            response_format="json_object",
        )

        if not ai_result:
            raise Exception("No API response")

        result_data = json.loads(ai_result)
        entities_list = result_data.get("entities", [])

        if not entities_list:
            raise Exception("No entities in response")

        valid_entities = []
        seen = set()
        
        # Words to exclude
        skip_words = {"the", "a", "an", "and", "or", "but", "yes", "no", "okay",
                     "meeting", "motion", "vote", "agenda", "discussion", 
                     "public", "comment", "member", "staff", "resident",
                     "today", "tomorrow", "week", "month", "year"}

        for entity in entities_list:
            if not isinstance(entity, dict):
                continue

            text = entity.get("text", "").strip()
            count = entity.get("count", 1)
            entity_type = entity.get("type", "")

            # Skip short or generic
            if not text or len(text) < 4:
                continue
            if text.lower() in skip_words:
                continue
            
            # Skip duplicates
            if text.lower() in seen:
                continue
            
            # STRICT VALIDATION
            is_valid = False
            
            if entity_type == "PERSON":
                # Must have space (first + last) or title
                has_title = any(t in text for t in ["Mr.", "Ms.", "Mrs.", "Dr.", "Mayor", "Chief", "Director", "President"])
                if " " in text or has_title:
                    is_valid = True
                    
            elif entity_type in ["PLACE", "ORG", "TECH"]:
                # Must be capitalized properly
                words = text.split()
                if len(words) >= 1 and words[0][0].isupper():
                    is_valid = True
            
            if is_valid:
                # v6.0: Fix Martin Luther -> Martin Luther King truncation
                if text.lower() == "martin luther":
                    text = "Martin Luther King"
                seen.add(text.lower())
                valid_entities.append({"text": text, "count": count, "type": entity_type})

        valid_entities.sort(key=lambda x: x["count"], reverse=True)
        print(f"[OK] Extracted {len(valid_entities)} high-quality entities")
        return valid_entities[:40]

    except Exception as e:
        print(f"[!] Entity extraction failed: {e}")
        return generate_fallback_entities(transcript)



# ============================================================================
# YouTube API Endpoints (for Civic Meeting Finder and Playlist Loading)
# ============================================================================

YOUTUBE_API_KEY = os.environ.get("YOUTUBE_API_KEY", "")

# Log API key status at startup
if YOUTUBE_API_KEY:
    print(f"[YouTube] API key configured: {YOUTUBE_API_KEY[:8]}...{YOUTUBE_API_KEY[-4:]}")
else:
    print("[YouTube] WARNING: No YOUTUBE_API_KEY environment variable set!")
    print("[YouTube] Set it with: export YOUTUBE_API_KEY='your-api-key-here'")


@app.get("/api/youtube-status")
async def youtube_status():
    """Check if YouTube API is configured"""
    return {
        "configured": bool(YOUTUBE_API_KEY),
        "key_preview": f"{YOUTUBE_API_KEY[:8]}..." if YOUTUBE_API_KEY else None
    }


@app.get("/api/youtube-search")
async def youtube_search(q: str, type: str = "video", maxResults: int = 10, order: str = "date"):
    """Search YouTube for videos (used by Civic Meeting Finder)"""
    if not YOUTUBE_API_KEY:
        print("[YouTube] No API key configured - returning error")
        return {
            "items": [],
            "error": "YouTube API key not configured. Set YOUTUBE_API_KEY environment variable.",
            "setup_help": "Go to console.cloud.google.com, enable YouTube Data API v3, and create an API key."
        }
    
    try:
        # Add civic meeting keywords to improve search results
        civic_keywords = "city council OR town meeting OR board meeting OR selectboard"
        enhanced_query = f"{q} {civic_keywords}"
        
        params = {
            "part": "snippet",
            "q": enhanced_query,
            "type": type,
            "maxResults": min(maxResults, 25),
            "order": order,
            "key": YOUTUBE_API_KEY,
            "relevanceLanguage": "en",
            "regionCode": "US"
        }
        
        print(f"[YouTube] Searching for: {q}")
        
        response = httpx.get(
            "https://www.googleapis.com/youtube/v3/search",
            params=params,
            timeout=15.0
        )
        
        if response.status_code == 200:
            data = response.json()
            print(f"[YouTube] Found {len(data.get('items', []))} results")
            return data
        elif response.status_code == 403:
            error_data = response.json()
            error_msg = error_data.get("error", {}).get("message", "API access denied")
            print(f"[YouTube] API Error 403: {error_msg}")
            return {
                "items": [],
                "error": f"YouTube API access denied: {error_msg}",
                "help": "Check that YouTube Data API v3 is enabled in your Google Cloud project."
            }
        elif response.status_code == 400:
            error_data = response.json()
            error_msg = error_data.get("error", {}).get("message", "Bad request")
            print(f"[YouTube] API Error 400: {error_msg}")
            return {"items": [], "error": f"Invalid request: {error_msg}"}
        else:
            print(f"[YouTube] Search error: {response.status_code} - {response.text[:200]}")
            return {"items": [], "error": f"Search failed with status {response.status_code}"}
            
    except httpx.TimeoutException:
        print("[YouTube] Request timed out")
        return {"items": [], "error": "Request timed out. Try again."}
    except Exception as e:
        print(f"[YouTube] Search exception: {e}")
        return {"items": [], "error": str(e)}


@app.get("/api/youtube-playlist")
async def youtube_playlist(playlistId: str, maxResults: int = 25):
    """Get videos from a YouTube playlist (used by Issue Tracker playlist feature)"""
    if not YOUTUBE_API_KEY:
        print("[YouTube] No API key configured for playlist")
        return {
            "items": [],
            "error": "YouTube API key not configured. Set YOUTUBE_API_KEY environment variable."
        }
    
    try:
        params = {
            "part": "snippet",
            "playlistId": playlistId,
            "maxResults": min(maxResults, 50),
            "key": YOUTUBE_API_KEY
        }
        
        print(f"[YouTube] Loading playlist: {playlistId}")
        
        response = httpx.get(
            "https://www.googleapis.com/youtube/v3/playlistItems",
            params=params,
            timeout=15.0
        )
        
        if response.status_code == 200:
            data = response.json()
            # Sort by date (newest first)
            if "items" in data:
                data["items"] = sorted(
                    data["items"],
                    key=lambda x: x.get("snippet", {}).get("publishedAt", ""),
                    reverse=True
                )
            print(f"[YouTube] Loaded {len(data.get('items', []))} playlist items")
            return data
        elif response.status_code == 404:
            return {"items": [], "error": "Playlist not found. Make sure it's a public playlist."}
        elif response.status_code == 403:
            error_data = response.json()
            error_msg = error_data.get("error", {}).get("message", "Access denied")
            return {"items": [], "error": f"Access denied: {error_msg}"}
        else:
            print(f"[YouTube] Playlist error: {response.status_code}")
            return {"items": [], "error": f"Failed to load playlist (status {response.status_code})"}
                
    except Exception as e:
        print(f"[YouTube] Playlist exception: {e}")
        return {"items": [], "error": str(e)}


# ============================================================================
# Relevant Documents Finder - AI-powered document search
# ============================================================================

@app.post("/api/find-relevant-documents")
async def find_relevant_documents(req: Request):
    """
    Use AI to find publicly available documents related to a meeting.
    Searches for agendas, minutes, proposals, RFPs, contracts, presentations, etc.
    """
    data = await req.json()
    video_title = data.get("video_title", "")
    transcript = data.get("transcript", "")
    entities = data.get("entities", [])
    
    if not video_title and not transcript:
        return {"documents": [], "error": "No meeting information provided"}
    
    print(f"[Documents] Finding relevant documents for: {video_title[:50]}...")
    
    try:
        # Step 1: Use AI to extract key search terms and document types to look for
        if OPENAI_API_KEY:
            # Build context from entities
            entity_names = [e.get("text", "") for e in entities[:20] if e.get("text")]
            entity_context = ", ".join(entity_names) if entity_names else ""
            
            # Extract a sample of the transcript for context
            transcript_sample = transcript[:2000] if transcript else ""
            
            prompt = f"""Analyze this civic meeting and suggest specific search queries to find related public documents.

Meeting Title: {video_title}

Key Entities/Topics: {entity_context}

Transcript Sample: {transcript_sample}

Based on this meeting, generate 4-6 specific search queries that would find:
1. The official meeting agenda or minutes
2. Any proposals, RFPs, or contracts mentioned
3. Related presentations or reports
4. Relevant city/town official documents

For each query, also identify what type of document it would find.

Respond in this exact JSON format (no markdown):
{{
  "organization": "Name of city/town/organization if identifiable",
  "meeting_date": "Date if mentioned (YYYY-MM-DD or null)",
  "searches": [
    {{"query": "specific search query", "doc_type": "agenda|minutes|proposal|contract|presentation|report|ordinance|resolution|budget|other", "description": "Brief description of what this would find"}}
  ]
}}"""

            response = openai_client.chat.completions.create(
                model="gpt-4o-mini",  # Use fast model for this
                messages=[
                    {"role": "system", "content": "You are an expert at finding public government documents. Generate specific, targeted search queries. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=800,
                temperature=0.3
            )
            
            ai_response = response.choices[0].message.content.strip()
            
            # Clean up response if needed
            if ai_response.startswith("```"):
                ai_response = ai_response.split("```")[1]
                if ai_response.startswith("json"):
                    ai_response = ai_response[4:]
            ai_response = ai_response.strip()
            
            try:
                search_data = json.loads(ai_response)
            except json.JSONDecodeError:
                # Fallback: generate basic searches from title
                search_data = {
                    "organization": "",
                    "meeting_date": None,
                    "searches": [
                        {"query": f"{video_title} agenda", "doc_type": "agenda", "description": "Meeting agenda"},
                        {"query": f"{video_title} minutes", "doc_type": "minutes", "description": "Meeting minutes"},
                    ]
                }
            
            print(f"[Documents] AI generated {len(search_data.get('searches', []))} search queries")
            
        else:
            # Fallback without AI - use simple keyword extraction
            search_data = {
                "organization": "",
                "meeting_date": None,
                "searches": [
                    {"query": f"{video_title} agenda PDF", "doc_type": "agenda", "description": "Meeting agenda"},
                    {"query": f"{video_title} minutes PDF", "doc_type": "minutes", "description": "Official minutes"},
                ]
            }
        
        # Step 2: Perform web searches for each query
        documents = []
        search_queries = search_data.get("searches", [])[:6]  # Limit to 6 searches
        
        for search_item in search_queries:
            query = search_item.get("query", "")
            doc_type = search_item.get("doc_type", "other")
            description = search_item.get("description", "")
            
            if not query:
                continue
            
            try:
                # Use DuckDuckGo for web search (no API key needed)
                search_url = f"https://html.duckduckgo.com/html/?q={quote(query + ' filetype:pdf OR site:.gov OR site:.org')}"
                
                headers = {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                }
                
                response = httpx.get(search_url, headers=headers, timeout=10.0, follow_redirects=True)
                
                if response.status_code == 200:
                    html = response.text
                    
                    # Parse results (simple regex extraction)
                    import re
                    
                    # Find result links
                    result_pattern = r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)</a>'
                    matches = re.findall(result_pattern, html)
                    
                    # Also try alternative pattern
                    if not matches:
                        result_pattern = r'<a[^>]*href="(https?://[^"]+)"[^>]*>([^<]{10,100})</a>'
                        matches = re.findall(result_pattern, html)
                    
                    for url, title in matches[:3]:  # Take top 3 results per query
                        # Skip internal DuckDuckGo links
                        if 'duckduckgo.com' in url:
                            continue
                        
                        # Clean URL (DuckDuckGo uses redirect URLs)
                        if 'uddg=' in url:
                            url_match = re.search(r'uddg=([^&]+)', url)
                            if url_match:
                                from urllib.parse import unquote
                                url = unquote(url_match.group(1))
                        
                        # Determine document type from URL/title
                        detected_type = doc_type
                        url_lower = url.lower()
                        title_lower = title.lower()
                        
                        if '.pdf' in url_lower:
                            if 'agenda' in url_lower or 'agenda' in title_lower:
                                detected_type = 'agenda'
                            elif 'minute' in url_lower or 'minute' in title_lower:
                                detected_type = 'minutes'
                            elif 'budget' in url_lower or 'budget' in title_lower:
                                detected_type = 'budget'
                            elif 'proposal' in url_lower or 'rfp' in url_lower:
                                detected_type = 'proposal'
                        
                        # Check if we already have this URL
                        if not any(d['url'] == url for d in documents):
                            documents.append({
                                "title": title.strip()[:100],
                                "url": url,
                                "type": detected_type,
                                "description": description,
                                "source": url.split('/')[2] if '/' in url else url,
                            })
                
            except Exception as e:
                print(f"[Documents] Search error for '{query}': {e}")
                continue
        
        # Step 3: Also search YouTube for related video content (presentations, etc.)
        if YOUTUBE_API_KEY and video_title:
            try:
                # Extract org name from title for better search
                org_search = search_data.get("organization", "") or video_title.split()[0:3]
                if isinstance(org_search, list):
                    org_search = " ".join(org_search)
                
                yt_params = {
                    "part": "snippet",
                    "q": f"{org_search} presentation OR budget OR proposal",
                    "type": "video",
                    "maxResults": 3,
                    "key": YOUTUBE_API_KEY
                }
                
                yt_response = httpx.get(
                    "https://www.googleapis.com/youtube/v3/search",
                    params=yt_params,
                    timeout=10.0
                )
                
                if yt_response.status_code == 200:
                    yt_data = yt_response.json()
                    for item in yt_data.get("items", [])[:2]:
                        vid_id = item.get("id", {}).get("videoId")
                        snippet = item.get("snippet", {})
                        if vid_id:
                            documents.append({
                                "title": snippet.get("title", "")[:100],
                                "url": f"https://www.youtube.com/watch?v={vid_id}",
                                "type": "presentation",
                                "description": "Related video content",
                                "source": "YouTube",
                                "thumbnail": snippet.get("thumbnails", {}).get("default", {}).get("url")
                            })
            except Exception as e:
                print(f"[Documents] YouTube search error: {e}")
        
        # Deduplicate and limit results
        seen_urls = set()
        unique_docs = []
        for doc in documents:
            if doc['url'] not in seen_urls:
                seen_urls.add(doc['url'])
                unique_docs.append(doc)
        
        print(f"[Documents] Found {len(unique_docs)} relevant documents")
        
        return {
            "documents": unique_docs[:12],  # Limit to 12 results
            "organization": search_data.get("organization", ""),
            "meeting_date": search_data.get("meeting_date"),
            "searches_performed": len(search_queries)
        }
        
    except Exception as e:
        print(f"[Documents] Error: {e}")
        import traceback
        traceback.print_exc()
        return {"documents": [], "error": str(e)}


@app.post("/api/analytics/extended")
async def get_extended_analytics(req: Request):
    """Extended analytics with IMPROVED entity extraction"""
    data = await req.json()
    request_data = data.get("transcript", data)

    if not isinstance(request_data, dict) or "transcript" not in request_data:
        request_data = data

    transcript_text = clean_text(request_data.get("transcript", ""))
    model = request_data.get("model", "gpt-4o")

    if not transcript_text:
        return {
            "questionStatementRatio": {"questions": 0, "statements": 0, "ratio": 0},
            "sentimentTimeline": [],
            "topEntities": [],
        }

    sentences = transcript_text.split(". ")

    questions_count = sum(1 for s in sentences if s.strip().endswith("?"))
    statements_count = len(sentences) - questions_count

    sentiment_timeline = []
    for i in range(0, len(sentences), 10):
        if i < len(sentences):
            try:
                blob = TextBlob(sentences[i])
                sentiment_timeline.append(
                    {
                        "index": i,
                        "sentiment": blob.sentiment.polarity,
                        "text_preview": sentences[i][:50],
                    }
                )
            except:
                pass

    top_entities = await get_ai_entities_improved(transcript_text, model)

    return {
        "questionStatementRatio": {
            "questions": questions_count,
            "statements": statements_count,
            "ratio": (
                questions_count / (questions_count + statements_count)
                if (questions_count + statements_count) > 0
                else 0
            ),
        },
        "sentimentTimeline": sentiment_timeline[:30],
        "topEntities": top_entities,
    }


# NEW: Policy Impact Tracker endpoint
@app.post("/api/analytics/policy_impact")
async def get_policy_impact(req: Request):
    """Analyze which policy areas were discussed"""
    data = await req.json()
    transcript = clean_text(data.get("transcript", ""))

    if not transcript:
        return {"policy_areas": []}

    policy_categories = {
        "Housing & Development": [
            "housing",
            "affordable",
            "development",
            "zoning",
            "residential",
            "construction",
        ],
        "Budget & Finance": [
            "budget",
            "funding",
            "revenue",
            "cost",
            "expense",
            "fiscal",
            "financial",
        ],
        "Public Safety": ["police", "fire", "emergency", "safety", "crime", "security"],
        "Transportation": [
            "traffic",
            "parking",
            "transit",
            "bus",
            "transportation",
            "road",
        ],
        "Education": ["school", "education", "student", "teacher", "learning"],
        "Environment": [
            "environment",
            "green",
            "climate",
            "sustainability",
            "pollution",
            "recycling",
        ],
        "Health & Wellness": ["health", "wellness", "medical", "hospital", "clinic"],
        "Parks & Recreation": [
            "park",
            "recreation",
            "playground",
            "sports",
            "community center",
        ],
    }

    transcript_lower = transcript.lower()
    results = []

    for category, keywords in policy_categories.items():
        mentions = 0
        for keyword in keywords:
            mentions += len(re.findall(rf"\b{keyword}\b", transcript_lower))

        if mentions > 0:
            results.append({"category": category, "mentions": mentions})

    results.sort(key=lambda x: x["mentions"], reverse=True)

    return {"policy_areas": results}


# NEW: Cross-Reference Network endpoint
@app.post("/api/analytics/cross_references")
async def get_cross_references(req: Request):
    """Find relationships between entities"""
    data = await req.json()
    transcript = clean_text(data.get("transcript", ""))
    entities = data.get("entities", [])

    if not transcript or not entities:
        return {"connections": []}

    # Create entity pairs that appear in same sentences
    sentences = transcript.split(".")
    connections = defaultdict(int)

    for sent in sentences:
        sent_lower = sent.lower()
        found_entities = [e for e in entities if e["text"].lower() in sent_lower]

        # Create connections between entities in same sentence
        for i, entity1 in enumerate(found_entities):
            for entity2 in found_entities[i + 1 :]:
                pair = tuple(sorted([entity1["text"], entity2["text"]]))
                connections[pair] += 1

    # Format results
    results = []
    for (entity1, entity2), count in sorted(
        connections.items(), key=lambda x: x[1], reverse=True
    )[:20]:
        results.append({"source": entity1, "target": entity2, "strength": count})

    return {"connections": results}


# NEW: Action Items Timeline endpoint
@app.post("/api/analytics/action_items")
async def get_action_items(req: Request):
    """Extract action items with potential dates"""
    data = await req.json()
    transcript = clean_text(data.get("transcript", ""))

    if not transcript:
        return {"action_items": []}

    # Action item indicators
    action_keywords = [
        "will",
        "should",
        "must",
        "need to",
        "have to",
        "going to",
        "plan to",
        "intend to",
        "commit to",
        "agree to",
        "vote to",
        "approve",
        "authorize",
        "direct",
        "request",
        "require",
    ]

    # Date patterns
    date_pattern = r"\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b"

    sentences = transcript.split(".")
    action_items = []

    for sent in sentences:
        sent_lower = sent.lower()

        # Check if sentence contains action keywords
        has_action = any(keyword in sent_lower for keyword in action_keywords)

        if has_action and len(sent.strip()) > 20:
            # Look for dates
            dates = re.findall(date_pattern, sent_lower, re.IGNORECASE)

            action_items.append(
                {
                    "text": sent.strip()[:200],
                    "date": dates[0] if dates else "No date specified",
                    "priority": (
                        "high"
                        if any(
                            word in sent_lower for word in ["must", "require", "urgent"]
                        )
                        else "normal"
                    ),
                }
            )

    # Limit to top 20 action items
    return {"action_items": action_items[:20]}


# NEW: Budget Impact Tracker endpoint
@app.post("/api/analytics/budget_impact")
async def get_budget_impact(req: Request):
    """Extract all dollar amounts and categorize them"""
    data = await req.json()
    transcript = clean_text(data.get("transcript", ""))

    if not transcript:
        return {"budget_items": []}

    # Dollar amount patterns
    dollar_patterns = [
        r"\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:million|mil|m)\b",  # $5 million
        r"\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:billion|bil|b)\b",  # $2 billion
        r"\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)",  # Regular dollars
    ]

    budget_items = []
    sentences = transcript.split(".")

    for sent in sentences:
        sent_lower = sent.lower()

        # Check for millions
        millions = re.findall(dollar_patterns[0], sent, re.IGNORECASE)
        for amount in millions:
            amount_clean = amount.replace(",", "")
            value = float(amount_clean) * 1_000_000
            category = categorize_budget_item(sent_lower)
            budget_items.append(
                {
                    "amount": value,
                    "display": f"${amount_clean}M",
                    "category": category,
                    "context": sent.strip()[:100],
                }
            )

        # Check for billions
        billions = re.findall(dollar_patterns[1], sent, re.IGNORECASE)
        for amount in billions:
            amount_clean = amount.replace(",", "")
            value = float(amount_clean) * 1_000_000_000
            category = categorize_budget_item(sent_lower)
            budget_items.append(
                {
                    "amount": value,
                    "display": f"${amount_clean}B",
                    "category": category,
                    "context": sent.strip()[:100],
                }
            )

        # Check for thousands
        thousands = re.findall(dollar_patterns[0], sent, re.IGNORECASE)
        for amount in thousands:
            amount_clean = amount.replace(",", "")
            value = float(amount_clean) * 1_000
            category = categorize_budget_item(sent_lower)
            budget_items.append(
                {
                    "amount": value,
                    "display": f"${amount_clean}K",
                    "category": category,
                    "context": sent.strip()[:100],
                }
            )

        # Check for regular dollars (only if > $1000)
        regular = re.findall(dollar_patterns[2], sent, re.IGNORECASE)
        for amount in regular:
            amount_clean = amount.replace(",", "")
            try:
                value = float(amount_clean)
                if value >= 1000:  # Only include amounts over $1000
                    category = categorize_budget_item(sent_lower)
                    budget_items.append(
                        {
                            "amount": value,
                            "display": f"${amount_clean:,.0f}",
                            "category": category,
                            "context": sent.strip()[:100],
                        }
                    )
            except:
                pass

    # Sort by amount descending
    budget_items.sort(key=lambda x: x["amount"], reverse=True)

    return {"budget_items": budget_items[:20]}  # Top 20 items


def categorize_budget_item(text):
    """Categorize budget items by keywords"""
    categories = {
        "Capital Projects": [
            "construction",
            "building",
            "infrastructure",
            "facility",
            "renovation",
            "capital",
        ],
        "Salaries & Personnel": [
            "salary",
            "salaries",
            "personnel",
            "employee",
            "staff",
            "wages",
            "compensation",
        ],
        "Public Safety": ["police", "fire", "emergency", "safety"],
        "Education": ["school", "education", "teacher", "student"],
        "Services": ["service", "program", "maintenance", "operation"],
        "Transportation": ["road", "street", "transit", "transportation", "parking"],
        "Other": [],
    }

    for category, keywords in categories.items():
        if any(keyword in text for keyword in keywords):
            return category

    return "Other"


# NEW: Meeting Efficiency Dashboard endpoint
@app.post("/api/analytics/meeting_efficiency")
async def get_meeting_efficiency(req: Request):
    """Analyze meeting efficiency metrics"""
    data = await req.json()
    transcript = clean_text(data.get("transcript", ""))
    duration_seconds = data.get("duration", 0)

    if not transcript:
        return {
            "decisions_per_hour": 0,
            "procedural_time_percent": 0,
            "substantive_time_percent": 0,
            "off_topic_count": 0,
            "efficiency_score": 0,
        }

    sentences = transcript.split(".")

    # Count decisions
    decision_keywords = [
        "approved",
        "rejected",
        "passed",
        "failed",
        "voted",
        "motion",
        "adopted",
        "denied",
    ]
    decisions = sum(
        1 for sent in sentences if any(kw in sent.lower() for kw in decision_keywords)
    )

    # Estimate procedural vs substantive
    procedural_keywords = [
        "motion to",
        "second",
        "roll call",
        "adjourn",
        "recess",
        "quorum",
        "minutes",
        "agenda",
    ]
    procedural_sentences = sum(
        1 for sent in sentences if any(kw in sent.lower() for kw in procedural_keywords)
    )

    total_sentences = len(sentences)
    procedural_percent = (
        (procedural_sentences / total_sentences * 100) if total_sentences > 0 else 0
    )
    substantive_percent = 100 - procedural_percent

    # Detect off-topic diversions
    off_topic_keywords = [
        "by the way",
        "speaking of",
        "remind me",
        "off topic",
        "side note",
        "tangent",
    ]
    off_topic_count = sum(
        1 for sent in sentences if any(kw in sent.lower() for kw in off_topic_keywords)
    )

    # Calculate decisions per hour
    duration_hours = duration_seconds / 3600 if duration_seconds > 0 else 1
    decisions_per_hour = decisions / duration_hours

    # Efficiency score (0-100)
    efficiency_score = min(
        100,
        (
            (decisions_per_hour * 10)  # More decisions = better
            + (substantive_percent * 0.5)  # More substantive = better
            + (-off_topic_count * 2)  # Fewer diversions = better
        ),
    )
    efficiency_score = max(0, efficiency_score)

    return {
        "decisions_per_hour": round(decisions_per_hour, 1),
        "procedural_time_percent": round(procedural_percent, 1),
        "substantive_time_percent": round(substantive_percent, 1),
        "off_topic_count": off_topic_count,
        "efficiency_score": round(efficiency_score, 1),
        "total_decisions": decisions,
    }


# Video processing endpoints

# ============================================================================
# VIDEO EDITING ENHANCEMENT FUNCTIONS
# ============================================================================

def get_video_info(video_path):
    """Get video dimensions, duration, fps using ffprobe"""
    try:
        cmd = [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration",
            "-show_entries", "format=duration",
            "-of", "json",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0:
            import json
            data = json.loads(result.stdout)
            stream = data.get('streams', [{}])[0]
            format_info = data.get('format', {})
            
            width = stream.get('width', 1920)
            height = stream.get('height', 1080)
            
            # Parse frame rate (could be "30/1" or "29.97")
            fps_str = stream.get('r_frame_rate', '30/1')
            if '/' in fps_str:
                num, den = fps_str.split('/')
                fps = float(num) / float(den) if float(den) != 0 else 30
            else:
                fps = float(fps_str)
            
            duration = float(stream.get('duration', 0) or format_info.get('duration', 0))
            
            return {
                'width': width,
                'height': height,
                'fps': fps,
                'duration': duration,
                'aspect_ratio': width / height if height > 0 else 16/9
            }
    except Exception as e:
        print(f"[video_info] Error getting video info: {e}")
    
    return {'width': 1920, 'height': 1080, 'fps': 30, 'duration': 0, 'aspect_ratio': 16/9}


def get_responsive_text_sizes(video_height, video_width):
    """Calculate responsive font sizes based on video resolution
    
    Designed to be readable across all video sizes:
    - 480p: Smaller but readable
    - 720p: Good standard size
    - 1080p: Large clear text
    - 4K: Very large text
    """
    # Use the smaller dimension to ensure text fits
    min_dimension = min(video_height, video_width)
    
    # Calculate scale factor based on minimum dimension
    # Base is 720 (HD ready) - scales up and down from there
    base_dimension = 720
    scale_factor = min_dimension / base_dimension
    
    # For very small videos (under 480p), use minimum readable sizes
    # For very large videos (4K+), cap sizes to avoid overwhelming
    scale_factor = max(0.7, min(2.5, scale_factor))
    
    # Base sizes optimized for 720p, will scale proportionally
    # These are LARGER for better readability in highlight reels
    base_title = 42  # Increased from 32
    base_caption = 32  # Increased from 24
    base_lower_third = 26  # Increased from 20
    base_watermark = 16  # Increased from 14
    
    return {
        'title': max(24, min(96, int(base_title * scale_factor))),
        'caption': max(18, min(72, int(base_caption * scale_factor))),
        'lower_third': max(16, min(60, int(base_lower_third * scale_factor))),
        'watermark': max(12, min(40, int(base_watermark * scale_factor))),
        'max_chars_horizontal': max(35, min(80, int(55 * scale_factor))),
        'max_chars_vertical': max(20, min(45, int(35 * scale_factor)))
    }


def detect_hardware_acceleration():
    """Detect available hardware acceleration"""
    hw_accel = {'encoder': 'libx264', 'decoder': None, 'available': []}
    
    try:
        # Check for available encoders
        result = subprocess.run(['ffmpeg', '-encoders'], capture_output=True, text=True, timeout=10)
        encoders = result.stdout
        
        # macOS VideoToolbox (best for Mac)
        if 'h264_videotoolbox' in encoders:
            hw_accel['encoder'] = 'h264_videotoolbox'
            hw_accel['available'].append('videotoolbox')
            hw_accel['decoder'] = 'h264'
        
        # NVIDIA NVENC
        elif 'h264_nvenc' in encoders:
            hw_accel['encoder'] = 'h264_nvenc'
            hw_accel['available'].append('nvenc')
            hw_accel['decoder'] = 'h264_cuvid'
        
        # Intel QuickSync
        elif 'h264_qsv' in encoders:
            hw_accel['encoder'] = 'h264_qsv'
            hw_accel['available'].append('qsv')
            hw_accel['decoder'] = 'h264_qsv'
        
        # AMD AMF (Windows)
        elif 'h264_amf' in encoders:
            hw_accel['encoder'] = 'h264_amf'
            hw_accel['available'].append('amf')
        
        # VA-API (Linux)
        elif 'h264_vaapi' in encoders:
            hw_accel['encoder'] = 'h264_vaapi'
            hw_accel['available'].append('vaapi')
        
        print(f"[hw_accel] Detected: {hw_accel['encoder']} (available: {hw_accel['available']})")
    except Exception as e:
        print(f"[hw_accel] Detection failed: {e}, using libx264")
    
    return hw_accel


def create_fade_filter(fade_type, duration=0.5, start_time=0):
    """Create fade in/out filter for video and audio"""
    if fade_type == 'in':
        return f"fade=t=in:st={start_time}:d={duration}"
    elif fade_type == 'out':
        return f"fade=t=out:st={start_time}:d={duration}"
    return None


def create_audio_fade_filter(fade_type, duration=0.5, start_time=0):
    """Create audio fade in/out filter"""
    if fade_type == 'in':
        return f"afade=t=in:st={start_time}:d={duration}"
    elif fade_type == 'out':
        return f"afade=t=out:st={start_time}:d={duration}"
    return None


def create_crossfade_command(clip1_path, clip2_path, output_path, duration=0.5, hw_encoder='libx264'):
    """Create FFmpeg command for crossfade between two clips"""
    cmd = [
        "ffmpeg",
        "-i", clip1_path,
        "-i", clip2_path,
        "-filter_complex",
        f"[0:v][1:v]xfade=transition=fade:duration={duration}:offset=0[v];"
        f"[0:a][1:a]acrossfade=d={duration}[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", hw_encoder, "-preset", "fast",
        "-c:a", "aac",
        output_path, "-y"
    ]
    return cmd


def create_color_filter(filter_type):
    """Create color grading filter"""
    filters = {
        'none': None,
        'vintage': 'curves=vintage',
        'warm': 'colortemperature=temperature=6500',
        'cool': 'colortemperature=temperature=8500',
        'high_contrast': 'eq=contrast=1.3:brightness=0.05:saturation=1.2',
        'low_contrast': 'eq=contrast=0.8:saturation=0.9',
        'bw': 'colorchannelmixer=.3:.4:.3:0:.3:.4:.3:0:.3:.4:.3',
        'sepia': 'colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131',
        'vibrant': 'eq=saturation=1.5:contrast=1.1',
        'cinematic': 'curves=preset=cross_process,eq=contrast=1.1:brightness=-0.05'
    }
    return filters.get(filter_type, None)


def create_watermark_filter(watermark_path, position='bottom_right', opacity=0.7, scale=0.1):
    """Create watermark overlay filter"""
    positions = {
        'top_left': 'x=10:y=10',
        'top_right': 'x=W-w-10:y=10',
        'bottom_left': 'x=10:y=H-h-10',
        'bottom_right': 'x=W-w-10:y=H-h-10',
        'center': 'x=(W-w)/2:y=(H-h)/2'
    }
    pos = positions.get(position, positions['bottom_right'])
    # Scale watermark relative to video width
    return f"[1:v]format=rgba,colorchannelmixer=aa={opacity},scale=iw*{scale}:-1[wm];[0:v][wm]overlay={pos}"


def create_lower_third_filter(name, title, video_width, video_height, duration=5, fontsize=20):
    """Create animated lower third name bar"""
    bar_height = int(video_height * 0.08)
    y_pos = int(video_height * 0.75)
    
    # Escape text for FFmpeg
    name_escaped = name.replace("'", "\\'").replace(":", "\\:")
    title_escaped = title.replace("'", "\\'").replace(":", "\\:") if title else ""
    
    filters = []
    # Background bar with fade in
    filters.append(f"drawbox=x=0:y={y_pos}:w={video_width}:h={bar_height}:color=black@0.7:t=fill:enable='between(t,0,{duration})'")
    # Name text
    filters.append(f"drawtext=text='{name_escaped}':fontsize={fontsize}:fontcolor=white:x=20:y={y_pos + 10}:enable='between(t,0,{duration})'")
    # Title text (smaller, below name)
    if title:
        filters.append(f"drawtext=text='{title_escaped}':fontsize={int(fontsize*0.7)}:fontcolor=gray:x=20:y={y_pos + 10 + fontsize + 5}:enable='between(t,0,{duration})'")
    
    return filters


def create_intro_slide(work_dir, title, subtitle, duration=3, width=1920, height=1080, bg_color='0x1e7f63'):
    """Create an intro title slide"""
    output = os.path.join(work_dir, "intro_slide.mp4")
    
    # Escape text
    title_escaped = title.replace("'", "\\'").replace(":", "\\:")
    subtitle_escaped = subtitle.replace("'", "\\'").replace(":", "\\:") if subtitle else ""
    
    # Calculate font sizes based on resolution
    title_size = int(height / 15)
    subtitle_size = int(height / 25)
    
    filter_complex = f"color=c={bg_color}:s={width}x{height}:d={duration}"
    filter_complex += f",drawtext=text='{title_escaped}':fontsize={title_size}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-{title_size}"
    if subtitle:
        filter_complex += f",drawtext=text='{subtitle_escaped}':fontsize={subtitle_size}:fontcolor=white@0.8:x=(w-text_w)/2:y=(h-text_h)/2+{subtitle_size}"
    # Add fade in/out
    filter_complex += f",fade=t=in:st=0:d=0.5,fade=t=out:st={duration-0.5}:d=0.5"
    
    cmd = [
        "ffmpeg",
        "-f", "lavfi",
        "-i", f"anullsrc=r=44100:cl=stereo:d={duration}",
        "-f", "lavfi", 
        "-i", filter_complex,
        "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        output, "-y"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and os.path.exists(output):
            return output
        print(f"[intro] Error: {result.stderr[:300]}")
    except Exception as e:
        print(f"[intro] Failed to create intro: {e}")
    return None


def create_outro_slide(work_dir, title, cta_text, duration=4, width=1920, height=1080, bg_color='0x1e7f63'):
    """Create an outro/call-to-action slide"""
    output = os.path.join(work_dir, "outro_slide.mp4")
    
    title_escaped = title.replace("'", "\\'").replace(":", "\\:")
    cta_escaped = cta_text.replace("'", "\\'").replace(":", "\\:") if cta_text else ""
    
    title_size = int(height / 18)
    cta_size = int(height / 22)
    
    filter_complex = f"color=c={bg_color}:s={width}x{height}:d={duration}"
    filter_complex += f",drawtext=text='{title_escaped}':fontsize={title_size}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2-{title_size}"
    if cta_text:
        filter_complex += f",drawtext=text='{cta_escaped}':fontsize={cta_size}:fontcolor=yellow:x=(w-text_w)/2:y=(h-text_h)/2+{cta_size}"
    filter_complex += f",fade=t=in:st=0:d=0.5,fade=t=out:st={duration-0.5}:d=0.5"
    
    cmd = [
        "ffmpeg",
        "-f", "lavfi",
        "-i", f"anullsrc=r=44100:cl=stereo:d={duration}",
        "-f", "lavfi",
        "-i", filter_complex,
        "-c:v", "libx264", "-preset", "fast", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-shortest",
        output, "-y"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        if result.returncode == 0 and os.path.exists(output):
            return output
    except Exception as e:
        print(f"[outro] Failed to create outro: {e}")
    return None


def normalize_audio(input_path, output_path, target_loudness=-16):
    """Normalize audio to consistent loudness using loudnorm filter"""
    cmd = [
        "ffmpeg", "-i", input_path,
        "-af", f"loudnorm=I={target_loudness}:TP=-1.5:LRA=11",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        output_path, "-y"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        print(f"[audio_norm] Failed: {e}")
        return False


def add_background_music(video_path, music_path, output_path, music_volume=0.15, duck_volume=0.3):
    """Add background music with ducking (lower music when speech detected)"""
    # Use sidechaincompress to duck music when there's speech
    cmd = [
        "ffmpeg",
        "-i", video_path,
        "-i", music_path,
        "-filter_complex",
        f"[1:a]volume={music_volume}[music];"
        f"[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]",
        "-map", "0:v", "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        "-shortest",
        output_path, "-y"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        print(f"[bg_music] Failed: {e}")
        return False


def generate_thumbnail(video_path, output_path, timestamp=None):
    """Generate thumbnail from video - picks frame at 1/3 duration or specified timestamp"""
    try:
        # Get video duration if timestamp not specified
        if timestamp is None:
            info = get_video_info(video_path)
            timestamp = info['duration'] / 3 if info['duration'] > 0 else 1
        
        cmd = [
            "ffmpeg",
            "-ss", str(timestamp),
            "-i", video_path,
            "-vframes", "1",
            "-q:v", "2",
            output_path, "-y"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        print(f"[thumbnail] Failed: {e}")
        return False


def apply_speed_effect(input_path, output_path, speed=1.0, hw_encoder='libx264'):
    """Apply speed change to video (0.5 = slow-mo, 2.0 = fast forward)"""
    if speed == 1.0:
        return False  # No change needed
    
    # PTS for video, atempo for audio (atempo only supports 0.5-2.0)
    video_pts = 1.0 / speed
    
    # Chain atempo filters if speed is outside 0.5-2.0 range
    if speed > 2.0:
        audio_filter = "atempo=2.0,atempo=" + str(speed/2.0)
    elif speed < 0.5:
        audio_filter = "atempo=0.5,atempo=" + str(speed/0.5)
    else:
        audio_filter = f"atempo={speed}"
    
    cmd = [
        "ffmpeg", "-i", input_path,
        "-filter_complex",
        f"[0:v]setpts={video_pts}*PTS[v];[0:a]{audio_filter}[a]",
        "-map", "[v]", "-map", "[a]",
        "-c:v", hw_encoder, "-preset", "fast",
        "-c:a", "aac",
        output_path, "-y"
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        print(f"[speed] Failed: {e}")
        return False


def create_chapter_markers(clips, output_path):
    """Create chapter metadata file for video"""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            f.write(";FFMETADATA1\n")
            current_time = 0
            for i, clip in enumerate(clips):
                duration = clip.get('end', 0) - clip.get('start', 0)
                title = clip.get('highlight', f'Clip {i+1}')[:50]
                start_ms = int(current_time * 1000)
                end_ms = int((current_time + duration) * 1000)
                
                f.write(f"\n[CHAPTER]\nTIMEBASE=1/1000\n")
                f.write(f"START={start_ms}\n")
                f.write(f"END={end_ms}\n")
                f.write(f"title={title}\n")
                
                current_time += duration
        return True
    except Exception as e:
        print(f"[chapters] Failed: {e}")
        return False


def generate_upbeat_background_music(output_path, duration_seconds):
    """Generate background music using a simple, proven FFmpeg approach.
    Creates a pleasant sine wave chord that definitely works.
    """
    try:
        duration = int(duration_seconds) + 1
        
        # Use a single filter_complex with aevalsrc which is more reliable
        # Creates a C major chord (C-E-G) with slight modulation for interest
        # This approach is simpler and more compatible
        filter_expr = (
            f"aevalsrc="
            f"'0.3*sin(261.63*2*PI*t)"  # C4
            f"+0.25*sin(329.63*2*PI*t)"  # E4  
            f"+0.2*sin(392.00*2*PI*t)"   # G4
            f"+0.15*sin(523.25*2*PI*t)"  # C5 (octave)
            f"+0.1*sin(261.63*2*PI*t)*sin(4*PI*t)'"  # Tremolo for rhythm
            f":c=stereo:s=44100:d={duration}"
        )
        
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi",
            "-i", filter_expr,
            "-af", f"afade=t=in:st=0:d=2,afade=t=out:st={max(0, duration-3)}:d=3,volume=1.5",
            "-c:a", "aac",
            "-b:a", "128k",
            output_path
        ]
        
        print(f"[bg_music] Generating {duration}s music track...")
        print(f"[bg_music] Command: {' '.join(cmd[:10])}...")
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        
        if result.returncode == 0 and os.path.exists(output_path):
            file_size = os.path.getsize(output_path)
            print(f"[bg_music] Generated music: {file_size} bytes")
            if file_size > 500:
                return True
            else:
                print(f"[bg_music] File too small, generation failed")
                return False
        else:
            print(f"[bg_music] FFmpeg failed: {result.stderr[:400] if result.stderr else 'no error'}")
            print(f"[bg_music] Return code: {result.returncode}")
            return False
            
    except Exception as e:
        print(f"[bg_music] Exception: {type(e).__name__}: {e}")
        return False


def add_upbeat_background_music(video_path, output_path, music_volume=0.5):
    """Add background music to video. Uses higher default volume (0.5) to ensure audibility."""
    try:
        # Get video info
        info = get_video_info(video_path)
        duration = info.get('duration', 0)
        
        if duration <= 0:
            print("[bg_music] Cannot determine video duration")
            return False
        
        print(f"[bg_music] Video duration: {duration:.1f}s, music volume: {music_volume}")
        
        # Generate music file
        work_dir = os.path.dirname(output_path)
        music_path = os.path.join(work_dir, f"music_{int(time.time())}.aac")
        
        if not generate_upbeat_background_music(music_path, duration + 2):
            print("[bg_music] Failed to generate music")
            return False
        
        if not os.path.exists(music_path):
            print("[bg_music] Music file doesn't exist")
            return False
        
        # Simpler FFmpeg command to mix audio
        # Using amerge instead of amix for more reliable results
        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", music_path,
            "-filter_complex",
            f"[1:a]volume={music_volume}[m];[0:a][m]amerge=inputs=2,pan=stereo|c0<c0+c2|c1<c1+c3[a]",
            "-map", "0:v",
            "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "192k",
            "-shortest",
            output_path
        ]
        
        print(f"[bg_music] Mixing music into video...")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        # Cleanup
        if os.path.exists(music_path):
            os.remove(music_path)
        
        if result.returncode == 0 and os.path.exists(output_path):
            size = os.path.getsize(output_path)
            print(f"[bg_music] SUCCESS! Output: {size} bytes")
            return True
        else:
            print(f"[bg_music] Mix failed: {result.stderr[:300] if result.stderr else 'unknown'}")
            
            # Try simpler fallback - just use amix
            print("[bg_music] Trying fallback method...")
            if not generate_upbeat_background_music(music_path, duration + 2):
                return False
                
            cmd2 = [
                "ffmpeg", "-y",
                "-i", video_path,
                "-i", music_path,
                "-filter_complex",
                f"[0:a]volume=1.0[v];[1:a]volume={music_volume}[m];[v][m]amix=inputs=2:duration=first[a]",
                "-map", "0:v",
                "-map", "[a]",
                "-c:v", "copy",
                "-c:a", "aac",
                "-shortest",
                output_path
            ]
            
            result2 = subprocess.run(cmd2, capture_output=True, text=True, timeout=300)
            
            if os.path.exists(music_path):
                os.remove(music_path)
                
            if result2.returncode == 0 and os.path.exists(output_path):
                print(f"[bg_music] Fallback SUCCESS!")
                return True
            else:
                print(f"[bg_music] Fallback also failed: {result2.stderr[:200] if result2.stderr else 'unknown'}")
                return False
                
    except Exception as e:
        print(f"[bg_music] Exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False
            
    except Exception as e:
        print(f"[bg_music] Exception: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False


def add_logo_watermark(video_path, output_path, logo_path=None, position='bottom_right', opacity=0.7, scale=0.15):
    """Add logo watermark overlay to video.
    
    Args:
        video_path: Input video path
        output_path: Output video path
        logo_path: Path to logo image (defaults to logo.png in script directory)
        position: One of 'top_left', 'top_right', 'bottom_left', 'bottom_right', 'center'
        opacity: Logo opacity (0-1)
        scale: Logo scale relative to video width
    """
    try:
        # Find logo file - check script directory first, then common locations
        if logo_path is None:
            script_dir = os.path.dirname(os.path.abspath(__file__))
            possible_paths = [
                os.path.join(script_dir, 'logo.png'),
                os.path.join(script_dir, '..', 'logo.png'),
                os.path.join(script_dir, 'static', 'logo.png'),
                os.path.join(script_dir, '..', 'static', 'logo.png'),
                '/app/logo.png',  # Cloud deployment
            ]
            for path in possible_paths:
                if os.path.exists(path):
                    logo_path = path
                    break
        
        if not logo_path or not os.path.exists(logo_path):
            print("[watermark] Logo file not found, skipping watermark")
            return False
        
        # Get video dimensions for positioning
        info = get_video_info(video_path)
        w, h = info['width'], info['height']
        
        # Calculate position
        padding = int(min(w, h) * 0.02)  # 2% padding from edges
        
        if position == 'top_left':
            x_expr = str(padding)
            y_expr = str(padding)
        elif position == 'top_right':
            x_expr = f"W-w-{padding}"
            y_expr = str(padding)
        elif position == 'bottom_left':
            x_expr = str(padding)
            y_expr = f"H-h-{padding}"
        elif position == 'center':
            x_expr = "(W-w)/2"
            y_expr = "(H-h)/2"
        else:  # bottom_right (default)
            x_expr = f"W-w-{padding}"
            y_expr = f"H-h-{padding}"
        
        # Build filter: scale logo, apply opacity, overlay
        logo_width = int(w * scale)
        filter_str = (
            f"[1:v]scale={logo_width}:-1,format=rgba,"
            f"colorchannelmixer=aa={opacity}[logo];"
            f"[0:v][logo]overlay={x_expr}:{y_expr}[out]"
        )
        
        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-i", logo_path,
            "-filter_complex", filter_str,
            "-map", "[out]", "-map", "0:a?",
            "-c:v", "libx264", "-preset", "fast",
            "-c:a", "copy",
            output_path, "-y"
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        
        if result.returncode == 0 and os.path.exists(output_path):
            print(f"[watermark] Added logo watermark at {position}")
            return True
        else:
            print(f"[watermark] FFmpeg error: {result.stderr[:200]}")
            return False
    except Exception as e:
        print(f"[watermark] Failed: {e}")
        return False


# Global hardware acceleration cache
_HW_ACCEL_CACHE = None

def get_hw_encoder():
    """Get cached hardware encoder"""
    global _HW_ACCEL_CACHE
    if _HW_ACCEL_CACHE is None:
        _HW_ACCEL_CACHE = detect_hardware_acceleration()
    return _HW_ACCEL_CACHE['encoder']


def download_video_segment(vid, start, end, output_path, padding=5):
    """Download a specific segment of a video using yt-dlp's download-sections"""
    start_padded = max(0, start - padding)
    end_padded = end + padding
    section = f"*{start_padded}-{end_padded}"
    
    cmd = [
        "yt-dlp",
        "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
        "--download-sections", section,
        "--force-keyframes-at-cuts",
        "-o", output_path,
        f"https://www.youtube.com/watch?v={vid}"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        print(f"[segment_download] Failed: {e}")
        return False


def simple_job(job_id, vid, clips, format_type="combined", captions_enabled=True, transcript_data=None,
               video_options=None):
    """Process video clips into various output formats with optional captions and editing features
    
    Args:
        job_id: Unique job identifier
        vid: YouTube video ID
        clips: List of clip dictionaries with start, end, highlight
        format_type: 'combined', 'social', or 'individual'
        captions_enabled: Whether to burn in captions
        transcript_data: Transcript segments for captions
        video_options: Dict with optional editing features:
            - transitions: bool - Add fade transitions between clips
            - transition_duration: float - Duration of transitions (default 0.5s)
            - color_filter: str - Color filter to apply (vintage, warm, cool, bw, sepia, etc.)
            - normalize_audio: bool - Normalize audio levels
            - intro_title: str - Title for intro slide
            - intro_subtitle: str - Subtitle for intro slide
            - outro_title: str - Title for outro slide  
            - outro_cta: str - Call-to-action text for outro
            - background_music: bool - Add upbeat background music
            - logo_watermark: bool - Add logo watermark to clips
            - use_hw_accel: bool - Use hardware acceleration if available
    """
    job = JOBS[job_id]
    job["status"] = "running"
    job["percent"] = 5
    job["message"] = "Preparing video download..."
    
    # Default video options
    opts = video_options or {}
    
    # Extract options - no longer using disable_all master toggle
    use_transitions = opts.get('transitions', False)
    transition_duration = opts.get('transition_duration', 0.5)
    color_filter = opts.get('colorFilter', opts.get('color_filter', 'none'))
    do_background_music = opts.get('backgroundMusic', False)
    do_logo_watermark = opts.get('logoWatermark', opts.get('logo_watermark', False))
    playback_speed = opts.get('playbackSpeed', '1.0')
    show_highlight_labels = opts.get('showHighlightLabels', True)
    use_hw_accel = opts.get('use_hw_accel', True)
    
    # Get hardware encoder - use libx264 for reliability
    hw_encoder = 'libx264'  # Always use software encoder for reliability
    print(f"[simple_job] Using encoder: {hw_encoder}")

    work = tempfile.mkdtemp()
    print(f"[simple_job] Starting job {job_id}: {len(clips)} clips, format={format_type}, captions={captions_enabled}")
    print(f"[simple_job] Options: transitions={use_transitions}, color={color_filter}, bgMusic={do_background_music}")

    def get_transcript_for_timerange(start, end, transcript):
        """Get transcript segments that fall within a time range
        Supports both {start, duration, text} and {start, end, text} formats
        """
        if not transcript:
            print(f"[transcript] No transcript data provided")
            return []
        
        segments = []
        for seg in transcript:
            seg_start = seg.get('start', 0)
            # Support both 'duration' and 'end' formats
            if 'duration' in seg:
                seg_end = seg_start + seg.get('duration', 0)
            elif 'end' in seg:
                seg_end = seg.get('end', seg_start)
            else:
                seg_end = seg_start + 5  # Default 5 second duration
            
            # Check if segment overlaps with our range
            if seg_start < end and seg_end > start:
                segments.append({
                    'start': max(0, seg_start - start),  # Relative to clip start
                    'end': min(end - start, seg_end - start),
                    'text': seg.get('text', '')
                })
        
        if segments:
            print(f"[transcript] Found {len(segments)} segments for range {start:.1f}s - {end:.1f}s")
        else:
            print(f"[transcript] WARNING: No segments found for range {start:.1f}s - {end:.1f}s (transcript has {len(transcript)} total segments)")
        
        return segments

    def create_srt_file(segments, output_path):
        """Create an SRT subtitle file from transcript segments"""
        with open(output_path, 'w', encoding='utf-8') as f:
            for i, seg in enumerate(segments):
                start_time = seg['start']
                end_time = seg['end']
                text = seg['text'].strip()
                
                if not text:
                    continue
                
                # Format timestamps for SRT (HH:MM:SS,mmm)
                def format_srt_time(seconds):
                    h = int(seconds // 3600)
                    m = int((seconds % 3600) // 60)
                    s = int(seconds % 60)
                    ms = int((seconds % 1) * 1000)
                    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
                
                f.write(f"{i + 1}\n")
                f.write(f"{format_srt_time(start_time)} --> {format_srt_time(end_time)}\n")
                f.write(f"{text}\n\n")

    def escape_ffmpeg_text(text):
        """Escape special characters for FFmpeg drawtext filter"""
        if not text:
            return text
        # Escape special chars for FFmpeg: ', \, :
        text = text.replace('\\', '\\\\')
        text = text.replace("'", "\\'")
        text = text.replace(':', '\\:')
        return text
    
    def create_text_overlay_filter(text, work_dir, prefix, video_width=1920, video_height=1080,
                                   fontcolor="white", bordercolor="black", position="top",
                                   text_type="title"):
        """Create drawtext filter for LARGE highlight text at TOP of video.
        
        Highlight text is BIG and PROMINENT - uses 6% of video height.
        This gives ~65px on 1080p which is very readable.
        Uses green color (#1E7F63) to match site branding with friendly rounded font.
        """
        if not text:
            return None
        
        # HIGHLIGHT TEXT = BIG (6% of height)
        # 1080p â†’ 65px, 720p â†’ 43px, 1920 vertical â†’ 115px
        fontsize = max(36, min(100, int(video_height * 0.06)))
        
        # Calculate safe margins (4% from edges)
        margin_x = int(video_width * 0.04)
        margin_y = int(video_height * 0.03)
        usable_width = video_width - (2 * margin_x)
        
        # Calculate max characters per line
        char_width = fontsize * 0.52
        max_chars = max(12, int(usable_width / char_width))
        
        print(f"[HIGHLIGHT] Video: {video_width}x{video_height}, fontsize={fontsize}px, max_chars={max_chars}")
        
        # Word wrap
        words = text.split()
        lines = []
        current_line = ""
        
        for word in words:
            while len(word) > max_chars - 2:
                if current_line:
                    lines.append(current_line)
                    current_line = ""
                lines.append(word[:max_chars-2] + "-")
                word = word[max_chars-2:]
            
            test = f"{current_line} {word}".strip() if current_line else word
            if len(test) <= max_chars:
                current_line = test
            else:
                if current_line:
                    lines.append(current_line)
                current_line = word
        if current_line:
            lines.append(current_line)
        
        # Max 4 lines
        if len(lines) > 4:
            lines = lines[:4]
            lines[-1] = lines[-1][:max_chars-3] + "..."
        
        wrapped = '\n'.join(lines)
        
        # Write to file
        text_file = os.path.join(work_dir, f"{prefix}_highlight.txt")
        with open(text_file, 'w', encoding='utf-8') as f:
            f.write(wrapped)
        
        text_escaped = text_file.replace('\\', '/').replace(':', '\\:').replace("'", "\\'")
        
        # Position at TOP with safe margin
        y_pos = margin_y
        
        # Strong shadow/border for readability
        shadow = max(3, fontsize // 12)
        border = max(3, fontsize // 10)
        
        # GREEN color (#1E7F63) to match site branding
        # FFmpeg uses BGR format, so #1E7F63 becomes 0x637F1E
        # Using a lighter green (#22C55E) for better video visibility -> 0x5EC522
        green_color = "0x22C55E"  # Bright green, very readable on video
        
        # Try friendly fonts in order of preference (macOS/Linux compatible)
        # These are rounded, friendly fonts that look good on video
        font_options = "Arial Rounded MT Bold:Avenir Next Rounded:SF Pro Rounded:Helvetica Neue:Arial"
        
        filter_str = (
            f"drawtext=textfile='{text_escaped}'"
            f":fontsize={fontsize}"
            f":fontcolor={green_color}"
            f":shadowcolor=black@0.9"
            f":shadowx={shadow}:shadowy={shadow}"
            f":borderw={border}"
            f":bordercolor=white@0.95"
            f":x=(w-tw)/2"
            f":y={y_pos}"
            f":line_spacing={int(fontsize * 0.2)}"
        )
        
        print(f"[HIGHLIGHT] {len(lines)} lines at y={y_pos}, color=GREEN")
        return filter_str

    def create_subtitle_filter(segments, work_dir, prefix, video_width=1920, video_height=1080):
        """Create FFmpeg subtitle filter for SMALL captions at BOTTOM of video.
        
        Captions are SMALLER than highlight text (2.2% vs 6% of height).
        Positioned at the bottom with generous margin.
        """
        if not segments:
            print("[CAPTION] No segments provided")
            return None, None
        
        # Create SRT file
        srt_file = os.path.join(work_dir, f"{prefix}_captions.srt")
        
        # CAPTIONS = SMALL (2.2% of height, about 1/3 of highlight size)
        # 1080p â†’ 24px, 720p â†’ 16px, 1920 vertical â†’ 42px
        fontsize = max(16, min(42, int(video_height * 0.022)))
        
        # Large bottom margin to stay away from bottom edge
        # Horizontal: 10% from bottom, Vertical: 18% from bottom
        aspect = video_width / video_height if video_height > 0 else 16/9
        if aspect < 1:  # Vertical (9:16)
            margin_v = int(video_height * 0.18)
        else:  # Horizontal (16:9)
            margin_v = int(video_height * 0.10)
        
        print(f"[CAPTION] Video: {video_width}x{video_height}, fontsize={fontsize}px, margin_v={margin_v}px")
        
        def format_srt_time(seconds):
            """Format seconds to SRT time (HH:MM:SS,mmm)"""
            if seconds < 0:
                seconds = 0
            h = int(seconds // 3600)
            m = int((seconds % 3600) // 60)
            s = int(seconds % 60)
            ms = int((seconds % 1) * 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
        
        # Max chars for wrapping
        char_width = fontsize * 0.55
        usable_width = video_width - (2 * int(video_width * 0.05))
        max_chars = max(30, int(usable_width / char_width))
        
        # Build SRT
        srt_content = ""
        idx = 1
        
        for seg in segments:
            start = seg.get('start', 0)
            end = seg.get('end', start + 2)
            text = seg.get('text', '').strip()
            
            if not text:
                continue
            
            # Min 0.5s display
            if end - start < 0.5:
                end = start + 0.5
            
            # Word wrap (max 2 lines for captions)
            if len(text) > max_chars:
                words = text.split()
                lines = []
                cur = ""
                for w in words:
                    if len(cur) + len(w) + 1 <= max_chars:
                        cur = f"{cur} {w}".strip() if cur else w
                    else:
                        if cur:
                            lines.append(cur)
                        cur = w
                if cur:
                    lines.append(cur)
                text = '\n'.join(lines[:2])
            
            srt_content += f"{idx}\n"
            srt_content += f"{format_srt_time(start)} --> {format_srt_time(end)}\n"
            srt_content += f"{text}\n\n"
            idx += 1
        
        if idx == 1:
            print("[CAPTION] No valid entries")
            return None, None
        
        # Write SRT
        with open(srt_file, 'w', encoding='utf-8') as f:
            f.write(srt_content)
        
        print(f"[CAPTION] Created {idx - 1} caption entries")
        
        # Escape for FFmpeg
        srt_escaped = srt_file.replace('\\', '/').replace(':', '\\:').replace("'", "\\'")
        
        # Style: small white text with outline, at bottom
        style = (
            f"FontSize={fontsize},"
            f"FontName=DejaVu Sans,"
            f"PrimaryColour=&H00FFFFFF,"
            f"OutlineColour=&H00000000,"
            f"BackColour=&H80000000,"
            f"Outline=2,"
            f"Shadow=1,"
            f"MarginV={margin_v},"
            f"Alignment=2"
        )
        
        filter_str = f"subtitles='{srt_escaped}':force_style='{style}'"
        
        return filter_str, srt_file

    try:
        video_file = os.path.join(work, "video.mp4")
        
        # Check if we already have the video cached
        cached_video = os.path.join(FILES_DIR, f"{vid}.mp4")
        use_segment_download = False  # Flag to download segments individually
        
        # Default video dimensions (will be updated after download)
        video_width = 1920
        video_height = 1080
        video_fps = 30
        
        if os.path.exists(cached_video):
            print(f"[simple_job] Using cached video: {cached_video}")
            video_file = cached_video
            # Get actual video dimensions
            video_info = get_video_info(video_file)
            video_width = video_info['width']
            video_height = video_info['height']
            video_fps = video_info['fps']
            print(f"[simple_job] Video info: {video_width}x{video_height} @ {video_fps}fps")
        else:
            # For efficiency, get video duration first and decide download strategy
            job["message"] = "Checking video duration..."
            video_duration = 0
            try:
                duration_cmd = ["yt-dlp", "--print", "duration", f"https://www.youtube.com/watch?v={vid}"]
                duration_result = subprocess.run(duration_cmd, capture_output=True, text=True, timeout=30)
                video_duration = float(duration_result.stdout.strip()) if duration_result.returncode == 0 else 0
                print(f"[simple_job] Video duration: {video_duration}s ({video_duration/60:.1f} min)")
            except:
                video_duration = 0
            
            # Calculate total clip duration needed
            total_clip_duration = sum(c.get("end", 0) - c.get("start", 0) for c in clips)
            print(f"[simple_job] Total clip duration needed: {total_clip_duration}s")
            
            # Strategy: For very long videos (>30 min), download segments individually
            # This is much faster than downloading a 2-hour video
            if video_duration > 1800:  # > 30 minutes
                print(f"[simple_job] Long video ({video_duration/60:.0f} min) - using segment download strategy")
                use_segment_download = True
                job["message"] = "Long video detected - downloading only needed clips..."
                
            else:  # Short video (<30 min) - download normally
                job["message"] = "Downloading video..."
                job["percent"] = 5
                
                cmd = [
                    "yt-dlp",
                    "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
                    "--no-playlist",
                    "-o", video_file,
                    f"https://www.youtube.com/watch?v={vid}",
                ]
                print(f"[simple_job] Downloading: {' '.join(cmd)}")
                
                timeout_seconds = max(600, int(video_duration * 0.5)) if video_duration > 0 else 900
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_seconds)
                
                if result.returncode != 0:
                    print(f"[simple_job] yt-dlp error: {result.stderr}")
                    raise Exception(f"Failed to download video: {result.stderr[:200]}")
                
                # Get video dimensions after download
                if os.path.exists(video_file):
                    video_info = get_video_info(video_file)
                    video_width = video_info['width']
                    video_height = video_info['height']
                    video_fps = video_info['fps']
                    print(f"[simple_job] Video info: {video_width}x{video_height} @ {video_fps}fps")

            if not use_segment_download and not os.path.exists(video_file):
                raise Exception("Video file not found after download")
        
        # Prepare color filter if specified
        color_filter_str = create_color_filter(color_filter) if color_filter and color_filter != 'none' else None
        if color_filter_str:
            print(f"[simple_job] Applying color filter: {color_filter}")
        
        # Helper function to download a single segment
        def download_segment(vid, start, end, output_path, padding=5):
            """Download only the needed segment using yt-dlp --download-sections"""
            # Add padding before/after for smoother transitions
            section_start = max(0, start - padding)
            section_end = end + padding
            
            # Use yt-dlp's download-sections feature
            section_spec = f"*{section_start}-{section_end}"
            
            cmd = [
                "yt-dlp",
                "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
                "--download-sections", section_spec,
                "--force-keyframes-at-cuts",
                "--no-playlist",
                "-o", output_path,
                f"https://www.youtube.com/watch?v={vid}",
            ]
            print(f"[segment_download] Downloading {section_start:.0f}s-{section_end:.0f}s...")
            
            try:
                # Each segment should download quickly (typically 10-30 seconds of video)
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                if result.returncode == 0 and os.path.exists(output_path):
                    print(f"[segment_download] Success: {output_path}")
                    return output_path, padding  # Return path and the actual padding used
                else:
                    print(f"[segment_download] yt-dlp error: {result.stderr[:200]}")
                    return None, 0
            except subprocess.TimeoutExpired:
                print(f"[segment_download] Timeout downloading segment")
                return None, 0
            except Exception as e:
                print(f"[segment_download] Error: {e}")
                return None, 0
        
        if use_segment_download:
            print(f"[simple_job] Using segment-based processing for long video")
        else:
            print(f"[simple_job] Video ready: {video_file}")
            
        job["percent"] = 30
        job["message"] = f"Processing {len(clips)} clips..."

        if format_type == "individual":
            output = os.path.join(FILES_DIR, f"clips_{job_id[:8]}.zip")
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
                for i, clip in enumerate(clips):
                    job["percent"] = 30 + int(60 * i / len(clips))
                    clip_file = os.path.join(work, f"clip_{i+1:03d}.mp4")
                    orig_start = clip.get("start", 0)
                    orig_end = clip.get("end", orig_start + 10)
                    duration = orig_end - orig_start
                    highlight_text = clip.get("highlight", "")
                    
                    # For segment downloads, get just this clip's segment
                    current_video = video_file
                    start = orig_start
                    clip_video_width = video_width
                    clip_video_height = video_height
                    
                    if use_segment_download:
                        job["message"] = f"Downloading clip {i+1} of {len(clips)}..."
                        segment_file = os.path.join(work, f"ind_segment_{i}.mp4")
                        segment_result, segment_padding = download_segment(vid, orig_start, orig_end, segment_file)
                        if segment_result:
                            current_video = segment_result
                            start = segment_padding
                            # Get actual video dimensions from downloaded segment
                            seg_info = get_video_info(segment_result)
                            clip_video_width = seg_info['width']
                            clip_video_height = seg_info['height']
                            print(f"[individual] Segment {i+1} dimensions: {clip_video_width}x{clip_video_height}")
                        else:
                            print(f"[individual] Failed to download segment {i+1}, skipping")
                            continue

                    # Build FFmpeg filter for highlight text and subtitles
                    vf_filters = []
                    
                    # Add highlight text at top (the AI-generated summary label)
                    if captions_enabled and highlight_text:
                        highlight_filter = create_text_overlay_filter(
                            highlight_text, work, f"ind_highlight_{i}",
                            video_width=clip_video_width, video_height=clip_video_height,
                            fontcolor="white", bordercolor="black",
                            position="top", text_type="title"
                        )
                        if highlight_filter:
                            vf_filters.append(highlight_filter)
                            print(f"[individual] Adding highlight label: {highlight_text[:80]}...")
                        
                        # Add timed subtitles that follow speaker timing
                        if transcript_data:
                            clip_transcript = get_transcript_for_timerange(orig_start, orig_end, transcript_data)
                            if clip_transcript:
                                subtitle_filter, _ = create_subtitle_filter(
                                    clip_transcript, work, f"ind_subs_{i}",
                                    video_width=clip_video_width, video_height=clip_video_height
                                )
                                if subtitle_filter:
                                    vf_filters.append(subtitle_filter)
                                    print(f"[individual] Adding {len(clip_transcript)} subtitle segments")
                    
                    # Add color filter if specified
                    if color_filter_str:
                        vf_filters.append(color_filter_str)

                    # Use input seeking for proper audio sync
                    seek_time = max(0, start - 1)
                    trim_start = start - seek_time

                    if vf_filters:
                        cmd = [
                            "ffmpeg",
                            "-ss", str(seek_time),
                            "-i", current_video,
                            "-ss", str(trim_start),
                            "-t", str(duration),
                            "-vf", ",".join(vf_filters),
                            "-c:v", "libx264", "-preset", "fast",
                            "-c:a", "aac", "-ar", "44100",
                            "-async", "1",
                            clip_file, "-y"
                        ]
                    else:
                        cmd = [
                            "ffmpeg",
                            "-ss", str(seek_time),
                            "-i", current_video,
                            "-ss", str(trim_start),
                            "-t", str(duration),
                            "-c:v", "libx264", "-preset", "fast",
                            "-c:a", "aac", "-ar", "44100",
                            "-async", "1",
                            clip_file, "-y"
                        ]
                    subprocess.run(cmd, capture_output=True)

                    if os.path.exists(clip_file):
                        label = clip.get("label", f"Clip {i+1}")[:50]
                        safe_label = re.sub(r"[^\w\s-]", "", label).strip()
                        zf.write(clip_file, f"clip_{i+1:03d}_{safe_label}.mp4")

        elif format_type == "social":
            output = os.path.join(FILES_DIR, f"social_{job_id[:8]}.mp4")
            
            # Use all clips (same as regular reel, no 60s limit)
            selected_clips = clips[:10]  # Max 10 clips like regular reel

            if selected_clips:
                # First extract clips with captions, then concatenate
                clip_files = []
                running_time = 0
                
                for i, clip in enumerate(selected_clips):
                    job["percent"] = 30 + int(40 * i / len(selected_clips))
                    clip_file = os.path.join(work, f"social_clip_{i}.mp4")
                    orig_start = clip.get("start", 0)
                    orig_end = clip.get("end", orig_start + 15)
                    duration = orig_end - orig_start
                    highlight_text = clip.get("highlight", "")
                    
                    # For segment downloads, get just this clip's segment
                    current_video = video_file
                    start = orig_start
                    if use_segment_download:
                        job["message"] = f"Downloading clip {i+1} of {len(selected_clips)}..."
                        segment_file = os.path.join(work, f"social_segment_{i}.mp4")
                        segment_result, segment_padding = download_segment(vid, orig_start, orig_end, segment_file)
                        if segment_result:
                            current_video = segment_result
                            start = segment_padding  # Start at the padding offset
                        else:
                            print(f"[social] Failed to download segment {i+1}, skipping")
                            continue
                    
                    # Build filter chain for vertical video
                    # Step 1: Scale to vertical 9:16 aspect ratio
                    vf_filters = ["scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"]
                    
                    # For social reels, output is always 1080x1920 (9:16 vertical)
                    social_width, social_height = 1080, 1920
                    
                    # Step 2: Add highlight text at top (the AI-generated summary label)
                    if captions_enabled and highlight_text:
                        highlight_filter = create_text_overlay_filter(
                            highlight_text, work, f"social_highlight_{i}",
                            video_width=social_width, video_height=social_height,
                            fontcolor="white", bordercolor="black",
                            position="top", text_type="title"
                        )
                        if highlight_filter:
                            vf_filters.append(highlight_filter)
                            print(f"[social] Adding highlight label: {highlight_text[:80]}...")
                        
                        # Step 3: Add timed subtitles that follow speaker timing
                        if transcript_data:
                            clip_transcript = get_transcript_for_timerange(orig_start, orig_end, transcript_data)
                            if clip_transcript:
                                subtitle_filter, _ = create_subtitle_filter(
                                    clip_transcript, work, f"social_subs_{i}",
                                    video_width=social_width, video_height=social_height
                                )
                                if subtitle_filter:
                                    vf_filters.append(subtitle_filter)
                                    print(f"[social] Adding {len(clip_transcript)} subtitle segments")
                    
                    # Add color filter if specified
                    if color_filter_str:
                        vf_filters.append(color_filter_str)
                    
                    # Add fade in for first clip, fade out for last
                    if use_transitions:
                        if i == 0:
                            vf_filters.append(f"fade=t=in:st=0:d={transition_duration}")
                        if i == len(selected_clips) - 1:
                            vf_filters.append(f"fade=t=out:st={duration - transition_duration}:d={transition_duration}")
                    
                    vf_string = ",".join(vf_filters)
                    print(f"[social] Filter string: {vf_string[:200]}...")
                    
                    # Use input seeking for proper audio sync
                    seek_time = max(0, start - 1)
                    trim_start = start - seek_time
                    
                    cmd = [
                        "ffmpeg",
                        "-ss", str(seek_time),
                        "-i", current_video,
                        "-ss", str(trim_start),
                        "-t", str(duration),
                        "-vf", vf_string,
                        "-c:v", "libx264", "-preset", "fast",
                        "-c:a", "aac", "-ar", "44100",
                        "-async", "1",
                        clip_file, "-y"
                    ]
                    print(f"[social] Processing clip {i+1}: {orig_start:.1f}s - {orig_end:.1f}s")
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    if result.returncode != 0:
                        print(f"[social] FFmpeg error: {result.stderr[:500]}")
                    
                    if os.path.exists(clip_file):
                        clip_files.append(clip_file)
                        running_time += duration
                
                # Concatenate clips - always re-encode for consistent audio
                if clip_files:
                    concat_file = os.path.join(work, "social_concat.txt")
                    with open(concat_file, "w") as f:
                        for cf in clip_files:
                            f.write(f"file '{cf}'\n")
                    
                    cmd = [
                        "ffmpeg", "-f", "concat", "-safe", "0",
                        "-i", concat_file,
                        "-c:v", "libx264", "-preset", "fast",
                        "-c:a", "aac", "-ar", "44100",
                        output, "-y"
                    ]
                    result = subprocess.run(cmd, capture_output=True)

        else:  # combined / default
            output = os.path.join(FILES_DIR, f"highlight_{job_id[:8]}.mp4")
            if clips:
                concat_file = os.path.join(work, "concat.txt")
                clip_files_for_concat = []
                running_time = 0
                
                for i, clip in enumerate(clips[:10]):
                    job["percent"] = 30 + int(50 * i / len(clips[:10]))
                    start = clip.get("start", 0)
                    end = clip.get("end", start + 10)
                    duration = end - start
                    highlight_text = clip.get("highlight", "")
                    
                    # For segment downloads, get just this clip's segment
                    current_video = video_file
                    segment_padding = 0
                    if use_segment_download:
                        job["message"] = f"Downloading clip {i+1} of {len(clips[:10])}..."
                        segment_file = os.path.join(work, f"segment_{i}.mp4")
                        segment_result, segment_padding = download_segment(vid, start, end, segment_file)
                        if segment_result:
                            current_video = segment_result
                            # Adjust start time since segment starts at (start - padding)
                            start = segment_padding  # Start at the padding offset
                        else:
                            print(f"[combined] Failed to download segment {i+1}, skipping")
                            continue
                    
                    if captions_enabled and highlight_text:
                        # Need to re-encode to add highlight label text and subtitles
                        clip_file = os.path.join(work, f"temp_{i}.mp4")
                        vf_filters = []
                        
                        # Add highlight text at top (the AI-generated summary label)
                        highlight_filter = create_text_overlay_filter(
                            highlight_text, work, f"combined_highlight_{i}",
                            video_width=video_width, video_height=video_height,
                            fontcolor="white", bordercolor="black",
                            position="top", text_type="title"
                        )
                        if highlight_filter:
                            vf_filters.append(highlight_filter)
                            print(f"[combined] Adding highlight label: {highlight_text[:80]}...")
                        
                        # Add timed subtitles that follow speaker timing
                        orig_start = clip.get("start", 0)
                        orig_end = clip.get("end", orig_start + 10)
                        if transcript_data:
                            clip_transcript = get_transcript_for_timerange(orig_start, orig_end, transcript_data)
                            if clip_transcript:
                                subtitle_filter, _ = create_subtitle_filter(
                                    clip_transcript, work, f"combined_subs_{i}",
                                    video_width=video_width, video_height=video_height
                                )
                                if subtitle_filter:
                                    vf_filters.append(subtitle_filter)
                                    print(f"[combined] Adding {len(clip_transcript)} subtitle segments")
                        
                        # Add color filter if specified
                        if color_filter_str:
                            vf_filters.append(color_filter_str)
                        
                        # Add fade in for first clip, fade out for last
                        if use_transitions:
                            if i == 0:
                                vf_filters.append(f"fade=t=in:st=0:d={transition_duration}")
                            if i == len(clips[:10]) - 1:
                                vf_filters.append(f"fade=t=out:st={duration - transition_duration}:d={transition_duration}")
                        
                        # Use input seeking (-ss before -i) for fast seek, then output seeking for accuracy
                        # This ensures proper audio sync
                        seek_time = max(0, start - 1)  # Seek 1 second before for keyframe accuracy
                        trim_start = start - seek_time  # Fine-tune trim after seek
                        
                        if vf_filters:
                            vf_string = ",".join(vf_filters)
                            print(f"[combined] Filter string: {vf_string[:200]}...")
                            cmd = [
                                "ffmpeg",
                                "-ss", str(seek_time),  # Input seeking (fast)
                                "-i", current_video,
                                "-ss", str(trim_start),  # Output seeking (accurate)
                                "-t", str(duration),
                                "-vf", vf_string,
                                "-c:v", "libx264", "-preset", "fast",
                                "-c:a", "aac", "-ar", "44100",  # Consistent audio sample rate
                                "-async", "1",  # Audio sync
                                clip_file, "-y"
                            ]
                            print(f"[combined] Processing clip {i+1}: {clip.get('start', 0):.1f}s - {clip.get('end', 0):.1f}s with highlight label")
                        else:
                            cmd = [
                                "ffmpeg",
                                "-ss", str(seek_time),
                                "-i", current_video,
                                "-ss", str(trim_start),
                                "-t", str(duration),
                                "-c:v", "libx264", "-preset", "fast",
                                "-c:a", "aac", "-ar", "44100",
                                "-async", "1",
                                clip_file, "-y"
                            ]
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        if result.returncode != 0:
                            print(f"[combined] FFmpeg error: {result.stderr[:500]}")
                    else:
                        # Re-encode even without captions for consistent audio sync
                        clip_file = os.path.join(work, f"temp_{i}.mp4")
                        seek_time = max(0, start - 1)
                        trim_start = start - seek_time
                        cmd = [
                            "ffmpeg",
                            "-ss", str(seek_time),
                            "-i", current_video,
                            "-ss", str(trim_start),
                            "-t", str(duration),
                            "-c:v", "libx264", "-preset", "fast",
                            "-c:a", "aac", "-ar", "44100",
                            "-async", "1",
                            clip_file, "-y"
                        ]
                        subprocess.run(cmd, capture_output=True)

                    if os.path.exists(clip_file):
                        clip_files_for_concat.append(clip_file)

                # Write concat file
                with open(concat_file, "w") as f:
                    for cf in clip_files_for_concat:
                        f.write(f"file '{cf}'\n")

                # Always re-encode for consistent audio sync
                cmd = [
                    "ffmpeg", "-f", "concat", "-safe", "0",
                    "-i", concat_file,
                    "-c:v", "libx264", "-preset", "fast",
                    "-c:a", "aac", "-ar", "44100",
                    output, "-y"
                ]
                subprocess.run(cmd, capture_output=True)

        # ================================================================
        # POST-PROCESSING: Apply final enhancements
        # ================================================================
        
        if os.path.exists(output):
            job["percent"] = 85
            job["message"] = "Applying finishing touches..."
            
            final_output = output
            temp_count = 0
            
            # Add background music if requested (works for ALL formats)
            if do_background_music:
                job["message"] = "Adding background music..."
                print(f"[postproc] Adding background music to {format_type} video...")
                temp_output = os.path.join(work, f"with_music_{temp_count}.mp4")
                if add_upbeat_background_music(final_output, temp_output, music_volume=0.5):
                    final_output = temp_output
                    temp_count += 1
                    print(f"[postproc] Background music added successfully!")
                else:
                    print(f"[postproc] Background music failed - continuing without it")
            
            # Add logo watermark if requested
            if do_logo_watermark and format_type in ['combined', 'social']:
                job["message"] = "Adding logo watermark..."
                temp_output = os.path.join(work, f"with_watermark_{temp_count}.mp4")
                if add_logo_watermark(final_output, temp_output, position='bottom_right', opacity=0.6, scale=0.12):
                    final_output = temp_output
                    temp_count += 1
                    print(f"[postproc] Logo watermark added")
            
            # Copy final output to expected location if it changed
            if final_output != output:
                shutil.copy2(final_output, output)
                print(f"[postproc] Copied final output to {output}")
            
            job["percent"] = 95

        if os.path.exists(output):
            file_size = os.path.getsize(output)
            print(f"[simple_job] SUCCESS! Output: {output} ({file_size / 1024 / 1024:.1f} MB)")
            job["status"] = "done"
            job["message"] = "Ready to download!"
            job["file"] = f"/files/{os.path.basename(output)}"
            job["zip"] = f"/files/{os.path.basename(output)}"
            job["percent"] = 100
            job["fileSize"] = file_size
        else:
            print(f"[simple_job] ERROR: Output file not found: {output}")
            raise Exception("Failed to create output file")

    except subprocess.TimeoutExpired as e:
        print(f"[simple_job] TIMEOUT: {e}")
        job["status"] = "error"
        job["message"] = "Video processing timed out"
    except Exception as e:
        print(f"[simple_job] ERROR: {e}")
        import traceback
        traceback.print_exc()
        job["status"] = "error"
        job["message"] = str(e)[:200]
    finally:
        # Clean up temp directory but keep output
        if work and os.path.exists(work) and work != FILES_DIR:
            shutil.rmtree(work, ignore_errors=True)
        print(f"[simple_job] Job {job_id} final status: {job.get('status')}")


@app.post("/api/render_clips")
async def render_clips(req: Request):
    """Render video clips in various formats with optional editing features"""
    if CLOUD_MODE:
        return {
            "error": "Video clip download is not available in cloud mode",
            "message": "YouTube blocks video downloads from cloud servers. Run the desktop app for this feature.",
            "jobId": None
        }
    
    data = await req.json()
    vid = data.get("videoId", "")
    clips = data.get("clips", [])
    format_type = data.get("format", "combined")
    title = data.get("title", "Highlight Reel")
    captions_enabled = data.get("captions", True)
    
    # Video editing options - if disable_all is true, skip all processing
    disable_all = data.get('disableAllAdvanced', True)
    
    video_options = {
        'disable_all': disable_all,
        'transitions': False if disable_all else data.get('transitions', False),
        'transition_duration': data.get('transitionDuration', 0.5),
        'color_filter': 'none' if disable_all else data.get('colorFilter', 'none'),
        'normalize_audio': False if disable_all else data.get('normalizeAudio', False),
        'logo_watermark': False if disable_all else data.get('logoWatermark', False),
        'use_hw_accel': data.get('useHwAccel', True),
    }
    
    if not vid:
        return {"error": "No video ID provided", "jobId": None}
    
    if not clips:
        return {"error": "No clips provided", "jobId": None}
    
    # Try to get transcript for captions
    transcript_data = None
    if captions_enabled:
        # Check stored transcripts first
        if vid in STORED_TRANSCRIPTS:
            transcript_data = STORED_TRANSCRIPTS[vid]
            print(f"[render_clips] Using stored transcript: {len(transcript_data)} segments")
        else:
            # Check cache
            cache_key = f"transcript_{vid}"
            if cache_key in TRANSCRIPT_CACHE:
                transcript_data = TRANSCRIPT_CACHE[cache_key]
                print(f"[render_clips] Using cached transcript: {len(transcript_data)} segments")
            else:
                # Try to fetch
                try:
                    from youtube_transcript_api import YouTubeTranscriptApi
                    transcript_data = YouTubeTranscriptApi.get_transcript(vid)
                    TRANSCRIPT_CACHE[cache_key] = transcript_data
                    print(f"[render_clips] Fetched transcript: {len(transcript_data)} segments")
                except Exception as e:
                    print(f"[render_clips] Could not fetch transcript: {e}")
    
    print(f"[render_clips] Starting job: {len(clips)} clips, format={format_type}, captions={captions_enabled}, transcript={len(transcript_data) if transcript_data else 0} segments")
    print(f"[render_clips] Video options: {video_options}")

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "status": "queued", 
        "percent": 0, 
        "message": f"Starting {format_type} render with {len(clips)} clips..."
    }

    threading.Thread(
        target=simple_job, 
        args=(job_id, vid, clips, format_type, captions_enabled, transcript_data, video_options), 
        daemon=True
    ).start()
    return {"jobId": job_id, "format": format_type, "clipCount": len(clips)}


# ============================================================================
# Multi-Video Export for Issue Tracker
# ============================================================================

def multi_video_job(job_id, clips_by_video, format_type, captions_enabled):
    """
    Process clips from multiple videos into a single export.
    
    clips_by_video: dict mapping videoId -> list of {start, end, highlight, meetingTitle}
    format_type: 'zip' for individual clips, 'montage' for combined video
    """
    job = JOBS[job_id]
    job["status"] = "processing"
    job["percent"] = 0
    
    work = tempfile.mkdtemp(prefix="multi_export_")
    all_clip_files = []
    total_clips = sum(len(clips) for clips in clips_by_video.values())
    processed = 0
    
    try:
        for video_id, clips in clips_by_video.items():
            job["message"] = f"Processing video {video_id}..."
            print(f"[multi_export] Processing {len(clips)} clips from video {video_id}")
            
            # Download video or use cached
            video_file = os.path.join(work, f"video_{video_id}.mp4")
            cached_video = os.path.join(FILES_DIR, f"{video_id}.mp4")
            
            if os.path.exists(cached_video):
                video_file = cached_video
                print(f"[multi_export] Using cached video: {cached_video}")
            else:
                # Check video duration first
                job["message"] = f"Downloading video {video_id}..."
                
                try:
                    duration_cmd = ["yt-dlp", "--print", "duration", f"https://www.youtube.com/watch?v={video_id}"]
                    duration_result = subprocess.run(duration_cmd, capture_output=True, text=True, timeout=30)
                    video_duration = float(duration_result.stdout.strip()) if duration_result.returncode == 0 else 0
                except:
                    video_duration = 0
                
                # For long videos, download segments only
                if video_duration > 1800:  # > 30 min
                    print(f"[multi_export] Long video - will download segments")
                    video_file = None  # Will download per-segment
                else:
                    # Download full video
                    cmd = [
                        "yt-dlp",
                        "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
                        "--no-playlist",
                        "-o", video_file,
                        f"https://www.youtube.com/watch?v={video_id}",
                    ]
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
                    if result.returncode != 0:
                        print(f"[multi_export] Failed to download {video_id}: {result.stderr[:200]}")
                        continue
            
            # Get transcript for captions
            transcript_data = None
            if captions_enabled and video_id in STORED_TRANSCRIPTS:
                transcript_data = STORED_TRANSCRIPTS[video_id]
            
            # Process each clip from this video
            for i, clip in enumerate(clips):
                processed += 1
                job["percent"] = int((processed / total_clips) * 80)
                job["message"] = f"Processing clip {processed}/{total_clips}..."
                
                start = clip.get("start", 0)
                end = clip.get("end", start + 30)
                duration = end - start
                highlight = clip.get("highlight", "")
                meeting_title = clip.get("meetingTitle", f"Meeting {video_id}")
                
                # Clean meeting title for filename
                safe_title = re.sub(r'[^\w\s-]', '', meeting_title)[:30].strip()
                clip_filename = f"{safe_title}_{i+1}_{int(start)}s.mp4"
                clip_file = os.path.join(work, clip_filename)
                
                current_video = video_file
                seek_start = start
                
                # If no full video file, download just this segment
                if not video_file or not os.path.exists(video_file):
                    segment_file = os.path.join(work, f"seg_{video_id}_{i}.mp4")
                    section_start = max(0, start - 5)
                    section_end = end + 5
                    
                    cmd = [
                        "yt-dlp",
                        "-f", "best[ext=mp4][height<=720]/best[ext=mp4]/best",
                        "--download-sections", f"*{section_start}-{section_end}",
                        "--force-keyframes-at-cuts",
                        "--no-playlist",
                        "-o", segment_file,
                        f"https://www.youtube.com/watch?v={video_id}",
                    ]
                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                    if result.returncode == 0 and os.path.exists(segment_file):
                        current_video = segment_file
                        seek_start = 5  # Account for padding
                    else:
                        print(f"[multi_export] Failed to download segment: {result.stderr[:200]}")
                        continue
                
                # Get video dimensions
                try:
                    probe_cmd = ["ffprobe", "-v", "error", "-select_streams", "v:0", 
                               "-show_entries", "stream=width,height", "-of", "json", current_video]
                    probe_result = subprocess.run(probe_cmd, capture_output=True, text=True)
                    probe_data = json.loads(probe_result.stdout)
                    width = probe_data['streams'][0]['width']
                    height = probe_data['streams'][0]['height']
                except:
                    width, height = 1920, 1080
                
                # Build FFmpeg command with highlight text overlay
                vf_filters = []
                
                if highlight and captions_enabled:
                    # Create highlight text file
                    highlight_file = os.path.join(work, f"highlight_{video_id}_{i}.txt")
                    
                    # Word wrap the highlight text
                    fontsize = max(24, min(48, int(height * 0.04)))
                    char_width = fontsize * 0.5
                    max_chars = max(20, int((width * 0.9) / char_width))
                    
                    words = highlight.split()
                    lines = []
                    current_line = ""
                    for word in words:
                        test = f"{current_line} {word}".strip() if current_line else word
                        if len(test) <= max_chars:
                            current_line = test
                        else:
                            if current_line:
                                lines.append(current_line)
                            current_line = word
                    if current_line:
                        lines.append(current_line)
                    
                    with open(highlight_file, 'w') as f:
                        f.write('\n'.join(lines[:3]))
                    
                    highlight_escaped = highlight_file.replace('\\', '/').replace(':', '\\:').replace("'", "\\'")
                    
                    vf_filters.append(
                        f"drawtext=textfile='{highlight_escaped}'"
                        f":fontsize={fontsize}"
                        f":fontcolor=0x22C55E"  # Green
                        f":borderw=3"
                        f":bordercolor=white@0.95"
                        f":shadowcolor=black@0.8"
                        f":shadowx=2:shadowy=2"
                        f":x=(w-tw)/2"
                        f":y=30"
                    )
                
                # Build FFmpeg command
                if vf_filters:
                    cmd = [
                        "ffmpeg",
                        "-ss", str(max(0, seek_start - 0.5)),
                        "-i", current_video,
                        "-ss", "0.5",
                        "-t", str(duration),
                        "-vf", ",".join(vf_filters),
                        "-c:v", "libx264", "-preset", "fast",
                        "-c:a", "aac", "-ar", "44100",
                        clip_file, "-y"
                    ]
                else:
                    cmd = [
                        "ffmpeg",
                        "-ss", str(seek_start),
                        "-i", current_video,
                        "-t", str(duration),
                        "-c:v", "libx264", "-preset", "fast",
                        "-c:a", "aac", "-ar", "44100",
                        clip_file, "-y"
                    ]
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                
                if os.path.exists(clip_file):
                    all_clip_files.append({
                        "file": clip_file,
                        "filename": clip_filename,
                        "video_id": video_id,
                        "start": start,
                        "meeting_title": meeting_title
                    })
                    print(f"[multi_export] Created clip: {clip_filename}")
                else:
                    print(f"[multi_export] FFmpeg failed: {result.stderr[:200]}")
        
        if not all_clip_files:
            job["status"] = "error"
            job["message"] = "No clips could be processed"
            return
        
        job["percent"] = 85
        
        # Create output based on format
        if format_type == "zip":
            job["message"] = "Creating ZIP archive..."
            output_file = os.path.join(FILES_DIR, f"issue_tracker_clips_{job_id[:8]}.zip")
            
            with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_DEFLATED) as zf:
                for clip_info in all_clip_files:
                    zf.write(clip_info["file"], clip_info["filename"])
            
            print(f"[multi_export] Created ZIP with {len(all_clip_files)} clips")
            
        else:  # montage
            job["message"] = "Creating montage video..."
            output_file = os.path.join(FILES_DIR, f"issue_tracker_montage_{job_id[:8]}.mp4")
            
            # Create concat file
            concat_file = os.path.join(work, "concat.txt")
            with open(concat_file, 'w') as f:
                for clip_info in all_clip_files:
                    f.write(f"file '{clip_info['file']}'\n")
            
            # Concatenate with re-encoding for compatibility
            cmd = [
                "ffmpeg", "-f", "concat", "-safe", "0",
                "-i", concat_file,
                "-c:v", "libx264", "-preset", "fast",
                "-c:a", "aac", "-ar", "44100",
                output_file, "-y"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            
            if result.returncode != 0:
                print(f"[multi_export] Concat failed: {result.stderr[:200]}")
                job["status"] = "error"
                job["message"] = "Failed to create montage"
                return
            
            print(f"[multi_export] Created montage from {len(all_clip_files)} clips")
        
        # Cleanup
        try:
            shutil.rmtree(work)
        except:
            pass
        
        if os.path.exists(output_file):
            file_size = os.path.getsize(output_file)
            job["status"] = "done"
            job["percent"] = 100
            job["output"] = f"/api/download/{os.path.basename(output_file)}"
            job["message"] = f"Export complete! {len(all_clip_files)} clips ({file_size / 1024 / 1024:.1f} MB)"
            job["clipCount"] = len(all_clip_files)
            print(f"[multi_export] SUCCESS: {output_file}")
        else:
            job["status"] = "error"
            job["message"] = "Output file not created"
            
    except Exception as e:
        print(f"[multi_export] Error: {e}")
        import traceback
        traceback.print_exc()
        job["status"] = "error"
        job["message"] = str(e)
        try:
            shutil.rmtree(work)
        except:
            pass


@app.post("/api/render_multi_video_clips")
async def render_multi_video_clips(req: Request):
    """
    Render clips from MULTIPLE videos into a single export.
    Used by Issue Tracker for cross-meeting clip collections.
    
    Request body:
    {
        "clipsByVideo": {
            "videoId1": [{"start": 0, "end": 30, "highlight": "text", "meetingTitle": "title"}, ...],
            "videoId2": [...]
        },
        "format": "zip" | "montage",
        "captions": true | false
    }
    """
    if CLOUD_MODE:
        return {
            "error": "Video export is not available in cloud mode",
            "message": "YouTube blocks video downloads from cloud servers. Run the desktop app for this feature.",
            "jobId": None
        }
    
    data = await req.json()
    clips_by_video = data.get("clipsByVideo", {})
    format_type = data.get("format", "zip")
    captions_enabled = data.get("captions", True)
    
    if not clips_by_video:
        return {"error": "No clips provided", "jobId": None}
    
    total_clips = sum(len(clips) for clips in clips_by_video.values())
    total_videos = len(clips_by_video)
    
    print(f"[render_multi_video_clips] Starting: {total_clips} clips from {total_videos} videos, format={format_type}")
    
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {
        "status": "queued",
        "percent": 0,
        "message": f"Preparing to export {total_clips} clips from {total_videos} videos..."
    }
    
    threading.Thread(
        target=multi_video_job,
        args=(job_id, clips_by_video, format_type, captions_enabled),
        daemon=True
    ).start()
    
    return {
        "jobId": job_id,
        "format": format_type,
        "clipCount": total_clips,
        "videoCount": total_videos
    }


@app.get("/api/job_status")
async def job_status(jobId: str = None):
    """Get job status - supports both query param and listing all jobs"""
    print(f"[job_status] Checking job: {jobId}, Available jobs: {list(JOBS.keys())}")
    if not jobId:
        return {"jobs": list(JOBS.keys()), "count": len(JOBS)}
    result = JOBS.get(jobId, {"status": "error", "message": f"Unknown job: {jobId}"})
    print(f"[job_status] Result for {jobId}: {result}")
    return result


@app.get("/api/job/{job_id}")
async def job_status_by_path(job_id: str):
    """Alternative endpoint with path parameter"""
    print(f"[job_status_by_path] Checking job: {job_id}")
    return JOBS.get(job_id, {"status": "error", "message": f"Unknown job: {job_id}"})


@app.get("/api/video_capabilities")
async def video_capabilities():
    """Get available video editing capabilities"""
    hw_accel = detect_hardware_acceleration()
    
    return {
        "hwAcceleration": {
            "available": len(hw_accel['available']) > 0,
            "encoder": hw_accel['encoder'],
            "types": hw_accel['available']
        },
        "colorFilters": [
            {"id": "none", "name": "None"},
            {"id": "vintage", "name": "Vintage"},
            {"id": "warm", "name": "Warm"},
            {"id": "cool", "name": "Cool"},
            {"id": "high_contrast", "name": "High Contrast"},
            {"id": "low_contrast", "name": "Low Contrast"},
            {"id": "bw", "name": "Black & White"},
            {"id": "sepia", "name": "Sepia"},
            {"id": "vibrant", "name": "Vibrant"},
            {"id": "cinematic", "name": "Cinematic"}
        ],
        "speedOptions": [
            {"value": 0.5, "name": "0.5x (Slow Motion)"},
            {"value": 0.75, "name": "0.75x"},
            {"value": 1.0, "name": "1x (Normal)"},
            {"value": 1.25, "name": "1.25x"},
            {"value": 1.5, "name": "1.5x"},
            {"value": 2.0, "name": "2x (Fast)"}
        ],
        "watermarkPositions": [
            {"id": "top_left", "name": "Top Left"},
            {"id": "top_right", "name": "Top Right"},
            {"id": "bottom_left", "name": "Bottom Left"},
            {"id": "bottom_right", "name": "Bottom Right"},
            {"id": "center", "name": "Center"}
        ],
        "features": {
            "transitions": True,
            "introOutro": True,
            "audioNormalization": True,
            "thumbnailGeneration": True,
            "chapterMarkers": True,
            "responsiveText": True
        },
        "cloudMode": CLOUD_MODE
    }


@app.post("/api/download_mp4")
async def download_mp4(req: Request):
    """Download full video from YouTube"""
    if CLOUD_MODE:
        return {
            "error": "Video download not available in cloud mode",
            "message": "YouTube blocks downloads from cloud servers. Run the desktop app for this feature."
        }
    
    data = await req.json()
    vid = data.get("videoId", "")
    
    if not vid:
        return {"error": "No video ID provided"}
    
    print(f"[download_mp4] Starting download for video: {vid}")
    
    output = os.path.join(FILES_DIR, f"{vid}.mp4")
    
    # Check if already downloaded
    if os.path.exists(output):
        print(f"[download_mp4] Video already exists: {output}")
        return {"file": f"/files/{os.path.basename(output)}", "cached": True}
    
    # Download with yt-dlp
    try:
        cmd = [
            "yt-dlp",
            "-f", "best[ext=mp4]/best",
            "--no-playlist",
            "-o", output,
            f"https://www.youtube.com/watch?v={vid}",
        ]
        print(f"[download_mp4] Running: {' '.join(cmd)}")
        
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        
        if result.returncode != 0:
            print(f"[download_mp4] yt-dlp error: {result.stderr}")
            return {"error": f"Download failed: {result.stderr[:200]}"}
        
        if os.path.exists(output):
            file_size = os.path.getsize(output)
            print(f"[download_mp4] Success! File size: {file_size / 1024 / 1024:.1f} MB")
            return {"file": f"/files/{os.path.basename(output)}", "size": file_size}
        else:
            return {"error": "Download completed but file not found"}
            
    except subprocess.TimeoutExpired:
        return {"error": "Download timed out after 10 minutes"}
    except Exception as e:
        print(f"[download_mp4] Exception: {e}")
        return {"error": str(e)}


def find_quote_timestamp(quote: str, transcript_cache: dict, video_id: str) -> tuple:
    """Find the timestamp of a quote in the transcript"""
    # Get cached transcript or fetch it
    if video_id not in transcript_cache:
        return None, None
    
    transcript = transcript_cache[video_id]
    if not transcript:
        return None, None
    
    # Clean the quote for matching
    quote_clean = quote.lower().strip()
    quote_words = quote_clean.split()[:8]  # Use first 8 words for matching
    search_phrase = ' '.join(quote_words)
    
    best_match_time = None
    best_match_score = 0
    
    for segment in transcript:
        text = segment.get('text', '').lower()
        start_time = segment.get('start', 0)
        
        # Check if quote words appear in this segment
        if search_phrase in text or all(w in text for w in quote_words[:4]):
            # Good match found
            return start_time, start_time + segment.get('duration', 10)
        
        # Partial match scoring
        matches = sum(1 for w in quote_words if w in text)
        if matches > best_match_score:
            best_match_score = matches
            best_match_time = start_time
    
    # Return best partial match if no exact match
    if best_match_time is not None and best_match_score >= 2:
        return best_match_time, best_match_time + 15
    
    return None, None


@app.post("/api/highlight_reel")
async def highlight_reel(req: Request):
    """Create highlight reel from quotes - finds actual timestamps in transcript"""
    if CLOUD_MODE:
        return {
            "error": "Video clip download is not available in cloud mode",
            "message": "YouTube blocks video downloads from cloud servers. Run the desktop app for this feature.",
            "jobId": None
        }
    
    data = await req.json()
    vid = data.get("videoId", "")
    quotes = data.get("quotes", [])
    highlights = data.get("highlights", [])  # Highlight labels for text overlay
    pad = data.get("pad", 4)  # seconds of padding before/after
    format_type = data.get("format", "combined")
    transcript_data = data.get("transcript", [])  # Can pass transcript directly
    captions_enabled = data.get("captions", True)  # Whether to add captions
    
    # IMPORTANT: Extract video options from request
    # If disableAllAdvanced is true, skip ALL post-processing
    disable_all = data.get('disableAllAdvanced', True)
    
    video_options = {
        'disable_all': disable_all,
        'transitions': False if disable_all else data.get('transitions', False),
        'transition_duration': data.get('transitionDuration', 0.5),
        'color_filter': 'none' if disable_all else data.get('colorFilter', 'none'),
        'normalize_audio': False if disable_all else data.get('normalizeAudio', False),
        'logo_watermark': False if disable_all else data.get('logoWatermark', False),
        'use_hw_accel': data.get('useHwAccel', True),
    }
    print(f"[highlight_reel] Video options (disable_all={disable_all}): {video_options}")
    
    # Log transcript info
    if transcript_data:
        first_seg = transcript_data[0] if transcript_data else {}
        print(f"[highlight_reel] Received transcript with {len(transcript_data)} segments")
        print(f"[highlight_reel] First segment format: {list(first_seg.keys())}")
    else:
        print(f"[highlight_reel] No transcript data provided, will try to fetch")
    
    if not vid:
        return {"error": "No video ID provided", "jobId": None}
    
    if not quotes:
        return {"error": "No quotes provided", "jobId": None}
    
    # Try to get transcript if not provided
    if not transcript_data:
        # Check cache
        cache_key = f"transcript_{vid}"
        if cache_key in TRANSCRIPT_CACHE:
            transcript_data = TRANSCRIPT_CACHE[cache_key]
        else:
            # Try to fetch transcript
            try:
                from youtube_transcript_api import YouTubeTranscriptApi
                transcript_data = YouTubeTranscriptApi.get_transcript(vid)
                TRANSCRIPT_CACHE[cache_key] = transcript_data
            except Exception as e:
                print(f"Could not fetch transcript for timestamp matching: {e}")
    
    # Build clips by finding quote timestamps for ALL quotes
    all_clips = []
    transcript_cache = {vid: transcript_data} if transcript_data else {}
    
    print(f"[highlight_reel] Processing {len(quotes)} quotes to find timestamps...")
    
    for i, quote in enumerate(quotes):
        start_time, end_time = find_quote_timestamp(quote, transcript_cache, vid)
        
        highlight_label = highlights[i] if i < len(highlights) else ""
        
        if start_time is not None:
            # Apply padding
            clip_start = max(0, start_time - pad)
            clip_end = end_time + pad
            all_clips.append({
                "start": clip_start,
                "end": clip_end,
                "label": quote[:60],
                "highlight": highlight_label[:80],  # Highlight text for overlay
                "quote_start": start_time,  # Original start for caption timing
                "quote_end": end_time,
                "original_index": i
            })
        else:
            print(f"Could not find timestamp for quote: {quote[:50]}...")
    
    # SELECT 5 EVENLY SPREAD CLIPS from the available highlights
    # This creates a "sports highlight reel" feel - clips from throughout the video
    if len(all_clips) > 5:
        # Sort by timestamp first
        all_clips.sort(key=lambda c: c["start"])
        
        # Select evenly distributed clips (indices 0, 2, 4, 6, 8 for 10 clips, etc.)
        total = len(all_clips)
        step = total / 5  # e.g., for 10 clips: step = 2.0
        selected_indices = [int(i * step) for i in range(5)]
        
        # Make sure we don't go out of bounds and get unique indices
        selected_indices = list(set(min(idx, total - 1) for idx in selected_indices))
        selected_indices.sort()
        
        # If we don't have 5 unique indices, fill from unused
        while len(selected_indices) < 5 and len(selected_indices) < total:
            for idx in range(total):
                if idx not in selected_indices:
                    selected_indices.append(idx)
                    selected_indices.sort()
                    break
        
        clips = [all_clips[i] for i in selected_indices[:5]]
        print(f"[highlight_reel] Selected clips at indices {selected_indices} from {total} total highlights")
        for i, idx in enumerate(selected_indices[:5]):
            print(f"  Clip {i+1}: index {idx} -> {all_clips[idx]['start']:.1f}s - {all_clips[idx]['end']:.1f}s")
    else:
        clips = all_clips
    
    # Sort final clips by timestamp for proper video order
    clips.sort(key=lambda c: c["start"])
    
    if not clips:
        # Fallback: create clips at regular intervals if no matches found
        print("Warning: No quote timestamps found, using fallback intervals")
        import random
        
        # Get video duration estimate from transcript
        video_duration = 0
        if transcript_data:
            last_segment = transcript_data[-1] if transcript_data else None
            if last_segment:
                video_duration = last_segment.get('start', 0) + last_segment.get('duration', 0)
        
        if video_duration == 0:
            video_duration = 3600  # Default 1 hour
        
        # Create evenly spaced fallback clips
        interval = video_duration / 6  # 5 clips means 6 segments
        for i in range(5):
            start = int(interval * (i + 0.5))  # Middle of each segment
            highlight_label = highlights[i] if i < len(highlights) else ""
            quote = quotes[i] if i < len(quotes) else ""
            clips.append({
                "start": start,
                "end": start + 20,
                "label": quote[:60] if quote else f"Highlight {i+1}",
                "highlight": highlight_label[:80],
                "quote_start": start,
                "quote_end": start + 15
            })
    
    print(f"[highlight_reel] Creating reel with {len(clips)} clips, captions={captions_enabled}")
    print(f"[highlight_reel] Options: disable_all={video_options['disable_all']}")
    for i, clip in enumerate(clips):
        print(f"  Clip {i+1}: {clip['start']:.1f}s - {clip['end']:.1f}s | {clip.get('highlight', '')[:40]}...")
    
    job_id = str(uuid.uuid4())
    JOBS[job_id] = {"status": "queued", "percent": 0, "message": f"Building reel from {len(clips)} clips..."}
    
    # FIXED: Pass video_options to simple_job
    threading.Thread(
        target=simple_job, args=(job_id, vid, clips, format_type, captions_enabled, transcript_data, video_options), daemon=True
    ).start()
    return {"jobId": job_id}


@app.get("/api/download/{file_name}")
async def api_download_file(file_name: str):
    """Serve exported files via /api/download path"""
    file_path = os.path.join(FILES_DIR, file_name)
    
    if not os.path.exists(file_path):
        raise HTTPException(404, f"File not found: {file_name}")
    
    # Determine media type
    if file_name.endswith('.mp4'):
        media_type = "video/mp4"
    elif file_name.endswith('.zip'):
        media_type = "application/zip"
    else:
        media_type = "application/octet-stream"
    
    return FileResponse(
        path=file_path, 
        filename=file_name, 
        media_type=media_type
    )


@app.get("/files/{file_name}")
async def download_file(file_name: str):
    """Serve files"""
    file_path = os.path.join(FILES_DIR, file_name)

    if not os.path.exists(file_path):
        raise HTTPException(404, f"File not found: {file_name}")

    return FileResponse(
        path=file_path, filename=file_name, media_type="application/octet-stream"
    )


# ============================================================================
#  LIVE CHAT ENDPOINTS (YouTube Live Streaming & Chat)
# ============================================================================


@app.post("/api/live_chat")
async def get_live_chat(req: Request):
    """
    Get live chat messages from a YouTube video (live or archived)

    Request body:
    {
        "videoId": "string",
        "maxMessages": 100  (optional)
    }
    """
    if not LIVE_CHAT_AVAILABLE:
        raise HTTPException(
            500,
            "chat-downloader not installed. Install with: pip install chat-downloader",
        )

    data = await req.json()
    video_id = data.get("videoId")
    max_messages = data.get("maxMessages", 100)

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        print(f" Fetching live chat for video: {video_id}")
        chat = ChatDownloader().get_chat(url, max_messages=max_messages)

        messages = []
        for message in chat:
            messages.append(
                {
                    "author": message.get("author", {}).get("name", "Unknown"),
                    "message": message.get("message", ""),
                    "timestamp": message.get("timestamp", 0),
                    "time_text": message.get("time_text", ""),
                    "author_id": message.get("author", {}).get("id", ""),
                    "message_type": message.get("message_type", "text_message"),
                }
            )

        print(f" Retrieved {len(messages)} chat messages")

        return {"messages": messages, "count": len(messages), "video_id": video_id}

    except Exception as e:
        print(f" Live chat error: {e}")
        raise HTTPException(500, f"Failed to fetch chat: {str(e)}")


@app.post("/api/live_chat/analyze")
async def analyze_chat_sentiment(req: Request):
    """
    Analyze sentiment of live chat messages

    Request body:
    {
        "videoId": "string",
        "maxMessages": 500  (optional)
    }
    """
    if not LIVE_CHAT_AVAILABLE:
        raise HTTPException(500, "chat-downloader not installed")

    data = await req.json()
    video_id = data.get("videoId")
    max_messages = data.get("maxMessages", 500)

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        print(f"Ãƒâ€šÃ‚  Analyzing chat sentiment for: {video_id}")
        chat = ChatDownloader().get_chat(url, max_messages=max_messages)

        sentiments = []
        positive = 0
        negative = 0
        neutral = 0

        for message in chat:
            text = message.get("message", "")
            if text:
                # Use TextBlob for sentiment analysis
                blob = TextBlob(text)
                sentiment = blob.sentiment.polarity

                if sentiment > 0.1:
                    positive += 1
                    category = "positive"
                elif sentiment < -0.1:
                    negative += 1
                    category = "negative"
                else:
                    neutral += 1
                    category = "neutral"

                sentiments.append(
                    {
                        "author": message.get("author", {}).get("name", "Unknown"),
                        "message": text,
                        "sentiment": sentiment,
                        "category": category,
                        "timestamp": message.get("timestamp", 0),
                    }
                )

        overall_mood = (
            "positive"
            if positive > negative
            else "negative" if negative > positive else "neutral"
        )

        print(
            f" Sentiment analysis: {positive} positive, {negative} negative, {neutral} neutral"
        )

        return {
            "sentiments": sentiments,
            "summary": {
                "positive": positive,
                "negative": negative,
                "neutral": neutral,
                "total": len(sentiments),
                "overall_mood": overall_mood,
                "positive_percentage": (
                    round(positive / len(sentiments) * 100, 1) if sentiments else 0
                ),
                "negative_percentage": (
                    round(negative / len(sentiments) * 100, 1) if sentiments else 0
                ),
            },
        }

    except Exception as e:
        print(f" Sentiment analysis error: {e}")
        raise HTTPException(500, f"Failed to analyze chat: {str(e)}")


@app.post("/api/live_chat/wordcloud")
async def chat_wordcloud(req: Request):
    """
    Get most common words from live chat for word cloud visualization

    Request body:
    {
        "videoId": "string",
        "maxMessages": 500  (optional)
    }
    """
    if not LIVE_CHAT_AVAILABLE:
        raise HTTPException(500, "chat-downloader not installed")

    data = await req.json()
    video_id = data.get("videoId")
    max_messages = data.get("maxMessages", 500)

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        # Download stopwords if not available
        try:
            stop_words = set(stopwords.words("english"))
        except:
            nltk.download("stopwords", quiet=True)
            stop_words = set(stopwords.words("english"))

        print(f"  Generating word cloud for: {video_id}")
        chat = ChatDownloader().get_chat(url, max_messages=max_messages)

        # Collect all words
        all_words = []

        for message in chat:
            text = message.get("message", "").lower()
            # Remove special characters but keep spaces
            text = re.sub(r"[^a-zA-Z0-9\s]", "", text)
            words = text.split()
            # Filter out stopwords and short words
            filtered_words = [w for w in words if w not in stop_words and len(w) > 3]
            all_words.extend(filtered_words)

        # Count frequency
        word_freq = Counter(all_words)
        top_words = word_freq.most_common(50)

        print(f" Generated word cloud with {len(word_freq)} unique words")

        return {
            "words": [{"text": word, "count": count} for word, count in top_words],
            "total_messages": max_messages,
            "unique_words": len(word_freq),
            "total_words": len(all_words),
        }

    except Exception as e:
        print(f" Word cloud error: {e}")
        raise HTTPException(500, f"Failed to generate word cloud: {str(e)}")


@app.post("/api/live_chat/stats")
async def chat_statistics(req: Request):
    """
    Get comprehensive statistics about live chat

    Request body:
    {
        "videoId": "string",
        "maxMessages": 500  (optional)
    }
    """
    if not LIVE_CHAT_AVAILABLE:
        raise HTTPException(500, "chat-downloader not installed")

    data = await req.json()
    video_id = data.get("videoId")
    max_messages = data.get("maxMessages", 500)

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    url = f"https://www.youtube.com/watch?v={video_id}"

    try:
        print(f"Ãƒâ€šÃ‚  Gathering chat statistics for: {video_id}")
        chat = ChatDownloader().get_chat(url, max_messages=max_messages)

        total_messages = 0
        unique_authors = set()
        message_types = Counter()
        messages_per_author = Counter()

        for message in chat:
            total_messages += 1

            author = message.get("author", {}).get("name", "Unknown")
            author_id = message.get("author", {}).get("id", "")
            msg_type = message.get("message_type", "text_message")

            unique_authors.add(author_id if author_id else author)
            message_types[msg_type] += 1
            messages_per_author[author] += 1

        # Get top chatters
        top_chatters = messages_per_author.most_common(10)

        print(
            f" Statistics: {total_messages} messages from {len(unique_authors)} users"
        )

        return {
            "total_messages": total_messages,
            "unique_authors": len(unique_authors),
            "message_types": dict(message_types),
            "top_chatters": [
                {"name": name, "count": count} for name, count in top_chatters
            ],
            "video_id": video_id,
        }

    except Exception as e:
        print(f" Statistics error: {e}")
        raise HTTPException(500, f"Failed to get statistics: {str(e)}")


# ============================================================================
#  OPTIMIZATION ENDPOINTS
# ============================================================================


@app.get("/api/optimization/stats")
async def get_optimization_stats():
    """Get cache and optimization statistics"""
    if not OPTIMIZATIONS_AVAILABLE:
        return {
            "error": "Optimization modules not available",
            "optimizations_enabled": {},
            "estimated_savings": {"percentage": 0, "per_video": "$0"},
        }

    try:
        cache_stats = get_cache_stats()

        return {
            "cache": cache_stats,
            "optimizations_enabled": {
                "caching": True,
                "smart_sampling": True,
                "hybrid_rules": True,
                "two_pass_analysis": True,
                "better_prompts": True,
            },
            "estimated_savings": {
                "percentage": 92,
                "per_video": "$6.00",
                "description": "Original $6.50/video Ãƒâ€šÃ‚  $0.50/video",
            },
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to get stats: {e}")


@app.post("/api/optimization/clear_cache")
async def clear_cache_endpoint(video_id: str = None):
    """Clear cache (optionally for specific video)"""
    if not OPTIMIZATIONS_AVAILABLE:
        raise HTTPException(500, "Optimization modules not available")

    try:
        clear_cache(video_id=video_id)
        return {
            "status": "success",
            "message": f"Cache cleared" + (f" for {video_id}" if video_id else ""),
        }
    except Exception as e:
        raise HTTPException(500, f"Failed to clear cache: {e}")


# ============================================================================
#  NEW: LIVE MEETING MODE ENDPOINTS (v4.0)
# ============================================================================


@app.websocket("/ws/live/{meeting_id}")
async def websocket_live_meeting(websocket: WebSocket, meeting_id: str):
    """WebSocket endpoint for live meeting updates"""
    await live_manager.connect(websocket, meeting_id)

    try:
        while True:
            # Receive data from client
            data = await websocket.receive_json()

            if data["type"] == "ping":
                await websocket.send_json({"type": "pong"})

            elif data["type"] == "transcript_update":
                # Process and broadcast transcript update
                await live_manager.send_transcript_update(meeting_id, data["data"])

            elif data["type"] == "highlight":
                # Process and broadcast highlight
                await live_manager.send_highlight(meeting_id, data["data"])

    except WebSocketDisconnect:
        await live_manager.disconnect(meeting_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        await live_manager.disconnect(meeting_id)


@app.post("/api/live/start_monitoring")
async def start_live_monitoring(req: Request):
    """Start monitoring a YouTube livestream for real-time transcription"""
    data = await req.json()
    video_id = data.get("videoId")
    meeting_id = data.get("meetingId", video_id)

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    # This would integrate with YouTube's live caption API
    # For now, we'll simulate with periodic transcript fetches

    async def monitor_stream():
        """Background task to monitor livestream"""
        url = f"https://www.youtube.com/watch?v={video_id}"
        last_position = 0

        while meeting_id in live_manager.active_connections:
            try:
                # Get latest transcript segment
                transcript = ytt_api.fetch(video_id).to_raw_data()

                # Find new segments
                new_segments = [s for s in transcript if s["start"] > last_position]

                for segment in new_segments[:5]:  # Process up to 5 new segments
                    await live_manager.send_transcript_update(
                        meeting_id,
                        {
                            "text": clean_text(segment["text"]),
                            "start": segment["start"],
                            "duration": segment["duration"],
                        },
                    )
                    last_position = segment["start"]

                # Check for highlights (simplified logic)
                if len(new_segments) > 3:  # Activity spike
                    await live_manager.send_highlight(
                        meeting_id,
                        {
                            "type": "activity_spike",
                            "timestamp": new_segments[0]["start"],
                            "reason": "High discussion activity",
                        },
                    )

                await asyncio.sleep(10)  # Check every 10 seconds

            except Exception as e:
                print(f"Monitoring error: {e}")
                await asyncio.sleep(30)  # Wait longer on error

    # Start monitoring in background
    asyncio.create_task(monitor_stream())

    return {
        "status": "monitoring_started",
        "meeting_id": meeting_id,
        "video_id": video_id,
    }


# ============================================================================
# [*]ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ NEW: AI MEETING ASSISTANT (RAG-based Chat) (v4.0)
# ============================================================================


# ============================================================================
# IMPROVED AI ASSISTANT CHAT ENDPOINT (v5.1)
# ============================================================================
# Replace the existing @app.post("/api/assistant/chat") endpoint with this one
# 
# Key improvements:
# - Gives AI FULL transcript (or smart summary for long ones)
# - Short, confident, conversational answers
# - Asks follow-up questions instead of rambling
# - Better speaker detection
# ============================================================================


@app.post("/api/assistant/chat")
async def chat_with_meeting(req: Request):
    """v5.1 ENHANCED: Conversational AI assistant with full context"""
    data = await req.json()
    query = data.get("query", "").strip()
    meeting_id = data.get("meetingId")
    conversation_history = data.get("conversationHistory", [])

    if not query:
        raise HTTPException(400, "No query provided")

    if not OPENAI_API_KEY:
        raise HTTPException(500, "OpenAI API key not configured")

    try:
        full_transcript = ""
        transcript_stats = {}
        
        if meeting_id:
            # Get transcript from cache or fetch it
            if meeting_id in STORED_TRANSCRIPTS:
                transcript_data = STORED_TRANSCRIPTS[meeting_id]
                print(f"ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Using cached transcript: {len(transcript_data)} segments")
            else:
                try:
                    transcript_data = ytt_api.fetch(meeting_id).to_raw_data()
                    STORED_TRANSCRIPTS[meeting_id] = transcript_data
                    print(f"ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Fetched and cached {len(transcript_data)} segments")
                except Exception as e:
                    return {
                        "answer": "I can't access the transcript for this video. Please make sure the video has captions enabled.",
                        "sources": [],
                        "suggestions": ["Try a different video", "Check if captions are available"]
                    }
            
            # BUILD FULL TRANSCRIPT with timestamps
            full_text_parts = []
            for entry in transcript_data:
                timestamp = f"{int(entry['start'] // 60)}:{int(entry['start'] % 60):02d}"
                text = clean_text(entry.get("text", ""))
                if text:
                    full_text_parts.append(f"[{timestamp}] {text}")
            
            full_transcript = "\n".join(full_text_parts)
            
            # COMPUTE STATS for better answers
            all_text = " ".join([clean_text(e.get("text", "")) for e in transcript_data])
            
            # Detect speakers (look for patterns like "Speaker:", names followed by colons, etc.)
            speaker_patterns = re.findall(r'\b([A-Z][a-z]+ [A-Z][a-z]+)(?:\s*:|\s+said|\s+asked|\s+stated)', all_text)
            speaker_patterns += re.findall(r'\b(Mr\.|Mrs\.|Ms\.|Dr\.|Mayor|Councillor|Commissioner|Chair|President)\s+([A-Z][a-z]+)', all_text)
            speaker_patterns += re.findall(r'^([A-Z][A-Z\s]+):', all_text, re.MULTILINE)  # ALL CAPS names
            
            # Also look for ">> " pattern common in captions for speaker changes
            speaker_changes = all_text.count(">>")
            
            # Look for first-person plural vs singular to estimate speakers
            we_count = len(re.findall(r'\bwe\b', all_text.lower()))
            i_count = len(re.findall(r'\bi\b', all_text.lower()))
            
            # Duration
            if transcript_data:
                duration_seconds = transcript_data[-1].get('start', 0) + transcript_data[-1].get('duration', 0)
                duration_minutes = int(duration_seconds // 60)
            else:
                duration_minutes = 0
            
            transcript_stats = {
                "duration_minutes": duration_minutes,
                "word_count": len(all_text.split()),
                "speaker_changes": speaker_changes,
                "detected_names": list(set([s if isinstance(s, str) else " ".join(s) for s in speaker_patterns]))[:10],
                "we_vs_i": "multiple speakers likely" if we_count > i_count * 2 else "possibly single speaker or interview",
            }
            
            print(f"ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã…  Transcript stats: {transcript_stats}")
        
        else:
            return {
                "answer": "Please load a video first, then I can help answer questions about it!",
                "sources": [],
                "suggestions": ["Load a YouTube video", "Paste a video URL above"]
            }

        # SMART CONTEXT: For very long transcripts, summarize. For shorter ones, use full text.
        MAX_CONTEXT_CHARS = 30000  # ~7500 tokens, fits in context window
        
        if len(full_transcript) > MAX_CONTEXT_CHARS:
            # For long transcripts, take beginning, key sections, and end
            third = MAX_CONTEXT_CHARS // 3
            context_transcript = (
                full_transcript[:third] + 
                "\n\n[... middle of meeting ...]\n\n" +
                full_transcript[len(full_transcript)//2 - third//2 : len(full_transcript)//2 + third//2] +
                "\n\n[... end of meeting ...]\n\n" +
                full_transcript[-third:]
            )
            print(f"ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â Using condensed transcript: {len(context_transcript)} chars (from {len(full_transcript)})")
        else:
            context_transcript = full_transcript
            print(f"ÃƒÂ°Ã…Â¸Ã¢â‚¬Å“Ã‚Â Using full transcript: {len(context_transcript)} chars")

        # BUILD CONVERSATION CONTEXT
        conv_context = ""
        if conversation_history and len(conversation_history) > 0:
            recent = conversation_history[-4:]  # Last 2 exchanges
            conv_parts = []
            for msg in recent:
                role = "User" if msg.get("type") == "user" else "You"
                conv_parts.append(f"{role}: {msg.get('text', '')[:150]}")
            conv_context = "\n".join(conv_parts)

        # THE KEY: A much better system prompt
        system_prompt = """You are a friendly, helpful assistant who has watched this entire meeting. You answer questions conversationally - like a colleague who took great notes.

RULES:
1. BE CONCISE: Answer in 1-3 sentences for simple questions. No bullet points unless asked.
2. BE CONFIDENT: If you can answer from the transcript, just answer. Don't hedge with "based on the excerpts" or "it appears that".
3. BE CONVERSATIONAL: End with a brief follow-up like "Want me to find the exact quote?" or "Should I look for more details?"
4. USE TIMESTAMPS: When citing specific moments, mention the timestamp like "around 5:23".
5. IF UNSURE: Just say "I didn't catch that in the meeting - could you ask another way?" Don't write paragraphs about what context you'd need.

GOOD EXAMPLE:
User: "How many people spoke?"
You: "At least 4 different speakers - I heard Mayor Johnson, Councillor Smith, a resident named Patricia, and someone from the planning department. Want me to list what each person discussed?"

BAD EXAMPLE (too long, too uncertain):
"Based on the provided transcript excerpts, it is difficult to determine exactly how many people spoke during the meeting. The excerpts are fragmented and do not provide clear indicators..." """

        # Build the user prompt
        user_prompt = f"""Here's the meeting transcript:

{context_transcript}

Meeting stats: {duration_minutes} minutes long, approximately {transcript_stats.get('word_count', 0)} words.
{f"Detected names: {', '.join(transcript_stats.get('detected_names', []))}" if transcript_stats.get('detected_names') else ""}
{f"Speaker change indicators (>>): {speaker_changes}" if speaker_changes > 0 else ""}

{f"Previous conversation:{chr(10)}{conv_context}{chr(10)}" if conv_context else ""}

User's question: {query}"""

        # Call OpenAI
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)

        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=300,  # Keep responses SHORT
        )

        answer = completion.choices[0].message.content
        print(f"ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Generated response: {len(answer)} chars")

        # Generate contextual follow-up suggestions
        follow_ups = []
        query_lower = query.lower()
        
        if "speak" in query_lower or "who" in query_lower:
            follow_ups = ["What did they discuss?", "Any disagreements?", "Who spoke the most?"]
        elif "decision" in query_lower or "vote" in query_lower:
            follow_ups = ["What was the vote count?", "Any opposition?", "What happens next?"]
        elif "summary" in query_lower or "about" in query_lower:
            follow_ups = ["Any surprises?", "Key decisions?", "Who was there?"]
        else:
            follow_ups = ["Tell me more", "Any related decisions?", "What else was discussed?"]

        return {
            "answer": answer,
            "sources": [],  # We're using full transcript now, not chunks
            "suggestions": follow_ups,
            "stats": transcript_stats
        }

    except Exception as e:
        print(f"ÃƒÂ¢Ã‚ÂÃ…â€™ Chat error: {e}")
        import traceback
        print(traceback.format_exc())
        return {
            "answer": "Sorry, I hit a snag processing that. Could you try rephrasing your question?",
            "sources": [],
            "suggestions": ["Try a simpler question", "Ask about a specific topic"]
        }
@app.post("/api/assistant/suggestions")
async def get_chat_suggestions(req: Request):
    """Get AI-powered suggested questions based on meeting content"""
    data = await req.json()
    meeting_id = data.get("meetingId")

    if not meeting_id:
        # Return general suggestions when no meeting loaded
        return {
            "suggestions": [
                "What were the main topics discussed?",
                "Were there any decisions made?",
                "Who were the key speakers?",
                "What are the action items?",
                "What's the sentiment of the meeting?",
            ]
        }

    try:
        #  Check if we have the transcript cached
        if meeting_id in STORED_TRANSCRIPTS:
            print(
                f" Generating AI-powered suggestions from cached transcript: {meeting_id}"
            )
            transcript_data = STORED_TRANSCRIPTS[meeting_id]

            #  USE OPENAI TO GENERATE SMART SUGGESTIONS
            if OPENAI_API_KEY:
                try:
                    # Get a meaningful sample from different parts of the meeting
                    total_segments = len(transcript_data)

                    # Sample from beginning, middle, and end
                    beginning = transcript_data[:15]  # First 15 segments
                    middle_start = max(0, (total_segments // 2) - 7)
                    middle = transcript_data[middle_start : middle_start + 15]
                    end = transcript_data[-15:]  # Last 15 segments

                    # Combine samples
                    sample_segments = beginning + middle + end
                    sample_text = " ".join(
                        [clean_text(entry["text"]) for entry in sample_segments]
                    )

                    # Limit to reasonable size (about 1500 chars)
                    sample_text = sample_text[:1500]

                    print(
                        f"   Using {len(sample_text)} character sample for AI suggestions"
                    )

                    # Clear proxy variables before OpenAI call
                    import os

                    proxy_vars = [
                        "HTTP_PROXY",
                        "HTTPS_PROXY",
                        "http_proxy",
                        "https_proxy",
                    ]
                    saved_proxies = {}
                    for var in proxy_vars:
                        if var in os.environ:
                            saved_proxies[var] = os.environ[var]
                            del os.environ[var]

                    from openai import OpenAI

                    client = OpenAI(api_key=OPENAI_API_KEY)

                    # Restore proxies
                    for var, value in saved_proxies.items():
                        os.environ[var] = value

                    completion = client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=[
                            {
                                "role": "system",
                                "content": """You are a meeting analysis assistant. Generate 5 specific, insightful questions that someone might ask about this meeting.

Rules:
- Questions should be specific to the actual content discussed
- Focus on key decisions, topics, people, and actions
- Avoid generic questions - make them contextual
- Keep each question under 12 words
- Return ONLY the questions, one per line, no numbering""",
                            },
                            {
                                "role": "user",
                                "content": f"Meeting transcript excerpt:\n\n{sample_text}\n\nGenerate 5 specific questions about this meeting:",
                            },
                        ],
                        temperature=0.7,
                        max_tokens=200,
                    )

                    ai_response = completion.choices[0].message.content.strip()

                    # Parse the AI response into individual questions
                    ai_suggestions = [
                        s.strip().lstrip("1234567890.-) ").strip("\"'")
                        for s in ai_response.split("\n")
                        if s.strip() and len(s.strip()) > 10
                    ]

                    # Ensure we have questions (not statements)
                    ai_suggestions = [
                        s if s.endswith("?") else s + "?" for s in ai_suggestions
                    ]

                    # Limit to 5 suggestions
                    suggestions = ai_suggestions[:5]

                    # Fallback if AI didn't generate enough questions
                    if len(suggestions) < 3:
                        print(
                            f"Ãƒâ€šÃ‚   AI generated only {len(suggestions)} questions, adding fallbacks"
                        )
                        suggestions.extend(
                            [
                                "What were the main topics discussed?",
                                "What decisions were made?",
                                "What are the next steps?",
                            ]
                        )
                        suggestions = suggestions[:5]

                    print(f" Generated {len(suggestions)} AI-powered suggestions")
                    return {"suggestions": suggestions}

                except Exception as e:
                    print(
                        f"Ãƒâ€šÃ‚   AI suggestion generation failed: {e}, using keyword-based fallback"
                    )
                    # Fall through to keyword-based method below

            #  FALLBACK: Keyword-based suggestions (if no OpenAI key or error)
            print(f"   Using keyword-based suggestion generation")

            # Extract key information for better suggestions
            full_text = " ".join(
                [clean_text(entry["text"]) for entry in transcript_data[:50]]
            )  # First 50 segments

            # Find common keywords/topics
            words = full_text.lower().split()
            word_freq = {}
            stop_words = {
                "the",
                "a",
                "an",
                "and",
                "or",
                "but",
                "in",
                "on",
                "at",
                "to",
                "for",
                "of",
                "with",
                "by",
                "from",
                "about",
                "as",
                "this",
                "that",
                "is",
                "was",
                "are",
                "were",
                "be",
                "been",
                "being",
                "have",
                "has",
                "had",
                "do",
                "does",
                "did",
                "will",
                "would",
                "could",
                "should",
            }

            for word in words:
                word_clean = word.strip(".,!?;:\"'")
                if len(word_clean) > 3 and word_clean not in stop_words:
                    word_freq[word_clean] = word_freq.get(word_clean, 0) + 1

            # Get top 3 topics
            top_topics = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:3]

            # Generate contextual suggestions
            suggestions = [
                "What were the main topics discussed in this meeting?",
                "Summarize the key decisions made",
            ]

            # Add topic-specific suggestions
            for topic, count in top_topics:
                if count > 2:  # Only if mentioned multiple times
                    suggestions.append(f"What was said about {topic}?")

            # Add standard questions
            suggestions.extend(
                [
                    "Who were the main speakers?",
                    "What are the action items or next steps?",
                ]
            )

            # Limit to 5 suggestions
            return {"suggestions": suggestions[:5]}

        else:
            print(
                f"Ãƒâ€šÃ‚   No cached transcript for {meeting_id}, returning generic suggestions"
            )
            print(f"   Available cache keys: {list(STORED_TRANSCRIPTS.keys())}")

            # Return generic but helpful suggestions
            suggestions = [
                "What was discussed in this meeting?",
                "What are the main points covered?",
                "Were any decisions or votes taken?",
                "Who were the key participants?",
                "What are the next steps or action items?",
            ]

            return {"suggestions": suggestions}

    except Exception as e:
        print(f" Suggestions error: {e}")
        import traceback

        print(f"   Full traceback: {traceback.format_exc()}")

        # Return safe fallback
        return {
            "suggestions": [
                "What was discussed in this meeting?",
                "What are the main points?",
                "Were any decisions made?",
                "Who participated?",
                "What happens next?",
            ]
        }


# ============================================================================
# [*]ÃƒÆ’Ã¢â‚¬Â¦Ãƒâ€šÃ‚Â¡ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ NEW: COMMUNITY KNOWLEDGE BASE (v4.0)
# ============================================================================


@app.post("/api/knowledge/add_meeting")
async def add_meeting_to_knowledge_base(req: Request):
    """Add a meeting to the searchable knowledge base"""
    data = await req.json()
    video_id = data.get("videoId")
    metadata_extra = data.get("metadata", {})

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    try:
        # Get transcript
        transcript_text = ""
        try:
            transcript = ytt_api.fetch(video_id).to_raw_data()
            vtt = ["WEBVTT", "", ""]
            for i, entry in enumerate(transcript):
                start = entry["start"]
                end = start + entry["duration"]
                text = clean_text(entry["text"])
                if text:
                    start_time = f"{int(start // 3600):02d}:{int((start % 3600) // 60):02d}:{start % 60:06.3f}"
                    end_time = f"{int(end // 3600):02d}:{int((end % 3600) // 60):02d}:{end % 60:06.3f}"
                    vtt.append(f"{i + 1}")
                    vtt.append(f"{start_time} --> {end_time}")
                    vtt.append(text)
                    vtt.append("")
            transcript_text = "\n".join(vtt)
        except Exception as e:
            print(f"Error getting transcript: {e}")
            raise HTTPException(500, f"Failed to get transcript: {str(e)}")

        # Get video metadata
        meta = {}
        try:
            ydl_opts = {"quiet": True, "no_warnings": True}
            # Add proxy if available (for cloud deployment)
            if WEBSHARE_PROXY_URL:
                
                ydl_opts["proxy"] = WEBSHARE_PROXY_URL
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(
                    f"https://youtube.com/watch?v={video_id}", download=False
                )
                meta = {
                    "title": info.get("title", "Unknown"),
                    "channel": info.get("uploader", "Unknown"),
                    "upload_date": info.get("upload_date", ""),
                    "duration": info.get("duration", 0),
                }
        except Exception as e:
            print(f"Metadata error: {e}")
            meta = {"title": "Unknown", "upload_date": ""}

        # Prepare documents for vector database
        documents = []
        doc_metadata = []
        doc_ids = []

        # Split transcript into semantic chunks
        chunks = []
        lines = transcript_text.split("\n")
        current_chunk = []
        chunk_size = 500  # characters per chunk

        for line in lines:
            if line.strip() and not line.strip().isdigit() and "-->" not in line:
                current_chunk.append(clean_text(line))
                if len(" ".join(current_chunk)) > chunk_size:
                    chunk_text = " ".join(current_chunk)
                    chunks.append(chunk_text)
                    current_chunk = []

        # Add remaining chunk
        if current_chunk:
            chunks.append(" ".join(current_chunk))

        # Add chunks to documents
        for i, chunk in enumerate(chunks):
            doc_id = f"{video_id}_chunk_{i}"

            # Enrich chunk with context
            enriched_text = f"""
            Meeting: {meta.get('title', 'Unknown')}
            Date: {meta.get('upload_date', 'Unknown')}
            
            Content: {chunk}
            """

            documents.append(enriched_text)
            doc_ids.append(doc_id)
            doc_metadata.append(
                {
                    "video_id": video_id,
                    "title": meta.get("title", "Unknown"),
                    "date": meta.get("upload_date", ""),
                    "chunk_index": i,
                    "type": "transcript_chunk",
                }
            )

        # Add to ChromaDB
        if documents:
            if not CHROMADB_AVAILABLE:

                raise HTTPException(503, "Knowledge Base not available - ChromaDB not installed")

            meetings_collection.add(
                documents=documents, metadatas=doc_metadata, ids=doc_ids
            )

        print(
            f" Added meeting {video_id} to knowledge base ({len(documents)} documents)"
        )

        return {
            "status": "success",
            "video_id": video_id,
            "documents_added": len(documents),
            "title": meta.get("title", "Unknown"),
        }

    except Exception as e:
        print(f" Knowledge base error: {e}")
        raise HTTPException(500, f"Failed to add to knowledge base: {str(e)}")


@app.post("/api/knowledge/search")
async def search_knowledge_base(req: Request):
    """Search across all meetings in the knowledge base"""
    data = await req.json()
    query = data.get("query", "")
    limit = data.get("limit", 5)
    filters = data.get("filters", {})

    if not query:
        raise HTTPException(400, "No search query provided")

    try:
        # Build metadata filter
        where_clause = {}
        if filters.get("video_id"):
            where_clause["video_id"] = filters["video_id"]

        # Search in vector database
        if not CHROMADB_AVAILABLE:

            raise HTTPException(503, "Knowledge Base not available - ChromaDB not installed")

        results = meetings_collection.query(
            query_texts=[query],
            n_results=limit,
            where=where_clause if where_clause else None,
        )

        if not results or not results["documents"][0]:
            return {"results": [], "query": query}

        # Format results
        formatted_results = []
        seen_videos = set()

        for i, doc in enumerate(results["documents"][0]):
            metadata = results["metadatas"][0][i]
            video_id = metadata.get("video_id", "")

            # Group by video to avoid duplicates
            if video_id not in seen_videos:
                formatted_results.append(
                    {
                        "video_id": video_id,
                        "title": metadata.get("title", "Unknown"),
                        "date": metadata.get("date", ""),
                        "relevance_score": 1
                        - (results["distances"][0][i] if results["distances"] else 0),
                        "excerpt": doc[:200] + "...",
                        "type": metadata.get("type", "transcript"),
                    }
                )
                seen_videos.add(video_id)

        return {
            "results": formatted_results,
            "query": query,
            "total_found": len(formatted_results),
        }

    except Exception as e:
        print(f" Search error: {e}")
        raise HTTPException(500, f"Search failed: {str(e)}")


@app.post("/api/knowledge/find_related")
async def find_related_meetings(req: Request):
    """Find meetings related to a specific meeting"""
    data = await req.json()
    video_id = data.get("videoId")
    limit = data.get("limit", 5)

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    try:
        # Get the meeting's documents from knowledge base
        if not CHROMADB_AVAILABLE:

            raise HTTPException(503, "Knowledge Base not available - ChromaDB not installed")

        meeting_docs = meetings_collection.get(where={"video_id": video_id}, limit=1)

        if not meeting_docs or not meeting_docs["documents"]:
            return {"related": [], "message": "Meeting not in knowledge base"}

        # Use the meeting's content to find similar meetings
        query_text = meeting_docs["documents"][0]

        # Search for similar content, excluding the same video
        if not CHROMADB_AVAILABLE:

            raise HTTPException(503, "Knowledge Base not available - ChromaDB not installed")

        results = meetings_collection.query(
            query_texts=[query_text],
            n_results=limit + 5,  # Get extra to filter out same video
            where={"video_id": {"$ne": video_id}},
        )

        if not results or not results["documents"][0]:
            return {"related": [], "video_id": video_id}

        # Format related meetings
        related = []
        seen_videos = set()

        for i, doc in enumerate(results["documents"][0]):
            metadata = results["metadatas"][0][i]
            related_video_id = metadata.get("video_id", "")

            if related_video_id and related_video_id not in seen_videos:
                related.append(
                    {
                        "video_id": related_video_id,
                        "title": metadata.get("title", "Unknown"),
                        "date": metadata.get("date", ""),
                        "similarity_score": 1
                        - (results["distances"][0][i] if results["distances"] else 0),
                        "excerpt": doc[:150] + "...",
                    }
                )
                seen_videos.add(related_video_id)

                if len(related) >= limit:
                    break

        return {"related": related, "video_id": video_id, "total_found": len(related)}

    except Exception as e:
        print(f" Related search error: {e}")
        raise HTTPException(500, f"Failed to find related meetings: {str(e)}")


@app.get("/api/knowledge/stats")
async def get_knowledge_base_stats():
    """Get statistics about the knowledge base"""
    try:
        # Get collection info
        if not CHROMADB_AVAILABLE:

            raise HTTPException(503, "Knowledge Base not available - ChromaDB not installed")

        collection_data = meetings_collection.get()

        if not collection_data or not collection_data["metadatas"]:
            return {
                "total_meetings": 0,
                "total_documents": 0,
                "top_topics": [],
                "top_speakers": [],
            }

        # Extract unique values
        all_metadata = collection_data["metadatas"]
        unique_videos = set()

        for metadata in all_metadata:
            unique_videos.add(metadata.get("video_id", ""))

        return {
            "total_meetings": len(unique_videos),
            "total_documents": len(all_metadata),
            "database_size_mb": round(len(str(collection_data)) / 1024 / 1024, 2),
        }

    except Exception as e:
        print(f" Stats error: {e}")
        return {"error": str(e), "total_meetings": 0, "total_documents": 0}


# ============================================================================

# ============================================================================
# NEW: MEETING COMPARISON ENDPOINTS (v5.0)
# ============================================================================


@app.post("/api/compare/meetings")
async def compare_two_meetings(req: Request):
    """Compare two meetings on topics, sentiment, and decisions"""
    data = await req.json()
    meeting1_id = data.get("meeting1Id")
    meeting2_id = data.get("meeting2Id")

    if not meeting1_id or not meeting2_id:
        raise HTTPException(400, "Both meeting IDs required")

    try:
        transcripts = {}
        metadata = {}
        
        for mid in [meeting1_id, meeting2_id]:
            if mid in STORED_TRANSCRIPTS:
                transcripts[mid] = STORED_TRANSCRIPTS[mid]
            else:
                try:
                    transcripts[mid] = ytt_api.fetch(mid).to_raw_data()
                    STORED_TRANSCRIPTS[mid] = transcripts[mid]
                except Exception as e:
                    raise HTTPException(400, f"Could not get transcript for {mid}: {e}")
            
            try:
                ydl_opts = {"quiet": True, "no_warnings": True}
                # Add proxy if available (for cloud deployment)
                if WEBSHARE_PROXY_URL:
                    
                    ydl_opts["proxy"] = WEBSHARE_PROXY_URL
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(f"https://youtube.com/watch?v={mid}", download=False)
                    metadata[mid] = {
                        "title": info.get("title", "Unknown"),
                        "date": info.get("upload_date", ""),
                        "duration": info.get("duration", 0)
                    }
            except:
                metadata[mid] = {"title": "Unknown", "date": "", "duration": 0}

        texts = {}
        for mid, transcript in transcripts.items():
            texts[mid] = " ".join([clean_text(entry["text"]) for entry in transcript])

        def get_topics(text):
            words = text.lower().split()
            stop_words = {"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "is", "was", "are", "were", "be", "been", "have", "has", "had", "do", "does", "did", "will", "would", "could", "should", "this", "that", "these", "those", "it", "its", "we", "they", "you", "i", "he", "she"}
            word_freq = {}
            for word in words:
                word = word.strip(".,!?;:\"'()[]")
                if len(word) > 3 and word not in stop_words:
                    word_freq[word] = word_freq.get(word, 0) + 1
            return sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:20]

        topics1 = dict(get_topics(texts[meeting1_id]))
        topics2 = dict(get_topics(texts[meeting2_id]))
        
        shared_topics = set(topics1.keys()) & set(topics2.keys())
        unique_to_1 = set(topics1.keys()) - set(topics2.keys())
        unique_to_2 = set(topics2.keys()) - set(topics1.keys())

        def get_sentiment_score(text):
            try:
                blob = TextBlob(text[:5000])
                return {"polarity": round(blob.sentiment.polarity, 3), "subjectivity": round(blob.sentiment.subjectivity, 3)}
            except:
                return {"polarity": 0, "subjectivity": 0.5}

        sentiment1 = get_sentiment_score(texts[meeting1_id])
        sentiment2 = get_sentiment_score(texts[meeting2_id])

        def count_decisions(text):
            decision_words = ["approved", "rejected", "voted", "decided", "motion", "passed", "denied", "agreed"]
            text_lower = text.lower()
            return sum(text_lower.count(word) for word in decision_words)

        decisions1 = count_decisions(texts[meeting1_id])
        decisions2 = count_decisions(texts[meeting2_id])

        return {
            "meeting1": {"id": meeting1_id, "metadata": metadata[meeting1_id], "topTopics": list(topics1.items())[:10], "sentiment": sentiment1, "decisionCount": decisions1},
            "meeting2": {"id": meeting2_id, "metadata": metadata[meeting2_id], "topTopics": list(topics2.items())[:10], "sentiment": sentiment2, "decisionCount": decisions2},
            "comparison": {
                "sharedTopics": list(shared_topics)[:10],
                "uniqueToMeeting1": list(unique_to_1)[:10],
                "uniqueToMeeting2": list(unique_to_2)[:10],
                "topicOverlapPercent": round(len(shared_topics) / max(len(topics1), len(topics2), 1) * 100, 1),
                "sentimentDifference": round(abs(sentiment1["polarity"] - sentiment2["polarity"]), 3),
                "decisionDifference": abs(decisions1 - decisions2)
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"Comparison error: {e}")
        raise HTTPException(500, f"Comparison failed: {str(e)}")


@app.post("/api/assistant/starters")
async def get_conversation_starters():
    """Get categorized conversation starters for the AI assistant"""
    return {
        "categories": [
            {
                "name": "Quick Summary",
                "icon": "clipboard",
                "starters": [
                    "Give me a 30-second summary",
                    "What were the main topics?",
                    "Any surprises in this meeting?"
                ]
            },
            {
                "name": "Decisions & Actions",
                "icon": "check",
                "starters": [
                    "What decisions were made?",
                    "Are there any action items?",
                    "What happens next?"
                ]
            },
            {
                "name": "Deep Dive",
                "icon": "search",
                "starters": [
                    "Tell me more about the budget discussion",
                    "What were the main concerns raised?",
                    "Were there any disagreements?"
                ]
            },
            {
                "name": "People & Participation",
                "icon": "users",
                "starters": [
                    "Who were the main speakers?",
                    "Did any residents speak?",
                    "Who made the most comments?"
                ]
            }
        ]
    }

#  NEW: CLIP PREVIEW ENDPOINT (v4.0)
# ============================================================================


@app.post("/api/clip/preview")
async def get_clip_preview(req: Request):
    """Get preview data for a clip (thumbnail and text snippet)"""
    if CLOUD_MODE:
        return {"error": "Clip preview not available in cloud mode", "frames": [], "transcript_snippet": ""}
    
    data = await req.json()
    video_id = data.get("videoId")
    start_time = data.get("startTime", 0)
    end_time = data.get("endTime", start_time + 10)

    if not video_id:
        raise HTTPException(400, "No video ID provided")

    try:
        # Get video metadata for thumbnail
        meta = {}
        try:
            ydl_opts = {"quiet": True, "no_warnings": True}
            # Add proxy if available
            if WEBSHARE_PROXY_URL:
                
                ydl_opts["proxy"] = WEBSHARE_PROXY_URL
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(
                    f"https://youtube.com/watch?v={video_id}", download=False
                )
                meta = {
                    "title": info.get("title", "Unknown"),
                    "thumbnail": info.get("thumbnail", ""),
                }
        except Exception as e:
            print(f"Metadata error: {e}")
            meta = {"title": "Unknown", "thumbnail": ""}

        # Get transcript segment for the clip
        preview_text = ""
        try:
            transcript = ytt_api.fetch(video_id).to_raw_data()
            for entry in transcript:
                if start_time <= entry["start"] <= end_time:
                    preview_text += clean_text(entry["text"]) + " "
                    if len(preview_text) > 100:
                        break
        except Exception as e:
            print(f"Transcript error: {e}")
            preview_text = "Preview not available"

        return {
            "thumbnail": meta.get("thumbnail", ""),
            "preview_text": (
                preview_text[:150] + "..." if len(preview_text) > 150 else preview_text
            ),
            "title": meta.get("title", "Unknown"),
            "duration": end_time - start_time,
            "start_time": start_time,
            "end_time": end_time,
        }

    except Exception as e:
        print(f" Preview error: {e}")
        raise HTTPException(500, f"Failed to get preview: {str(e)}")


# ============================================================================
# v6.0: NEW FEATURE ENDPOINTS
# ============================================================================

# Data storage for new features (in-memory, use database for production)
TOPIC_SUBSCRIPTIONS = {}  # {user_id: {topic: {email, frequency, created_at}}}
ISSUE_TIMELINES = {}  # {issue_id: {name, meetings: [{video_id, date, summary}]}}
JARGON_DICTIONARY = {
    "TIF": "Tax Increment Financing - A special zone where property tax increases fund local improvements. For example, when a city designates a blighted area as a TIF district, property tax growth in that area goes toward improving streets, utilities, and buildings rather than the general city budget.",
    "CIP": "Capital Improvement Plan - A multi-year plan for major infrastructure investments like roads, buildings, and water systems. Your city council reviews and approves this plan annually to prioritize which big projects get funded over the next 5-10 years.",
    "RFP": "Request for Proposal - A formal document asking vendors to submit bids for a project. When the city needs a new service (like snow plowing or building construction), they issue an RFP so companies can compete for the contract.",
    "variance": "Permission to deviate from zoning rules for a specific property. For example, if zoning requires homes to be 15 feet from the property line but you want to build a garage only 10 feet away, you need to request a variance from the zoning board.",
    "setback": "Required distance between a building and property lines. Zoning laws often require structures to be built a minimum distance (like 10 or 20 feet) from property boundaries to ensure space between neighbors.",
    "FAR": "Floor Area Ratio - The ratio of a building's total floor area to the size of the lot it sits on. A FAR of 2.0 means you can build twice as much floor space as your lot size (like a 2-story building covering the whole lot, or a 4-story building covering half).",
    "quorum": "The minimum number of members needed to conduct official business. If a board has 7 members and requires a quorum of 4, nothing can be voted on unless at least 4 members are present.",
    "motion": "A formal proposal for the group to take action on something. A board member says 'I move to approve the budget' to start the process of voting on an item.",
    "second": "Support from another member needed before a motion can be discussed. After someone makes a motion, another member must say 'I second that motion' before the group can debate and vote on it.",
    "table": "To postpone discussion of an item to a later time. When a board 'tables' an item, they're setting it aside to discuss at a future meeting - it doesn't mean rejecting it.",
    "amend": "To change or modify a motion before voting on it. If someone moves to approve a $50,000 budget, another member can amend it to $45,000 instead.",
    "overlay district": "Additional zoning rules layered on top of base zoning. For example, a historic overlay district might require special architectural review for any changes to buildings, even if regular zoning would allow them.",
    "inclusionary zoning": "Rules requiring new developments to include affordable housing. A town might require that 10-20% of units in any new apartment building be rented at below-market rates.",
    "PILOT": "Payment In Lieu Of Taxes - Negotiated payments from tax-exempt organizations. Since hospitals, colleges, and nonprofits don't pay property taxes, cities often negotiate PILOT agreements so these large institutions still contribute to city services.",
    "eminent domain": "Government power to take private property for public use with fair compensation. A city can acquire private land for a new road or school, but must pay the owner fair market value.",
    "zoning": "The system of rules that divides a city into different areas (zones) and specifies what can be built in each area. Residential zones allow homes, commercial zones allow stores and offices, industrial zones allow factories. Zoning determines building height, density, parking requirements, and acceptable uses for each area.",
    "site plan": "A detailed drawing showing exactly how a property will be developed - where buildings go, parking lot layout, landscaping, drainage, and utilities. Site plans must be approved by the planning board before construction can begin.",
    "conditional use": "A use that's allowed in a zone only with special approval. For example, a daycare center might be a conditional use in a residential zone - it can be approved but only if it meets certain requirements like parking and noise limits.",
    "subdivision": "Dividing a larger piece of land into smaller lots. If a farmer wants to sell off part of their land for housing development, they must go through a subdivision approval process.",
    "abatement": "Reduction or elimination of taxes, fees, or penalties. Property tax abatements are often offered to attract businesses - a company might get reduced property taxes for 5 years if they build a new facility.",
    "ordinance": "A local law passed by city council or town meeting. Ordinances cover everything from noise regulations to building codes to parking rules.",
    "warrant article": "An item on the agenda at a town meeting that requires voter action. Town meeting members vote on warrant articles to approve budgets, zoning changes, and new bylaws.",
    "public hearing": "A meeting where residents can speak for or against a proposed action. Before major decisions like zoning changes, governments must hold public hearings to gather community input.",
    "special permit": "Approval required for certain uses that need extra review. Similar to conditional use - some activities are allowed in a zone but require special permit approval to ensure they won't cause problems.",
    "easement": "Legal right to use someone else's property for a specific purpose. A utility company might have an easement across your property to maintain power lines, even though you own the land.",
    "impact fee": "A one-time charge on new development to pay for public infrastructure. If a new subdivision will increase traffic, the developer might pay an impact fee to help fund road improvements.",
}

# Topic Subscriptions
@app.post("/api/subscriptions/create")
async def create_subscription(req: Request):
    data = await req.json()
    topic = data.get("topic", "").strip()
    email = data.get("email", "")
    frequency = data.get("frequency", "instant")
    user_id = "default_user"
    
    if not topic:
        raise HTTPException(400, "Topic is required")
    
    if user_id not in TOPIC_SUBSCRIPTIONS:
        TOPIC_SUBSCRIPTIONS[user_id] = {}
    
    TOPIC_SUBSCRIPTIONS[user_id][topic] = {
        "email": email,
        "frequency": frequency,
        "created_at": datetime.now().isoformat(),
        "match_count": 0
    }
    return {"status": "subscribed", "topic": topic}

@app.get("/api/subscriptions/list")
async def list_subscriptions():
    user_id = "default_user"
    subs = TOPIC_SUBSCRIPTIONS.get(user_id, {})
    return {"subscriptions": [{"topic": k, **v} for k, v in subs.items()]}

@app.delete("/api/subscriptions/delete")
async def delete_subscription(req: Request):
    data = await req.json()
    topic = data.get("topic")
    user_id = "default_user"
    
    if user_id in TOPIC_SUBSCRIPTIONS and topic in TOPIC_SUBSCRIPTIONS[user_id]:
        del TOPIC_SUBSCRIPTIONS[user_id][topic]
    return {"status": "unsubscribed", "topic": topic}

@app.post("/api/subscriptions/check_matches")
async def check_subscription_matches(req: Request):
    data = await req.json()
    transcript = data.get("transcript", "")
    user_id = "default_user"
    
    matches = []
    subs = TOPIC_SUBSCRIPTIONS.get(user_id, {})
    
    for topic, sub_data in subs.items():
        if topic.lower() in transcript.lower():
            idx = transcript.lower().find(topic.lower())
            context = transcript[max(0, idx-50):idx+len(topic)+50]
            matches.append({"topic": topic, "context": f"...{context}..."})
            TOPIC_SUBSCRIPTIONS[user_id][topic]["match_count"] = sub_data.get("match_count", 0) + 1
    
    return {"matches": matches}

# Issue Timeline
@app.post("/api/issues/create")
async def create_issue(req: Request):
    data = await req.json()
    name = data.get("name", "").strip()
    
    if not name:
        raise HTTPException(400, "Issue name is required")
    
    issue_id = str(uuid.uuid4())[:8]
    ISSUE_TIMELINES[issue_id] = {
        "id": issue_id,
        "name": name,
        "keywords": data.get("keywords", []),
        "meetings": [],
        "created_at": datetime.now().isoformat()
    }
    return {"status": "created", "issue_id": issue_id, "name": name}

@app.get("/api/issues/list")
async def list_issues():
    return {"issues": list(ISSUE_TIMELINES.values())}

@app.post("/api/issues/add_meeting")
async def add_meeting_to_issue(req: Request):
    data = await req.json()
    issue_id = data.get("issue_id")
    
    if issue_id not in ISSUE_TIMELINES:
        raise HTTPException(404, "Issue not found")
    
    meeting = {
        "video_id": data.get("video_id"),
        "video_title": data.get("video_title"),
        "date": datetime.now().isoformat(),
        "summary": data.get("summary", ""),
        "decisions": data.get("decisions", [])
    }
    ISSUE_TIMELINES[issue_id]["meetings"].append(meeting)
    return {"status": "added", "issue_id": issue_id}

@app.post("/api/issues/auto_track")
async def auto_track_issue(req: Request):
    data = await req.json()
    issue_id = data.get("issue_id")
    transcript = data.get("transcript", "")
    
    if issue_id not in ISSUE_TIMELINES:
        raise HTTPException(404, "Issue not found")
    
    issue = ISSUE_TIMELINES[issue_id]
    name_lower = issue["name"].lower()
    mention_count = transcript.lower().count(name_lower)
    
    return {
        "issue_id": issue_id,
        "issue_name": issue["name"],
        "mention_count": mention_count,
        "ai_summary": f"Issue '{issue['name']}' was mentioned {mention_count} times in this meeting.",
        "ai_decisions": []
    }

@app.get("/api/issues/{issue_id}/timeline")
async def get_issue_timeline(issue_id: str):
    if issue_id not in ISSUE_TIMELINES:
        raise HTTPException(404, "Issue not found")
    return ISSUE_TIMELINES[issue_id]

# Meeting Comparison
@app.post("/api/compare/meetings")
async def compare_meetings(req: Request):
    data = await req.json()
    meeting1 = data.get("meeting1", {})
    meeting2 = data.get("meeting2", {})
    
    # Extract entities/topics from both meetings
    entities1 = set(e.get("text", "").lower() for e in meeting1.get("entities", []))
    entities2 = set(e.get("text", "").lower() for e in meeting2.get("entities", []))
    
    new_topics = list(entities1 - entities2)[:15]
    ongoing_topics = list(entities1 & entities2)[:15]
    resolved_topics = list(entities2 - entities1)[:15]
    
    return {
        "new_topics": new_topics,
        "ongoing_topics": ongoing_topics,
        "resolved_topics": resolved_topics,
        "evolution_summary": f"The current meeting introduces {len(new_topics)} new topics while {len(ongoing_topics)} topics continue from the previous meeting."
    }

# Jargon Translator
@app.post("/api/jargon/explain")
async def explain_jargon(req: Request):
    """Explain civic/government jargon using GPT for intelligent context-aware definitions"""
    data = await req.json()
    term = data.get("term", "").strip()
    
    if not term:
        raise HTTPException(400, "Term is required")
    
    # Check dictionary first for common terms
    for key, explanation in JARGON_DICTIONARY.items():
        if key.lower() == term.lower():
            return {"term": key, "explanation": explanation, "source": "dictionary"}
    
    # Use GPT for intelligent civic context explanation
    if not OPENAI_API_KEY:
        return {
            "term": term,
            "explanation": f"'{term}' is a civic or government term. No API key available for AI-powered definitions.",
            "example": None,
            "source": "fallback"
        }
    
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY)
        
        prompt = f"""You are an expert in local government, civic processes, and municipal administration.

A user wants to understand the term: "{term}"

Provide a comprehensive, detailed explanation of this term in the context of:
- Local government meetings (city council, planning board, zoning board, school committee)
- Municipal processes and procedures
- Civic engagement and public participation
- Budget and finance in local government
- Land use, zoning, and development

Your explanation should be:
1. Written for someone with no government experience (8th grade reading level)
2. Focused on how this term is used in LOCAL government context
3. 3-5 sentences that fully explain the concept
4. Always include a concrete real-world example of how this comes up in meetings
5. Explain WHY this matters to residents

Respond in this JSON format:
{{
  "explanation": "Your detailed plain-language explanation here (3-5 sentences)",
  "example": "A concrete example like: In a recent town meeting, the planning board discussed a variance request from a homeowner who wanted to build a shed closer to their property line than normally allowed."
}}"""

        response = client.chat.completions.create(
            model="gpt-5.1",
            messages=[
                {"role": "system", "content": "You are a helpful civic education assistant that explains government terms in plain, detailed language with real examples. Never give generic responses."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.3
        )
        
        response_text = response.choices[0].message.content.strip()
        
        # Parse JSON response
        import json
        try:
            # Clean up potential markdown formatting
            if response_text.startswith("```"):
                response_text = response_text.split("```")[1]
                if response_text.startswith("json"):
                    response_text = response_text[4:]
            
            result = json.loads(response_text)
            return {
                "term": term,
                "explanation": result.get("explanation", response_text),
                "example": result.get("example"),
                "source": "ai"
            }
        except json.JSONDecodeError:
            # If JSON parsing fails, use raw response
            return {
                "term": term,
                "explanation": response_text,
                "example": None,
                "source": "ai"
            }
            
    except Exception as e:
        print(f"[jargon] GPT explanation failed: {e}")
        # Fallback explanation
        return {
            "term": term,
            "explanation": f"'{term}' is a term that may appear in local government meetings. For an accurate definition in your specific context, consult your local government's glossary or ask a meeting administrator.",
            "example": None,
            "source": "fallback"
        }

@app.get("/api/jargon/dictionary")
async def get_jargon_dictionary():
    return {"terms": [{"term": k, "explanation": v} for k, v in JARGON_DICTIONARY.items()]}

# Knowledge Graph
@app.post("/api/graph/build")
async def build_knowledge_graph(req: Request):
    data = await req.json()
    meetings_data = data.get("meetings_data", [])
    
    nodes = []
    edges = []
    entity_meetings = {}
    
    for meeting in meetings_data:
        meeting_id = f"meeting_{meeting.get('video_id')}"
        nodes.append({"id": meeting_id, "label": meeting.get("title", "Unknown"), "type": "meeting"})
        
        for entity in meeting.get("entities", []):
            entity_text = entity.get("text", "").lower()
            entity_id = f"entity_{entity_text.replace(' ', '_')}"
            
            if entity_id not in entity_meetings:
                entity_meetings[entity_id] = {"text": entity.get("text"), "meetings": []}
                nodes.append({"id": entity_id, "label": entity.get("text"), "type": entity.get("type", "unknown")})
            
            entity_meetings[entity_id]["meetings"].append(meeting_id)
            edges.append({"source": meeting_id, "target": entity_id})
    
    # Find shared entities
    shared_entities = []
    for entity_id, data in entity_meetings.items():
        if len(data["meetings"]) > 1:
            shared_entities.append({"name": data["text"], "meeting_count": len(data["meetings"])})
    
    cross_connections = sum(1 for e in entity_meetings.values() if len(e["meetings"]) > 1)
    
    return {
        "nodes": nodes,
        "edges": edges,
        "shared_entities": sorted(shared_entities, key=lambda x: x["meeting_count"], reverse=True),
        "stats": {
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "cross_meeting_connections": cross_connections
        }
    }

# ============================================================================
# END v6.0 NEW FEATURE ENDPOINTS
# ============================================================================


# ============================================================================
# v6.1 NEW FEATURES: Scorecard, Share Moment, Accessibility
# ============================================================================

@app.post("/api/meeting/scorecard")
async def generate_meeting_scorecard(req: Request):
    """Generate a meeting scorecard with key metrics"""
    data = await req.json()
    transcript = data.get("transcript", "")
    highlights = data.get("highlights", [])
    entities = data.get("entities", [])
    
    # Count metrics from transcript
    text_lower = transcript.lower()
    
    # Count votes (look for vote-related phrases)
    vote_patterns = ["vote", "voted", "all in favor", "aye", "nay", "motion passed", "motion failed", "approved", "denied", "unanimous"]
    vote_count = sum(1 for pattern in vote_patterns if pattern in text_lower)
    vote_count = min(vote_count // 2, 10)  # Normalize
    
    # Count public comments
    public_comment_patterns = ["public comment", "resident comment", "citizen comment", "open the floor", "public hearing", "community member", "my name is", "i live at", "i'm a resident"]
    public_comments = sum(text_lower.count(pattern) for pattern in public_comment_patterns)
    public_comments = min(public_comments, 50)
    
    # Count budget mentions
    budget_patterns = ["$", "dollar", "million", "thousand", "budget", "funding", "allocated", "appropriat"]
    budget_mentions = sum(text_lower.count(pattern) for pattern in budget_patterns)
    budget_mentions = min(budget_mentions // 3, 20)
    
    # Estimate duration from word count (avg 150 words per minute)
    word_count = len(transcript.split())
    duration_minutes = word_count // 150
    hours = duration_minutes // 60
    minutes = duration_minutes % 60
    duration_str = f"{hours}h {minutes}m" if hours > 0 else f"{minutes}m"
    
    # Count unique speakers (rough estimate from "said", colons after names)
    speaker_estimate = len(set(entities)) if entities else len(set([e.strip() for e in text_lower.split(':') if len(e.strip()) < 30 and len(e.strip()) > 2]))
    speaker_estimate = min(speaker_estimate, 30)
    
    # Extract hot topics from entities
    hot_topics = []
    if entities:
        # Group by type and count
        topic_counts = {}
        for e in entities:
            text = e.get('text', '') if isinstance(e, dict) else str(e)
            if text and len(text) > 2:
                topic_counts[text] = topic_counts.get(text, 0) + 1
        hot_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        hot_topics = [t[0] for t in hot_topics]
    
    # Get highlight categories if available
    categories = {}
    for h in highlights:
        cat = h.get('category', 'general') if isinstance(h, dict) else 'general'
        categories[cat] = categories.get(cat, 0) + 1
    
    return {
        "scorecard": {
            "decisions_made": vote_count,
            "public_comments": public_comments,
            "budget_items": budget_mentions,
            "duration": duration_str,
            "speakers": speaker_estimate,
            "hot_topics": hot_topics[:5],
            "highlight_categories": categories,
            "word_count": word_count,
            "engagement_score": min(100, (public_comments * 3) + (vote_count * 5) + len(hot_topics) * 2)
        }
    }


@app.post("/api/share/moment")
async def create_shareable_moment(req: Request):
    """Create a shareable link for a specific moment in a video"""
    data = await req.json()
    video_id = data.get("videoId", "")
    start_time = data.get("startTime", 0)
    end_time = data.get("endTime", start_time + 30)
    title = data.get("title", "Meeting Moment")
    description = data.get("description", "")
    
    # Generate share ID
    import hashlib
    share_id = hashlib.md5(f"{video_id}_{start_time}_{end_time}_{time.time()}".encode()).hexdigest()[:12]
    
    # Store share data (in production, use database)
    share_data = {
        "id": share_id,
        "video_id": video_id,
        "start_time": start_time,
        "end_time": end_time,
        "title": title,
        "description": description,
        "created_at": time.time(),
        "youtube_url": f"https://www.youtube.com/watch?v={video_id}&t={int(start_time)}s",
        "embed_code": f'<iframe width="560" height="315" src="https://www.youtube.com/embed/{video_id}?start={int(start_time)}&end={int(end_time)}" frameborder="0" allowfullscreen></iframe>'
    }
    
    # Store in memory (would be database in production)
    if not hasattr(app.state, 'shared_moments'):
        app.state.shared_moments = {}
    app.state.shared_moments[share_id] = share_data
    
    return {
        "share_id": share_id,
        "share_url": f"/share/{share_id}",
        "youtube_url": share_data["youtube_url"],
        "embed_code": share_data["embed_code"],
        "duration": end_time - start_time
    }


@app.get("/api/share/{share_id}")
async def get_shared_moment(share_id: str):
    """Retrieve a shared moment by ID"""
    if hasattr(app.state, 'shared_moments') and share_id in app.state.shared_moments:
        return app.state.shared_moments[share_id]
    return {"error": "Shared moment not found"}


@app.post("/api/accessibility/simplify")
async def simplify_text(req: Request):
    """Simplify text for accessibility (lower reading level)"""
    data = await req.json()
    text = data.get("text", "")
    target_level = data.get("level", "simple")  # simple, moderate, detailed
    
    if not text or not OPENAI_API_KEY:
        return {"simplified": text, "error": "No text or API key"}
    
    level_instructions = {
        "simple": "8th grade reading level. Use short sentences. Avoid jargon. Define any technical terms.",
        "moderate": "10th grade reading level. Keep important details but simplify complex language.",
        "detailed": "Keep all details but improve clarity and flow."
    }
    
    prompt = f"""Rewrite this meeting summary for accessibility at a {target_level} level.

Instructions: {level_instructions.get(target_level, level_instructions['simple'])}

Original text:
{text}

Provide the simplified version:"""
    
    result = call_openai_api(
        prompt=prompt,
        max_tokens=1000,
        model="gpt-4o-mini",
        temperature=0.3
    )
    
    return {"simplified": result, "original_length": len(text), "simplified_length": len(result)}


@app.post("/api/accessibility/translate")  
async def translate_summary(req: Request):
    """Translate summary to another language"""
    data = await req.json()
    text = data.get("text", "")
    target_language = data.get("language", "Spanish")
    
    if not text or not OPENAI_API_KEY:
        return {"translated": text, "error": "No text or API key"}
    
    prompt = f"""Translate this meeting summary to {target_language}. 
Keep the same structure and meaning. Use clear, accessible language.

Text to translate:
{text}

{target_language} translation:"""
    
    result = call_openai_api(
        prompt=prompt,
        max_tokens=1500,
        model="gpt-4o-mini",
        temperature=0.2
    )
    
    return {"translated": result, "language": target_language}


# ============================================================================
# END v6.1 NEW FEATURE ENDPOINTS
# ============================================================================


# ============================================================================
# CATCH-ALL ROUTES FOR REACT SPA (must be LAST after all API routes)
# ============================================================================

# Only add catch-all if DIST_DIR exists
if DIST_DIR:
    @app.get("/")
    async def serve_react_app_root():
        """Serve React app at root"""
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
    
    @app.get("/{full_path:path}")
    async def serve_react_app_catchall(full_path: str):
        """Catch-all for React SPA routing - must be LAST route"""
        # Don't catch API routes - they should 404 normally
        if full_path.startswith("api/"):
            raise HTTPException(404, f"API endpoint not found: /{full_path}")
        
        # Don't catch file routes
        if full_path.startswith("files/"):
            raise HTTPException(404, f"File not found: /{full_path}")
        
        # Check if it's a static file (logo, favicon, etc.)
        static_path = os.path.join(DIST_DIR, full_path)
        if os.path.isfile(static_path):
            return FileResponse(static_path)
        
        # Otherwise serve the React app for client-side routing
        return FileResponse(os.path.join(DIST_DIR, "index.html"))
    
    print("[OK] React catch-all routes registered (at end of file)")


if __name__ == "__main__":
    import uvicorn

    print("=" * 70)
    print("[*] Community Highlighter API v5.2")
    print("=" * 70)
    print(f"[*] Files directory: {FILES_DIR}")
    print(f"[*] Knowledge base: {KB_DIR}")
    
    if OPENAI_API_KEY:
        print("[*] OpenAI API: Configured")
    else:
        print("[*] OpenAI API: Not configured")
    
    if YOUTUBE_API_KEY:
        print("[*] YouTube API: Configured")
    else:
        print("[*] YouTube API: Not configured")
    
    print("[*] AI Assistant: RAG Enabled")
    print("[*] Knowledge Base: ChromaDB Active")
    print("[*] Clip Preview: Available")
    
    print("=" * 70)
    port = int(os.getenv("PORT", 8000))
    print(f"[*] Starting server on http://0.0.0.0:{port}")
    print("=" * 70)
    uvicorn.run(app, host="0.0.0.0", port=port)
