// ============================================================================
// api.js - Community Highlighter API Client v4.0
// ============================================================================
// Ã¢Å“â€¦ All existing functions preserved
// Ã¢Å“â€¦ New functions for enhanced features added
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

export async function apiDownloadMp4(videoId) {
  const res = await fetch(`${BACKEND_URL}/api/download_mp4`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId })
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
// Ã°Å¸â€Â´ NEW: LIVE MEETING MODE APIs
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
// Ã°Å¸â€™Â¬ NEW: AI MEETING ASSISTANT APIs
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
// Ã°Å¸Ââ€ºÃ¯Â¸Â NEW: KNOWLEDGE BASE APIs
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

// ============================================================================
// Ã°Å¸â€œÅ½ NEW: CLIP PREVIEW API
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

// ============================================================================
// Ã°Å¸â€™Â¬ LIVE CHAT APIs (PRESERVED)
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