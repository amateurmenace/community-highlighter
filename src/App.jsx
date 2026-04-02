import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend } from 'recharts';

// v5.6: Desktop App Banner for cloud mode
import { DesktopAppBanner, useCloudMode } from './DesktopAppBanner';
// v7.3: Offline transcript caching (IndexedDB)
import { cacheTranscript, getCachedTranscript } from './transcriptCache';
import {
  apiTranscript, apiWordfreq, apiSummaryAI, apiTranslate,
  apiRenderJob, apiJobStatus, apiDownloadMp4, apiMetadata, apiHighlightReel,
  apiExtendedAnalytics,
  apiOptimizationStats, apiClearCache,
  apiChatWithMeeting, apiChatSuggestions,
  apiAddToKnowledgeBase, apiSearchKnowledgeBase, apiFindRelated, apiKnowledgeBaseStats,
  apiClipPreview, apiStartLiveMonitoring, apiVideoFormats, apiClipThumbnails,
  apiStoreTranscript,
  // v6.0: New feature API calls
  apiCreateSubscription, apiListSubscriptions, apiDeleteSubscription, apiCheckSubscriptionMatches,
  apiCreateIssue, apiListIssues, apiAddMeetingToIssue, apiAutoTrackIssue, apiGetIssueTimeline,
  apiCompareMeetings,
  apiExplainJargon, apiGetJargonDictionary,
  apiBuildKnowledgeGraph, apiTopicTrends, apiExportSrt, apiExportPdf,
  // v6.1: New feature API calls
  apiMeetingScorecard, apiShareMoment, apiGetSharedMoment,
  apiSimplifyText, apiTranslateSummary,
  // v8.0: Streaming, WebSocket job status, share precompute
  streamSummaryAI, connectJobWebSocket, apiSharePrecompute,
  streamChatWithMeeting
} from "./api";
// Extracted components
import AnimatedTagline from './components/AnimatedTagline';
import AboutPage from './components/AboutPage';
import SummaryLoadingTerminal from './components/SummaryLoadingTerminal';
import SectionPreviews from './components/SectionPreviews';
import GuidedTour from './components/GuidedTour';
import { QuestionFlowDiagram, FramingPluralityMap, DisagreementTopology, IssueLifecycle } from './components/MeetingViz';

// v5.2: Use relative URLs for deployment compatibility
const BACKEND_URL = "";

// v5.2: Helper to construct WebSocket URLs
function getWebSocketUrl(path) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}${path}`;
}

// Utility functions
// Fix mojibake encoding artifacts (â€" → —, â€™ → ', etc.)
const fixEncoding = (text) => {
  if (!text) return text;
  return text
    .replace(/â€"/g, '\u2014').replace(/â€"/g, '\u2013')
    .replace(/â€™/g, '\u2019').replace(/â€œ/g, '\u201c')
    .replace(/â€˜/g, '\u2018').replace(/â€¦/g, '\u2026')
    .replace(/â€[^\w]/g, '\u201d')
    .replace(/â\s/g, '\u2014 ')
    .replace(/(?<=\S)\s*â\s*(?=\S)/g, ' \u2014 ')
    .replace(/â$/g, '\u2014');
};

const toSec = (t) => {
  const s = String(t);
  const p = s.split(":");
  if (p.length === 3) return (+p[0]) * 3600 + (+p[1]) * 60 + (+p[2]);
  if (p.length === 2) return (+p[0]) * 60 + (+p[1]);
  return +s;
};

const cleanHtmlEntities = (text) => {
  if (!text) return text;
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  let cleaned = textarea.value;
  cleaned = cleaned.replace(/&gt;+/g, '');
  cleaned = cleaned.replace(/&lt;+/g, '');
  cleaned = cleaned.replace(/&amp;+/g, '&');
  cleaned = cleaned.replace(/&nbsp;+/g, ' ');
  return cleaned.trim();
};

// v6.0: Replace Brooklyn with Brookline AND fix Martin Luther -> Martin Luther King
const fixBrooklyn = (text) => {
  if (!text) return text;
  let fixed = text
    .replace(/Brooklyn/gi, 'Brookline')
    .replace(/BROOKLYN/g, 'BROOKLINE');
  // Fix Martin Luther truncation - always use full name
  fixed = fixed.replace(/\bMartin Luther\b(?! King)/gi, 'Martin Luther King');
  return fixed;
};

const padTime = (x) => {
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = Math.floor(x % 60);
  if (h > 0) {
    return `${String(h)}h ${String(m).padStart(2, "0")}m`;
  }
  if (m > 0) {
    return `${String(m)}m ${String(s).padStart(2, "0")}s`;
  }
  return `${String(s)}s`;
};

const padTimePrecise = (x) => {
  const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = Math.floor(x % 60);
  const ms = Math.floor((x % 1) * 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
};

// ============================================================================
// v7.0: ENHANCED UX HOOKS (minimal, non-breaking)
// ============================================================================

// Hook to detect scroll and add 'scrolled' class to header
function useScrollDetection() {
  useEffect(() => {
    const handleScroll = () => {
      const header = document.querySelector('header');
      if (header) {
        header.classList.toggle('scrolled', window.scrollY > 50);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
}

// Remove internal repetition in text (e.g., "hello world hello world" -> "hello world")
function removeInternalRepetition(text) {
  if (!text || text.length < 10) return text;
  
  // Normalize whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  const words = text.split(' ');
  const n = words.length;
  if (n < 4) return text;
  
  // Try splitting in half first (most common case: exact 2x repeat)
  const half = Math.floor(n / 2);
  const firstHalf = words.slice(0, half).join(' ');
  const secondHalf = words.slice(half, half * 2).join(' ');
  if (firstHalf === secondHalf) {
    return firstHalf;
  }
  
  // Try splitting in thirds (3x repeat)
  const third = Math.floor(n / 3);
  if (third >= 2) {
    const p1 = words.slice(0, third).join(' ');
    const p2 = words.slice(third, third * 2).join(' ');
    const p3 = words.slice(third * 2, third * 3).join(' ');
    if (p1 === p2 && p2 === p3) {
      return p1;
    }
  }
  
  // Try to find where the text starts repeating by looking for the first word appearing again
  const firstWord = words[0].toLowerCase();
  for (let i = 2; i <= half + 1; i++) {
    if (words[i] && words[i].toLowerCase() === firstWord) {
      // Potential repeat starting at position i
      const candidate = words.slice(0, i).join(' ');
      const rest = words.slice(i).join(' ');
      // Check if rest starts with candidate (allowing partial at end)
      if (rest === candidate || rest.startsWith(candidate + ' ') || candidate.startsWith(rest)) {
        return candidate;
      }
    }
  }
  
  return text;
}

function parseVTT(vtt) {
  if (!vtt) return [];
  const src = String(vtt).replace(/\r/g, "").replace(/^WEBVTT[^\n]*\n?/, "");
  const rx = /(\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?).*?\n([\s\S]*?)(?=\n{2,}|\n(?=\d{1,2}:\d{2}.*?--> )|$)/g;
  let m, out = [], prev = "", seenTexts = new Set();
  while ((m = rx.exec(src))) {
    const s = toSec(m[1]), e = toSec(m[2]);
    let text = cleanHtmlEntities((m[3] || ""))
      .replace(/<\d{1,2}:\d{2}:\d{2}\.\d{1,3}>/g, "")
      .replace(/<\/?c[^>]*>/gi, "")
      .replace(/<\/?[^>]+>/g, "")
      .replace(/>>+/g, "")  // CRITICAL: Remove >> symbols
      .replace(/\s+/g, " ")
      .trim();
    
    // Remove internal repetition (e.g., "hello hello hello" -> "hello")
    text = removeInternalRepetition(text);
    
    if (!text) continue;
    
    const textLower = text.toLowerCase();
    
    // Skip exact duplicates
    if (seenTexts.has(textLower)) continue;
    
    // Check for rolling/overlapping captions
    if (prev) {
      const prevLower = prev.toLowerCase();
      // If new text contains old or vice versa, it's a rolling caption
      if (textLower.includes(prevLower) || prevLower.includes(textLower)) {
        // Keep the longer one
        if (text.length > prev.length && out.length > 0) {
          out[out.length - 1].text = text;
          seenTexts.add(textLower);
          prev = text;
        }
        continue;
      }
      
      // Check word overlap
      const wordsNew = new Set(textLower.split(/\s+/));
      const wordsPrev = new Set(prevLower.split(/\s+/));
      const intersection = [...wordsNew].filter(w => wordsPrev.has(w));
      const overlap = intersection.length / Math.min(wordsNew.size, wordsPrev.size);
      if (overlap > 0.7) {
        // High overlap = rolling caption, keep longer
        if (text.length > prev.length && out.length > 0) {
          out[out.length - 1].text = text;
          prev = text;
        }
        continue;
      }
    }
    
    seenTexts.add(textLower);
    out.push({ start: s, end: e, text });
    prev = text;
  }
  
  // Post-processing pass: Remove any remaining consecutive duplicates or near-duplicates
  const deduped = [];
  for (let i = 0; i < out.length; i++) {
    const current = out[i];
    const currentLower = current.text.toLowerCase();
    
    // Check if this is a duplicate of the previous entry
    if (deduped.length > 0) {
      const lastEntry = deduped[deduped.length - 1];
      const lastLower = lastEntry.text.toLowerCase();
      
      // Skip if exact duplicate
      if (currentLower === lastLower) continue;
      
      // Skip if one contains the other (rolling caption effect)
      if (currentLower.includes(lastLower) || lastLower.includes(currentLower)) {
        // Keep the longer one
        if (current.text.length > lastEntry.text.length) {
          deduped[deduped.length - 1] = current;
        }
        continue;
      }
      
      // Skip if high word similarity (fuzzy duplicate)
      const currentWords = new Set(currentLower.split(/\s+/).filter(w => w.length > 2));
      const lastWords = new Set(lastLower.split(/\s+/).filter(w => w.length > 2));
      const intersection = [...currentWords].filter(w => lastWords.has(w));
      const similarity = intersection.length / Math.max(currentWords.size, lastWords.size, 1);
      if (similarity > 0.8) {
        // Keep the longer one
        if (current.text.length > lastEntry.text.length) {
          deduped[deduped.length - 1] = current;
        }
        continue;
      }
    }
    
    deduped.push(current);
  }
  
  return deduped;
}

function splitSentences(cues) {
  const sents = [];
  const seen = new Set(); // Deduplicate identical text at same timestamp
  for (const c of cues) {
    const parts = c.text.split(/(?<=[.!?])\s+/g);
    for (const p of parts) {
      if (p && p.length > 2) {
        const cleanText = cleanHtmlEntities(p).replace(/>>+/g, "").trim();
        if (cleanText) {
          const key = `${c.start}|${cleanText.toLowerCase()}`;
          if (!seen.has(key)) {
            seen.add(key);
            sents.push({ start: c.start, end: c.end, text: cleanText });
          }
        }
      }
    }
  }
  return sents;
}

function useDebounce(value, delay = 220) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay]);
  return v;
}

// ReelPlayer extracted to src/ReelPlayer.jsx for code-splitting (loaded via main.jsx)






// ============================================================================
// Feedback Modal Component
// ============================================================================
function FeedbackModal({ onClose }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const subject = encodeURIComponent('Community Highlighter Feedback');
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nOrganization: ${organization}\n\nFeedback:\n${feedback}`
      );
      window.location.href = `mailto:stephen@weirdmachine.org?subject=${subject}&body=${body}`;
      setSent(true);
      setTimeout(() => onClose(), 2000);
    } catch (err) {
      alert('Failed to send feedback. Please email stephen@weirdmachine.org directly.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        maxWidth: '450px',
        width: '90%',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#1e7f63' }}>Share Your Feedback</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>✕</button>
        </div>
        
        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>✦</div>
            <div style={{ fontSize: '16px', color: '#1e7f63' }}>Thank you for your feedback!</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#333' }}>Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} required
                style={{ width: '100%', padding: '10px 12px', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                placeholder="Your name" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#333' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                style={{ width: '100%', padding: '10px 12px', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                placeholder="your@email.com" />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#333' }}>Organization</label>
              <input type="text" value={organization} onChange={e => setOrganization(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box' }}
                placeholder="Your organization (optional)" />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: '#333' }}>Feedback</label>
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} required rows={4}
                style={{ width: '100%', padding: '10px 12px', border: '2px solid #e0e0e0', borderRadius: '6px', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box' }}
                placeholder="Tell us what you think, report bugs, or suggest features..." />
            </div>
            <button type="submit" disabled={sending}
              style={{ width: '100%', padding: '12px', background: '#1e7f63', color: 'white', border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: '600', cursor: sending ? 'not-allowed' : 'pointer', opacity: sending ? 0.7 : 1 }}>
              {sending ? 'Sending...' : 'Send Feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// ⚙️ NEW: Optimization Panel Component
// ============================================================================
function OptimizationPanel({ stats, onClose, onClearCache }) {
  if (!stats) return null;

  const cache = stats.cache || {};
  const savings = stats.estimated_savings || {};

  return (
    <div style={{
      position: 'fixed',
      top: '80px',
      right: '24px',
      width: '320px',
      background: 'white',
      border: '3px solid var(--line)',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '8px 8px 0px rgba(0,0,0,0.2)',
      zIndex: 1001,
      animation: 'slideIn 0.3s ease'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
        paddingBottom: '12px',
        borderBottom: '2px solid var(--line)'
      }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>⚙️ AI Optimizations</h3>
        <button onClick={onClose} style={{
          background: 'none',
          border: 'none',
          fontSize: '24px',
          cursor: 'pointer',
          padding: 0
        }}></button>
      </div>

      <div style={{
        background: '#dcfce7',
        padding: '12px',
        borderRadius: '8px',
        marginBottom: '16px',
        border: '2px solid #86efac'
      }}>
        <div style={{ fontSize: '32px', fontWeight: '700', color: '#15803d', textAlign: 'center' }}>
          {savings.percentage}%
        </div>
        <div style={{ fontSize: '13px', textAlign: 'center', color: '#15803d', marginTop: '4px' }}>
          Cost Reduction
        </div>
        <div style={{ fontSize: '11px', textAlign: 'center', color: '#16a34a', marginTop: '8px' }}>
          Saving {savings.per_video} per video
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px', color: '#64748b' }}>
          Active Optimizations:
        </div>
        {Object.entries(stats.optimizations_enabled || {}).map(([key, enabled]) => (
          <div key={key} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 0',
            fontSize: '12px'
          }}>
            <span style={{ color: enabled ? '#22c55e' : '#94a3b8' }}>
              {enabled ? '✔' : '✗'}
            </span>
            <span style={{ textTransform: 'capitalize' }}>
              {key.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>

      <div style={{
        background: '#f8f9fa',
        padding: '12px',
        borderRadius: '8px',
        marginBottom: '12px'
      }}>
        <div style={{ fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
          Cache Statistics:
        </div>
        <div style={{ fontSize: '12px', color: '#64748b' }}>
          <div>✨ Cached analyses: {cache.total_entries || 0}</div>
          <div>💬 Cache size: {cache.total_size_mb || 0} MB</div>
        </div>
      </div>

      <button
        className="btn btn-ghost"
        onClick={onClearCache}
        style={{ width: '100%', fontSize: '13px' }}
      >
        📚 Clear Cache
      </button>
    </div>
  );
}
// ============================================================================


function MeetingStatsCard({ cues, fullText, sents, videoTitle }) {
  const [isTitleExpanded, setIsTitleExpanded] = useState(false);

  const calculateStats = () => {
    if (!cues || !fullText || !sents) return null;

    const durationSeconds = cues.length > 0 ? cues[cues.length - 1].end : 0;
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.floor((durationSeconds % 3600) / 60);
    const seconds = Math.floor(durationSeconds % 60);

    const words = fullText.split(/\s+/).filter(w => w.length > 0);

    const decisionKeywords = ['approved', 'rejected', 'passed', 'failed', 'decided', 'resolved', 'motion', 'vote'];
    const decisions = sents.filter(s =>
      decisionKeywords.some(keyword => s.text.toLowerCase().includes(keyword))
    ).length;

    return {
      duration: `${hours}h ${minutes}m ${seconds}s`,
      totalWords: words.length.toLocaleString(),
      decisions: decisions
    };
  };

  const stats = calculateStats();
  if (!stats) return null;

  const titleClassName = `stat-value ${isTitleExpanded ? 'stat-value-expanded' : 'stat-value-truncate'}`;
  const titleHoverText = isTitleExpanded ? "Click to collapse" : `${videoTitle || "Meeting"} (Click to expand)`;

  return (
    <div className="compact-stats-card">
      <div className="compact-stat">
        <div
          className={titleClassName}
          title={titleHoverText}
          onClick={() => setIsTitleExpanded(!isTitleExpanded)}
          style={{ cursor: 'pointer' }}
        >
          {videoTitle || "Meeting"}
        </div>
        {/* ADDED: Expand hint */}
        <div className="stat-label">
          Meeting Name {!isTitleExpanded && <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>(click to expand)</span>}
        </div>
      </div>
      <div className="compact-stat">
        <div className="stat-value">{stats.duration}</div>
        <div className="stat-label">Duration</div>
      </div>
      <div className="compact-stat">
        <div className="stat-value">{stats.totalWords}</div>
        <div className="stat-label">Total Words</div>
      </div>
      <div className="compact-stat">
        <div className="stat-value">{stats.decisions}</div>
        <div className="stat-label">Decisions Made</div>
      </div>
    </div>
  );
}

// ============================================================================
// NEW DATA VISUALIZATIONS (recharts-based)
// ============================================================================

const RECHARTS_COLORS = ['#1E7F63', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
function KnowledgeBasePanel({ videoId, videoTitle, fullText, entities }) {
  const [kbStats, setKbStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [relatedMeetings, setRelatedMeetings] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [addedToKb, setAddedToKb] = useState(false);
  const [error, setError] = useState(null);

  // Load KB stats on mount
  useEffect(() => {
    apiKnowledgeBaseStats().then(setKbStats).catch(() => setKbStats(null));
  }, []);

  // Check if current meeting is already in KB
  useEffect(() => {
    if (!videoId) return;
    apiSearchKnowledgeBase({ query: videoId, limit: 1, filters: { video_id: videoId } })
      .then(res => { if (res.total_found > 0) setAddedToKb(true); })
      .catch(() => {});
  }, [videoId]);

  const handleAddMeeting = async () => {
    if (!videoId) return;
    setIsAdding(true);
    setError(null);
    try {
      const res = await apiAddToKnowledgeBase({ videoId, metadata: { title: videoTitle } });
      setAddedToKb(true);
      setKbStats(prev => prev ? { ...prev, total_meetings: (prev.total_meetings || 0) + 1, total_documents: (prev.total_documents || 0) + (res.documents_added || 0) } : prev);
      // Auto-find related meetings
      const related = await apiFindRelated({ videoId, limit: 5 });
      if (related.related) setRelatedMeetings(related.related);
    } catch (err) {
      setError(err.message || 'Failed to add meeting');
    }
    setIsAdding(false);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const res = await apiSearchKnowledgeBase({ query: searchQuery, limit: 10 });
      setSearchResults(res.results || []);
    } catch (err) {
      setError(err.message || 'Search failed');
    }
    setIsSearching(false);
  };

  const handleFindRelated = async () => {
    if (!videoId) return;
    setIsSearching(true);
    try {
      const res = await apiFindRelated({ videoId, limit: 5 });
      setRelatedMeetings(res.related || []);
    } catch (err) {
      setError(err.message || 'Failed to find related meetings');
    }
    setIsSearching(false);
  };

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}>
      <h3 style={{ color: '#f1f5f9' }}>Knowledge Base</h3>
      <div style={{ background: '#1e293b', borderRadius: 8, padding: '14px 16px', marginBottom: 16, borderLeft: '3px solid #22c55e' }}>
        <p style={{ color: '#e2e8f0', fontSize: 14, margin: '0 0 8px', lineHeight: 1.6 }}>
          The Knowledge Base lets you build a searchable archive across multiple meetings. Once you add a meeting, its entire transcript is indexed so you can search across all stored meetings at once — for example, searching "budget" will find every mention across every meeting you've added.
        </p>
        <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 8px', lineHeight: 1.5 }}>
          <strong style={{ color: '#e2e8f0' }}>How it works:</strong> Click "Add This Meeting to KB" to index the current meeting's transcript. Then use the search bar to find topics, names, or phrases across all meetings. The system also automatically finds related meetings based on content similarity.
        </p>
        <p style={{ color: '#94a3b8', fontSize: 12, margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
          Example: Add 10 city council meetings, then search "sidewalk repair" to find every meeting where sidewalks were discussed, with relevant excerpts and timestamps.
        </p>
      </div>

      {/* Stats bar */}
      {kbStats && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
          <span style={{ padding: '4px 12px', background: '#1e293b', borderRadius: 6, fontSize: 12, color: '#94a3b8' }}>
            {kbStats.total_meetings || 0} meetings stored
          </span>
          <span style={{ padding: '4px 12px', background: '#1e293b', borderRadius: 6, fontSize: 12, color: '#94a3b8' }}>
            {kbStats.total_documents || 0} document chunks
          </span>
        </div>
      )}

      {/* Add to KB */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center' }}>
        <button
          onClick={handleAddMeeting}
          disabled={isAdding || addedToKb || !videoId}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', cursor: addedToKb ? 'default' : 'pointer',
            background: addedToKb ? '#1e293b' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: addedToKb ? '#4ade80' : 'white',
            transition: 'all 0.2s'
          }}
        >
          {isAdding ? 'Indexing transcript...' : addedToKb ? 'Meeting saved to Knowledge Base' : 'Add This Meeting to Knowledge Base'}
        </button>
        {addedToKb && (
          <button onClick={handleFindRelated} disabled={isSearching}
            style={{ padding: '8px 16px', fontSize: 12, fontWeight: 600, borderRadius: 8, border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', cursor: 'pointer' }}>
            Find Related Meetings
          </button>
        )}
      </div>

      {/* Cross-meeting search */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="Search across all meetings (e.g., 'DPW yard', 'budget override', 'school committee')..."
          style={{
            flex: 1, padding: '10px 14px', fontSize: 13, borderRadius: 8, border: '1px solid #475569',
            background: '#1e293b', color: '#e2e8f0', outline: 'none'
          }}
        />
        <button onClick={handleSearch} disabled={isSearching || !searchQuery.trim()}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, borderRadius: 8, border: 'none', background: '#3b82f6', color: 'white', cursor: 'pointer' }}>
          {isSearching ? 'Searching...' : 'Search KB'}
        </button>
      </div>

      {error && <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 8 }}>{error}</div>}

      {/* Search results */}
      {searchResults.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Search Results ({searchResults.length})</div>
          {searchResults.map((result, idx) => (
            <div key={idx} style={{ padding: '10px 12px', marginBottom: 6, background: '#1e293b', borderRadius: 8, borderLeft: '3px solid #3b82f6' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{result.title || result.video_id}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{result.date}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>{result.excerpt}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, padding: '2px 8px', background: '#0f172a', borderRadius: 4, color: '#4ade80' }}>
                  {Math.round((result.relevance_score || 0) * 100)}% match
                </span>
                <button onClick={() => {
                  window.open(`${window.location.origin}/?v=${result.video_id}`, '_blank');
                }} style={{ fontSize: 10, padding: '2px 8px', background: '#334155', border: 'none', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer' }}>
                  Open Meeting
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Related meetings */}
      {relatedMeetings.length > 0 && (
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Related Meetings</div>
          {relatedMeetings.map((meeting, idx) => (
            <div key={idx} style={{ padding: '10px 12px', marginBottom: 6, background: '#1e293b', borderRadius: 8, borderLeft: '3px solid #22c55e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{meeting.title || meeting.video_id}</span>
                <span style={{ fontSize: 11, color: '#64748b' }}>{meeting.date}</span>
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{meeting.excerpt}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <span style={{ fontSize: 10, padding: '2px 8px', background: '#0f172a', borderRadius: 4, color: '#4ade80' }}>
                  {Math.round((meeting.similarity_score || 0) * 100)}% similar
                </span>
                <button onClick={() => {
                  window.open(`${window.location.origin}/?v=${meeting.video_id}`, '_blank');
                }} style={{ fontSize: 10, padding: '2px 8px', background: '#334155', border: 'none', borderRadius: 4, color: '#e2e8f0', cursor: 'pointer' }}>
                  Open Meeting
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {!kbStats && (
        <div style={{ fontSize: 12, color: '#64748b', padding: '12px', background: '#1e293b', borderRadius: 8 }}>
          Knowledge Base requires ChromaDB. If not available, the backend will indicate this.
        </div>
      )}
    </div>
  );
}

// v8.3: Topic trends across meetings in knowledge base
const TREND_COLORS = ['#4ade80', '#3b82f6', '#f59e0b', '#ef4444', '#a78bfa', '#ec4899', '#14b8a6', '#f97316'];

function TopicTrendsChart() {
  const [trendsData, setTrendsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [kbMeetingCount, setKbMeetingCount] = useState(0);

  useEffect(() => {
    apiKnowledgeBaseStats().then(s => setKbMeetingCount(s.total_meetings || 0)).catch(() => {});
  }, []);

  const canShow = kbMeetingCount >= 2;

  const loadTrends = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiTopicTrends();
      setTrendsData(data);
    } catch (err) {
      setError(err.message || 'Failed to load trends');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (canShow) loadTrends();
  }, [canShow, loadTrends]);

  if (!canShow) return null;

  // Transform data for recharts: [{date, topic1: count, topic2: count, ...}]
  const chartData = useMemo(() => {
    if (!trendsData || !trendsData.topics || trendsData.topics.length === 0) return [];
    const meetings = trendsData.meetings || [];
    return meetings.map((m, i) => {
      const point = { date: m.date || `Meeting ${i + 1}`, title: m.title };
      trendsData.topics.forEach(topic => {
        point[topic.name] = topic.data[i]?.count || 0;
      });
      return point;
    });
  }, [trendsData]);

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}>
      <h3 style={{ color: '#f1f5f9' }}>Topic Trends Across Meetings</h3>
      <p className="viz-desc" style={{ color: '#94a3b8' }}>
        Track how topics rise and fall across meetings in the knowledge base over time.
      </p>
      {loading && <div style={{ fontSize: 12, color: '#94a3b8', padding: 12 }}>Loading trends...</div>}
      {error && <div style={{ fontSize: 12, color: '#ef4444', padding: 12 }}>{error}</div>}
      {chartData.length > 0 && (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }}
              labelFormatter={(label, payload) => payload?.[0]?.payload?.title || label}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
            {trendsData.topics.map((topic, i) => (
              <Line
                key={topic.name}
                type="monotone"
                dataKey={topic.name}
                stroke={TREND_COLORS[i % TREND_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 4, fill: TREND_COLORS[i % TREND_COLORS.length] }}
                activeDot={{ r: 6 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
      {!loading && !error && chartData.length === 0 && trendsData && (
        <div style={{ fontSize: 12, color: '#64748b', padding: 12 }}>
          Add more meetings to the knowledge base to see topic trends.
        </div>
      )}
    </div>
  );
}

// v8.3: Entity network graph showing shared entities across meetings
function EntityNetworkGraph() {
  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [kbMeetingCount, setKbMeetingCount] = useState(0);

  useEffect(() => {
    apiKnowledgeBaseStats().then(s => setKbMeetingCount(s.total_meetings || 0)).catch(() => {});
  }, []);

  const canShow = kbMeetingCount >= 2;

  useEffect(() => {
    if (!canShow) return;
    setLoading(true);
    // We need meeting data to call the graph endpoint — use KB search to get all meetings
    apiKnowledgeBaseStats().then(async () => {
      // Search for common civic terms to get all meetings from KB
      try {
        const searchRes = await apiSearchKnowledgeBase({ query: "meeting discussion", limit: 50 });
        const results = searchRes.results || [];
        // Deduplicate by video_id
        const seen = new Set();
        const meetings = [];
        for (const r of results) {
          if (!seen.has(r.video_id)) {
            seen.add(r.video_id);
            meetings.push({ video_id: r.video_id, title: r.title || r.video_id, entities: [] });
          }
        }
        // For now, build the graph with meeting titles as entities (since we don't have per-meeting entity lists stored in KB)
        // The graph endpoint expects meetings_data with entities arrays
        if (meetings.length >= 2) {
          const graphRes = await apiBuildKnowledgeGraph({ meetings_data: meetings });
          setGraphData(graphRes);
        }
      } catch (err) {
        console.error('Entity network error:', err);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [canShow]);

  if (!canShow) return null;

  // Simple radial layout
  const renderGraph = useMemo(() => {
    if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return null;
    const W = 600, H = 400, CX = W / 2, CY = H / 2;
    const meetingNodes = graphData.nodes.filter(n => n.type === 'meeting');
    const entityNodes = graphData.nodes.filter(n => n.type !== 'meeting').slice(0, 30);

    // Position meetings in inner ring
    const innerR = Math.min(W, H) * 0.2;
    const outerR = Math.min(W, H) * 0.38;
    const positioned = {};

    meetingNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / meetingNodes.length - Math.PI / 2;
      positioned[n.id] = { x: CX + innerR * Math.cos(angle), y: CY + innerR * Math.sin(angle), ...n };
    });

    entityNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / entityNodes.length - Math.PI / 2;
      positioned[n.id] = { x: CX + outerR * Math.cos(angle), y: CY + outerR * Math.sin(angle), ...n };
    });

    // Edges
    const sharedSet = new Set(graphData.shared_entities?.map(e => `entity_${e.name.toLowerCase().replace(/ /g, '_')}`) || []);

    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxHeight: 400 }}>
        {/* Edges */}
        {graphData.edges.map((edge, i) => {
          const s = positioned[edge.source];
          const t = positioned[edge.target];
          if (!s || !t) return null;
          const isShared = sharedSet.has(edge.target) || sharedSet.has(edge.source);
          return (
            <line key={i} x1={s.x} y1={s.y} x2={t.x} y2={t.y}
              stroke={isShared ? '#4ade80' : '#334155'}
              strokeWidth={isShared ? 1.5 : 0.5}
              opacity={isShared ? 0.6 : 0.2}
            />
          );
        })}
        {/* Entity nodes (outer) */}
        {entityNodes.map(n => {
          const pos = positioned[n.id];
          if (!pos) return null;
          const isShared = sharedSet.has(n.id);
          const isHovered = hoveredNode === n.id;
          return (
            <g key={n.id}
              onMouseEnter={() => setHoveredNode(n.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={pos.x} cy={pos.y} r={isShared ? 8 : 5}
                fill={isShared ? '#3b82f6' : '#475569'}
                stroke={isHovered ? '#fff' : 'none'}
                strokeWidth={1.5}
              />
              {(isHovered || isShared) && (
                <text x={pos.x} y={pos.y - 12} textAnchor="middle"
                  fill="#e2e8f0" fontSize={isHovered ? 11 : 9} fontWeight={isHovered ? 600 : 400}>
                  {n.label}
                </text>
              )}
            </g>
          );
        })}
        {/* Meeting nodes (inner) */}
        {meetingNodes.map(n => {
          const pos = positioned[n.id];
          if (!pos) return null;
          const isHovered = hoveredNode === n.id;
          return (
            <g key={n.id}
              onMouseEnter={() => setHoveredNode(n.id)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={pos.x} cy={pos.y} r={12}
                fill="#1e7f63"
                stroke={isHovered ? '#4ade80' : '#22c55e'}
                strokeWidth={isHovered ? 2.5 : 1.5}
              />
              <text x={pos.x} y={pos.y + (isHovered ? -18 : 22)} textAnchor="middle"
                fill="#e2e8f0" fontSize={10} fontWeight={600}>
                {n.label.length > 25 ? n.label.slice(0, 25) + '...' : n.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  }, [graphData, hoveredNode]);

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1', background: '#0f172a', color: '#e2e8f0', border: '1px solid #334155' }}>
      <h3 style={{ color: '#f1f5f9' }}>Entity Network Across Meetings</h3>
      <p className="viz-desc" style={{ color: '#94a3b8' }}>
        Shared entities connecting different meetings. Green nodes are meetings, blue nodes are entities mentioned in multiple meetings.
      </p>
      {loading && <div style={{ fontSize: 12, color: '#94a3b8', padding: 12 }}>Building network graph...</div>}
      {renderGraph}
      {graphData?.shared_entities?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {graphData.shared_entities.slice(0, 10).map((e, i) => (
            <span key={i} style={{ padding: '3px 10px', background: '#1e293b', borderRadius: 6, fontSize: 11, color: '#94a3b8', border: '1px solid #334155' }}>
              {e.name} ({e.meeting_count} meetings)
            </span>
          ))}
        </div>
      )}
      {!loading && !graphData && (
        <div style={{ fontSize: 12, color: '#64748b', padding: 12 }}>
          Add meetings with entity data to see the network graph.
        </div>
      )}
    </div>
  );
}

function DecisionTimeline({ sents, playerRef, videoId, addToBasket, pad, openExpandedAt }) {
  const [selectedDecision, setSelectedDecision] = useState(null);

  const findDecisionPoints = () => {
    const decisionKeywords = [
      'approved', 'rejected', 'passed', 'failed', 'decided', 'resolved',
      'motion', 'vote', 'unanimous', 'carried', 'adopted', 'denied',
      'agreed', 'concluded', 'determined', 'established'
    ];

    const decisions = [];
    sents.forEach((sent, idx) => {
      const lowerText = sent.text.toLowerCase();
      if (decisionKeywords.some(keyword => lowerText.includes(keyword))) {
        const match = { idx, ...sent };
        decisions.push({
          ...match,
          match: match,
          timestamp: padTimePrecise(sent.start)
        });
      }
    });

    return decisions;
  };

  const decisions = findDecisionPoints();
  const totalDuration = sents.length > 0 ? sents[sents.length - 1].end : 100;

  const axisLabels = (duration) => {
    if (duration <= 0) return ["0m 0s"];
    const labels = [];
    const points = 5;
    for (let i = 0; i <= points; i++) {
      const time = (duration / points) * i;
      labels.push({ time: padTime(time), left: (i / points) * 100 });
    }
    return labels;
  };
  const labels = axisLabels(totalDuration);

  return (
    <div className="viz-card decision-timeline">
      <h3>Key Decision Points</h3>
      <p className="viz-desc">
        This timeline shows moments where a key decision (like a vote or motion) was detected. Click any marker to see the clip.
      </p>
      <div className="timeline-container">
        <div className="timeline-track">
          {decisions.map((decision, idx) => {
            const position = (decision.start / totalDuration) * 100;
            return (
              <div
                key={idx}
                className="decision-marker"
                style={{ left: `${position}%` }}
                onClick={() => setSelectedDecision(decision)}
                title={decision.timestamp}
              >
                <div className="marker-dot"></div>
                <div className="marker-line"></div>
              </div>
            );
          })}
        </div>
        <div className="timeline-labels">
          {labels.map(label => (
            <span key={label.time} style={{ left: `${label.left}%` }}>{label.time}</span>
          ))}
        </div>
      </div>

      {selectedDecision && (
        <div className="decision-popup">
          <div className="popup-header">
            <span>{selectedDecision.timestamp}</span>
            <button className="btn-close-popup" onClick={() => setSelectedDecision(null)}>X</button>
          </div>
          <div className="popup-text">{selectedDecision.text}</div>
          <div className="popup-actions">
            <button className="btn btn-accent animate-hover" onClick={() => {
              openExpandedAt(selectedDecision.match);
              setSelectedDecision(null);
            }}>
              Transcript Context
            </button>
            <button className="btn btn-primary animate-hover" onClick={() => {
              const s = Math.max(0, Math.floor(selectedDecision.start - pad));
              const e = Math.floor(selectedDecision.end + pad);
              addToBasket({ start: s, end: e, label: selectedDecision.text.slice(0, 60) });
              setSelectedDecision(null);
            }}>
              Save to Basket
            </button>
            <button className="btn btn-ghost animate-hover" onClick={() => {
              const start = Math.max(0, Math.floor(selectedDecision.start - pad));
              if (!playerRef.current || !videoId) return;
              playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&mute=0&playsinline=1`;
            }}>
              Video Context
            </button>
          </div>
        </div>
      )}

      {decisions.length === 0 && (
        <div className="no-decisions">No decision points detected in this transcript</div>
      )}
    </div>
  );
}

// UPDATED: Entity preview with smart defaults and in-modal switching
function MentionedEntitiesCard({ entities, isLoading }) {
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [viewMode, setViewMode] = useState('default'); // 'default', 'maps', 'wikipedia'

  // Determine if entity is a place/address
  const isPlaceOrAddress = (entity) => {
    const addressKeywords = ['street', 'avenue', 'road', 'boulevard', 'lane', 'drive', 'ave', 'st', 'rd', 'blvd', 'park', 'building', 'hall', 'center', 'library', 'school'];
    const text = entity.text.toLowerCase();
    const type = entity.type?.toLowerCase() || '';

    // Check type
    if (type === 'address' || type === 'place' || type === 'location') return true;

    // Check for address keywords
    if (addressKeywords.some(keyword => text.includes(keyword))) return true;

    // Check for numbers (likely an address)
    if (/\d+/.test(entity.text)) return true;

    return false;
  };

  // Determine default view based on entity type
  const getDefaultView = (entity) => {
    return 'news';
  };

  // Handle entity click
  const handleEntityClick = (entity) => {
    setSelectedEntity(entity);
    setViewMode(getDefaultView(entity));
  };

  // Handle view switch
  const switchToMaps = () => setViewMode('maps');
  const switchToWikipedia = () => setViewMode('wikipedia');
  const switchToNews = () => setViewMode('news');

  // Close modal
  const closeModal = () => {
    setSelectedEntity(null);
    setViewMode('default');
  };

  return (
    <>
      {/* Entity Modal with in-modal view switching */}
      {selectedEntity && (
        <div className="entity-popup-overlay entity-popup-top" onClick={closeModal} role="dialog" aria-modal="true" aria-label="Entity details">
          <div className="entity-popup-card entity-popup-positioned" onClick={(e) => e.stopPropagation()}>
            <div className="entity-popup-header">
              <h3>{selectedEntity.text}</h3>
              <button className="btn-close-popup" onClick={closeModal} aria-label="Close entity details">X</button>
            </div>

            {/* View Mode Tabs */}
            <div className="entity-view-tabs">
              <button
                className={`entity-tab ${viewMode === 'maps' ? 'active' : ''}`}
                onClick={switchToMaps}
              >
                ✨ Google Maps
              </button>
              <button
                className={`entity-tab ${viewMode === 'wikipedia' ? 'active' : ''}`}
                onClick={switchToWikipedia}
              >
                [W] Wikipedia
              </button>
              <button
                className={`entity-tab ${viewMode === 'news' ? 'active' : ''}`}
                onClick={switchToNews}
              >
                [N] News
              </button>
            </div>

            {/* Content Area */}
            <div className="entity-popup-content">
              {viewMode === 'maps' ? (
                <iframe
                  src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(selectedEntity.text)}`}
                  title={`Map - ${selectedEntity.text}`}
                  className="entity-iframe"
                  allow="geolocation"
                ></iframe>
              ) : viewMode === 'news' ? (
                <iframe
                  src={`https://www.google.com/search?q=${encodeURIComponent(selectedEntity.text)}&tbm=nws&igu=1`}
                  title={`News - ${selectedEntity.text}`}
                  className="entity-iframe"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                ></iframe>
              ) : (
                <iframe
                  src={`https://en.wikipedia.org/wiki/${encodeURIComponent(selectedEntity.text)}`}
                  title={`Wikipedia - ${selectedEntity.text}`}
                  className="entity-iframe"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                ></iframe>
              )}
            </div>

            {/* Action Buttons - Open in New Tab */}
            <div className="entity-popup-actions">
              <a
                href={viewMode === 'maps'
                  ? `https://www.google.com/maps/search/${encodeURIComponent(selectedEntity.text)}`
                  : viewMode === 'news'
                    ? `https://www.google.com/search?q=${encodeURIComponent(selectedEntity.text)}&tbm=nws`
                    : `https://en.wikipedia.org/wiki/${encodeURIComponent(selectedEntity.text)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
              >
                Open {viewMode === 'maps' ? 'Maps' : viewMode === 'news' ? 'News' : 'Wikipedia'} in New Tab
              </a>
              <button className="btn btn-ghost" onClick={closeModal}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entity List */}
      <div className="viz-card entities-card">
        <h3>People, Places, & Things</h3>
        <p className="viz-desc">
          Click any entity to explore. Places show maps, all show Wikipedia and News.
        </p>
        <div className="entities-list">
          {isLoading && (
            <div className="entities-loader-container">
              <div className="spinner" />
              <span>Loading entities...</span>
            </div>
          )}

          {!isLoading && entities && entities.length > 0 && (
            entities.map((entity, idx) => {
              const isPlace = isPlaceOrAddress(entity);
              return (
                <div
                  key={idx}
                  className="entity-item clickable"
                  onClick={() => handleEntityClick(entity)}
                  title={isPlace ? 'Click to view on map' : 'Click to view on Wikipedia'}
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <span style={{
                    fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, letterSpacing: '0.03em',
                    background: entity.type === 'PERSON' ? '#dcfce7' : entity.type === 'PLACE' ? '#dbeafe' : '#fef3c7',
                    color: entity.type === 'PERSON' ? '#166534' : entity.type === 'PLACE' ? '#1e40af' : '#92400e',
                  }}>{(entity.type || 'ENTITY').slice(0, 3)}</span>
                  <span className="entity-name" style={{ fontSize: 16, fontWeight: 600 }}>
                    {fixBrooklyn(entity.text)}
                  </span>
                  <span className="entity-count" title={entity.type} style={{ fontSize: 14 }}>
                    {entity.count}
                  </span>
                </div>
              );
            })
          )}

          {!isLoading && (!entities || entities.length === 0) && (
            <div className="no-entities">No entities detected.</div>
          )}
        </div>
      </div>
    </>
  );
}

function SearchResultCard({ match, query, t, openExpandedAt, addToBasket, playerRef, videoId, pad }) {
  return (
    <div className="result-card animate-slideIn">
      <div style={{ fontSize: 12, color: "#64748b" }}>{padTimePrecise(match.start)}  →  {padTimePrecise(match.end)}</div>
      <div style={{ marginTop: 6 }}>
        {query ? match.text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, "gi")).map((part, idx) => (
          <span key={idx} className={part.toLowerCase() === query.toLowerCase() ? "hit" : ""}>{part}</span>
        )) : match.text}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
        <button className="btn btn-accent animate-hover" onClick={() => openExpandedAt(match)}>
          {t.expandClip}
        </button>
        <button className="btn btn-primary animate-hover" onClick={() => {
          const s = Math.max(0, Math.floor(match.start - pad));
          const e = Math.floor(match.end + pad);
          addToBasket({ start: s, end: e, label: match.text.slice(0, 60) });
        }}>{t.saveClip}</button>
        <button className="btn btn-ghost animate-hover" onClick={() => {
          const start = Math.max(0, Math.floor(match.start - pad));
          if (!playerRef.current || !videoId) return;
          playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&mute=0&playsinline=1`;
        }}>{t.preview}</button>
      </div>
    </div>
  );
}

// NEW: Participation Tracker - Shows meeting engagement metrics
function ParticipationTracker({ sents, entities, openExpandedAt, addToBasket, playerRef, videoId, pad, t }) {
  const [engagementData, setEngagementData] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [matchingResults, setMatchingResults] = useState([]);

  useEffect(() => {
    if (!sents || sents.length === 0) return;

    // Analyze the transcript for participation metrics
    const fullText = sents.map(s => s.text).join(' ').toLowerCase();
    const totalDuration = sents[sents.length - 1]?.end || 0;
    
    // Count public comments with moments
    const publicCommentPatterns = [
      'public comment', 'resident comment', 'citizen comment', 'open the floor',
      'my name is', 'i live at', 'i\'m a resident', 'thank you for', 'i want to say',
      'i\'d like to', 'i support', 'i oppose', 'as a taxpayer', 'as a homeowner'
    ];
    let publicCommentMoments = [];
    
    sents.forEach(sent => {
      const sentLower = sent.text.toLowerCase();
      if (publicCommentPatterns.some(p => sentLower.includes(p))) {
        if (publicCommentMoments.length === 0 || 
            sent.start - publicCommentMoments[publicCommentMoments.length - 1].start > 60) {
          publicCommentMoments.push({ start: sent.start, end: sent.end, text: sent.text });
        }
      }
    });

    // Count questions with moments
    const questionMoments = sents.filter(s => s.text.includes('?')).map(s => ({
      start: s.start, end: s.end, text: s.text
    }));

    // Count motions and votes with moments
    const motionPatterns = ['motion to', 'i move', 'second the motion', 'all in favor', 'aye', 'nay', 'vote'];
    const motionMoments = sents.filter(s => 
      motionPatterns.some(p => s.text.toLowerCase().includes(p))
    ).map(s => ({ start: s.start, end: s.end, text: s.text }));

    // Calculate engagement segments (high/low activity periods)
    const segmentDuration = totalDuration / 10;
    const segments = [];
    for (let i = 0; i < 10; i++) {
      const start = i * segmentDuration;
      const end = (i + 1) * segmentDuration;
      const segmentSents = sents.filter(s => s.start >= start && s.start < end);
      
      const wordCount = segmentSents.reduce((sum, s) => sum + s.text.split(' ').length, 0);
      const questionFreq = segmentSents.filter(s => s.text.includes('?')).length;
      const hasPublicComment = publicCommentMoments.some(m => m.start >= start && m.start < end);
      
      segments.push({
        index: i,
        start,
        end,
        activity: Math.min(100, (wordCount / 50) * 30 + questionFreq * 20 + (hasPublicComment ? 30 : 0)),
        hasPublicComment,
        sents: segmentSents
      });
    }

    // Discussion types breakdown (replaces sentiment)
    const discussionTypes = {
      procedural: sents.filter(s => /call to order|adjourn|roll call|quorum|agenda/i.test(s.text)).length,
      discussion: sents.filter(s => /discuss|consider|review|talk about|address/i.test(s.text)).length,
      action: sents.filter(s => /motion|vote|approve|deny|pass|second/i.test(s.text)).length,
      publicInput: publicCommentMoments.length
    };

    setEngagementData({
      publicCommentCount: publicCommentMoments.length,
      publicCommentMoments,
      questionCount: questionMoments.length,
      questionMoments,
      motionCount: motionMoments.length,
      motionMoments,
      segments,
      discussionTypes,
      meetingLength: Math.round(totalDuration / 60)
    });
  }, [sents, entities]);

  // Handle metric click - show matching results
  const handleMetricClick = (metricType) => {
    if (selectedMetric === metricType) {
      setSelectedMetric(null);
      setMatchingResults([]);
      return;
    }
    
    setSelectedMetric(metricType);
    let results = [];
    
    switch (metricType) {
      case 'publicComments':
        results = engagementData.publicCommentMoments;
        break;
      case 'questions':
        results = engagementData.questionMoments;
        break;
      case 'motions':
        results = engagementData.motionMoments;
        break;
      default:
        results = [];
    }
    
    setMatchingResults(results);
  };

  // Handle timeline segment click - jump to video
  const handleSegmentClick = (segment) => {
    if (playerRef?.current) {
      const iframe = playerRef.current;
      if (iframe) {
        const targetTime = Math.floor(segment.start);
        iframe.src = `https://www.youtube.com/embed/${videoId}?start=${targetTime}&autoplay=1`;
        iframe.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!engagementData) return null;

  // Build recharts-compatible data for activity chart
  const activityChartData = engagementData.segments.map((seg, i) => ({
    name: formatTime(seg.start),
    activity: Math.round(seg.activity),
    hasPublicComment: seg.hasPublicComment ? Math.round(seg.activity) : null,
    start: seg.start, end: seg.end,
  }));

  const metricCards = [
    { key: 'publicComments', label: 'Public Comments', value: engagementData.publicCommentCount, color: '#22c55e', bg: '#166534' },
    { key: 'questions', label: 'Questions', value: engagementData.questionCount, color: '#60a5fa', bg: '#1e40af' },
    { key: 'motions', label: 'Motions/Votes', value: engagementData.motionCount, color: '#fbbf24', bg: '#92400e' },
    { key: 'duration', label: 'Duration', value: `${engagementData.meetingLength}m`, color: '#c084fc', bg: '#581c87' },
  ];

  const dtTotal = Object.values(engagementData.discussionTypes).reduce((a, b) => a + b, 0) || 1;
  const dtTypes = [
    { key: 'procedural', label: 'Procedural', count: engagementData.discussionTypes.procedural, color: '#3b82f6' },
    { key: 'discussion', label: 'Discussion', count: engagementData.discussionTypes.discussion, color: '#8b5cf6' },
    { key: 'action', label: 'Action', count: engagementData.discussionTypes.action, color: '#f59e0b' },
    { key: 'publicInput', label: 'Public Input', count: engagementData.discussionTypes.publicInput, color: '#22c55e' },
  ];

  return (
    <div className="viz-card participation-tracker" style={{ background: '#0f172a', border: '1px solid #1e293b' }}>
      <h3 style={{ color: '#f1f5f9' }}>Participation Tracker</h3>
      <p className="viz-desc" style={{ color: '#94a3b8' }}>Click metrics to see details. Click chart to jump to video.</p>

      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {metricCards.map(m => (
          <div key={m.key}
            onClick={() => m.key !== 'duration' && handleMetricClick(m.key)}
            style={{
              padding: '14px 12px', borderRadius: '8px', cursor: m.key !== 'duration' ? 'pointer' : 'default',
              background: selectedMetric === m.key ? m.bg : '#1e293b',
              borderLeft: `3px solid ${m.color}`, transition: 'all 0.2s',
            }}
          >
            <div style={{ fontSize: '28px', fontWeight: 800, color: m.color, lineHeight: 1 }}>{m.value}</div>
            <div style={{ fontSize: '11px', color: selectedMetric === m.key ? '#e2e8f0' : '#94a3b8', marginTop: 4, fontWeight: 500 }}>{m.label}</div>
          </div>
        ))}
      </div>

      {/* Matching Results */}
      {selectedMetric && matchingResults.length > 0 && (
        <div style={{ marginBottom: '16px', background: '#1e293b', borderRadius: '8px', padding: '12px', maxHeight: '180px', overflowY: 'auto', border: '1px solid #334155' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
            {selectedMetric === 'publicComments' && 'Public Comments Found'}
            {selectedMetric === 'questions' && 'Questions Asked'}
            {selectedMetric === 'motions' && 'Motions & Votes'}
          </div>
          {matchingResults.slice(0, 10).map((result, idx) => (
            <div key={idx} style={{ padding: '8px', marginBottom: '4px', background: '#0f172a', borderRadius: '6px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '12px', color: '#cbd5e1', marginBottom: '6px' }}>
                {result.text.slice(0, 150)}{result.text.length > 150 ? '...' : ''}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => { if (playerRef?.current) { playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(result.start)}&autoplay=1`; playerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}}
                  style={{ padding: '3px 8px', fontSize: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  Video [{formatTime(result.start)}]
                </button>
                <button onClick={() => addToBasket && addToBasket({ start: Math.max(0, result.start - (pad || 3)), end: result.end + (pad || 3), label: result.text.slice(0, 40) + '...' })}
                  style={{ padding: '3px 8px', fontSize: '10px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  + Clip
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity Chart — AreaChart via recharts */}
      <div style={{ marginBottom: '12px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Activity Over Time</div>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={activityChartData} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Bar dataKey="activity" fill="#334155" radius={[3, 3, 0, 0]} cursor="pointer"
              onClick={(data) => handleSegmentClick(data)}
            >
              {activityChartData.map((entry, i) => (
                <Cell key={i} fill={entry.hasPublicComment !== null ? '#22c55e' : '#334155'} />
              ))}
            </Bar>
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 6, color: '#e2e8f0', fontSize: 11 }}
              formatter={(v) => [`${v}%`, 'Activity']} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Discussion Type Proportional Bar */}
      <div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>Discussion Breakdown</div>
        <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '6px' }}>
          {dtTypes.filter(d => d.count > 0).map(d => (
            <div key={d.key} style={{ width: `${(d.count / dtTotal) * 100}%`, background: d.color, transition: 'width 0.3s' }} title={`${d.label}: ${d.count}`} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {dtTypes.map(d => (
            <span key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '11px', color: '#94a3b8' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, display: 'inline-block' }} />
              {d.label} ({d.count})
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TopicHeatMap({ fullText, sents, openExpandedAt, t, addToBasket, playerRef, videoId, pad }) {
  const [topicData, setTopicData] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedSentence, setSelectedSentence] = useState(null);

  useEffect(() => {
    if (!fullText) return;

    const topicDefinitions = {
      'Budget & Finance': ['budget', 'funding', 'cost', 'expense', 'revenue', 'financial', 'fiscal'],
      'Development': ['development', 'construction', 'building', 'zoning', 'permit', 'planning'],
      'Public Safety': ['safety', 'police', 'fire', 'emergency', 'crime', 'security'],
      'Environment': ['environment', 'green', 'sustainability', 'climate', 'pollution'],
      'Community Services': ['community', 'service', 'program', 'resident', 'public'],
      'Education': ['education', 'school', 'learning', 'student', 'teacher'],
      'Housing': ['housing', 'affordable', 'residential', 'tenant', 'landlord'],
      'Transportation': ['transportation', 'transit', 'bus', 'traffic', 'parking'],
      'Governance': ['policy', 'ordinance', 'resolution', 'amendment', 'regulation']
    };

    const topics = [];
    const textLower = fullText.toLowerCase();

    Object.entries(topicDefinitions).forEach(([topic, keywords]) => {
      let mentions = 0;
      let segments = [];
      let topicSentences = [];

      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = textLower.match(regex);
        if (matches) mentions += matches.length;
      });

      if (sents && sents.length > 0) {
        const duration = sents[sents.length - 1].end;
        const buckets = 10;
        const bucketSize = duration / buckets;

        for (let i = 0; i < buckets; i++) {
          const startTime = i * bucketSize;
          const endTime = (i + 1) * bucketSize;
          const bucketSents = sents.filter(s => s.start >= startTime && s.start < endTime);

          let bucketMentions = 0;
          bucketSents.forEach(sent => {
            const sentLower = sent.text.toLowerCase();
            const hasKeyword = keywords.some(keyword => sentLower.includes(keyword));
            if (hasKeyword) {
              bucketMentions++;
              topicSentences.push(sent);
            }
          });

          segments.push({
            segment: i,
            intensity: bucketMentions
          });
        }
      }

      topics.push({
        name: topic,
        mentions,
        segments,
        sentences: [...new Set(topicSentences)]
      });
    });

    topics.sort((a, b) => b.mentions - a.mentions);
    setTopicData(topics);
  }, [fullText, sents]);

  const maxIntensity = Math.max(
    ...topicData.flatMap(t => t.segments.map(s => s.intensity)),
    1
  );

  const handleTopicClick = (topic) => {
    setSelectedTopic(topic);
    setSelectedSentence(null);
  };

  const closeTopicModal = () => {
    setSelectedTopic(null);
    setSelectedSentence(null);
  };

  const handleSentenceClick = (sent) => {
    setSelectedSentence(sent);
  };

  return (
    <>
      {selectedTopic && (
        <div className="entity-popup-overlay" onClick={closeTopicModal} role="dialog" aria-modal="true" aria-label="Topic details">
          <div className="entity-popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="entity-popup-header">
              <h3>Sentences related to "{selectedTopic.name}"</h3>
              <button className="btn-close-popup" onClick={closeTopicModal} aria-label="Close topic details">X</button>
            </div>
            <div className="entity-popup-content" style={{ overflowY: 'auto', padding: '10px' }}>
              {selectedSentence ? (
                <div>
                  <button className="btn btn-ghost" onClick={() => setSelectedSentence(null)} style={{ marginBottom: '10px' }}>
                    &larr; Back to list
                  </button>
                  <SearchResultCard
                    match={selectedSentence}
                    query={""}
                    t={t}
                    openExpandedAt={(match) => {
                      openExpandedAt(match);
                      closeTopicModal();
                    }}
                    addToBasket={addToBasket}
                    playerRef={playerRef}
                    videoId={videoId}
                    pad={pad}
                  />
                </div>
              ) : (
                selectedTopic.sentences.length > 0 ? (
                  selectedTopic.sentences.map((sent, idx) => (
                    <div key={idx} className="result-card" style={{ cursor: 'pointer' }} onClick={() => handleSentenceClick(sent)}>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{padTimePrecise(sent.start)}</div>
                      <div style={{ marginTop: 6 }}>{sent.text}</div>
                    </div>
                  ))
                ) : (
                  <p>No specific sentences found for this segment.</p>
                )
              )}
            </div>
            <div className="entity-popup-actions">
              <button className="btn btn-ghost" onClick={closeTopicModal}>Close</button>
            </div>
          </div>
        </div>
      )}

      <div className="viz-card topic-heatmap" style={{ gridColumn: '1 / -1' }}>
        <h3>Topic Coverage Map</h3>
        <p className="viz-desc">
          See which topics were discussed over the course of the video. Click a row to see related sentences.
        </p>
        <div className="heatmap-grid">
          {topicData.map((topic, idx) => (
            <div key={idx} className="heatmap-row" onClick={() => handleTopicClick(topic)} title={`Click to see sentences for ${topic.name}`}>
              <div className="heatmap-label">
                <span className="topic-name">{topic.name}</span>
                <span className="topic-count">{topic.mentions}</span>
              </div>
              <div className="heatmap-cells">
                {topic.segments.map((seg, segIdx) => {
                  const intensity = seg.intensity / maxIntensity;
                  return (
                    <div
                      key={segIdx}
                      className="heat-cell"
                      style={{
                        background: `rgba(30, 127, 99, ${intensity})`,
                        border: seg.intensity > 0 ? '1px solid #1E7F63' : '1px solid #e5e7eb'
                      }}
                      title={`${seg.intensity} mentions`}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {/* Time Axis */}
        <div style={{ display: 'flex', alignItems: 'center', marginTop: '8px', paddingLeft: '140px' }}>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
            {(() => {
              const totalDuration = sents && sents.length > 0 ? sents[sents.length - 1].end : 0;
              const formatTime = (seconds) => {
                const h = Math.floor(seconds / 3600);
                const m = Math.floor((seconds % 3600) / 60);
                const s = Math.floor(seconds % 60);
                return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
              };
              const points = 6;
              return Array.from({ length: points }, (_, i) => {
                const time = (totalDuration / (points - 1)) * i;
                return <span key={i} style={{ fontWeight: 600 }}>{formatTime(time)}</span>;
              });
            })()}
          </div>
        </div>
        {/* Prominent Video Timeline Label */}
        <div style={{ 
          textAlign: 'center', 
          marginTop: '8px',
          padding: '8px 16px',
          background: 'linear-gradient(90deg, transparent, #f0fdf4, transparent)',
          borderRadius: '4px',
        }}>
          <div style={{ 
            fontSize: '14px', 
            fontWeight: 700, 
            color: '#1E7F63',
            letterSpacing: '0.5px',
          }}>
            ◀ VIDEO TIMELINE ▶
          </div>
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
            Each column represents a segment of the video from start to finish
          </div>
        </div>
        <div className="heatmap-legend" style={{ marginTop: '12px' }}>
          <span>Low Activity</span>
          <div className="legend-bar"></div>
          <span>High Activity</span>
        </div>
      </div>
    </>
  );
}

function DisagreementTimeline({ sents, playerRef, videoId, openExpandedAt, addToBasket, pad }) {
  const [disagreements, setDisagreements] = useState([]);
  const [selectedMoment, setSelectedMoment] = useState(null);

  useEffect(() => {
    if (!sents) return;

    const disagreementKeywords = [
      'disagree', 'opposed', 'against', 'object', 'concern', 'worried',
      'problem', 'issue', 'challenge', 'difficulty', 'reject', 'deny', 'refuse',
      'violation', 'unacceptable', 'unfortunately', 'strongly oppose', 'cannot support'
    ];

    const modifierKeywords = ['but', 'however', 'although', 'not'];

    const moments = [];
    sents.forEach((sent, idx) => {
      const lowerText = sent.text.toLowerCase();
      let score = 0;

      disagreementKeywords.forEach(keyword => {
        if (lowerText.includes(keyword)) score += 2;
      });

      modifierKeywords.forEach(keyword => {
        if (lowerText.includes(keyword)) score += 1;
      });

      if (score >= 2) {
        const match = { idx, ...sent };
        moments.push({
          ...match,
          match: match,
          intensity: score,
          timestamp: padTimePrecise(sent.start)
        });
      }
    });

    // Cluster nearby moments (within 30s) — keep the highest intensity one
    const clustered = [];
    const sorted = moments.sort((a, b) => a.start - b.start);
    sorted.forEach(m => {
      if (clustered.length === 0 || m.start - clustered[clustered.length - 1].start > 30) {
        clustered.push(m);
      } else if (m.intensity > clustered[clustered.length - 1].intensity) {
        clustered[clustered.length - 1] = m;
      }
    });

    // Limit to top 50 by intensity
    const final = clustered.sort((a, b) => b.intensity - a.intensity).slice(0, 50).sort((a, b) => a.start - b.start);
    setDisagreements(final);
  }, [sents]);

  const totalDuration = sents && sents.length > 0 ? sents[sents.length - 1].end : 100;

  const axisLabels = (duration) => {
    if (duration <= 0) return ["0m 0s"];
    const labels = [];
    const points = 5;
    for (let i = 0; i <= points; i++) {
      const time = (duration / points) * i;
      labels.push({ time: padTime(time), left: (i / points) * 100 });
    }
    return labels;
  };
  const labels = axisLabels(totalDuration);

  return (
    <div className="viz-card disagreement-timeline-card disagreement-timeline" style={{ gridColumn: '1 / -1' }}>
      <h3>Moments of Disagreement {disagreements.length > 0 && <span style={{ fontSize: 13, fontWeight: 500, color: '#ef4444', marginLeft: 8 }}>({disagreements.length} detected)</span>}</h3>
      <p className="viz-desc">
        This timeline flags potential moments of disagreement or concern. Click a marker to see the clip. Larger markers indicate stronger disagreement language.
      </p>
      <div className="timeline-container">
        <div className="timeline-track">
          {disagreements.map((moment, idx) => {
            const position = (moment.start / totalDuration) * 100;
            const size = 14 + (moment.intensity * 3);
            return (
              <div
                key={idx}
                className="disagreement-marker"
                style={{
                  left: `${position}%`,
                  width: `${size}px`,
                  height: `${size}px`
                }}
                onClick={() => setSelectedMoment(moment)}
                title={moment.timestamp}
              >
                <div className="marker-pulse"></div>
              </div>
            );
          })}
        </div>
        <div className="timeline-labels">
          {labels.map(label => (
            <span key={label.time} style={{ left: `${label.left}%` }}>{label.time}</span>
          ))}
        </div>
      </div>

      {selectedMoment && (
        <div className="decision-popup">
          <div className="popup-header">
            <span>{selectedMoment.timestamp}</span>
            <button className="btn-close-popup" onClick={() => setSelectedMoment(null)}>X</button>
          </div>
          <div className="popup-text">{selectedMoment.text}</div>
          <div className="popup-actions">
            <button className="btn btn-accent animate-hover" onClick={() => {
              openExpandedAt(selectedMoment.match);
              setSelectedMoment(null);
            }}>
              Transcript Context
            </button>
            <button className="btn btn-primary animate-hover" onClick={() => {
              const s = Math.max(0, Math.floor(selectedMoment.start - pad));
              const e = Math.floor(selectedMoment.end + pad);
              addToBasket({ start: s, end: e, label: selectedMoment.text.slice(0, 60) });
              setSelectedMoment(null);
            }}>
              Save to Basket
            </button>
            <button className="btn btn-ghost animate-hover" onClick={() => {
              const start = Math.max(0, Math.floor(selectedMoment.start - pad));
              if (!playerRef.current || !videoId) return;
              playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&mute=0&playsinline=1`;
            }}>
              Video Context
            </button>
          </div>
        </div>
      )}

      {disagreements.length === 0 && (
        <div className="no-decisions" style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>This meeting appears to have low conflict — no strong disagreement language detected in the transcript.</div>
      )}
    </div>
  );
}

// NEW: Cross-Reference Network - IMPROVED with network graph
function CrossReferenceNetwork({ fullText, entities }) {
  const [hoveredNode, setHoveredNode] = useState(null);
  const [nodePositions, setNodePositions] = useState([]);
  const [draggingNode, setDraggingNode] = useState(null);
  const svgRef = useRef(null);

  const graphData = useMemo(() => {
    if (!entities || entities.length < 2 || !fullText) return { nodes: [], edges: [] };

    // Use entities + extract frequent bigrams for richer network
    const sents = fullText.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const topEntities = entities.slice(0, 20);

    // Also extract top non-entity keywords (2+ word phrases that appear 5+ times)
    const wordFreq = {};
    const stopwords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','is','it','that','this','was','are','be','has','have','had','will','with','from','they','we','been','not','also','can','would','there','their','than','its','into','more','other','some','very','just','about','over','such','only','these','those','may','should','could','each','which','do','if','out','up','so','no','our','what','when','how','all','were','her','she','him','his','my','your','any','two','new','now','way','who','did','get','own','say','too','use','one','said','many','then','them','like','well','back','been','much','most','take','made','after','still','where','most','know','need']);
    sents.forEach(s => {
      const words = s.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 3 && !stopwords.has(w));
      words.forEach(w => { wordFreq[w] = (wordFreq[w] || 0) + 1; });
    });
    const topWords = Object.entries(wordFreq)
      .filter(([w, c]) => c >= 5 && !topEntities.some(e => e.text.toLowerCase().includes(w)))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([text, count]) => ({ text, count, type: 'KEYWORD' }));

    const allNodes = [...topEntities, ...topWords].slice(0, 25);

    // Compute co-occurrences within same sentence
    const cooccurrences = {};
    allNodes.forEach((e1, i) => {
      allNodes.forEach((e2, j) => {
        if (i >= j) return;
        const key = i + '-' + j;
        let count = 0;
        sents.forEach(sent => {
          const sl = sent.toLowerCase();
          if (sl.includes(e1.text.toLowerCase()) && sl.includes(e2.text.toLowerCase())) count++;
        });
        if (count >= 1) cooccurrences[key] = count;
      });
    });

    const edges = Object.entries(cooccurrences)
      .map(([key, weight]) => {
        const [from, to] = key.split('-').map(Number);
        return { from, to, weight };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 40);

    const typeColors = { PERSON: '#22c55e', PLACE: '#3b82f6', ORGANIZATION: '#f59e0b', KEYWORD: '#8b5cf6' };
    const maxCount = Math.max(...allNodes.map(e => e.count), 1);

    const nodes = allNodes.map((e, i) => {
      const angle = (i / allNodes.length) * 2 * Math.PI - Math.PI / 2;
      const r = 170 + (i % 3) * 25;
      return {
        x: 300 + Math.cos(angle) * r,
        y: 280 + Math.sin(angle) * r,
        name: e.text,
        type: e.type || 'ENTITY',
        count: e.count,
        radius: 10 + (e.count / maxCount) * 20,
        color: typeColors[e.type] || '#94a3b8',
      };
    });

    return { nodes, edges, maxWeight: Math.max(...edges.map(e => e.weight), 1) };
  }, [entities, fullText]);

  // Initialize positions from layout
  useEffect(() => {
    if (graphData.nodes.length > 0 && nodePositions.length !== graphData.nodes.length) {
      setNodePositions(graphData.nodes.map(n => ({ x: n.x, y: n.y })));
    }
  }, [graphData.nodes.length]);

  const handleMouseDown = (idx, e) => {
    e.preventDefault();
    setDraggingNode(idx);
  };

  const handleMouseMove = useCallback((e) => {
    if (draggingNode === null || !svgRef.current) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    setNodePositions(prev => prev.map((pos, i) =>
      i === draggingNode ? { x: Math.max(20, Math.min(580, svgP.x)), y: Math.max(20, Math.min(540, svgP.y)) } : pos
    ));
  }, [draggingNode]);

  const handleMouseUp = useCallback(() => { setDraggingNode(null); }, []);

  if (graphData.nodes.length < 3) return null;

  const positions = nodePositions.length === graphData.nodes.length ? nodePositions : graphData.nodes.map(n => ({ x: n.x, y: n.y }));

  const connectedEdges = hoveredNode !== null ? new Set(
    graphData.edges.filter(e => e.from === hoveredNode || e.to === hoveredNode).map((_, i) => i)
  ) : new Set();
  const connectedNodes = hoveredNode !== null ? new Set(
    graphData.edges.filter(e => e.from === hoveredNode || e.to === hoveredNode).flatMap(e => [e.from, e.to])
  ) : new Set();

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1' }}>
      <h3>Cross-Reference Network</h3>
      <p className="viz-desc">Entities and keywords that appear in the same sentences are connected. Drag nodes to rearrange. Hover to explore connections. Thicker lines = more co-occurrences.</p>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Person</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} /> Place</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f59e0b', display: 'inline-block' }} /> Organization</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} /> Keyword</span>
      </div>
      <svg ref={svgRef} width="100%" viewBox="0 0 600 560" style={{ maxHeight: 540, cursor: draggingNode !== null ? 'grabbing' : 'default' }}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
      >
        {/* Edges */}
        {graphData.edges.map((edge, i) => {
          const from = positions[edge.from];
          const to = positions[edge.to];
          if (!from || !to) return null;
          const isHighlighted = connectedEdges.size > 0 && connectedEdges.has(i);
          const dimmed = hoveredNode !== null && !isHighlighted;
          return (
            <line key={i}
              x1={from.x} y1={from.y} x2={to.x} y2={to.y}
              stroke={isHighlighted ? '#e2e8f0' : '#64748b'}
              strokeWidth={Math.max(1, (edge.weight / graphData.maxWeight) * 6)}
              opacity={dimmed ? 0.04 : isHighlighted ? 0.6 : 0.12}
              style={{ transition: 'opacity 0.2s' }}
            />
          );
        })}
        {/* Nodes */}
        {graphData.nodes.map((node, i) => {
          const pos = positions[i];
          if (!pos) return null;
          const isHovered = hoveredNode === i;
          const isConnected = connectedNodes.has(i);
          const dimmed = hoveredNode !== null && !isHovered && !isConnected;
          const isDragging = draggingNode === i;
          return (
            <g key={i}
              onMouseEnter={() => !draggingNode && setHoveredNode(i)}
              onMouseLeave={() => !draggingNode && setHoveredNode(null)}
              onMouseDown={(e) => handleMouseDown(i, e)}
              style={{ cursor: isDragging ? 'grabbing' : 'grab', transition: isDragging ? 'none' : 'opacity 0.2s' }}
              opacity={dimmed ? 0.12 : 1}
            >
              <circle cx={pos.x} cy={pos.y} r={isHovered ? node.radius + 4 : node.radius}
                fill={node.color} opacity={isHovered ? 0.95 : 0.8}
                stroke={isDragging ? '#fff' : isHovered ? '#fff' : 'none'} strokeWidth={isDragging ? 3 : 2}
              />
              <text x={pos.x} y={pos.y + 3} textAnchor="middle" fontSize={Math.min(11, node.radius * 0.7)} fill="white" fontWeight={700}>
                {node.name.length > 12 ? node.name.slice(0, 11) + '..' : node.name}
              </text>
              <text x={pos.x} y={pos.y - node.radius - 5} textAnchor="middle" fontSize={9} fill="#94a3b8" fontWeight={500}>
                {node.count}x
              </text>
            </g>
          );
        })}
      </svg>
      {hoveredNode !== null && graphData.nodes[hoveredNode] && (
        <div style={{ background: '#1e293b', color: '#e2e8f0', padding: '8px 14px', borderRadius: 8, fontSize: 12, marginTop: 8, display: 'inline-block' }}>
          <strong style={{ color: graphData.nodes[hoveredNode].color }}>{graphData.nodes[hoveredNode].name}</strong>
          <span style={{ color: '#94a3b8', marginLeft: 8 }}>{graphData.nodes[hoveredNode].type} · {graphData.nodes[hoveredNode].count} mentions</span>
          {graphData.edges.filter(e => e.from === hoveredNode || e.to === hoveredNode).length > 0 && (
            <span style={{ color: '#94a3b8', marginLeft: 8 }}>
              ↔ {graphData.edges.filter(e => e.from === hoveredNode || e.to === hoveredNode).map(e => {
                const other = e.from === hoveredNode ? e.to : e.from;
                return graphData.nodes[other]?.name;
              }).filter(Boolean).join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ConversationDynamics({ sents, playerRef, videoId }) {
  const [dynamics, setDynamics] = useState([]);
  const [hoveredSegment, setHoveredSegment] = useState(null);

  useEffect(() => {
    if (!sents || sents.length === 0) return;

    const totalDuration = sents[sents.length - 1].end;
    const segmentCount = 50; // 50 segments for smooth scrolling
    const segmentDuration = totalDuration / segmentCount;

    const segments = [];
    for (let i = 0; i < segmentCount; i++) {
      const startTime = i * segmentDuration;
      const endTime = (i + 1) * segmentDuration;

      const segmentSents = sents.filter(s => s.start >= startTime && s.start < endTime);

      const wordCount = segmentSents.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
      const pace = wordCount / segmentDuration;

      segments.push({
        index: i,
        startTime,
        endTime,
        pace,
        wordCount,
        sentenceCount: segmentSents.length
      });
    }

    const maxPace = Math.max(...segments.map(s => s.pace), 1);
    const normalizedSegments = segments.map(s => ({
      ...s,
      normalizedPace: s.pace / maxPace
    }));

    setDynamics(normalizedSegments);
  }, [sents]);

  const handleSegmentClick = (segment) => {
    if (!playerRef.current || !videoId) return;
    const startTime = Math.floor(segment.startTime);
    playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${startTime}&autoplay=1&mute=0&playsinline=1`;

    // Scroll to video
    playerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const getHeatColor = (normalizedPace) => {
    if (normalizedPace < 0.3) return '#3b82f6'; // Cool blue
    if (normalizedPace < 0.5) return '#10b981'; // Green
    if (normalizedPace < 0.7) return '#f59e0b'; // Orange
    return '#ef4444'; // Hot red
  };

  const padTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  const exportDynamicsImage = () => {
    const element = document.querySelector('.dynamics-heatmap-scroll');
    if (!element) return;
    alert('Dynamics export: Use browser screenshot to capture the visualization.');
  };

  return (
    <div className="viz-card conversation-dynamics" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Conversation Dynamics</h3>
          <p className="viz-desc">
            Scroll across timeline. Hot colors = intense/fast discussion, cool colors = calm/slow. Click to jump to that moment.
          </p>
        </div>
        <button className="btn btn-ghost btn-export" onClick={exportDynamicsImage}>
          📚 Export
        </button>
      </div>

      <div className="dynamics-heatmap-container">
        <div className="dynamics-heatmap-scroll">
          {dynamics.map((segment, idx) => (
            <div
              key={idx}
              className="dynamics-heat-bar"
              style={{
                backgroundColor: getHeatColor(segment.normalizedPace),
              }}
              onClick={() => handleSegmentClick(segment)}
              onMouseEnter={() => setHoveredSegment(segment)}
              onMouseLeave={() => setHoveredSegment(null)}
              title={`${padTime(segment.startTime)} - ${segment.pace.toFixed(1)} words/sec`}
            />
          ))}
        </div>
      </div>

      {hoveredSegment && (
        <div className="dynamics-tooltip-bottom">
          <strong>Time:</strong> {padTime(hoveredSegment.startTime)} - {padTime(hoveredSegment.endTime)}<br />
          <strong>Pace:</strong> {hoveredSegment.pace.toFixed(1)} words/second<br />
          <strong>Intensity:</strong> {hoveredSegment.normalizedPace > 0.7 ? 'High' : hoveredSegment.normalizedPace > 0.4 ? 'Medium' : 'Low'}
        </div>
      )}

      <div className="dynamics-legend">
        <span style={{ color: '#3b82f6' }}> Slow/Calm</span>
        <span style={{ color: '#10b981' }}> Moderate</span>
        <span style={{ color: '#f59e0b' }}> Active</span>
        <span style={{ color: '#ef4444' }}> Fast/Intense</span>
      </div>
    </div>
  );
}

// ============================================================================
// v6.0: NEW FEATURE COMPONENTS
// ============================================================================

// Topic Subscriptions Panel
function TopicSubscriptionsPanel({ transcript, videoId, videoTitle }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [newTopic, setNewTopic] = useState('');
  const [email, setEmail] = useState('');
  const [frequency, setFrequency] = useState('instant');
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => { loadSubscriptions(); }, []);

  useEffect(() => {
    if (transcript && subscriptions.length > 0) checkMatches();
  }, [transcript, subscriptions]);

  const loadSubscriptions = async () => {
    try {
      const result = await apiListSubscriptions();
      setSubscriptions(result.subscriptions || []);
    } catch (e) { console.error('Failed to load subscriptions:', e); }
  };

  const checkMatches = async () => {
    if (!transcript) return;
    try {
      const result = await apiCheckSubscriptionMatches({ transcript, video_id: videoId, video_title: videoTitle });
      const newMatches = result.matches || [];
      setMatches(newMatches);

      // Browser notification for new matches
      if (newMatches.length > 0 && 'Notification' in window) {
        if (Notification.permission === 'default') {
          Notification.requestPermission();
        }
        if (Notification.permission === 'granted') {
          const topics = newMatches.map(m => m.topic).join(', ');
          const counts = newMatches.map(m => `${m.topic} (${m.mention_count || 1}x)`).join(', ');
          new Notification('Topic Alert: ' + topics, {
            body: `Found in: ${videoTitle || 'this meeting'}. Mentions: ${counts}`,
            icon: '/logo.png',
            tag: 'subscription-match-' + videoId,
          });
        }
      }
    } catch (e) { console.error('Failed to check matches:', e); }
  };

  const handleSubscribe = async () => {
    if (!newTopic.trim()) return;
    setLoading(true);
    try {
      await apiCreateSubscription({ topic: newTopic, email, frequency });
      setNewTopic('');
      setShowAddForm(false);
      loadSubscriptions();
    } catch (e) { alert('Failed to create subscription'); }
    finally { setLoading(false); }
  };

  const handleUnsubscribe = async (topic) => {
    try {
      await apiDeleteSubscription({ topic });
      loadSubscriptions();
    } catch (e) { alert('Failed to unsubscribe'); }
  };

  return (
    <div className="viz-card subscriptions-card">
      <h3>🔔 Topic Subscriptions</h3>
      <p className="viz-desc">Get alerts when topics you care about are discussed in meetings.</p>

      {matches.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', border: '2px solid #22c55e', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontWeight: '700', color: '#15803d', marginBottom: '8px' }}>
            🎯 {matches.length} topic{matches.length > 1 ? 's' : ''} mentioned in this meeting!
          </div>
          {matches.map((match, idx) => (
            <div key={idx} style={{ background: 'white', padding: '10px', borderRadius: '8px', marginTop: '8px', fontSize: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{match.topic}</strong>
                <span style={{ fontSize: '11px', color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: '10px' }}>
                  {match.mention_count || 1} mention{(match.mention_count || 1) !== 1 ? 's' : ''}
                </span>
              </div>
              <div style={{ color: '#64748b', marginTop: '4px', fontSize: '13px' }}>{match.context}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick Topic Suggestions */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '8px' }}>Popular Civic Topics:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {['Budget', 'Zoning', 'Public Safety', 'Schools', 'Infrastructure', 'Housing', 'Parks', 'Traffic'].map((topic) => (
            <button
              key={topic}
              onClick={() => {
                setNewTopic(topic);
                setShowAddForm(true);
              }}
              style={{
                padding: '4px 10px',
                fontSize: '11px',
                background: subscriptions.some(s => s.topic.toLowerCase() === topic.toLowerCase()) ? '#dcfce7' : '#f1f5f9',
                border: subscriptions.some(s => s.topic.toLowerCase() === topic.toLowerCase()) ? '1px solid #22c55e' : '1px solid #e2e8f0',
                borderRadius: '12px',
                cursor: 'pointer',
                color: subscriptions.some(s => s.topic.toLowerCase() === topic.toLowerCase()) ? '#15803d' : '#64748b',
              }}
            >
              {subscriptions.some(s => s.topic.toLowerCase() === topic.toLowerCase()) ? '✔ ' : '+ '}{topic}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>Your Subscriptions ({subscriptions.length})</div>
        {subscriptions.length === 0 ? (
          <div style={{ color: '#64748b', fontStyle: 'italic', fontSize: '13px', padding: '12px', background: '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
            No subscriptions yet. Click a topic above or add your own below.
          </div>
        ) : (
          <div style={{ maxHeight: '150px', overflow: 'auto' }}>
            {subscriptions.map((sub, idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '14px' }}>🔔</span>
                  <div>
                    <span style={{ fontWeight: '600', fontSize: '13px' }}>{sub.topic}</span>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      {sub.frequency === 'instant' ? '⚡ Instant' : sub.frequency === 'daily' ? '📅 Daily' : '📆 Weekly'}
                    </div>
                  </div>
                </div>
                <button onClick={() => handleUnsubscribe(sub.topic)} style={{ background: '#fee2e2', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '12px', padding: '4px 8px', borderRadius: '4px' }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddForm ? (
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '2px solid #1E7F63' }}>
          <div style={{ fontWeight: 600, marginBottom: '12px', color: '#1E7F63' }}>Add New Subscription</div>
          <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Enter topic (e.g., bike lanes, school budget)"
            aria-label="Topic to subscribe to"
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px', fontSize: '14px' }} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for alerts (optional)"
            aria-label="Email for alerts"
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px', fontSize: '14px' }} />
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px', fontSize: '14px' }}>
            <option value="instant">⚡ Instant alerts</option>
            <option value="daily">📅 Daily digest</option>
            <option value="weekly">📆 Weekly summary</option>
          </select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handleSubscribe} disabled={loading || !newTopic.trim()}>{loading ? 'Subscribing...' : '✔ Subscribe'}</button>
            <button className="btn btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-accent" onClick={() => setShowAddForm(true)} style={{ width: '100%' }}>+ Add Custom Topic</button>
      )}
    </div>
  );
}

// Relevant Documents Panel - AI-powered document finder
function RelevantDocumentsPanel({ videoTitle, transcript, entities }) {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [organization, setOrganization] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  // Document type icons and colors
  const docTypeConfig = {
    agenda: { icon: '📹', color: '#3b82f6', label: 'Agenda' },
    minutes: { icon: '📝', color: '#22c55e', label: 'Minutes' },
    proposal: { icon: '📄', color: '#f59e0b', label: 'Proposal' },
    contract: { icon: '📑', color: '#8b5cf6', label: 'Contract' },
    presentation: { icon: '📊', color: '#ec4899', label: 'Presentation' },
    report: { icon: '📈', color: '#06b6d4', label: 'Report' },
    ordinance: { icon: '⚖️', color: '#6366f1', label: 'Ordinance' },
    resolution: { icon: '🏛️', color: '#14b8a6', label: 'Resolution' },
    budget: { icon: '💰', color: '#10b981', label: 'Budget' },
    other: { icon: '🔎', color: '#64748b', label: 'Document' }
  };

  const findDocuments = async () => {
    if (!videoTitle && !transcript) return;
    
    setLoading(true);
    setError(null);
    setHasSearched(true);
    
    try {
      const response = await fetch('/api/find-relevant-documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_title: videoTitle,
          transcript: transcript?.substring(0, 5000), // Send first 5000 chars
          entities: entities?.slice(0, 20) || []
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        setError(data.error);
        setDocuments([]);
      } else {
        setDocuments(data.documents || []);
        setOrganization(data.organization || '');
      }
    } catch (err) {
      console.error('Document search error:', err);
      setError('Failed to search for documents');
    } finally {
      setLoading(false);
    }
  };

  // Auto-search on first load when we have data
  useEffect(() => {
    if (videoTitle && !hasSearched && !loading) {
      // Delay slightly to not overwhelm on initial load
      const timer = setTimeout(() => {
        findDocuments();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [videoTitle]);

  const getDocConfig = (type) => docTypeConfig[type] || docTypeConfig.other;

  return (
    <div className="viz-card">
      <h3>📂 Relevant Documents</h3>
      <p className="viz-desc">AI-discovered documents related to this meeting.</p>

      {/* Search Button */}
      <button
        className="btn btn-primary"
        onClick={findDocuments}
        disabled={loading || (!videoTitle && !transcript)}
        style={{ width: '100%', marginBottom: '16px' }}
      >
        {loading ? (
          <>🔄 Searching for documents...</>
        ) : hasSearched ? (
          <>🔄 Refresh Search</>
        ) : (
          <>🔍 Find Related Documents</>
        )}
      </button>

      {/* Organization detected */}
      {organization && (
        <div style={{ 
          background: '#f0fdf4', 
          padding: '10px 14px', 
          borderRadius: '8px', 
          marginBottom: '12px',
          border: '1px solid #22c55e',
          fontSize: '13px',
          color: '#166534'
        }}>
          <strong>🏛️ Organization:</strong> {organization}
        </div>
      )}

      {/* Error state */}
      {error && (
        <div style={{ 
          background: '#fef2f2', 
          padding: '12px', 
          borderRadius: '8px', 
          marginBottom: '12px',
          border: '1px solid #fecaca',
          color: '#dc2626',
          fontSize: '13px'
        }}>
          ⚠️️ {error}
        </div>
      )}

      {/* Documents list */}
      {documents.length > 0 ? (
        <div style={{ maxHeight: '400px', overflow: 'auto' }}>
          {documents.map((doc, idx) => {
            const config = getDocConfig(doc.type);
            return (
              <a
                key={idx}
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  padding: '12px 14px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  marginBottom: '8px',
                  border: '2px solid #e2e8f0',
                  textDecoration: 'none',
                  color: 'inherit',
                  transition: 'all 0.2s',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = config.color;
                  e.currentTarget.style.background = '#f0fdf4';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.background = '#f8fafc';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                  {/* Icon or Thumbnail */}
                  {doc.thumbnail ? (
                    <img 
                      src={doc.thumbnail} 
                      alt="" 
                      style={{ 
                        width: '48px', 
                        height: '36px', 
                        borderRadius: '4px', 
                        objectFit: 'cover' 
                      }} 
                    />
                  ) : (
                    <div style={{ 
                      fontSize: '24px', 
                      width: '40px', 
                      height: '40px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      background: `${config.color}15`,
                      borderRadius: '8px'
                    }}>
                      {config.icon}
                    </div>
                  )}
                  
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      fontSize: '13px', 
                      marginBottom: '4px',
                      color: '#374151',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}>
                      {doc.title}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      {/* Type badge */}
                      <span style={{
                        padding: '2px 8px',
                        background: `${config.color}20`,
                        color: config.color,
                        borderRadius: '10px',
                        fontSize: '10px',
                        fontWeight: 600,
                      }}>
                        {config.label}
                      </span>
                      
                      {/* Source */}
                      <span style={{ fontSize: '11px', color: '#64748b' }}>
                        {doc.source}
                      </span>
                    </div>
                    
                    {doc.description && (
                      <div style={{ 
                        fontSize: '11px', 
                        color: '#64748b', 
                        marginTop: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {doc.description}
                      </div>
                    )}
                  </div>
                  
                  {/* External link indicator */}
                  <div style={{ 
                    fontSize: '14px', 
                    color: '#94a3b8',
                    alignSelf: 'center'
                  }}>
                    ↗
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      ) : hasSearched && !loading && !error ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '30px', 
          background: '#f8fafc', 
          borderRadius: '12px',
          border: '2px dashed #e2e8f0' 
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔭</div>
          <div style={{ color: '#64748b', fontSize: '13px' }}>
            No public documents found for this meeting.
          </div>
          <div style={{ color: '#94a3b8', fontSize: '12px', marginTop: '4px' }}>
            Try searching the organization's website directly.
          </div>
        </div>
      ) : !hasSearched && !loading ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '30px', 
          background: '#f8fafc', 
          borderRadius: '12px',
          border: '2px dashed #e2e8f0' 
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🔍</div>
          <div style={{ color: '#64748b', fontSize: '13px' }}>
            Click "Find Related Documents" to search for agendas, minutes, and more.
          </div>
        </div>
      ) : null}

      {/* Document Types Legend */}
      {documents.length > 0 && (
        <div style={{ 
          marginTop: '12px', 
          padding: '10px', 
          background: '#f1f5f9', 
          borderRadius: '8px',
          fontSize: '10px',
          color: '#64748b'
        }}>
          <strong>Document Types:</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '6px' }}>
            {Object.entries(docTypeConfig).slice(0, 6).map(([type, config]) => (
              <span key={type} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {config.icon} {config.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Issue Timeline Panel
function IssueTimelinePanel({ transcript, videoId, videoTitle, entities }) {
  const [issues, setIssues] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [newIssueName, setNewIssueName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [trackingResult, setTrackingResult] = useState(null);

  useEffect(() => { loadIssues(); }, []);

  const loadIssues = async () => {
    try {
      const result = await apiListIssues();
      setIssues(result.issues || []);
    } catch (e) { console.error('Failed to load issues:', e); }
  };

  const handleCreateIssue = async () => {
    if (!newIssueName.trim()) return;
    setLoading(true);
    try {
      await apiCreateIssue({ name: newIssueName });
      setNewIssueName('');
      setShowCreateForm(false);
      loadIssues();
    } catch (e) { alert('Failed to create issue'); }
    finally { setLoading(false); }
  };

  const handleTrackInMeeting = async (issueId) => {
    if (!transcript) { alert('Load a meeting transcript first'); return; }
    setLoading(true);
    try {
      const result = await apiAutoTrackIssue({ issue_id: issueId, transcript, video_id: videoId, video_title: videoTitle });
      setTrackingResult(result);
      if (result.mention_count > 0) {
        await apiAddMeetingToIssue({ issue_id: issueId, video_id: videoId, video_title: videoTitle, summary: result.ai_summary, decisions: result.ai_decisions });
        loadIssues();
      }
    } catch (e) { alert('Failed to track issue'); }
    finally { setLoading(false); }
  };

  const handleViewTimeline = async (issueId) => {
    try {
      const result = await apiGetIssueTimeline(issueId);
      setTimeline(result);
      setSelectedIssue(issueId);
    } catch (e) { alert('Failed to load timeline'); }
  };

  return (
    <div className="viz-card issue-timeline-card">
      <h3>Issue Timeline Tracker</h3>
      <p className="viz-desc">Track how issues evolve across multiple meetings over time.</p>

      {trackingResult && trackingResult.mention_count > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)', border: '2px solid #3b82f6', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontWeight: '700', color: '#1d4ed8', marginBottom: '8px' }}>Found {trackingResult.mention_count} mentions of "{trackingResult.issue_name}"</div>
          {trackingResult.ai_summary && <div style={{ marginTop: '8px', color: '#1e40af' }}><strong>Summary:</strong> {trackingResult.ai_summary}</div>}
          <button className="btn btn-ghost" onClick={() => setTrackingResult(null)} style={{ marginTop: '8px' }}>Dismiss</button>
        </div>
      )}

      {timeline && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setTimeline(null)}>
          <div style={{ background: 'white', borderRadius: '16px', width: '90%', maxWidth: '800px', maxHeight: '80vh', overflow: 'auto', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>{timeline.name} Timeline</h2>
              <button onClick={() => setTimeline(null)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>X</button>
            </div>
            <div style={{ borderLeft: '3px solid #1E7F63', paddingLeft: '20px' }}>
              {timeline.meetings && timeline.meetings.length > 0 ? timeline.meetings.map((meeting, idx) => (
                <div key={idx} style={{ position: 'relative', paddingBottom: '24px', marginBottom: '24px', borderBottom: idx < timeline.meetings.length - 1 ? '1px dashed #e2e8f0' : 'none' }}>
                  <div style={{ position: 'absolute', left: '-28px', width: '14px', height: '14px', background: '#1E7F63', borderRadius: '50%', border: '3px solid white' }} />
                  <div style={{ fontSize: '12px', color: '#64748b' }}>{new Date(meeting.date).toLocaleDateString()}</div>
                  <div style={{ fontWeight: '600', marginTop: '4px' }}>{meeting.video_title}</div>
                  {meeting.summary && <div style={{ marginTop: '8px', color: '#374151' }}>{meeting.summary}</div>}
                </div>
              )) : <div style={{ color: '#64748b' }}>No meetings tracked yet</div>}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        {issues.length === 0 ? <div style={{ color: '#64748b', fontStyle: 'italic' }}>No issues being tracked</div> : issues.map((issue, idx) => (
          <div key={idx} style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontWeight: '600' }}>{issue.name}</span>
                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#64748b' }}>{issue.meetings?.length || 0} meetings</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-ghost" onClick={() => handleViewTimeline(issue.id)} style={{ fontSize: '12px', padding: '6px 12px' }}>View Timeline</button>
                <button className="btn btn-accent" onClick={() => handleTrackInMeeting(issue.id)} disabled={loading || !transcript} style={{ fontSize: '12px', padding: '6px 12px' }}>{loading ? '...' : 'Track in This Meeting'}</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {showCreateForm ? (
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '2px solid #e2e8f0' }}>
          <input type="text" value={newIssueName} onChange={(e) => setNewIssueName(e.target.value)} placeholder="Issue name (e.g., Main Street Redesign)"
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handleCreateIssue} disabled={loading}>Create Issue</button>
            <button className="btn btn-ghost" onClick={() => setShowCreateForm(false)}>Cancel</button>
          </div>
        </div>
      ) : <button className="btn btn-accent" onClick={() => setShowCreateForm(true)} style={{ width: '100%' }}>+ Track New Issue</button>}
    </div>
  );
}

// Civic Meeting Finder - Search for local government meetings on YouTube
function CivicMeetingFinder({ onSelectVideo }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recentSearches, setRecentSearches] = useState([]);
  const [apiStatus, setApiStatus] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  // Filters
  const [dateRange, setDateRange] = useState('90');
  const [meetingType, setMeetingType] = useState('all');
  const [sortBy, setSortBy] = useState('relevance');
  // Channel import
  const [showChannelImport, setShowChannelImport] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelName, setChannelName] = useState('');

  // Check API status on mount
  useEffect(() => {
    fetch('/api/youtube-status')
      .then(r => r.json())
      .then(data => setApiStatus(data))
      .catch(() => setApiStatus({ configured: false }));
  }, []);

  const searchMeetings = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError(null);

    try {
      // Check client-side cache first (15 min TTL)
      const cacheKey = `civic_search_${searchQuery.trim().toLowerCase()}_${dateRange}_${meetingType}_${sortBy}`;
      try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
          setResults(cached.items || []);
          if (cached.fallback) setError('Using cached results (API quota was exceeded).');
          setLoading(false);
          return;
        }
      } catch (e) { /* ignore corrupt cache */ }

      // Send the raw municipality name with filters — backend handles multi-query strategy
      const params = new URLSearchParams({
        q: searchQuery.trim(),
        type: 'video',
        maxResults: '50',
        order: sortBy === 'oldest' ? 'date' : 'date',
        days: dateRange,
        meetingType: meetingType,
      });
      const response = await fetch(`/api/youtube-search?${params}`);
      const data = await response.json();

      // Check for API error in response
      if (data.error && !data.items?.length) {
        setError(data.error);
        setResults([]);
        return;
      }

      // Show fallback notice if using yt-dlp instead of YouTube API
      if (data.fallback) {
        setError(`Using direct YouTube search (API quota exceeded). Results may be less comprehensive.`);
      }

      // Score and sort results to prioritize civic/government content
      const civicKeywords = ['council', 'board', 'committee', 'selectboard', 'select board', 'town', 'city', 'municipal', 'government', 'public', 'hearing', 'session', 'meeting', 'planning', 'zoning', 'school committee', 'finance', 'budget', 'warrant'];
      let items = data.items || [];

      // Score each result: civic relevance + recency
      items = items.map(item => {
        const title = (item.snippet?.title || '').toLowerCase();
        const channel = (item.snippet?.channelTitle || '').toLowerCase();
        const desc = (item.snippet?.description || '').toLowerCase();
        const combined = `${title} ${channel} ${desc}`;

        // Count how many civic keywords match
        let civicScore = civicKeywords.filter(kw => combined.includes(kw)).length;

        // Bonus for having the municipality name in channel (official channels)
        const queryLower = searchQuery.trim().toLowerCase();
        if (channel.includes(queryLower)) civicScore += 5;
        if (title.includes(queryLower)) civicScore += 2;

        return { ...item, _civicScore: civicScore };
      });

      // Post-filter by meeting type if a specific type is selected
      if (meetingType !== 'all') {
        const typeKeywords = {
          council: ['council', 'city council', 'council meeting', 'council session'],
          board: ['board', 'committee', 'selectboard', 'select board', 'commission'],
          planning: ['planning', 'zoning', 'land use', 'development'],
          hearing: ['hearing', 'public hearing', 'town hall', 'public comment', 'testimony'],
          school: ['school', 'education', 'school board', 'school committee'],
        };
        const keywords = typeKeywords[meetingType] || [];
        if (keywords.length > 0) {
          items = items.filter(item => {
            const text = `${item.snippet?.title || ''} ${item.snippet?.description || ''} ${item.snippet?.channelTitle || ''}`.toLowerCase();
            return keywords.some(kw => text.includes(kw));
          });
        }
      }

      // Sort based on user preference
      if (sortBy === 'oldest') {
        items.sort((a, b) => new Date(a.snippet?.publishedAt || 0) - new Date(b.snippet?.publishedAt || 0));
      } else if (sortBy === 'newest') {
        items.sort((a, b) => new Date(b.snippet?.publishedAt || 0) - new Date(a.snippet?.publishedAt || 0));
      } else {
        // Relevance: high civic score first, then by date within similar scores
        items.sort((a, b) => {
          const tierA = a._civicScore >= 3 ? 2 : a._civicScore >= 1 ? 1 : 0;
          const tierB = b._civicScore >= 3 ? 2 : b._civicScore >= 1 ? 1 : 0;
          if (tierA !== tierB) return tierB - tierA;
          const dateA = new Date(a.snippet?.publishedAt || 0);
          const dateB = new Date(b.snippet?.publishedAt || 0);
          return dateB - dateA;
        });
      }

      setResults(items);

      // Cache results in localStorage (15 min TTL)
      try {
        // Only cache successful API results, not fallback/error results
        if (!data.fallback) {
          localStorage.setItem(cacheKey, JSON.stringify({ items, ts: Date.now() }));
        }
      } catch (e) { /* localStorage full — ignore */ }

      // Save to recent searches
      if (!recentSearches.includes(searchQuery)) {
        setRecentSearches(prev => [searchQuery, ...prev.slice(0, 4)]);
      }
    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed. Try a different query or check your connection.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const importChannel = async () => {
    if (!channelInput.trim()) return;
    setChannelLoading(true);
    setError(null);
    try {
      const resp = await fetch(`/api/youtube-channel-videos?channel=${encodeURIComponent(channelInput.trim())}&maxResults=50`);
      const data = await resp.json();
      if (data.error) { setError(data.error); return; }
      setResults(data.items || []);
      setChannelName(data.channel_name || '');
      if (data.items?.length > 0) {
        setShowChannelImport(false);
      }
    } catch (err) {
      setError('Failed to load channel videos');
    } finally {
      setChannelLoading(false);
    }
  };

  const copyUrl = async (videoId) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(videoId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Copy failed:', err);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <div className="viz-card" style={{ marginTop: '20px' }}>
      <h3>Find Civic Meetings</h3>
      <p className="viz-desc">Search for government and civic meetings by city, town, or YouTube channel name. Click any result to analyze it.</p>


      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchMeetings()}
            placeholder="Enter city, town, or YouTube channel (e.g., New York City Council, Brookline MA, @NYCCouncil)..."
            style={{
              flex: 1,
              padding: '14px 16px',
              border: '2px solid #22c55e',
              borderRadius: '10px',
              fontSize: '15px',
              background: 'white',
            }}
          />
          <button
            className="btn btn-primary"
            onClick={searchMeetings}
            disabled={loading || !searchQuery.trim()}
            style={{ minWidth: '120px', fontSize: '15px' }}
          >
            {loading ? '🔄 Searching...' : '🔍 Search'}
          </button>
        </div>
        <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
          Try: "New York City Council", "Brookline MA", "San Francisco", "@NYCCouncil"
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={dateRange} onChange={e => setDateRange(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', color: '#374151' }}>
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
            <option value="0">All time</option>
          </select>
          <select value={meetingType} onChange={e => setMeetingType(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', color: '#374151' }}>
            <option value="all">All Types</option>
            <option value="council">City Council</option>
            <option value="board">Board / Committee</option>
            <option value="planning">Planning / Zoning</option>
            <option value="hearing">Public Hearing</option>
            <option value="school">School Committee</option>
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: 'white', color: '#374151' }}>
            <option value="relevance">Sort: Relevance</option>
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
          </select>
          {(searchQuery || results.length > 0 || dateRange !== '90' || meetingType !== 'all') && (
            <button onClick={() => { setSearchQuery(''); setResults([]); setError(null); setDateRange('90'); setMeetingType('all'); setSortBy('relevance'); }}
              style={{ padding: '6px 12px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: '#fef2f2', cursor: 'pointer', color: '#dc2626', fontWeight: 500 }}>
              Clear
            </button>
          )}
        </div>
        <div style={{ marginTop: '8px' }}>
          <button
            onClick={() => setShowChannelImport(!showChannelImport)}
            style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '6px', border: '1px solid #d1d5db', background: showChannelImport ? '#f0fdf4' : 'white', cursor: 'pointer', color: '#166534', fontWeight: 500 }}
          >
            {showChannelImport ? 'Hide' : 'Import YouTube Channel'}
          </button>
        </div>

        {/* Channel Import */}
        {showChannelImport && (
          <div style={{ marginTop: '10px', padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '12px', color: '#475569', marginBottom: '8px', fontWeight: 500 }}>
              Import all latest videos from a YouTube channel:
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={channelInput}
                onChange={e => setChannelInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && importChannel()}
                placeholder="@NYCCouncil or https://youtube.com/@NYCCouncil"
                style={{ flex: 1, padding: '8px 12px', fontSize: '13px', border: '1px solid #d1d5db', borderRadius: '6px' }}
              />
              <button
                onClick={importChannel}
                disabled={channelLoading || !channelInput.trim()}
                style={{ padding: '8px 16px', fontSize: '13px', background: '#1e7f63', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {channelLoading ? 'Loading...' : 'Load Videos'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Channel name display */}
      {channelName && results.length > 0 && (
        <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600, marginBottom: '12px', padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px' }}>
          {results.length} videos from {channelName}
        </div>
      )}

      {/* Recent Searches */}
      {recentSearches.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>Recent searches:</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {recentSearches.map((search, idx) => (
              <button
                key={idx}
                onClick={() => { setSearchQuery(search); }}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  background: '#f0fdf4',
                  border: '1px solid #22c55e',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  color: '#166534',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#dcfce7'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#f0fdf4'}
              >
                {search}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '12px',
          background: error.includes('quota') || error.includes('fallback') || error.includes('direct YouTube') ? '#fffbeb' : '#fef2f2',
          color: error.includes('quota') || error.includes('fallback') || error.includes('direct YouTube') ? '#92400e' : '#dc2626',
          border: `1px solid ${error.includes('quota') || error.includes('fallback') || error.includes('direct YouTube') ? '#fde68a' : '#fecaca'}`,
        }}>
          {error}
        </div>
      )}

      {/* Results */}
      <div style={{ maxHeight: '500px', overflow: 'auto' }}>
        {results.length > 0 ? (
          <>
            <div style={{ fontSize: '13px', color: '#166534', fontWeight: 600, marginBottom: '12px', padding: '8px 12px', background: '#f0fdf4', borderRadius: '8px' }}>
              Found {results.length} meetings — click any to analyze:
            </div>
            {results.map((video, idx) => (
              <div
                key={idx}
                onClick={() => onSelectVideo && onSelectVideo(`https://www.youtube.com/watch?v=${video.id?.videoId}`)}
                style={{
                  padding: '14px',
                  background: '#f8fafc',
                  borderRadius: '10px',
                  marginBottom: '10px',
                  border: '2px solid #e2e8f0',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#22c55e';
                  e.currentTarget.style.background = '#f0fdf4';
                  e.currentTarget.style.transform = 'translateX(4px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#e2e8f0';
                  e.currentTarget.style.background = '#f8fafc';
                  e.currentTarget.style.transform = 'translateX(0)';
                }}
              >
                <div style={{ display: 'flex', gap: '14px' }}>
                  {video.snippet?.thumbnails?.default?.url && (
                    <img
                      src={video.snippet.thumbnails.default.url}
                      alt=""
                      style={{ width: '100px', height: '75px', borderRadius: '6px', objectFit: 'cover' }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', lineHeight: 1.4, marginBottom: '6px', color: '#1e293b' }}>
                      {video.snippet?.title}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                      {video.snippet?.channelTitle} • {formatDate(video.snippet?.publishedAt)}
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectVideo && onSelectVideo(`https://www.youtube.com/watch?v=${video.id?.videoId}`);
                        }}
                        style={{
                          padding: '6px 14px',
                          fontSize: '12px',
                          background: '#22c55e',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: 'white',
                          fontWeight: 600,
                        }}
                      >
                        📊 Analyze This Meeting
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyUrl(video.id?.videoId);
                        }}
                        style={{
                          padding: '6px 12px',
                          fontSize: '12px',
                          background: copiedId === video.id?.videoId ? '#22c55e' : '#e2e8f0',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          color: copiedId === video.id?.videoId ? 'white' : '#64748b',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        {copiedId === video.id?.videoId ? '✓ Copied!' : '📋 Copy URL'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </>
        ) : !loading && searchQuery && (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
            <div>No meetings found. Try a different city or town name.</div>
          </div>
        )}
        
        {/* Empty state removed — tip text lives in parent landing page section */}
      </div>
    </div>
  );
}


// Jargon Translator Panel
// Jargon Translator - Uses GPT for civic/government term explanations
function JargonTranslatorPanel() {
  const [term, setTerm] = useState('');
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleExplain = async () => {
    if (!term.trim()) return;
    setLoading(true);
    try {
      const result = await apiExplainJargon({ term });
      setExplanation(result);
    } catch (e) { console.error('Jargon explanation failed:', e); }
    finally { setLoading(false); }
  };

  return (
    <div className="viz-card jargon-card" style={{ marginTop: '24px' }}>
      <h3>🔖 Jargon Translator</h3>
      <p className="viz-desc">Don't understand a civic term? Get a plain-language explanation powered by AI.</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input 
          type="text" 
          value={term} 
          onChange={(e) => setTerm(e.target.value)} 
          onKeyDown={(e) => e.key === 'Enter' && handleExplain()}
          placeholder="Enter a term (e.g., TIF, variance, quorum, RFP)"
          style={{ flex: 1, padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }} 
        />
        <button className="btn btn-primary" onClick={handleExplain} disabled={loading}>
          {loading ? 'Thinking...' : 'Explain'}
        </button>
      </div>
      {explanation && (
        <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', padding: '16px', borderRadius: '12px', border: '2px solid #22c55e' }}>
          <div style={{ fontWeight: '700', color: '#15803d', marginBottom: '8px', fontSize: '16px' }}>{explanation.term}</div>
          <div style={{ color: '#166534', lineHeight: '1.6' }}>{explanation.explanation}</div>
          {explanation.example && (
            <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(255,255,255,0.5)', borderRadius: '8px', fontSize: '13px', color: '#475569' }}>
              <strong>Example:</strong> {explanation.example}
            </div>
          )}
          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '10px' }}>
            🤖 AI-powered explanation for civic/government context
          </div>
        </div>
      )}
    </div>
  );
}

// Cross-Meeting Analysis Panel (Combined Knowledge Graph + Comparison)
function CrossMeetingAnalysisPanel({ currentVideoId, currentTitle, currentTranscript, currentEntities, currentSummary }) {
  // Core state
  const [meetings, setMeetings] = useState([]);
  const [activeTab, setActiveTab] = useState('finder');
  const [loading, setLoading] = useState(false);
  
  // Finder state
  const [searchCity, setSearchCity] = useState('');
  const [finderResults, setFinderResults] = useState([]);
  const [finderLoading, setFinderLoading] = useState(false);
  const [recentCities, setRecentCities] = useState([]);
  
  // Issue tracking state
  const [issueSearch, setIssueSearch] = useState('');
  const [issueResults, setIssueResults] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [trackedIssues, setTrackedIssues] = useState([]);
  
  // Video viewer state
  const [activeVideoTab, setActiveVideoTab] = useState(null);
  
  // Export state
  const [selectedClips, setSelectedClips] = useState([]);
  const [exportLoading, setExportLoading] = useState(false);

  // Initialize with current meeting
  useEffect(() => {
    if (currentVideoId && currentTitle) {
      const exists = meetings.find(m => m.videoId === currentVideoId);
      if (!exists) {
        setMeetings([{
          videoId: currentVideoId,
          title: currentTitle,
          transcript: currentTranscript,
          entities: currentEntities || [],
          date: new Date().toISOString(),
          isCurrent: true,
          segments: [] // Will be populated when needed
        }]);
        setActiveVideoTab(currentVideoId);
      }
    }
  }, [currentVideoId, currentTitle]);

  // Helper: Extract video ID from URL
  const extractVideoId = (url) => {
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  // Helper: Format timestamp
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };

  // Search for civic meetings
  const searchCivicMeetings = async () => {
    if (!searchCity.trim()) return;
    setFinderLoading(true);
    
    try {
      const civicTerms = ['city council', 'town meeting', 'board meeting', 'selectboard', 'planning board'];
      const searchTerm = `${searchCity} ${civicTerms[Math.floor(Math.random() * civicTerms.length)]}`;
      
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(searchTerm)}&type=video&maxResults=12&order=date`);
      const data = await response.json();
      
      if (data.error) {
        alert(data.error);
        setFinderResults([]);
        return;
      }
      
      setFinderResults(data.items || []);
      
      if (!recentCities.includes(searchCity)) {
        setRecentCities(prev => [searchCity, ...prev.slice(0, 4)]);
      }
    } catch (err) {
      console.error('Finder error:', err);
    } finally {
      setFinderLoading(false);
    }
  };

  // Add meeting from finder or URL
  const addMeeting = async (videoId, title, publishedAt) => {
    if (meetings.find(m => m.videoId === videoId)) {
      alert('This meeting is already in your collection');
      return;
    }
    
    setLoading(true);
    
    try {
      // Fetch transcript
      const transcriptRes = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      
      if (!transcriptRes.ok) throw new Error('Failed to fetch transcript');
      
      const transcriptText = await transcriptRes.text();
      let fullText = transcriptText;
      let segments = [];
      
      // Parse VTT to get segments with timestamps
      if (transcriptText.includes('WEBVTT') || transcriptText.includes('-->')) {
        const lines = transcriptText.split('\n');
        let currentSegment = null;
        
        for (const line of lines) {
          if (line.includes('-->')) {
            const times = line.match(/(\d{2}:\d{2}:\d{2}\.\d{3})/g);
            if (times && times.length >= 2) {
              const parseTime = (t) => {
                const parts = t.split(':');
                return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
              };
              currentSegment = { start: parseTime(times[0]), end: parseTime(times[1]), text: '' };
            }
          } else if (line.trim() && currentSegment && !line.match(/^\d+$/) && !line.includes('WEBVTT')) {
            currentSegment.text = line.trim();
            segments.push({ ...currentSegment });
          }
        }
        
        fullText = segments.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
      }
      
      // Extract keywords locally
      const words = fullText.toLowerCase().split(/\s+/);
      const wordFreq = {};
      const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were', 'be', 'have', 'has', 'had', 'this', 'that', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'some', 'no', 'not', 'only', 'so', 'very', 'just', 'also', 'now', 'going', 'think', 'know', 'want', 'get', 'like', 'make', 'say', 'see', 'go', 'well', 'back', 'much', 'even', 'still', 'way', 'really', 'thing', 'actually', 'something', 'need', 'year', 'time', 'lot', 'okay', 'yeah', 'thank', 'please', 'right']);
      
      words.forEach(word => {
        const clean = word.replace(/[^a-z]/g, '');
        if (clean.length > 3 && !stopWords.has(clean)) {
          wordFreq[clean] = (wordFreq[clean] || 0) + 1;
        }
      });
      
      const entities = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 40)
        .map(([text, count]) => ({ text: text.charAt(0).toUpperCase() + text.slice(1), count, type: 'KEYWORD' }));
      
      const newMeeting = {
        videoId,
        title: title || `Meeting ${videoId}`,
        transcript: fullText,
        entities,
        segments,
        date: publishedAt || new Date().toISOString(),
        isCurrent: false
      };
      
      setMeetings(prev => [...prev, newMeeting]);
      setActiveVideoTab(videoId);
      setActiveTab('timeline');
      
    } catch (err) {
      console.error('Add meeting error:', err);
      alert('Failed to add meeting: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  // Search for issues across all meetings
  const searchIssues = () => {
    if (!issueSearch.trim()) return;
    
    const searchLower = issueSearch.toLowerCase();
    const results = [];
    
    meetings.forEach(meeting => {
      // Search in segments for timestamp-based results
      if (meeting.segments && meeting.segments.length > 0) {
        meeting.segments.forEach(seg => {
          if (seg.text.toLowerCase().includes(searchLower)) {
            results.push({
              meetingId: meeting.videoId,
              meetingTitle: meeting.title,
              meetingDate: meeting.date,
              text: seg.text,
              start: seg.start,
              end: seg.end,
              context: getContext(meeting.segments, seg)
            });
          }
        });
      } else if (meeting.transcript) {
        // Fallback to transcript search
        const sentences = meeting.transcript.split(/[.!?]+/);
        sentences.forEach((sent, idx) => {
          if (sent.toLowerCase().includes(searchLower)) {
            results.push({
              meetingId: meeting.videoId,
              meetingTitle: meeting.title,
              meetingDate: meeting.date,
              text: sent.trim(),
              start: null,
              context: sentences.slice(Math.max(0, idx - 1), idx + 2).join('. ')
            });
          }
        });
      }
    });
    
    // Sort by date
    results.sort((a, b) => new Date(a.meetingDate) - new Date(b.meetingDate));
    setIssueResults(results);
    
    // Add to tracked issues if not already there
    if (!trackedIssues.includes(issueSearch)) {
      setTrackedIssues(prev => [issueSearch, ...prev.slice(0, 9)]);
    }
  };

  // Get surrounding context for a segment
  const getContext = (segments, currentSeg) => {
    const idx = segments.indexOf(currentSeg);
    const start = Math.max(0, idx - 2);
    const end = Math.min(segments.length, idx + 3);
    return segments.slice(start, end).map(s => s.text).join(' ');
  };

  // Remove meeting
  const removeMeeting = (videoId) => {
    if (meetings.find(m => m.videoId === videoId)?.isCurrent) {
      alert('Cannot remove the current meeting');
      return;
    }
    setMeetings(prev => prev.filter(m => m.videoId !== videoId));
    if (activeVideoTab === videoId) {
      setActiveVideoTab(meetings[0]?.videoId || null);
    }
  };

  // Add clip to export selection
  const addClipToExport = (clip) => {
    const exists = selectedClips.find(c => c.meetingId === clip.meetingId && c.start === clip.start);
    if (!exists) {
      setSelectedClips(prev => [...prev, clip]);
    }
  };

  // Export clips
  const [exportJobId, setExportJobId] = useState(null);
  const [exportProgress, setExportProgress] = useState(null);
  const [exportResult, setExportResult] = useState(null);

  const exportClips = async (format) => {
    if (selectedClips.length === 0) {
      alert('Select some clips first');
      return;
    }
    
    setExportLoading(true);
    setExportProgress(null);
    setExportResult(null);
    
    try {
      // Group clips by video ID with all needed info
      const clipsByVideo = {};
      selectedClips.forEach(clip => {
        if (!clipsByVideo[clip.meetingId]) {
          clipsByVideo[clip.meetingId] = [];
        }
        clipsByVideo[clip.meetingId].push({
          start: clip.start,
          end: clip.end,
          highlight: clip.text.substring(0, 150),
          meetingTitle: clip.meetingTitle
        });
      });
      
      // Start the export job
      const response = await fetch('/api/render_multi_video_clips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipsByVideo,
          format: format === 'montage' ? 'montage' : 'zip',
          captions: true
        })
      });
      
      const data = await response.json();
      
      if (data.error) {
        alert(data.error + (data.message ? '\n\n' + data.message : ''));
        setExportLoading(false);
        return;
      }
      
      if (!data.jobId) {
        alert('Failed to start export job');
        setExportLoading(false);
        return;
      }
      
      setExportJobId(data.jobId);
      
      // Poll for job status
      const pollInterval = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/job_status?jobId=${data.jobId}`);
          const status = await statusRes.json();
          
          setExportProgress(status);
          
          if (status.status === 'done') {
            clearInterval(pollInterval);
            setExportLoading(false);
            setExportResult({
              success: true,
              downloadUrl: status.output,
              message: status.message,
              clipCount: status.clipCount
            });
          } else if (status.status === 'error') {
            clearInterval(pollInterval);
            setExportLoading(false);
            setExportResult({
              success: false,
              message: status.message || 'Export failed'
            });
          }
        } catch (err) {
          console.error('Poll error:', err);
        }
      }, 1500);
      
      // Timeout after 10 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
        if (exportLoading) {
          setExportLoading(false);
          setExportResult({
            success: false,
            message: 'Export timed out. The clips may be too large.'
          });
        }
      }, 600000);
      
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to start export: ' + err.message);
      setExportLoading(false);
    }
  };

  // Timeline data sorted by date
  const sortedMeetings = [...meetings].sort((a, b) => new Date(a.date) - new Date(b.date));
  
  // Calculate timeline positions
  const getTimelinePosition = (date) => {
    if (sortedMeetings.length <= 1) return 50;
    const dates = sortedMeetings.map(m => new Date(m.date).getTime());
    const min = Math.min(...dates);
    const max = Math.max(...dates);
    const range = max - min || 1;
    return 10 + ((new Date(date).getTime() - min) / range) * 80;
  };

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1' }}>
      <h3>🔍 Issue Tracker & Meeting Comparison</h3>
      <p className="viz-desc">Find civic meetings, track issues across time, and create cross-meeting highlight reels.</p>

      {/* Tab Navigation */}
      <div style={{ 
        display: 'flex', 
        gap: '2px', 
        marginBottom: '20px', 
        background: '#f1f5f9', 
        padding: '4px', 
        borderRadius: '12px',
        flexWrap: 'wrap'
      }}>
        {[
          { id: 'finder', label: '🔎 Find Meetings', icon: '🔎' },
          { id: 'timeline', label: `📅 Collection (${meetings.length})`, icon: '📅' },
          { id: 'issues', label: '🎯 Track Issues', icon: '🎯' },
          { id: 'videos', label: '🎬 Video Players', icon: '🎬' },
          { id: 'export', label: `📤 Export (${selectedClips.length})`, icon: '📤' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              minWidth: '120px',
              padding: '12px 16px',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '13px',
              background: activeTab === tab.id ? '#1E7F63' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#64748b',
              transition: 'all 0.2s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: Meeting Finder */}
      {activeTab === 'finder' && (
        <div>
          <div style={{ 
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', 
            padding: '20px', 
            borderRadius: '16px',
            marginBottom: '20px',
            border: '2px solid #22c55e'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#166534', marginBottom: '12px' }}>
              Find Civic Meetings on YouTube
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <input
                type="text"
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCivicMeetings()}
                placeholder="Enter city, town, or YouTube channel (e.g., New York City Council, Brookline MA, @NYCCouncil)..."
                style={{
                  flex: 1,
                  padding: '14px 18px',
                  border: '2px solid #22c55e',
                  borderRadius: '10px',
                  fontSize: '15px',
                  background: 'white',
                }}
              />
              <button
                className="btn btn-primary"
                onClick={searchCivicMeetings}
                disabled={finderLoading || !searchCity.trim()}
                style={{ minWidth: '140px', fontSize: '15px' }}
              >
                {finderLoading ? '🔄 Searching...' : '🔍 Search'}
              </button>
            </div>
            
            {recentCities.length > 0 && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '12px', color: '#15803d', alignSelf: 'center' }}>Recent:</span>
                {recentCities.map((city, idx) => (
                  <button
                    key={idx}
                    onClick={() => setSearchCity(city)}
                    style={{
                      padding: '4px 12px',
                      background: 'white',
                      border: '1px solid #22c55e',
                      borderRadius: '20px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      color: '#166534',
                    }}
                  >
                    {city}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Finder Results */}
          {finderResults.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '12px', color: '#374151' }}>
                Found {finderResults.length} meetings - click to add:
              </div>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', 
                gap: '12px',
                maxHeight: '500px',
                overflow: 'auto',
                padding: '4px'
              }}>
                {finderResults.map((video, idx) => {
                  const videoId = video.id?.videoId;
                  const isAdded = meetings.find(m => m.videoId === videoId);
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '14px',
                        background: isAdded ? '#dcfce7' : '#f8fafc',
                        borderRadius: '12px',
                        border: isAdded ? '2px solid #22c55e' : '2px solid #e2e8f0',
                        display: 'flex',
                        gap: '12px',
                      }}
                    >
                      {video.snippet?.thumbnails?.default?.url && (
                        <img
                          src={video.snippet.thumbnails.medium?.url || video.snippet.thumbnails.default.url}
                          alt=""
                          style={{ width: '120px', height: '90px', borderRadius: '8px', objectFit: 'cover' }}
                        />
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ 
                          fontWeight: 600, 
                          fontSize: '14px', 
                          lineHeight: 1.3, 
                          marginBottom: '6px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                        }}>
                          {video.snippet?.title}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>
                          {video.snippet?.channelTitle} • {new Date(video.snippet?.publishedAt).toLocaleDateString()}
                        </div>
                        {isAdded ? (
                          <div style={{ 
                            padding: '6px 12px', 
                            background: '#166534', 
                            color: 'white',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            display: 'inline-block'
                          }}>
                            ✔ In Collection
                          </div>
                        ) : (
                          <button
                            onClick={() => addMeeting(videoId, video.snippet?.title, video.snippet?.publishedAt)}
                            disabled={loading}
                            style={{
                              padding: '8px 16px',
                              background: '#1E7F63',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            {loading ? '⏳ Adding...' : '➕ Add to Collection'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {finderResults.length === 0 && !finderLoading && (
            <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '16px' }}>
              <div style={{ color: '#64748b', fontSize: '15px' }}>
                Search for a city to find their public meeting recordings
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Meeting Collection Timeline */}
      {activeTab === 'timeline' && (
        <div>
          {meetings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📅</div>
              <div style={{ color: '#64748b' }}>No meetings in your collection yet. Use the "Find Meetings" tab to add some!</div>
            </div>
          ) : (
            <>
              {/* Visual Timeline */}
              <div style={{ 
                background: 'linear-gradient(180deg, #f8fafc 0%, #f0fdf4 100%)',
                borderRadius: '16px',
                padding: '24px',
                marginBottom: '20px',
                border: '2px solid #e2e8f0',
                position: 'relative',
                minHeight: '180px'
              }}>
                <div style={{ fontWeight: 700, color: '#166534', marginBottom: '20px' }}>
                  📆 Meeting Timeline ({meetings.length} meetings)
                </div>
                
                {/* Timeline track */}
                <div style={{ 
                  position: 'relative', 
                  height: '100px',
                  marginBottom: '20px'
                }}>
                  {/* Horizontal line */}
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '5%',
                    right: '5%',
                    height: '4px',
                    background: 'linear-gradient(90deg, #22c55e, #1E7F63)',
                    borderRadius: '2px',
                    transform: 'translateY(-50%)'
                  }} />
                  
                  {/* Meeting points */}
                  {sortedMeetings.map((meeting, idx) => {
                    const position = getTimelinePosition(meeting.date);
                    const hasIssue = trackedIssues.some(issue => 
                      meeting.transcript?.toLowerCase().includes(issue.toLowerCase())
                    );
                    return (
                      <div
                        key={meeting.videoId}
                        onClick={() => {
                          setActiveVideoTab(meeting.videoId);
                          setActiveTab('videos');
                        }}
                        style={{
                          position: 'absolute',
                          left: `${position}%`,
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          cursor: 'pointer',
                          zIndex: 10,
                        }}
                      >
                        <div style={{
                          width: meeting.isCurrent ? '28px' : '22px',
                          height: meeting.isCurrent ? '28px' : '22px',
                          borderRadius: '50%',
                          background: meeting.isCurrent ? '#1E7F63' : hasIssue ? '#f59e0b' : '#22c55e',
                          border: `3px solid white`,
                          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {meeting.isCurrent && <span style={{ color: 'white', fontSize: '10px' }}>â˜…</span>}
                        </div>
                        {/* Date label */}
                        <div style={{
                          position: 'absolute',
                          top: idx % 2 === 0 ? '-35px' : '35px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          whiteSpace: 'nowrap',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: '#64748b',
                          background: 'white',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                        }}>
                          {new Date(meeting.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </div>
                        {/* Title on hover */}
                        <div style={{
                          position: 'absolute',
                          top: idx % 2 === 0 ? '35px' : '-55px',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          maxWidth: '150px',
                          fontSize: '11px',
                          color: '#374151',
                          textAlign: 'center',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {meeting.title.substring(0, 30)}...
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Legend */}
                <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', fontSize: '11px', color: '#64748b' }}>
                  <span>🟢 Meeting</span>
                  <span>⭐ Current</span>
                  <span>🟡 Has tracked issue</span>
                </div>
              </div>

              {/* Meeting List */}
              <div style={{ display: 'grid', gap: '10px' }}>
                {sortedMeetings.map((meeting) => (
                  <div
                    key={meeting.videoId}
                    style={{
                      padding: '16px',
                      background: meeting.isCurrent ? 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)' : '#f8fafc',
                      borderRadius: '12px',
                      border: meeting.isCurrent ? '2px solid #22c55e' : '2px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        {meeting.isCurrent && (
                          <span style={{ 
                            background: '#166534', 
                            color: 'white', 
                            padding: '2px 8px', 
                            borderRadius: '10px', 
                            fontSize: '10px', 
                            fontWeight: 700 
                          }}>CURRENT</span>
                        )}
                        <span style={{ fontWeight: 600, color: '#374151' }}>{meeting.title}</span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>
                        {new Date(meeting.date).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        {' • '}{meeting.entities?.length || 0} keywords detected
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => { setActiveVideoTab(meeting.videoId); setActiveTab('videos'); }}
                        style={{
                          padding: '8px 12px',
                          background: '#1E7F63',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        🎬 Watch
                      </button>
                      {!meeting.isCurrent && (
                        <button
                          onClick={() => removeMeeting(meeting.videoId)}
                          style={{
                            padding: '8px 12px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px',
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 3: Issue Tracking */}
      {activeTab === 'issues' && (
        <div>
          <div style={{ 
            background: '#fef3c7', 
            padding: '20px', 
            borderRadius: '16px',
            marginBottom: '20px',
            border: '2px solid #f59e0b'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#92400e', marginBottom: '12px' }}>
              🎯 Track an Issue Across Meetings
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                value={issueSearch}
                onChange={(e) => setIssueSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchIssues()}
                placeholder="Enter a keyword or phrase to track (e.g., 'budget', 'zoning', 'park')..."
                style={{
                  flex: 1,
                  padding: '14px 18px',
                  border: '2px solid #f59e0b',
                  borderRadius: '10px',
                  fontSize: '15px',
                }}
              />
              <button
                className="btn"
                onClick={searchIssues}
                disabled={!issueSearch.trim() || meetings.length === 0}
                style={{ 
                  minWidth: '140px', 
                  background: '#f59e0b', 
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 600,
                  cursor: meetings.length === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                🔍 Find Mentions
              </button>
            </div>
            <div style={{ fontSize: '12px', color: '#92400e', marginTop: '8px' }}>
              Searching across {meetings.length} meeting{meetings.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Tracked Issues */}
          {trackedIssues.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontWeight: 600, marginBottom: '8px', color: '#374151' }}>Tracked Issues:</div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {trackedIssues.map((issue, idx) => (
                  <button
                    key={idx}
                    onClick={() => { setIssueSearch(issue); searchIssues(); }}
                    style={{
                      padding: '6px 14px',
                      background: issueSearch === issue ? '#fef3c7' : '#f8fafc',
                      border: issueSearch === issue ? '2px solid #f59e0b' : '2px solid #e2e8f0',
                      borderRadius: '20px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#374151',
                    }}
                  >
                    🎯 {issue}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Issue Results */}
          {issueResults.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '12px', color: '#374151' }}>
                Found {issueResults.length} mentions of "{issueSearch}":
              </div>
              <div style={{ maxHeight: '500px', overflow: 'auto' }}>
                {issueResults.map((result, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '16px',
                      background: '#f8fafc',
                      borderRadius: '12px',
                      marginBottom: '10px',
                      border: '2px solid #e2e8f0',
                      borderLeft: '4px solid #f59e0b',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#374151' }}>
                          {result.meetingTitle}
                        </div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>
                          {new Date(result.meetingDate).toLocaleDateString()}
                          {result.start !== null && ` • ${formatTime(result.start)}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {result.start !== null && (
                          <button
                            onClick={() => {
                              setActiveVideoTab(result.meetingId);
                              setActiveTab('videos');
                              // TODO: Seek to timestamp
                            }}
                            style={{
                              padding: '6px 10px',
                              background: '#1E7F63',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11px',
                            }}
                          >
                            ▶ Jump to
                          </button>
                        )}
                        <button
                          onClick={() => addClipToExport({
                            meetingId: result.meetingId,
                            meetingTitle: result.meetingTitle,
                            text: result.text,
                            start: result.start || 0,
                            end: (result.end || result.start || 0) + 30
                          })}
                          style={{
                            padding: '6px 10px',
                            background: '#f59e0b',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '11px',
                          }}
                        >
                          + Export
                        </button>
                      </div>
                    </div>
                    <div style={{ 
                      fontSize: '14px', 
                      color: '#374151',
                      background: 'white',
                      padding: '12px',
                      borderRadius: '8px',
                      lineHeight: 1.5,
                    }}>
                      {result.text.split(new RegExp(`(${issueSearch})`, 'gi')).map((part, i) => 
                        part.toLowerCase() === issueSearch.toLowerCase() ? 
                          <mark key={i} style={{ background: '#fef3c7', padding: '0 2px' }}>{part}</mark> : 
                          part
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {issueResults.length === 0 && issueSearch && (
            <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔍</div>
              <div style={{ color: '#64748b' }}>No mentions found for "{issueSearch}"</div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: Video Players */}
      {activeTab === 'videos' && (
        <div>
          {meetings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎬</div>
              <div style={{ color: '#64748b' }}>No meetings to display. Add some from the "Find Meetings" tab!</div>
            </div>
          ) : (
            <>
              {/* Video tabs */}
              <div style={{ 
                display: 'flex', 
                gap: '4px', 
                marginBottom: '16px', 
                flexWrap: 'wrap',
                background: '#f1f5f9',
                padding: '4px',
                borderRadius: '10px'
              }}>
                {meetings.map((meeting) => (
                  <button
                    key={meeting.videoId}
                    onClick={() => setActiveVideoTab(meeting.videoId)}
                    style={{
                      padding: '10px 16px',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '12px',
                      background: activeVideoTab === meeting.videoId ? '#1E7F63' : 'transparent',
                      color: activeVideoTab === meeting.videoId ? 'white' : '#64748b',
                      maxWidth: '200px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {meeting.isCurrent && '⭐ '}{meeting.title.substring(0, 25)}...
                  </button>
                ))}
              </div>

              {/* Active video player */}
              {activeVideoTab && (
                <div>
                  <div style={{ 
                    position: 'relative',
                    paddingBottom: '56.25%',
                    height: 0,
                    borderRadius: '12px',
                    overflow: 'hidden',
                    background: '#000',
                    marginBottom: '16px'
                  }}>
                    <iframe
                      src={`https://www.youtube.com/embed/${activeVideoTab}?enablejsapi=1`}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        border: 'none',
                      }}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  
                  {/* Current video info */}
                  {(() => {
                    const currentMeeting = meetings.find(m => m.videoId === activeVideoTab);
                    if (!currentMeeting) return null;
                    return (
                      <div style={{ 
                        background: '#f8fafc', 
                        padding: '16px', 
                        borderRadius: '12px',
                        border: '2px solid #e2e8f0'
                      }}>
                        <div style={{ fontWeight: 700, marginBottom: '8px', color: '#374151' }}>
                          {currentMeeting.title}
                        </div>
                        <div style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
                          {new Date(currentMeeting.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                        {currentMeeting.entities && currentMeeting.entities.length > 0 && (
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#64748b' }}>
                              Top Keywords:
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {currentMeeting.entities.slice(0, 15).map((entity, idx) => (
                                <span 
                                  key={idx}
                                  onClick={() => { setIssueSearch(entity.text); setActiveTab('issues'); searchIssues(); }}
                                  style={{
                                    padding: '4px 10px',
                                    background: '#dcfce7',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    color: '#166534',
                                    cursor: 'pointer',
                                  }}
                                >
                                  {entity.text}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 5: Export Clips */}
      {activeTab === 'export' && (
        <div>
          <div style={{ 
            background: 'linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)',
            padding: '20px',
            borderRadius: '16px',
            marginBottom: '20px',
            border: '2px solid #3b82f6'
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#1e40af', marginBottom: '12px' }}>
              📤 Export Selected Clips
            </div>
            <div style={{ fontSize: '14px', color: '#1e40af', marginBottom: '16px' }}>
              You have {selectedClips.length} clip{selectedClips.length !== 1 ? 's' : ''} ready to export
            </div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={() => exportClips('zip')}
                disabled={selectedClips.length === 0 || exportLoading}
                style={{
                  padding: '12px 24px',
                  background: selectedClips.length > 0 ? '#3b82f6' : '#94a3b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: selectedClips.length > 0 ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                📁 Download as ZIP
              </button>
              <button
                onClick={() => exportClips('montage')}
                disabled={selectedClips.length === 0 || exportLoading}
                style={{
                  padding: '12px 24px',
                  background: selectedClips.length > 0 ? '#8b5cf6' : '#94a3b8',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: selectedClips.length > 0 ? 'pointer' : 'not-allowed',
                  fontWeight: 600,
                  fontSize: '14px',
                }}
              >
                🎬 Create Montage
              </button>
              {selectedClips.length > 0 && (
                <button
                  onClick={() => setSelectedClips([])}
                  style={{
                    padding: '12px 24px',
                    background: '#fee2e2',
                    color: '#dc2626',
                    border: 'none',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px',
                  }}
                >
                  🗑️ Clear All
                </button>
              )}
            </div>
          </div>

          {/* Export Progress */}
          {exportLoading && exportProgress && (
            <div style={{ 
              background: '#f0fdf4', 
              padding: '20px', 
              borderRadius: '12px', 
              marginBottom: '20px',
              border: '2px solid #22c55e'
            }}>
              <div style={{ fontWeight: 600, color: '#166534', marginBottom: '12px' }}>
                🔄 Exporting...
              </div>
              <div style={{ 
                background: '#e2e8f0', 
                borderRadius: '10px', 
                height: '12px', 
                overflow: 'hidden',
                marginBottom: '8px'
              }}>
                <div style={{ 
                  background: 'linear-gradient(90deg, #22c55e, #16a34a)', 
                  height: '100%', 
                  width: `${exportProgress.percent || 0}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                {exportProgress.message || 'Processing...'}
              </div>
            </div>
          )}

          {/* Export Result - Success */}
          {exportResult && exportResult.success && (
            <div style={{ 
              background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', 
              padding: '20px', 
              borderRadius: '12px', 
              marginBottom: '20px',
              border: '2px solid #22c55e'
            }}>
              <div style={{ fontWeight: 700, color: '#166534', marginBottom: '8px', fontSize: '16px' }}>
                âœ… Export Complete!
              </div>
              <div style={{ fontSize: '14px', color: '#15803d', marginBottom: '16px' }}>
                {exportResult.message}
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <a
                  href={exportResult.downloadUrl}
                  download
                  style={{
                    padding: '12px 24px',
                    background: '#166534',
                    color: 'white',
                    borderRadius: '10px',
                    textDecoration: 'none',
                    fontWeight: 600,
                    fontSize: '14px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  â¬‡️ Download File
                </a>
                <button
                  onClick={() => { setExportResult(null); setSelectedClips([]); }}
                  style={{
                    padding: '12px 24px',
                    background: 'white',
                    color: '#166534',
                    border: '2px solid #22c55e',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: '14px',
                  }}
                >
                  ✔ Done - Clear Clips
                </button>
              </div>
            </div>
          )}

          {/* Export Result - Error */}
          {exportResult && !exportResult.success && (
            <div style={{ 
              background: '#fef2f2', 
              padding: '20px', 
              borderRadius: '12px', 
              marginBottom: '20px',
              border: '2px solid #fecaca'
            }}>
              <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: '8px' }}>
                âŒ Export Failed
              </div>
              <div style={{ fontSize: '14px', color: '#b91c1c', marginBottom: '12px' }}>
                {exportResult.message}
              </div>
              <button
                onClick={() => setExportResult(null)}
                style={{
                  padding: '8px 16px',
                  background: '#dc2626',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '13px',
                }}
              >
                Try Again
              </button>
            </div>
          )}

          {/* Selected clips list */}
          {selectedClips.length > 0 ? (
            <div>
              <div style={{ fontWeight: 600, marginBottom: '12px', color: '#374151' }}>
                Selected Clips ({selectedClips.length}):
              </div>
              <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                {selectedClips.map((clip, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '14px',
                      background: '#f8fafc',
                      borderRadius: '10px',
                      marginBottom: '8px',
                      border: '2px solid #e2e8f0',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                        {clip.meetingTitle}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                        {formatTime(clip.start)} - {formatTime(clip.end)} ({Math.round(clip.end - clip.start)}s)
                      </div>
                      <div style={{ fontSize: '12px', color: '#374151' }}>
                        "{clip.text.substring(0, 80)}..."
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedClips(prev => prev.filter((_, i) => i !== idx))}
                      disabled={exportLoading}
                      style={{
                        padding: '6px 10px',
                        background: exportLoading ? '#e2e8f0' : '#fee2e2',
                        color: exportLoading ? '#94a3b8' : '#dc2626',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: exportLoading ? 'not-allowed' : 'pointer',
                        fontSize: '12px',
                        marginLeft: '12px',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              
              {/* Estimated info */}
              <div style={{ 
                marginTop: '12px', 
                padding: '12px', 
                background: '#f1f5f9', 
                borderRadius: '8px',
                fontSize: '12px',
                color: '#64748b'
              }}>
                <strong>Estimated:</strong> {selectedClips.length} clips, ~{Math.round(selectedClips.reduce((sum, c) => sum + (c.end - c.start), 0))} seconds total
                {selectedClips.length > 0 && (
                  <span> from {new Set(selectedClips.map(c => c.meetingId)).size} video{new Set(selectedClips.map(c => c.meetingId)).size > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', background: '#f8fafc', borderRadius: '16px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📤</div>
              <div style={{ color: '#64748b', marginBottom: '8px' }}>No clips selected for export</div>
              <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                Use the "Track Issues" tab to find mentions and add them to your export list
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
// ============================================================================
// END v6.0 NEW FEATURE COMPONENTS
// ============================================================================

// NEW: Meeting Efficiency Dashboard
function MeetingEfficiencyDashboard({ fullText, cues }) {
  const [efficiency, setEfficiency] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!fullText || !cues || cues.length === 0) return;

    const duration = cues[cues.length - 1]?.end || 0;

    setIsLoading(true);

    fetch('/api/analytics/meeting_efficiency', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: fullText, duration: duration })
    })
      .then(res => res.json())
      .then(data => {
        setEfficiency(data);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Efficiency error:', err);
        setIsLoading(false);
      });
  }, [fullText, cues]);

  const getGaugeColor = (score) => {
    if (score >= 70) return '#10b981';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  const exportEfficiencyImage = () => {
    alert('Efficiency export: Use browser screenshot to capture the dashboard.');
  };

  return (
    <div className="viz-card meeting-efficiency-dashboard">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Meeting Efficiency Dashboard</h3>
          <p className="viz-desc">
            Analyzes how effectively meeting time was used. Higher scores = more productive meeting.
          </p>
        </div>
        {efficiency && (
          <button className="btn btn-ghost btn-export" onClick={exportEfficiencyImage}>
            📚 Export
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="entities-loader-container">
          <div className="spinner" />
          <span>Calculating efficiency metrics...</span>
        </div>
      ) : efficiency ? (
        <>
          {/* Main Efficiency Score Gauge */}
          <div className="efficiency-gauge-main">
            <div className="gauge-container">
              <svg viewBox="0 0 200 120" className="gauge-svg">
                {/* Background arc */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth="20"
                />
                {/* Filled arc based on score */}
                <path
                  d="M 20 100 A 80 80 0 0 1 180 100"
                  fill="none"
                  stroke={getGaugeColor(efficiency.efficiency_score)}
                  strokeWidth="20"
                  strokeDasharray={`${(efficiency.efficiency_score / 100) * 251.2} 251.2`}
                  style={{ transition: 'stroke-dasharray 1s ease' }}
                />
              </svg>
              <div className="gauge-score">
                {efficiency.efficiency_score}
                <span className="gauge-label">Efficiency Score</span>
              </div>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="efficiency-metrics-grid">
            <div className="efficiency-metric">
              <div className="metric-value">{efficiency.decisions_per_hour}</div>
              <div className="metric-label">Decisions/Hour</div>
              <div className="metric-subtext">{efficiency.total_decisions} total</div>
            </div>

            <div className="efficiency-metric">
              <div className="metric-value">{efficiency.substantive_time_percent}%</div>
              <div className="metric-label">Substantive Time</div>
              <div className="progress-bar-mini">
                <div
                  className="progress-fill-mini"
                  style={{
                    width: `${efficiency.substantive_time_percent}%`,
                    backgroundColor: '#10b981'
                  }}
                ></div>
              </div>
            </div>

            <div className="efficiency-metric">
              <div className="metric-value">{efficiency.procedural_time_percent}%</div>
              <div className="metric-label">Procedural Time</div>
              <div className="progress-bar-mini">
                <div
                  className="progress-fill-mini"
                  style={{
                    width: `${efficiency.procedural_time_percent}%`,
                    backgroundColor: '#94a3b8'
                  }}
                ></div>
              </div>
            </div>

            <div className="efficiency-metric">
              <div className="metric-value">{efficiency.off_topic_count}</div>
              <div className="metric-label">Off-Topic Diversions</div>
              <div className="metric-subtext">
                {efficiency.off_topic_count === 0 ? 'Stayed focused!' : 'Could improve focus'}
              </div>
            </div>
          </div>

          {/* Interpretation */}
          <div className="efficiency-interpretation">
            <strong>Interpretation:</strong>{' '}
            {efficiency.efficiency_score >= 70
              ? 'This was a highly efficient meeting with good decision-making pace and focus.'
              : efficiency.efficiency_score >= 40
                ? 'This meeting had moderate efficiency. Some time spent on procedural matters.'
                : 'This meeting could benefit from better time management and focus.'}
          </div>
        </>
      ) : (
        <div className="no-decisions">Unable to calculate efficiency metrics</div>
      )}
    </div>
  );
}

function ExportModal({ onSelect, onClose, clipCount }) {
  return (
    <div className="export-modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Export options">
      <div className="export-modal" onClick={e => e.stopPropagation()}>
        <div className="export-modal-header">
          <h2>Choose Export Format</h2>
          <button className="btn-close" onClick={onClose}>X</button>
        </div>

        <div className="export-options">
          <div className="export-option" onClick={() => onSelect('combined')}>
            <div className="export-title">Highlight Reel</div>
            <div className="export-desc">
              Single MP4 with smooth transitions between {clipCount} clips
            </div>
            <div className="export-badge">Most Popular</div>
          </div>

          <div className="export-option" onClick={() => onSelect('titled')}>
            <div className="export-title">Professional Version</div>
            <div className="export-desc">
              Highlight reel with title cards and chapter markers
            </div>
            <div className="export-badge">Best for Presentations</div>
          </div>

          <div className="export-option" onClick={() => onSelect('social')}>
            <div className="export-title">Social Media Reel</div>
            <div className="export-desc">
              60-second vertical video (9:16) for TikTok/Instagram
            </div>
            <div className="export-badge">Ready to Share</div>
          </div>

          <div className="export-option" onClick={() => onSelect('individual')}>
            <div className="export-title">Individual Clips</div>
            <div className="export-desc">
              Download each of the {clipCount} clips as separate MP4 files
            </div>
            <div className="export-badge">ZIP Archive</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// OnboardingWizard replaced by GuidedTour (see line ~680)

function SharePanel({ videoId, videoTitle }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = videoId ? `${window.location.origin}?v=${videoId}` : window.location.href;
  const shareText = videoTitle ? `Check out this meeting analysis: ${videoTitle}` : 'Check out this civic meeting analysis';

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: videoTitle || 'Community Highlighter', text: shareText, url: shareUrl });
      } catch (e) { /* user cancelled */ }
    }
  };

  return (
    <div className="share-panel">
      {navigator.share && (
        <button className="share-btn" onClick={handleNativeShare}>Share</button>
      )}
      <button className="share-btn share-btn-copy" onClick={() => {
        navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}>{copied ? 'Copied!' : 'Copy Link'}</button>
      <a className="share-btn share-btn-twitter" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">Twitter</a>
      <a className="share-btn share-btn-facebook" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noopener noreferrer">Facebook</a>
      <a className="share-btn share-btn-email" href={`mailto:?subject=${encodeURIComponent(videoTitle || 'Meeting Highlights')}&body=${encodeURIComponent(shareText + '\n' + shareUrl)}`}>Email</a>
    </div>
  );
}

const TEMPLATE_PRESETS = [
  { id: 'quick', icon: '\u26A1', title: 'Quick Share', desc: '720p / 60s / Social-ready', resolution: '720p', maxDuration: 60, format: 'social' },
  { id: 'brief', icon: '\uD83D\uDCCB', title: 'Meeting Brief', desc: '1080p / 5min / Full highlights', resolution: '1080p', maxDuration: 300, format: 'combined' },
  { id: 'news', icon: '\uD83C\uDFA4', title: 'News Clip', desc: '720p / 90s / Titled', resolution: '720p', maxDuration: 90, format: 'titled' },
];

function TemplatePresets({ onSelect }) {
  return (
    <div className="template-presets">
      {TEMPLATE_PRESETS.map(t => (
        <div key={t.id} className="template-card" onClick={() => onSelect(t)}>
          <div className="template-card-icon">{t.icon}</div>
          <div className="template-card-title">{t.title}</div>
          <div className="template-card-desc">{t.desc}</div>
        </div>
      ))}
    </div>
  );
}

function CelebrationModal({ fileUrl, onClose, onDownload }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="celebration-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label="Video render complete">
      {/* Confetti pieces */}
      {Array.from({ length: 24 }).map((_, i) => (
        <div key={i} className="confetti-piece" style={{
          left: `${4 + Math.random() * 92}%`,
          animationDelay: `${Math.random() * 2}s`,
          animationDuration: `${2.5 + Math.random() * 2}s`,
          backgroundColor: ['#1E7F63', '#0EA5E9', '#F59E0B', '#EC4899', '#8B5CF6', '#22C55E'][i % 6],
          width: `${8 + Math.random() * 8}px`,
          height: `${8 + Math.random() * 8}px`,
          transform: `rotate(${Math.random() * 360}deg)`,
        }} />
      ))}
      <div className="celebration-modal" onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>&#127881;</div>
        <h2 style={{ margin: '0 0 8px', fontSize: '24px', color: '#1a1a1a' }}>Your Video is Ready!</h2>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: '14px' }}>Your highlight reel has been rendered successfully.</p>
        <a href={fileUrl} download className="celebration-download-btn" onClick={() => {
          if (onDownload) onDownload(fileUrl.split('/').pop() || 'highlight_reel.mp4', fileUrl, 'reel');
        }}>
          Download Video
        </a>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button className="celebration-secondary-btn" onClick={(e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(window.location.origin + fileUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
          <button className="celebration-secondary-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function ProgressIndicator({ status, percent, message, estimatedTime, isVideoDownload, logs, estimatedSeconds }) {
  const [dots, setDots] = useState('');
  
  // Animated dots to show activity
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(d => d.length >= 3 ? '' : d + '.');
    }, 500);
    return () => clearInterval(interval);
  }, []);
  
  return (
    <div className="progress-indicator animate-slideIn" style={{
      background: 'linear-gradient(135deg, #1E7F63 0%, #166b52 100%)',
      color: 'white',
      padding: '20px',
      borderRadius: '12px',
      marginBottom: '20px',
      boxShadow: '0 4px 15px rgba(30, 127, 99, 0.3)'
    }}>
      <div className="progress-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        {/* Spinning animation */}
        <div style={{
          width: '24px',
          height: '24px',
          border: '3px solid rgba(255,255,255,0.3)',
          borderTopColor: 'white',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite'
        }} />
        <span style={{ fontWeight: 600, fontSize: '16px' }}>{message}{dots}</span>
      </div>
      
      {percent !== undefined && (
        <div className="progress-bar" style={{
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '8px',
          height: '12px',
          overflow: 'hidden',
          marginBottom: '12px'
        }}>
          <div className="progress-fill" style={{
            width: `${percent}%`,
            height: '100%',
            background: 'rgba(255,255,255,0.9)',
            borderRadius: '8px',
            transition: 'width 0.5s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {percent > 10 && <span style={{ fontSize: '10px', fontWeight: 600, color: '#1E7F63' }}>{Math.round(percent)}%</span>}
          </div>
        </div>
      )}
      
      {/* Only show detailed message for video downloads */}
      {isVideoDownload && (
        <div style={{ fontSize: '13px', opacity: 0.9, lineHeight: 1.5 }}>
          {estimatedTime && (
            <div style={{ marginBottom: '6px' }}>
              ⏱️ Estimated time: ~{estimatedTime} minutes
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>💡</span>
            <span>This could take a while - up to 10min for hours-long videos. Feel free to visit other sites while you wait, but keep this tab open. Your download will be available under the video.</span>
          </div>
        </div>
      )}
      
      {/* Estimated time for render jobs */}
      {estimatedSeconds && estimatedSeconds > 0 && (
        <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: 8 }}>
          Estimated time: ~{estimatedSeconds < 60 ? `${estimatedSeconds}s` : `${Math.ceil(estimatedSeconds / 60)} min`}
        </div>
      )}

      {/* Terminal output — shows actual processing logs */}
      {logs && logs.length > 0 && (
        <div style={{
          background: '#0a0e14', borderRadius: 8, padding: '10px 12px', marginTop: 8,
          maxHeight: 140, overflowY: 'auto', fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, monospace',
          fontSize: 11, lineHeight: 1.6, color: '#8b949e', border: '1px solid rgba(255,255,255,0.1)',
          scrollBehavior: 'smooth'
        }} ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
          {logs.slice(-20).map((line, i) => (
            <div key={i} style={{
              color: line.includes('ERROR') ? '#f85149' : line.includes('done') ? '#4ade80' : line.includes('[yt-dlp]') ? '#58a6ff' : '#8b949e',
              whiteSpace: 'pre-wrap', wordBreak: 'break-all'
            }}>{line}</div>
          ))}
        </div>
      )}

      {/* CSS for spin animation */}
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function LoadingCard({ title, message, percent, bytesLoaded, bytesTotal, startTime }) {
  // Calculate time estimate
  const getTimeEstimate = () => {
    if (!bytesLoaded || !bytesTotal || !startTime) return null;
    const elapsed = (Date.now() - startTime) / 1000; // seconds
    const rate = bytesLoaded / elapsed; // bytes per second
    const remaining = bytesTotal - bytesLoaded;
    const estimate = Math.ceil(remaining / rate);

    if (estimate < 60) return `${estimate}s remaining`;
    const minutes = Math.floor(estimate / 60);
    const seconds = estimate % 60;
    return `${minutes}m ${seconds}s remaining`;
  };

  const formatBytes = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const timeEstimate = getTimeEstimate();

  return (
    <div className="loading-card card animate-slideUp">
      <div className="loading-header">
        <div className="spinner" />
        <span>{title}</span>
      </div>
      {message && <div className="loading-body">{message}</div>}
      {bytesLoaded && bytesTotal && (
        <div className="loading-body" style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
          {formatBytes(bytesLoaded)} / {formatBytes(bytesTotal)}
          {timeEstimate && <span style={{ marginLeft: '8px' }}>⚡ {timeEstimate}</span>}
        </div>
      )}
      {(percent !== undefined && percent !== null) && (
        <div className="loading-progress">
          <div className="progress"><span style={{ width: `${Math.max(0, Math.min(100, percent))}%` }} /></div>
        </div>
      )}
    </div>
  );
}

const translations = {
  en: {
    appSubtitle: "Turn long public meetings into useful moments in minutes. A free, open source app made by folks in community media.",
    appDescription: null, // Replaced by AnimatedTagline component
    siteLanguage: "Site language:",
    step1: "Paste a YouTube link to analyze a meeting.",
    step2: "Search the video for anything! Or click on a word below to see all of its mentions.",
    step3: "Click a result to see context, view in video, and save it as a clip.",
    step4: "Add clips to your basket by clicking or highlighting and then download them all!",
    loadVideo: "Load Video",
    padding: "Padding",
    search: "Search transcript...",
    saveSel: "Save selection as clip",
    back: "Back to search",
    aiSummary: "AI-Powered Summary",
    regenerate: "Regenerate",
    keyHighlights: "Key Highlights with Quotes",
    wordCloud: "Word Cloud",
    savedClips: "Clip Basket",
    exportClips: "Export Clips",
    clearBasket: "Clear Basket",
    videoPlayer: "Video Player",
    createReel: "Create Your Own Highlight Reel!",
    buildReel: "Build AI highlight reel",
    downloadVideo: "Download video (.mp4)",
    translateButton: "Translate Transcript",
    translateTo: "Translate to:",
    viewTranslation: "View Translation",
    downloadTranslation: "Download Translation",
    showMetadata: "Show metadata",
    summarizeAI: "Generate AI Highlights with Quotes",
    processing: "Processing",
    ready: "Ready",
    error: "Error",
    noMatches: "No matches found for",
    selectModel: "AI Model:",
    expandClip: "Transcript Context",
    saveClip: "Save to Basket",
    preview: "Video Context",
    poweredBy: "Powered by",
    footer1: "A Civic AI Project by",
    footer2: "developed by",
    chooseFormat: "Choose Export Format",
    downloadFile: "Download File"
  }
};

const civicStopwords = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "your", "about",
  "have", "will", "they", "them", "were", "has", "had", "not", "but", "are",
  "our", "you", "its", "it's", "we're", "there", "here", "been", "was", "his",
  "her", "she", "him", "us", "out", "over", "under", "before", "after", "during",
  "while", "shall", "may", "might", "can", "could", "would", "should", "than",
  "then", "when", "where", "which", "who", "whom", "whose", "how", "why", "because",
  "very", "really", "just", "also", "well", "back", "now", "new", "way", "even",
  "still", "being", "going", "making", "getting", "think", "know", "want", "like",
  "need", "see", "make", "get", "come", "go", "say", "said", "take", "took",
  "i'm", "yeah", "ok", "okay", "that's", "it's", "we'll", "you're", "he's", "she's"
]);

function FeedbackForm() {
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    const subject = encodeURIComponent('Community Highlighter Feature Request');
    const body = encodeURIComponent(`
Feature Request/Feedback:
${feedback}

From: ${email || 'Anonymous'}

Sent via Community Highlighter
    `);

    window.open(`mailto:stephen@weirdmachine.org?subject=${subject}&body=${body}`);

    setSubmitted(true);
    setTimeout(() => {
      setShowForm(false);
      setSubmitted(false);
      setFeedback('');
      setEmail('');
    }, 3000);
  };

  return (
    <div className="feedback-section">
      {!showForm && (
        <button
          className="btn-feedback-trigger"
          onClick={() => setShowForm(true)}
        >
          Suggest a Feature
        </button>
      )}

      {showForm && (
        <div className="feedback-form-container card">
          <div className="feedback-header">
            <h3>Feature Request</h3>
            <button className="btn-close-popup" onClick={() => setShowForm(false)}>X</button>
          </div>

          {!submitted ? (
            <>
              <p className="feedback-intro">
                Have an idea to improve Community Highlighter? We'd love to hear it!
              </p>

              <textarea
                className="feedback-textarea"
                placeholder="Describe your feature request or feedback..."
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                rows={5}
              />

              <input
                type="email"
                className="feedback-email input"
                placeholder="Your email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />

              <div className="feedback-actions">
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={!feedback.trim()}
                >
                  Send to stephen@weirdmachine.org
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>

              <p className="feedback-note">
                Your feedback will be sent via email to our development team.
              </p>
            </>
          ) : (
            <div className="feedback-success">
              <p>Thank you for your feedback!</p>
              <p className="success-sub">Your email client should open with your message.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ✨ NEW v4.0 COMPONENTS: Enhanced Features
// ============================================================================

// New Component: Clip Preview Tooltip
function ClipPreview({ clip, videoId }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const padTime = (x) => {
    const h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = Math.floor(x % 60);
    if (h > 0) {
      return `${String(h)}h ${String(m).padStart(2, "0")}m`;
    }
    if (m > 0) {
      return `${String(m)}m ${String(s).padStart(2, "0")}s`;
    }
    return `${String(s)}s`;
  };

  const loadPreview = async () => {
    if (preview || loading) return;

    setLoading(true);
    try {
      const data = await apiClipPreview({
        videoId,
        startTime: clip.start,
        endTime: clip.end
      });
      setPreview(data);
    } catch (error) {
      console.error("Preview error:", error);
    } finally {
      setLoading(false);
    }
  };

  // Generate thumbnail URL from YouTube
  const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
  const clipDuration = clip.end - clip.start;

  return (
    <div
      className="clip-preview-wrapper"
      onMouseEnter={() => {
        loadPreview();
        setShowPreview(true);
      }}
      onMouseLeave={() => setShowPreview(false)}
    >
      <div className="basket-item" style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
        {/* Thumbnail */}
        {thumbnailUrl && (
          <div style={{ flexShrink: 0, width: '80px', height: '45px', borderRadius: '4px', overflow: 'hidden', background: '#e2e8f0', position: 'relative' }}>
            <img 
              src={thumbnailUrl} 
              alt="Clip thumbnail" 
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.75)', color: 'white', fontSize: '9px', padding: '2px 4px', borderRadius: '2px', fontWeight: '600' }}>
              {padTime(clipDuration)}
            </div>
          </div>
        )}
        
        {/* Clip info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="time" style={{ fontWeight: '600', color: '#1E7F63', marginBottom: '4px', fontSize: '13px' }}>
            {padTime(clip.start)} to {padTime(clip.end)}
          </div>
          <div className="text" style={{ fontSize: '12px', color: '#4a5568', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {clip.text || 'Selected clip'}
          </div>
        </div>
      </div>

      {showPreview && preview && (
        <div className="clip-preview-tooltip">
          {preview.thumbnail && (
            <img src={preview.thumbnail} alt="Clip preview" className="preview-thumbnail" />
          )}
          <div className="preview-content">
            <div className="preview-duration">
              Duration: {padTime(preview.duration)}
            </div>
            <div className="preview-text">
              {preview.preview_text}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// v5.2: Live Meeting Mode removed


// v9: AI Meeting Assistant with SSE streaming, conversation memory, timestamp citations
function MeetingAssistant({ videoId, transcript, forceOpen = 0, aiModel = "gpt-4o", onTimestampClick }) {
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef(null);
  const streamControllerRef = useRef(null);

  useEffect(() => {
    if (forceOpen > 0) setIsOpen(true);
  }, [forceOpen]);

  useEffect(() => {
    if (videoId) loadSuggestions();
  }, [videoId]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  // Reset conversation when video changes
  useEffect(() => {
    setMessages([]);
    setSuggestions([]);
    setStreamingText('');
  }, [videoId]);

  const loadSuggestions = async () => {
    try {
      const data = await apiChatSuggestions({ meetingId: videoId });
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error("Failed to load suggestions:", error);
    }
  };

  const renderTimestampText = (text) => {
    // Parse [MM:SS] or [H:MM:SS] timestamps into clickable pills
    const parts = text.split(/(\[\d{1,2}:\d{2}(?::\d{2})?\])/g);
    return parts.map((part, i) => {
      const match = part.match(/^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]$/);
      if (match) {
        let seconds;
        if (match[3]) {
          seconds = parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]);
        } else {
          seconds = parseInt(match[1]) * 60 + parseInt(match[2]);
        }
        return (
          <button
            key={i}
            onClick={() => onTimestampClick && onTimestampClick(seconds)}
            style={{
              display: 'inline-block',
              background: '#166534',
              color: '#4ade80',
              border: 'none',
              borderRadius: '4px',
              padding: '1px 6px',
              fontSize: '12px',
              fontFamily: 'monospace',
              cursor: 'pointer',
              margin: '0 2px',
              verticalAlign: 'baseline',
            }}
            title={`Jump to ${part.slice(1, -1)}`}
          >
            {part.slice(1, -1)}
          </button>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  const sendMessage = async (query) => {
    if (!query.trim() || loading) return;

    const userMessage = { type: 'user', text: query };
    setMessages(prev => [...prev, userMessage]);
    setInputQuery('');
    setLoading(true);
    setStreamingText('');

    // Build conversation history from existing messages
    const conversationHistory = messages.map(m => ({ type: m.type, text: m.text }));

    // Cancel any existing stream
    if (streamControllerRef.current) {
      streamControllerRef.current.abort();
    }

    streamControllerRef.current = streamChatWithMeeting(
      {
        query,
        meetingId: videoId,
        conversationHistory,
        model: aiModel,
      },
      // onChunk
      (chunk, fullSoFar) => {
        // Strip SUGGESTIONS: line from display during streaming
        const display = fullSoFar.split('SUGGESTIONS:')[0];
        setStreamingText(display);
      },
      // onDone
      ({ fullText, suggestions: newSuggestions, stats }) => {
        const cleanText = fullText.split('SUGGESTIONS:')[0].trim();
        setMessages(prev => [...prev, { type: 'assistant', text: cleanText }]);
        setStreamingText('');
        setLoading(false);
        if (newSuggestions && newSuggestions.length > 0) {
          setSuggestions(newSuggestions);
        }
        streamControllerRef.current = null;
      },
      // onError
      (err) => {
        console.error("Chat stream error:", err);
        setMessages(prev => [...prev, { type: 'error', text: 'Failed to get response. Please try again.' }]);
        setStreamingText('');
        setLoading(false);
        streamControllerRef.current = null;
      }
    );
  };

  const clearChat = () => {
    setMessages([]);
    setStreamingText('');
    setSuggestions([]);
    loadSuggestions();
  };

  return (
    <div className="meeting-assistant" style={{ position: 'relative', margin: '16px 0' }}>
      <button
        className="assistant-toggle"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: isOpen ? '#166534' : '#1e293b',
          color: '#fff',
          border: '1px solid #334155',
          borderRadius: '8px',
          padding: '8px 16px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
        aria-expanded={isOpen}
        aria-controls="assistant-panel"
      >
        AI Meeting Chat {isOpen ? '\u25B2' : '\u25BC'}
      </button>

      {isOpen && (
        <div id="assistant-panel" role="region" aria-label="AI Meeting Chat" className="assistant-panel" style={{
          background: '#0f172a',
          border: '1px solid #334155',
          borderRadius: '8px',
          marginTop: '8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '500px',
        }}>
          <div className="assistant-header" style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid #1e293b',
          }}>
            <div>
              <h3 style={{ margin: 0, color: '#f1f5f9', fontSize: '16px' }}>Meeting Chat</h3>
              <p style={{ margin: '2px 0 0', color: '#64748b', fontSize: '12px' }}>
                {messages.length > 0 ? `${messages.filter(m => m.type === 'user').length} questions asked` : 'Ask anything about this meeting'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  style={{ background: 'none', border: '1px solid #334155', borderRadius: '4px', color: '#94a3b8', padding: '4px 8px', fontSize: '12px', cursor: 'pointer' }}
                  title="Clear conversation"
                  aria-label="Clear conversation"
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#94a3b8', padding: '2px 6px' }}
                title="Close"
                aria-label="Close chat"
              >
                \u2715
              </button>
            </div>
          </div>

          <div className="chat-messages" style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            minHeight: '200px',
          }}>
            {/* Initial suggestions when no messages */}
            {suggestions.length > 0 && messages.length === 0 && (
              <div style={{ marginBottom: '8px' }}>
                <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 8px' }}>Try asking:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {suggestions.map((s, i) => (
                    <button key={i} onClick={() => sendMessage(s)} style={{
                      background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
                      borderRadius: '16px', padding: '6px 12px', fontSize: '13px', cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onMouseOver={e => { e.target.style.background = '#334155'; e.target.style.color = '#e2e8f0'; }}
                    onMouseOut={e => { e.target.style.background = '#1e293b'; e.target.style.color = '#94a3b8'; }}
                    >{s}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, idx) => (
              <div key={idx} style={{
                alignSelf: msg.type === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: msg.type === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                background: msg.type === 'user' ? '#166534' : msg.type === 'error' ? '#7f1d1d' : '#1e293b',
                color: msg.type === 'error' ? '#fca5a5' : '#e2e8f0',
                fontSize: '14px',
                lineHeight: '1.5',
              }}>
                {msg.type === 'assistant' ? renderTimestampText(msg.text) : msg.text}
              </div>
            ))}

            {/* Streaming response */}
            {streamingText && (
              <div style={{
                alignSelf: 'flex-start',
                maxWidth: '85%',
                padding: '8px 12px',
                borderRadius: '12px 12px 12px 2px',
                background: '#1e293b',
                color: '#e2e8f0',
                fontSize: '14px',
                lineHeight: '1.5',
              }}>
                {renderTimestampText(streamingText)}
                <span className="shimmer-block" style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '14px',
                  background: '#4ade80',
                  borderRadius: '2px',
                  marginLeft: '2px',
                  animation: 'shimmer 0.8s ease-in-out infinite',
                  verticalAlign: 'text-bottom',
                }} />
              </div>
            )}

            {/* Loading dots (before stream starts) */}
            {loading && !streamingText && (
              <div style={{
                alignSelf: 'flex-start',
                padding: '8px 16px',
                borderRadius: '12px 12px 12px 2px',
                background: '#1e293b',
              }}>
                <div className="typing-indicator" style={{ display: 'flex', gap: '4px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'bounce 1.4s infinite', animationDelay: '0s' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'bounce 1.4s infinite', animationDelay: '0.2s' }} />
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'bounce 1.4s infinite', animationDelay: '0.4s' }} />
                </div>
              </div>
            )}

            {/* Follow-up suggestions after last assistant message */}
            {!loading && messages.length > 0 && suggestions.length > 0 && messages[messages.length - 1]?.type === 'assistant' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} style={{
                    background: 'transparent', color: '#4ade80', border: '1px solid #166534',
                    borderRadius: '16px', padding: '4px 10px', fontSize: '12px', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { e.target.style.background = '#166534'; e.target.style.color = '#fff'; }}
                  onMouseOut={e => { e.target.style.background = 'transparent'; e.target.style.color = '#4ade80'; }}
                  >{s}</button>
                ))}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input" style={{
            display: 'flex',
            gap: '8px',
            padding: '12px 16px',
            borderTop: '1px solid #1e293b',
          }}>
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage(inputQuery)}
              placeholder="Ask about the meeting..."
              disabled={loading}
              aria-label="Chat message input"
              style={{
                flex: 1,
                background: '#1e293b',
                color: '#e2e8f0',
                border: '1px solid #334155',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <button
              onClick={() => sendMessage(inputQuery)}
              disabled={loading || !inputQuery.trim()}
              aria-label="Send message"
              style={{
                background: loading || !inputQuery.trim() ? '#334155' : '#166534',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                padding: '8px 16px',
                fontSize: '14px',
                cursor: loading || !inputQuery.trim() ? 'default' : 'pointer',
                fontWeight: 600,
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// New Component: Knowledge Base
function KnowledgeBase({ currentVideoId, onSelectMeeting }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [relatedMeetings, setRelatedMeetings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAddingToKB, setIsAddingToKB] = useState(false);
  const [kbStats, setKbStats] = useState(null);
  // v5.2: Uses global BACKEND_URL (empty for relative URLs)

  useEffect(() => {
    loadKBStats();
  }, []);

  useEffect(() => {
    if (currentVideoId) {
      loadRelatedMeetings();
    }
  }, [currentVideoId]);

  const loadKBStats = async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/knowledge/stats`);
      const data = await response.json();
      setKbStats(data);
    } catch (error) {
      console.error("Failed to load KB stats:", error);
    }
  };

  const searchKnowledgeBase = async () => {
    if (!searchQuery.trim()) return;

    setLoading(true);
    try {
      const results = await apiSearchKnowledgeBase({
        query: searchQuery,
        limit: 10
      });
      setSearchResults(results.results || []);
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadRelatedMeetings = async () => {
    try {
      const data = await apiFindRelated({
        videoId: currentVideoId,
        limit: 5
      });
      setRelatedMeetings(data.related || []);
    } catch (error) {
      console.error("Failed to load related meetings:", error);
    }
  };

  const addCurrentMeetingToKB = async () => {
    if (!currentVideoId) return;

    setIsAddingToKB(true);
    try {
      await apiAddToKnowledgeBase({ videoId: currentVideoId });
      await loadKBStats();
      await loadRelatedMeetings();
      alert("Meeting added to knowledge base successfully!");
    } catch (error) {
      console.error("Failed to add to KB:", error);
      alert("Failed to add meeting to knowledge base");
    } finally {
      setIsAddingToKB(false);
    }
  };

  return (
    <div className="knowledge-base">
      <div className="kb-header">
        <h2>📚 Community Knowledge Base</h2>
        {kbStats && (
          <div className="kb-stats">
            <span>{kbStats.total_meetings} meetings</span>
            <span>{kbStats.total_documents} documents</span>
          </div>
        )}
      </div>

      <div className="kb-search">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && searchKnowledgeBase()}
          placeholder="Search across all meetings..."
        />
        <button onClick={searchKnowledgeBase} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="search-results">
          <h3>Search Results</h3>
          {searchResults.map((result, idx) => (
            <div key={idx} className="search-result" onClick={() => onSelectMeeting(result.video_id)}>
              <div className="result-title">{result.title}</div>
              <div className="result-meta">
                <span className="date">{result.date}</span>
                <span className="relevance">
                  {Math.round(result.relevance_score * 100)}% match
                </span>
              </div>
              <div className="result-excerpt">{result.excerpt}</div>
            </div>
          ))}
        </div>
      )}

      {currentVideoId && (
        <div className="current-meeting-kb">
          <button
            className="add-to-kb-button"
            onClick={addCurrentMeetingToKB}
            disabled={isAddingToKB}
          >
            {isAddingToKB ? 'Adding...' : ' to  Add Current Meeting to Knowledge Base'}
          </button>

          {relatedMeetings.length > 0 && (
            <div className="related-meetings">
              <h3>Related Meetings</h3>
              {relatedMeetings.map((meeting, idx) => (
                <div
                  key={idx}
                  className="related-meeting"
                  onClick={() => onSelectMeeting(meeting.video_id)}
                >
                  <div className="meeting-title">{meeting.title}</div>
                  <div className="meeting-meta">
                    <span className="date">{meeting.date}</span>
                    <span className="similarity">
                      {Math.round(meeting.similarity_score * 100)}% similar
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================================

// Meeting Scorecard - Full width with clickable metrics that open modals
function MeetingScorecard({ transcript, highlights, entities, isLoading }) {
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedMetric, setExpandedMetric] = useState(null);

  useEffect(() => {
    if (transcript && transcript.length > 100) {
      generateScorecard();
    }
  }, [transcript]);

  const generateScorecard = async () => {
    setLoading(true);
    try {
      const result = await apiMeetingScorecard({ 
        transcript, 
        highlights: highlights || [], 
        entities: entities || [] 
      });
      setScorecard(result.scorecard);
    } catch (err) {
      console.error('Scorecard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getMetricDetails = (type) => {
    switch(type) {
      case 'decisions':
        return {
          title: 'Votes & Decisions',
          description: 'All voting actions and formal decisions made during this meeting.',
          items: highlights?.filter(h => h.category === 'vote' || h.highlight?.toLowerCase()?.includes('vote') || h.highlight?.toLowerCase()?.includes('approv')).map(h => h.highlight || h.text) || []
        };
      case 'comments':
        return {
          title: 'Public Comments',
          description: 'Moments when residents and community members spoke.',
          items: highlights?.filter(h => h.category === 'public_comment' || h.highlight?.toLowerCase()?.includes('resident')).map(h => h.highlight || h.text) || []
        };
      case 'budget':
        return {
          title: 'Budget Items',
          description: 'Financial discussions and budget-related decisions.',
          items: highlights?.filter(h => h.category === 'budget' || h.highlight?.toLowerCase()?.includes('budget') || h.highlight?.includes('$')).map(h => h.highlight || h.text) || []
        };
      case 'topics':
        return {
          title: 'Key Topics',
          description: 'Main subjects discussed during the meeting.',
          items: scorecard?.hot_topics || []
        };
      case 'engagement':
        return {
          title: 'Engagement Score',
          description: 'Calculated based on topic variety, public comments, voting activity, and meeting dynamics.',
          items: scorecard?.hot_topics || []
        };
      default:
        return { title: '', description: '', items: [] };
    }
  };

  if (loading || isLoading) {
    return (
      <div className="viz-card" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div style={{ color: '#64748b' }}>Generating meeting scorecard...</div>
      </div>
    );
  }

  if (!scorecard) return null;

  // Calculate key topics count from hot_topics
  const topicsCount = scorecard.hot_topics?.length || 0;

  const metrics = [
    { key: 'decisions', value: scorecard.decisions_made, label: 'Votes/Decisions', icon: '', color: '#ef4444' },
    { key: 'comments', value: scorecard.public_comments, label: 'Public Comments', icon: '', color: '#2563eb' },
    { key: 'budget', value: scorecard.budget_items, label: 'Budget Items', icon: '', color: '#16a34a' },
    { key: 'topics', value: topicsCount, label: 'Key Topics', icon: '', color: '#9333ea' },
    { key: 'duration', value: scorecard.duration, label: 'Duration', icon: '', color: '#64748b', noClick: true },
    { key: 'engagement', value: `${scorecard.engagement_score}%`, label: 'Engagement', icon: '', color: scorecard.engagement_score > 70 ? '#16a34a' : scorecard.engagement_score > 40 ? '#eab308' : '#ef4444' },
  ];

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1' }}>
      <h3>Meeting Scorecard</h3>
      <p className="viz-desc">Key metrics at a glance. Click any metric for details.</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '12px', marginTop: '16px' }}>
        {metrics.map((metric) => (
          <div 
            key={metric.key}
            onClick={() => !metric.noClick && setExpandedMetric(expandedMetric === metric.key ? null : metric.key)}
            style={{ 
              padding: '20px 12px',
              background: expandedMetric === metric.key ? '#f0fdf4' : '#f8fafc',
              borderRadius: '12px',
              textAlign: 'center',
              cursor: metric.noClick ? 'default' : 'pointer',
              border: expandedMetric === metric.key ? '2px solid #1E7F63' : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => { if (!metric.noClick) e.currentTarget.style.background = '#f0fdf4'; }}
            onMouseLeave={(e) => { if (!metric.noClick && expandedMetric !== metric.key) e.currentTarget.style.background = '#f8fafc'; }}
          >
            <div style={{ fontSize: '32px', fontWeight: 700, color: metric.color }}>{metric.value}</div>
            <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>{metric.icon} {metric.label}</div>
            {!metric.noClick && (
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
                {expandedMetric === metric.key ? '▲ click to close' : '▼ click for details'}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Inline Expansion Panel - appears directly below the metrics */}
      {expandedMetric && (
        <div style={{
          marginTop: '16px',
          padding: '20px',
          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
          borderRadius: '12px',
          border: '2px solid #1E7F63',
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h4 style={{ margin: 0, color: '#1E7F63', fontSize: '16px' }}>
              {getMetricDetails(expandedMetric).title}
            </h4>
            <button 
              onClick={() => setExpandedMetric(null)} 
              style={{ 
                background: '#1E7F63', 
                color: 'white', 
                border: 'none', 
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>
            {getMetricDetails(expandedMetric).description}
          </p>
          <div style={{ 
            maxHeight: '200px', 
            overflow: 'auto',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}>
            {getMetricDetails(expandedMetric).items.length > 0 ? (
              getMetricDetails(expandedMetric).items.slice(0, 12).map((item, idx) => (
                <div key={idx} style={{ 
                  padding: '10px 14px', 
                  background: 'white', 
                  borderRadius: '8px', 
                  fontSize: '13px',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                  maxWidth: '100%',
                }}>
                  {item}
                </div>
              ))
            ) : (
              <div style={{ 
                textAlign: 'center', 
                color: '#64748b', 
                padding: '20px',
                width: '100%',
                fontStyle: 'italic',
              }}>
                No specific items detected for this category.
              </div>
            )}
          </div>
        </div>
      )}

      {scorecard.hot_topics && scorecard.hot_topics.length > 0 && !expandedMetric && (
        <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>Hot Topics</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {scorecard.hot_topics.map((topic, idx) => (
              <span key={idx} style={{
                background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                color: '#92400e',
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: 500,
                border: '1px solid #fcd34d'
              }}>
                {topic}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Interactive Timeline with colored markers and expandable action cards
function InteractiveTimeline({ sents, highlights, playerRef, videoId, addToBasket, pad, openExpandedAt }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [expandedPoint, setExpandedPoint] = useState(null);
  const timelineRef = useRef(null);

  if (!sents || sents.length === 0) return null;

  const totalDuration = sents[sents.length - 1]?.end || 100;

  // Categorize timeline points
  const timelinePoints = [];
  
  // Add highlight points
  highlights?.forEach((h, idx) => {
    if (h.start !== undefined) {
      timelinePoints.push({
        time: h.start,
        endTime: h.end || h.start + 30,
        type: h.category || 'highlight',
        label: h.highlight || h.text || `Highlight ${idx + 1}`,
        fullText: h.text || h.highlight || '',
        color: h.category === 'vote' ? '#ef4444' : 
               h.category === 'budget' ? '#16a34a' : 
               h.category === 'public_comment' ? '#2563eb' : '#f59e0b',
        originalIndex: idx
      });
    }
  });

  // Detect decision points from text
  const decisionKeywords = ['approved', 'rejected', 'vote', 'passed', 'motion', 'unanimous'];
  sents.forEach((sent, idx) => {
    const lowerText = sent.text.toLowerCase();
    if (decisionKeywords.some(kw => lowerText.includes(kw))) {
      const nearbyPoint = timelinePoints.find(p => Math.abs(p.time - sent.start) < 30);
      if (!nearbyPoint) {
        timelinePoints.push({
          time: sent.start,
          endTime: sent.end || sent.start + 15,
          type: 'decision',
          label: sent.text.substring(0, 80) + (sent.text.length > 80 ? '...' : ''),
          fullText: sent.text,
          color: '#ef4444'
        });
      }
    }
  });

  // Detect public comments
  const publicKeywords = ['public comment', 'my name is', 'i live at', 'i\'m a resident'];
  sents.forEach((sent, idx) => {
    const lowerText = sent.text.toLowerCase();
    if (publicKeywords.some(kw => lowerText.includes(kw))) {
      const nearbyPoint = timelinePoints.find(p => Math.abs(p.time - sent.start) < 60);
      if (!nearbyPoint) {
        timelinePoints.push({
          time: sent.start,
          endTime: sent.end || sent.start + 30,
          type: 'public_comment',
          label: sent.text.substring(0, 80) + (sent.text.length > 80 ? '...' : ''),
          fullText: sent.text,
          color: '#2563eb'
        });
      }
    }
  });

  // Sort by time
  timelinePoints.sort((a, b) => a.time - b.time);

  const seekTo = (time) => {
    if (playerRef?.current?.seekTo) {
      playerRef.current.seekTo(Math.max(0, time - 2));
    }
  };

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` 
                 : `${m}:${String(s).padStart(2, '0')}`;
  };

  const handlePointClick = (idx, time) => {
    if (expandedPoint === idx) {
      setExpandedPoint(null);
    } else {
      setExpandedPoint(idx);
      seekTo(time);
    }
  };

  const getTypeLabel = (type) => {
    switch(type) {
      case 'vote': case 'decision': return 'Vote/Decision';
      case 'budget': return 'Budget Item';
      case 'public_comment': return 'Public Comment';
      default: return 'Highlight';
    }
  };

  return (
    <div className="viz-card interactive-timeline" style={{ gridColumn: '1 / -1' }}>
      <h3>Interactive Timeline</h3>
      <p className="viz-desc">Click any marker to expand details and jump to that moment. Lines indicate key moments.</p>
      
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#166534' }} />
          Votes/Decisions
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#22c55e' }} />
          Public Comments
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#15803d' }} />
          Budget
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#4ade80' }} />
          Highlights
        </span>
      </div>

      <div 
        ref={timelineRef}
        style={{ 
          position: 'relative', 
          height: '100px', 
          background: 'linear-gradient(to right, #f0fdf4, #dcfce7)',
          borderRadius: '8px',
          marginBottom: '8px'
        }}
      >
        {/* Timeline track */}
        <div style={{ 
          position: 'absolute', 
          top: '70%', 
          left: '8px', 
          right: '8px', 
          height: '4px', 
          background: '#86efac',
          borderRadius: '2px',
          transform: 'translateY(-50%)'
        }} />

        {/* Timeline points with lines */}
        {timelinePoints.map((point, idx) => {
          const position = (point.time / totalDuration) * 100;
          const isExpanded = expandedPoint === idx;
          // Assign green shades based on type
          const greenColor = point.type === 'vote' || point.type === 'decision' ? '#166534' : 
                            point.type === 'public_comment' ? '#22c55e' : 
                            point.type === 'budget' ? '#15803d' : '#4ade80';
          return (
            <div key={idx}>
              {/* Vertical line from point */}
              <div
                style={{
                  position: 'absolute',
                  left: `calc(${position}% + 8px - 1px)`,
                  top: '20px',
                  width: '2px',
                  height: '50%',
                  background: `linear-gradient(to bottom, ${greenColor}, transparent)`,
                  opacity: hoveredPoint === idx || isExpanded ? 1 : 0.4,
                  transition: 'opacity 0.2s',
                }}
              />
              {/* Point marker */}
              <div
                onClick={() => handlePointClick(idx, point.time)}
                onMouseEnter={() => setHoveredPoint(idx)}
                onMouseLeave={() => setHoveredPoint(null)}
                style={{
                  position: 'absolute',
                  left: `calc(${position}% + 8px - 10px)`,
                  top: '70%',
                  transform: `translateY(-50%) ${isExpanded ? 'scale(1.4)' : ''}`,
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: greenColor,
                  cursor: 'pointer',
                  zIndex: hoveredPoint === idx || isExpanded ? 10 : 1,
                  boxShadow: isExpanded ? `0 0 0 4px ${greenColor}40, 0 4px 12px rgba(0,0,0,0.15)` : hoveredPoint === idx ? '0 0 0 4px rgba(30,127,99,0.2)' : '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s, box-shadow 0.2s',
                  border: '3px solid white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title={`${formatTime(point.time)} - ${point.label}`}
              >
                {/* Inner dot for emphasis */}
                <div style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'white',
                  opacity: isExpanded ? 1 : 0,
                }}/>
              </div>
              {/* Point label above line */}
              {(hoveredPoint === idx || isExpanded) && (
                <div
                  style={{
                    position: 'absolute',
                    left: `calc(${position}% + 8px)`,
                    top: '8px',
                    transform: 'translateX(-50%)',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: greenColor,
                    background: 'white',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    whiteSpace: 'nowrap',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  {formatTime(point.time)}
                </div>
              )}
            </div>
          );
        })}

        {/* Hover tooltip */}
        {hoveredPoint !== null && expandedPoint === null && timelinePoints[hoveredPoint] && (
          <div style={{
            position: 'absolute',
            left: `calc(${(timelinePoints[hoveredPoint].time / totalDuration) * 100}%)`,
            bottom: '100%',
            transform: 'translateX(-50%)',
            background: '#166534',
            color: 'white',
            padding: '10px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            maxWidth: '280px',
            zIndex: 20,
            whiteSpace: 'normal',
            marginBottom: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>
              {formatTime(timelinePoints[hoveredPoint].time)}
            </div>
            <div>{timelinePoints[hoveredPoint].label}</div>
            <div style={{ fontSize: '10px', opacity: 0.8, marginTop: '6px' }}>Click to expand</div>
          </div>
        )}
      </div>

      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', padding: '0 8px', marginBottom: '12px' }}>
        <span>0:00</span>
        <span>{formatTime(totalDuration / 4)}</span>
        <span>{formatTime(totalDuration / 2)}</span>
        <span>{formatTime(totalDuration * 3 / 4)}</span>
        <span>{formatTime(totalDuration)}</span>
      </div>

      {/* Expanded Action Card */}
      {expandedPoint !== null && timelinePoints[expandedPoint] && (
        <div style={{
          background: 'white',
          border: `2px solid ${timelinePoints[expandedPoint].color}`,
          borderRadius: '12px',
          padding: '16px',
          marginTop: '8px',
          animation: 'slideIn 0.2s ease-out'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
            <div>
              <div style={{ 
                display: 'inline-block',
                background: `${timelinePoints[expandedPoint].color}20`,
                color: timelinePoints[expandedPoint].color,
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '11px',
                fontWeight: 600,
                marginBottom: '8px'
              }}>
                {getTypeLabel(timelinePoints[expandedPoint].type)}
              </div>
              <div style={{ fontSize: '13px', color: '#64748b' }}>
                {formatTime(timelinePoints[expandedPoint].time)} - {formatTime(timelinePoints[expandedPoint].endTime)}
              </div>
            </div>
            <button
              onClick={() => setExpandedPoint(null)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '4px'
              }}
            >
              ✕
            </button>
          </div>
          
          <div style={{ 
            fontSize: '15px', 
            color: '#1e293b', 
            lineHeight: '1.6',
            marginBottom: '16px'
          }}>
            {timelinePoints[expandedPoint].fullText || timelinePoints[expandedPoint].label}
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {/* Transcript Context - same as SearchResultCard */}
            {openExpandedAt && (
              <button
                onClick={() => {
                  const point = timelinePoints[expandedPoint];
                  // Find matching sentence for expanded view
                  const matchingSent = sents?.find(s => 
                    Math.abs(s.start - point.time) < 5
                  ) || { start: point.time, end: point.endTime || point.time + 10, text: point.label };
                  openExpandedAt(matchingSent);
                }}
                className="btn btn-accent"
                style={{ fontSize: '12px', padding: '8px 12px' }}
              >
                Transcript Context
              </button>
            )}

            {/* Save to Basket */}
            {addToBasket && (
              <button
                onClick={() => {
                  const point = timelinePoints[expandedPoint];
                  const s = Math.max(0, Math.floor(point.time - (pad || 2)));
                  const e = Math.floor((point.endTime || point.time + 10) + (pad || 2));
                  addToBasket({ start: s, end: e, label: point.label.slice(0, 60) });
                }}
                className="btn btn-primary"
                style={{ fontSize: '12px', padding: '8px 12px' }}
              >
                + Clip
              </button>
            )}

            {/* Video Context */}
            <button
              onClick={() => {
                const point = timelinePoints[expandedPoint];
                const start = Math.max(0, Math.floor(point.time - (pad || 2)));
                if (!playerRef?.current || !videoId) return;
                playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&mute=0&playsinline=1`;
                playerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '8px 12px' }}
            >
              Video Context
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Share a Moment - Create shareable clips
function ShareMoment({ videoId, sents, playerRef }) {
  const [isOpen, setIsOpen] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(30);
  const [title, setTitle] = useState('');
  const [shareResult, setShareResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleShare = async () => {
    setLoading(true);
    try {
      const result = await apiShareMoment({
        videoId,
        startTime,
        endTime,
        title: title || 'Meeting Moment',
        description: ''
      });
      setShareResult(result);
    } catch (err) {
      console.error('Share error:', err);
      alert('Failed to create share link');
    } finally {
      setLoading(false);
    }
  };

  const captureCurrentTime = () => {
    if (playerRef?.current?.getCurrentTime) {
      const current = playerRef.current.getCurrentTime();
      setStartTime(Math.floor(current));
      setEndTime(Math.floor(current) + 30);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="btn btn-ghost"
        style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        🔗 Share a Moment
      </button>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999
    }}
    onClick={() => setIsOpen(false)}
    >
      <div 
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          🔗 Share a Moment
        </h3>

        {!shareResult ? (
          <>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: '#64748b' }}>Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Budget Vote Announcement"
                style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: '#64748b' }}>Start Time</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    value={startTime}
                    onChange={(e) => setStartTime(parseInt(e.target.value) || 0)}
                    style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', color: '#64748b', fontSize: '12px' }}>
                    ({formatTime(startTime)})
                  </span>
                </div>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: '#64748b' }}>End Time</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="number"
                    value={endTime}
                    onChange={(e) => setEndTime(parseInt(e.target.value) || 0)}
                    style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', color: '#64748b', fontSize: '12px' }}>
                    ({formatTime(endTime)})
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={captureCurrentTime}
              className="btn btn-ghost"
              style={{ marginBottom: '16px', width: '100%' }}
            >
              ⏱️ Use Current Video Time
            </button>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setIsOpen(false)} className="btn btn-ghost" style={{ flex: 1 }}>
                Cancel
              </button>
              <button onClick={handleShare} className="btn btn-primary" style={{ flex: 1 }} disabled={loading}>
                {loading ? 'Creating...' : 'Create Share Link'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: '8px', marginBottom: '16px' }}>
              <div style={{ color: '#16a34a', fontWeight: 600, marginBottom: '8px' }}>✓ Share link created!</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Duration: {shareResult.duration} seconds
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: '#64748b' }}>YouTube Link (with timestamp)</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={shareResult.youtube_url}
                  readOnly
                  style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <button 
                  onClick={() => copyToClipboard(shareResult.youtube_url)}
                  className="btn btn-ghost"
                >
                  📹
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: '#64748b' }}>Embed Code</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  value={shareResult.embed_code}
                  readOnly
                  style={{ flex: 1, padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '11px' }}
                />
                <button 
                  onClick={() => copyToClipboard(shareResult.embed_code)}
                  className="btn btn-ghost"
                >
                  📹
                </button>
              </div>
            </div>

            <button onClick={() => { setShareResult(null); setIsOpen(false); }} className="btn btn-primary" style={{ width: '100%' }}>
              Done
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// Accessibility Panel - Simplify text and translate
function AccessibilityPanel({ summary, onSimplified, onTranslated }) {
  const [isOpen, setIsOpen] = useState(false);
  const [readingLevel, setReadingLevel] = useState('simple');
  const [targetLanguage, setTargetLanguage] = useState('Spanish');
  const [loading, setLoading] = useState(false);
  const [simplifiedText, setSimplifiedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');

  const handleSimplify = async () => {
    if (!summary) return;
    setLoading(true);
    try {
      const result = await apiSimplifyText({ text: summary, level: readingLevel });
      setSimplifiedText(result.simplified);
      if (onSimplified) onSimplified(result.simplified);
    } catch (err) {
      console.error('Simplify error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleTranslate = async () => {
    const textToTranslate = simplifiedText || summary;
    if (!textToTranslate) return;
    setLoading(true);
    try {
      const result = await apiTranslateSummary({ text: textToTranslate, language: targetLanguage });
      setTranslatedText(result.translated);
      if (onTranslated) onTranslated(result.translated);
    } catch (err) {
      console.error('Translate error:', err);
    } finally {
      setLoading(false);
    }
  };

  const languages = ['Spanish', 'Chinese', 'Vietnamese', 'Portuguese', 'French', 'Korean', 'Arabic', 'Russian', 'Japanese', 'Hindi'];

  if (!summary) return null;

  return (
    <div style={{ marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 600,
          color: '#1E7F63',
          padding: 0
        }}
      >
        ♿ Accessibility Options
        <span style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
      </button>

      {isOpen && (
        <div style={{ marginTop: '12px', padding: '16px', background: '#f8fafc', borderRadius: '8px' }}>
          {/* Reading Level */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#475569', fontWeight: 500 }}>
              🔖 Reading Level
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { value: 'simple', label: 'Simple (8th grade)' },
                { value: 'moderate', label: 'Moderate (10th grade)' },
                { value: 'detailed', label: 'Detailed (Original clarity)' }
              ].map(level => (
                <button
                  key={level.value}
                  onClick={() => setReadingLevel(level.value)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: readingLevel === level.value ? '2px solid #1E7F63' : '1px solid #e2e8f0',
                    background: readingLevel === level.value ? '#f0fdf4' : 'white',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  {level.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleSimplify}
              disabled={loading}
              className="btn btn-ghost"
              style={{ marginTop: '8px', fontSize: '12px' }}
            >
              {loading ? 'Processing...' : 'Simplify Summary'}
            </button>
          </div>

          {/* Translation */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', marginBottom: '8px', color: '#475569', fontWeight: 500 }}>
              🌐Â Translate Summary
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {languages.map(lang => (
                <button
                  key={lang}
                  onClick={() => setTargetLanguage(lang)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: targetLanguage === lang ? '2px solid #1E7F63' : '1px solid #e2e8f0',
                    background: targetLanguage === lang ? '#f0fdf4' : 'white',
                    cursor: 'pointer',
                    fontSize: '11px'
                  }}
                >
                  {lang}
                </button>
              ))}
            </div>
            <button
              onClick={handleTranslate}
              disabled={loading}
              className="btn btn-ghost"
              style={{ fontSize: '12px' }}
            >
              {loading ? 'Translating...' : `Translate to ${targetLanguage}`}
            </button>
          </div>

          {/* Results */}
          {(simplifiedText || translatedText) && (
            <div style={{ marginTop: '16px', padding: '12px', background: 'white', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: '#475569' }}>
                {translatedText ? `🔄 ${targetLanguage} Translation` : '🔄 Simplified Version'}
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#1e293b' }}>
                {translatedText || simplifiedText}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  // v5.6: Cloud mode detection
  const { isCloudMode } = useCloudMode();
  
  // v7.0: Enhanced UX
  useScrollDetection();
  
  // v5.6: Word Investigate modal state
  const [investigateWord, setInvestigateWord] = useState(null);
  const [investigateViewMode, setInvestigateViewMode] = useState('news');
  
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [liveUrl, setLiveUrl] = useState("");
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState([]);
  const [liveHighlights, setLiveHighlights] = useState([]);
  const [wsConnection, setWsConnection] = useState(null);
  const [vtt, setVtt] = useState("");
  const [cues, setCues] = useState([]);
  const [sents, setSents] = useState([]);
  const [fullText, setFullText] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [pad, setPad] = useState(2);
  const [job, setJob] = useState({ id: null, percent: 0, message: "", status: "idle", zip: null });
  const [jobLogs, setJobLogs] = useState([]);
  const [jobEstimate, setJobEstimate] = useState(null);
  const [extendedAnalytics, setExtendedAnalytics] = useState(null);
  const [actions, setActions] = useState({ reel: "", sum: "", dl: "", tr: "" });
  const [summary, setSummary] = useState({ para: "", bullets: [] });
  const [summaryError, setSummaryError] = useState(false);
  const [fullReport, setFullReport] = useState({ text: "", headline: "" });
  const [loadingReport, setLoadingReport] = useState(false);
  const [streamingReportText, setStreamingReportText] = useState("");
  const [streamingSummaryText, setStreamingSummaryText] = useState("");
  const [reportCollapsed, setReportCollapsed] = useState(false);
  const [highlightsCollapsed, setHighlightsCollapsed] = useState(false);
  const [highlightsWithQuotes, setHighlightsWithQuotes] = useState([]);
  const [reelCaptionsEnabled, setReelCaptionsEnabled] = useState(false);
  
  // 🎬 Video editing options
  const [videoOptions, setVideoOptions] = useState({
    clipPadding: 4,
    backgroundMusic: false,
    transitions: false,
    transitionType: 'none',
    transitionDuration: 0.5,
    colorFilter: 'none',
    playbackSpeed: '1.0',
    showHighlightLabels: true,
    logoWatermark: false,
    normalizeAudio: true,
    introTitle: '',
    introSubtitle: '',
    outroTitle: '',
    outroCta: '',
    resolution: '720p',
    lowerThirds: false,
  });
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [availableFormats, setAvailableFormats] = useState([]);
  const [clipThumbnails, setClipThumbnails] = useState([]);

  // Download history & toasts
  const [downloadHistory, setDownloadHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ch_downloads') || '[]'); } catch { return []; }
  });
  const [showDownloadDropdown, setShowDownloadDropdown] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [downloadResolution, setDownloadResolution] = useState('best');
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('ch_onboarding_done'));

  const addToast = (message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const addDownload = (filename, url, type) => {
    const entry = { filename, url, timestamp: Date.now(), type };
    setDownloadHistory(prev => {
      const next = [entry, ...prev].slice(0, 20);
      localStorage.setItem('ch_downloads', JSON.stringify(next));
      return next;
    });
    addToast(`Downloaded: ${filename}`);
  };

  // Desktop editor timeline state
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [draggingClipIndex, setDraggingClipIndex] = useState(null);
  const [playbackPosition, setPlaybackPosition] = useState(0);

  const [words, setWords] = useState([]);
  const [entities, setEntities] = useState([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [hits, setHits] = useState([]);
  const [loading, setLoading] = useState({ transcript: false, summary: false, clips: false, reel: false, mp4: false, translate: false });
  const [downloadProgress, setDownloadProgress] = useState({
    active: false,
    bytesLoaded: 0,
    bytesTotal: 0,
    startTime: null
  });

  // ⚙️ NEW: Optimization stats state
  const [optimizationStats, setOptimizationStats] = useState(null);
  const [showOptimizationPanel, setShowOptimizationPanel] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // ✨ NEW v4.0: State for new features
  const [showAssistant, setShowAssistant] = useState(false);
  const [forceAssistantOpen, setForceAssistantOpen] = useState(0); // Counter to force open
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showLiveMode, setShowLiveMode] = useState(false);

  const [expanded, setExpanded] = useState({ open: false, focusIdx: null });
  const [clipBasket, setClipBasket] = useState([]);
  const [lang, setLang] = useState("en");
  const [aiModel, setAiModel] = useState("gemini-2.5-flash");
  const [processStatus, setProcessStatus] = useState({ active: false, message: "", percent: 0, estimatedTime: null, isVideoDownload: false });
  const [translation, setTranslation] = useState({ text: "", lang: "", show: false });
  const [translateLang, setTranslateLang] = useState("Spanish");
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [showShortcutOverlay, setShowShortcutOverlay] = useState(false);
  const [showReelStyles, setShowReelStyles] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [downloadJob, setDownloadJob] = useState(null); // { jobId, percent, message, status }
  const [showCelebration, setShowCelebration] = useState(null); // {file: url} when render completes
  const [videoTitle, setVideoTitle] = useState("");
  const [showTranscriptUpload, setShowTranscriptUpload] = useState(false); // Show upload prompt when no captions
  const [showAboutPage, setShowAboutPage] = useState(false); // About Community Highlighter page

  const [previewingClip, setPreviewingClip] = useState(null); // {idx, clip} when previewing
  const [selectedClipIndex, setSelectedClipIndex] = useState(null);
  const [floatingClipBtn, setFloatingClipBtn] = useState(null); // {x, y} for floating "Create Clip" button
  const [showTranscriptPanel, setShowTranscriptPanel] = useState(true);
  const [showFullTranscript, setShowFullTranscript] = useState(false); // Full transcript overlay on word cloud
  const [transitionPickerIdx, setTransitionPickerIdx] = useState(null); // which clip transition to edit
  const desktopTranscriptRef = useRef(null);
  const sectionHighlightRef = useRef(null);
  const sectionEditRef = useRef(null);
  const sectionAnalyzeRef = useRef(null);

  const debQuery = useDebounce(query, 220);
  const playerRef = useRef(null);
  const searchPlayerRef = useRef(null); // Small video for search/discovery zone
  const transcriptRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const previewTimerRef = useRef(null);

  // Active transcript cue tracking (for auto-highlight during playback)
  const [activeCueIdx, setActiveCueIdx] = useState(-1);
  const activeCueTimerRef = useRef(null);

  // Jump to timestamp: scrolls to Highlight section, opens transcript, seeks player, highlights cue
  const jumpToTimestamp = useCallback((seconds) => {
    if (!videoId || !sents.length) return;

    // 1. Open the full transcript view
    setShowFullTranscript(true);

    // 2. Scroll to the Highlight section
    if (sectionHighlightRef.current) {
      sectionHighlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // 3. Seek the search player
    setTimeout(() => {
      if (searchPlayerRef.current) {
        searchPlayerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(seconds)}&autoplay=1&mute=0&playsinline=1&enablejsapi=1`;
      }
    }, 400);

    // 4. Find the matching cue and scroll to it
    setTimeout(() => {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < sents.length; i++) {
        const dist = Math.abs(sents[i].start - seconds);
        if (dist < bestDist) { bestDist = dist; bestIdx = i; }
      }
      setActiveCueIdx(bestIdx);

      const el = document.getElementById(`sent-${bestIdx}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // 5. Start auto-tracking: update highlighted cue as video plays
      if (activeCueTimerRef.current) clearInterval(activeCueTimerRef.current);
      let currentTime = seconds;
      activeCueTimerRef.current = setInterval(() => {
        currentTime += 1;
        let newIdx = bestIdx;
        for (let i = bestIdx; i < sents.length; i++) {
          if (sents[i].start <= currentTime && (i === sents.length - 1 || sents[i + 1].start > currentTime)) {
            newIdx = i;
            break;
          }
        }
        if (newIdx !== bestIdx) {
          setActiveCueIdx(newIdx);
          const cueEl = document.getElementById(`sent-${newIdx}`);
          if (cueEl) cueEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        bestIdx = newIdx;
      }, 1000);

      // Stop after 2 minutes
      setTimeout(() => { if (activeCueTimerRef.current) clearInterval(activeCueTimerRef.current); }, 120000);
    }, 600);
  }, [videoId, sents]);

  // Cleanup cue timer
  useEffect(() => {
    return () => { if (activeCueTimerRef.current) clearInterval(activeCueTimerRef.current); };
  }, []);

  // Render text with clickable timestamp pills — matches (MM:SS), (H:MM:SS), (HH:MM:SS)
  const renderLineWithTimestamps = useCallback((text) => {
    if (!text) return text;
    const tsRegex = /\((\d{1,2}):(\d{2})(?::(\d{2}))?\)/g;
    const parts = [];
    let lastIdx = 0;
    let match;
    while ((match = tsRegex.exec(text)) !== null) {
      if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
      const hrs = match[3] ? parseInt(match[1]) : 0;
      const mins = match[3] ? parseInt(match[2]) : parseInt(match[1]);
      const secs = match[3] ? parseInt(match[3]) : parseInt(match[2]);
      const totalSec = hrs * 3600 + mins * 60 + secs;
      const display = hrs > 0 ? `${hrs}:${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}` : `${mins}:${String(secs).padStart(2,'0')}`;
      parts.push(
        <button key={match.index} className="timestamp-pill" onClick={() => jumpToTimestamp(totalSec)} title={`Jump to ${display} — opens video + transcript`}>
          {display}
        </button>
      );
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx === 0) return text; // no timestamps found
    if (lastIdx < text.length) parts.push(text.slice(lastIdx));
    return parts;
  }, [jumpToTimestamp]);

  // Undo/redo stacks for clip basket
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const updateClipBasket = (newValueOrFn) => {
    setClipBasket(prev => {
      const newValue = typeof newValueOrFn === 'function' ? newValueOrFn(prev) : newValueOrFn;
      undoStackRef.current.push(JSON.parse(JSON.stringify(prev)));
      if (undoStackRef.current.length > 50) undoStackRef.current.shift();
      redoStackRef.current = [];
      return newValue;
    });
  };
  const undoClipBasket = () => {
    if (undoStackRef.current.length === 0) return;
    setClipBasket(prev => {
      redoStackRef.current.push(JSON.parse(JSON.stringify(prev)));
      return undoStackRef.current.pop();
    });
  };
  const redoClipBasket = () => {
    if (redoStackRef.current.length === 0) return;
    setClipBasket(prev => {
      undoStackRef.current.push(JSON.parse(JSON.stringify(prev)));
      return redoStackRef.current.pop();
    });
  };

  // Floating "Create Clip" button on text selection in desktop transcript
  const handleDesktopTranscriptMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { setFloatingClipBtn(null); return; }
    const range = sel.getRangeAt(0);
    const container = desktopTranscriptRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) { setFloatingClipBtn(null); return; }
    const rect = range.getBoundingClientRect();
    setFloatingClipBtn({ x: rect.left + rect.width / 2, y: rect.top - 10 });
  };

  const createClipFromSelection = () => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    const container = desktopTranscriptRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;
    // Find all .sent nodes in range
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => node.classList?.contains('sent') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    });
    const sentNodes = [];
    let node;
    while (node = walker.nextNode()) { if (range.intersectsNode(node)) sentNodes.push(node); }
    if (!sentNodes.length) return;
    const idxs = sentNodes.map(n => parseInt(n.dataset.idx)).filter(i => !isNaN(i));
    const minIdx = Math.min(...idxs);
    const maxIdx = Math.max(...idxs);
    const startTime = sents[minIdx]?.start;
    const endTime = sents[maxIdx]?.end || sents[maxIdx]?.start + 15;
    if (startTime === undefined) return;
    const pad = videoOptions.clipPadding || 4;
    const clip = {
      start: Math.max(0, Math.floor(startTime - pad)),
      end: Math.floor(endTime + pad),
      label: sents.slice(minIdx, maxIdx + 1).map(s => s.text).join(' ').slice(0, 80),
      highlight: sents.slice(minIdx, maxIdx + 1).map(s => s.text).join(' ').slice(0, 80),
      text: sents.slice(minIdx, maxIdx + 1).map(s => s.text).join(' ')
    };
    updateClipBasket(prev => [...prev, clip]);
    addToast('✂️ Clip created from highlighted text!');
    sel.removeAllRanges();
    setFloatingClipBtn(null);
    // Pulse timeline
    setTimeout(() => {
      const track = document.querySelector('.timeline-track');
      if (track) { track.classList.add('timeline-flash'); setTimeout(() => track.classList.remove('timeline-flash'), 1500); }
    }, 100);
  };

  const t = translations[lang] || translations.en;

  const extractVideoId = (inp) => {
    try {
      if (/^[a-zA-Z0-9_-]{11}$/.test(inp)) return inp;

      if (inp.includes("youtube.com/watch")) {
        const u = new URL(inp);
        return u.searchParams.get("v") || "";
      }

      if (inp.includes("youtu.be")) {
        const u = new URL(inp);
        return u.pathname.replace("/", "");
      }

      if (inp.includes("youtube.com/live")) {
        const parts = inp.split("youtube.com/live/")[1];
        if (parts) {
          return parts.split("?")[0] || "";
        }
      }
    } catch (e) { }
    const match = inp.match(/(?:v=|youtu\.be\/|live\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];

    return "";
  };
  // ⌨️ Keyboard shortcuts for video editing
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Escape closes settings drawer or shortcuts overlay
      if (e.key === 'Escape') {
        if (showShortcutOverlay) { setShowShortcutOverlay(false); return; }
        if (showSettingsDrawer) { setShowSettingsDrawer(false); return; }
      }
      // Don't capture when typing in input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
      // ? = show keyboard shortcuts overlay
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowShortcutOverlay(v => !v);
        return;
      }
      if (!videoId || clipBasket.length === 0) return;

      const isMac = navigator.platform.toUpperCase().includes('MAC');
      const mod = isMac ? e.metaKey : e.ctrlKey;

      // Ctrl+Z / Cmd+Z = Undo
      if (mod && !e.shiftKey && e.key === 'z') { e.preventDefault(); undoClipBasket(); return; }
      // Ctrl+Shift+Z / Cmd+Shift+Z = Redo
      if (mod && e.shiftKey && e.key === 'z') { e.preventDefault(); redoClipBasket(); return; }
      if (mod && e.key === 'y') { e.preventDefault(); redoClipBasket(); return; }

      // Delete/Backspace = remove selected clip
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedClipIndex !== null) {
        e.preventDefault(); removeClipFromTimeline(selectedClipIndex); return;
      }

      // Arrow keys = nudge selected clip ±1s
      if (e.key === 'ArrowLeft' && selectedClipIndex !== null) {
        e.preventDefault();
        updateClipBasket(prev => prev.map((c, i) => i === selectedClipIndex ? { ...c, start: Math.max(0, c.start - 1), end: c.end - 1 } : c));
        return;
      }
      if (e.key === 'ArrowRight' && selectedClipIndex !== null) {
        e.preventDefault();
        updateClipBasket(prev => prev.map((c, i) => i === selectedClipIndex ? { ...c, start: c.start + 1, end: c.end + 1 } : c));
        return;
      }

      // S = split clip at midpoint (of selected clip)
      if (e.key === 's' && !mod && selectedClipIndex !== null) {
        e.preventDefault();
        const clip = clipBasket[selectedClipIndex];
        if (!clip) return;
        const mid = (clip.start + clip.end) / 2;
        const firstHalf = { ...clip, end: mid, label: (clip.label || `Clip`) + ' (A)' };
        const secondHalf = { ...clip, start: mid, label: (clip.label || `Clip`) + ' (B)' };
        updateClipBasket(prev => [...prev.slice(0, selectedClipIndex), firstHalf, secondHalf, ...prev.slice(selectedClipIndex + 1)]);
        return;
      }

      // Space = preview selected clip
      if (e.key === ' ' && selectedClipIndex !== null) {
        e.preventDefault();
        const clip = clipBasket[selectedClipIndex];
        if (clip) previewClip(clip, selectedClipIndex);
        return;
      }

      // I = set in-point (trim start to +2s)
      if (e.key === 'i' && selectedClipIndex !== null) {
        e.preventDefault();
        updateClipBasket(prev => prev.map((c, i) => i === selectedClipIndex ? { ...c, start: Math.min(c.start + 2, c.end - 1) } : c));
        return;
      }
      // O = set out-point (trim end to -2s)
      if (e.key === 'o' && selectedClipIndex !== null) {
        e.preventDefault();
        updateClipBasket(prev => prev.map((c, i) => i === selectedClipIndex ? { ...c, end: Math.max(c.end - 2, c.start + 1) } : c));
        return;
      }

      // J/K/L = playback control (standard NLE shortcuts)
      // J = seek backward 5s, K = pause/play toggle, L = seek forward 5s
      if (e.key === 'j' && !mod) {
        e.preventDefault();
        if (playerRef.current) {
          try { playerRef.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [Math.max(0, (playerRef.current._currentTime || 0) - 5), true] }), '*'); } catch(err) {}
        }
        return;
      }
      if (e.key === 'l' && !mod) {
        e.preventDefault();
        if (playerRef.current) {
          try { playerRef.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'seekTo', args: [(playerRef.current._currentTime || 0) + 5, true] }), '*'); } catch(err) {}
        }
        return;
      }
      if (e.key === 'k' && !mod) {
        e.preventDefault();
        if (playerRef.current) {
          try {
            // Toggle play/pause via YouTube iframe API postMessage
            playerRef.current.contentWindow.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo' }), '*');
          } catch(err) {}
        }
        return;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [videoId, clipBasket, selectedClipIndex, showSettingsDrawer, showShortcutOverlay]);

  // Drag-and-drop .chreel file import (desktop mode)
  useEffect(() => {
    if (isCloudMode) return;
    const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
    const handleDrop = async (e) => {
      e.preventDefault();
      const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.chreel') || f.name.endsWith('.json'));
      if (!file) return;
      try {
        const text = await file.text();
        const chreel = JSON.parse(text);
        if (!chreel.videoId || !chreel.clips) { addToast('Invalid .chreel file'); return; }
        setVideoId(chreel.videoId);
        if (chreel.videoTitle) setVideoTitle(chreel.videoTitle);
        const importedClips = chreel.clips.map((c, i) => ({
          start: c.start, end: c.end,
          label: c.label || c.highlight || `Clip ${i+1}`,
          highlight: c.highlight || c.label || '',
        }));
        updateClipBasket(() => importedClips);
        if (chreel.options) {
          if (chreel.options.resolution) setVideoOptions(prev => ({...prev, resolution: chreel.options.resolution}));
          if (chreel.options.colorFilter) setVideoOptions(prev => ({...prev, colorFilter: chreel.options.colorFilter}));
        }
        addToast(`Imported ${importedClips.length} clips from ${file.name}`);
      } catch (err) {
        addToast('Failed to read .chreel file: ' + err.message);
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    return () => { window.removeEventListener('dragover', handleDragOver); window.removeEventListener('drop', handleDrop); };
  }, [isCloudMode]);

  // Dismiss floating clip button on outside click
  useEffect(() => {
    const dismiss = (e) => {
      if (floatingClipBtn && !e.target.closest('.floating-clip-btn') && !e.target.closest('.desktop-transcript-panel')) {
        setFloatingClipBtn(null);
      }
    };
    document.addEventListener('mousedown', dismiss);
    return () => document.removeEventListener('mousedown', dismiss);
  }, [floatingClipBtn]);

  // Load optimization stats once on mount (no polling)
  useEffect(() => {
    apiOptimizationStats()
      .then(stats => setOptimizationStats(stats))
      .catch(() => {}); // Silently ignore — stats are optional
  }, []);

  // Import reel from URL params (?v=videoId&clips=start-end,start-end&titles=t1|t2)
  // Note: mode=play is handled in main.jsx (code-split ReelPlayer) — never reaches App
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Direct link to About page: ?page=about
    if (params.get('page') === 'about') {
      setShowAboutPage(true);
      window.history.replaceState({}, '', window.location.pathname);
    }
    const urlVid = params.get('v');
    const urlClips = params.get('clips');
    if (urlVid && urlClips) {
      const titles = (params.get('titles') || '').split('|');
      const clips = urlClips.split(',').map((seg, i) => {
        const [s, e] = seg.split('-').map(Number);
        if (isNaN(s) || isNaN(e)) return null;
        return { start: s, end: e, label: titles[i] || `Clip ${i + 1}`, highlight: titles[i] || '' };
      }).filter(Boolean);
      if (clips.length > 0) {
        setUrl(`https://www.youtube.com/watch?v=${urlVid}`);
        // Small delay to let the component mount, then load
        setTimeout(() => {
          setVideoId(urlVid);
          updateClipBasket(clips);
          addToast(`Loaded shared reel with ${clips.length} clips`);
        }, 500);
        // Clean URL params without reload
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);


  // Handle transcript file upload for videos without captions
  const handleTranscriptUpload = async (file) => {
    if (!videoId || !file) return;
    setShowTranscriptUpload(false);
    setProcessStatus({ active: true, message: "Uploading transcript...", percent: 15, isVideoDownload: false });
    try {
      const formData = new FormData();
      formData.append('video_id', videoId);
      formData.append('file', file);
      const resp = await fetch('/api/transcript/upload', { method: 'POST', body: formData });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || 'Upload failed');
      }
      const vttText = await resp.text();
      addToast(`Transcript uploaded successfully (${file.name})`);
      // Continue with normal transcript processing
      setVtt(vttText);
      const cc = parseVTT(vttText);
      setCues(cc);
      const ss = splitSentences(cc);
      setSents(ss);
      const all = ss.map(s => s.text).join(" ");
      setFullText(all);
      setLoading(l => ({ ...l, transcript: false }));
      // Cache for offline
      cacheTranscript(videoId, cc.map(c => ({ start: c.start, end: c.end, text: c.text })));
      // Continue loading word frequency and summary
      setProcessStatus({ active: true, message: "Analyzing transcript...", percent: 40, isVideoDownload: false });
      apiWordfreq(all).then(data => setWords(data.freq || [])).catch(() => {});
      apiSummaryAI(videoId, all, 'highlights_with_quotes').then(data => {
        const text = data.summary || '';
        if (!text || text.length < 20) {
          setSummary({ para: '', bullets: [] });
          setSummaryError(true);
        } else {
          setSummary({ para: text, bullets: data.bullets || [] });
          setSummaryError(false);
        }
        if (data.highlights_with_quotes) setHighlightsWithQuotes(data.highlights_with_quotes);
        setProcessStatus({ active: false, message: "", percent: 0 });
      }).catch(() => { setSummaryError(true); setProcessStatus({ active: false, message: "", percent: 0 }); });
    } catch (e) {
      addToast(`Transcript upload failed: ${e.message}`);
      setProcessStatus({ active: false, message: "", percent: 0 });
    }
  };

  const loadAll = async (overrideVideoId) => {
    // Guard: if called from onClick, the event object gets passed — ignore it
    const vid = (typeof overrideVideoId === 'string' && overrideVideoId) ? overrideVideoId : extractVideoId(url);
    setVideoId(vid);
    if (!vid) {
      alert("Please enter a valid YouTube URL or video ID");
      return;
    }

    // Scroll to top so user sees the progress bar and loading state
    window.scrollTo({ top: 0, behavior: 'smooth' });

    setVtt("");
    setCues([]);
    setSents([]);
    setFullText("");
    setSummary({ para: "", bullets: [], sentences: [] });
    setFullReport({ text: "", headline: "" });
    setWords([]);
    setEntities([]);
    setHighlightsWithQuotes([]);
    setMatches([]);
    setQuery("");
    setVideoTitle("");
    setClipThumbnails([]);

    // Fetch available video resolutions in background
    apiVideoFormats(vid).then(data => {
      if (data.formats) setAvailableFormats(data.formats);
    }).catch(() => {});
    setLoadingEntities(true);

    setProcessStatus({ active: true, message: "Loading transcript...", percent: 10, isVideoDownload: false });
    setStreamingSummaryText("loading"); // Show terminal animation early

    let vttText = "";
    try {
      setLoading(l => ({ ...l, transcript: true }));
      console.log(`[loadAll] Fetching transcript for ${vid}...`);
      vttText = await apiTranscript(vid);
      console.log(`[loadAll] Transcript received: ${vttText.length} chars`);

      setProcessStatus({ active: true, message: "Processing transcript...", percent: 30, isVideoDownload: false });
    } catch (e) {
      console.error(`[loadAll] Transcript fetch failed: ${e.message}`);
      // Try IndexedDB cache as offline fallback
      try {
        const cached = await getCachedTranscript(vid);
        if (cached && cached.transcript && cached.transcript.length > 0) {
          vttText = cached.transcript.map(s => `${s.start || 0}\n${s.text || ''}`).join('\n');
          setProcessStatus({ active: true, message: "Using cached transcript (offline)...", percent: 30, isVideoDownload: false });
          console.log('[loadAll] Using offline cached transcript');
        }
      } catch (cacheErr) {
        console.warn('[loadAll] Cache fallback also failed:', cacheErr);
      }

      if (!vttText) {
        setLoading(l => ({ ...l, transcript: false }));
        setProcessStatus({ active: false, message: "", percent: 0 });
        addToast(`Could not load captions: ${e.message || 'Unknown error'}. You can upload a transcript file instead.`);
        setShowTranscriptUpload(true);
        setLoadingEntities(false);
        return;
      }
    }





    setVtt(vttText);
    const cc = parseVTT(vttText);
    setCues(cc);
    const ss = splitSentences(cc);
    setSents(ss);
    const all = ss.map(s => s.text).join(" ");
    setFullText(all);
    setLoading(l => ({ ...l, transcript: false }));
    setProcessStatus({ active: true, message: "Generating word cloud...", percent: 50, isVideoDownload: false });

    // Cache transcript in IndexedDB for offline access
    cacheTranscript(vid, cc.map(c => ({ start: c.start, duration: c.end - c.start, text: c.text }))).catch(() => {});

    // Fire metadata, wordfreq, executive summary, and entity extraction in parallel
    const cleanTranscript = all.trim();
    setProcessStatus({ active: true, message: "AI is reading the transcript and generating your summary, word cloud, and entity analysis...", percent: 60, isVideoDownload: false });

    // Rotate progress messages while waiting for AI
    const progressMessages = [
      "AI is reading the full transcript...",
      "Identifying key topics and speakers...",
      "Extracting decisions and action items...",
      "Building word frequency analysis...",
      "Generating executive summary...",
      "Almost there — finalizing analysis...",
    ];
    let msgIdx = 0;
    const progressTimer = setInterval(() => {
      msgIdx = Math.min(msgIdx + 1, progressMessages.length - 1);
      setProcessStatus(prev => ({ ...prev, message: progressMessages[msgIdx], percent: Math.min(60 + msgIdx * 6, 90) }));
    }, 3000);

    // Show summary loading indicator
    setStreamingSummaryText("loading");

    const [metaResult, wfResult, summaryResult, analyticsResult] = await Promise.allSettled([
      apiMetadata(vid),
      apiWordfreq({ transcript: all }),
      cleanTranscript && cleanTranscript.length >= 10
        ? apiSummaryAI({
            transcript: cleanTranscript.slice(0, aiModel.startsWith('gemini') ? 100000 : 30000),
            segments: ss.slice(0, 3000).map(s => ({ start: s.start, text: s.text })),
            language: lang === "es" ? "es" : "en",
            model: aiModel,
            strategy: "executive",
            video_id: vid
          })
        : Promise.resolve(null),
      apiExtendedAnalytics({ transcript: all, model: aiModel, video_id: vid })
    ]);

    // Process metadata
    if (metaResult.status === 'fulfilled' && metaResult.value?.title) {
      setVideoTitle(metaResult.value.title);
    }

    // Process word frequency
    if (wfResult.status === 'fulfilled') {
      const wf = wfResult.value;
      const filtered = (wf.words || [])
        .filter(w => !civicStopwords.has(w.text.toLowerCase()) && w.text.length > 3)
        .slice(0, 80);
      setWords(filtered);
      const maxT = (cc[cc.length - 1]?.end || 0);
      const buckets = Math.max(20, Math.floor(maxT / 60));
      setHits(new Array(buckets).fill(0));
    }

    // Process executive summary (supports both plain text and timestamped array)
    if (summaryResult.status === 'fulfilled' && summaryResult.value) {
      const res = summaryResult.value;
      if (res.strategy === 'error' || res.error) {
        setSummary({ para: "", bullets: [], sentences: [] });
        setSummaryError(true);
      } else if (res.hasTimestamps && Array.isArray(res.summarySentences)) {
        // New format: array of {text, timestamp_seconds}
        const sentences = res.summarySentences.filter(s => s.text && s.text.length > 5);
        if (sentences.length > 0) {
          setSummary({ para: "", bullets: [], sentences });
          setSummaryError(false);
        } else {
          setSummary({ para: "", bullets: [], sentences: [] });
          setSummaryError(true);
        }
      } else {
        let summaryText = (typeof res.summarySentences === 'string' ? res.summarySentences : "") || "";
        // Try to parse JSON string that backend returned as plain text (truncation fallback)
        if (summaryText.trim().startsWith('{') || summaryText.trim().startsWith('[')) {
          try {
            const parsed = JSON.parse(summaryText);
            const sArr = parsed.sentences || (Array.isArray(parsed) ? parsed : []);
            const valid = sArr.filter(s => s && s.text && s.text.length > 10);
            if (valid.length > 0) {
              setSummary({ para: "", bullets: [], sentences: valid });
              setSummaryError(false);
              return; // handled via frontend JSON parse
            }
          } catch (e) {
            // Extract text values from partial JSON via regex
            const textMatches = [...summaryText.matchAll(/"text"\s*:\s*"([^"]+)"/g)].map(m => m[1]);
            if (textMatches.length >= 2) {
              summaryText = textMatches.join(' ');
            }
          }
        }
        summaryText = summaryText.replace(/^(Here's a concise|Here is your summary:)\s*/i, '');
        if (!summaryText || summaryText.length < 20) {
          setSummary({ para: "", bullets: [], sentences: [] });
          setSummaryError(true);
        } else {
          setSummary({ para: summaryText, bullets: [], sentences: [] });
          setSummaryError(false);
        }
      }
    } else if (summaryResult.status === 'rejected') {
      console.error("Summary API error:", summaryResult.reason);
      setSummary({ para: "", bullets: [], sentences: [] });
      setSummaryError(true);
    }
    setStreamingSummaryText(""); // Clear loading indicator

    // Process entity extraction
    if (analyticsResult.status === 'fulfilled') {
      setEntities(analyticsResult.value?.topEntities || []);
    } else {
      console.error("Analytics API error:", analyticsResult.reason);
      setEntities([]);
    }
    setLoadingEntities(false);

    clearInterval(progressTimer);
    setProcessStatus({ active: true, message: "Complete!", percent: 100, isVideoDownload: false });
    setTimeout(() => setProcessStatus({ active: false, message: "", percent: 0, isVideoDownload: false }), 2000);

  };

  const loadLiveVideo = async () => {
    const vid = extractVideoId(liveUrl);
    if (!vid) {
      alert("Please enter a valid live YouTube URL");
      return;
    }

    setVideoId(vid);
    setIsLiveMode(true);

    try {
      await apiStartLiveMonitoring({ videoId: vid });

      const ws = new WebSocket(getWebSocketUrl(`/ws/live`));

      ws.onopen = () => {
        console.log("✨ Live mode connected");
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'live_chat') {
          setLiveTranscript(prev => [...prev, {
            author: data.author,
            message: data.message,
            timestamp: data.timestamp
          }]);
        }

        const element = document.getElementById('live-transcript');
        if (element) {
          element.scrollTop = element.scrollHeight;
        }
      };

      ws.onclose = () => {
        console.log("✨ Live mode disconnected");
        setIsLiveMode(false);
      };

      setWsConnection(ws);

    } catch (error) {
      console.error("Failed to start live mode:", error);
      alert("Failed to start live monitoring. Make sure the video is live.");
    }
  };

  const stopLiveMode = async () => {
    if (wsConnection) {
      wsConnection.close();
    }
    try {
      await fetch("/api/live/stop", { method: "POST" });
    } catch (e) {
      console.error("Error stopping live mode:", e);
    }
    setIsLiveMode(false);
    setLiveTranscript([]);
    setLiveHighlights([]);
  };

  const generateSummary = async () => {
    if (!fullText) return;

    setLoading(l => ({ ...l, summary: true }));
    setProcessStatus({ active: true, message: "Generating AI summary...", percent: 70, isVideoDownload: false });

    try {
      const cleanTranscript = fullText.trim();

      if (!cleanTranscript || cleanTranscript.length < 10) {
        throw new Error("Transcript is empty or too short");
      }

      const res = await apiSummaryAI({
        transcript: cleanTranscript,
        language: lang === "es" ? "es" : "en",
        model: aiModel,
        strategy: "detailed",
        video_id: videoId  // ⚙️ NEW: For caching
      });

      let summaryText = "";
      if (res.summarySentences) {
        summaryText = res.summarySentences;
        summaryText = summaryText.replace(/^(Here's a detailed summary:|Here is your summary:)\s*/i, '');
      }

      setSummary({ para: summaryText, bullets: [] });
      setProcessStatus({ active: true, message: "Complete!", percent: 100, isVideoDownload: false });
      setTimeout(() => setProcessStatus({ active: false, message: "", percent: 0, isVideoDownload: false }), 2000);

    } catch (e) {
      console.error("Summary error:", e);
      const sentences = fullText.split('.').filter(s => s.trim().length > 30);
      const fallbackSummary = sentences.slice(0, 3).join('. ') + '.';
      setSummary({ para: fallbackSummary, bullets: [] });
    } finally {
      setLoading(l => ({ ...l, summary: false }));
    }
  };

  const generateFullReport = () => {
    if (!fullText) return;
    setLoadingReport(true);
    setStreamingReportText("");
    setFullReport({ text: "", headline: "" });

    streamSummaryAI(
      { transcript: fullText.trim(), language: lang === "es" ? "es" : "en", model: aiModel, strategy: "report", video_id: videoId },
      (chunk, fullSoFar) => { setStreamingReportText(fixEncoding(fullSoFar)); },
      (completeText) => {
        const cleaned = fixEncoding(completeText);
        let headline = "";
        let body = cleaned;
        if (cleaned.startsWith("HEADLINE:")) {
          const parts = cleaned.split("\n", 2);
          headline = parts[0].replace("HEADLINE:", "").trim();
          body = parts.length > 1 ? cleaned.slice(parts[0].length + 1).trim() : cleaned;
        }
        setFullReport({ text: body, headline });
        setStreamingReportText("");
        setLoadingReport(false);
      },
      (err) => {
        console.error("Full report streaming error:", err);
        addToast("Failed to generate full report. Try again.");
        setStreamingReportText("");
        setLoadingReport(false);
      }
    );
  };

  useEffect(() => {
    if (!debQuery) {
      setMatches([]);
      return;
    }
    const q = debQuery.toLowerCase();
    const mm = [];
    const seen = new Set();
    sents.forEach((s, idx) => {
      if (s.text.toLowerCase().includes(q)) {
        const key = s.start + "|" + s.text;
        if (!seen.has(key)) {
          mm.push({ idx, match: { idx, ...s }, ...s });
          seen.add(key);
        }
      }
    });
    setMatches(mm);

    if (cues.length && mm.length) {
      const maxT = (cues[cues.length - 1]?.end || 0);
      const buckets = Math.max(20, Math.floor(maxT / 60));
      const arr = new Array(buckets).fill(0);
      mm.forEach(m => {
        const bkt = Math.floor(m.start / (maxT / buckets));
        if (bkt >= 0 && bkt < buckets) arr[bkt]++;
      });
      setHits(arr);
    }
  }, [debQuery, sents, cues]);

  const jobWsRef = useRef(null);

  const handleJobUpdate = (status, isComplete) => {
    const currentPercent = status.percent || 0;
    setJob({
      id: status.jobId || '',
      percent: isComplete ? 100 : currentPercent,
      message: status.message || "",
      status: status.status || "running",
      zip: status.zip || status.file || null
    });
    // Capture logs and time estimate from job status
    if (status.logs && Array.isArray(status.logs)) {
      setJobLogs(status.logs);
    }
    if (status.estimated_seconds && !jobEstimate) {
      setJobEstimate(status.estimated_seconds);
    }
    if (!isComplete) {
      setProcessStatus(prev => ({ ...prev, percent: currentPercent, message: status.message || prev.message }));
    } else {
      setProcessStatus(prev => ({ ...prev, percent: 100, message: status.status === "done" ? "Complete! ✓" : "Error occurred" }));
      setLoading(l => ({ ...l, clips: false, reel: false }));
      if (status.status === "done") {
        const fileUrl = status.zip || status.file || status.output;
        if (fileUrl) setShowCelebration({ file: fileUrl });
      }
      setTimeout(() => {
        setProcessStatus({ active: false, message: "", percent: 0, estimatedTime: null, isVideoDownload: false });
        setJobLogs([]);
        setJobEstimate(null);
      }, status.status === "done" ? 2500 : 3500);
    }
  };

  const pollJobStatus = async (jid) => {
    if (!jid) return;

    // Cleanup previous
    if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
    if (jobWsRef.current) { try { jobWsRef.current.close(); } catch(e) {} }

    // Try WebSocket first
    let wsFailed = false;
    try {
      const ws = connectJobWebSocket(
        jid,
        (status) => handleJobUpdate(status, false),
        (status) => { handleJobUpdate(status, true); jobWsRef.current = null; },
        () => { wsFailed = true; startHttpPolling(jid); }
      );
      jobWsRef.current = ws;
      // If WS opens successfully, we're done — updates come via callbacks
      return;
    } catch (e) {
      console.log("WebSocket unavailable, falling back to HTTP polling");
    }

    startHttpPolling(jid);
  };

  const startHttpPolling = (jid) => {
    let pollInterval = 1000;
    let lastPercent = 0;

    const doPoll = async () => {
      try {
        const status = await apiJobStatus(jid);
        const isComplete = status.status === "done" || status.status === "error";
        const currentPercent = status.percent || 0;

        handleJobUpdate(status, isComplete);

        if (!isComplete) {
          if (currentPercent !== lastPercent) {
            pollInterval = 1000;
          } else {
            pollInterval = Math.min(pollInterval * 1.3, 5000);
          }
          lastPercent = currentPercent;
          pollIntervalRef.current = setTimeout(doPoll, pollInterval);
        } else {
          pollIntervalRef.current = null;
        }
      } catch (e) {
        console.error("Poll error:", e);
        pollInterval = Math.min(pollInterval * 2, 8000);
        pollIntervalRef.current = setTimeout(doPoll, pollInterval);
      }
    };
    pollIntervalRef.current = setTimeout(doPoll, pollInterval);
  };

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearTimeout(pollIntervalRef.current);
      if (jobWsRef.current) { try { jobWsRef.current.close(); } catch(e) {} }
    };
  }, []);

  const addToBasket = (clip) => {
    updateClipBasket(prev => [...prev, clip]);
  };

  const exportClips = async (format) => {
    setShowExportModal(false);

    if (clipBasket.length === 0) {
      alert("No clips in basket");
      return;
    }

    setLoading(l => ({ ...l, clips: true }));
    setProcessStatus({
      active: true,
      message: format === 'individual' ? "Creating individual clips..." :
        format === 'social' ? "Creating social media reel..." :
          format === 'titled' ? "Creating professional version..." :
            "Creating highlight reel...",
      percent: 0,
      isVideoDownload: true,
      estimatedTime: 5
    });

    try {
      const res = await apiRenderJob({
        videoId,
        clips: clipBasket,
        format: format,
        title: videoTitle || "Community Highlight Reel",
        captions: reelCaptionsEnabled,
        disableAllAdvanced: !reelCaptionsEnabled && !videoOptions.colorFilter && !videoOptions.transitions,
        colorFilter: videoOptions.colorFilter || 'none',
        transitions: videoOptions.transitionType === 'fade',
        normalizeAudio: videoOptions.normalizeAudio !== false,
        showHighlightLabels: videoOptions.showHighlightLabels !== false,
        lowerThirds: videoOptions.lowerThirds || false,
        resolution: videoOptions.resolution || '720p',
      });
      pollJobStatus(res.jobId);
    } catch (e) {
      alert("Failed to process clips: " + e.message);
      setLoading(l => ({ ...l, clips: false }));
      setProcessStatus({ active: false, message: "", percent: 0 });
    }
  };

  const clearBasket = () => {
    if (confirm("Clear all clips from basket?")) {
      updateClipBasket([]);
      setClipThumbnails([]);
      setSelectedClipIndex(null);
    }
  };

  // Timeline editor handlers (desktop mode)
  const handleClipDrop = (targetIdx) => {
    if (draggingClipIndex === null || draggingClipIndex === targetIdx) return;
    updateClipBasket(prev => {
      const clips = [...prev];
      const [moved] = clips.splice(draggingClipIndex, 1);
      clips.splice(targetIdx, 0, moved);
      return clips;
    });
    setDraggingClipIndex(null);
  };

  const startTrim = (e, clipIdx, edge) => {
    e.stopPropagation();
    e.preventDefault();
    const startX = e.clientX;
    const clip = clipBasket[clipIdx];
    const origVal = edge === 'start' ? clip.start : clip.end;

    const onMove = (moveE) => {
      const deltaX = moveE.clientX - startX;
      const deltaSec = deltaX / (timelineZoom * 10);
      setClipBasket(prev => {
        const clips = [...prev];
        const c = { ...clips[clipIdx] };
        if (edge === 'start') {
          c.start = Math.max(0, Math.min(origVal + deltaSec, c.end - 1));
        } else {
          c.end = Math.max(c.start + 1, origVal + deltaSec);
        }
        clips[clipIdx] = c;
        return clips;
      });
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const seekToClip = (clip, idx) => {
    if (playerRef.current) {
      playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(clip.start)}&autoplay=1&enablejsapi=1`;
      setSelectedClipIndex(idx ?? null);
    }
  };

  const previewClip = (clip, idx) => {
    if (!playerRef.current) return;
    // Clear any existing preview timer
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    // Seek to clip start and autoplay
    playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(clip.start)}&autoplay=1&enablejsapi=1`;
    setPreviewingClip({ idx, clip });
    setSelectedClipIndex(idx);
    // Auto-stop after clip duration
    const duration = (clip.end - clip.start) * 1000;
    previewTimerRef.current = setTimeout(() => {
      setPreviewingClip(null);
      // Pause by reloading without autoplay
      if (playerRef.current) {
        playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(clip.end)}&enablejsapi=1`;
      }
    }, duration);
    // Scroll player into view
    playerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const removeClipFromTimeline = (idx) => {
    updateClipBasket(prev => prev.filter((_, i) => i !== idx));
    if (selectedClipIndex === idx) setSelectedClipIndex(null);
  };

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // Match a quote against transcript segments (mirrors backend find_quote_timestamp)
  const findQuoteTimestamp = (quote, transcriptSegments) => {
    if (!quote || !transcriptSegments || !transcriptSegments.length) return null;
    const quoteWords = quote.toLowerCase().trim().split(/\s+/).slice(0, 8);
    const searchPhrase = quoteWords.join(' ');

    let bestTime = null, bestScore = 0;
    for (const seg of transcriptSegments) {
      const text = (seg.text || '').toLowerCase();
      const start = seg.start || 0;
      if (searchPhrase && text.includes(searchPhrase)) {
        return { start, end: start + (seg.duration || 15) };
      }
      if (quoteWords.slice(0, 4).every(w => text.includes(w))) {
        return { start, end: start + (seg.duration || 15) };
      }
      const matches = quoteWords.filter(w => text.includes(w)).length;
      if (matches > bestScore) { bestScore = matches; bestTime = start; }
    }
    if (bestTime !== null && bestScore >= 2) return { start: bestTime, end: bestTime + 15 };
    return null;
  };

  const buildReel = async (format = "combined", options = {}) => {
    if (!videoId) { alert("Please load a video first."); return; }
    const reelStyle = options.reelStyle || null;

    let currentHighlights = highlightsWithQuotes;

    // Auto-generate highlights if none exist, or if a specific reel style is requested
    if (currentHighlights.length === 0 || reelStyle) {
      setProcessStatus({ active: true, message: reelStyle ? `Generating ${reelStyle.replace('_', ' ')} highlights...` : "Generating AI highlights...", percent: 0 });
      setLoading(l => ({ ...l, reel: true }));

      try {
        const res = await apiSummaryAI({
          transcript: fullText.slice(0, 100000),
          language: lang === "es" ? "es" : "en",
          model: aiModel,
          strategy: "highlights_with_quotes",
          ...(reelStyle ? { reelStyle, forceRefresh: true } : {})
        });

        const text = res.summarySentences || "[]";
        let generated = [];
        try { generated = JSON.parse(text); } catch (e) {
          const bullets = text.split(/\d+\.|•|-/).filter(s => s.trim().length > 10);
          for (let i = 0; i < Math.min(10, bullets.length); i++) {
            generated.push({ highlight: bullets[i].trim().split('\n')[0], quote: '' });
          }
        }
        generated = generated.slice(0, 10);
        setHighlightsWithQuotes(generated);
        currentHighlights = generated;
      } catch (e) {
        console.error("Highlight generation error:", e);
        addToast(`Could not generate highlights: ${e.message || 'Unknown error'}. Try again.`);
        setProcessStatus({ active: false, message: "", percent: 0 });
        setLoading(l => ({ ...l, reel: false }));
        return;
      }
    }

    // Load clips into timeline for editing (both desktop and cloud)
    if (true) {
      const pad = videoOptions.clipPadding || 4;
      const clips = [];
      for (const h of currentHighlights) {
        const match = findQuoteTimestamp(h.quote || h.highlight, sents);
        if (match) {
          // Use AI highlight summary as chapter title — never raw transcript text
          const label = (h.highlight || h.summary || '').slice(0, 80) || `${h.speaker || 'Highlight'}: ${h.category || 'moment'}`;
          clips.push({
            start: Math.max(0, match.start - pad),
            end: match.end + pad,
            label,
            highlight: label,
            text: h.quote || '',
          });
        }
      }

      if (clips.length === 0) {
        // Fallback: distribute clips evenly across transcript
        const totalDuration = sents.length > 0 ? (sents[sents.length - 1].start || 0) + 15 : 300;
        const interval = totalDuration / 6;
        for (let i = 0; i < 5; i++) {
          const start = Math.floor(i * interval);
          clips.push({ start, end: start + 15, label: `Highlight ${i + 1}`, highlight: `Highlight ${i + 1}`, text: '' });
        }
      }

      // Select top 5 clips for timeline (user can add more from highlights panel)
      let selectedClips = clips;
      if (clips.length > 5) {
        const step = clips.length / 5;
        selectedClips = Array.from({ length: 5 }, (_, i) => clips[Math.floor(i * step)]);
      }

      updateClipBasket(selectedClips);
      setClipThumbnails([]);
      setProcessStatus({ active: false, message: "", percent: 0 });
      setLoading(l => ({ ...l, reel: false }));
      if (clips.length > 5) {
        addToast(`✨ Top 5 of ${clips.length} highlights loaded — add more from the Highlights panel below`);
      }

      // Visual feedback: scroll timeline into view and flash
      setTimeout(() => {
        const track = document.querySelector('.timeline-track');
        if (track) {
          track.scrollIntoView({ behavior: 'smooth', block: 'center' });
          track.classList.add('timeline-flash');
          setTimeout(() => track.classList.remove('timeline-flash'), 1500);
        }
      }, 100);

      // Auto-load thumbnails
      apiClipThumbnails({ videoId, clips: selectedClips })
        .then(data => { if (data.thumbnails) setClipThumbnails(data.thumbnails); })
        .catch(() => {});

      return;
    }

    // CLOUD MODE: Send directly to backend for rendering (existing behavior)
    setProcessStatus({
      active: true,
      message: format === 'social' ? "Building social media reel..." : "Building AI highlight reel...",
      percent: 0,
      estimatedTime: 8,
      isVideoDownload: true
    });
    setLoading(l => ({ ...l, reel: true }));

    try {
      const res = await apiHighlightReel({
        videoId,
        quotes: currentHighlights.map(h => h.quote),
        highlights: currentHighlights.map(h => h.highlight),
        speakers: currentHighlights.map(h => h.speaker || ''),
        transcript: sents,
        pad: videoOptions.clipPadding,
        format: format,
        captions: reelCaptionsEnabled,
        ...videoOptions
      });
      pollJobStatus(res.jobId);
    } catch (e) {
      setProcessStatus({ active: false, message: "", percent: 0 });
      setLoading(l => ({ ...l, reel: false }));
    }
  };

  const generateHighlightsWithQuotes = async (forceRefresh = false) => {
    if (!fullText) return;

    setProcessStatus({ active: true, message: forceRefresh ? "Regenerating fresh highlights..." : "Generating highlights with quotes...", percent: 0, isVideoDownload: false });
    setLoading(l => ({ ...l, summary: true }));

    try {
      const res = await apiSummaryAI({
        transcript: fullText.slice(0, 100000),
        language: lang === "es" ? "es" : "en",
        model: aiModel,
        strategy: "highlights_with_quotes",
        forceRefresh: forceRefresh  // NEW: bypass cache for fresh results
      });

      const text = res.summarySentences || "[]";
      let highlights = [];
      try {
        highlights = JSON.parse(text);
        console.log(`[Highlights] Received ${highlights.length} highlights from API`);
      } catch (e) {
        console.error("Failed to parse highlights JSON:", e);
        const bullets = text.split(/\d+\.|•|-/).filter(s => s.trim().length > 10);
        for (let i = 0; i < Math.min(10, bullets.length); i++) {
          highlights.push({
            highlight: bullets[i].trim().split('\n')[0],
            quote: 'Quote not found (fallback)'
          });
        }
      }

      // Only show highlights that were actually generated (backend handles 10-highlight generation)
      // Do NOT pad with placeholder text - if AI returned fewer, show fewer
      if (highlights.length === 0) {
        console.warn("[Highlights] No highlights returned from API");
      }

      const finalHighlights = highlights.slice(0, 10);
      setHighlightsWithQuotes(finalHighlights);

      // Also load top 5 highlights into the editor timeline
      if (finalHighlights.length > 0 && sents.length > 0) {
        const pad = videoOptions.clipPadding || 4;
        const clips = [];
        for (const h of finalHighlights.slice(0, 5)) {
          const match = findQuoteTimestamp(h.quote || h.highlight, sents);
          if (match) {
            const label = (h.highlight || h.summary || '').slice(0, 80) || 'Highlight';
            clips.push({
              start: Math.max(0, match.start - pad),
              end: match.end + pad,
              label,
              highlight: label,
              text: h.quote || '',
            });
          }
        }
        if (clips.length > 0) {
          updateClipBasket(clips);
          addToast(`${clips.length} highlights loaded into editor timeline`);
        }
      }

      setProcessStatus({ active: false, message: "", percent: 0 });
    } catch (e) {
      console.error("Highlights error:", e);
      setProcessStatus({ active: false, message: "", percent: 0 });
    } finally {
      setLoading(l => ({ ...l, summary: false }));
    }
  };

  // Open full transcript in Google Translate (free, no token cost, full text)
  const translateFullTranscriptBrowser = () => {
    if (!fullText) { addToast("Load a video first"); return; }
    const langCodes = { Spanish: 'es', French: 'fr', Portuguese: 'pt', Chinese: 'zh-CN', Japanese: 'ja', Korean: 'ko', German: 'de', Arabic: 'ar' };
    const tl = langCodes[translateLang] || 'es';
    // For short text, use the URL approach
    if (fullText.length <= 5000) {
      window.open(`https://translate.google.com/?sl=en&tl=${tl}&text=${encodeURIComponent(fullText)}&op=translate`, '_blank');
      return;
    }
    // For longer text: copy to clipboard and open Google Translate with instructions
    navigator.clipboard.writeText(fullText).then(() => {
      window.open(`https://translate.google.com/?sl=en&tl=${tl}&op=translate`, '_blank');
      addToast(`Full transcript (${Math.round(fullText.length / 1000)}K chars) copied to clipboard. Paste it into Google Translate in the new tab.`);
    }).catch(() => {
      // Fallback: open with first portion and notify
      const text = fullText.slice(0, 5000);
      window.open(`https://translate.google.com/?sl=en&tl=${tl}&text=${encodeURIComponent(text)}&op=translate`, '_blank');
      addToast(`Could not copy to clipboard. Opened first portion. Download the transcript file and upload to translate.google.com for the full text.`);
    });
  };

  const translateTranscript = async () => {
    if (!fullText) {
      addToast("Load a video first");
      return;
    }

    setLoading(l => ({ ...l, translate: true }));
    setProcessStatus({ active: true, message: `Translating to ${translateLang}...`, percent: 0, isVideoDownload: false });

    try {
      // For very long transcripts, suggest browser translation instead
      if (fullText.length > 30000) {
        const useBrowser = confirm(`This transcript is ${Math.round(fullText.length / 1000)}K characters. AI translation may be truncated.\n\nClick OK to open in Google Translate (free, full text)\nClick Cancel to use AI translation (may be partial)`);
        if (useBrowser) {
          translateFullTranscriptBrowser();
          setLoading(l => ({ ...l, translate: false }));
          setProcessStatus({ active: false, message: "", percent: 0 });
          return;
        }
      }

      const res = await apiTranslate({
        text: fullText,
        target_lang: translateLang,
        model: aiModel
      });

      setTranslation({
        text: res.translation,
        lang: translateLang,
        show: false
      });

      setProcessStatus({ active: false, message: "", percent: 0 });

      const choice = confirm(`Translation complete!\n\nClick OK to view on screen\nClick Cancel to download as file`);

      if (choice) {
        setTranslation(prev => ({ ...prev, show: true }));
      } else {
        const blob = new Blob([res.translation], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `transcript-${translateLang.toLowerCase()}.txt`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      alert(`Translation failed: ${e.message}`);
      setProcessStatus({ active: false, message: "", percent: 0 });
    } finally {
      setLoading(l => ({ ...l, translate: false }));
    }
  };

  const openExpandedAt = (match) => {
    if (match === undefined || match.idx === undefined) {
      console.error("Cannot open expanded view: invalid match object", match);
      return;
    }
    // Show the full transcript overlay in the word cloud area
    setShowFullTranscript(true);
    setExpanded({ open: true, focusIdx: match.idx });
    // Scroll the page to the transcript area first, then scroll within it
    setTimeout(() => {
      const searchZone = document.querySelector('.search-zone-left');
      if (searchZone) searchZone.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        if (transcriptRef.current) {
          const el = transcriptRef.current.querySelector(`#sent-${match.idx}`);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            // Highlight the focused sentence
            el.style.background = '#fef08a';
            el.style.borderRadius = '4px';
            el.style.transition = 'background 0.3s';
            setTimeout(() => { el.style.background = ''; }, 3000);
          }
        }
      }, 300);
    }, 100);
  };

  const saveSelectionAsClip = () => {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;

    const range = sel.getRangeAt(0);
    const container = transcriptRef.current;
    if (!container || !container.contains(range.commonAncestorContainer)) return;

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT,
      { acceptNode: (node) => node.classList.contains("sent") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP }
    );

    const sentNodes = [];
    let node;
    while (node = walker.nextNode()) {
      if (range.intersectsNode(node)) {
        sentNodes.push(node);
      }
    }

    if (!sentNodes.length) {
      alert("Please select some text first");
      return;
    }

    const idxs = sentNodes.map(n => parseInt(n.dataset.idx)).filter(i => !isNaN(i));
    const minIdx = Math.min(...idxs);
    const maxIdx = Math.max(...idxs);

    const start = sents[minIdx]?.start;
    const end = sents[maxIdx]?.end;

    if (start === undefined || end === undefined) return;

    const s = Math.max(0, Math.floor(start - pad));
    const e = Math.floor(end + pad);
    const label = sents.slice(minIdx, maxIdx + 1).map(s => s.text).join(" ").slice(0, 100);

    addToBasket({ start: s, end: e, label });
    window.getSelection().removeAllRanges();
  };

  // About page — full overlay
  if (showAboutPage) {
    return <AboutPage onClose={() => setShowAboutPage(false)} />;
  }

  return (
    <>
      {/* v5.7: Full-width Investigate Modal */}
      {investigateWord && (
        <div 
          className="investigate-modal-overlay"
          onClick={() => setInvestigateWord(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '16px',
              width: '95%',
              maxWidth: '1400px',
              maxHeight: '90vh',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '20px 24px',
              borderBottom: '2px solid #e2e8f0',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
            }}>
              <h2 style={{ margin: 0, color: 'white', fontSize: '24px' }}>
                🔍 Investigate: "{investigateWord.text}"
              </h2>
              <button 
                onClick={() => setInvestigateWord(null)}
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  border: 'none',
                  color: 'white',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '8px'
                }}
              >
                ✢
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex',
              gap: '8px',
              padding: '16px 24px',
              background: '#f8fafc',
              borderBottom: '1px solid #e2e8f0'
            }}>
              <button
                onClick={() => setInvestigateViewMode('news')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  background: investigateViewMode === 'news' ? '#667eea' : '#e2e8f0',
                  color: investigateViewMode === 'news' ? 'white' : '#64748b'
                }}
              >
                🌐 Google News
              </button>
              <button
                onClick={() => setInvestigateViewMode('maps')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  background: investigateViewMode === 'maps' ? '#667eea' : '#e2e8f0',
                  color: investigateViewMode === 'maps' ? 'white' : '#64748b'
                }}
              >
                📍 Google Maps
              </button>
              <button
                onClick={() => setInvestigateViewMode('wikipedia')}
                style={{
                  padding: '12px 24px',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '15px',
                  fontWeight: '600',
                  background: investigateViewMode === 'wikipedia' ? '#667eea' : '#e2e8f0',
                  color: investigateViewMode === 'wikipedia' ? 'white' : '#64748b'
                }}
              >
                🔖 Wikipedia
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, minHeight: '500px' }}>
              {investigateViewMode === 'news' && (
                <iframe
                  src={`https://www.google.com/search?q=${encodeURIComponent(investigateWord.text)}&tbm=nws&igu=1`}
                  title={`News - ${investigateWord.text}`}
                  style={{ width: '100%', height: '500px', border: 'none' }}
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
              )}
              {investigateViewMode === 'maps' && (
                <iframe
                  src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(investigateWord.text)}`}
                  title={`Map - ${investigateWord.text}`}
                  style={{ width: '100%', height: '500px', border: 'none' }}
                  allow="geolocation"
                />
              )}
              {investigateViewMode === 'wikipedia' && (
                <iframe
                  src={`https://en.wikipedia.org/wiki/${encodeURIComponent(investigateWord.text)}`}
                  title={`Wikipedia - ${investigateWord.text}`}
                  style={{ width: '100%', height: '500px', border: 'none' }}
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px',
              padding: '16px 24px',
              borderTop: '1px solid #e2e8f0',
              background: '#f8fafc'
            }}>
              <a
                href={
                  investigateViewMode === 'maps'
                    ? `https://www.google.com/maps/search/${encodeURIComponent(investigateWord.text)}`
                    : investigateViewMode === 'news'
                      ? `https://www.google.com/search?q=${encodeURIComponent(investigateWord.text)}&tbm=nws`
                      : `https://en.wikipedia.org/wiki/${encodeURIComponent(investigateWord.text)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                style={{ textDecoration: 'none' }}
              >
                Open in New Tab ↗️
              </a>
              <button 
                className="btn btn-ghost" 
                onClick={() => setInvestigateWord(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cloud CTA banner — top of page */}
      {isCloudMode && !videoId && (
        <div className="cloud-cta-banner">
          For the best experience, including downloading video straight from YouTube, get the free Desktop app.
          <a href="#why-desktop" onClick={(e) => { e.preventDefault(); document.getElementById('why-desktop')?.scrollIntoView({ behavior: 'smooth' }); }}>
            Learn more below
          </a>
        </div>
      )}

      <a href="#main-content" className="skip-to-content" style={{
        position: 'absolute', left: '-9999px', top: 'auto', width: '1px', height: '1px', overflow: 'hidden',
        zIndex: 10000, background: '#166534', color: '#fff', padding: '8px 16px', fontSize: '14px',
        textDecoration: 'none', borderRadius: '0 0 4px 0',
      }} onFocus={e => { e.target.style.position = 'fixed'; e.target.style.left = '0'; e.target.style.top = '0'; e.target.style.width = 'auto'; e.target.style.height = 'auto'; }}
      onBlur={e => { e.target.style.position = 'absolute'; e.target.style.left = '-9999px'; e.target.style.width = '1px'; e.target.style.height = '1px'; }}
      >Skip to main content</a>
      <header className="animate-fadeIn" role="banner">
        <div className="container">
          <div className="wrap">
            <div className="brand">
              <img src="/logo.png" alt="Community Highlighter" className="logo-main" style={{ cursor: 'pointer' }} onClick={() => { window.location.href = window.location.pathname; }} />
              <div className="subtitle-large">{t.appSubtitle}</div>
              <button onClick={() => setShowAboutPage(true)} style={{
                background: 'none', border: '2px solid #1e7f63', color: '#1e7f63', fontSize: '15px',
                fontWeight: 700, cursor: 'pointer', padding: '10px 24px', borderRadius: '10px',
                letterSpacing: '-0.2px', transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#1e7f63'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#1e7f63'; }}
              >About</button>
            </div>
            <div className="right">
              {/* Dev toggle — only on localhost */}
              {window.location.hostname === 'localhost' && (
                <button
                  onClick={() => {
                    const newMode = !isCloudMode;
                    localStorage.setItem('dev_cloud_override', String(newMode));
                    fetch('/api/dev/toggle-cloud', { method: 'POST' }).catch(() => {});
                    addToast(`Switched to ${newMode ? 'Cloud' : 'Desktop'} mode — reloading...`);
                    setTimeout(() => window.location.reload(), 500);
                  }}
                  style={{ padding: '3px 8px', fontSize: '9px', fontWeight: 600, background: isCloudMode ? '#0ea5e9' : '#94a3b8', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', letterSpacing: '0.03em', textTransform: 'uppercase' }}
                  title="Toggle between cloud and desktop mode for testing"
                >
                  {isCloudMode ? 'CLOUD' : 'DESKTOP'} mode
                </button>
              )}
              <div className="lang-selector">
                <select value={lang} onChange={e => setLang(e.target.value)} className="select-input" aria-label="Language">
                  <option value="en">English</option>
                </select>
              </div>
              <div className="powered-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <a href="https://brooklineinteractive.org" target="_blank" rel="noopener noreferrer">
                  <img src="/secondary.png" alt="Brookline Interactive Group" className="secondary-logo-large" />
                </a>
                <a href="https://weirdmachine.org" target="_blank" rel="noopener noreferrer">
                  <img src="/weirdmachine.png" alt="Weird Machine" style={{ height: '28px', opacity: 0.85 }} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </header>
      {videoId && <div className="subtitle-mobile">{t.appSubtitle}</div>}

      <main id="main-content" className={`container ${videoId ? 'desktop-editor-mode' : ''}`} style={{ paddingTop: 32, paddingBottom: 100 }}>
        {processStatus.active && (
          <ProgressIndicator
            status="active"
            percent={processStatus.percent}
            message={processStatus.message}
            estimatedTime={processStatus.estimatedTime}
            isVideoDownload={processStatus.isVideoDownload}
            logs={jobLogs}
            estimatedSeconds={jobEstimate}
          />
        )}

        {showExportModal && (
          <ExportModal
            onSelect={exportClips}
            onClose={() => setShowExportModal(false)}
            clipCount={clipBasket.length}
          />
        )}

        {showCelebration && (
          <CelebrationModal
            fileUrl={showCelebration.file}
            onClose={() => setShowCelebration(null)}
            onDownload={addDownload}
          />
        )}

        <section className="card section animate-fadeIn">
          {/* Animated tagline — cycles through app capabilities */}
          {!videoId && <AnimatedTagline />}

          {/* Section previews at top of landing page */}
          {!videoId && <SectionPreviews />}

          <div className={!videoId ? 'url-input-hero' : ''} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: videoId ? '0' : '20px' }}>
            <input
              className="input url-input"
              placeholder="To Get Started, Paste a Youtube URL Here."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadAll()}
              aria-label="YouTube video URL"
              style={{ flex: 1, minWidth: 300 }}
            />

            {/* LIVE TRANSCRIPT AND HIGHLIGHTS - ADD THIS AFTER THE LIVE INPUT */}
            {isLiveMode && videoId && (
              <div className="live-content" style={{
                marginTop: '20px',
                padding: '20px',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px',
                border: '2px solid #ff4444'
              }}>
                <h3 style={{ color: '#ff4444', marginBottom: '15px' }}>
                  ✨ LIVE MODE - Real-time Updates
                </h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                  <div>
                    <h4>Real-time Transcript</h4>
                    <div
                      id="live-transcript"
                      style={{
                        height: '300px',
                        overflowY: 'auto',
                        backgroundColor: 'white',
                        padding: '10px',
                        borderRadius: '4px',
                        border: '1px solid #ddd'
                      }}
                    >
                      {liveTranscript.length === 0 ? (
                        <p style={{ color: '#999' }}>Waiting for live content...</p>
                      ) : (
                        liveTranscript.map((entry, idx) => (
                          <div key={idx} style={{ marginBottom: '10px' }}>
                            <strong>{entry.author}:</strong> {entry.message}
                            <span style={{ fontSize: '12px', color: '#666', marginLeft: '10px' }}>
                              {entry.timestamp}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <h4>Live Highlights</h4>
                    <div style={{
                      height: '300px',
                      overflowY: 'auto',
                      backgroundColor: 'white',
                      padding: '10px',
                      borderRadius: '4px',
                      border: '1px solid #ddd'
                    }}>
                      {liveHighlights.length === 0 ? (
                        <p style={{ color: '#999' }}>Highlights will appear here...</p>
                      ) : (
                        liveHighlights.map((highlight, idx) => (
                          <div key={idx} style={{
                            marginBottom: '10px',
                            padding: '10px',
                            backgroundColor: '#fff3cd',
                            borderRadius: '4px'
                          }}>
                            {highlight.text}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <button
              className="btn btn-primary animate-hover"
              onClick={loadAll}
              disabled={loading.transcript}
            >
              {loading.transcript ? "Loading..." : t.loadVideo}
            </button>
            {!videoId && (
              <select
                value={aiModel}
                onChange={e => setAiModel(e.target.value)}
                className="select-input"
                style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid #cbd5e1', color: '#334155', minWidth: 160 }}
                title="Choose AI model before loading"
              >
                <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                <option value="gpt-4o">GPT-4o</option>
                <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                <option value="gpt-5.1">GPT-5.1 (Deep Analysis)</option>
              </select>
            )}
            {videoId && (
              <>
                <div style={{ fontSize: 12, color: "#64748b" }}>{t.padding}:</div>
                <select
                  value={pad}
                  onChange={e => setPad(+e.target.value)}
                  className="select-input"
                >
                  <option value={1}>1s</option>
                  <option value={2}>2s</option>
                  <option value={3}>3s</option>
                  <option value={5}>5s</option>
                </select>
                <div style={{ fontSize: 12, color: "#64748b" }}>{t.selectModel}</div>
                <select
                  value={aiModel}
                  onChange={e => setAiModel(e.target.value)}
                  className="select-input"
                >
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommended)</option>
                  <option value="gpt-4o">GPT-4o</option>
                  <option value="gpt-4o-mini">GPT-4o Mini (Faster)</option>
                  <option value="gpt-5.1">GPT-5.1 (Deep Analysis)</option>
                  <option value="gpt-5.1-chat-latest">GPT-5.1 Instant</option>
                </select>
              </>
            )}
          </div>
          {!videoId && (
            <>
              <div style={{ margin: '20px 0 12px', textAlign: 'center', fontSize: '14px', color: '#475569', fontWeight: 500 }}>
                Don't have the link? Use our AI search tool to find the most recent civic meetings near you.
              </div>
              <CivicMeetingFinder
                onSelectVideo={(selectedUrl) => {
                  setUrl(selectedUrl);
                  const input = document.querySelector('.url-input');
                  if (input) input.value = selectedUrl;
                  setTimeout(() => {
                    const vid = selectedUrl.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
                    if (vid) {
                      setVideoId(vid);
                      const loadBtn = document.querySelector('.btn-primary');
                      if (loadBtn && loadBtn.textContent.includes('Load')) loadBtn.click();
                      else loadAll();
                    }
                  }, 150);
                }}
              />
              <div style={{ fontSize: '13px', color: '#475569', marginTop: '14px', lineHeight: '1.6', background: '#f8fafc', padding: '10px 14px', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                Tip: This app works best with YouTube videos that have captions or closed captioning enabled. No captions? You can upload your own transcript file (.vtt, .srt, or .txt).{' '}
                <a href="?page=about" onClick={(e) => { e.preventDefault(); setShowAboutPage(true); }} style={{ color: '#1e7f63', fontWeight: 600, textDecoration: 'underline' }}>
                  Learn more about how Community Highlighter works
                </a>
              </div>
            </>
          )}
        </section>

        {/* Transcript Upload Prompt — shown when video has no captions */}
        {showTranscriptUpload && videoId && (
          <section className="card section animate-fadeIn" style={{ marginTop: 16 }}>
            <div className="transcript-upload-prompt">
              <h4>This video doesn't have captions</h4>
              <p>
                You can upload your own transcript file to analyze this meeting. Supported formats: .vtt (WebVTT), .srt (SubRip), or .txt (plain text).
              </p>
              <label>
                Upload Transcript File
                <input
                  type="file"
                  accept=".vtt,.srt,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleTranscriptUpload(file);
                    e.target.value = '';
                  }}
                />
              </label>
              <div style={{ marginTop: 10, fontSize: 12, color: '#92400e' }}>
                Tip: Many meeting services (Zoom, Teams, etc.) can export transcripts as .vtt or .srt files.
              </div>
            </div>
          </section>
        )}

        {/* Civic Meeting Finder now merged into main input section above */}

        {/* .chreel Import Zone — desktop landing page, below civic meetings */}
        {!videoId && !isCloudMode && (
          <section className="card section animate-fadeIn" style={{
            marginTop: 16,
            background: 'linear-gradient(135deg, #0f1419 0%, #1a2332 100%)',
            color: 'white',
            border: '2px dashed #334155',
            borderRadius: '16px',
            padding: '24px 28px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
          }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#22c55e'; e.currentTarget.style.background = 'linear-gradient(135deg, #0f1419 0%, #0d2818 100%)'; }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.background = 'linear-gradient(135deg, #0f1419 0%, #1a2332 100%)'; }}
          onDrop={async (e) => {
            e.preventDefault();
            e.currentTarget.style.borderColor = '#334155';
            e.currentTarget.style.background = 'linear-gradient(135deg, #0f1419 0%, #1a2332 100%)';
            const file = Array.from(e.dataTransfer.files).find(f => f.name.endsWith('.chreel') || f.name.endsWith('.json'));
            if (!file) { addToast('Drop a .chreel file to import'); return; }
            try {
              const text = await file.text();
              const chreel = JSON.parse(text);
              if (!chreel.videoId || !chreel.clips) { addToast('Invalid .chreel file'); return; }
              setUrl(`https://www.youtube.com/watch?v=${chreel.videoId}`);
              setVideoId(chreel.videoId);
              if (chreel.videoTitle) setVideoTitle(chreel.videoTitle);
              const importedClips = chreel.clips.map((c, i) => ({
                start: c.start, end: c.end,
                label: c.label || c.highlight || `Clip ${i+1}`,
                highlight: c.highlight || c.label || '',
              }));
              updateClipBasket(() => importedClips);
              if (chreel.options) {
                if (chreel.options.resolution) setVideoOptions(prev => ({...prev, resolution: chreel.options.resolution}));
                if (chreel.options.colorFilter) setVideoOptions(prev => ({...prev, colorFilter: chreel.options.colorFilter}));
              }
              addToast(`Imported ${importedClips.length} clips from ${file.name} — loading video...`);
              setTimeout(() => loadAll(chreel.videoId), 300);
            } catch (err) {
              addToast('Failed to read .chreel file: ' + err.message);
            }
          }}
          onClick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.chreel,.json';
            input.onchange = async (ev) => {
              const file = ev.target.files[0];
              if (!file) return;
              try {
                const text = await file.text();
                const chreel = JSON.parse(text);
                if (!chreel.videoId || !chreel.clips) { addToast('Invalid .chreel file'); return; }
                setUrl(`https://www.youtube.com/watch?v=${chreel.videoId}`);
                setVideoId(chreel.videoId);
                if (chreel.videoTitle) setVideoTitle(chreel.videoTitle);
                const importedClips = chreel.clips.map((c, i) => ({
                  start: c.start, end: c.end,
                  label: c.label || c.highlight || `Clip ${i+1}`,
                  highlight: c.highlight || c.label || '',
                }));
                updateClipBasket(() => importedClips);
                if (chreel.options) {
                  if (chreel.options.resolution) setVideoOptions(prev => ({...prev, resolution: chreel.options.resolution}));
                  if (chreel.options.colorFilter) setVideoOptions(prev => ({...prev, colorFilter: chreel.options.colorFilter}));
                }
                addToast(`Imported ${importedClips.length} clips from ${file.name} — loading video...`);
                setTimeout(() => loadAll(), 500);
              } catch (err) {
                addToast('Failed to read .chreel file: ' + err.message);
              }
            };
            input.click();
          }}>
            <div style={{ fontSize: '32px', marginBottom: 8 }}>📂</div>
            <h3 style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 700, color: '#e2e8f0' }}>
              Import .chreel Reel Plan
            </h3>
            <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
              Drop a .chreel file here, or click to browse.
              <br />
              <span style={{ color: '#64748b', fontSize: '11px' }}>Exported from the cloud app's "Render in Desktop App" button</span>
            </p>
          </section>
        )}

        {/* Why Desktop App — cloud mode only, below Civic Meeting Finder */}
        {!videoId && isCloudMode && (
          <section id="why-desktop" className="card section animate-fadeIn" style={{
            marginTop: 16,
            background: 'linear-gradient(135deg, #1e7f63 0%, #145c47 50%, #0f4435 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '16px',
            padding: '28px 32px',
            boxShadow: '0 4px 24px rgba(30, 127, 99, 0.25)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ flex: 1, minWidth: '280px' }}>
                <h3 style={{ margin: '0 0 10px 0', fontSize: '20px', fontWeight: 700 }}>
                  What are the advantages of the desktop version?
                </h3>
                <p style={{ margin: '0 0 12px 0', fontSize: '14px', color: 'rgba(255,255,255,0.85)', maxWidth: '560px', lineHeight: '1.5' }}>
                  YouTube blocks video downloads from cloud server IP addresses (like the ones hosting this web app).
                  The desktop app runs on <strong style={{ color: '#86efac' }}>your computer</strong>, so downloads work without restrictions and your videos stay private.
                </p>
                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: 'rgba(255,255,255,0.75)', maxWidth: '560px', lineHeight: '1.5' }}>
                  However, we've still got some tricks up our sleeves, including the ability to share edited reels without downloading anything, and some others we'd rather not share{' '}
                  <a href="#" onClick={(e) => { e.preventDefault(); setShowAboutPage(true); }} style={{ color: '#86efac', fontWeight: 600, textDecoration: 'underline' }}>right on the homepage</a>.
                </p>
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>
                  <div>
                    <div style={{ fontWeight: 600, color: '#86efac', marginBottom: '4px' }}>What you can do here</div>
                    <div>AI analysis & summaries</div>
                    <div>Search transcripts & word clouds</div>
                    <div>Build & preview clip timelines</div>
                    <div>Share interactive reel links</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#fbbf24', marginBottom: '4px' }}>Requires desktop app</div>
                    <div>Download full videos (MP4)</div>
                    <div>Render highlight reels</div>
                    <div>Export clips with effects</div>
                    <div>Captions, transitions, color grades</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <a href="https://github.com/amateurmenace/community-highlighter/releases/latest" target="_blank" rel="noopener noreferrer"
                  style={{ padding: '12px 24px', background: 'white', color: '#1e7f63', borderRadius: '10px', textDecoration: 'none', fontWeight: 700, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap' }}>
                  Download for macOS
                </a>
                <a href="https://github.com/amateurmenace/community-highlighter/releases/latest" target="_blank" rel="noopener noreferrer"
                  style={{ padding: '12px 24px', background: 'rgba(255,255,255,0.15)', color: 'white', borderRadius: '10px', textDecoration: 'none', fontWeight: 600, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px', border: '1.5px solid rgba(255,255,255,0.3)', whiteSpace: 'nowrap' }}>
                  Download for Windows
                </a>
              </div>
            </div>
          </section>
        )}

        {/* Batch Processing — queue multiple videos */}
        {!videoId && (
          <section className="card section animate-fadeIn" style={{ marginTop: 16 }}>
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, fontSize: '1.05em' }}>
                Batch Process Multiple Videos
              </summary>
              <div style={{ marginTop: 12 }}>
                <p style={{ fontSize: '0.9em', color: '#666', marginBottom: 8 }}>
                  Paste multiple YouTube URLs (one per line) to fetch transcripts in bulk.
                </p>
                <textarea
                  id="batch-urls"
                  rows={4}
                  placeholder={"https://youtube.com/watch?v=abc123\nhttps://youtube.com/watch?v=def456\nhttps://youtube.com/watch?v=ghi789"}
                  style={{ width: '100%', fontFamily: 'monospace', fontSize: '0.9em', padding: 8, borderRadius: 6, border: '1px solid #ddd', resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                  <button className="btn btn-primary" onClick={async () => {
                    const textarea = document.getElementById('batch-urls');
                    const urls = textarea.value.split('\n').map(u => u.trim()).filter(u => u);
                    if (urls.length === 0) { addToast('Enter at least one URL'); return; }
                    if (urls.length > 20) { addToast('Maximum 20 URLs at once'); return; }
                    addToast(`Queuing ${urls.length} videos for processing...`);
                    try {
                      const res = await fetch(`${BACKEND_URL}/api/batch/queue`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ urls, analyze: true })
                      });
                      const data = await res.json();
                      if (data.error) { addToast(data.error); return; }
                      addToast(`Batch started: ${data.videoCount} videos queued (ID: ${data.batchId})`);
                      // Poll for completion
                      const pollBatch = setInterval(async () => {
                        try {
                          const sr = await fetch(`${BACKEND_URL}/api/batch/${data.batchId}`);
                          const sd = await sr.json();
                          const done = sd.videos?.filter(v => v.status === 'done').length || 0;
                          const total = sd.videos?.length || 0;
                          if (sd.status === 'done') {
                            clearInterval(pollBatch);
                            const errors = sd.videos?.filter(v => v.status === 'error').length || 0;
                            addToast(`Batch complete: ${done} succeeded, ${errors} failed`);
                          }
                        } catch(e) {}
                      }, 3000);
                    } catch (err) {
                      addToast('Batch request failed: ' + err.message);
                    }
                  }}>
                    Process Batch
                  </button>
                  <span style={{ fontSize: '0.85em', color: '#999' }}>Max 20 videos at once</span>
                </div>
              </div>
            </details>
          </section>
        )}

        {/* Section Navigation Bar */}
        {videoId && fullText && (
          <div className="section-nav-bar" style={{
            display: 'flex', justifyContent: 'center', gap: 8, padding: '16px 0 8px',
          }}>
            {[
              { label: 'Highlight', sub: 'Search & discover key moments', ref: sectionHighlightRef, iconChar: '\u2315' },
              { label: 'Edit', sub: 'Build & export highlight reels', ref: sectionEditRef, iconChar: '\u25B6' },
              { label: 'Analyze', sub: 'Entities, topics & trends', ref: sectionAnalyzeRef, iconChar: '\u2261' },
            ].map((s, i) => (
              <button key={s.label} onClick={() => s.ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="section-nav-btn"
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 20px', border: '1.5px solid #e2e8f0', borderRadius: 10,
                  background: '#fff', cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)',
                  opacity: 0, animation: `slideUp 0.5s ease-out ${i * 0.12}s forwards`,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#1e7f63'; e.currentTarget.style.transform = 'translateY(-3px) scale(1.02)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(30,127,99,0.12)'; e.currentTarget.style.background = '#f0fdf4'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.transform = 'translateY(0) scale(1)'; e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = '#fff'; }}
              >
                <span style={{ color: '#1e7f63', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, background: '#f0fdf4', flexShrink: 0 }}>{s.iconChar}</span>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', letterSpacing: '0.01em' }}>{s.label}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.2 }}>{s.sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Section 1: Meeting Highlighter — above AI summary */}
        {videoId && (
          <div className="section-divider" ref={sectionHighlightRef}>
            <div className="section-divider-line" />
            <div className="section-divider-title">
              Meeting Highlighter
            </div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
              Search the transcript, explore the word cloud, and let AI surface the most important moments with direct quotes.
            </div>
          </div>
        )}

        {/* AI Summary — error state */}
        {summaryError && !summary.para && videoId && (
          <section className="card section animate-slideUp" style={{ marginTop: 16, padding: '20px 24px', background: '#fffbeb', border: '2px solid #f59e0b' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#92400e', marginBottom: 4 }}>AI Summary could not be generated</div>
                <div style={{ fontSize: 13, color: '#78350f' }}>The AI was unable to produce a reliable summary for this meeting. This can happen with very long or unusually formatted transcripts.</div>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => { setSummaryError(false); generateHighlightsWithQuotes(true); }}
                disabled={loading.summary}
                style={{ whiteSpace: 'nowrap' }}
              >
                {loading.summary ? 'Generating...' : 'Try Again'}
              </button>
            </div>
          </section>
        )}

        {/* AI Summary */}
        {(summary.para || (summary.sentences && summary.sentences.length > 0) || streamingSummaryText) && (
          <section className="card section summary-card animate-slideUp" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                <span className="summary-title-permanent">{t.aiSummary}</span>
              </div>
              <button
                className="btn btn-secondary animate-hover"
                onClick={() => generateHighlightsWithQuotes(false)}
                disabled={loading.summary}
              >
                {t.summarizeAI}
              </button>
              {highlightsWithQuotes.length > 0 && (
                <button
                  className="btn btn-secondary animate-hover"
                  onClick={() => generateHighlightsWithQuotes(true)}
                  disabled={loading.summary}
                  title="Get fresh results (bypass cache)"
                  style={{ marginLeft: '8px', background: '#f59e0b', borderColor: '#f59e0b' }}
                >
                  🔄 Refresh
                </button>
              )}
            </div>
            {/* Animated AI terminal — simulated typing while summary generates */}
            {streamingSummaryText === "loading" && !summary.para && !(summary.sentences && summary.sentences.length > 0) && (
              <SummaryLoadingTerminal />
            )}
            {/* Streaming text — shows words appearing in real-time (for Full Report) */}
            {streamingSummaryText && streamingSummaryText !== "loading" && !summary.para && !(summary.sentences && summary.sentences.length > 0) && (
              <div style={{ margin: "8px 0", lineHeight: 1.7, fontSize: 15, color: "#334155" }}>
                {streamingSummaryText}
                <span className="streaming-cursor" />
              </div>
            )}
            {/* Executive brief — with clickable timestamps when available */}
            {summary.sentences && summary.sentences.length > 0 ? (
              <div style={{ margin: "8px 0", lineHeight: 1.7, fontSize: 15, color: "#334155" }}>
                {summary.sentences.map((s, i) => (
                  <span key={i}>
                    {s.timestamp_seconds != null && (
                      <button
                        onClick={() => jumpToTimestamp(s.timestamp_seconds)}
                        className="timestamp-pill"
                        title={`Jump to ${Math.floor(s.timestamp_seconds / 60)}:${String(Math.floor(s.timestamp_seconds % 60)).padStart(2, '0')} — opens video + transcript`}
                      >
                        {Math.floor(s.timestamp_seconds / 60)}:{String(Math.floor(s.timestamp_seconds % 60)).padStart(2, '0')}
                      </button>
                    )}
                    {s.text}{' '}
                  </span>
                ))}
              </div>
            ) : summary.para ? (
              <p style={{ margin: "8px 0", lineHeight: 1.7, fontSize: 15, color: "#334155" }}>
                {summary.para}
              </p>
            ) : null}

            {/* Generate Full Report button + streaming + collapsible report display */}
            {!fullReport.text ? (
              <>
                <button
                  onClick={generateFullReport}
                  disabled={loadingReport}
                  style={{
                    margin: '12px 0 4px',
                    padding: '8px 18px',
                    background: loadingReport ? '#94a3b8' : '#1e7f63',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: loadingReport ? 'not-allowed' : 'pointer',
                    transition: 'background 0.2s'
                  }}
                >
                  {loadingReport ? 'Generating report...' : 'Generate Full Report'}
                </button>
                {streamingReportText && (
                  <div style={{ marginTop: 12, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: '16px 20px', fontSize: 14, lineHeight: 1.8, color: '#334155', maxHeight: 400, overflowY: 'auto' }}>
                    {streamingReportText.split('\n').map((line, i) => {
                      if (line.startsWith('**') && line.endsWith('**')) return <h4 key={i} style={{ margin: '16px 0 8px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{renderLineWithTimestamps(line.replace(/\*\*/g, ''))}</h4>;
                      if (line.trim()) return <p key={i} style={{ margin: '0 0 10px' }}>{renderLineWithTimestamps(line)}</p>;
                      return null;
                    })}
                    <span className="shimmer-block" style={{ display: 'inline-block', width: 12, height: 16, verticalAlign: 'middle', borderRadius: 2 }} />
                  </div>
                )}
              </>
            ) : (
              <div style={{ marginTop: 16, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: reportCollapsed ? 'none' : '1px solid #e2e8f0', cursor: 'pointer' }}
                  onClick={() => setReportCollapsed(p => !p)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'inline-block', fontSize: 12, color: '#64748b', transform: reportCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>{'\u25BC'}</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>{fullReport.headline || 'Full Report'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      const u = new URL(window.location);
                      u.searchParams.set('mode', 'report');
                      u.searchParams.set('v', videoId);
                      navigator.clipboard.writeText(u.toString());
                      addToast('Report link copied!');
                    }} style={{ padding: '4px 10px', background: '#1e7f63', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      Share
                    </button>
                    <button onClick={(e) => {
                      e.stopPropagation();
                      const content = '# ' + (fullReport.headline || 'Report') + '\n\n' + fullReport.text;
                      const blob = new Blob([content], { type: 'text/markdown' });
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(blob);
                      a.download = 'report-' + videoId + '.md';
                      a.click();
                      URL.revokeObjectURL(a.href);
                    }} style={{ padding: '4px 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                      Export
                    </button>
                  </div>
                </div>
                {!reportCollapsed && (
                  <div style={{ padding: '16px 20px' }}>
                    <div style={{ fontSize: 14, lineHeight: 1.8, color: '#334155' }}>
                      {fullReport.text.split('\n').map((line, i) => {
                        if (line.startsWith('**') && line.endsWith('**')) {
                          return <h4 key={i} style={{ margin: '16px 0 8px', fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{renderLineWithTimestamps(line.replace(/\*\*/g, ''))}</h4>;
                        }
                        if (line.trim()) return <p key={i} style={{ margin: '0 0 10px' }}>{renderLineWithTimestamps(line)}</p>;
                        return null;
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Collapsible Highlights */}
            {highlightsWithQuotes.length > 0 && (
              <div className="highlights-display" style={{ marginTop: 24, paddingTop: 24, borderTop: '2px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginBottom: highlightsCollapsed ? 0 : 12 }}
                  onClick={() => setHighlightsCollapsed(p => !p)}>
                  <span style={{ display: 'inline-block', fontSize: 12, color: '#64748b', transform: highlightsCollapsed ? 'rotate(-90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>{'\u25BC'}</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{t.keyHighlights} ({highlightsWithQuotes.length})</span>
                </div>
                {!highlightsCollapsed && (
                  <div className="highlights-list">
                    {highlightsWithQuotes.map((item, i) => (
                      <div key={i} className="highlight-item" style={{ marginBottom: 16 }}>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                          {i + 1}. {item.highlight}
                          {item.category && (
                            <span style={{
                              marginLeft: '8px',
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '12px',
                              background: item.category === 'vote' ? '#fee2e2' :
                                         item.category === 'budget' ? '#dcfce7' :
                                         item.category === 'public_comment' ? '#dbeafe' : '#fef3c7',
                              color: item.category === 'vote' ? '#991b1b' :
                                     item.category === 'budget' ? '#166534' :
                                     item.category === 'public_comment' ? '#1e40af' : '#92400e'
                            }}>
                              {item.category === 'vote' ? 'Vote' :
                               item.category === 'budget' ? 'Budget' :
                               item.category === 'public_comment' ? 'Public' :
                               item.category === 'announcement' ? 'Announcement' : ''}
                            </span>
                          )}
                        </div>
                        {item.quote && (
                          <div style={{
                            paddingLeft: 20,
                            fontSize: 13,
                            color: "#64748b",
                            fontStyle: "italic",
                            borderLeft: "3px solid #97D68D",
                            marginLeft: 10,
                            paddingTop: 4,
                            paddingBottom: 4
                          }}>
                            "{item.quote}"
                            {item.speaker && (
                              <span style={{ display: 'block', marginTop: '4px', fontStyle: 'normal', color: '#94a3b8', fontSize: '12px' }}>
                                — {item.speaker}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* v6.1: Accessibility Panel for simplifying and translating */}
            <AccessibilityPanel 
              summary={summary.para}
              onSimplified={(text) => console.log('Simplified:', text)}
              onTranslated={(text) => console.log('Translated:', text)}
            />
          </section>
        )}

        {videoId && fullText && (
          <section className="card section animate-slideUp" style={{ marginTop: 16 }}>
            <MeetingStatsCard
              cues={cues}
              fullText={fullText}
              sents={sents}
              videoTitle={videoTitle}
            />
          </section>
        )}

        {/* Cloud Mode Banner - Show download prompt when in cloud mode */}
        {/* Cloud banner removed — cloud users now get the full editor */}

        {translation.show && (
          <section className="card section translation-card animate-slideUp" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                {t.viewTranslation} ({translation.lang})
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setTranslation(prev => ({ ...prev, show: false }))}
              >
                X Close
              </button>
            </div>
            <div className="translation-text">
              {translation.text}
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => {
                const blob = new Blob([translation.text], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `transcript-${translation.lang.toLowerCase()}.txt`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              style={{ marginTop: 12 }}
            >
              {t.downloadTranslation}
            </button>
          </section>
        )}

        {/* ================================================================
           VIDEO EDITOR LAYOUT (desktop + cloud — both get the full editor)
           ================================================================ */}
        {videoId && (
          <>
            {/* ================================================================
               SEARCH & DISCOVER ZONE
               ================================================================ */}
            <div className="search-zone">
              {/* Search Bar */}
              <div className="desktop-search-bar" style={{ margin: 0, border: 'none', boxShadow: 'none', padding: '0 0 12px' }}>
                <div className="desktop-search-input-wrap">
                  <span className="desktop-search-icon">🔍</span>
                  <input className="desktop-search-input" placeholder="Search video transcript for any word or phrase..." value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search video transcript" />
                  {query && <button className="desktop-search-clear" onClick={() => setQuery('')} aria-label="Clear search">✕</button>}
                </div>
                <div className="desktop-search-tools">
                  {query && (
                    <button className="desktop-search-tool-btn desktop-search-investigate" onClick={() => setInvestigateWord({ text: query })}>
                      🔬 Investigate
                    </button>
                  )}
                  <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)} className="desktop-search-lang-select">
                    <option value="Spanish">Spanish</option><option value="French">French</option><option value="Portuguese">Portuguese</option>
                    <option value="Chinese">Chinese</option><option value="Arabic">Arabic</option><option value="Russian">Russian</option>
                    <option value="Japanese">Japanese</option><option value="German">German</option>
                  </select>
                  <button className="desktop-search-tool-btn" onClick={translateTranscript} disabled={loading.translate}>🌐 Translate</button>
                  <button className="desktop-search-tool-btn" onClick={() => {
                    const blob = new Blob([vtt || fullText], { type: vtt ? 'text/vtt' : 'text/plain' });
                    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `transcript-${videoId}.${vtt ? 'vtt' : 'txt'}`; a.click(); URL.revokeObjectURL(url);
                  }}>⬇️ Download</button>
                  {sents.length > 0 && (
                    <button className="desktop-search-tool-btn" onClick={() => setShowFullTranscript(prev => !prev)}
                      style={showFullTranscript ? { background: '#166534', color: '#fff', borderColor: '#166534' } : {}}
                    >{showFullTranscript ? '🔤 Word Cloud' : '📝 Full Transcript'}</button>
                  )}
                </div>
              </div>

              {/* Sparkline */}
              {matches.length > 0 && sents.length > 0 && (
                <div className="search-sparkline-bar" style={{ margin: '0 0 12px' }}>
                  <span style={{ fontSize: '10px', color: '#64748b', marginRight: 8 }}>Timeline</span>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1, flex: 1, height: 32 }}>
                    {(() => {
                      const totalDur = sents[sents.length - 1]?.end || 1;
                      const bins = 50;
                      const binSize = totalDur / bins;
                      const counts = new Array(bins).fill(0);
                      matches.forEach(m => { const b = Math.min(Math.floor(m.start / binSize), bins - 1); counts[b]++; });
                      const maxC = Math.max(...counts, 1);
                      return counts.map((c, i) => (
                        <div key={i} style={{ flex: 1, background: c > 0 ? '#22c55e' : '#e2e8f0', borderRadius: 2, height: c > 0 ? `${Math.max(20, (c / maxC) * 100)}%` : '4px', opacity: c > 0 ? 0.8 : 0.3, transition: 'height 0.3s' }} />
                      ));
                    })()}
                  </div>
                  <span style={{ fontSize: '10px', color: '#64748b', marginLeft: 8 }}>{matches.length} hits</span>
                </div>
              )}

              {/* Two-column: Word Cloud / Search Results (left) + Small Video (right) */}
              <div className="search-zone-grid">
                {/* LEFT: Word Cloud / Search Results / Full Transcript */}
                <div className="search-zone-left">
                  {showFullTranscript ? (
                    /* Full Transcript Overlay — covers word cloud area */
                    <div className="desktop-search-results-area" style={{ position: 'relative' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#166534' }}>📝 Full Transcript</div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>Select text to create clips</span>
                          <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 12px' }} onClick={() => setShowFullTranscript(false)}>← Word Cloud</button>
                        </div>
                      </div>
                      <div className="desktop-transcript-panel" ref={desktopTranscriptRef} onMouseUp={handleDesktopTranscriptMouseUp} style={{ maxHeight: '400px' }}>
                        {sents.map((s, idx) => {
                          const isFocus = expanded.open && idx === expanded.focusIdx;
                          const isActive = idx === activeCueIdx;
                          return (
                            <span key={idx} id={`sent-${idx}`} className={`sent ${isFocus ? 'hit' : ''} ${isActive ? 'active-cue' : ''}`} data-idx={idx} data-start={s.start} data-end={s.end}
                              style={(isFocus || isActive) ? { background: isActive ? 'rgba(30,127,99,0.25)' : 'rgba(34,197,94,0.2)', borderRadius: '4px', padding: '2px 4px', transition: 'background 0.3s' } : undefined}
                            >
                              {isActive && <span style={{ fontSize: 10, color: '#1e7f63', fontFamily: 'monospace', marginRight: 3, fontWeight: 700 }}>{formatTime(s.start)}</span>}
                              {s.text}{' '}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : expanded.open ? (
                    /* Transcript Context — focused on a specific sentence */
                    <div className="desktop-search-results-area">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#166534' }}>📝 Transcript Context</div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>Select text to create clips</span>
                          <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 12px' }} onClick={() => setExpanded({ open: false, focusIdx: null })}>← Back</button>
                        </div>
                      </div>
                      <div className="desktop-transcript-panel" ref={desktopTranscriptRef} onMouseUp={handleDesktopTranscriptMouseUp} style={{ maxHeight: '350px' }}>
                        {sents.map((s, idx) => {
                          const isFocus = idx === expanded.focusIdx;
                          return (
                            <span key={idx} id={`sent-${idx}`} className={`sent ${isFocus ? 'hit' : ''}`} data-idx={idx} data-start={s.start} data-end={s.end}
                              style={isFocus ? { background: 'rgba(34,197,94,0.2)', borderRadius: '4px', padding: '2px 4px' } : undefined}
                            >
                              {s.text}{' '}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ) : matches.length > 0 ? (
                    <div className="desktop-search-results-area">
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#166534', marginBottom: '4px' }}>
                        {matches.length} match{matches.length !== 1 ? 'es' : ''} for "{query}"
                      </div>
                      <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '10px', lineHeight: 1.4 }}>
                        Click "+ Timeline" to add a clip. Or click "See in Transcript" then highlight text to create custom clips.
                      </div>
                      {matches.slice(0, 20).map((m, i) => (
                        <div key={i} className="search-result-card">
                          <div className="search-result-time">{formatTime(m.start)} → {formatTime(m.start + (m.duration || 10))}</div>
                          <div className="search-result-text">
                            {query ? m.text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, idx) => (
                              <span key={idx} className={part.toLowerCase() === query.toLowerCase() ? 'search-result-highlight' : ''}>{part}</span>
                            )) : m.text}
                          </div>
                          <div className="search-result-actions">
                            <button className="search-result-btn search-result-btn-watch" onClick={() => {
                              if (searchPlayerRef.current) searchPlayerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(m.start)}&autoplay=1&enablejsapi=1`;
                            }}>▶ Watch</button>
                            <button className="search-result-btn search-result-btn-add" onClick={() => {
                              const clip = { start: Math.max(0, m.start - (videoOptions.clipPadding || 4)), end: m.start + (m.duration || 10) + (videoOptions.clipPadding || 4), label: m.text.slice(0, 60), highlight: m.text, text: m.text };
                              updateClipBasket(prev => [...prev, clip]);
                              addToast('✂️ Clip added to timeline!');
                            }}>+ Timeline</button>
                            <button className="search-result-btn search-result-btn-context" onClick={() => {
                              setExpanded({ open: true, focusIdx: m.idx || i });
                              setTimeout(() => { const el = document.getElementById(`sent-${m.idx || i}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 100);
                            }}>See in Transcript</button>
                            <button className="search-result-btn search-result-btn-investigate" onClick={() => {
                              setInvestigateWord({ text: m.text.split(/\s+/).slice(0, 5).join(' ') });
                            }}>Investigate</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="word-cloud-hero">
                      <div className="word-cloud-hero-title">🔤 Key Terms <span style={{ fontWeight: 400, fontSize: '10px', color: '#64748b', letterSpacing: 'normal', textTransform: 'none' }}>click any word to search</span></div>
                      <div className="word-cloud-hero-words">
                        {words.length > 0 ? words.map((w, i) => {
                          const maxCount = words[0].count;
                          const minCount = words[words.length - 1].count || 1;
                          const logRatio = Math.log(w.count) / Math.log(maxCount);
                          const rankRatio = 1 - (i / words.length);
                          const ratio = logRatio * 0.6 + rankRatio * 0.4;
                          const sizeClass = ratio > 0.85 ? 'wc-mega' : ratio > 0.7 ? 'wc-xl' : ratio > 0.55 ? 'wc-large' : ratio > 0.4 ? 'wc-medium' : ratio > 0.25 ? 'wc-small' : 'wc-tiny';
                          const colors = ['#4ade80', '#22c55e', '#34d399', '#2dd4bf', '#6ee7b7', '#a7f3d0', '#86efac', '#bbf7d0'];
                          const colorIdx = Math.min(Math.floor((1 - ratio) * colors.length), colors.length - 1);
                          const isGlow = i < 3;
                          return (
                            <span key={w.text} className={`wc-word ${sizeClass} ${isGlow ? 'wc-glow' : ''}`}
                              style={{ color: colors[colorIdx] }}
                              title={`"${fixBrooklyn(w.text)}" — ${w.count} mentions`}
                              onClick={() => setQuery(fixBrooklyn(w.text))}
                            >{fixBrooklyn(w.text)}</span>
                          );
                        }) : (
                          <span style={{ color: '#475569', fontSize: '14px' }}>Load a video to see key terms</span>
                        )}
                      </div>
                      {/* View Full Transcript button — overlays word cloud when clicked */}
                      {sents.length > 0 && (
                        <button onClick={() => setShowFullTranscript(true)} style={{
                          display: 'block', width: '100%', marginTop: 12, padding: '10px 16px',
                          background: '#166534', color: '#fff', border: 'none', borderRadius: 8,
                          fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = '#15803d'}
                        onMouseLeave={(e) => e.currentTarget.style.background = '#166534'}
                        >📝 View Full Transcript</button>
                      )}
                    </div>
                  )}

                  {/* Transcript Tools moved to right column */}
                </div>

                {/* RIGHT: Small Video Player for search preview */}
                <div className="search-zone-right">
                  <div className="search-video-container">
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🎥 Preview</div>
                    <iframe
                      ref={searchPlayerRef}
                      title="search-preview-player"
                      style={{ width: '100%', height: '300px', borderRadius: '10px', border: 'none' }}
                      src={`https://www.youtube.com/embed/${videoId}?autoplay=0&mute=0&playsinline=1&enablejsapi=1`}
                      allow="autoplay; encrypted-media; picture-in-picture"
                      allowFullScreen
                    />
                    <button
                      onClick={() => {
                        // Extract current timestamp from iframe src
                        const src = searchPlayerRef.current?.src || '';
                        const startMatch = src.match(/start=(\d+)/);
                        const seconds = startMatch ? parseInt(startMatch[1]) : 0;
                        // Open transcript and highlight at this timestamp
                        setShowFullTranscript(true);
                        // Find closest cue
                        let bestIdx = 0;
                        let bestDist = Infinity;
                        for (let i = 0; i < sents.length; i++) {
                          const dist = Math.abs(sents[i].start - seconds);
                          if (dist < bestDist) { bestDist = dist; bestIdx = i; }
                        }
                        setActiveCueIdx(bestIdx);
                        setTimeout(() => {
                          const el = document.getElementById(`sent-${bestIdx}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }, 200);
                        // Auto-track playback
                        if (activeCueTimerRef.current) clearInterval(activeCueTimerRef.current);
                        let currentTime = seconds;
                        let trackIdx = bestIdx;
                        activeCueTimerRef.current = setInterval(() => {
                          currentTime += 1;
                          for (let i = trackIdx; i < sents.length; i++) {
                            if (sents[i].start <= currentTime && (i === sents.length - 1 || sents[i + 1].start > currentTime)) {
                              if (i !== trackIdx) {
                                trackIdx = i;
                                setActiveCueIdx(i);
                                const cueEl = document.getElementById(`sent-${i}`);
                                if (cueEl) cueEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }
                              break;
                            }
                          }
                        }, 1000);
                        setTimeout(() => { if (activeCueTimerRef.current) clearInterval(activeCueTimerRef.current); }, 120000);
                      }}
                      style={{
                        display: 'block', width: '100%', marginTop: 8, padding: '8px 12px',
                        background: '#f0fdf4', border: '1.5px solid #1e7f63', borderRadius: 8,
                        color: '#1e7f63', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={e => { e.target.style.background = '#1e7f63'; e.target.style.color = '#fff'; }}
                      onMouseLeave={e => { e.target.style.background = '#f0fdf4'; e.target.style.color = '#1e7f63'; }}
                    >
                      View in Transcript
                    </button>
                  </div>
                  {/* Jargon Translator */}
                  <div style={{ marginTop: '12px' }}>
                    <JargonTranslatorPanel />
                  </div>
                  {/* Download Center */}
                  {sents.length > 0 && (
                    <div style={{ marginTop: '12px', padding: '16px', background: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#166534', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Download Center</div>

                      {/* Transcript Downloads */}
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Transcript</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="download-center-btn" onClick={() => {
                            const blob = new Blob([vtt || fullText], { type: vtt ? 'text/vtt' : 'text/plain' });
                            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `transcript-${videoId}.${vtt ? 'vtt' : 'txt'}`; a.click(); URL.revokeObjectURL(url);
                          }}>Full Transcript (.{vtt ? 'vtt' : 'txt'})</button>
                          <select value={translateLang} onChange={(e) => setTranslateLang(e.target.value)} style={{ fontSize: '11px', padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white' }}>
                            <option value="Spanish">Spanish</option><option value="French">French</option><option value="Portuguese">Portuguese</option>
                            <option value="Chinese">Chinese</option><option value="Arabic">Arabic</option><option value="Russian">Russian</option>
                            <option value="Japanese">Japanese</option><option value="German">German</option>
                          </select>
                          <button className="download-center-btn" onClick={translateTranscript} disabled={loading.translate}>
                            {loading.translate ? 'Translating...' : 'Translate'}
                          </button>
                          <button className="download-center-btn" style={{ color: '#6366f1', fontWeight: 700 }} onClick={translateFullTranscriptBrowser} title="Free, handles full transcript length — copies text to clipboard and opens Google Translate">
                            Google Translate (Free, Full Text)
                          </button>
                          <button className="download-center-btn" onClick={async () => {
                            try {
                              const blob = await apiExportSrt({ videoId });
                              const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `subtitles-${videoId}.srt`; a.click(); URL.revokeObjectURL(url);
                              addToast('SRT subtitles downloaded');
                            } catch (e) { addToast('SRT export failed: ' + e.message); }
                          }}>SRT Subtitles (.srt)</button>
                        </div>
                      </div>

                      {/* Report Download */}
                      {fullReport.text && (
                        <div style={{ marginBottom: '10px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Report</div>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button className="download-center-btn" onClick={() => {
                              const content = '# ' + (fullReport.headline || 'Meeting Report') + '\n\n' + fullReport.text;
                              const blob = new Blob([content], { type: 'text/markdown' });
                              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `report-${videoId}.md`; a.click();
                            }}>Full Report (.md)</button>
                            <button className="download-center-btn" onClick={async () => {
                              try {
                                const pdfData = {
                                  videoId,
                                  title: videoTitle || 'Meeting Summary',
                                  date: videoTitle || '',
                                  summary: summary.para || '',
                                  highlights: (highlightsWithQuotes || []).slice(0, 7).map(h => ({ text: h.highlight || h.text || '', timestamp_seconds: h.timestamp })),
                                  entities: (entities || []).slice(0, 10)
                                };
                                const blob = await apiExportPdf(pdfData);
                                const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `summary-${videoId}.pdf`; a.click(); URL.revokeObjectURL(url);
                                addToast('PDF summary downloaded');
                              } catch (e) { addToast('PDF export failed: ' + e.message); }
                            }}>PDF Summary (.pdf)</button>
                          </div>
                        </div>
                      )}

                      {/* Video Download */}
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Video</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                          <button className="download-center-btn" disabled={isCloudMode || downloadJob?.status === 'running'} onClick={async () => {
                            if (isCloudMode) return;
                            setDownloadJob({ status: 'running', percent: 0 });
                            try {
                              const res = await apiDownloadMp4({ videoId, resolution: downloadResolution });
                              if (res.jobId) {
                                const poll = setInterval(async () => {
                                  try {
                                    const st = await apiJobStatus(res.jobId);
                                    setDownloadJob({ status: st.status, percent: st.percent, file: st.file });
                                    if (st.status === 'done') { clearInterval(poll); if (st.file) { window.open(st.file, '_blank'); addDownload(`${videoId}.mp4`, st.file, 'full_video'); } }
                                    else if (st.status === 'error') { clearInterval(poll); addToast('Download failed'); }
                                  } catch(e) { clearInterval(poll); setDownloadJob(null); }
                                }, 1500);
                              } else if (res.file) { window.open(res.file, '_blank'); setDownloadJob(null); }
                            } catch(e) { addToast('Download failed: ' + e.message); setDownloadJob(null); }
                          }} title={isCloudMode ? 'Video download requires the desktop app' : 'Download full YouTube video'}>
                            {downloadJob?.status === 'running' ? `Downloading ${downloadJob.percent || 0}%` : 'Full Video (.mp4)'}
                          </button>
                          <select value={downloadResolution} onChange={(e) => setDownloadResolution(e.target.value)} disabled={isCloudMode} style={{ fontSize: '11px', padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white' }}>
                            {availableFormats.length > 0 ? availableFormats.map(f => (
                              <option key={f.label} value={f.label}>{f.label === 'best' ? 'Best' : f.label}</option>
                            )) : (<><option value="best">Best</option><option value="1080p">1080p</option><option value="720p">720p</option></>)}
                          </select>
                          {/* Rendered highlight reel download */}
                          {showCelebration?.file && (
                            <a href={showCelebration.file} download className="download-center-btn" style={{ textDecoration: 'none', background: '#ecfdf5', borderColor: '#22c55e', color: '#166534' }}>
                              Highlight Reel (.mp4)
                            </a>
                          )}
                          {isCloudMode && <span style={{ fontSize: '10px', color: '#94a3b8' }}>Video download requires desktop app</span>}
                        </div>
                      </div>

                      {/* Desktop App CTA (cloud only) */}
                      {isCloudMode && (
                        <div style={{ marginBottom: '12px' }}>
                          <a href="https://github.com/amateurmenace/community-highlighter/releases/latest" target="_blank" rel="noopener noreferrer"
                            style={{ display: 'inline-block', padding: '8px 16px', background: '#0f172a', color: '#fff', borderRadius: 8, fontSize: '12px', fontWeight: 600, textDecoration: 'none', transition: 'background 0.15s' }}
                            onMouseEnter={e => e.target.style.background = '#1e293b'}
                            onMouseLeave={e => e.target.style.background = '#0f172a'}
                          >
                            Download Desktop App
                          </a>
                          <span style={{ fontSize: '10px', color: '#94a3b8', marginLeft: 8 }}>Required to download and render video files</span>
                        </div>
                      )}

                      {/* AI Highlight Reel CTA */}
                      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '4px' }}>
                        <button
                          onClick={() => {
                            buildReel("combined");
                            // Scroll to editor section
                            setTimeout(() => {
                              if (sectionEditRef.current) sectionEditRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }, 500);
                          }}
                          disabled={loading.reel}
                          style={{
                            width: '100%', padding: '10px 16px',
                            background: loading.reel ? '#94a3b8' : 'linear-gradient(135deg, #1e7f63 0%, #166534 100%)',
                            color: '#fff', border: 'none', borderRadius: 8,
                            fontSize: '13px', fontWeight: 700, cursor: loading.reel ? 'wait' : 'pointer',
                            transition: 'all 0.2s', letterSpacing: '0.3px',
                          }}
                        >
                          {loading.reel ? 'Building Highlight Reel...' : 'Use AI to Create Highlight Reel'}
                        </button>
                      </div>
                    </div>
                  )}
                  {highlightsWithQuotes.length > 0 && (
                    <div style={{ marginTop: '8px', padding: '12px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', maxHeight: '200px', overflowY: 'auto' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#166534', marginBottom: '6px' }}>⭐ Highlights ({highlightsWithQuotes.length})</div>
                      {highlightsWithQuotes.slice(0, 10).map((h, i) => {
                        const ts = findQuoteTimestamp(h.quote || h.highlight, sents, videoOptions.clipPadding || 4);
                        const alreadyInTimeline = ts && clipBasket.some(c => Math.abs(c.start - (ts.start - (videoOptions.clipPadding || 4))) < 2);
                        return (
                          <div key={i} className={`insights-highlight-item ${alreadyInTimeline ? 'insights-highlight-in-timeline' : ''}`} style={{ padding: '6px 8px', fontSize: '11px' }} onClick={() => {
                            if (searchPlayerRef.current && ts) searchPlayerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(ts.start)}&autoplay=1&enablejsapi=1`;
                          }}>
                            <span className="insights-highlight-num" style={{ width: 18, height: 18, fontSize: '9px' }}>{i + 1}</span>
                            <span style={{ flex: 1, color: '#334155' }}>{h.highlight}</span>
                            {alreadyInTimeline ? (
                              <span style={{ fontSize: '9px', color: '#22c55e', fontWeight: 600 }}>✓</span>
                            ) : (
                              <button className="insights-highlight-add" style={{ width: 18, height: 18, fontSize: '11px' }} onClick={(e) => {
                                e.stopPropagation();
                                if (ts) {
                                  updateClipBasket(prev => [...prev, { start: Math.max(0, ts.start - (videoOptions.clipPadding || 4)), end: ts.end + (videoOptions.clipPadding || 4), label: h.highlight, highlight: h.highlight, speaker: h.speaker }]);
                                  addToast(`✂️ Highlight ${i + 1} added!`);
                                }
                              }}>+</button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Section 2: Highlight Video Editor */}
            <div className="section-divider" ref={sectionEditRef}>
              <div className="section-divider-line" />
              <div className="section-divider-title">
                Highlight Video Editor
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                Drag clips to reorder, trim edges, add effects, and export your highlight reel as a video.
              </div>
            </div>

            {/* ================================================================
               EDITING WORKSPACE (Video + Toolbar + Timeline)
               ================================================================ */}
            <div className="editing-workspace">
              {/* Video Player — full width, prominent */}
              <div style={{ position: 'relative' }}>
                <iframe
                  ref={playerRef}
                  title="video-player"
                  className="video-frame"
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=0&mute=0&playsinline=1&enablejsapi=1`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
                {previewingClip && (
                  <div style={{
                    position: 'absolute', top: 12, left: 12, background: 'rgba(30,127,99,0.9)', color: 'white',
                    padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, zIndex: 10,
                    display: 'flex', alignItems: 'center', gap: '8px', animation: 'fadeIn 0.3s ease'
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1s infinite' }} />
                    Previewing Clip {previewingClip.idx + 1}
                    <button onClick={() => { setPreviewingClip(null); if (previewTimerRef.current) clearTimeout(previewTimerRef.current); }} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '14px', padding: 0 }}>✕</button>
                  </div>
                )}
              </div>

              {/* Hero AI Reel Button — prominent CTA */}
              <div className="hero-reel-bar">
                <button className="hero-reel-cta" onClick={() => buildReel('combined')} disabled={loading.reel || loading.summary}>
                  {loading.reel ? '⏳ Building Highlight Reel...' : '🤖 Make AI Highlight Reel'}
                </button>
              </div>

              {/* Social media vertical video CTA */}
              <div style={{ textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                {isCloudMode ? (
                  <a href="https://github.com/amateurmenace/community-highlighter/releases/latest" target="_blank" rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#94a3b8', background: '#1a2332', border: '1px solid #334155', borderRadius: 8, textDecoration: 'none', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#4ade80'; e.currentTarget.style.color = '#e2e8f0'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#334155'; e.currentTarget.style.color = '#94a3b8'; }}
                  >
                    <span style={{ fontSize: 16 }}>📱</span>
                    Download the desktop app to save and auto reformat to vertical video for social media
                  </a>
                ) : (
                  <button onClick={() => buildReel('social')} disabled={loading.reel || loading.summary}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, color: '#e2e8f0', background: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)', border: 'none', borderRadius: 8, cursor: 'pointer', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 14px rgba(124, 58, 237, 0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <span style={{ fontSize: 16 }}>📱</span>
                    Generate Social Media Reel (9:16 Vertical)
                  </button>
                )}
              </div>

              {/* Reel Styles — collapsible under toggle */}
              <div className="reel-styles-toggle-bar">
                <button className="reel-styles-toggle-btn" onClick={() => setShowReelStyles(!showReelStyles)}>
                  🎬 {showReelStyles ? 'Hide' : 'Choose'} Reel Style {showReelStyles ? '▲' : '▼'}
                </button>
              </div>
              {showReelStyles && (
                <div className="reel-styles-bar">
                  {[
                    { key: 'key_decisions', icon: '🏛️', title: 'Decisions', desc: 'Votes, motions, approvals, and official decisions' },
                    { key: 'public_comments', icon: '💬', title: 'Comments', desc: 'Resident testimonials, community concerns, personal stories' },
                    { key: 'controversial', icon: '🔥', title: 'Controversial', desc: 'Heated debates, split votes, strong disagreements' },
                    { key: 'budget', icon: '💰', title: 'Budget', desc: 'Dollar amounts, tax rates, funding requests, financial impacts' },
                    { key: 'action_items', icon: '✅', title: 'Actions', desc: 'Tasks assigned to staff, deadlines, follow-up commitments' },
                  ].map(style => (
                    <button key={style.key} className="reel-style-card" title={style.desc}
                      onClick={() => { buildReel('combined', { reelStyle: style.key }); setShowReelStyles(false); }}
                      disabled={loading.reel || loading.summary}
                    >
                      <span className="reel-style-icon">{style.icon}</span>
                      <span className="reel-style-title">{style.title}</span>
                      <span className="reel-style-desc">{style.desc}</span>
                    </button>
                  ))}
                  <button className="reel-style-card reel-style-social" onClick={() => { buildReel('social'); setShowReelStyles(false); }} disabled={loading.reel} title="Vertical 9:16 for TikTok/Instagram">
                    <span className="reel-style-icon">📱</span>
                    <span className="reel-style-title">Social</span>
                    <span className="reel-style-desc">Vertical 9:16 for TikTok / Reels</span>
                  </button>
                </div>
              )}

              {/* Compact Toolbar — timeline controls */}
              <div className="unified-toolbar" style={{ flexDirection: 'column', gap: 6 }}>
                {/* Row 1: Primary actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
                  <div className="unified-toolbar-left">
                    <span className="toolbar-clip-count">
                      {clipBasket.length} clip{clipBasket.length !== 1 ? 's' : ''} · {formatTime(clipBasket.reduce((sum, c) => sum + (c.end - c.start), 0))}
                    </span>
                    <div className="toolbar-divider" />
                    <div className="toolbar-zoom">
                      <button onClick={() => setTimelineZoom(z => Math.max(0.5, z - 0.25))}>-</button>
                      <span>{Math.round(timelineZoom * 100)}%</span>
                      <button onClick={() => setTimelineZoom(z => Math.min(4, z + 0.25))}>+</button>
                    </div>
                  </div>

                  <div style={{ flex: 1 }} />

                  {/* Export / Share — adapts to cloud vs desktop */}
                  {isCloudMode ? (
                    <>
                      <button className="toolbar-share-btn" disabled={clipBasket.length === 0} onClick={() => {
                        if (clipBasket.length === 0) return;
                        const clipsParam = clipBasket.map(c => `${Math.round(c.start)}-${Math.round(c.end)}`).join(',');
                        const titlesParam = clipBasket.map(c => (c.label || '').slice(0, 50)).join('|');
                        const shareUrl = `${window.location.origin}/?v=${videoId}&clips=${clipsParam}&titles=${encodeURIComponent(titlesParam)}&mode=play&labels=${videoOptions.showHighlightLabels !== false ? 'on' : 'off'}`;
                        navigator.clipboard.writeText(shareUrl).then(() => addToast('🔗 Reel link copied to clipboard!')).catch(() => {
                          prompt('Copy this reel link:', shareUrl);
                        });
                        // Precompute summary for viewers
                        apiSharePrecompute(videoId, fullText);
                      }} title="Copy a shareable link with your clip selections embedded">
                        <span>🔗</span>
                        <span>Share Reel Link</span>
                      </button>
                      <button className={`toolbar-view-btn${clipBasket.length > 0 ? ' toolbar-view-btn-glow' : ''}`} disabled={clipBasket.length === 0} onClick={() => {
                        if (clipBasket.length === 0) return;
                        const clipsParam = clipBasket.map(c => `${Math.round(c.start)}-${Math.round(c.end)}`).join(',');
                        const titlesParam = clipBasket.map(c => (c.label || '').slice(0, 50)).join('|');
                        const viewUrl = `${window.location.origin}/?v=${videoId}&clips=${clipsParam}&titles=${encodeURIComponent(titlesParam)}&mode=play&labels=${videoOptions.showHighlightLabels !== false ? 'on' : 'off'}`;
                        window.open(viewUrl, '_blank');
                      }} title="Preview your edited reel in a new tab">
                        <span>&#9654;</span>
                        <span>View Your Edited Reel</span>
                      </button>
                      <button className="toolbar-handoff-btn" disabled={clipBasket.length === 0} onClick={() => {
                        if (clipBasket.length === 0) return;
                        const reelData = {
                          version: 1,
                          videoId,
                          videoTitle,
                          clips: clipBasket.map(c => ({ start: c.start, end: c.end, label: c.label || '', highlight: c.highlight || '' })),
                          options: { resolution: videoOptions.resolution, captions: reelCaptionsEnabled, colorFilter: videoOptions.colorFilter, showHighlightLabels: videoOptions.showHighlightLabels, transitions: videoOptions.transitionType }
                        };
                        const blob = new Blob([JSON.stringify(reelData, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${(videoTitle || videoId).replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)}.chreel`;
                        a.click();
                        URL.revokeObjectURL(url);
                        addToast('💻 Reel plan downloaded — open in the desktop app to render as video');
                      }} title="Download reel plan file to render in the desktop app">
                        <span>💻</span>
                        <span>Render in Desktop App</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="toolbar-export-btn" onClick={() => setShowExportModal(true)} disabled={clipBasket.length === 0}
                        title={clipBasket.length === 0 ? 'Add clips to the timeline first, then export as video' : `Export ${clipBasket.length} clips as MP4 video`}>
                        <span className="toolbar-export-icon">📦</span>
                        <span className="toolbar-export-label">{clipBasket.length > 0 ? `Export ${clipBasket.length} Clip${clipBasket.length !== 1 ? 's' : ''} as Video` : 'Export as Video'}</span>
                      </button>
                      <button className="toolbar-share-btn" disabled={clipBasket.length === 0} onClick={() => {
                        if (clipBasket.length === 0) return;
                        const clipsParam = clipBasket.map(c => `${Math.round(c.start)}-${Math.round(c.end)}`).join(',');
                        const titlesParam = clipBasket.map(c => (c.label || '').slice(0, 50)).join('|');
                        const shareUrl = `${window.location.origin}/?v=${videoId}&clips=${clipsParam}&titles=${encodeURIComponent(titlesParam)}&mode=play&labels=${videoOptions.showHighlightLabels !== false ? 'on' : 'off'}`;
                        navigator.clipboard.writeText(shareUrl).then(() => addToast('🔗 Reel link copied to clipboard!')).catch(() => {
                          prompt('Copy this reel link:', shareUrl);
                        });
                        apiSharePrecompute(videoId, fullText);
                      }} title="Copy a shareable link that plays your clips as a reel">
                        <span>🔗</span>
                        <span>Share Reel Link</span>
                      </button>
                      <button className="toolbar-view-btn" disabled={clipBasket.length === 0} onClick={() => {
                        if (clipBasket.length === 0) return;
                        const clipsParam = clipBasket.map(c => `${Math.round(c.start)}-${Math.round(c.end)}`).join(',');
                        const titlesParam = clipBasket.map(c => (c.label || '').slice(0, 50)).join('|');
                        const viewUrl = `${window.location.origin}/?v=${videoId}&clips=${clipsParam}&titles=${encodeURIComponent(titlesParam)}&mode=play&labels=${videoOptions.showHighlightLabels !== false ? 'on' : 'off'}`;
                        window.open(viewUrl, '_blank');
                      }} title="Preview your edited reel in a new tab">
                        <span>&#9654;</span>
                        <span>View Your Edited Reel</span>
                      </button>
                    </>
                  )}

                  <button className="toolbar-settings-btn" onClick={() => setShowSettingsDrawer(true)} title="Customize resolution, effects, captions, branding, transitions, and download full video">
                    <span>⚙️</span>
                    <span>Settings</span>
                  </button>
                </div>

                {/* Row 2: Secondary controls — only when clips exist */}
                {clipBasket.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', width: '100%', borderTop: '1px solid #1e293b', paddingTop: 6 }}>
                    {highlightsWithQuotes.length > 0 && (
                      <>
                        <button className="toolbar-action-btn" style={{ fontSize: '11px' }} title="Shuffle clips" onClick={() => {
                          const shuffled = [...highlightsWithQuotes].sort(() => Math.random() - 0.5).slice(0, 5);
                          const clips = shuffled.map(h => { const ts = findQuoteTimestamp(h.quote, sents, videoOptions.clipPadding || 4); return ts ? { start: ts.start, end: ts.end, label: h.highlight, highlight: h.highlight, speaker: h.speaker } : null; }).filter(Boolean);
                          if (clips.length > 0) updateClipBasket(clips);
                        }}>🔀 Shuffle</button>
                        <button className="toolbar-action-btn" style={{ fontSize: '11px' }} title="Regenerate highlights" onClick={() => { generateHighlightsWithQuotes(true).then(() => buildReel('combined')); }} disabled={loading.reel}>🔄 Regenerate</button>
                      </>
                    )}
                    <button className="toolbar-action-btn" style={{ fontSize: '11px' }} onClick={clearBasket} title="Clear all clips">🗑️ Clear</button>
                    <button className={`toolbar-action-btn ${videoOptions.showHighlightLabels !== false ? '' : ''}`} style={{ fontSize: '11px', color: videoOptions.showHighlightLabels !== false ? '#4ade80' : '#94a3b8' }}
                      onClick={() => setVideoOptions(v => ({ ...v, showHighlightLabels: !(v.showHighlightLabels !== false) }))}>
                      🏷️ Titles {videoOptions.showHighlightLabels !== false ? 'ON' : 'OFF'}
                    </button>

                    {/* Desktop-only secondary: Download + Import */}
                    {!isCloudMode && (
                      <>
                        <div style={{ flex: 1 }} />
                        <button className={`toolbar-action-btn ${downloadJob?.status !== 'running' ? 'toolbar-download-glow' : ''}`} style={{ fontSize: '11px' }} disabled={downloadJob?.status === 'running'} onClick={async () => {
                          if (downloadJob?.status === 'running') return;
                          setDownloadJob({ status: 'running', percent: 0, message: 'Starting download...' });
                          try {
                            const res = await apiDownloadMp4({ videoId, resolution: downloadResolution });
                            if (res.jobId) {
                              const poll = setInterval(async () => {
                                try {
                                  const status = await apiJobStatus(res.jobId);
                                  setDownloadJob({ status: status.status, percent: status.percent, message: status.message, file: status.file });
                                  if (status.status === 'done') { clearInterval(poll); if (status.file) { window.open(status.file, '_blank'); addDownload(`${videoId}.mp4`, status.file, 'full_video'); } }
                                  else if (status.status === 'error') { clearInterval(poll); addToast('Download failed: ' + (status.message || 'Unknown error')); }
                                } catch(e) { clearInterval(poll); setDownloadJob(null); }
                              }, 1500);
                            } else if (res.file) { window.open(res.file, '_blank'); addDownload(`${videoId}.mp4`, res.file, 'full_video'); setDownloadJob(null); }
                            else if (res.error) { addToast('Download failed: ' + res.error); setDownloadJob(null); }
                          } catch(e) { addToast('Download failed: ' + e.message); setDownloadJob(null); }
                        }} title="Download the full original video as MP4">
                          {downloadJob?.status === 'running' ? `Downloading ${downloadJob.percent || 0}%` : 'Download Full Video'}
                        </button>
                        <select value={downloadResolution} onChange={(e) => setDownloadResolution(e.target.value)} style={{ background: '#1a2332', color: '#94a3b8', border: '1px solid #334155', borderRadius: 4, fontSize: 10, padding: '2px 4px' }} title="Download quality">
                          {availableFormats.length > 0 ? availableFormats.map(f => (
                            <option key={f.label} value={f.label}>{f.label === 'best' ? 'Best' : f.label}</option>
                          )) : (
                            <><option value="best">Best</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option></>
                          )}
                        </select>
                        <button className="toolbar-action-btn" style={{ fontSize: '11px' }} onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file'; input.accept = '.chreel,.json';
                          input.onchange = async (ev) => {
                            const file = ev.target.files[0]; if (!file) return;
                            try {
                              const chreel = JSON.parse(await file.text());
                              if (!chreel.videoId || !chreel.clips) { addToast('Invalid .chreel'); return; }
                              setVideoId(chreel.videoId);
                              if (chreel.videoTitle) setVideoTitle(chreel.videoTitle);
                              updateClipBasket(() => chreel.clips.map((c, i) => ({ start: c.start, end: c.end, label: c.label || c.highlight || `Clip ${i+1}`, highlight: c.highlight || c.label || '' })));
                              addToast(`Imported ${chreel.clips.length} clips`);
                            } catch (err) { addToast('Failed: ' + err.message); }
                          };
                          input.click();
                        }} title="Import .chreel file">Import</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Download Full Video moved into secondary toolbar row above */}

              {/* Timeline — directly under toolbar */}
              <div className="timeline-editor-wrapper">
                {/* Ruler */}
                <div className="timeline-ruler">
                  {(() => {
                    const totalDuration = clipBasket.reduce((sum, c) => sum + (c.end - c.start), 0);
                    const interval = timelineZoom < 1 ? 30 : timelineZoom < 2 ? 10 : 5;
                    const ticks = [];
                    for (let t = 0; t <= totalDuration; t += interval) {
                      ticks.push(
                        <span key={t} className="timeline-ruler-tick" style={{ width: `${interval * timelineZoom * 10}px` }}>
                          {formatTime(t)}
                        </span>
                      );
                    }
                    return ticks;
                  })()}
                </div>

                {/* Track */}
                <div className={`timeline-track ${job.status === 'running' ? 'timeline-rendering' : ''} ${loading.reel ? 'timeline-loading' : ''}`} onDragOver={(e) => e.preventDefault()}>
                  {clipBasket.length === 0 ? (
                    <div className={`timeline-empty ${loading.reel ? 'timeline-empty-loading' : ''}`}>
                      {loading.reel ? (
                        <>
                          <div className="timeline-loading-animation">
                            <div className="timeline-loading-bar" />
                            <div className="timeline-loading-bar" style={{ animationDelay: '0.2s' }} />
                            <div className="timeline-loading-bar" style={{ animationDelay: '0.4s' }} />
                            <div className="timeline-loading-bar" style={{ animationDelay: '0.6s' }} />
                            <div className="timeline-loading-bar" style={{ animationDelay: '0.8s' }} />
                          </div>
                          <div className="timeline-loading-text">🤖 AI is analyzing the transcript and selecting the best moments...</div>
                          <div className="timeline-loading-subtext">Clips will appear here when ready</div>
                        </>
                      ) : job.status === 'running' ? (
                        `🎬 Rendering... ${job.percent}%`
                      ) : (
                        '✨ Click "Make AI Highlight Reel" or a reel style above to auto-generate clips, or search the transcript below and click + to add clips'
                      )}
                    </div>
                  ) : (
                    clipBasket.map((clip, idx) => {
                      const duration = clip.end - clip.start;
                      const widthPx = Math.max(120, duration * timelineZoom * 10);
                      const thumb = clipThumbnails.find(t => t.index === idx);

                      return (
                        <React.Fragment key={idx}>
                          {/* First clip gets an onboarding tooltip */}
                          {idx === 0 && clipBasket.length > 1 && selectedClipIndex === null && (
                            <div className="clip-onboarding-tip">
                              <strong>Tip:</strong> Click a clip to edit it. Drag edges to trim. Drag to reorder. Click ⚙️ Customize Settings for effects.
                            </div>
                          )}
                          <div
                            className={`timeline-clip ${draggingClipIndex === idx ? 'timeline-clip-dragging' : ''} ${job.status === 'running' ? 'timeline-clip-rendering' : ''} ${selectedClipIndex === idx ? 'timeline-clip-selected' : ''} ${previewingClip?.idx === idx ? 'timeline-clip-previewing' : ''}`}
                            style={{ width: `${widthPx}px`, animationDelay: `${idx * 0.05}s` }}
                            draggable
                            onDragStart={() => setDraggingClipIndex(idx)}
                            onDragEnd={() => setDraggingClipIndex(null)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleClipDrop(idx)}
                            onClick={() => { setSelectedClipIndex(idx); seekToClip(clip, idx); }}
                            title={`Clip ${idx + 1}: ${clip.label || ''}\n\n• Click to select and edit\n• Drag left/right edges to trim\n• Drag clip to reorder\n• ▶ Preview | ✂️ Split | × Remove`}
                          >
                            <div className="trim-handle trim-handle-left" onMouseDown={(e) => startTrim(e, idx, 'start')} title="⟵ Drag to extend or shorten the clip start time" />

                            <div className="timeline-clip-content">
                              {videoId && <img src={thumb?.url || `https://img.youtube.com/vi/${videoId}/${Math.min(3, Math.floor(clip.start / ((clipBasket[clipBasket.length-1]?.end || 300) / 4)))}.jpg`} className="timeline-clip-thumb" alt="" onError={(e) => { e.target.src = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`; }} />}
                              <span className="timeline-clip-label">{clip.label || clip.highlight || `Clip ${idx + 1}`}</span>
                              <span className="timeline-clip-duration">{formatTime(clip.start)} – {formatTime(clip.end)} ({duration.toFixed(0)}s)</span>
                            </div>

                            <div className="trim-handle trim-handle-right" onMouseDown={(e) => startTrim(e, idx, 'end')} title="Drag to extend or shorten the clip end time ⟶" />

                            <button className="timeline-clip-preview" onClick={(e) => { e.stopPropagation(); previewClip(clip, idx); }} title="Preview this clip in the video player above">▶ Preview</button>
                            <button className="clip-split-btn" onClick={(e) => {
                              e.stopPropagation();
                              const mid = (clip.start + clip.end) / 2;
                              const clipA = { ...clip, end: mid, label: (clip.label || '') + ' (A)' };
                              const clipB = { ...clip, start: mid, label: (clip.label || '') + ' (B)' };
                              updateClipBasket(prev => [...prev.slice(0, idx), clipA, clipB, ...prev.slice(idx + 1)]);
                              addToast('✂️ Clip split into two!');
                            }} title="Split this clip into two halves at the midpoint">✂️ Split</button>

                            {(clip.colorFilter && clip.colorFilter !== 'none') && <span style={{ position: 'absolute', top: 3, right: 28, fontSize: '10px' }} title={`Color: ${clip.colorFilter}`}>🎨</span>}
                            {(clip.volume && clip.volume !== 1) && <span style={{ position: 'absolute', top: 3, right: 44, fontSize: '10px' }} title={`Volume: ${Math.round(clip.volume * 100)}%`}>🔊</span>}

                            <div className="mobile-trim-btns">
                              <button className="mobile-trim-btn" onClick={(e) => { e.stopPropagation(); updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, start: Math.max(0, c.start - 1) } : c)); }}>-1s</button>
                              <button className="mobile-trim-btn" onClick={(e) => { e.stopPropagation(); updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, end: c.end + 1 } : c)); }}>+1s</button>
                              <button className="mobile-swipe-delete" onClick={(e) => { e.stopPropagation(); removeClipFromTimeline(idx); }}>Delete</button>
                            </div>

                            <button className="timeline-clip-remove" onClick={(e) => { e.stopPropagation(); removeClipFromTimeline(idx); }} title="Remove this clip from the timeline">×</button>
                          </div>

                          {idx < clipBasket.length - 1 && (
                            <div className="clip-transition-indicator" onClick={(e) => { e.stopPropagation(); setTransitionPickerIdx(transitionPickerIdx === idx ? null : idx); }}
                              title={`Transition: ${clip.transition || 'cut'} — click to change`}
                            >
                              {clip.transition === 'fade' ? '⬛' : clip.transition === 'dissolve' ? '🔀' : clip.transition === 'wipe' ? '➡️' : '·'}
                              {transitionPickerIdx === idx && (
                                <div className="clip-transition-picker" onClick={(e) => e.stopPropagation()}>
                                  {['cut', 'fade', 'dissolve', 'wipe'].map(tr => (
                                    <button key={tr} className={clip.transition === tr || (!clip.transition && tr === 'cut') ? 'active' : ''}
                                      onClick={() => { updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, transition: tr } : c)); setTransitionPickerIdx(null); }}
                                    >{tr}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </div>

                {/* Playback controls bar */}
                {clipBasket.length > 0 && (
                  <div className="timeline-playback-bar">
                    <button disabled={!clipBasket.length || selectedClipIndex === 0 || selectedClipIndex === null}
                      onClick={() => {
                        const prevIdx = selectedClipIndex !== null ? Math.max(0, selectedClipIndex - 1) : 0;
                        const clip = clipBasket[prevIdx];
                        if (clip) { seekToClip(clip, prevIdx); }
                      }} title="Previous clip">
                      &#9664;&#9664; Prev
                    </button>
                    <button className={previewingClip ? 'stop-btn' : 'play-btn'}
                      onClick={() => {
                        if (previewingClip) {
                          setPreviewingClip(null);
                          if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
                          if (playerRef.current) {
                            playerRef.current.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo' }), '*');
                          }
                        } else {
                          const idx = selectedClipIndex ?? 0;
                          const clip = clipBasket[idx];
                          if (clip) previewClip(clip, idx);
                        }
                      }} title={previewingClip ? 'Stop playback' : 'Play selected clip'}>
                      {previewingClip ? 'Stop' : 'Play'}
                    </button>
                    <button disabled={!clipBasket.length || selectedClipIndex === null || selectedClipIndex >= clipBasket.length - 1}
                      onClick={() => {
                        const nextIdx = selectedClipIndex !== null ? Math.min(clipBasket.length - 1, selectedClipIndex + 1) : 0;
                        const clip = clipBasket[nextIdx];
                        if (clip) { seekToClip(clip, nextIdx); }
                      }} title="Next clip">
                      Next &#9654;&#9654;
                    </button>
                    <span className="clip-counter">
                      {selectedClipIndex !== null ? `Clip ${selectedClipIndex + 1}` : 'No clip selected'} / {clipBasket.length}
                    </span>
                    <span className="clip-counter" style={{ color: '#64748b' }}>
                      Total: {clipBasket.reduce((sum, c) => sum + (c.end - c.start), 0).toFixed(0)}s
                    </span>
                  </div>
                )}
              </div>

              {/* Clip Inspector — inside workspace, dark themed */}
              {selectedClipIndex !== null && clipBasket[selectedClipIndex] && (() => {
                const clip = clipBasket[selectedClipIndex];
                const idx = selectedClipIndex;
                // Per-clip settings available in inspector below
                return (
                  <div className="clip-inspector">
                    <div className="clip-inspector-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>🎬</span>
                        <span style={{ fontWeight: 700, fontSize: '13px' }}>Clip {idx + 1} of {clipBasket.length}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>({(clip.end - clip.start).toFixed(1)}s)</span>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 10px' }} onClick={() => { updateClipBasket(prev => [...prev, { ...clip, label: (clip.label || '') + ' (copy)' }]); addToast('📋 Clip duplicated!'); }} title="Duplicate clip">📋 Duplicate</button>
                        <button className="btn btn-ghost" style={{ fontSize: '11px', padding: '4px 10px', color: '#ef4444' }} onClick={() => { removeClipFromTimeline(idx); setSelectedClipIndex(null); }} title="Delete clip">🗑️ Delete</button>
                      </div>
                    </div>
                    <div className="clip-inspector-row">
                      <div className="clip-inspector-field">
                        <label>Start</label>
                        <button onClick={() => updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, start: Math.max(0, c.start - 1) } : c))}>−</button>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', minWidth: '40px', textAlign: 'center' }}>{formatTime(clip.start)}</span>
                        <button onClick={() => updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, start: c.start + 1 } : c))}>+</button>
                      </div>
                      <div className="clip-inspector-field">
                        <label>End</label>
                        <button onClick={() => updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, end: c.end - 1 } : c))}>−</button>
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', minWidth: '40px', textAlign: 'center' }}>{formatTime(clip.end)}</span>
                        <button onClick={() => updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, end: c.end + 1 } : c))}>+</button>
                      </div>
                      <div style={{ width: 1, height: 28, background: '#374151' }} />
                      <div className="clip-inspector-field">
                        <label>Title</label>
                        <button
                          onClick={() => updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, showLabel: c.showLabel === false ? true : c.showLabel === true ? false : true } : c))}
                          style={{ padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: (clip.showLabel !== false) ? '#166534' : '#374151', color: (clip.showLabel !== false) ? '#4ade80' : '#94a3b8' }}
                        >{(clip.showLabel !== false) ? 'ON' : 'OFF'}</button>
                      </div>
                      <div className="clip-inspector-field">
                        <label>Music</label>
                        <button
                          onClick={() => setVideoOptions(v => ({ ...v, backgroundMusic: !v.backgroundMusic }))}
                          style={{ padding: '2px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600, background: videoOptions.backgroundMusic ? '#92400e' : '#374151', color: videoOptions.backgroundMusic ? '#fbbf24' : '#94a3b8' }}
                        >{videoOptions.backgroundMusic ? 'ON' : 'OFF'}</button>
                      </div>
                      <div style={{ width: 1, height: 28, background: '#374151' }} />
                      <div className="clip-inspector-field">
                        <label>🔊</label>
                        <input type="range" min="0" max="200" value={Math.round((clip.volume || 1) * 100)} onChange={(e) => updateClipBasket(prev => prev.map((c, i) => i === idx ? { ...c, volume: parseInt(e.target.value) / 100 } : c))} style={{ width: '80px', accentColor: '#4ade80' }} />
                        <span style={{ fontSize: '11px', minWidth: '30px' }}>{Math.round((clip.volume || 1) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Job Status — inside workspace */}
              {job.status !== "idle" && (
                <div className="job-status-bar">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: '#e2e8f0' }}>{job.message}</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#4ade80' }}>{job.percent}%</span>
                  </div>
                  <div style={{ height: 6, background: '#1e293b', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${job.percent}%`, background: '#22c55e', borderRadius: 3, transition: 'width 0.3s' }} />
                  </div>
                  {job.status === "done" && job.file && (
                    <a href={job.file} download style={{ display: 'inline-block', marginTop: 8, color: '#4ade80', fontWeight: 600, fontSize: '13px' }}>Download Video</a>
                  )}
                </div>
              )}

              {/* Highlights Panel — always visible under timeline for adding clips */}
              {highlightsWithQuotes.length > 0 && (
                <div style={{ padding: '12px 16px', borderTop: '1px solid #1e293b' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      ⭐ AI Highlights ({highlightsWithQuotes.length})
                    </span>
                    <span style={{ fontSize: '10px', color: '#64748b' }}>click + to add to timeline</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '240px', overflowY: 'auto' }}>
                    {highlightsWithQuotes.slice(0, 10).map((h, i) => {
                      const ts = findQuoteTimestamp(h.quote || h.highlight, sents, videoOptions.clipPadding || 4);
                      const alreadyInTimeline = ts && clipBasket.some(c => Math.abs(c.start - (ts.start - (videoOptions.clipPadding || 4))) < 2);
                      return (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                          background: alreadyInTimeline ? '#0d2818' : '#141b24', borderRadius: 6,
                          cursor: 'pointer', transition: 'background 0.15s',
                          border: alreadyInTimeline ? '1px solid #166534' : '1px solid transparent',
                        }}
                        onMouseEnter={(e) => { if (!alreadyInTimeline) e.currentTarget.style.background = '#1a2332'; }}
                        onMouseLeave={(e) => { if (!alreadyInTimeline) e.currentTarget.style.background = '#141b24'; }}
                        onClick={() => {
                          if (playerRef.current && ts) {
                            playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(ts.start)}&autoplay=1&enablejsapi=1`;
                          }
                        }}>
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '10px', fontWeight: 700, flexShrink: 0,
                            background: alreadyInTimeline ? '#166534' : '#1e293b', color: alreadyInTimeline ? '#4ade80' : '#94a3b8',
                          }}>{i + 1}</span>
                          <span style={{ flex: 1, fontSize: '12px', color: '#cbd5e1', lineHeight: 1.4 }}>{h.highlight}</span>
                          {alreadyInTimeline ? (
                            <span style={{ fontSize: '10px', color: '#4ade80', fontWeight: 600, whiteSpace: 'nowrap', flexShrink: 0 }}>✓ In timeline</span>
                          ) : (
                            <button onClick={(e) => {
                              e.stopPropagation();
                              if (ts) {
                                updateClipBasket(prev => [...prev, {
                                  start: Math.max(0, ts.start - (videoOptions.clipPadding || 4)),
                                  end: ts.end + (videoOptions.clipPadding || 4),
                                  label: h.highlight, highlight: h.highlight, speaker: h.speaker
                                }]);
                                addToast(`✂️ Highlight ${i + 1} added to timeline!`);
                              }
                            }} style={{
                              background: '#166534', color: '#4ade80', border: 'none', borderRadius: 4,
                              padding: '3px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                              whiteSpace: 'nowrap', flexShrink: 0, transition: 'background 0.15s',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#15803d'}
                            onMouseLeave={(e) => e.currentTarget.style.background = '#166534'}
                            title="Add this highlight to the editing timeline">+ Add</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Floating "Create Clip" button — appears on text selection */}
            {floatingClipBtn && (
              <button className="floating-clip-btn" style={{ left: floatingClipBtn.x, top: floatingClipBtn.y, transform: 'translate(-50%, -100%)' }} onClick={createClipFromSelection}>
                ✂️ Create Clip
              </button>
            )}

            {/* Search/analysis sections moved to BEFORE the editor — see search-zone above */}

            {/* ================================================================
               BOTTOM: AI Summary + Highlights + Transcript Tools
               ================================================================ */}
            <div className="desktop-bottom-panel">
              {/* Summary + Highlights (when searching, they move here) */}
              {(expanded.open || matches.length > 0) && summary.para && (
                <div className="bottom-panel-section">
                  <div className="insights-section-title">🧠 AI Summary</div>
                  <div style={{ fontSize: '13px', lineHeight: 1.6, color: '#334155' }}>{summary.para}</div>
                </div>
              )}
              {(expanded.open || matches.length > 0) && highlightsWithQuotes.length > 0 && (
                <div className="bottom-panel-section">
                  <div className="insights-section-title">⭐ AI Highlights ({highlightsWithQuotes.length}) <span style={{ fontSize: '10px', fontWeight: 400, color: '#64748b', textTransform: 'none', letterSpacing: 0 }}>— click + to add to timeline</span></div>
                  {highlightsWithQuotes.slice(0, 10).map((h, i) => {
                    const ts = findQuoteTimestamp(h.quote || h.highlight, sents, videoOptions.clipPadding || 4);
                    const alreadyInTimeline = ts && clipBasket.some(c => Math.abs(c.start - (ts.start - (videoOptions.clipPadding || 4))) < 2);
                    return (
                      <div key={i} className={`insights-highlight-item ${alreadyInTimeline ? 'insights-highlight-in-timeline' : ''}`} onClick={() => {
                        if (playerRef.current && ts) {
                          playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(ts.start)}&autoplay=1&enablejsapi=1`;
                        }
                      }}>
                        <span className="insights-highlight-num">{i + 1}</span>
                        <span style={{ flex: 1, color: '#334155' }}>{h.highlight}</span>
                        {alreadyInTimeline ? (
                          <span style={{ fontSize: '10px', color: '#22c55e', fontWeight: 600, whiteSpace: 'nowrap' }}>✓ In timeline</span>
                        ) : (
                          <button className="insights-highlight-add" onClick={(e) => {
                            e.stopPropagation();
                            if (ts) {
                              updateClipBasket(prev => [...prev, { start: Math.max(0, ts.start - (videoOptions.clipPadding || 4)), end: ts.end + (videoOptions.clipPadding || 4), label: h.highlight, highlight: h.highlight, speaker: h.speaker }]);
                              addToast(`✂️ Highlight ${i + 1} added to timeline!`);
                            }
                          }} title="Add this highlight to the editing timeline">+ Add</button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Transcript Tools moved to word cloud column */}

              {/* Translation result */}
              {translation.show && (
                <div className="bottom-panel-section" style={{ background: '#fef3c7' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '12px' }}>🌐 {translation.lang}</span>
                    <button onClick={() => setTranslation(prev => ({ ...prev, show: false }))} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px' }}>✕</button>
                  </div>
                  <div style={{ fontSize: '12px', lineHeight: 1.5 }}>{translation.text}</div>
                </div>
              )}

              {/* Share */}
              {videoId && (expanded.open || matches.length > 0) && (
                <div className="bottom-panel-section"><SharePanel videoId={videoId} videoTitle={videoTitle} /></div>
              )}
            </div>

            {/* Keyboard Shortcuts Overlay */}
            {showShortcutOverlay && (
              <div className="shortcuts-overlay" onClick={() => setShowShortcutOverlay(false)} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
                <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
                  <h2>Keyboard Shortcuts</h2>
                  <p className="shortcuts-subtitle">Timeline editing shortcuts (press ? to toggle)</p>
                  <div className="shortcuts-grid">
                    <div className="shortcut-item"><span className="shortcut-label">Undo</span><kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+Z</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Redo</span><kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}+⇧+Z</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Delete clip</span><kbd>Del</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Split clip</span><kbd>S</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Nudge left</span><kbd>&#8592;</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Nudge right</span><kbd>&#8594;</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Preview clip</span><kbd>Space</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Set in-point</span><kbd>I</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Set out-point</span><kbd>O</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Seek back 5s</span><kbd>J</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Play/Pause</span><kbd>K</kbd></div>
                    <div className="shortcut-item"><span className="shortcut-label">Seek fwd 5s</span><kbd>L</kbd></div>
                  </div>
                  <p className="shortcuts-close-hint">Press <kbd style={{ background: '#0f172a', border: '1px solid #475569', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: '#4ade80' }}>Esc</kbd> or <kbd style={{ background: '#0f172a', border: '1px solid #475569', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: '#4ade80' }}>?</kbd> to close</p>
                </div>
              </div>
            )}

            {/* ================================================================
               SETTINGS DRAWER — slides from right
               ================================================================ */}
            {showSettingsDrawer && <div className="settings-overlay" onClick={() => setShowSettingsDrawer(false)} />}
            <div className={`settings-drawer ${showSettingsDrawer ? 'settings-drawer-open' : ''}`} role="region" aria-label="Video settings" aria-hidden={!showSettingsDrawer}>
              <div className="settings-drawer-header">
                <h3>Settings</h3>
                <button className="settings-drawer-close" onClick={() => setShowSettingsDrawer(false)} aria-label="Close settings">✕</button>
              </div>

              {/* yt-dlp Update — desktop only */}
              {!isCloudMode && <div className="settings-drawer-section">
                <div className="settings-drawer-section-title">yt-dlp (Video Downloader)</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px', lineHeight: '1.5' }}>
                  YouTube frequently blocks older versions of yt-dlp. If video downloads are failing, updating to the latest nightly build usually fixes the issue.
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="btn" style={{ fontSize: '13px', padding: '8px 14px' }}
                    onClick={async () => {
                      // Show current version first
                      try {
                        const statusResp = await fetch('/api/ytdlp/status');
                        const statusData = await statusResp.json();
                        addToast(`Current yt-dlp version: ${statusData.version}. Updating...`);
                      } catch {}
                      // Run update
                      try {
                        const resp = await fetch('/api/ytdlp/update', { method: 'POST' });
                        const data = await resp.json();
                        if (data.success) {
                          addToast(`yt-dlp updated: ${data.old_version} → ${data.new_version}`);
                        } else {
                          addToast(`yt-dlp update failed: ${data.error || 'Unknown error'}`);
                        }
                      } catch (e) {
                        addToast(`yt-dlp update failed: ${e.message}`);
                      }
                    }}>
                    Update to Latest Nightly
                  </button>
                  <button className="btn" style={{ fontSize: '13px', padding: '8px 14px' }}
                    onClick={async () => {
                      try {
                        const resp = await fetch('/api/ytdlp/status');
                        const data = await resp.json();
                        addToast(`yt-dlp version: ${data.version}`);
                      } catch (e) {
                        addToast('Could not check yt-dlp version');
                      }
                    }}>
                    Check Version
                  </button>
                </div>
              </div>}

              {/* Full Video Download — desktop only */}
              {!isCloudMode && <div className="settings-drawer-section">
                <div className="settings-drawer-section-title">Download Full Video</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select value={downloadResolution} onChange={(e) => setDownloadResolution(e.target.value)} style={{ flex: 1, padding: '8px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px' }}>
                    {availableFormats.length > 0 ? availableFormats.map(f => (
                      <option key={f.label} value={f.label}>{f.label === 'best' ? 'Best Quality' : f.label}</option>
                    )) : (
                      <><option value="best">Best Quality</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option><option value="360p">360p</option></>
                    )}
                  </select>
                  <button className="btn btn-primary" disabled={loading.mp4} onClick={async () => {
                    setLoading(l => ({...l, mp4: true}));
                    try {
                      const res = await apiDownloadMp4({ videoId, resolution: downloadResolution });
                      if (res.file) {
                        window.open(res.file, '_blank');
                        addDownload(`${videoId}.mp4`, res.file, 'full_video');
                      }
                    } catch(e) { alert('Download failed: ' + e.message); }
                    setLoading(l => ({...l, mp4: false}));
                  }} style={{ whiteSpace: 'nowrap' }}>
                    {loading.mp4 ? 'Downloading...' : 'Download MP4'}
                  </button>
                </div>
              </div>}

              {/* Quality */}
              <div className="settings-drawer-section">
                <div className="settings-drawer-section-title">Quality</div>
                <div className="editor-settings-row">
                  <div className="editor-option-inline">
                    <label>Resolution</label>
                    <select value={videoOptions.resolution || '720p'} onChange={(e) => setVideoOptions(v => ({ ...v, resolution: e.target.value }))}>
                      {availableFormats.length > 0 ? availableFormats.map(f => (
                        <option key={f.label} value={f.label}>{f.label === 'best' ? 'Best' : f.label}</option>
                      )) : (
                        <><option value="best">Best</option><option value="1080p">1080p</option><option value="720p">720p</option><option value="480p">480p</option></>
                      )}
                    </select>
                  </div>
                  <div className="editor-option-inline">
                    <label>Speed</label>
                    <select value={videoOptions.playbackSpeed || '1.0'} onChange={(e) => setVideoOptions(v => ({ ...v, playbackSpeed: e.target.value }))}>
                      <option value="0.75">0.75x</option><option value="1.0">1.0x</option><option value="1.25">1.25x</option><option value="1.5">1.5x</option>
                    </select>
                  </div>
                  <div className="editor-option-inline">
                    <label>Normalize</label>
                    <button className={`toggle-pill ${videoOptions.normalizeAudio ? 'toggle-pill-on' : 'toggle-pill-off'}`} onClick={() => setVideoOptions(v => ({ ...v, normalizeAudio: !v.normalizeAudio }))}>
                      {videoOptions.normalizeAudio ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Effects */}
              <div className="settings-drawer-section">
                <div className="settings-drawer-section-title">Effects</div>
                <div className="editor-settings-row">
                  <div className="editor-option-inline">
                    <label>Captions</label>
                    <button className={`toggle-pill ${reelCaptionsEnabled ? 'toggle-pill-on' : 'toggle-pill-off'}`} onClick={() => setReelCaptionsEnabled(!reelCaptionsEnabled)}>
                      {reelCaptionsEnabled ? 'ON' : 'OFF'}
                    </button>
                  </div>
                  <div className="editor-option-inline">
                    <label>Color</label>
                    <select value={videoOptions.colorFilter} onChange={(e) => setVideoOptions(v => ({ ...v, colorFilter: e.target.value }))}>
                      <option value="none">None</option><option value="warm">Warm</option><option value="cool">Cool</option><option value="cinematic">Cinematic</option><option value="high_contrast">High Contrast</option>
                    </select>
                  </div>
                  <div className="editor-option-inline">
                    <label>Transitions</label>
                    <select value={videoOptions.transitionType || 'none'} onChange={(e) => setVideoOptions(v => ({ ...v, transitionType: e.target.value, transitions: e.target.value !== 'none' }))}>
                      <option value="none">None</option><option value="fade">Fade</option><option value="dissolve">Dissolve</option><option value="wiperight">Wipe Right</option><option value="slideleft">Slide Left</option><option value="slideright">Slide Right</option><option value="circlecrop">Circle</option><option value="pixelize">Pixelize</option>
                    </select>
                  </div>
                  <div className="editor-option-inline">
                    <label>Music</label>
                    <button className={`toggle-pill ${videoOptions.backgroundMusic ? 'toggle-pill-on' : 'toggle-pill-off'}`} onClick={() => setVideoOptions(v => ({ ...v, backgroundMusic: !v.backgroundMusic }))}>
                      {videoOptions.backgroundMusic ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Branding */}
              <div className="settings-drawer-section">
                <div className="settings-drawer-section-title">Branding</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Intro Title</label>
                    <input value={videoOptions.introTitle} onChange={(e) => setVideoOptions(v => ({ ...v, introTitle: e.target.value }))} placeholder="e.g. Meeting Highlights" style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Intro Subtitle</label>
                    <input value={videoOptions.introSubtitle} onChange={(e) => setVideoOptions(v => ({ ...v, introSubtitle: e.target.value }))} placeholder="Optional" style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Outro Title</label>
                    <input value={videoOptions.outroTitle} onChange={(e) => setVideoOptions(v => ({ ...v, outroTitle: e.target.value }))} placeholder="e.g. Thanks for Watching" style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Outro CTA</label>
                    <input value={videoOptions.outroCta} onChange={(e) => setVideoOptions(v => ({ ...v, outroCta: e.target.value }))} placeholder="e.g. Subscribe" style={{ width: '100%', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '13px', boxSizing: 'border-box' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div className="editor-option-inline">
                      <label>Chapter Titles</label>
                      <button className={`toggle-pill ${videoOptions.showHighlightLabels !== false ? 'toggle-pill-on' : 'toggle-pill-off'}`} onClick={() => setVideoOptions(v => ({ ...v, showHighlightLabels: !(v.showHighlightLabels !== false) }))}>
                        {videoOptions.showHighlightLabels !== false ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <div className="editor-option-inline">
                      <label>Watermark</label>
                      <button className={`toggle-pill ${videoOptions.logoWatermark ? 'toggle-pill-on' : 'toggle-pill-off'}`} onClick={() => setVideoOptions(v => ({ ...v, logoWatermark: !v.logoWatermark }))}>
                        {videoOptions.logoWatermark ? 'ON' : 'OFF'}
                      </button>
                    </div>
                    <div className="editor-option-inline">
                      <label>Speaker Labels</label>
                      <button className={`toggle-pill ${videoOptions.lowerThirds ? 'toggle-pill-on' : 'toggle-pill-off'}`} onClick={() => setVideoOptions(v => ({ ...v, lowerThirds: !v.lowerThirds }))}>
                        {videoOptions.lowerThirds ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ================================================================
           CLOUD / PRE-VIDEO LAYOUT (existing two-column layout)
           ================================================================ */}
        {!videoId && (
        <div className="twowide">
          <section className="card section left-column animate-fadeIn">
            {!expanded.open && (
              <>
                {/* FIXED: Tooltip ABOVE search bar with spacing */}
                {!query && !matches.length && videoId && (
                  <div className="search-tooltip-green-above">
                    <strong>Try searching!</strong> Or click any word below to see all mentions
                  </div>
                )}

                <div id="search-section" style={{ display: "flex", gap: 8, alignItems: "center", marginTop: !query && !matches.length && videoId ? '12px' : '0' }}>
                  <input
                    className="input"
                    placeholder={t.search}
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    disabled={!videoId}
                  />
                </div>

                {/* v5.7: Investigate button appears when searching */}
                {query && videoId && (
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '12px', 
                    marginTop: '12px',
                    padding: '12px 16px',
                    background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
                    borderRadius: '8px',
                    border: '1px solid #bae6fd'
                  }}>
                    <span style={{ fontSize: '14px', color: '#0369a1' }}>
                      Searching for: <strong>"{fixBrooklyn(query)}"</strong>
                    </span>
                    <button
                      className="btn btn-accent"
                      onClick={() => {
                        setInvestigateWord({ text: fixBrooklyn(query) });
                        setInvestigateViewMode('news');
                      }}
                      style={{ 
                        marginLeft: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      🔍 Investigate
                    </button>
                  </div>
                )}


                {hits.length > 0 && matches.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color: "#334155", marginBottom: 6 }}>Timeline</div>
                    <div className="spark">
                      {hits.map((h, i) => (
                        <div
                          key={i}
                          className={`bar ${h > 0 ? "on" : ""} animate-grow`}
                          style={{
                            height: Math.min(42, 6 + h * 6),
                            animationDelay: `${i * 0.02}s`
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {matches.length > 0 && (
                  <div className="results-scroll" style={{ marginTop: 12 }}>
                    {matches.map((m, i) => (
                      <SearchResultCard
                        key={i}
                        match={m.match}
                        query={query}
                        t={t}
                        openExpandedAt={openExpandedAt}
                        addToBasket={addToBasket}
                        playerRef={playerRef}
                        videoId={videoId}
                        pad={pad}
                      />
                    ))}
                  </div>
                )}

                {matches.length === 0 && query && videoId && (
                  <div style={{ marginTop: 20, padding: 20, textAlign: "center", color: "#64748b" }}>
                    {t.noMatches} "{query}"
                  </div>
                )}

                {words.length > 0 && (
                  <div className="visualization-card word-cloud-container" style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700, marginBottom: 12 }}>
                      {t.wordCloud} - Key Terms
                    </div>
                    <div className="word-cloud-expanded">
                      {words.map((w, i) => {
                        const maxCount = words[0].count;
                        const ratio = w.count / maxCount;

                        let sizeClass = 'word-tiny';
                        if (ratio > 0.7) sizeClass = 'word-mega';
                        else if (ratio > 0.5) sizeClass = 'word-xl';
                        else if (ratio > 0.35) sizeClass = 'word-large';
                        else if (ratio > 0.2) sizeClass = 'word-medium';
                        else if (ratio > 0.1) sizeClass = 'word-small';

                        const colors = ['#1e7f63', '#2d9f7f', '#3cbf9f', '#4ddfbf', '#5fffdf'];
                        const colorIndex = Math.floor((1 - ratio) * (colors.length - 1));

                        return (
                          <span
                            key={w.text}
                            className={`word-cloud-item ${sizeClass} ${i < 3 ? 'pulse-word' : ''}`}
                            style={{
                              color: colors[colorIndex],
                              animationDelay: `${i * 0.1}s`,
                              fontWeight: ratio > 0.5 ? '900' : ratio > 0.3 ? '700' : ratio > 0.15 ? '500' : '400',
                              cursor: 'pointer'
                            }}
                            title={`Click to search "${fixBrooklyn(w.text)}" (Count: ${w.count})`}
                            onClick={() => {
                              setQuery(fixBrooklyn(w.text));
                            }}
                          >
                            {fixBrooklyn(w.text)}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {/* Jargon Translator - Only show after word cloud is created */}
                {words.length > 0 && (
                  <JargonTranslatorPanel />
                )}
              </>
            )}

            {expanded.open && (
              <div className="expanded-wrap animate-slideIn">
                <div className="expanded-header">
                  <div style={{ fontWeight: 700 }}>{t.search}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="btn btn-primary animate-hover" onClick={saveSelectionAsClip}>{t.saveSel}</button>
                    <button className="btn btn-secondary animate-hover" onClick={() => setExpanded({ open: false, focusIdx: null })}>{t.back}</button>
                  </div>
                </div>
                <div className="expanded-body" ref={transcriptRef}>
                  {sents.map((s, idx) => {
                    const isFocus = idx === expanded.focusIdx;
                    return (
                      <span
                        key={idx}
                        id={`sent-${idx}`}
                        className={`sent ${isFocus ? "hit" : ""}`}
                        data-idx={idx}
                        data-start={s.start}
                        data-end={s.end}
                        style={{ display: 'inline-flex', alignItems: 'center' }}
                      >
                        {s.text}{" "}
                        <button className="touch-add-btn" onClick={(e) => {
                          e.stopPropagation();
                          const clip = { start: Math.max(0, s.start - videoOptions.clipPadding), end: (s.end || s.start + 15) + videoOptions.clipPadding, label: s.text.slice(0, 60), highlight: s.text.slice(0, 60), text: s.text };
                          updateClipBasket(prev => [...prev, clip]);
                          addToast('Clip added to timeline');
                        }} title="Add clip">+</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="card section right-column animate-fadeIn">
            {/* 1. VIDEO PLAYER - First */}
            {videoId && (
              <div className="video-section animate-slideIn">
                <div style={{ fontWeight: 700, marginBottom: 12 }}>{t.videoPlayer}</div>
                <iframe
                  ref={playerRef}
                  title="video-player"
                  className="video-frame"
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=0&mute=0&playsinline=1`}
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />

                {/* Hero Button - One-Click Highlight Reel (cloud) */}
                <div className="hero-reel-section" style={{ marginTop: 12 }}>
                  <button className="hero-reel-btn" onClick={() => buildReel('combined')} disabled={loading.reel || loading.summary}>
                    {loading.reel ? 'Building Reel...' : 'Make a 2-Minute Highlight Reel'}
                  </button>
                  <div className="hero-reel-subtitle">AI selects the best moments with sensible defaults</div>
                </div>

                {/* Template Presets (cloud) */}
                <TemplatePresets onSelect={(preset) => {
                  setVideoOptions(v => ({ ...v, resolution: preset.resolution }));
                  buildReel(preset.format);
                }} />

                {/* Share Panel (cloud) */}
                <SharePanel videoId={videoId} videoTitle={videoTitle} />
              </div>
            )}

            {/* 2. CLIP BASKET - Under video */}
            {clipBasket.length > 0 && (
              <div className="basket-section animate-slideIn" style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {t.savedClips}: {clipBasket.length}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {isCloudMode ? (
                      clipBasket.length <= 5 ? (
                        <button
                          className="btn btn-primary animate-hover"
                          onClick={() => setShowExportModal(true)}
                          title="Export up to 5 clips (2 min max) in cloud mode"
                        >
                          {t.exportClips} (Cloud)
                        </button>
                      ) : (
                        <button
                          className="btn animate-hover"
                          onClick={() => window.open('https://github.com/amateurmenace/community-highlighter/releases/latest', '_blank')}
                          style={{ background: '#e2e8f0', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                          title="Too many clips for cloud — download desktop app for unlimited export"
                        >
                          {t.exportClips} (6+ clips: Desktop only)
                        </button>
                      )
                    ) : (
                      <button
                        className="btn btn-primary animate-hover"
                        onClick={() => setShowExportModal(true)}
                      >
                        {t.exportClips}
                      </button>
                    )}
                    <button className="btn btn-ghost animate-hover" onClick={clearBasket}>
                      {t.clearBasket}
                    </button>
                  </div>
                </div>
                <div className="basket-list">
                  {clipBasket.map((clip, idx) => (
                    <ClipPreview
                      key={idx}
                      clip={clip}
                      videoId={videoId}
                    />
                  ))}
                </div>

                {/* Timeline Preview */}
                {clipThumbnails.length > 0 && (
                  <div style={{ marginTop: '12px', overflowX: 'auto', display: 'flex', gap: '8px', padding: '8px 0' }}>
                    {clipThumbnails.map((thumb, idx) => (
                      <div key={idx} style={{
                        flex: '0 0 auto', width: '160px', borderRadius: '8px', overflow: 'hidden',
                        border: '2px solid #e2e8f0', background: '#f8fafc'
                      }}>
                        <img src={thumb.url} alt={`Clip ${idx + 1}`} style={{ width: '160px', height: '90px', objectFit: 'cover' }} />
                        <div style={{ padding: '4px 6px' }}>
                          <div style={{ fontSize: '10px', color: '#64748b' }}>{Math.floor(thumb.start / 60)}:{String(Math.floor(thumb.start % 60)).padStart(2, '0')} - {Math.floor(thumb.end / 60)}:{String(Math.floor(thumb.end % 60)).padStart(2, '0')} ({thumb.duration}s)</div>
                          <div style={{ fontSize: '11px', color: '#334155', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{thumb.highlight}</div>
                        </div>
                      </div>
                    ))}
                    <div style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', padding: '0 12px', fontSize: '12px', color: '#64748b' }}>
                      Total: {clipThumbnails.reduce((sum, t) => sum + t.duration, 0).toFixed(0)}s
                    </div>
                  </div>
                )}

                {clipThumbnails.length === 0 && clipBasket.length > 0 && (
                  <button
                    onClick={() => {
                      apiClipThumbnails({ videoId, clips: clipBasket })
                        .then(data => { if (data.thumbnails) setClipThumbnails(data.thumbnails); });
                    }}
                    style={{ marginTop: '8px', fontSize: '11px', color: '#1E7F63', background: 'none', border: '1px solid #1E7F63', borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}
                  >
                    Load Timeline Preview
                  </button>
                )}
              </div>
            )}

            {/* 3. JOB STATUS / PROCESSING METER - Under clip basket */}
            {job.status !== "idle" && (
              <div className="status-section animate-slideIn" style={{ marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontWeight: 700 }}>{t.processing}</div>
                  <div className={`status-badge ${job.status}`}>
                    {job.status === "done" ? t.ready : job.status === "error" ? t.error : t.processing}
                  </div>
                </div>
                <div className="progress-bar" style={{ marginTop: 8 }}>
                  <div className="progress-fill" style={{ width: `${job.percent || 0}%` }}>
                    {job.percent > 0 && <span>{job.percent}%</span>}
                  </div>
                </div>

                {job.zip && (
                  <div style={{ marginTop: 12 }}>
                    <a className="btn btn-primary animate-hover" href={job.zip.startsWith('http') ? job.zip : `${BACKEND_URL}${job.zip}`} download>
                      {t.downloadFile}
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* v5.2: Live Meeting Mode removed */}

            {/* 4. HIGHLIGHT REEL ACTIONS - At bottom */}
            {videoId && (
              <div className="actions-section-vertical animate-slideIn" style={{ marginTop: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>
                  {t.createReel}
                </div>

                {/* Captions Toggle */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 16px',
                  background: '#f8fafc',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  border: '1px solid #e2e8f0'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '14px', color: '#1e293b' }}>
                      Include Captions
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                      Adds subtitles and highlight labels to video
                    </div>
                  </div>
                  <button
                    onClick={() => setReelCaptionsEnabled(!reelCaptionsEnabled)}
                    style={{
                      width: '48px',
                      height: '26px',
                      borderRadius: '13px',
                      border: 'none',
                      cursor: 'pointer',
                      background: reelCaptionsEnabled ? '#1E7F63' : '#cbd5e1',
                      position: 'relative',
                      transition: 'background 0.2s'
                    }}
                  >
                    <div style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      background: 'white',
                      position: 'absolute',
                      top: '2px',
                      left: reelCaptionsEnabled ? '24px' : '2px',
                      transition: 'left 0.2s',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </button>
                </div>

                {/* v6.1: Share a Moment button */}
                {videoId && (
                  <ShareMoment 
                    videoId={videoId}
                    sents={sents}
                    playerRef={playerRef}
                  />
                )}

                {/* 🎬 Advanced Video Options */}
                <div style={{
                  background: '#f1f5f9',
                  borderRadius: '8px',
                  marginBottom: '12px',
                  border: '1px solid #e2e8f0',
                  overflow: 'hidden'
                }}>
                  <button
                    onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                    style={{
                      width: '100%',
                      padding: '12px 16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#475569'
                    }}
                  >
                    <span>🎬 Advanced Video Options</span>
                    <span style={{ transform: showAdvancedOptions ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
                  </button>
                  
                  {showAdvancedOptions && (
                    <div style={{ padding: '0 16px 16px 16px' }}>
                      {/* Clip Padding - Always available */}
                      <div style={{ marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0' }}>
                        <label style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', display: 'block', marginBottom: '6px' }}>
                          ⏱️ Clip Padding
                        </label>
                        <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '8px' }}>
                          Extra seconds before/after each highlight
                        </div>
                        <select
                          value={videoOptions.clipPadding}
                          onChange={(e) => setVideoOptions(v => ({ ...v, clipPadding: parseInt(e.target.value) }))}
                          style={{
                            width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0',
                            fontSize: '13px', background: 'white'
                          }}
                        >
                          <option value="1">1 second (very tight)</option>
                          <option value="2">2 seconds (tight)</option>
                          <option value="3">3 seconds</option>
                          <option value="4">4 seconds (recommended)</option>
                          <option value="5">5 seconds (relaxed)</option>
                          <option value="6">6 seconds (extra context)</option>
                        </select>
                      </div>

                      {/* 🎵 BACKGROUND MUSIC - New prominent option */}
                      <div style={{ 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                        marginBottom: '16px', padding: '12px', background: '#fef3c7', borderRadius: '8px'
                      }}>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#92400e' }}>🎵 Background Music</span>
                          <div style={{ fontSize: '11px', color: '#b45309' }}>Light upbeat music at 12% volume</div>
                        </div>
                        <button
                          onClick={() => setVideoOptions(v => ({ ...v, backgroundMusic: !v.backgroundMusic }))}
                          style={{
                            width: '44px', height: '24px', borderRadius: '12px', border: 'none', cursor: 'pointer',
                            background: videoOptions.backgroundMusic ? '#f59e0b' : '#cbd5e1', position: 'relative'
                          }}
                        >
                          <div style={{
                            width: '20px', height: '20px', borderRadius: '50%', background: 'white',
                            position: 'absolute', top: '2px', left: videoOptions.backgroundMusic ? '22px' : '2px',
                            transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                          }} />
                        </button>
                      </div>

                      {/* Fade Transitions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <span style={{ fontSize: '13px', color: '#475569' }}>✨ Fade Transitions</span>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Smooth fades between clips</div>
                        </div>
                        <button
                          onClick={() => setVideoOptions(v => ({ ...v, transitions: !v.transitions }))}
                          style={{
                            width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                            background: videoOptions.transitions ? '#1E7F63' : '#cbd5e1', position: 'relative'
                          }}
                        >
                          <div style={{
                            width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                            position: 'absolute', top: '2px', left: videoOptions.transitions ? '20px' : '2px',
                            transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                          }} />
                        </button>
                      </div>

                      {/* Color Filter */}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '13px', color: '#475569', display: 'block', marginBottom: '4px' }}>🎨 Color Style</label>
                        <select
                          value={videoOptions.colorFilter}
                          onChange={(e) => setVideoOptions(v => ({ ...v, colorFilter: e.target.value }))}
                          style={{
                            width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0',
                            fontSize: '13px', background: 'white'
                          }}
                        >
                          <option value="none">Original (no filter)</option>
                          <option value="warm">Warm (friendly)</option>
                          <option value="cool">Cool (professional)</option>
                          <option value="high_contrast">High Contrast (bold)</option>
                          <option value="cinematic">Cinematic (dramatic)</option>
                        </select>
                      </div>

                      {/* Playback Speed */}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '13px', color: '#475569', display: 'block', marginBottom: '4px' }}>⚡ Playback Speed</label>
                        <select
                          value={videoOptions.playbackSpeed || '1.0'}
                          onChange={(e) => setVideoOptions(v => ({ ...v, playbackSpeed: e.target.value }))}
                          style={{
                            width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0',
                            fontSize: '13px', background: 'white'
                          }}
                        >
                          <option value="0.75">0.75x (slower)</option>
                          <option value="1.0">1.0x (normal)</option>
                          <option value="1.25">1.25x (slightly faster)</option>
                          <option value="1.5">1.5x (faster)</option>
                        </select>
                      </div>

                      {/* Show Highlight Labels */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <span style={{ fontSize: '13px', color: '#475569' }}>🏷️ Show Highlight Labels</span>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Display summary text on video</div>
                        </div>
                        <button
                          onClick={() => setVideoOptions(v => ({ ...v, showHighlightLabels: v.showHighlightLabels !== false }))}
                          style={{
                            width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                            background: videoOptions.showHighlightLabels !== false ? '#1E7F63' : '#cbd5e1', position: 'relative'
                          }}
                        >
                          <div style={{
                            width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                            position: 'absolute', top: '2px', left: videoOptions.showHighlightLabels !== false ? '20px' : '2px',
                            transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                          }} />
                        </button>
                      </div>

                      {/* Logo Watermark */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <span style={{ fontSize: '13px', color: '#475569' }}>🏢 Logo Watermark</span>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Add branding to video</div>
                        </div>
                        <button
                          onClick={() => setVideoOptions(v => ({ ...v, logoWatermark: !v.logoWatermark }))}
                          style={{
                            width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                            background: videoOptions.logoWatermark ? '#1E7F63' : '#cbd5e1', position: 'relative'
                          }}
                        >
                          <div style={{
                            width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                            position: 'absolute', top: '2px', left: videoOptions.logoWatermark ? '20px' : '2px',
                            transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                          }} />
                        </button>
                      </div>

                      {/* Audio Normalization */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div>
                          <span style={{ fontSize: '13px', color: '#475569' }}>🔊 Normalize Audio</span>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Consistent volume levels (EBU R128)</div>
                        </div>
                        <button
                          onClick={() => setVideoOptions(v => ({ ...v, normalizeAudio: !v.normalizeAudio }))}
                          style={{
                            width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                            background: videoOptions.normalizeAudio ? '#1E7F63' : '#cbd5e1', position: 'relative'
                          }}
                        >
                          <div style={{
                            width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                            position: 'absolute', top: '2px', left: videoOptions.normalizeAudio ? '20px' : '2px',
                            transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                          }} />
                        </button>
                      </div>

                      {/* Video Resolution */}
                      <div style={{ marginBottom: '12px' }}>
                        <label style={{ fontSize: '13px', color: '#475569', display: 'block', marginBottom: '4px' }}>📺 Video Resolution</label>
                        <select
                          value={videoOptions.resolution || '720p'}
                          onChange={(e) => setVideoOptions(v => ({ ...v, resolution: e.target.value }))}
                          style={{
                            width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0',
                            fontSize: '13px', background: 'white'
                          }}
                        >
                          {availableFormats.length > 0 ? (
                            availableFormats.map(f => (
                              <option key={f.label} value={f.label}>
                                {f.label === 'best' ? 'Best Available' : f.label}{f.width ? ` (${f.width}x${f.height})` : ''}
                              </option>
                            ))
                          ) : (
                            <>
                              <option value="best">Best Available</option>
                              <option value="1080p">1080p (Full HD)</option>
                              <option value="720p">720p (HD)</option>
                              <option value="480p">480p (SD)</option>
                            </>
                          )}
                        </select>
                      </div>

                      {/* Intro/Outro */}
                      <div style={{ marginTop: '12px', borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>🎬 Intro & Outro Slides</div>
                        <input
                          placeholder="Intro title (e.g. Meeting Highlights)"
                          value={videoOptions.introTitle}
                          onChange={(e) => setVideoOptions(v => ({ ...v, introTitle: e.target.value }))}
                          style={{ width: '100%', padding: '6px 8px', marginBottom: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }}
                        />
                        <input
                          placeholder="Intro subtitle (optional)"
                          value={videoOptions.introSubtitle}
                          onChange={(e) => setVideoOptions(v => ({ ...v, introSubtitle: e.target.value }))}
                          style={{ width: '100%', padding: '6px 8px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }}
                        />
                        <input
                          placeholder="Outro title (e.g. Thanks for Watching)"
                          value={videoOptions.outroTitle}
                          onChange={(e) => setVideoOptions(v => ({ ...v, outroTitle: e.target.value }))}
                          style={{ width: '100%', padding: '6px 8px', marginBottom: '6px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }}
                        />
                        <input
                          placeholder="Call-to-action (e.g. Subscribe for more)"
                          value={videoOptions.outroCta}
                          onChange={(e) => setVideoOptions(v => ({ ...v, outroCta: e.target.value }))}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '12px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  className="btn-full-width btn-muted-primary"
                  onClick={() => isCloudMode ? window.open('https://github.com/amateurmenace/community-highlighter/releases/latest', '_blank') : buildReel('combined')}
                  disabled={loading.reel}
                  style={isCloudMode ? { opacity: 0.6, cursor: 'pointer' } : {}}
                  title={isCloudMode ? 'Download desktop app for video export' : ''}
                >
                  {isCloudMode ? '🔒 ' : ''}{t.buildReel}
                </button>

                <button
                  className="btn-full-width btn-muted-social"
                  onClick={() => isCloudMode ? window.open('https://github.com/amateurmenace/community-highlighter/releases/latest', '_blank') : buildReel('social')}
                  disabled={loading.reel}
                  style={isCloudMode ? { opacity: 0.6, cursor: 'pointer' } : {}}
                  title={isCloudMode ? 'Download desktop app for video export' : ''}
                >
                  {isCloudMode ? '🔒 ' : ''}Social Media Reel (Vertical)
                </button>

                <button
                  className="btn-full-width btn-muted-translate"
                  onClick={translateTranscript}
                  disabled={loading.translate}
                >
                  {t.translateButton}
                </button>

                <button
                  className="btn-full-width btn-muted-secondary"
                  onClick={() => {
                    const blob = new Blob([fullText], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `transcript-${videoId || 'meeting'}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  disabled={!fullText}
                >
                  Download Transcript
                </button>

                <button
                  type="button"
                  className="btn-full-width btn-muted-ghost"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isCloudMode) {
                      window.open('https://github.com/amateurmenace/community-highlighter/releases/latest', '_blank');
                      return;
                    }
                    if (!videoId) {
                      alert("Please load a video first");
                      return;
                    }
                    setLoading(l => ({ ...l, mp4: true }));
                    setProcessStatus({ active: true, message: "Downloading video from YouTube...", percent: 10 });
                    try {
                      console.log("Starting video download for:", videoId);
                      const d = await apiDownloadMp4(videoId);
                      console.log("Download response:", d);
                      if (d && d.file) {
                        setProcessStatus({ active: true, message: "Download ready! Starting...", percent: 100 });
                        // Open the file download in new window
                        window.open(d.file, '_blank');
                      } else if (d && d.error) {
                        throw new Error(d.error);
                      }
                    } catch (err) {
                      console.error("Download failed:", err);
                      alert("Download failed: " + (err.message || "Unknown error. Check console for details."));
                      setProcessStatus({ active: false, message: "", percent: 0 });
                    } finally {
                      setLoading(l => ({ ...l, mp4: false }));
                      setTimeout(() => setProcessStatus({ active: false, message: "", percent: 0 }), 3000);
                    }
                  }}
                  style={isCloudMode ? { opacity: 0.6, cursor: 'pointer' } : {}}
                  title={isCloudMode ? 'Download desktop app for video export' : ''}
                >
                  {isCloudMode ? '🔒 ' : ''}{t.downloadVideo}
                </button>

                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 13 }}>{t.translateTo}</label>
                  <select
                    value={translateLang}
                    onChange={e => setTranslateLang(e.target.value)}
                    className="select-input"
                  >
                    <option value="Spanish">Spanish</option>
                    <option value="French">French</option>
                    <option value="Chinese">Chinese</option>
                    <option value="Arabic">Arabic</option>
                    <option value="Portuguese">Portuguese</option>
                    <option value="Russian">Russian</option>
                    <option value="Japanese">Japanese</option>
                    <option value="German">German</option>
                  </select>
                </div>

                {highlightsWithQuotes.length > 0 && (
                  <div className="highlights-display" style={{ marginTop: 20 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                      {t.keyHighlights}:
                    </div>
                    <div className="highlights-list">
                      {highlightsWithQuotes.map((item, i) => (
                        <div key={i} className="highlight-item" style={{ marginBottom: 16 }}>
                          <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            {i + 1}. {item.highlight}
                          </div>
                          {item.quote && (
                            <div style={{
                              paddingLeft: 20,
                              fontSize: 13,
                              color: "#64748b",
                              fontStyle: "italic",
                              borderLeft: "3px solid #97D68D",
                              marginLeft: 10,
                              paddingTop: 4,
                              paddingBottom: 4
                            }}>
                              "{item.quote}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {videoId && (
              <div className="action-buttons" style={{ marginTop: '20px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowAssistant(true);
                    setForceAssistantOpen(prev => prev + 1);
                  }}
                >
                  💬 AI Assistant
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowKnowledgeBase(!showKnowledgeBase)}
                >
                  📚 Knowledge Base
                </button>
              </div>
            )}
          </section>
        </div>
        )}

        {fullText && sents.length > 0 && (
          <>
            {/* Section 3: Video Analyzer */}
            <div className="section-divider" ref={sectionAnalyzeRef}>
              <div className="section-divider-line" />
              <div className="section-divider-title">
                Meeting Analyzer
              </div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
                See who spoke, what topics were covered, entity extraction, and cross-meeting patterns.
              </div>
            </div>

            <section id="analytics-section" className="full-width-viz card section animate-slideUp" style={{ marginTop: 0 }}>
            <h2 className="section-title">
              Meeting Analytics
            </h2>
            <div className="data-viz-container">
              {/* Meeting Scorecard removed */}

              {/* 2. People, Places & Things + Participation Tracker - SIDE BY SIDE */}
              <MentionedEntitiesCard
                entities={entities}
                isLoading={loadingEntities}
              />

              <ParticipationTracker
                sents={sents}
                entities={entities}
                openExpandedAt={openExpandedAt}
                addToBasket={addToBasket}
                playerRef={playerRef}
                videoId={videoId}
                pad={pad}
                t={t}
              />

              {/* 3. Topic Coverage Map - FULL WIDTH with time axis */}
              <TopicHeatMap
                fullText={fullText}
                sents={sents}
                openExpandedAt={openExpandedAt}
                t={t}
                addToBasket={addToBasket}
                playerRef={playerRef}
                videoId={videoId}
                pad={pad}
              />

              {/* Interactive Timeline removed — redundant with Topic Heatmap + Moments of Disagreement */}

              {/* 5. Moments of Disagreement - FULL WIDTH */}
              <DisagreementTimeline
                sents={sents}
                playerRef={playerRef}
                videoId={videoId}
                openExpandedAt={openExpandedAt}
                addToBasket={addToBasket}
                pad={pad}
              />

              {/* 6. Conversation Dynamics - FULL WIDTH */}
              <ConversationDynamics
                sents={sents}
                playerRef={playerRef}
                videoId={videoId}
              />

              {/* 7. Cross-Reference Network - FULL WIDTH */}
              <CrossReferenceNetwork
                fullText={fullText}
                entities={entities}
              />

              {/* 8. NEW: Question Flow Diagram */}
              <QuestionFlowDiagram sents={sents} onTimestampClick={jumpToTimestamp} addToBasket={addToBasket} pad={pad} />

              {/* 9. NEW: Framing Plurality Map */}
              <FramingPluralityMap sents={sents} entities={entities} onTimestampClick={jumpToTimestamp} />

              {/* 10. NEW: Disagreement Topology */}
              <DisagreementTopology sents={sents} onTimestampClick={jumpToTimestamp} addToBasket={addToBasket} pad={pad} />

              {/* 11. NEW: Issue Lifecycle */}
              <IssueLifecycle sents={sents} />

              {/* 12. Topic Subscriptions + Relevant Documents - SIDE BY SIDE */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', 
                gap: '20px',
                gridColumn: '1 / -1'
              }}>
                <TopicSubscriptionsPanel
                  transcript={fullText}
                  videoId={videoId}
                  videoTitle={videoTitle}
                />
                <RelevantDocumentsPanel
                  videoTitle={videoTitle}
                  transcript={fullText}
                  entities={entities}
                />
              </div>

              {/* Knowledge Base — cross-meeting search */}
              <KnowledgeBasePanel
                videoId={videoId}
                videoTitle={videoTitle}
                fullText={fullText}
                entities={entities}
              />
              <TopicTrendsChart />
              <EntityNetworkGraph />

              {/* Issue Tracker & Meeting Comparison */}
              <CrossMeetingAnalysisPanel
                currentVideoId={videoId}
                currentTitle={videoTitle}
                currentTranscript={fullText}
                currentEntities={entities}
                currentSummary={summary.para}
              />

            </div>
          </section>
          </>
        )}

        {/* 💬 AI Meeting Assistant - Always visible when video loaded */}
        {videoId && (
          <MeetingAssistant
            videoId={videoId}
            transcript={fullText}
            forceOpen={forceAssistantOpen}
            aiModel={aiModel}
            onTimestampClick={jumpToTimestamp}
          />
        )}

      </main>

      {/* 📚 Knowledge Base */}
      {showKnowledgeBase && (
        <section className="card section" style={{ marginTop: '20px' }}>
          <KnowledgeBase
            currentVideoId={videoId}
            onSelectMeeting={(newVideoId) => {
              const newUrl = `https://www.youtube.com/watch?v=${newVideoId}`;
              setUrl(newUrl);
              setVideoId(newVideoId);
              loadAll();
            }}
          />
        </section>
      )}

      {/* v5.10: Desktop download banner - shows above footer in cloud mode */}
      <DesktopAppBanner />

      <footer className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-main">
              Designed and developed by <a href="https://weirdmachine.org" target="_blank" rel="noopener noreferrer">stephen walter</a> at <a href="https://brooklineinteractive.org" target="_blank" rel="noopener noreferrer">Brookline Interactive Group</a>
            </div>
            <div className="footer-partner">
              In Partnership With <a href="https://NeighborhoodAI.org" target="_blank" rel="noopener noreferrer">NeighborhoodAI.org</a>
            </div>
            <div className="footer-tech">
              Built with React, FastAPI, OpenAI GPT, and Community
            </div>
            <div style={{ marginTop: '8px' }}>
              <button
                onClick={() => setShowFeedbackModal(true)}
                style={{ background: '#1e7f63', color: 'white', border: 'none', padding: '8px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
              >
                Give Feedback
              </button>
            </div>
            <div style={{ marginTop: '8px' }}>
              <button onClick={() => setShowAboutPage(true)} style={{ background: 'none', border: 'none', color: '#1e7f63', fontSize: '13px', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                About Community Highlighter
              </button>
            </div>
            <div className="footer-license">
              Licensed under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" style={{ color: '#1e7f63' }}>Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0)</a>
            </div>
            <div className="footer-website">
              <a href="https://weirdmachine.org" target="_blank" rel="noopener noreferrer">weirdmachine.org</a>
            </div>
            <div style={{ marginTop: '12px' }}>
              <a 
                href="https://github.com/amateurmenace/community-highlighter" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  background: '#24292e',
                  color: 'white',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  fontSize: '13px',
                  fontWeight: '500'
                }}
              >
                <svg height="16" width="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                View on GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>


      {/* ⚙️ NEW: Optimization Panel */}
      {showOptimizationPanel && optimizationStats && (
        <OptimizationPanel
          stats={optimizationStats}
          onClose={() => setShowOptimizationPanel(false)}
          onClearCache={async () => {
            try {
              await apiClearCache();
              alert("✦ Cache cleared!");
              const newStats = await apiOptimizationStats();
              setOptimizationStats(newStats);
            } catch (e) {
              alert("Error clearing cache");
            }
          }}
        />
      )}

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <FeedbackModal onClose={() => setShowFeedbackModal(false)} />
      )}




      {loading.transcript && <LoadingCard title="Loading transcript..." message="Fetching from YouTube" />}
      {loading.summary && <LoadingCard title="Generating AI highlights..." message={`Processing with ${aiModel}`} />}
      {loading.clips && <LoadingCard title="Processing export..." message={job.message} percent={job.percent} />}
      {loading.reel && <LoadingCard title="Building highlight reel..." message="Creating from AI highlights" />}
      {loading.translate && <LoadingCard title="Translating transcript..." message={`Translating to ${translateLang}`} />}

      {/* Guided Tour — animated tooltip walkthrough */}
      {showOnboarding && !videoId && (
        <GuidedTour onClose={() => {
          setShowOnboarding(false);
          localStorage.setItem('ch_onboarding_done', 'true');
        }} />
      )}

      {/* Mobile floating clip counter */}
      {clipBasket.length > 0 && (
        <div className="mobile-clip-counter">
          <span className="mobile-clip-counter-text">{clipBasket.length} clip{clipBasket.length !== 1 ? 's' : ''} selected</span>
          <button className="mobile-clip-counter-btn" onClick={() => setShowExportModal(true)}>
            Export Timeline
          </button>
        </div>
      )}

      {/* Toast notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className="toast">{t.message}</div>
        ))}
      </div>
    </>
  );
}