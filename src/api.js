// ============================================================================
// api.js - Community Highlighter API Client v4.0
// ============================================================================
// All existing functions preserved
// New functions for enhanced features added
// ============================================================================

const BACKEND_URL = ""; // v5.0: Use relative URLs for deployment

// v5.0: Helper function for WebSocket URLs
const getWebSocketUrl = (path) => {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.host;
  return `${protocol}//${host}${path}`;
};

// ============================================================================
// EXISTING FUNCTIONS (PRESERVED EXACTLY)
// ============================================================================

export async function apiTranscript(data) {
  const payload = typeof data === 'string' ? { videoId: data } : data;
  
  const res = await fetch(`${BACKEND_URL}/api/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
     const err = await res.text();
     throw new Error(`Failed to fetch transcript: ${err}`);
  }
  return res.text();
}

export async function apiStoreTranscript(data) {
  const payload = typeof data === 'string' ? { videoId: data } : data;
  
  const res = await fetch(`${BACKEND_URL}/api/store_transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to store transcript: ${err}`);
  }
  return res.json();
}

export async function apiWordfreq(data) {
  const payload = typeof data === 'string' 
    ? { transcript: data } 
    : { transcript: data.transcript || data.text || '' };
  
  const res = await fetch(`${BACKEND_URL}/api/wordfreq`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
   if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch word frequency: ${err}`);
  }
  return res.json();
}

export async function apiSummaryAI(data) {
  const res = await fetch(`${BACKEND_URL}/api/summary_ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }
  
  return res.json();
}

export async function apiTranslate(data) {
  const res = await fetch(`${BACKEND_URL}/api/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Translation failed: ${errorText}`);
  }
  
  return res.json();
}

export async function apiRenderJob(data) {
  const res = await fetch(`${BACKEND_URL}/api/render_clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
   if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to start render job: ${err}`);
  }
  return res.json();
}

export async function apiJobStatus(jobId) {
  const res = await fetch(`${BACKEND_URL}/api/job_status?jobId=${jobId}`);
   if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get job status: ${err}`);
  }
  return res.json();
}

export async function apiDownloadMp4(data) {
  const payload = typeof data === 'string' ? { videoId: data } : data;
  const res = await fetch(`${BACKEND_URL}/api/download_mp4`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
   if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get download link: ${err}`);
  }
  return res.json();
}

export async function apiMetadata(videoId) {
  const res = await fetch(`${BACKEND_URL}/api/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId })
  });
   if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get metadata: ${err}`);
  }
  return res.json();
}

export async function apiHighlightReel(data) {
  const payload = typeof data === 'string' 
    ? { videoId: data }
    : data;
  
  const res = await fetch(`${BACKEND_URL}/api/highlight_reel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
   if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create highlight reel: ${err}`);
  }
  return res.json();
}

export async function apiExtendedAnalytics(transcript) {
  const payload = typeof transcript === 'string' 
    ? { transcript: transcript }
    : transcript; 
    
  const res = await fetch(`${BACKEND_URL}/api/analytics/extended`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
   if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch extended analytics: ${err}`);
  }
  return res.json();
}

// ============================================================================
// OPTIMIZATION ENDPOINTS (PRESERVED)
// ============================================================================

export async function apiOptimizationStats() {
  const res = await fetch(`${BACKEND_URL}/api/optimization/stats`);
  if (!res.ok) {
    throw new Error("Failed to get optimization stats");
  }
  return res.json();
}

export async function apiClearCache(videoId = null) {
  const url = videoId 
    ? `${BACKEND_URL}/api/optimization/clear_cache?video_id=${videoId}`
    : `${BACKEND_URL}/api/optimization/clear_cache`;
    
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    throw new Error("Failed to clear cache");
  }
  return res.json();
}

// ============================================================================
// NEW: LIVE MEETING MODE APIs
// ============================================================================

/**
 * Start monitoring a YouTube livestream for real-time transcription
 * @param {Object} data - { videoId, meetingId }
 * @returns {Promise<Object>} Status and meeting ID
 */
export async function apiStartLiveMonitoring(data) {
  const res = await fetch(`${BACKEND_URL}/api/live/start_monitoring`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to start live monitoring: ${err}`);
  }
  return res.json();
}

// ============================================================================
// NEW: AI MEETING ASSISTANT APIs
// ============================================================================

/**
 * Chat with a meeting using RAG (Retrieval Augmented Generation)
 * @param {Object} data - { query, meetingId, contextLimit }
 * @returns {Promise<Object>} Answer with sources
 */
export async function apiChatWithMeeting(data) {
  const res = await fetch(`${BACKEND_URL}/api/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Chat failed: ${err}`);
  }
  return res.json();
}

/**
 * Stream chat response via SSE — token by token
 * @param {Object} data - { query, meetingId, conversationHistory, model }
 * @param {Function} onChunk - Called with (chunk, fullTextSoFar)
 * @param {Function} onDone - Called with { fullText, suggestions, stats }
 * @param {Function} onError - Called with Error
 * @returns {AbortController} - call .abort() to cancel
 */
export function streamChatWithMeeting(data, onChunk, onDone, onError) {
  const controller = new AbortController();
  fetch(`${BACKEND_URL}/api/assistant/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.text();
      onError && onError(new Error(`Chat stream error ${res.status}: ${err}`));
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          if (parsed.error) {
            onError && onError(new Error(parsed.error));
            return;
          }
          if (parsed.done) {
            // Final message with suggestions and stats
            onDone && onDone({ fullText, suggestions: parsed.suggestions || [], stats: parsed.stats });
            return;
          }
          if (parsed.text) {
            fullText += parsed.text;
            onChunk && onChunk(parsed.text, fullText);
          }
        } catch (e) { /* skip malformed */ }
      }
    }
    // Stream ended without done signal
    if (fullText) {
      onDone && onDone({ fullText, suggestions: [], stats: {} });
    } else {
      // Stream completed but no text received — try non-streaming fallback
      console.warn("[Chat] SSE stream returned no text, trying non-streaming fallback");
      try {
        const fallbackRes = await fetch(`${BACKEND_URL}/api/assistant/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          signal: controller.signal,
        });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.answer) {
            onChunk && onChunk(fallbackData.answer, fallbackData.answer);
            onDone && onDone({ fullText: fallbackData.answer, suggestions: fallbackData.suggestions || [], stats: fallbackData.stats || {} });
            return;
          }
        }
      } catch (fbErr) {
        console.warn("[Chat] Non-streaming fallback also failed:", fbErr);
      }
      onError && onError(new Error("No response received from AI. Please check your API keys are configured."));
    }
  }).catch((err) => {
    if (err.name !== "AbortError") onError && onError(err);
  });
  return controller;
}

/**
 * Get suggested questions based on meeting content
 * @param {Object} data - { meetingId }
 * @returns {Promise<Object>} List of suggested questions
 */
export async function apiChatSuggestions(data) {
  const res = await fetch(`${BACKEND_URL}/api/assistant/suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get suggestions: ${err}`);
  }
  return res.json();
}

// ============================================================================
// NEW: KNOWLEDGE BASE APIs
// ============================================================================

/**
 * Add a meeting to the searchable knowledge base
 * @param {Object} data - { videoId, metadata }
 * @returns {Promise<Object>} Success status with details
 */
export async function apiAddToKnowledgeBase(data) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/add_meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to add to knowledge base: ${err}`);
  }
  return res.json();
}

/**
 * Search across all meetings in the knowledge base
 * @param {Object} data - { query, limit, filters }
 * @returns {Promise<Object>} Search results with relevance scores
 */
export async function apiSearchKnowledgeBase(data) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Search failed: ${err}`);
  }
  return res.json();
}

/**
 * Find meetings related to a specific meeting
 * @param {Object} data - { videoId, limit }
 * @returns {Promise<Object>} Related meetings with similarity scores
 */
export async function apiFindRelated(data) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/find_related`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to find related meetings: ${err}`);
  }
  return res.json();
}

/**
 * Get statistics about the knowledge base
 * @returns {Promise<Object>} Knowledge base statistics
 */
export async function apiKnowledgeBaseStats() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/stats`);
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get KB stats: ${err}`);
  }
  return res.json();
}

// v9.2: Streaming add meeting to knowledge base with progress
export async function streamAddToKnowledgeBase(data, onProgress, onDone, onError) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/knowledge/add_meeting_stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.slice(6));
            if (parsed.done) { onDone && onDone(parsed); }
            else if (parsed.progress !== undefined) { onProgress && onProgress(parsed); }
          } catch (e) { /* ignore parse errors */ }
        }
      }
    }
  } catch (err) {
    onError && onError(err);
  }
}

// v9.2: List all meetings in knowledge base
export async function apiListKBMeetings() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/meetings`);
  if (!res.ok) throw new Error('Failed to list KB meetings');
  return res.json();
}

// ============================================================================
// KB ANALYTICS DASHBOARD API (v9.3)
// ============================================================================

export async function apiKBDashboardStats() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/dashboard_stats`);
  if (!res.ok) throw new Error('Failed to load dashboard stats');
  return res.json();
}

export async function apiEntityTracking(data = {}) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/entity_tracking`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to load entity tracking');
  return res.json();
}

export async function apiSentimentTimeline() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/sentiment_timeline`);
  if (!res.ok) throw new Error('Failed to load sentiment timeline');
  return res.json();
}

export async function apiDecisionsAcross() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/decisions_across_meetings`);
  if (!res.ok) throw new Error('Failed to load decisions');
  return res.json();
}

export async function apiTopicClusters() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/topic_clusters`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  if (!res.ok) throw new Error('Failed to load topic clusters');
  return res.json();
}

export async function apiKBCompareMeetings(data) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/compare_meetings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to compare meetings');
  return res.json();
}

export async function apiIssueAISummary(data) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/issue_ai_summary`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to generate issue summary');
  return res.json();
}

export async function apiParticipationAcross() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/participation_across`);
  if (!res.ok) throw new Error('Failed to load participation data');
  return res.json();
}

export async function apiDeleteKBMeeting(videoId) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/delete_meeting`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_id: videoId })
  });
  if (!res.ok) throw new Error('Failed to delete meeting');
  return res.json();
}

export async function apiAIComparison() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/ai_comparison`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
  });
  if (!res.ok) throw new Error('Failed to generate AI comparison');
  return res.json();
}

export async function apiTopicDrilldown(data) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/topic_drilldown`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to get topic drilldown');
  return res.json();
}

export async function apiSentimentExcerpts(data) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/sentiment_excerpts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to get sentiment excerpts');
  return res.json();
}

export async function apiKBFramingAnalysis(data = {}) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/framing_analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to get framing analysis');
  return res.json();
}

export async function apiKBWordCloud(data = {}) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/word_cloud`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to get word cloud data');
  return res.json();
}

export async function apiRenderMultiVideoClips(data) {
  const res = await fetch(`${BACKEND_URL}/api/render_multi_video_clips`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to start multi-video render');
  return res.json();
}

export async function apiSaveAnalysis(data) {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/save_analysis`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error('Failed to save analysis');
  return res.json();
}

export async function streamEnrichMeeting(videoId, onProgress, onDone, onError) {
  try {
    const res = await fetch(`${BACKEND_URL}/api/knowledge/enrich_meeting`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ video_id: videoId, force: true })
    });
    if (!res.ok) throw new Error('Enrich request failed');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (data.done) { if (onDone) onDone(data); }
          else if (data.progress < 0) { if (onError) onError(new Error(data.stage)); }
          else { if (onProgress) onProgress(data); }
        } catch {}
      }
    }
  } catch (err) {
    if (onError) onError(err);
  }
}

// ============================================================================
// NEW: CLIP PREVIEW API
// ============================================================================

/**
 * Get preview data for a clip (thumbnail and text snippet)
 * @param {Object} data - { videoId, startTime, endTime }
 * @returns {Promise<Object>} Preview with thumbnail and text
 */
export async function apiClipPreview(data) {
  const res = await fetch(`${BACKEND_URL}/api/clip/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get clip preview: ${err}`);
  }
  return res.json();
}

/**
 * Get available video resolutions/formats for a YouTube video
 */
export async function apiVideoFormats(videoId) {
  const res = await fetch(`${BACKEND_URL}/api/video_formats/${videoId}`);
  if (!res.ok) return { formats: [] };
  return res.json();
}

/**
 * Generate thumbnails for clip timeline preview
 */
export async function apiClipThumbnails(data) {
  const res = await fetch(`${BACKEND_URL}/api/clip_thumbnails`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) return { thumbnails: [] };
  return res.json();
}

// ============================================================================
// LIVE CHAT APIs (PRESERVED)
// ============================================================================

export async function apiLiveChatMessages(data) {
  const res = await fetch(`${BACKEND_URL}/api/live_chat/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get live chat: ${err}`);
  }
  return res.json();
}

export async function apiLiveChatSentiment(data) {
  const res = await fetch(`${BACKEND_URL}/api/live_chat/sentiment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to analyze sentiment: ${err}`);
  }
  return res.json();
}

export async function apiLiveChatKeywords(data) {
  const res = await fetch(`${BACKEND_URL}/api/live_chat/keywords`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to extract keywords: ${err}`);
  }
  return res.json();
}

export async function apiLiveChatHighlights(data) {
  const res = await fetch(`${BACKEND_URL}/api/live_chat/highlights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get highlights: ${err}`);
  }
  return res.json();
}

export async function apiLiveChatStats(data) {
  const res = await fetch(`${BACKEND_URL}/api/live_chat/statistics`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to get chat stats: ${err}`);
  }
  return res.json();
}

// ============================================================================
// SSE STREAMING SUPPORT
// ============================================================================

/**
 * Stream summary/highlights via SSE. Uses fetch + ReadableStream (POST body needed).
 * @param {Object} data - Request payload (transcript, strategy, model, etc.)
 * @param {Function} onChunk - Called with each text chunk
 * @param {Function} onDone - Called when stream completes
 * @param {Function} onError - Called on error
 * @returns {AbortController} - Call .abort() to cancel
 */
export function streamSummaryAI(data, onChunk, onDone, onError) {
  const controller = new AbortController();
  fetch(`${BACKEND_URL}/api/summary_ai/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.text();
      onError && onError(new Error(`Stream error ${res.status}: ${err}`));
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") {
          onDone && onDone(fullText);
          return;
        }
        try {
          const parsed = JSON.parse(payload);
          if (parsed.cached) {
            fullText = parsed.text;
            onDone && onDone(fullText);
            return;
          }
          if (parsed.text) {
            fullText += parsed.text;
            onChunk && onChunk(parsed.text, fullText);
          }
          if (parsed.error) {
            onError && onError(new Error(parsed.error));
            return;
          }
        } catch (e) { /* skip malformed */ }
      }
    }
    // Stream ended without [DONE]
    if (fullText) onDone && onDone(fullText);
  }).catch((err) => {
    if (err.name !== "AbortError") onError && onError(err);
  });
  return controller;
}

// ============================================================================
// WEBSOCKET SUPPORT
// ============================================================================

/**
 * Create a WebSocket connection for live meeting updates
 * @param {string} meetingId - Meeting/video ID
 * @returns {WebSocket} WebSocket connection
 */
export function createLiveWebSocket(meetingId) {
  const ws = new WebSocket(getWebSocketUrl(`/ws/live/${meetingId}`));
  return ws;
}

/**
 * Connect WebSocket for real-time job status updates
 * @param {string} jobId - Job ID to monitor
 * @param {Function} onUpdate - Called with job status updates
 * @param {Function} onComplete - Called when job finishes
 * @param {Function} onError - Called on WS error (triggers fallback to polling)
 * @returns {WebSocket}
 */
export function connectJobWebSocket(jobId, onUpdate, onComplete, onError) {
  const ws = new WebSocket(getWebSocketUrl(`/ws/job/${jobId}`));
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.status === "done" || data.status === "error") {
        onComplete && onComplete(data);
      } else {
        onUpdate && onUpdate(data);
      }
    } catch (e) { /* ignore */ }
  };
  ws.onerror = () => onError && onError();
  ws.onclose = (event) => {
    if (!event.wasClean) onError && onError();
  };
  return ws;
}

/**
 * Precompute summaries for a shared video link
 */
export function apiSharePrecompute(videoId, transcript) {
  return fetch(`${BACKEND_URL}/api/share/precompute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ video_id: videoId, transcript: (transcript || "").slice(0, 100000) }),
  }).catch(() => {}); // fire-and-forget
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Helper to handle API errors consistently
 * @param {Response} response - Fetch response object
 * @param {string} defaultMessage - Default error message
 */
async function handleApiError(response, defaultMessage) {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || defaultMessage);
  }
  return response;
}

/**
 * Helper to make authenticated API calls (if needed in future)
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 */
export async function apiCall(endpoint, options = {}) {
  const url = `${BACKEND_URL}${endpoint}`;
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };
  
  const config = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  };
  
  const response = await fetch(url, config);
  return handleApiError(response, `API call to ${endpoint} failed`);
}

// ============================================================================
// v6.0: NEW FEATURE API CALLS
// ============================================================================

// Topic Subscriptions
export async function apiCreateSubscription(data) {
  const res = await fetch(`${BACKEND_URL}/api/subscriptions/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiListSubscriptions() {
  const res = await fetch(`${BACKEND_URL}/api/subscriptions/list`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiDeleteSubscription(data) {
  const res = await fetch(`${BACKEND_URL}/api/subscriptions/delete`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiCheckSubscriptionMatches(data) {
  const res = await fetch(`${BACKEND_URL}/api/subscriptions/check_matches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Issue Timeline
export async function apiCreateIssue(data) {
  const res = await fetch(`${BACKEND_URL}/api/issues/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiListIssues() {
  const res = await fetch(`${BACKEND_URL}/api/issues/list`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiAddMeetingToIssue(data) {
  const res = await fetch(`${BACKEND_URL}/api/issues/add_meeting`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiAutoTrackIssue(data) {
  const res = await fetch(`${BACKEND_URL}/api/issues/auto_track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGetIssueTimeline(issueId) {
  const res = await fetch(`${BACKEND_URL}/api/issues/${issueId}/timeline`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Meeting Comparison
export async function apiCompareMeetings(data) {
  const res = await fetch(`${BACKEND_URL}/api/compare/meetings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Jargon Translator
export async function apiExplainJargon(data) {
  const res = await fetch(`${BACKEND_URL}/api/jargon/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGetJargonDictionary() {
  const res = await fetch(`${BACKEND_URL}/api/jargon/dictionary`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Knowledge Graph
export async function apiBuildKnowledgeGraph(data) {
  const res = await fetch(`${BACKEND_URL}/api/graph/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// v8.3: Topic trends across KB meetings
export async function apiTopicTrends() {
  const res = await fetch(`${BACKEND_URL}/api/knowledge/topic_trends`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// v8.3: Export endpoints
export async function apiExportSrt(data) {
  const res = await fetch(`${BACKEND_URL}/api/export/srt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

export async function apiExportPdf(data) {
  const res = await fetch(`${BACKEND_URL}/api/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.blob();
}

// ============================================================================
// v6.1 NEW FEATURES: Scorecard, Share Moment, Accessibility
// ============================================================================

// Meeting Scorecard
export async function apiMeetingScorecard(data) {
  const res = await fetch(`${BACKEND_URL}/api/meeting/scorecard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Share a Moment
export async function apiShareMoment(data) {
  const res = await fetch(`${BACKEND_URL}/api/share/moment`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiGetSharedMoment(shareId) {
  const res = await fetch(`${BACKEND_URL}/api/share/${shareId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// Accessibility
export async function apiSimplifyText(data) {
  const res = await fetch(`${BACKEND_URL}/api/accessibility/simplify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiTranslateSummary(data) {
  const res = await fetch(`${BACKEND_URL}/api/accessibility/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}