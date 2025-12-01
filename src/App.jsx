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
  return out;
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: '#999' }}>Ãƒ—</button>
        </div>
        
        {sent ? (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>âÅ“…</div>
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
// 🧠 NEW: Optimization Panel Component
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
        <h3 style={{ margin: 0, fontSize: '18px' }}>🧠 AI Optimizations</h3>
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
              {enabled ? 'X to Å“' : ' to ” to ¹'}
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
          <div>âÅ“¨ Cached analyses: {cache.total_entries || 0}</div>
          <div>’¾ Cache size: {cache.total_size_mb || 0} MB</div>
        </div>
      </div>

      <button
        className="btn btn-ghost"
        onClick={onClearCache}
        style={{ width: '100%', fontSize: '13px' }}
      >
        “¸ Clear Cache
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
                âÅ“¨ Google Maps
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
      <div style={{ fontSize: 12, color: "#64748b" }}>{padTimePrecise(match.start)} â to  {padTimePrecise(match.end)}</div>
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

      <div className="viz-card topic-heatmap">
        <h3>Topic Coverage Map</h3>
        <p className="viz-desc">
          See which topics were discussed most. Click a row to see related sentences.
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
        <div className="heatmap-legend">
          <span>Low</span>
          <div className="legend-bar"></div>
          <span>High</span>
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
    <div className="viz-card disagreement-timeline-card disagreement-timeline">
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
    <div className="viz-card cross-reference-network">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Cross-Reference Network</h3>
          <p className="viz-desc">
            Shows relationships between entities. Thicker lines = mentioned together more often.
          </p>
        </div>
        {network.nodes.length > 0 && (
          <button className="btn btn-ghost btn-export" onClick={exportNetworkImage}>
            “¸ Export
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
    <div className="viz-card conversation-dynamics">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Conversation Dynamics</h3>
          <p className="viz-desc">
            Scroll across timeline. Hot colors = intense/fast discussion, cool colors = calm/slow. Click to jump to that moment.
          </p>
        </div>
        <button className="btn btn-ghost btn-export" onClick={exportDynamicsImage}>
          “¸ Export
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
      <h3>Topic Subscriptions</h3>
      <p className="viz-desc">Get alerts when topics you care about are discussed in meetings.</p>

      {matches.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', border: '2px solid #22c55e', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontWeight: '700', color: '#15803d', marginBottom: '8px' }}>
            {matches.length} topic{matches.length > 1 ? 's' : ''} mentioned in this meeting!
          </div>
          {matches.map((match, idx) => (
            <div key={idx} style={{ background: 'white', padding: '10px', borderRadius: '8px', marginTop: '8px', fontSize: '14px' }}>
              <strong>{match.topic}</strong>
              <div style={{ color: '#64748b', marginTop: '4px' }}>{match.context}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginBottom: '16px' }}>
        {subscriptions.length === 0 ? (
          <div style={{ color: '#64748b', fontStyle: 'italic' }}>No subscriptions yet</div>
        ) : (
          subscriptions.map((sub, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
              <div>
                <span style={{ fontWeight: '600' }}>{sub.topic}</span>
                <span style={{ marginLeft: '8px', fontSize: '12px', color: '#64748b', background: '#e2e8f0', padding: '2px 8px', borderRadius: '4px' }}>{sub.frequency}</span>
              </div>
              <button onClick={() => handleUnsubscribe(sub.topic)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '16px' }}>X</button>
            </div>
          ))
        )}
      </div>

      {showAddForm ? (
        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '2px solid #e2e8f0' }}>
          <input type="text" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="Enter topic (e.g., bike lanes, school budget)"
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px', fontSize: '14px' }} />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email for alerts (optional)"
            style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px', fontSize: '14px' }} />
          <select value={frequency} onChange={(e) => setFrequency(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '2px solid #e2e8f0', borderRadius: '8px', marginBottom: '10px', fontSize: '14px' }}>
            <option value="instant">Instant alerts</option>
            <option value="daily">Daily digest</option>
            <option value="weekly">Weekly summary</option>
          </select>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-primary" onClick={handleSubscribe} disabled={loading || !newTopic.trim()}>{loading ? 'Subscribing...' : 'Subscribe'}</button>
            <button className="btn btn-ghost" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-accent" onClick={() => setShowAddForm(true)} style={{ width: '100%' }}>+ Add Topic Subscription</button>
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

// Jargon Translator Panel
function JargonTranslatorPanel() {
  const [term, setTerm] = useState('');
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dictionary, setDictionary] = useState([]);
  const [showDictionary, setShowDictionary] = useState(false);

  const handleExplain = async () => {
    if (!term.trim()) return;
    setLoading(true);
    try {
      const result = await apiExplainJargon({ term });
      setExplanation(result);
    } catch (e) { console.error('Jargon explanation failed:', e); }
    finally { setLoading(false); }
  };

  const loadDictionary = async () => {
    try {
      const result = await apiGetJargonDictionary();
      setDictionary(result.terms || []);
      setShowDictionary(true);
    } catch (e) { console.error('Failed to load dictionary:', e); }
  };

  return (
    <div className="viz-card jargon-card">
      <h3>Jargon Translator</h3>
      <p className="viz-desc">Don't know what a term means? Get a plain-language explanation.</p>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input type="text" value={term} onChange={(e) => setTerm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleExplain()}
          placeholder="Enter a term (e.g., TIF, variance, quorum)"
          style={{ flex: 1, padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }} />
        <button className="btn btn-primary" onClick={handleExplain} disabled={loading}>{loading ? '...' : 'Explain'}</button>
      </div>
      {explanation && (
        <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', padding: '16px', borderRadius: '12px', marginBottom: '16px', border: '2px solid #22c55e' }}>
          <div style={{ fontWeight: '700', color: '#15803d', marginBottom: '8px' }}>{explanation.term}</div>
          <div style={{ color: '#166534' }}>{explanation.explanation}</div>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>Source: {explanation.source === 'dictionary' ? 'Built-in dictionary' : 'AI-generated'}</div>
        </div>
      )}
      <button className="btn btn-ghost" onClick={loadDictionary} style={{ width: '100%' }}>Browse Full Dictionary</button>
      {showDictionary && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }} onClick={() => setShowDictionary(false)}>
          <div style={{ background: 'white', borderRadius: '16px', width: '90%', maxWidth: '700px', maxHeight: '80vh', overflow: 'auto', padding: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ margin: 0 }}>Civic Jargon Dictionary</h2>
              <button onClick={() => setShowDictionary(false)} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer' }}>X</button>
            </div>
            <div style={{ fontSize: '14px', color: '#64748b', marginBottom: '16px' }}>{dictionary.length} terms defined</div>
            {dictionary.map((item, idx) => (
              <div key={idx} style={{ padding: '12px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: '600', color: '#1E7F63' }}>{item.term}</div>
                <div style={{ marginTop: '4px', color: '#374151' }}>{item.explanation}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Cross-Meeting Analysis Panel (Combined Knowledge Graph + Comparison)
function CrossMeetingAnalysisPanel({ currentVideoId, currentTitle, currentTranscript, currentEntities, currentSummary }) {
  const [additionalMeetings, setAdditionalMeetings] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMeeting, setLoadingMeeting] = useState(null);
  const [activeTab, setActiveTab] = useState('add');
  const [comparison, setComparison] = useState(null);
  const [graphData, setGraphData] = useState(null);
  const [selectedMeetingForCompare, setSelectedMeetingForCompare] = useState(null);

  const extractVideoId = (url) => {
    const patterns = [/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/, /^([a-zA-Z0-9_-]{11})$/];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const handleAddMeeting = async () => {
    const videoId = extractVideoId(newUrl.trim());
    if (!videoId) { alert('Please enter a valid YouTube URL or video ID'); return; }
    if (videoId === currentVideoId) { alert('This is the current meeting. Please add a different meeting.'); return; }
    if (additionalMeetings.find(m => m.video_id === videoId)) { alert('This meeting has already been added.'); return; }

    setLoadingMeeting(videoId);
    console.log('[CrossMeeting] Starting to load meeting:', videoId);
    
    try {
      // Step 1: Fetch transcript (required)
      console.log('[CrossMeeting] Fetching transcript...');
      const transcriptRes = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId })
      });
      
      if (!transcriptRes.ok) {
        const errorText = await transcriptRes.text();
        console.error('[CrossMeeting] Transcript fetch failed:', errorText);
        throw new Error('Failed to fetch transcript');
      }
      
      const transcriptText = await transcriptRes.text();
      console.log('[CrossMeeting] Transcript received, length:', transcriptText.length);
      
      // Parse the VTT/transcript text to get full text
      let fullText = transcriptText;
      if (transcriptText.includes('WEBVTT') || transcriptText.includes('-->')) {
        const lines = transcriptText.split('\n');
        const textLines = lines.filter(line => 
          line.trim() && 
          !line.includes('WEBVTT') && 
          !line.includes('-->') && 
          !line.match(/^\d+$/) &&
          !line.match(/^\d{2}:\d{2}/)
        );
        fullText = textLines.join(' ').replace(/\s+/g, ' ').trim();
      }
      console.log('[CrossMeeting] Parsed text length:', fullText.length);
      
      // Step 2: Fetch metadata for title (optional)
      let title = `Meeting ${videoId}`;
      try {
        console.log('[CrossMeeting] Fetching metadata...');
        const metaRes = await fetch('/api/metadata', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId })
        });
        if (metaRes.ok) { 
          const metaData = await metaRes.json(); 
          title = metaData.title || title;
          console.log('[CrossMeeting] Got title:', title);
        }
      } catch (e) { 
        console.log('[CrossMeeting] Metadata fetch failed, using default title'); 
      }

      // Step 3: Extract keywords locally (no API call - avoids rate limiting)
      // Simple keyword extraction from transcript
      const words = fullText.toLowerCase().split(/\s+/);
      const wordFreq = {};
      const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there', 'then', 'about', 'into', 'over', 'after', 'before', 'between', 'under', 'again', 'further', 'once', 'during', 'while', 'through', 'because', 'if', 'until', 'against', 'above', 'below', 'up', 'down', 'out', 'off', 'right', 'left', 'going', 'think', 'know', 'want', 'get', 'got', 'like', 'make', 'made', 'say', 'said', 'see', 'come', 'came', 'take', 'took', 'go', 'went', 'well', 'back', 'much', 'even', 'still', 'way', 'really', 'thing', 'things', 'actually', 'something', 'anything', 'need', 'year', 'years', 'time', 'lot', 'okay', 'yeah', 'yes', 'thank', 'thanks', 'please', 'um', 'uh']);
      
      words.forEach(word => {
        const clean = word.replace(/[^a-z]/g, '');
        if (clean.length > 3 && !stopWords.has(clean)) {
          wordFreq[clean] = (wordFreq[clean] || 0) + 1;
        }
      });
      
      // Get top keywords as pseudo-entities
      const entities = Object.entries(wordFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([text, count]) => ({ text: text.charAt(0).toUpperCase() + text.slice(1), count, type: 'KEYWORD' }));
      
      console.log('[CrossMeeting] Extracted', entities.length, 'keywords locally');

      // Step 4: Add the meeting
      const newMeeting = { 
        video_id: videoId, 
        title, 
        transcript: fullText, 
        summary: '', // Skip AI summary to avoid rate limiting
        entities, 
        added_at: new Date().toISOString() 
      };
      
      setAdditionalMeetings(prev => [...prev, newMeeting]);
      setNewUrl('');
      console.log('[CrossMeeting] Successfully added meeting:', title);
      
    } catch (e) { 
      console.error('[CrossMeeting] Failed to add meeting:', e);
      alert('Failed to load meeting: ' + e.message); 
    }
    finally { 
      setLoadingMeeting(null); 
    }
  };

  const handleRemoveMeeting = (videoId) => {
    setAdditionalMeetings(prev => prev.filter(m => m.video_id !== videoId));
    if (selectedMeetingForCompare === videoId) { setSelectedMeetingForCompare(null); setComparison(null); }
  };

  const handleCompare = async () => {
    if (!selectedMeetingForCompare) return;
    const meetingToCompare = additionalMeetings.find(m => m.video_id === selectedMeetingForCompare);
    if (!meetingToCompare) return;
    setLoading(true);
    
    try {
      // Do comparison locally (faster and more reliable than API call)
      const entities1 = new Set((currentEntities || []).map(e => e.text.toLowerCase()));
      const entities2 = new Set((meetingToCompare.entities || []).map(e => e.text.toLowerCase()));
      
      // Find new, ongoing, and resolved topics
      const newTopics = [...entities1].filter(e => !entities2.has(e));
      const ongoingTopics = [...entities1].filter(e => entities2.has(e));
      const resolvedTopics = [...entities2].filter(e => !entities1.has(e));
      
      // Capitalize for display
      const capitalize = arr => arr.slice(0, 15).map(t => t.charAt(0).toUpperCase() + t.slice(1));
      
      setComparison({
        new_topics: capitalize(newTopics),
        ongoing_topics: capitalize(ongoingTopics),
        resolved_topics: capitalize(resolvedTopics),
        evolution_summary: `The current meeting introduces ${newTopics.length} new topics while ${ongoingTopics.length} topics continue from the previous meeting. ${resolvedTopics.length} topics from the previous meeting are not discussed.`
      });
      
      console.log('[CrossMeeting] Comparison complete:', { new: newTopics.length, ongoing: ongoingTopics.length, resolved: resolvedTopics.length });
      
    } catch (e) { 
      console.error('[CrossMeeting] Comparison failed:', e);
      alert('Failed to compare meetings.'); 
    }
    finally { setLoading(false); }
  };

  const handleBuildGraph = async () => {
    if (additionalMeetings.length === 0) { alert('Please add at least one additional meeting first.'); return; }
    setLoading(true);
    
    try {
      // Build graph locally (faster and more reliable)
      const allMeetings = [
        { video_id: currentVideoId, title: currentTitle, entities: currentEntities || [] },
        ...additionalMeetings.map(m => ({ video_id: m.video_id, title: m.title, entities: m.entities || [] }))
      ];
      
      // Track which entities appear in which meetings
      const entityMeetings = {};
      
      allMeetings.forEach(meeting => {
        (meeting.entities || []).forEach(entity => {
          const key = entity.text.toLowerCase();
          if (!entityMeetings[key]) {
            entityMeetings[key] = { text: entity.text, meetings: new Set() };
          }
          entityMeetings[key].meetings.add(meeting.title);
        });
      });
      
      // Find shared entities (appear in 2+ meetings)
      const sharedEntities = Object.values(entityMeetings)
        .filter(e => e.meetings.size > 1)
        .map(e => ({ name: e.text, meeting_count: e.meetings.size, meetings: [...e.meetings] }))
        .sort((a, b) => b.meeting_count - a.meeting_count);
      
      // Calculate stats
      const totalEntities = Object.keys(entityMeetings).length;
      const crossConnections = sharedEntities.length;
      
      setGraphData({
        shared_entities: sharedEntities.slice(0, 20),
        stats: {
          total_nodes: totalEntities + allMeetings.length,
          total_edges: Object.values(entityMeetings).reduce((sum, e) => sum + e.meetings.size, 0),
          cross_meeting_connections: crossConnections
        }
      });
      
      console.log('[CrossMeeting] Graph built:', { entities: totalEntities, shared: crossConnections });
      
    } catch (e) { 
      console.error('[CrossMeeting] Graph build failed:', e);
      alert('Failed to build knowledge graph.'); 
    }
    finally { setLoading(false); }
  };

  const totalMeetings = additionalMeetings.length + 1;

  return (
    <div className="viz-card cross-meeting-analysis-card">
      <h3>Cross-Meeting Analysis</h3>
      <p className="viz-desc">Compare meetings and discover connections across multiple sessions. Add meetings below to unlock analysis features.</p>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>
        <button onClick={() => setActiveTab('add')} style={{ padding: '10px 16px', border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', fontWeight: '600', background: activeTab === 'add' ? '#1E7F63' : 'transparent', color: activeTab === 'add' ? 'white' : '#64748b' }}>+ Add Meetings ({totalMeetings})</button>
        <button onClick={() => setActiveTab('compare')} disabled={additionalMeetings.length === 0} style={{ padding: '10px 16px', border: 'none', borderRadius: '8px 8px 0 0', cursor: additionalMeetings.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '600', background: activeTab === 'compare' ? '#1E7F63' : 'transparent', color: activeTab === 'compare' ? 'white' : additionalMeetings.length === 0 ? '#cbd5e1' : '#64748b' }}>Compare</button>
        <button onClick={() => setActiveTab('graph')} disabled={additionalMeetings.length === 0} style={{ padding: '10px 16px', border: 'none', borderRadius: '8px 8px 0 0', cursor: additionalMeetings.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '600', background: activeTab === 'graph' ? '#1E7F63' : 'transparent', color: activeTab === 'graph' ? 'white' : additionalMeetings.length === 0 ? '#cbd5e1' : '#64748b' }}>Knowledge Graph</button>
      </div>

      {activeTab === 'add' && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', padding: '12px 16px', borderRadius: '10px', marginBottom: '16px', border: '2px solid #22c55e' }}>
            <div style={{ fontSize: '12px', color: '#15803d', fontWeight: '600', marginBottom: '4px' }}>CURRENT MEETING</div>
            <div style={{ fontWeight: '600', color: '#166534' }}>{currentTitle || `Video: ${currentVideoId}`}</div>
            <div style={{ fontSize: '12px', color: '#15803d', marginTop: '4px' }}>{currentEntities?.length || 0} entities detected</div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Add Another Meeting to Compare:</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input type="text" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddMeeting()} placeholder="Paste YouTube URL (e.g., https://youtube.com/watch?v=...)" style={{ flex: 1, padding: '12px 16px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }} />
              <button className="btn btn-primary" onClick={handleAddMeeting} disabled={loadingMeeting || !newUrl.trim()} style={{ minWidth: '120px' }}>{loadingMeeting ? 'Loading...' : '+ Add Meeting'}</button>
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>Tip: Add meetings from the same organization or topic series for best results</div>
          </div>

          {additionalMeetings.length > 0 && (
            <div>
              <div style={{ fontWeight: '600', marginBottom: '8px', color: '#374151' }}>Added Meetings ({additionalMeetings.length}):</div>
              {additionalMeetings.map((meeting, idx) => (
                <div key={meeting.video_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#f8fafc', borderRadius: '10px', marginBottom: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: '600', marginBottom: '4px' }}>{meeting.title}</div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>{meeting.entities?.length || 0} entities - ID: {meeting.video_id}</div>
                  </div>
                  <button onClick={() => handleRemoveMeeting(meeting.video_id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px', padding: '4px 8px' }}>X</button>
                </div>
              ))}
            </div>
          )}

          {additionalMeetings.length === 0 && (
            <div style={{ textAlign: 'center', padding: '30px 20px', background: '#f8fafc', borderRadius: '12px', border: '2px dashed #e2e8f0' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>+</div>
              <div style={{ color: '#64748b', marginBottom: '4px' }}>No additional meetings added yet</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Add meetings above to enable comparison and knowledge graph features</div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'compare' && (
        <div>
          {additionalMeetings.length === 0 ? <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Add meetings first to enable comparison</div> : (
            <>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontWeight: '600', marginBottom: '8px' }}>Select a meeting to compare with current:</label>
                <select value={selectedMeetingForCompare || ''} onChange={(e) => { setSelectedMeetingForCompare(e.target.value); setComparison(null); }} style={{ width: '100%', padding: '12px', border: '2px solid #e2e8f0', borderRadius: '8px', fontSize: '14px' }}>
                  <option value="">-- Select a meeting --</option>
                  {additionalMeetings.map(m => <option key={m.video_id} value={m.video_id}>{m.title}</option>)}
                </select>
              </div>
              {selectedMeetingForCompare && <button className="btn btn-primary" onClick={handleCompare} disabled={loading} style={{ width: '100%', marginBottom: '16px' }}>{loading ? 'Analyzing...' : 'Compare These Meetings'}</button>}
              {comparison && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ color: '#22c55e', marginBottom: '8px' }}>New Topics (in current meeting)</h4>
                    {comparison.new_topics && comparison.new_topics.length > 0 ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{comparison.new_topics.slice(0, 10).map((topic, idx) => <span key={idx} style={{ padding: '6px 12px', background: '#dcfce7', borderRadius: '16px', fontSize: '14px' }}>{topic}</span>)}</div> : <span style={{ color: '#64748b' }}>None detected</span>}
                  </div>
                  <div style={{ marginBottom: '16px' }}>
                    <h4 style={{ color: '#3b82f6', marginBottom: '8px' }}>Ongoing Topics (in both meetings)</h4>
                    {comparison.ongoing_topics && comparison.ongoing_topics.length > 0 ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>{comparison.ongoing_topics.slice(0, 10).map((topic, idx) => <span key={idx} style={{ padding: '6px 12px', background: '#dbeafe', borderRadius: '16px', fontSize: '14px' }}>{topic}</span>)}</div> : <span style={{ color: '#64748b' }}>None detected</span>}
                  </div>
                  {comparison.evolution_summary && <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)', padding: '16px', borderRadius: '12px', border: '2px solid #22c55e' }}><h4 style={{ marginBottom: '8px', color: '#15803d' }}>AI Summary of Changes</h4><p style={{ color: '#166534', lineHeight: '1.6' }}>{comparison.evolution_summary}</p></div>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'graph' && (
        <div>
          {additionalMeetings.length === 0 ? <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>Add meetings first to build a knowledge graph</div> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#1E7F63' }}>{totalMeetings}</div><div style={{ fontSize: '12px', color: '#64748b' }}>Meetings</div></div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#1E7F63' }}>{(currentEntities?.length || 0) + additionalMeetings.reduce((sum, m) => sum + (m.entities?.length || 0), 0)}</div><div style={{ fontSize: '12px', color: '#64748b' }}>Total Entities</div></div>
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', textAlign: 'center' }}><div style={{ fontSize: '28px', fontWeight: '700', color: '#1E7F63' }}>{graphData?.stats?.cross_meeting_connections || '?'}</div><div style={{ fontSize: '12px', color: '#64748b' }}>Shared Topics</div></div>
              </div>
              <button className="btn btn-accent" onClick={handleBuildGraph} disabled={loading} style={{ width: '100%', marginBottom: '16px' }}>{loading ? 'Building Graph...' : 'Build Knowledge Graph'}</button>
              
              {graphData && (
                <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px' }}>
                  {/* Visual Network Graph */}
                  <div style={{ background: 'white', borderRadius: '12px', border: '2px solid #e2e8f0', marginBottom: '16px', overflow: 'hidden' }}>
                    <svg viewBox="0 0 800 500" style={{ width: '100%', height: '400px', display: 'block' }}>
                      {/* Background */}
                      <rect width="800" height="500" fill="#fafafa" />
                      
                      {/* Draw edges first (so they appear behind nodes) */}
                      {graphData.shared_entities && graphData.shared_entities.slice(0, 12).map((entity, idx) => {
                        const entityX = 400 + Math.cos((idx / 12) * Math.PI * 2) * 150;
                        const entityY = 250 + Math.sin((idx / 12) * Math.PI * 2) * 150;
                        
                        // Draw lines to each meeting this entity appears in
                        const allMeetingsList = [
                          { title: currentTitle || 'Current Meeting', x: 200, y: 250 },
                          ...additionalMeetings.map((m, mIdx) => ({
                            title: m.title,
                            x: 600,
                            y: 100 + (mIdx * 120)
                          }))
                        ];
                        
                        return entity.meetings?.map((meetingTitle, mIdx) => {
                          const meeting = allMeetingsList.find(m => m.title === meetingTitle);
                          if (!meeting) return null;
                          return (
                            <line
                              key={`edge-${idx}-${mIdx}`}
                              x1={entityX}
                              y1={entityY}
                              x2={meeting.x}
                              y2={meeting.y}
                              stroke="#1E7F63"
                              strokeWidth="2"
                              strokeOpacity="0.3"
                            />
                          );
                        });
                      })}
                      
                      {/* Meeting nodes (left and right sides) */}
                      <g>
                        {/* Current meeting - left side */}
                        <circle cx="200" cy="250" r="45" fill="linear-gradient(135deg, #1E7F63 0%, #2d9f7f 100%)" stroke="#1E7F63" strokeWidth="3" />
                        <circle cx="200" cy="250" r="45" fill="#1E7F63" />
                        <text x="200" y="245" textAnchor="middle" fill="white" fontSize="11" fontWeight="bold">
                          {(currentTitle || 'Current').substring(0, 12)}
                        </text>
                        <text x="200" y="260" textAnchor="middle" fill="white" fontSize="9">
                          (Current)
                        </text>
                        
                        {/* Additional meetings - right side */}
                        {additionalMeetings.map((meeting, idx) => (
                          <g key={`meeting-${idx}`}>
                            <circle 
                              cx="600" 
                              cy={100 + (idx * 120)} 
                              r="40" 
                              fill="#3b82f6"
                              stroke="#1d4ed8"
                              strokeWidth="3"
                            />
                            <text 
                              x="600" 
                              y={100 + (idx * 120) + 4} 
                              textAnchor="middle" 
                              fill="white" 
                              fontSize="10"
                              fontWeight="bold"
                            >
                              {meeting.title.substring(0, 14)}
                            </text>
                          </g>
                        ))}
                      </g>
                      
                      {/* Shared entity nodes (center circle) */}
                      {graphData.shared_entities && graphData.shared_entities.slice(0, 12).map((entity, idx) => {
                        const angle = (idx / 12) * Math.PI * 2;
                        const x = 400 + Math.cos(angle) * 150;
                        const y = 250 + Math.sin(angle) * 150;
                        const size = 20 + (entity.meeting_count * 5);
                        
                        return (
                          <g key={`entity-${idx}`}>
                            <circle
                              cx={x}
                              cy={y}
                              r={size}
                              fill="#22c55e"
                              stroke="#15803d"
                              strokeWidth="2"
                              opacity="0.9"
                            />
                            <text
                              x={x}
                              y={y + 4}
                              textAnchor="middle"
                              fill="white"
                              fontSize="9"
                              fontWeight="600"
                            >
                              {entity.name.substring(0, 10)}
                            </text>
                          </g>
                        );
                      })}
                      
                      {/* Legend */}
                      <g transform="translate(20, 20)">
                        <rect x="0" y="0" width="140" height="90" fill="white" stroke="#e2e8f0" rx="8" />
                        <circle cx="20" cy="25" r="8" fill="#1E7F63" />
                        <text x="35" y="29" fontSize="11" fill="#374151">Current Meeting</text>
                        <circle cx="20" cy="50" r="8" fill="#3b82f6" />
                        <text x="35" y="54" fontSize="11" fill="#374151">Added Meeting</text>
                        <circle cx="20" cy="75" r="8" fill="#22c55e" />
                        <text x="35" y="79" fontSize="11" fill="#374151">Shared Topic</text>
                      </g>
                    </svg>
                  </div>
                  
                  {/* Stats summary */}
                  <div style={{ fontWeight: '700', color: '#1E7F63', marginBottom: '12px' }}>Knowledge Graph Built!</div>
                  <div style={{ fontSize: '14px', color: '#374151', marginBottom: '12px' }}>
                    Found <strong>{graphData.stats?.total_nodes || 0}</strong> total topics across <strong>{totalMeetings}</strong> meetings with <strong>{graphData.stats?.cross_meeting_connections || 0}</strong> shared between meetings.
                  </div>
                  
                  {/* Shared entities list */}
                  {graphData.shared_entities && graphData.shared_entities.length > 0 && (
                    <div>
                      <div style={{ fontWeight: '600', marginBottom: '8px' }}>Topics appearing in multiple meetings:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {graphData.shared_entities.slice(0, 15).map((entity, idx) => (
                          <span key={idx} style={{ 
                            padding: '6px 12px', 
                            background: 'linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%)', 
                            borderRadius: '16px', 
                            fontSize: '13px', 
                            border: '1px solid #22c55e',
                            cursor: 'pointer'
                          }}
                          title={`Appears in: ${entity.meetings?.join(', ') || 'Multiple meetings'}`}
                          >
                            {entity.name} ({entity.meeting_count})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {graphData.shared_entities && graphData.shared_entities.length === 0 && (
                    <div style={{ color: '#64748b', fontStyle: 'italic', textAlign: 'center', padding: '20px' }}>
                      No shared topics found between meetings. The meetings may discuss different subjects.
                    </div>
                  )}
                </div>
              )}
            </>
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
            “¸ Export
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
              ⏱️ Estimated time: ~{estimatedTime} minutes
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
          {timeEstimate && <span style={{ marginLeft: '8px' }}>âÃ‚ {timeEstimate}</span>}
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
// ”´ NEW v4.0 COMPONENTS: Enhanced Features
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
          <div className="assistant-header">
            <h3>Meeting Assistant</h3>
            <p>Ask questions about this meeting</p>
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
        <h2>“¸ Community Knowledge Base</h2>
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
// v6.1 NEW COMPONENTS: Scorecard, Timeline, Share Moment, Reel Presets
// ============================================================================

// Reel Style Presets - Quick selection of video style configurations
const REEL_PRESETS = {
  news_brief: {
    name: "📰 News Brief",
    description: "Clean, professional, just the facts",
    settings: { disableAllAdvanced: true, clipPadding: 3, transitions: false, colorFilter: 'none', normalizeAudio: false, backgroundMusic: false }
  },
  social_media: {
    name: "🎬 Social Media",
    description: "Dynamic, with transitions and music",
    settings: { disableAllAdvanced: false, clipPadding: 4, transitions: true, colorFilter: 'warm', normalizeAudio: false, backgroundMusic: true }
  },
  highlights_only: {
    name: "🔥 Quick Highlights",
    description: "Exciting moments with upbeat music",
    settings: { disableAllAdvanced: false, clipPadding: 2, transitions: true, colorFilter: 'high_contrast', normalizeAudio: false, backgroundMusic: true }
  },
  professional: {
    name: "💼 Professional",
    description: "Polished for presentations",
    settings: { disableAllAdvanced: false, clipPadding: 4, transitions: true, colorFilter: 'cinematic', normalizeAudio: false, logoWatermark: true, backgroundMusic: true }
  }
};

function ReelStylePresets({ videoOptions, setVideoOptions }) {
  const [selectedPreset, setSelectedPreset] = useState(null);

  const applyPreset = (presetKey) => {
    const preset = REEL_PRESETS[presetKey];
    if (preset) {
      setVideoOptions(prev => ({ ...prev, ...preset.settings }));
      setSelectedPreset(presetKey);
    }
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>
        🎬 Quick Presets
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {Object.entries(REEL_PRESETS).map(([key, preset]) => (
          <button
            key={key}
            onClick={() => applyPreset(key)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              border: selectedPreset === key ? '2px solid #1E7F63' : '1px solid #e2e8f0',
              background: selectedPreset === key ? '#f0fdf4' : 'white',
              cursor: 'pointer',
              fontSize: '12px',
              textAlign: 'left',
              minWidth: '140px'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '2px' }}>{preset.name}</div>
            <div style={{ color: '#64748b', fontSize: '11px' }}>{preset.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Meeting Scorecard - Visual summary with key metrics
function MeetingScorecard({ transcript, highlights, entities, isLoading }) {
  const [scorecard, setScorecard] = useState(null);
  const [loading, setLoading] = useState(false);

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

  if (loading || isLoading) {
    return (
      <div className="viz-card" style={{ textAlign: 'center', padding: '40px' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        <div style={{ color: '#64748b' }}>Generating meeting scorecard...</div>
      </div>
    );
  }

  if (!scorecard) return null;

  return (
    <div className="viz-card meeting-scorecard">
      <h3>📊 Meeting Scorecard</h3>
      <p className="viz-desc">Key metrics and engagement indicators for this meeting.</p>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '16px', marginTop: '16px' }}>
        <div className="scorecard-metric">
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#1E7F63' }}>{scorecard.decisions_made}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>🗳️ Votes/Decisions</div>
        </div>
        <div className="scorecard-metric">
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#2563eb' }}>{scorecard.public_comments}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>💬 Public Comments</div>
        </div>
        <div className="scorecard-metric">
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#16a34a' }}>{scorecard.budget_items}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>💰 Budget Items</div>
        </div>
        <div className="scorecard-metric">
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#9333ea' }}>{scorecard.speakers}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>🎤 Speakers</div>
        </div>
        <div className="scorecard-metric">
          <div style={{ fontSize: '28px', fontWeight: 700, color: '#64748b' }}>{scorecard.duration}</div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>⏱️ Duration</div>
        </div>
        <div className="scorecard-metric">
          <div style={{ 
            fontSize: '28px', fontWeight: 700, 
            color: scorecard.engagement_score > 70 ? '#16a34a' : scorecard.engagement_score > 40 ? '#eab308' : '#ef4444'
          }}>
            {scorecard.engagement_score}%
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>ˆ Engagement</div>
        </div>
      </div>

      {scorecard.hot_topics && scorecard.hot_topics.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>🔥 Hot Topics</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {scorecard.hot_topics.map((topic, idx) => (
              <span key={idx} style={{
                background: '#fef3c7',
                color: '#92400e',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '12px',
                fontWeight: 500
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

// Interactive Timeline with colored markers
function InteractiveTimeline({ sents, highlights, playerRef, videoId, addToBasket, pad }) {
  const [hoveredPoint, setHoveredPoint] = useState(null);
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
        type: h.category || 'highlight',
        label: h.highlight || h.text || `Highlight ${idx + 1}`,
        color: h.category === 'vote' ? '#ef4444' : 
               h.category === 'budget' ? '#16a34a' : 
               h.category === 'public_comment' ? '#2563eb' : '#f59e0b'
      });
    }
  });

  // Detect decision points from text
  const decisionKeywords = ['approved', 'rejected', 'vote', 'passed', 'motion', 'unanimous'];
  sents.forEach((sent, idx) => {
    const lowerText = sent.text.toLowerCase();
    if (decisionKeywords.some(kw => lowerText.includes(kw))) {
      // Avoid duplicates near existing points
      const nearbyPoint = timelinePoints.find(p => Math.abs(p.time - sent.start) < 30);
      if (!nearbyPoint) {
        timelinePoints.push({
          time: sent.start,
          type: 'decision',
          label: sent.text.substring(0, 80) + (sent.text.length > 80 ? '...' : ''),
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
          type: 'public_comment',
          label: sent.text.substring(0, 80) + (sent.text.length > 80 ? '...' : ''),
          color: '#2563eb'
        });
      }
    }
  });

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

  return (
    <div className="viz-card interactive-timeline">
      <h3>🎯 Interactive Timeline</h3>
      <p className="viz-desc">Click any marker to jump to that moment. Colors indicate type of content.</p>
      
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#ef4444' }} />
          Votes/Decisions
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#2563eb' }} />
          Public Comments
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#16a34a' }} />
          Budget
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
          <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#f59e0b' }} />
          Highlights
        </span>
      </div>

      <div 
        ref={timelineRef}
        style={{ 
          position: 'relative', 
          height: '60px', 
          background: 'linear-gradient(to right, #e2e8f0, #f1f5f9)',
          borderRadius: '8px',
          marginBottom: '8px'
        }}
      >
        {/* Timeline track */}
        <div style={{ 
          position: 'absolute', 
          top: '50%', 
          left: '8px', 
          right: '8px', 
          height: '4px', 
          background: '#cbd5e1',
          borderRadius: '2px',
          transform: 'translateY(-50%)'
        }} />

        {/* Timeline points */}
        {timelinePoints.map((point, idx) => {
          const position = (point.time / totalDuration) * 100;
          return (
            <div
              key={idx}
              onClick={() => seekTo(point.time)}
              onMouseEnter={() => setHoveredPoint(idx)}
              onMouseLeave={() => setHoveredPoint(null)}
              style={{
                position: 'absolute',
                left: `calc(${position}% + 8px - 8px)`,
                top: '50%',
                transform: 'translateY(-50%)',
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: point.color,
                cursor: 'pointer',
                zIndex: hoveredPoint === idx ? 10 : 1,
                boxShadow: hoveredPoint === idx ? '0 0 0 4px rgba(0,0,0,0.1)' : 'none',
                transition: 'transform 0.2s, box-shadow 0.2s'
              }}
              title={`${formatTime(point.time)} - ${point.label}`}
            />
          );
        })}

        {/* Hover tooltip */}
        {hoveredPoint !== null && timelinePoints[hoveredPoint] && (
          <div style={{
            position: 'absolute',
            left: `calc(${(timelinePoints[hoveredPoint].time / totalDuration) * 100}%)`,
            bottom: '100%',
            transform: 'translateX(-50%)',
            background: '#1e293b',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            maxWidth: '250px',
            zIndex: 20,
            whiteSpace: 'normal'
          }}>
            <div style={{ fontWeight: 600, marginBottom: '4px' }}>
              {formatTime(timelinePoints[hoveredPoint].time)}
            </div>
            <div>{timelinePoints[hoveredPoint].label}</div>
          </div>
        )}
      </div>

      {/* Time labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b', padding: '0 8px' }}>
        <span>0:00</span>
        <span>{formatTime(totalDuration / 4)}</span>
        <span>{formatTime(totalDuration / 2)}</span>
        <span>{formatTime(totalDuration * 3 / 4)}</span>
        <span>{formatTime(totalDuration)}</span>
      </div>
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
              ⏱️ Use Current Video Time
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
              <div style={{ color: '#16a34a', fontWeight: 600, marginBottom: '8px' }}>✔ Share link created!</div>
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
                  📋
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
                  📋
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
              📖 Reading Level
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
              🌐 Translate Summary
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
                {translatedText ? `„ ${targetLanguage} Translation` : '„ Simplified Version'}
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
    disableAllAdvanced: true,  // NEW: Master toggle to disable all processing
    transitions: false,
    transitionDuration: 0.5,
    colorFilter: 'none',
    normalizeAudio: false,
    backgroundMusic: false,
    clipPadding: 4,
    logoWatermark: false,
    introTitle: '',
    introSubtitle: '',
    outroTitle: '',
    outroCta: '',
    generateThumbnail: false,
    addChapters: false
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

  // 🧠 NEW: Optimization stats state
  const [optimizationStats, setOptimizationStats] = useState(null);
  const [showOptimizationPanel, setShowOptimizationPanel] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  // ”´ NEW v4.0: State for new features
  const [showAssistant, setShowAssistant] = useState(false);
  const [forceAssistantOpen, setForceAssistantOpen] = useState(0); // Counter to force open
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showLiveMode, setShowLiveMode] = useState(false);

  const [expanded, setExpanded] = useState({ open: false, focusIdx: null });
  const [clipBasket, setClipBasket] = useState([]);
  const [lang, setLang] = useState("en");
  const [aiModel, setAiModel] = useState("gpt-4o");
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
  // 🧠 NEW: Load optimization stats on mount
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
          video_id: vid  // 🧠 NEW: For caching
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
        console.log("”´ Live mode connected");
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
        console.log("”´ Live mode disconnected");
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
        video_id: videoId  // 🧠 NEW: For caching
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
            message: status.status === "done" ? "Complete! ✔" : "Error occurred"
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
          const bullets = text.split(/\d+\.|Ã‚|-/).filter(s => s.trim().length > 10);
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

  const generateHighlightsWithQuotes = async () => {
    if (!fullText) return;

    setProcessStatus({ active: true, message: "Generating highlights with quotes...", percent: 0, isVideoDownload: false });
    setLoading(l => ({ ...l, summary: true }));

    try {
      const res = await apiSummaryAI({
        transcript: fullText.slice(0, 100000),
        language: lang === "es" ? "es" : "en",
        model: aiModel,
        strategy: "highlights_with_quotes"
      });

      const text = res.summarySentences || "[]";
      let highlights = [];
      try {
        highlights = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse highlights JSON:", e);
        const bullets = text.split(/\d+\.|Ã‚|-/).filter(s => s.trim().length > 10);
        for (let i = 0; i < Math.min(10, bullets.length); i++) {
          highlights.push({
            highlight: bullets[i].trim().split('\n')[0],
            quote: 'Quote not found (fallback)'
          });
        }
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
                ” Investigate: "{investigateWord.text}"
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
                âÅ“•
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
                “° Google News
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
                —ºÃ¯¸ Google Maps
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
                “Å¡ Wikipedia
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
                Open in New Tab â—
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
                  ”´ LIVE MODE - Real-time Updates
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
                  <option value="gpt-5">GPT-5 (Latest)</option>
                  <option value="gpt-5-mini">GPT-5 Mini (Fast)</option>
                  <option value="gpt-4o">GPT-4o (Recommended)</option>
                  <option value="gpt-4-turbo">GPT-4 Turbo</option>
                </select>
              </>
            )}
          </div>
        </section>

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
                onClick={generateHighlightsWithQuotes}
                disabled={loading.summary}
              >
                {t.summarizeAI}
              </button>
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
                            {item.category === 'vote' ? '🗳️ Vote' :
                             item.category === 'budget' ? '💰 Budget' :
                             item.category === 'public_comment' ? '💬 Public' :
                             item.category === 'announcement' ? '¢ Announcement' : ''}
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
                      ” Investigate
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

                {/* Jargon Translator - directly under Word Cloud */}
                <JargonTranslatorPanel />
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

                {/* v6.1: Reel Style Presets */}
                <ReelStylePresets 
                  videoOptions={videoOptions}
                  setVideoOptions={setVideoOptions}
                />

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
                      {/* MASTER TOGGLE - Disable All Processing */}
                      <div style={{ 
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                        marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e2e8f0'
                      }}>
                        <div>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>Skip All Processing</span>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Fastest export, no effects</div>
                        </div>
                        <button
                          onClick={() => setVideoOptions(v => ({ ...v, disableAllAdvanced: !v.disableAllAdvanced }))}
                          style={{
                            width: '40px', height: '22px', borderRadius: '11px', border: 'none', cursor: 'pointer',
                            background: videoOptions.disableAllAdvanced ? '#1E7F63' : '#cbd5e1', position: 'relative'
                          }}
                        >
                          <div style={{
                            width: '18px', height: '18px', borderRadius: '50%', background: 'white',
                            position: 'absolute', top: '2px', left: videoOptions.disableAllAdvanced ? '20px' : '2px',
                            transition: 'left 0.2s', boxShadow: '0 1px 2px rgba(0,0,0,0.2)'
                          }} />
                        </button>
                      </div>

                      {/* Only show other options when processing is enabled */}
                      <div style={{ opacity: videoOptions.disableAllAdvanced ? 0.4 : 1, pointerEvents: videoOptions.disableAllAdvanced ? 'none' : 'auto' }}>
                        {/* Clip Padding */}
                        <div style={{ marginBottom: '12px' }}>
                          <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Clip Padding (seconds before/after)</label>
                          <select
                            value={videoOptions.clipPadding}
                            onChange={(e) => setVideoOptions(v => ({ ...v, clipPadding: parseInt(e.target.value) }))}
                            style={{
                              width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0',
                              fontSize: '13px', background: 'white'
                            }}
                          >
                            <option value="2">2 seconds (tight)</option>
                            <option value="3">3 seconds</option>
                            <option value="4">4 seconds (recommended)</option>
                            <option value="5">5 seconds</option>
                            <option value="6">6 seconds (relaxed)</option>
                          </select>
                        </div>

                        {/* Transitions */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '13px', color: '#64748b' }}>Fade Transitions</span>
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
                          <label style={{ fontSize: '13px', color: '#64748b', display: 'block', marginBottom: '4px' }}>Color Filter</label>
                          <select
                            value={videoOptions.colorFilter}
                            onChange={(e) => setVideoOptions(v => ({ ...v, colorFilter: e.target.value }))}
                            style={{
                              width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #e2e8f0',
                              fontSize: '13px', background: 'white'
                            }}
                          >
                            <option value="none">None</option>
                            <option value="warm">Warm</option>
                            <option value="cool">Cool</option>
                            <option value="high_contrast">High Contrast</option>
                            <option value="cinematic">Cinematic</option>
                          </select>
                        </div>

                        {/* Audio Normalize */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '13px', color: '#64748b' }}>Normalize Audio</span>
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

                        {/* Logo Watermark */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <span style={{ fontSize: '13px', color: '#64748b' }}>🏷️ Logo Watermark</span>
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
                    </div>
                  )}
                </div>

                <button
                  className="btn-full-width btn-muted-primary"
                  onClick={() => buildReel('combined')}
                  disabled={loading.reel}
                >
                  {t.buildReel}
                </button>

                <button
                  className="btn-full-width btn-muted-social"
                  onClick={() => buildReel('social')}
                  disabled={loading.reel}
                >
                  Social Media Reel (Vertical)
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
                >
                  {t.downloadVideo}
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
                  ’ AI Assistant
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowKnowledgeBase(!showKnowledgeBase)}
                >
                  “¸ Knowledge Base
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
              {/* v6.1: Meeting Scorecard - Key Metrics at a Glance */}
              <MeetingScorecard
                transcript={fullText}
                highlights={highlightsWithQuotes}
                entities={entities}
                isLoading={loadingEntities}
              />

              {/* v6.1: Interactive Timeline with colored markers */}
              <InteractiveTimeline
                sents={sents}
                highlights={highlightsWithQuotes}
                playerRef={playerRef}
                videoId={videoId}
                addToBasket={addToBasket}
                pad={pad}
              />

              {/* Row: People/Places/Things + Topic Subscriptions */}
              <MentionedEntitiesCard
                entities={entities}
                isLoading={loadingEntities}
              />

              <TopicSubscriptionsPanel
                transcript={fullText}
                videoId={videoId}
                videoTitle={videoTitle}
              />

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

              <DisagreementTimeline
                sents={sents}
                playerRef={playerRef}
                videoId={videoId}
                openExpandedAt={openExpandedAt}
                addToBasket={addToBasket}
                pad={pad}
              />

              {/* DATA VISUALIZATIONS */}
              <CrossReferenceNetwork
                fullText={fullText}
                entities={entities}
              />

              <ConversationDynamics
                sents={sents}
                playerRef={playerRef}
                videoId={videoId}
              />

              {/* Full-width Issue Tracker & Meeting Comparison */}
              <div style={{ gridColumn: '1 / -1' }}>
                <CrossMeetingAnalysisPanel
                  currentVideoId={videoId}
                  currentTitle={videoTitle}
                  currentTranscript={fullText}
                  currentEntities={entities}
                  currentSummary={summary.para}
                />
              </div>


            </div>
          </section>
        )}

        {/* ’ AI Meeting Assistant */}
        {showAssistant && videoId && (
          <MeetingAssistant
            videoId={videoId}
            transcript={fullText}
            forceOpen={forceAssistantOpen}
          />
        )}

      </main>

      {/* “¸ Knowledge Base */}
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


      {/* 🧠 NEW: Optimization Panel */}
      {showOptimizationPanel && optimizationStats && (
        <OptimizationPanel
          stats={optimizationStats}
          onClose={() => setShowOptimizationPanel(false)}
          onClearCache={async () => {
            try {
              await apiClearCache();
              alert("âÅ“… Cache cleared!");
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