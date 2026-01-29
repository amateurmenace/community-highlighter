import React, { useEffect, useRef, useState, useCallback } from "react";

// v5.6: Desktop App Banner for cloud mode
import { DesktopAppBanner, useCloudMode } from './DesktopAppBanner';
import {
  apiTranscript, apiWordfreq, apiSummaryAI, apiTranslate,
  apiRenderJob, apiJobStatus, apiDownloadMp4, apiMetadata, apiHighlightReel,
  apiExtendedAnalytics,
  apiOptimizationStats, apiClearCache,
  apiChatWithMeeting, apiChatSuggestions,
  apiAddToKnowledgeBase, apiSearchKnowledgeBase, apiFindRelated,
  apiClipPreview, apiStartLiveMonitoring,
  apiStoreTranscript,
  // v6.0: New feature API calls
  apiCreateSubscription, apiListSubscriptions, apiDeleteSubscription, apiCheckSubscriptionMatches,
  apiCreateIssue, apiListIssues, apiAddMeetingToIssue, apiAutoTrackIssue, apiGetIssueTimeline,
  apiCompareMeetings,
  apiExplainJargon, apiGetJargonDictionary,
  apiBuildKnowledgeGraph,
  // v6.1: New feature API calls
  apiMeetingScorecard, apiShareMoment, apiGetSharedMoment,
  apiSimplifyText, apiTranslateSummary
} from "./api";

// v5.2: Use relative URLs for deployment compatibility
const BACKEND_URL = "";

// v5.2: Helper to construct WebSocket URLs
function getWebSocketUrl(path) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}${path}`;
}

// Utility functions
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
  for (const c of cues) {
    const parts = c.text.split(/(?<=[.!?])\s+/g);
    for (const p of parts) {
      if (p && p.length > 2) {
        // Additional cleaning to remove >> symbols
        const cleanText = cleanHtmlEntities(p).replace(/>>+/g, "").trim();
        if (cleanText) {
          sents.push({ start: c.start, end: c.end, text: cleanText });
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

function HowToGuide({ onOpenAssistant }) {
  const scrollToElement = (id) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.transition = 'box-shadow 0.3s';
      element.style.boxShadow = '0 0 20px rgba(30, 127, 99, 0.5)';
      setTimeout(() => {
        element.style.boxShadow = 'none';
      }, 1500);
    }
  };

  const borderColors = ['#000000', '#000000', '#000000', '#000000'];
  const numColors = ['#059669', '#0891b2', '#7c3aed', '#db2777'];  // Colored backgrounds for numbers
  const mainGreen = '#1e7f63';

  return (
    <section 
      className="how-to-permanent"
      style={{
        background: 'white',
        padding: '16px 0',
        borderBottom: '1px solid #e2e8f0'
      }}
    >
      <div className="howto" style={{ gap: '12px' }}>
        {/* Step 1: Search a Meeting */}
        <div 
          className="step step-clickable" 
          onClick={() => scrollToElement('search-section')}
          style={{ 
            cursor: 'pointer',
            padding: '18px',
            minHeight: '85px',
            border: '2px solid ' + borderColors[0],
            background: 'white',
            borderRadius: '12px'
          }}
        >
          <div className="num" style={{ 
            background: numColors[0],
            fontSize: '18px',
            width: '40px',
            height: '40px',
          }}>1</div>
          <div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '900',
              color: mainGreen,
              letterSpacing: '-0.5px'
            }}>Search a Meeting</div>
            <div className="step-subtitle" style={{ marginTop: '4px' }}>
              Use the search bar or word cloud to find anything anywhere at anytime
            </div>
          </div>
        </div>

        {/* Step 2: Talk to a Meeting */}
        <div 
          className="step step-clickable" 
          onClick={() => {
            if (onOpenAssistant) onOpenAssistant(true);
          }}
          style={{ 
            cursor: 'pointer',
            padding: '18px',
            minHeight: '85px',
            border: '2px solid ' + borderColors[1],
            background: 'white',
            borderRadius: '12px'
          }}
        >
          <div className="num" style={{ 
            background: numColors[1],
            fontSize: '18px',
            width: '40px',
            height: '40px',
          }}>2</div>
          <div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '900',
              color: mainGreen,
              letterSpacing: '-0.5px'
            }}>Talk to a Meeting</div>
            <div className="step-subtitle" style={{ marginTop: '4px' }}>
              An AI Agent will embed in the meeting and answer your questions
            </div>
          </div>
        </div>

        {/* Step 3: Analyze a Meeting */}
        <div 
          className="step step-clickable" 
          onClick={() => scrollToElement('analytics-section')}
          style={{ 
            cursor: 'pointer',
            padding: '18px',
            minHeight: '85px',
            border: '2px solid ' + borderColors[2],
            background: 'white',
            borderRadius: '12px'
          }}
        >
          <div className="num" style={{ 
            background: numColors[2],
            fontSize: '18px',
            width: '40px',
            height: '40px',
          }}>3</div>
          <div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '900',
              color: mainGreen,
              letterSpacing: '-0.5px'
            }}>Analyze a Meeting</div>
            <div className="step-subtitle" style={{ marginTop: '4px' }}>
              Use data visualizations to make quick sense of long meetings
            </div>
          </div>
        </div>

        {/* Step 4: Highlight a Meeting */}
        <div 
          className="step step-clickable" 
          onClick={() => scrollToElement('clip-basket-section')}
          style={{ 
            cursor: 'pointer',
            padding: '18px',
            minHeight: '85px',
            border: '2px solid ' + borderColors[3],
            background: 'white',
            borderRadius: '12px'
          }}
        >
          <div className="num" style={{ 
            background: numColors[3],
            fontSize: '18px',
            width: '40px',
            height: '40px',
          }}>4</div>
          <div>
            <div style={{ 
              fontSize: '22px', 
              fontWeight: '900',
              color: mainGreen,
              letterSpacing: '-0.5px'
            }}>Highlight a Meeting</div>
            <div className="step-subtitle" style={{ marginTop: '4px' }}>
              Choose clips to watch, download, & even auto edit into a reel - or have AI do it all for you!
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

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
    return isPlaceOrAddress(entity) ? 'maps' : 'wikipedia';
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
        <div className="entity-popup-overlay entity-popup-top" onClick={closeModal}>
          <div className="entity-popup-card entity-popup-positioned" onClick={(e) => e.stopPropagation()}>
            <div className="entity-popup-header">
              <h3>{selectedEntity.text}</h3>
              <button className="btn-close-popup" onClick={closeModal}>X</button>
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
                >
                  <span className="entity-name">
                    {fixBrooklyn(entity.text)}
                  </span>
                  <span className="entity-count" title={entity.type}>
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

  return (
    <div className="viz-card participation-tracker">
      <h3>📊 Participation Tracker</h3>
      <p className="viz-desc">Click metrics to see details. Click timeline to jump to video.</p>

      {/* Key Metrics - Now Clickable */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(4, 1fr)', 
        gap: '12px', 
        marginBottom: '20px' 
      }}>
        <div 
          onClick={() => handleMetricClick('publicComments')}
          style={{ 
            textAlign: 'center', 
            padding: '12px', 
            background: selectedMetric === 'publicComments' ? '#16a34a' : '#f0fdf4', 
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedMetric === 'publicComments' ? '2px solid #15803d' : '2px solid transparent'
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 700, color: selectedMetric === 'publicComments' ? 'white' : '#16a34a' }}>
            {engagementData.publicCommentCount}
          </div>
          <div style={{ fontSize: '11px', color: selectedMetric === 'publicComments' ? 'white' : '#64748b' }}>
            💬 Public Comments
          </div>
        </div>
        <div 
          onClick={() => handleMetricClick('questions')}
          style={{ 
            textAlign: 'center', 
            padding: '12px', 
            background: selectedMetric === 'questions' ? '#2563eb' : '#eff6ff', 
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedMetric === 'questions' ? '2px solid #1d4ed8' : '2px solid transparent'
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 700, color: selectedMetric === 'questions' ? 'white' : '#2563eb' }}>
            {engagementData.questionCount}
          </div>
          <div style={{ fontSize: '11px', color: selectedMetric === 'questions' ? 'white' : '#64748b' }}>
            â“ Questions
          </div>
        </div>
        <div 
          onClick={() => handleMetricClick('motions')}
          style={{ 
            textAlign: 'center', 
            padding: '12px', 
            background: selectedMetric === 'motions' ? '#d97706' : '#fef3c7', 
            borderRadius: '8px',
            cursor: 'pointer',
            transition: 'all 0.2s',
            border: selectedMetric === 'motions' ? '2px solid #b45309' : '2px solid transparent'
          }}
        >
          <div style={{ fontSize: '24px', fontWeight: 700, color: selectedMetric === 'motions' ? 'white' : '#d97706' }}>
            {engagementData.motionCount}
          </div>
          <div style={{ fontSize: '11px', color: selectedMetric === 'motions' ? 'white' : '#64748b' }}>
            🗳️️ Motions/Votes
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '12px', background: '#f5f3ff', borderRadius: '8px' }}>
          <div style={{ fontSize: '24px', fontWeight: 700, color: '#7c3aed' }}>
            {engagementData.meetingLength}m
          </div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>⏱️ Duration</div>
        </div>
      </div>

      {/* Matching Results Panel */}
      {selectedMetric && matchingResults.length > 0 && (
        <div style={{ 
          marginBottom: '16px', 
          background: '#f8fafc', 
          borderRadius: '8px', 
          padding: '12px',
          maxHeight: '200px',
          overflowY: 'auto',
          border: '1px solid #e2e8f0'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
            {selectedMetric === 'publicComments' && '💬 Public Comments Found'}
            {selectedMetric === 'questions' && 'â“ Questions Asked'}
            {selectedMetric === 'motions' && '🗳️️ Motions & Votes'}
          </div>
          {matchingResults.slice(0, 10).map((result, idx) => (
            <div 
              key={idx} 
              style={{ 
                padding: '8px', 
                marginBottom: '6px', 
                background: 'white', 
                borderRadius: '6px',
                border: '1px solid #e5e7eb'
              }}
            >
              <div style={{ fontSize: '12px', color: '#374151', marginBottom: '6px' }}>
                {result.text.slice(0, 150)}{result.text.length > 150 ? '...' : ''}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    if (playerRef?.current) {
                      const targetTime = Math.floor(result.start);
                      playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${targetTime}&autoplay=1`;
                      playerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    background: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  🎬 Video [{formatTime(result.start)}]
                </button>
                <button
                  onClick={() => openExpandedAt && openExpandedAt(result.start)}
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    background: '#10b981',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  📄 Transcript
                </button>
                <button
                  onClick={() => addToBasket && addToBasket({
                    start: Math.max(0, result.start - (pad || 3)),
                    end: result.end + (pad || 3),
                    label: result.text.slice(0, 40) + '...'
                  })}
                  style={{
                    padding: '4px 8px',
                    fontSize: '10px',
                    background: '#f59e0b',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  💾 Save Clip
                </button>
              </div>
            </div>
          ))}
          {matchingResults.length > 10 && (
            <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
              + {matchingResults.length - 10} more results
            </div>
          )}
        </div>
      )}

      {/* Activity Timeline - Now Clickable */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
          Activity Over Time (click to jump)
        </div>
        <div style={{ display: 'flex', gap: '2px', height: '40px', alignItems: 'flex-end' }}>
          {engagementData.segments.map((seg, idx) => (
            <div
              key={idx}
              onClick={() => handleSegmentClick(seg)}
              style={{
                flex: 1,
                height: `${Math.max(8, seg.activity)}%`,
                background: seg.hasPublicComment 
                  ? 'linear-gradient(to top, #16a34a, #22c55e)' 
                  : 'linear-gradient(to top, #94a3b8, #cbd5e1)',
                borderRadius: '2px 2px 0 0',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              title={`${formatTime(seg.start)} - ${formatTime(seg.end)}${seg.hasPublicComment ? ' (public comment)' : ''} - Click to jump`}
              onMouseEnter={(e) => { e.target.style.transform = 'scaleY(1.1)'; e.target.style.opacity = '0.8'; }}
              onMouseLeave={(e) => { e.target.style.transform = 'scaleY(1)'; e.target.style.opacity = '1'; }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8', marginTop: '4px' }}>
          <span>Start</span>
          <span>Middle</span>
          <span>End</span>
        </div>
      </div>

      {/* Discussion Categories (replaces sentiment/tone) */}
      <div style={{ 
        padding: '12px',
        background: '#f8fafc',
        borderRadius: '8px'
      }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '8px' }}>
          Discussion Categories
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ 
            padding: '4px 10px', 
            background: '#dbeafe', 
            color: '#1e40af', 
            borderRadius: '12px', 
            fontSize: '11px' 
          }}>
            📋 Procedural: {engagementData.discussionTypes.procedural}
          </span>
          <span style={{ 
            padding: '4px 10px', 
            background: '#f3e8ff', 
            color: '#6b21a8', 
            borderRadius: '12px', 
            fontSize: '11px' 
          }}>
            💭 Discussion: {engagementData.discussionTypes.discussion}
          </span>
          <span style={{ 
            padding: '4px 10px', 
            background: '#fef3c7', 
            color: '#92400e', 
            borderRadius: '12px', 
            fontSize: '11px' 
          }}>
            🗳️️ Action Items: {engagementData.discussionTypes.action}
          </span>
          <span style={{ 
            padding: '4px 10px', 
            background: '#dcfce7', 
            color: '#166534', 
            borderRadius: '12px', 
            fontSize: '11px' 
          }}>
            👥 Public Input: {engagementData.discussionTypes.publicInput}
          </span>
        </div>
      </div>

      <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '12px', textAlign: 'center' }}>
        💚 Green bars indicate public participation · Click metrics or timeline for details
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
        <div className="entity-popup-overlay" onClick={closeTopicModal}>
          <div className="entity-popup-card" onClick={(e) => e.stopPropagation()}>
            <div className="entity-popup-header">
              <h3>Sentences related to "{selectedTopic.name}"</h3>
              <button className="btn-close-popup" onClick={closeTopicModal}>X</button>
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

      // v6.0: Moderate filtering - require score >= 2 for balanced results
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

    setDisagreements(moments);
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
      <h3>Moments of Disagreement</h3>
      <p className="viz-desc">
        This timeline flags potential moments of disagreement or concern. Click a marker to see the clip.
      </p>
      <div className="timeline-container">
        <div className="timeline-track">
          {disagreements.map((moment, idx) => {
            const position = (moment.start / totalDuration) * 100;
            const size = 10 + (moment.intensity * 3);
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
        <div className="no-decisions">No significant disagreements detected</div>
      )}
    </div>
  );
}

// NEW: Cross-Reference Network - IMPROVED with network graph
function CrossReferenceNetwork({ fullText, entities }) {
  const [connections, setConnections] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNode, setSelectedNode] = useState(null);

  // NEW: State for draggable nodes
  const [nodePositions, setNodePositions] = useState([]);
  const [draggingNode, setDraggingNode] = useState(null);
  const svgRef = useRef(null);

  useEffect(() => {
    if (!fullText || !entities || entities.length === 0) return;

    setIsLoading(true);

    fetch('/api/analytics/cross_references', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: fullText, entities: entities })
    })
      .then(res => res.json())
      .then(data => {
        setConnections(data.connections || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Cross-reference error:', err);
        setIsLoading(false);
      });
  }, [fullText, entities]);

  // Build node positions for circular layout
  const buildNetwork = () => {
    if (connections.length === 0) return { nodes: [], edges: [] };

    const nodeSet = new Set();
    connections.forEach(conn => {
      nodeSet.add(conn.source);
      nodeSet.add(conn.target);
    });

    const nodeArray = Array.from(nodeSet);
    const centerX = 200;
    const centerY = 200;
    const radius = 150;

    const nodes = nodeArray.map((name, idx) => {
      const angle = (idx / nodeArray.length) * 2 * Math.PI;
      return {
        name,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });

    const maxStrength = Math.max(...connections.map(c => c.strength), 1);
    const edges = connections.slice(0, 20).map(conn => {
      const source = nodes.find(n => n.name === conn.source);
      const target = nodes.find(n => n.name === conn.target);
      return {
        source,
        target,
        strength: conn.strength,
        thickness: Math.max(1, (conn.strength / maxStrength) * 5)
      };
    });

    return { nodes, edges };
  };

  const network = buildNetwork();

  // NEW: Initialize node positions when network changes
  useEffect(() => {
    if (network.nodes.length > 0 && nodePositions.length === 0) {
      setNodePositions(network.nodes.map(n => ({ name: n.name, x: n.x, y: n.y })));
    }
  }, [network.nodes.length]);

  // NEW: Get current position (either from dragged state or original)
  const getNodePosition = (nodeName) => {
    const pos = nodePositions.find(n => n.name === nodeName);
    return pos || network.nodes.find(n => n.name === nodeName);
  };

  // NEW: Handle mouse down on node (start dragging)
  const handleMouseDown = (e, nodeName) => {
    e.preventDefault();
    setDraggingNode(nodeName);
  };

  // NEW: Handle mouse move (dragging)
  const handleMouseMove = (e) => {
    if (!draggingNode || !svgRef.current) return;

    // Get SVG coordinates from mouse position
    const svg = svgRef.current;
    const rect = svg.getBoundingClientRect();
    const scaleX = 400 / rect.width;  // SVG viewBox is 400x400
    const scaleY = 400 / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    // Keep nodes within bounds
    const clampedX = Math.max(25, Math.min(375, x));
    const clampedY = Math.max(25, Math.min(375, y));

    // Update the position of the dragging node
    setNodePositions(prev => {
      const updated = prev.map(node =>
        node.name === draggingNode
          ? { ...node, x: clampedX, y: clampedY }
          : node
      );
      return updated;
    });
  };

  // NEW: Handle mouse up (stop dragging)
  const handleMouseUp = () => {
    setDraggingNode(null);
  };

  // Add event listeners for dragging
  useEffect(() => {
    if (draggingNode) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [draggingNode, nodePositions]);

  const exportNetworkImage = () => {
    const svg = document.querySelector('.network-graph');
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, 400, 400);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cross-reference-network.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
  };

  return (
    <div className="viz-card cross-reference-network" style={{ gridColumn: '1 / -1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Cross-Reference Network</h3>
          <p className="viz-desc">
            Shows relationships between entities. Thicker lines = mentioned together more often.
          </p>
        </div>
        {network.nodes.length > 0 && (
          <button className="btn btn-ghost btn-export" onClick={exportNetworkImage}>
            📚 Export
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="entities-loader-container">
          <div className="spinner" />
          <span>Building network...</span>
        </div>
      ) : network.nodes.length > 0 ? (
        <>
          <svg
            ref={svgRef}
            className="network-graph"
            viewBox="0 0 400 400"
            style={{
              width: '100%',
              height: '400px',
              border: '2px solid var(--line)',
              borderRadius: '8px',
              background: 'white',
              cursor: draggingNode ? 'grabbing' : 'default'
            }}
          >
            {/* Draw edges first (behind nodes) - NOW using current positions */}
            {network.edges.map((edge, idx) => {
              const sourcePos = getNodePosition(edge.source.name);
              const targetPos = getNodePosition(edge.target.name);
              return (
                <line
                  key={`edge-${idx}`}
                  x1={sourcePos.x}
                  y1={sourcePos.y}
                  x2={targetPos.x}
                  y2={targetPos.y}
                  stroke="#94a3b8"
                  strokeWidth={edge.thickness}
                  opacity="0.6"
                />
              );
            })}

            {/* Draw nodes - NOW with drag handlers */}
            {network.nodes.map((node, idx) => {
              const currentPos = getNodePosition(node.name);
              const isBeingDragged = draggingNode === node.name;

              return (
                <g key={`node-${idx}`}>
                  <circle
                    cx={currentPos.x}
                    cy={currentPos.y}
                    r="25"
                    fill={selectedNode === node.name ? '#1e7f63' : '#97D68D'}
                    stroke={isBeingDragged ? '#ff6b6b' : '#000000'}
                    strokeWidth={isBeingDragged ? '3' : '2'}
                    style={{
                      cursor: draggingNode ? 'grabbing' : 'grab',
                      transition: isBeingDragged ? 'none' : 'all 0.2s ease'
                    }}
                    onClick={() => setSelectedNode(node.name)}
                    onMouseDown={(e) => handleMouseDown(e, node.name)}
                    onMouseEnter={(e) => e.target.style.fill = '#1e7f63'}
                    onMouseLeave={(e) => e.target.style.fill = selectedNode === node.name ? '#1e7f63' : '#97D68D'}
                  />
                  <text
                    x={currentPos.x}
                    y={currentPos.y + 4}
                    textAnchor="middle"
                    fontSize="10"
                    fontWeight="700"
                    fill="#0F172A"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {node.name.length > 12 ? node.name.slice(0, 10) + '...' : node.name}
                  </text>
                </g>
              );
            })}
          </svg>

          {selectedNode && (
            <div className="network-details" style={{ marginTop: '16px', padding: '12px', background: '#f0fdf4', border: '2px solid var(--line)', borderRadius: '8px' }}>
              <strong>Selected:</strong> {selectedNode}
              <br />
              <strong>Connections:</strong>{' '}
              {connections
                .filter(c => c.source === selectedNode || c.target === selectedNode)
                .map(c => c.source === selectedNode ? c.target : c.source)
                .join(', ')}
            </div>
          )}
        </>
      ) : (
        <div className="no-decisions">Not enough entities to build network</div>
      )}
    </div>
  );
}

// NEW: Action Items Timeline - IMPROVED with calendar view
// NEW: Conversation Dynamics - Interactive intensity heatmap
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
      setMatches(result.matches || []);
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
              <strong>{match.topic}</strong>
              <div style={{ color: '#64748b', marginTop: '4px' }}>{match.context}</div>
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
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px', fontSize: '14px' }} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for alerts (optional)"
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
      // Build search query - use direct search term + meeting
      const searchTerm = `${searchQuery} meeting`;
      
      // Fetch 20 results sorted by date
      const response = await fetch(`/api/youtube-search?q=${encodeURIComponent(searchTerm)}&type=video&maxResults=20&order=date`);
      const data = await response.json();
      
      // Check for API error in response
      if (data.error) {
        setError(data.error);
        setResults([]);
        return;
      }
      
      // Filter and sort results to prioritize civic/government content
      const civicKeywords = ['council', 'board', 'committee', 'selectboard', 'town', 'city', 'municipal', 'government', 'public', 'hearing', 'session', 'meeting'];
      let items = data.items || [];
      
      // Sort: civic-related first, then by date
      items.sort((a, b) => {
        const titleA = (a.snippet?.title || '').toLowerCase();
        const titleB = (b.snippet?.title || '').toLowerCase();
        const channelA = (a.snippet?.channelTitle || '').toLowerCase();
        const channelB = (b.snippet?.channelTitle || '').toLowerCase();
        
        const isCivicA = civicKeywords.some(kw => titleA.includes(kw) || channelA.includes(kw));
        const isCivicB = civicKeywords.some(kw => titleB.includes(kw) || channelB.includes(kw));
        
        if (isCivicA && !isCivicB) return -1;
        if (!isCivicA && isCivicB) return 1;
        
        // Both civic or neither: sort by date
        const dateA = new Date(a.snippet?.publishedAt || 0);
        const dateB = new Date(b.snippet?.publishedAt || 0);
        return dateB - dateA;
      });
      
      setResults(items);
      
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
      <h3>🏛️ Find Civic Meetings</h3>
      <p className="viz-desc">Search for government and civic meetings by city or town name. Click any result to analyze it.</p>

      {/* API Status Warning */}
      {apiStatus && !apiStatus.configured && (
        <div style={{ 
          padding: '12px 14px', 
          background: '#fef3c7', 
          borderRadius: '8px', 
          marginBottom: '16px',
          border: '1px solid #f59e0b',
        }}>
          <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '6px' }}>
            ⚠️ YouTube API Not Configured
          </div>
          <div style={{ fontSize: '12px', color: '#78350f', lineHeight: 1.5 }}>
            To use this feature, set your API key:
            <code style={{ 
              display: 'block', 
              background: '#fff', 
              padding: '8px', 
              borderRadius: '4px', 
              marginTop: '6px',
              fontFamily: 'monospace',
              fontSize: '11px',
            }}>
              export YOUTUBE_API_KEY="your-key-here"
            </code>
            <div style={{ marginTop: '8px' }}>
              Get a key at <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" style={{ color: '#1d4ed8' }}>console.cloud.google.com</a> → Enable YouTube Data API v3 → Create Credentials → API Key
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchMeetings()}
            placeholder="Enter city or town name (e.g., Boston, Arlington MA)..."
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
          Try: "Boston", "Arlington MA", "San Francisco", "Denver"
        </div>
      </div>

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
        <div style={{ padding: '12px', background: '#fef2f2', borderRadius: '8px', color: '#dc2626', fontSize: '13px', marginBottom: '12px' }}>
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
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏛️</div>
            <div>No meetings found. Try a different city or town name.</div>
          </div>
        )}
        
        {!searchQuery && results.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px', color: '#64748b', background: '#f8fafc', borderRadius: '12px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
            <div style={{ fontSize: '15px', fontWeight: 500 }}>Enter your city or town name above</div>
            <div style={{ fontSize: '13px', marginTop: '6px' }}>We'll find recent government meetings for you to analyze</div>
          </div>
        )}
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
              🏛️ Find Civic Meetings on YouTube
            </div>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <input
                type="text"
                value={searchCity}
                onChange={(e) => setSearchCity(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchCivicMeetings()}
                placeholder="Enter city or town name (e.g., Boston, Arlington MA)..."
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
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏛️</div>
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
    <div className="export-modal-overlay" onClick={onClose}>
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

function ProgressIndicator({ status, percent, message, estimatedTime, isVideoDownload }) {
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
    appSubtitle: "An AI-powered app made by the community, for the community that turns long public meetings into useful moments in minutes.",
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


// New Component: AI Meeting Assistant
function MeetingAssistant({ videoId, transcript, forceOpen = 0 }) {
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  
  // Open when forceOpen counter increments
  useEffect(() => {
    if (forceOpen > 0) {
      setIsOpen(true);
    }
  }, [forceOpen]);
  // v5.2: Uses global BACKEND_URL (empty for relative URLs)

  useEffect(() => {
    if (videoId) {
      loadSuggestions();
    }
  }, [videoId]);

  const loadSuggestions = async () => {
    try {
      const data = await apiChatSuggestions({ meetingId: videoId });
      setSuggestions(data.suggestions || []);
    } catch (error) {
      console.error("Failed to load suggestions:", error);
    }
  };

  const sendMessage = async (query) => {
    if (!query.trim()) return;

    // Add user message
    const userMessage = { type: 'user', text: query };
    setMessages(prev => [...prev, userMessage]);
    setInputQuery('');
    setLoading(true);

    try {
      const response = await apiChatWithMeeting({
        query,
        meetingId: videoId,
        contextLimit: 3
      });

      // Add assistant response
      const assistantMessage = {
        type: 'assistant',
        text: response.answer,
        sources: response.sources || []
      };
      setMessages(prev => [...prev, assistantMessage]);

      // Reload suggestions
      await loadSuggestions();
    } catch (error) {
      console.error("Chat error:", error);
      setMessages(prev => [...prev, {
        type: 'error',
        text: 'Failed to get response. Please try again.'
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="meeting-assistant">
      <button
        className="assistant-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        AI Assistant {isOpen ? '-' : '+'}
      </button>

      {isOpen && (
        <div className="assistant-panel">
          <div className="assistant-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3>Meeting Assistant</h3>
              <p>Ask questions about this meeting</p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                color: '#94a3b8',
                padding: '4px 8px',
                borderRadius: '4px',
                marginTop: '-4px'
              }}
              title="Close"
            >
              ✕
            </button>
          </div>

          {suggestions.length > 0 && messages.length === 0 && (
            <div className="suggestions">
              <p>Try asking:</p>
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  className="suggestion-chip"
                  onClick={() => sendMessage(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          <div className="chat-messages">
            {messages.map((message, idx) => (
              <div key={idx} className={`message ${message.type}`}>
                <div className="message-content">{message.text}</div>
                {message.sources && message.sources.length > 0 && (
                  <div className="message-sources">
                    <small>Sources:</small>
                    {message.sources.map((source, sidx) => (
                      <div key={sidx} className="source">
                        [{source.timestamp}] {source.text.substring(0, 50)}...
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="message assistant loading">
                <div className="typing-indicator">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
          </div>

          <div className="chat-input">
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendMessage(inputQuery)}
              placeholder="Ask about the meeting..."
              disabled={loading}
            />
            <button
              onClick={() => sendMessage(inputQuery)}
              disabled={loading || !inputQuery.trim()}
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
          onKeyPress={(e) => e.key === 'Enter' && searchKnowledgeBase()}
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
          title: '🗳️️ Votes & Decisions',
          description: 'All voting actions and formal decisions made during this meeting.',
          items: highlights?.filter(h => h.category === 'vote' || h.highlight?.toLowerCase()?.includes('vote') || h.highlight?.toLowerCase()?.includes('approv')).map(h => h.highlight || h.text) || []
        };
      case 'comments':
        return {
          title: '💬 Public Comments',
          description: 'Moments when residents and community members spoke.',
          items: highlights?.filter(h => h.category === 'public_comment' || h.highlight?.toLowerCase()?.includes('resident')).map(h => h.highlight || h.text) || []
        };
      case 'budget':
        return {
          title: '💰 Budget Items',
          description: 'Financial discussions and budget-related decisions.',
          items: highlights?.filter(h => h.category === 'budget' || h.highlight?.toLowerCase()?.includes('budget') || h.highlight?.includes('$')).map(h => h.highlight || h.text) || []
        };
      case 'topics':
        return {
          title: '📋 Key Topics',
          description: 'Main subjects discussed during the meeting.',
          items: scorecard?.hot_topics || []
        };
      case 'engagement':
        return {
          title: '📈 Engagement Score',
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
    { key: 'decisions', value: scorecard.decisions_made, label: 'Votes/Decisions', icon: '🗳️️', color: '#ef4444' },
    { key: 'comments', value: scorecard.public_comments, label: 'Public Comments', icon: '💬', color: '#2563eb' },
    { key: 'budget', value: scorecard.budget_items, label: 'Budget Items', icon: '💰', color: '#16a34a' },
    { key: 'topics', value: topicsCount, label: 'Key Topics', icon: '📋', color: '#9333ea' },
    { key: 'duration', value: scorecard.duration, label: 'Duration', icon: '⏱️', color: '#64748b', noClick: true },
    { key: 'engagement', value: `${scorecard.engagement_score}%`, label: 'Engagement', icon: '📈', color: scorecard.engagement_score > 70 ? '#16a34a' : scorecard.engagement_score > 40 ? '#eab308' : '#ef4444' },
  ];

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1' }}>
      <h3>📊 Meeting Scorecard</h3>
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
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '10px' }}>🔥 Hot Topics</div>
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
      case 'vote': case 'decision': return '🗳️️ Vote/Decision';
      case 'budget': return '💰 Budget Item';
      case 'public_comment': return '💬 Public Comment';
      default: return '⭐ Highlight';
    }
  };

  return (
    <div className="viz-card interactive-timeline" style={{ gridColumn: '1 / -1' }}>
      <h3>🎯 Interactive Timeline</h3>
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
                📄 Transcript Context
              </button>
            )}
            
            {/* Save to Basket - same as SearchResultCard */}
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
                💾 Save to Basket
              </button>
            )}
            
            {/* Video Context - same as SearchResultCard */}
            <button
              onClick={() => {
                const point = timelinePoints[expandedPoint];
                const start = Math.max(0, Math.floor(point.time - (pad || 2)));
                if (!playerRef?.current || !videoId) return;
                // Set iframe src to start playing at this time
                playerRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${start}&autoplay=1&mute=0&playsinline=1`;
                // Scroll video into view
                playerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }}
              className="btn btn-ghost"
              style={{ fontSize: '12px', padding: '8px 12px' }}
            >
              🎬 Video Context
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
  const [extendedAnalytics, setExtendedAnalytics] = useState(null);
  const [actions, setActions] = useState({ reel: "", sum: "", dl: "", tr: "" });
  const [summary, setSummary] = useState({ para: "", bullets: [] });
  const [highlightsWithQuotes, setHighlightsWithQuotes] = useState([]);
  const [reelCaptionsEnabled, setReelCaptionsEnabled] = useState(true);
  
  // 🎬 Video editing options
  const [videoOptions, setVideoOptions] = useState({
    clipPadding: 4,
    backgroundMusic: false,
    transitions: false,
    transitionDuration: 0.5,
    colorFilter: 'none',
    playbackSpeed: '1.0',
    showHighlightLabels: true,
    logoWatermark: false,
    introTitle: '',
    introSubtitle: '',
    outroTitle: '',
    outroCta: ''
  });
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  
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
  const [aiModel, setAiModel] = useState("gpt-5.1");
  const [processStatus, setProcessStatus] = useState({ active: false, message: "", percent: 0, estimatedTime: null, isVideoDownload: false });
  const [translation, setTranslation] = useState({ text: "", lang: "", show: false });
  const [translateLang, setTranslateLang] = useState("Spanish");
  const [showExportModal, setShowExportModal] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");

  const debQuery = useDebounce(query, 220);
  const playerRef = useRef(null);
  const transcriptRef = useRef(null);
  const pollIntervalRef = useRef(null);

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
  // ⚙️ NEW: Load optimization stats on mount
  useEffect(() => {
    const loadStats = async () => {
      try {
        const stats = await apiOptimizationStats();
        setOptimizationStats(stats);
      } catch (e) {
        console.error("Failed to load optimization stats:", e);
      }
    };

    loadStats();

    // Refresh stats every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);


  const loadAll = async () => {
    const vid = extractVideoId(url);
    setVideoId(vid);
    if (!vid) {
      alert("Please enter a valid YouTube URL or video ID");
      return;
    }

    setVtt("");
    setCues([]);
    setSents([]);
    setFullText("");
    setSummary({ para: "", bullets: [] });
    setWords([]);
    setEntities([]);
    setHighlightsWithQuotes([]);
    setMatches([]);
    setQuery("");
    setVideoTitle("");
    setLoadingEntities(true);

    setProcessStatus({ active: true, message: "Loading transcript...", percent: 10, isVideoDownload: false });

    let vttText = "";
    try {
      setLoading(l => ({ ...l, transcript: true }));
      vttText = await apiTranscript(vid);


      setProcessStatus({ active: true, message: "Processing transcript...", percent: 30, isVideoDownload: false });
    } catch (e) {
      setLoading(l => ({ ...l, transcript: false }));
      setProcessStatus({ active: false, message: "", percent: 0 });
      alert("Could not load captions. Check your video URL.");
      setLoadingEntities(false);
      return;
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

    try {
      const meta = await apiMetadata(vid);
      if (meta && meta.title) {
        setVideoTitle(meta.title);
      }
    } catch (e) {
      console.log("Could not get video metadata");
    }

    try {
      const wf = await apiWordfreq({ transcript: all });
      const filtered = (wf.words || [])
        .filter(w => !civicStopwords.has(w.text.toLowerCase()) && w.text.length > 3)
        .slice(0, 50); // NEW: 50 words
      setWords(filtered);

      const maxT = (cc[cc.length - 1]?.end || 0);
      const buckets = Math.max(20, Math.floor(maxT / 60));
      setHits(new Array(buckets).fill(0));
    } catch (e) {
      console.error("Word frequency error:", e);
    }

    setProcessStatus({ active: true, message: "Generating AI summary...", percent: 70, isVideoDownload: false });
    try {
      const cleanTranscript = all.trim();

      if (!cleanTranscript || cleanTranscript.length < 10) {
        console.warn("Transcript too short, skipping auto-summary.");
        setSummary({ para: "", bullets: [] });
      } else {
        const res = await apiSummaryAI({
          transcript: cleanTranscript,
          language: lang === "es" ? "es" : "en",
          model: aiModel,
          strategy: "concise",
          video_id: vid  // ⚙️ NEW: For caching
        });

        let summaryText = "";
        if (res.summarySentences) {
          summaryText = res.summarySentences;
          summaryText = summaryText.replace(/^(Here's a concise 3-sentence summary:|Here is your summary:)\s*/i, '');
        }
        setSummary({ para: summaryText, bullets: [] });
      }

      setProcessStatus({ active: true, message: "Complete!", percent: 100, isVideoDownload: false });
      setTimeout(() => setProcessStatus({ active: false, message: "", percent: 0, isVideoDownload: false }), 2000);

    } catch (e) {
      console.error("Summary API error:", e);
      const sentences = all.split('.').filter(s => s.trim().length > 30);
      const fallbackSummary = sentences.slice(0, 3).join('. ') + '.';
      setSummary({ para: fallbackSummary, bullets: [] });
      setProcessStatus({ active: false, message: "", percent: 0, isVideoDownload: false });
    }

    try {
      setProcessStatus({ active: true, message: "Extracting entities...", percent: 85, isVideoDownload: false });
      const analyticsData = await apiExtendedAnalytics({
        transcript: all,
        model: aiModel,
        video_id: vid
      });
      setEntities(analyticsData.topEntities || []);
      setProcessStatus({ active: true, message: "Complete!", percent: 100, isVideoDownload: false });
      setTimeout(() => setProcessStatus({ active: false, message: "", percent: 0, isVideoDownload: false }), 2000);
    } catch (e) {
      console.error("Analytics API error:", e);
      setEntities([]);
    } finally {
      setLoadingEntities(false);
    }

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

  const pollJobStatus = async (jid) => {
    if (!jid) return;

    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }

    pollIntervalRef.current = setInterval(async () => {
      try {
        const status = await apiJobStatus(jid);
        
        // Check if job is complete
        const isComplete = status.status === "done" || status.status === "error";
        
        setJob({
          id: jid,
          percent: isComplete ? 100 : (status.percent || 0),
          message: status.message || "",
          status: status.status || "running",
          zip: status.zip || status.file || null
        });
        
        // Also update the process status bar - but only if not in final cleanup phase
        if (!isComplete) {
          setProcessStatus(prev => ({
            ...prev,
            percent: status.percent || prev.percent,
            message: status.message || prev.message
          }));
        } else {
          // Job is complete - show 100% immediately, then clear
          setProcessStatus(prev => ({
            ...prev,
            percent: 100,
            message: status.status === "done" ? "Complete! ✓" : "Error occurred"
          }));
        }

        if (isComplete) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setLoading(l => ({ ...l, clips: false, reel: false }));
          // Clear the progress bar after a delay
          setTimeout(() => {
            setProcessStatus({ active: false, message: "", percent: 0, estimatedTime: null, isVideoDownload: false });
          }, status.status === "done" ? 2500 : 3500);
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const addToBasket = (clip) => {
    setClipBasket(prev => [...prev, clip]);
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
        title: videoTitle || "Community Highlight Reel"
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
      setClipBasket([]);
    }
  };

  const buildReel = async (format = "combined") => {
    const quotes = highlightsWithQuotes.map(h => h.quote);
    const highlights = highlightsWithQuotes.map(h => h.highlight);

    // Auto-generate highlights if none exist
    if (!videoId) {
      alert("Please load a video first.");
      return;
    }

    if (quotes.length === 0) {
      // No highlights yet - generate them first
      setProcessStatus({
        active: true,
        message: "Generating AI highlights first...",
        percent: 0
      });
      setLoading(l => ({ ...l, reel: true }));

      try {
        const res = await apiSummaryAI({
          transcript: fullText.slice(0, 100000),
          language: lang === "es" ? "es" : "en",
          model: aiModel,
          strategy: "highlights_with_quotes"
        });

        const text = res.summarySentences || "[]";
        let generatedHighlights = [];
        try {
          generatedHighlights = JSON.parse(text);
        } catch (e) {
          console.error("Failed to parse highlights JSON:", e);
          const bullets = text.split(/\d+\.|•|-/).filter(s => s.trim().length > 10);
          for (let i = 0; i < Math.min(10, bullets.length); i++) {
            generatedHighlights.push({
              highlight: bullets[i].trim().split('\n')[0],
              quote: 'Quote not found (fallback)'
            });
          }
        }

        generatedHighlights = generatedHighlights.slice(0, 10);
        setHighlightsWithQuotes(generatedHighlights);

        // Now build the reel with the generated highlights
        setProcessStatus({
          active: true,
          message: format === 'social' ? "Building social media reel..." : "Building AI highlight reel...",
          percent: 20
        });

        const reelRes = await apiHighlightReel({
          videoId,
          quotes: generatedHighlights.map(h => h.quote), // Pass ALL quotes - backend will select spread
          highlights: generatedHighlights.map(h => h.highlight), // Pass ALL highlights
          transcript: sents,
          pad: videoOptions.clipPadding,  // Use advanced options padding
          format: format,
          captions: reelCaptionsEnabled,
          // Video editing options
          ...videoOptions
        });
        pollJobStatus(reelRes.jobId);

      } catch (e) {
        console.error("Reel generation error:", e);
        setProcessStatus({ active: false, message: "", percent: 0 });
        setLoading(l => ({ ...l, reel: false }));
      }
      return;
    }

    // Highlights already exist - build reel directly
    // Estimate processing time:
    // - For short videos (<30 min): Download whole video (~2-5 min) + process clips (~2-3 min) = ~4-8 min
    // - For long videos (>30 min): Download only segments (~1-2 min per clip * 5) = ~5-10 min
    // Estimate video duration from transcript length (rough: ~150 words per minute of speech)
    const wordCount = fullText ? fullText.split(/\s+/).length : 0;
    const estimatedVideoDuration = wordCount / 150; // minutes
    const isLongVideo = estimatedVideoDuration > 30;
    
    let estimatedMinutes;
    if (isLongVideo) {
      // Segment download strategy: ~1-2 min per clip for 5 clips
      estimatedMinutes = Math.ceil(5 * 1.5); // ~8 min
    } else {
      // Full video download: depends on video length
      estimatedMinutes = Math.ceil(Math.min(estimatedVideoDuration * 0.3, 10) + 3); // download time + processing
    }
    
    setProcessStatus({
      active: true,
      message: format === 'social' ? "Building social media reel..." : "Building AI highlight reel...",
      percent: 0,
      estimatedTime: estimatedMinutes,
      isVideoDownload: true
    });
    setLoading(l => ({ ...l, reel: true }));

    try {
      // Pass ALL quotes/highlights - backend will select a spread-out sample of 5
      console.log('[Reel] Video options being sent:', videoOptions);
      const res = await apiHighlightReel({
        videoId,
        quotes: quotes, // Pass ALL quotes
        highlights: highlights, // Pass ALL highlights  
        transcript: sents, // Pass transcript for timestamp matching
        pad: videoOptions.clipPadding,  // Use advanced options padding
        format: format,
        captions: reelCaptionsEnabled, // Pass captions preference
        // Video editing options
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

      setHighlightsWithQuotes(highlights.slice(0, 10));
      setProcessStatus({ active: false, message: "", percent: 0 });
    } catch (e) {
      console.error("Highlights error:", e);
      setProcessStatus({ active: false, message: "", percent: 0 });
    } finally {
      setLoading(l => ({ ...l, summary: false }));
    }
  };

  const translateTranscript = async () => {
    if (!fullText) {
      alert("Load a video first");
      return;
    }

    setLoading(l => ({ ...l, translate: true }));
    setProcessStatus({ active: true, message: `Translating to ${translateLang}...`, percent: 0, isVideoDownload: false });

    try {
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
    setExpanded({ open: true, focusIdx: match.idx });
    setTimeout(() => {
      if (transcriptRef.current) {
        const el = transcriptRef.current.querySelector(`#sent-${match.idx}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
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

      <header className="animate-fadeIn">
        <div className="container">
          <div className="wrap">
            <div className="brand">
              <img src="/logo.png" alt="Community Highlighter" className="logo-main" />
              <div className="subtitle-large">{t.appSubtitle}</div>
            </div>
            <div className="right">
              <div className="lang-selector">
                <label>{t.siteLanguage}</label>
                <select value={lang} onChange={e => setLang(e.target.value)} className="select-input">
                  <option value="en">English</option>
                </select>
              </div>
              <div className="powered-section">
                <span className="powered-text">{t.poweredBy}</span>
                <img src="/secondary.png" alt="BIG" className="secondary-logo-large" />
                {/* Feedback button */}
                <div style={{ marginLeft: '12px', textAlign: 'center' }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => setShowFeedbackModal(true)}
                    style={{
                      fontSize: '13px',
                      padding: '8px 16px',
                      background: '#1e7f63',
                      color: 'white',
                      fontWeight: '600',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Give Feedback
                  </button>
                  <div style={{ fontSize: '10px', color: '#888', marginTop: '4px' }}>
                    This app is in BETA
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container" style={{ paddingTop: 32, paddingBottom: 100 }}>
        {processStatus.active && (
          <ProgressIndicator
            status="active"
            percent={processStatus.percent}
            message={processStatus.message}
            estimatedTime={processStatus.estimatedTime}
            isVideoDownload={processStatus.isVideoDownload}
          />
        )}

        {showExportModal && (
          <ExportModal
            onSelect={exportClips}
            onClose={() => setShowExportModal(false)}
            clipCount={clipBasket.length}
          />
        )}

        <section className="card section animate-fadeIn">
          <HowToGuide onOpenAssistant={() => { setShowAssistant(true); setForceAssistantOpen(prev => prev + 1); }} />

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: '20px' }}>
            <input
              className="input url-input"
              placeholder="To Get Started, Paste a Youtube URL Here."
              value={url}
              onChange={e => setUrl(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && loadAll()}
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
                  <option value="gpt-5.1">GPT-5.1 (Best Quality)</option>
                  <option value="gpt-5.1-chat-latest">GPT-5.1 Instant (Faster)</option>
                  <option value="gpt-4o">GPT-4o (Fallback)</option>
                  <option value="gpt-4o-mini">GPT-4o Mini (Budget)</option>
                </select>
              </>
            )}
          </div>
        </section>

        {/* Desktop App Download Banner - Show on landing page when in cloud mode */}
        {!videoId && isCloudMode && (
          <section className="card section animate-fadeIn" style={{ 
            marginTop: 16, 
            background: 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)',
            color: 'white',
            border: '2px solid #3b82f6'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  💻 Download Desktop App
                </h3>
                <p style={{ margin: 0, fontSize: '14px', color: '#94a3b8', maxWidth: '500px' }}>
                  Get the full-featured desktop version with <strong style={{ color: '#22c55e' }}>video downloads</strong>, 
                  <strong style={{ color: '#22c55e' }}> highlight reels</strong>, and 
                  <strong style={{ color: '#22c55e' }}> clip exports</strong> — features not available in the web version.
                </p>
              </div>
              <a 
                href="https://github.com/amateurmenace/community-highlighter/releases/latest"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: '12px 24px',
                  background: '#22c55e',
                  color: 'white',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontWeight: 600,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(34, 197, 94, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                ⬇️ Download for macOS
              </a>
            </div>
          </section>
        )}

        {/* Civic Meeting Finder - Show on landing page when no video loaded */}
        {!videoId && (
          <section className="card section animate-fadeIn" style={{ marginTop: 16 }}>
            <CivicMeetingFinder 
              onSelectVideo={(selectedUrl) => {
                // Set URL in state and input field, then trigger load
                setUrl(selectedUrl);
                const input = document.querySelector('.url-input');
                if (input) input.value = selectedUrl;
                // Use a slightly longer delay to ensure state update
                setTimeout(() => {
                  // Extract video ID and load directly
                  const vid = selectedUrl.match(/(?:v=|\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/)?.[1];
                  if (vid) {
                    setVideoId(vid);
                    // Trigger a click on the load button for reliable loading
                    const loadBtn = document.querySelector('.btn-primary');
                    if (loadBtn && loadBtn.textContent.includes('Load')) {
                      loadBtn.click();
                    } else {
                      loadAll();
                    }
                  }
                }, 150);
              }}
            />
          </section>
        )}

        {/* UPDATED: AI Summary now has PERMANENT green highlight */}
        {summary.para && (
          <section className="card section summary-card animate-slideUp" style={{ marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>
                {/* UPDATED: Added permanent-highlight class */}
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
            <p style={{ margin: "8px 0", lineHeight: 1.7, fontSize: 15, color: "#334155" }}>
              {summary.para}
            </p>

            {highlightsWithQuotes.length > 0 && (
              <div className="highlights-display" style={{ marginTop: 24, paddingTop: 24, borderTop: '2px solid #e5e7eb' }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                  {t.keyHighlights}:
                </div>
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
                            {item.category === 'vote' ? '🗳️️ Vote' :
                             item.category === 'budget' ? '💰 Budget' :
                             item.category === 'public_comment' ? '💬 Public' :
                             item.category === 'announcement' ? '📢 Announcement' : ''}
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
                              â€” {item.speaker}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
        {isCloudMode && videoId && (
          <div style={{
            marginTop: '16px',
            padding: '16px 24px',
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            border: '2px solid #1E7F63',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexWrap: 'wrap'
          }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <div style={{ fontWeight: '700', color: '#1E7F63', marginBottom: '4px', fontSize: '15px' }}>
                Want to Download Video Clips?
              </div>
              <div style={{ color: '#166534', fontSize: '13px', lineHeight: '1.4' }}>
                Video editing features require the desktop app. Download clips, create highlight reels, and export videos locally.
              </div>
            </div>
            <a 
              href="https://github.com/amateurmenace/community-highlighter/releases/latest"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: '#1E7F63',
                color: 'white',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: '600',
                fontSize: '14px',
                textDecoration: 'none',
                whiteSpace: 'nowrap'
              }}
            >
              Download Desktop App
            </a>
          </div>
        )}

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
                      >
                        {s.text}{" "}
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
                      <button
                        className="btn animate-hover"
                        onClick={() => window.open('https://github.com/amateurmenace/community-highlighter/releases/latest', '_blank')}
                        style={{ background: '#e2e8f0', color: '#64748b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                        title="Download desktop app to export clips"
                      >
                        <span style={{ fontSize: '12px' }}>LOCKED</span> {t.exportClips}
                      </button>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

        {fullText && sents.length > 0 && (
          <section id="analytics-section" className="full-width-viz card section animate-slideUp" style={{ marginTop: 16 }}>
            <h2 className="section-title">
              Meeting Analytics
            </h2>
            <div className="data-viz-container">
              {/* 1. Meeting Scorecard - FULL WIDTH with clickable metrics */}
              <MeetingScorecard
                transcript={fullText}
                highlights={highlightsWithQuotes}
                entities={entities}
                isLoading={loadingEntities}
              />

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

              {/* 4. Interactive Timeline - FULL WIDTH with green markers */}
              <InteractiveTimeline
                sents={sents}
                highlights={highlightsWithQuotes}
                playerRef={playerRef}
                videoId={videoId}
                addToBasket={addToBasket}
                pad={pad}
                openExpandedAt={openExpandedAt}
              />

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

              {/* 8. Topic Subscriptions + Relevant Documents - SIDE BY SIDE */}
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

              {/* 9. Issue Tracker & Meeting Comparison - FULL WIDTH with Meeting Finder integrated */}
              <CrossMeetingAnalysisPanel
                currentVideoId={videoId}
                currentTitle={videoTitle}
                currentTranscript={fullText}
                currentEntities={entities}
                currentSummary={summary.para}
              />

            </div>
          </section>
        )}

        {/* 💬 AI Meeting Assistant - Always visible when video loaded */}
        {videoId && (
          <MeetingAssistant
            videoId={videoId}
            transcript={fullText}
            forceOpen={forceAssistantOpen}
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
            <div className="footer-license">
              License: MIT License - See project documentation for details
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
    </>
  );
}