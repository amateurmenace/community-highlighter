import os, json, uuid, tempfile, shutil, subprocess, threading, re, html, asyncio
from collections import Counter, defaultdict
from datetime import datetime
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
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import yt_dlp
import zipfile
import httpx
import time

# NEW IMPORTS FOR ENHANCED FEATURES (v4.0)
import chromadb
from chromadb.utils import embedding_functions
from sentence_transformers import SentenceTransformer
import numpy as np

# Live Chat Support
try:
    from chat_downloader import ChatDownloader

    LIVE_CHAT_AVAILABLE = True
except ImportError:
    LIVE_CHAT_AVAILABLE = False
    print(
        "  chat-downloader not installed. Install with: pip install chat-downloader"
    )

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


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve static files from React build (for production)
if os.path.exists("dist"):
    app.mount("/assets", StaticFiles(directory="dist/assets"), name="assets")
    
    @app.get("/")
    async def serve_react_app():
        return FileResponse("dist/index.html")
    
    @app.get("/{full_path:path}")
    async def serve_react_app_catchall(full_path: str):
        # Check if it's an API route
        if full_path.startswith("api/"):
            raise HTTPException(404, "API endpoint not found")
        # Otherwise serve the React app
        return FileResponse("dist/index.html")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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
#   NEW: VECTOR DATABASE SETUP (ChromaDB for Knowledge Base)
# ============================================================================

# Initialize ChromaDB client with error handling for schema issues
chroma_db_path = os.path.join(KB_DIR, "chroma_db")

# Try to initialize ChromaDB, reset if schema error
try:
    chroma_client = chromadb.PersistentClient(path=chroma_db_path)
    # Test if the database is working
    chroma_client.list_collections()
except Exception as e:
    if "no such column" in str(e) or "OperationalError" in str(e):
        print("[!] ChromaDB schema outdated. Resetting database...")
        # Remove old database
        if os.path.exists(chroma_db_path):
            shutil.rmtree(chroma_db_path)
        # Create new client with fresh database
        chroma_client = chromadb.PersistentClient(path=chroma_db_path)
        print(" ChromaDB database reset successfully")
    else:
        # Re-raise if it's a different error
        raise

# Initialize sentence transformer for embeddings
embedding_model = SentenceTransformer("all-MiniLM-L6-v2")

# Create or get collection for meetings
try:
    meetings_collection = chroma_client.get_collection(
        name="community_meetings",
        embedding_function=embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        ),
    )
    print(" Using existing ChromaDB collection")
except Exception as e:
    print(f" Creating new ChromaDB collection...")
    meetings_collection = chroma_client.create_collection(
        name="community_meetings",
        embedding_function=embedding_functions.SentenceTransformerEmbeddingFunction(
            model_name="all-MiniLM-L6-v2"
        ),
    )
    print(" ChromaDB collection created")

# ============================================================================
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
def chunk_transcript_with_overlap(transcript, model="gpt-4o", strategy="balanced"):
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


def extract_key_points_from_chunk(chunk, chunk_num, total_chunks, model="gpt-4o"):
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
        retry_on_rate_limit=True,  # Enable retry on rate limit
    )

    return result


def synthesize_full_meeting(all_key_points, model="gpt-4o", strategy="concise"):
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
        system_prompt = """You are an expert at creating engaging highlights from civic meetings.
Your highlights should be specific, actionable, and backed by direct quotes.
CRITICAL: Only use complete quotes. Never use partial or cut-off quotes."""

        user_prompt = f"""Based on the key information extracted from a civic meeting, create 10 compelling highlights with supporting quotes.

KEY INFORMATION FROM MEETING:

DECISIONS MADE:
{chr(10).join(f" {d}" for d in combined_decisions[:20])}

MAJOR DISCUSSIONS:
{chr(10).join(f" {d}" for d in combined_discussions[:20])}

ACTION ITEMS:
{chr(10).join(f" {a}" for a in combined_actions[:15])}

NOTABLE QUOTES (use ONLY complete quotes):
{chr(10).join(f' "{q}"' for q in combined_quotes[:20])}

Create exactly 10 highlights. Each highlight should:
1. Summarize a key outcome, decision, or important discussion point in YOUR OWN WORDS
2. Be paired with a COMPLETE, relevant direct quote that supports it (not a fragment)
3. If a quote seems incomplete, paraphrase the content instead

Respond in this EXACT JSON format:
{{
  "highlights": [
    {{"highlight": "Brief summary of key point 1", "quote": "Complete supporting quote from the meeting"}},
    {{"highlight": "Brief summary of key point 2", "quote": "Complete supporting quote from the meeting"}},
    ...
  ]
}}"""

        max_tokens = 2500

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
        temperature=0.3,
        system_prompt=system_prompt,
        response_format="json_object" if strategy == "highlights_with_quotes" else None,
    )

    return result


def call_openai_api(
    prompt,
    max_tokens=400,
    model="gpt-4o",
    temperature=0.3,
    system_prompt=None,
    response_format=None,
    retry_on_rate_limit=True,
):
    """Enhanced OpenAI API call with rate limit handling"""
    if not OPENAI_API_KEY:
        return None

    max_retries = 2  # Reduced from 3
    retry_delay = 1  # Start with 1 second delay (reduced from 2)

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
                "model": model,
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
                timeout=120.0,
            )

            if response.status_code == 200:
                result = response.json()
                return result["choices"][0]["message"]["content"]

            elif response.status_code == 429 and retry_on_rate_limit:
                # Rate limited - wait and retry
                print(f"    Rate limited, waiting {retry_delay} seconds...")
                time.sleep(retry_delay)
                retry_delay *= 2  # Exponential backoff
                continue

            else:
                print(f"OpenAI API error: {response.status_code}")
                if response.status_code == 429:
                    print("    Tip: Upgrade your OpenAI plan or add delays")
                return None

        except Exception as e:
            print(f"OpenAI API call error: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                continue
            return None

    print("    Max retries reached")
    return None


def generate_fallback_summary(transcript):
    """Generate summary without AI - CLEANED"""
    transcript = clean_text(transcript)

    sentences = [s.strip() for s in transcript.split(".") if len(s.strip()) > 20][:20]
    if len(sentences) >= 3:
        summary = f"{sentences[0]}. {sentences[len(sentences)//2]}. {sentences[-1] if len(sentences) > 2 else sentences[1]}."
        summary = re.sub(r"\s+", " ", summary)
        summary = re.sub(r">>+", "", summary)
        if len(summary) > 500:
            summary = summary[:497] + "..."
        return summary
    else:
        return "This meeting covered important community topics and initiatives. Various proposals and concerns were discussed by the committee."


def generate_fallback_highlights(transcript):
    """Generate highlights without AI"""
    highlights = []
    sentences = [s.strip() for s in transcript.split(".") if len(s.strip()) > 30]

    important_keywords = [
        "approve",
        "decision",
        "vote",
        "budget",
        "motion",
        "proposal",
        "concern",
        "issue",
        "plan",
        "project",
        "recommend",
        "policy",
    ]

    important_sentences = []
    for sent in sentences[:100]:
        sent_lower = sent.lower()
        score = sum(1 for keyword in important_keywords if keyword in sent_lower)
        if score > 0:
            important_sentences.append((sent, score))

    important_sentences.sort(key=lambda x: x[1], reverse=True)

    topics = [
        "meeting opening and agenda",
        "budget and financial matters",
        "community development initiatives",
        "public safety and services",
        "infrastructure improvements",
    ]

    for i in range(min(10, len(important_sentences))):
        quote = important_sentences[i][0][:200]
        if not quote.endswith("."):
            quote = quote[: quote.rfind(" ")] + "..."
        highlights.append(
            {
                "highlight": f"Discussion about {topics[i % len(topics)]}",
                "quote": quote,
            }
        )

    return highlights


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
def root():
    return {
        "message": "Community Highlighter API v5.0 - Enhanced AI Assistant",
        "status": "running",
    }


@app.get("/api/health")
async def health_check():
    """Health check endpoint for deployment monitoring"""
    return {
        "status": "healthy",
        "version": "5.0",
        "features": {
            "ai_assistant": bool(OPENAI_API_KEY),
            "knowledge_base": True,
            "live_mode": False
        }
    }



def parse_vtt_to_transcript(vtt_content: str) -> list:
    """Parse VTT content into transcript format for AI assistant"""
    transcript_data = []
    lines = vtt_content.split("\n")
    i = 0

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
                duration = max(end_seconds - start_seconds, 1.0)

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
                    transcript_data.append(
                        {"text": text, "start": start_seconds, "duration": duration}
                    )
            except Exception as e:
                print(f"   Warning: Could not parse timestamp: {e}")

        i += 1

    print(f"   Parsed {len(transcript_data)} segments from VTT")
    return transcript_data


@app.post("/api/transcript")
async def get_transcript(req: Request):
    from typing import Dict, Any, Optional

    data = await req.json()
    url = data.get("url")
    video_id = data.get("videoId") or get_video_id(url)

    if not video_id:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL or video ID")

    print(f"[*][>] Getting transcript for video: {video_id}")

    # Try YouTube Transcript API FIRST (most reliable)
    try:
        print("   Trying YouTubeTranscriptApi...")
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)

        transcript = None
        for t in transcript_list:
            if t.language_code.startswith("en"):
                transcript = t
                break

        if not transcript:
            transcript = next(iter(transcript_list))

        if transcript:
            transcript_data = transcript.fetch()

            #  Store for AI assistant
            STORED_TRANSCRIPTS[video_id] = transcript_data
            print(
                f" STORED {len(transcript_data)} segments (Method: YouTubeTranscriptApi)"
            )

            vtt = to_vtt(transcript_data)
            return Response(content=vtt, media_type="text/vtt")

    except Exception as e:
        print(f"   YouTubeTranscriptApi failed: {e}")
        print(
            f"   This may be due to: disabled captions, age restrictions, or private video"
        )

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
                    print(f"   Could not parse YouTube Data API VTT: {parse_error}")

                return Response(content=vtt, media_type="text/vtt")
        except Exception as e:
            print(f"   YouTube Data API failed: {e}")

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
                        async with httpx.AsyncClient() as client:
                            resp = await client.get(vtt_url)
                            if resp.status_code == 200:
                                vtt_content = resp.text
                                print(f" Got VTT via yt-dlp")

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
                                        print(f"   VTT parsing returned no data")
                                except Exception as parse_error:
                                    print(
                                        f"   Could not parse yt-dlp VTT: {parse_error}"
                                    )

                                return Response(
                                    content=vtt_content, media_type="text/vtt"
                                )

    except Exception as e:
        print(f"   yt-dlp failed: {e}")

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
        {"text": word, "count": count} for word, count in word_counts.most_common(50)
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

    if not transcript:
        raise HTTPException(400, "No transcript provided")

    print(
        f" Processing transcript: {len(transcript):,} characters, strategy={strategy}"
    )

    chunks, needs_processing = chunk_transcript_with_overlap(transcript, model)

    if needs_processing and len(chunks) > 1:
        print(f" Using map-reduce for {len(chunks)} chunks")

        all_key_points = []
        for i, chunk in enumerate(chunks):
            print(f"   Analyzing chunk {i+1}/{len(chunks)}...")
            key_points = extract_key_points_from_chunk(chunk, i + 1, len(chunks), model)
            if key_points:
                all_key_points.append(key_points)

        if not all_key_points:
            print("  Key point extraction failed, using fallback")
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

        print(f" Synthesizing final {strategy}...")
        ai_result = synthesize_full_meeting(all_key_points, model, strategy)

        if ai_result:
            if strategy == "highlights_with_quotes":
                try:
                    parsed = json.loads(ai_result)
                    highlights = parsed.get("highlights", [])

                    if isinstance(highlights, list) and len(highlights) > 0:
                        print(f" Generated {len(highlights)} highlights")
                        return {
                            "summarySentences": json.dumps(highlights),
                            "strategy": strategy,
                        }
                except json.JSONDecodeError:
                    print("  JSON parsing failed")
            else:
                print(f" Generated summary ({len(ai_result)} chars)")
                return {"summarySentences": ai_result, "strategy": strategy}

    else:
        print(" Transcript fits in one chunk")

        if strategy == "highlights_with_quotes":
            system_prompt = """You are an expert at analyzing civic meetings."""

            user_prompt = f"""Analyze this civic meeting and create 10 key highlights with direct quotes.

TRANSCRIPT:
{transcript}

Respond in this EXACT JSON format:
{{
  "highlights": [
    {{"highlight": "Summary of key point", "quote": "Direct quote from transcript"}},
    ...
  ]
}}"""

            ai_result = call_openai_api(
                prompt=user_prompt,
                max_tokens=2500,
                model=model,
                temperature=0.3,
                system_prompt=system_prompt,
                response_format="json_object",
            )

            if ai_result:
                try:
                    parsed = json.loads(ai_result)
                    highlights = parsed.get("highlights", [])
                    if isinstance(highlights, list) and len(highlights) > 0:
                        return {
                            "summarySentences": json.dumps(highlights),
                            "strategy": strategy,
                        }
                except:
                    pass

        else:
            system_prompt = """You are an expert at summarizing civic meetings."""

            user_prompt = f"""Summarize this civic meeting.

TRANSCRIPT:
{transcript}

{"Provide 3-5 key sentences covering main decisions and outcomes." if strategy == "concise" else "Provide 2-3 paragraphs covering decisions, discussions, and next steps."}"""

            ai_result = call_openai_api(
                prompt=user_prompt,
                max_tokens=800 if strategy == "detailed" else 500,
                model=model,
                temperature=0.3,
                system_prompt=system_prompt,
            )

            if ai_result:
                return {"summarySentences": ai_result, "strategy": strategy}

    print("  Using fallback")
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
    model = data.get("model", "gpt-4")  # Default to GPT-4

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


async def get_ai_entities_improved(transcript, model="gpt-4o"):
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

1. PEOPLE - MUST have first AND last name
   YES: "John Smith", "Mayor Sarah Johnson", "Dr. Michael Chen"
   NO: "John", "the mayor", "someone", single names

2. PLACES - MUST be specific named locations  
   YES: "Springfield City Hall", "Oak Street", "Lincoln Park", "Washington D.C."
   NO: "the building", "downtown", "a park"

3. ORGANIZATIONS - MUST be official names
   YES: "Google", "Department of Transportation", "Springfield School Board"
   NO: "the department", "a company", "the board"

4. TECHNOLOGY - MUST be specific product names
   YES: "Microsoft Teams", "Zoom", "iPhone"
   NO: "software", "the app", "technology"

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
                seen.add(text.lower())
                valid_entities.append({"text": text, "count": count, "type": entity_type})

        valid_entities.sort(key=lambda x: x["count"], reverse=True)
        print(f"[OK] Extracted {len(valid_entities)} high-quality entities")
        return valid_entities[:40]

    except Exception as e:
        print(f"[!] Entity extraction failed: {e}")
        return generate_fallback_entities(transcript)



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


def simple_job(job_id, vid, clips, format_type="combined"):
    """Process video clips"""
    job = JOBS[job_id]
    job["status"] = "running"
    job["percent"] = 5
    job["message"] = "Downloading video..."

    work = tempfile.mkdtemp()

    try:
        video_file = os.path.join(work, "video.mp4")
        cmd = [
            "yt-dlp",
            "-f",
            "best[ext=mp4]",
            "-o",
            video_file,
            f"https://www.youtube.com/watch?v={vid}",
        ]
        subprocess.run(cmd, capture_output=True)

        if not os.path.exists(video_file):
            raise Exception("Failed to download video")

        job["percent"] = 30
        job["message"] = f"Processing {len(clips)} clips..."

        if format_type == "individual":
            output = os.path.join(FILES_DIR, f"clips_{job_id[:8]}.zip")
            with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as zf:
                for i, clip in enumerate(clips):
                    job["percent"] = 30 + int(60 * i / len(clips))
                    clip_file = os.path.join(work, f"clip_{i+1:03d}.mp4")
                    start = clip.get("start", 0)
                    end = clip.get("end", start + 10)
                    duration = end - start

                    cmd = [
                        "ffmpeg",
                        "-i",
                        video_file,
                        "-ss",
                        str(start),
                        "-t",
                        str(duration),
                        "-c:v",
                        "libx264",
                        "-preset",
                        "fast",
                        "-c:a",
                        "aac",
                        clip_file,
                        "-y",
                    ]
                    subprocess.run(cmd, capture_output=True)

                    if os.path.exists(clip_file):
                        label = clip.get("label", f"Clip {i+1}")[:50]
                        safe_label = re.sub(r"[^\w\s-]", "", label).strip()
                        zf.write(clip_file, f"clip_{i+1:03d}_{safe_label}.mp4")

        elif format_type == "social":
            output = os.path.join(FILES_DIR, f"social_{job_id[:8]}.mp4")
            total_duration = 0
            selected_clips = []
            for clip in clips:
                duration = clip.get("end", 0) - clip.get("start", 0)
                if total_duration + duration <= 60:
                    selected_clips.append(clip)
                    total_duration += duration
                else:
                    break

            if selected_clips:
                start = selected_clips[0].get("start", 0)
                cmd = [
                    "ffmpeg",
                    "-i",
                    video_file,
                    "-ss",
                    str(start),
                    "-t",
                    "60",
                    "-vf",
                    "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
                    "-c:v",
                    "libx264",
                    "-preset",
                    "fast",
                    "-c:a",
                    "aac",
                    output,
                    "-y",
                ]
                subprocess.run(cmd, capture_output=True)

        else:
            output = os.path.join(FILES_DIR, f"highlight_{job_id[:8]}.mp4")
            if clips:
                concat_file = os.path.join(work, "concat.txt")
                with open(concat_file, "w") as f:
                    for i, clip in enumerate(clips[:10]):
                        clip_file = os.path.join(work, f"temp_{i}.mp4")
                        start = clip.get("start", 0)
                        end = clip.get("end", start + 10)
                        duration = end - start

                        cmd = [
                            "ffmpeg",
                            "-i",
                            video_file,
                            "-ss",
                            str(start),
                            "-t",
                            str(duration),
                            "-c",
                            "copy",
                            clip_file,
                            "-y",
                        ]
                        subprocess.run(cmd, capture_output=True)

                        if os.path.exists(clip_file):
                            f.write(f"file '{clip_file}'\n")

                cmd = [
                    "ffmpeg",
                    "-f",
                    "concat",
                    "-safe",
                    "0",
                    "-i",
                    concat_file,
                    "-c",
                    "copy",
                    output,
                    "-y",
                ]
                subprocess.run(cmd, capture_output=True)

        if os.path.exists(output):
            job["status"] = "done"
            job["message"] = "Ready to download!"
            job["file"] = f"/files/{os.path.basename(output)}"
            job["zip"] = f"/files/{os.path.basename(output)}"
            job["percent"] = 100
        else:
            raise Exception("Failed to create output")

    except Exception as e:
        job["status"] = "error"
        job["message"] = str(e)[:200]
        print(f"Job error: {e}")
    finally:
        shutil.rmtree(work, ignore_errors=True)


@app.post("/api/render_clips")
async def render_clips(req: Request):
    data = await req.json()
    vid = data.get("videoId", "")
    clips = data.get("clips", [])
    format_type = data.get("format", "combined")

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {"status": "queued", "percent": 0, "message": "Starting..."}

    threading.Thread(
        target=simple_job, args=(job_id, vid, clips, format_type), daemon=True
    ).start()
    return {"jobId": job_id}


@app.get("/api/job_status")
async def job_status(jobId: str):
    return JOBS.get(jobId, {"status": "error", "message": "Unknown job"})


@app.post("/api/download_mp4")
async def download_mp4(req: Request):
    data = await req.json()
    vid = data.get("videoId", "")

    output = os.path.join(FILES_DIR, f"{vid}.mp4")
    if not os.path.exists(output):
        cmd = [
            "yt-dlp",
            "-f",
            "best",
            "-o",
            output,
            f"https://www.youtube.com/watch?v={vid}",
        ]
        subprocess.run(cmd, capture_output=True)

    if os.path.exists(output):
        return {"file": f"/files/{os.path.basename(output)}"}

    raise HTTPException(500, "Download failed")


@app.post("/api/highlight_reel")
async def highlight_reel(req: Request):
    """Create highlight reel from quotes"""
    data = await req.json()
    vid = data.get("videoId", "")
    quotes = data.get("quotes", [])
    pad = data.get("pad", 2)
    format_type = data.get("format", "combined")

    clips = []
    for i, quote in enumerate(quotes[:10]):
        start = i * 30
        clips.append({"start": start, "end": start + 15, "label": quote[:60]})

    job_id = str(uuid.uuid4())
    JOBS[job_id] = {"status": "queued", "percent": 0, "message": "Building reel..."}

    threading.Thread(
        target=simple_job, args=(job_id, vid, clips, format_type), daemon=True
    ).start()
    return {"jobId": job_id}


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
        print(f"  Analyzing chat sentiment for: {video_id}")
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
        print(f"  Gathering chat statistics for: {video_id}")
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
                "description": "Original $6.50/video   $0.50/video",
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
                transcript = YouTubeTranscriptApi.get_transcript(video_id)

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
# [*]Å¡â‚¬ NEW: AI MEETING ASSISTANT (RAG-based Chat) (v4.0)
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
                print(f"✅ Using cached transcript: {len(transcript_data)} segments")
            else:
                try:
                    transcript_data = YouTubeTranscriptApi.get_transcript(meeting_id)
                    STORED_TRANSCRIPTS[meeting_id] = transcript_data
                    print(f"✅ Fetched and cached {len(transcript_data)} segments")
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
            
            print(f"📊 Transcript stats: {transcript_stats}")
        
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
            print(f"📝 Using condensed transcript: {len(context_transcript)} chars (from {len(full_transcript)})")
        else:
            context_transcript = full_transcript
            print(f"📝 Using full transcript: {len(context_transcript)} chars")

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
        print(f"✅ Generated response: {len(answer)} chars")

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
        print(f"❌ Chat error: {e}")
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
                            f"   AI generated only {len(suggestions)} questions, adding fallbacks"
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
                        f"   AI suggestion generation failed: {e}, using keyword-based fallback"
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
                f"   No cached transcript for {meeting_id}, returning generic suggestions"
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
# [*]Å¡â‚¬ NEW: COMMUNITY KNOWLEDGE BASE (v4.0)
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
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
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
        meeting_docs = meetings_collection.get(where={"video_id": video_id}, limit=1)

        if not meeting_docs or not meeting_docs["documents"]:
            return {"related": [], "message": "Meeting not in knowledge base"}

        # Use the meeting's content to find similar meetings
        query_text = meeting_docs["documents"][0]

        # Search for similar content, excluding the same video
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
                    transcripts[mid] = YouTubeTranscriptApi.get_transcript(mid)
                    STORED_TRANSCRIPTS[mid] = transcripts[mid]
                except Exception as e:
                    raise HTTPException(400, f"Could not get transcript for {mid}: {e}")
            
            try:
                ydl_opts = {"quiet": True, "no_warnings": True}
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
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
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
