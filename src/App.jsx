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
  apiStoreTranscript
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

// v5.6: Replace Brooklyn with Brookline (common transcription error)
const fixBrooklyn = (text) => {
  if (!text) return text;
  return text
    .replace(/Brooklyn/gi, 'Brookline')
    .replace(/BROOKLYN/g, 'BROOKLINE');
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

function parseVTT(vtt) {
  if (!vtt) return [];
  const src = String(vtt).replace(/\r/g, "").replace(/^WEBVTT[^\n]*\n?/, "");
  const rx = /(\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)\s*-->\s*(\d{1,2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?).*?\n([\s\S]*?)(?=\n{2,}|\n(?=\d{1,2}:\d{2}.*?--> )|$)/g;
  let m, out = [], prev = "";
  while ((m = rx.exec(src))) {
    const s = toSec(m[1]), e = toSec(m[2]);
    let text = cleanHtmlEntities((m[3] || ""))
      .replace(/<\d{1,2}:\d{2}:\d{2}\.\d{1,3}>/g, "")
      .replace(/<\/?c[^>]*>/gi, "")
      .replace(/<\/?[^>]+>/g, "")
      .replace(/>>+/g, "")  // CRITICAL: Remove >> symbols
      .replace(/\s+/g, " ")
      .trim();
    if (text && text !== prev) {
      out.push({ start: s, end: e, text });
      prev = text;
    }
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
  const [isCompact, setIsCompact] = useState(false);
  
  useEffect(() => {
    const handleScroll = () => {
      setIsCompact(window.scrollY > 150);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  const stepColors = ['#059669', '#0891b2', '#7c3aed', '#db2777'];

  return (
    <section 
      className="how-to-permanent"
      style={{
        position: 'sticky',
        top: '0',
        zIndex: 100,
        background: 'white',
        padding: isCompact ? '8px 0' : '16px 0',
        transition: 'all 0.3s ease',
        boxShadow: isCompact ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
        borderBottom: isCompact ? '2px solid #e2e8f0' : 'none'
      }}
    >
      <div className="howto" style={{ 
        gap: isCompact ? '8px' : '12px',
        transition: 'all 0.3s ease'
      }}>
        <div 
          className="step step-clickable" 
          onClick={() => scrollToElement('url-input-section')}
          style={{ 
            cursor: 'pointer',
            padding: isCompact ? '8px 12px' : '16px',
            minHeight: isCompact ? 'auto' : '80px',
            transition: 'all 0.3s ease'
          }}
        >
          <div className="num" style={{ 
            background: stepColors[0],
            fontSize: isCompact ? '14px' : '18px',
            width: isCompact ? '28px' : '36px',
            height: isCompact ? '28px' : '36px',
            transition: 'all 0.3s ease'
          }}>1</div>
          <div>
            <div style={{ 
              fontSize: isCompact ? '14px' : '18px', 
              fontWeight: '800',
              color: stepColors[0],
              transition: 'all 0.3s ease'
            }}>Add a Meeting</div>
            {!isCompact && (
              <div className="step-subtitle" style={{ marginTop: '4px' }}>
                Paste a link to any YouTube video below
              </div>
            )}
          </div>
        </div>

        <div 
          className="step step-clickable" 
          onClick={() => scrollToElement('search-section')}
          style={{ 
            cursor: 'pointer',
            padding: isCompact ? '8px 12px' : '16px',
            minHeight: isCompact ? 'auto' : '80px',
            transition: 'all 0.3s ease'
          }}
        >
          <div className="num" style={{ 
            background: stepColors[1],
            fontSize: isCompact ? '14px' : '18px',
            width: isCompact ? '28px' : '36px',
            height: isCompact ? '28px' : '36px',
            transition: 'all 0.3s ease'
          }}>2</div>
          <div>
            <div style={{ 
              fontSize: isCompact ? '14px' : '18px', 
              fontWeight: '800',
              color: stepColors[1],
              transition: 'all 0.3s ease'
            }}>Search a Meeting</div>
            {!isCompact && (
              <div className="step-subtitle" style={{ marginTop: '4px' }}>
                Use the search bar or word cloud to find anything anywhere at anytime
              </div>
            )}
          </div>
        </div>

        <div 
          className="step step-clickable" 
          onClick={() => {
            if (onOpenAssistant) onOpenAssistant();
          }}
          style={{ 
            cursor: 'pointer',
            padding: isCompact ? '8px 12px' : '16px',
            minHeight: isCompact ? 'auto' : '80px',
            transition: 'all 0.3s ease'
          }}
        >
          <div className="num" style={{ 
            background: stepColors[2],
            fontSize: isCompact ? '14px' : '18px',
            width: isCompact ? '28px' : '36px',
            height: isCompact ? '28px' : '36px',
            transition: 'all 0.3s ease'
          }}>3</div>
          <div>
            <div style={{ 
              fontSize: isCompact ? '14px' : '18px', 
              fontWeight: '800',
              color: stepColors[2],
              transition: 'all 0.3s ease'
            }}>Talk to a Meeting</div>
            {!isCompact && (
              <div className="step-subtitle" style={{ marginTop: '4px' }}>
                An AI Agent will embed in the meeting and answer your questions
              </div>
            )}
          </div>
        </div>

        <div 
          className="step step-clickable" 
          onClick={() => scrollToElement('analytics-section')}
          style={{ 
            cursor: 'pointer',
            padding: isCompact ? '8px 12px' : '16px',
            minHeight: isCompact ? 'auto' : '80px',
            transition: 'all 0.3s ease'
          }}
        >
          <div className="num" style={{ 
            background: stepColors[3],
            fontSize: isCompact ? '14px' : '18px',
            width: isCompact ? '28px' : '36px',
            height: isCompact ? '28px' : '36px',
            transition: 'all 0.3s ease'
          }}>4</div>
          <div>
            <div style={{ 
              fontSize: isCompact ? '14px' : '18px', 
              fontWeight: '800',
              color: stepColors[3],
              transition: 'all 0.3s ease'
            }}>Analyze a Meeting</div>
            {!isCompact && (
              <div className="step-subtitle" style={{ marginTop: '4px' }}>
                Use the data visualizations to make quick sense of long meetings, and even suggest your own!
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// 🚀 NEW: Optimization Panel Component
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
        <h3 style={{ margin: 0, fontSize: '18px' }}>🚀 AI Optimizations</h3>
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
              {enabled ? 'âœ“' : 'â—‹'}
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
          <div>💾 Cache size: {cache.total_size_mb || 0} MB</div>
        </div>
      </div>

      <button
        className="btn btn-ghost"
        onClick={onClearCache}
        style={{ width: '100%', fontSize: '13px' }}
      >
        📸 Clear Cache
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
            <button className="btn-close-popup" onClick={() => setSelectedDecision(null)}>âœ•</button>
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
              <button className="btn-close-popup" onClick={closeModal}>âœ•</button>
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
      <div style={{ fontSize: 12, color: "#64748b" }}>{padTimePrecise(match.start)} â€” {padTimePrecise(match.end)}</div>
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
              <button className="btn-close-popup" onClick={closeTopicModal}>âœ•</button>
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
      'violation', 'unacceptable', 'unfortunately'
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

      if (score > 1) {
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
            <button className="btn-close-popup" onClick={() => setSelectedMoment(null)}>âœ•</button>
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

// NEW: Policy Impact Tracker
function PolicyImpactTracker({ fullText }) {
  const [policyData, setPolicyData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!fullText) return;

    setIsLoading(true);

    // Call the backend API
    fetch('/api/analytics/policy_impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: fullText })
    })
      .then(res => res.json())
      .then(data => {
        setPolicyData(data.policy_areas || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Policy impact error:', err);
        setIsLoading(false);
      });
  }, [fullText]);

  const total = policyData.reduce((sum, item) => sum + item.mentions, 0);

  return (
    <div className="viz-card policy-impact-tracker">
      <h3>Policy Impact Tracker</h3>
      <p className="viz-desc">
        Shows which policy areas were most discussed. Larger segments = more focus.
      </p>

      {isLoading ? (
        <div className="entities-loader-container">
          <div className="spinner" />
          <span>Analyzing policy areas...</span>
        </div>
      ) : policyData.length > 0 ? (
        <>
          <div className="policy-chart">
            {policyData.map((area, idx) => {
              const percentage = ((area.mentions / total) * 100).toFixed(1);
              const colors = ['#1e7f63', '#2d9f7f', '#3cbf9f', '#10b981', '#34d399', '#6ee7b7', '#99f6e4', '#ccfbf1'];

              return (
                <div
                  key={idx}
                  className="policy-segment"
                  style={{
                    flex: area.mentions,
                    backgroundColor: colors[idx % colors.length],
                    minWidth: '40px'
                  }}
                  title={`${area.category}: ${area.mentions} mentions (${percentage}%)`}
                >
                  {percentage > 8 && <span className="policy-label">{percentage}%</span>}
                </div>
              );
            })}
          </div>

          <div className="policy-legend">
            {policyData.map((area, idx) => {
              const percentage = ((area.mentions / total) * 100).toFixed(1);
              const colors = ['#1e7f63', '#2d9f7f', '#3cbf9f', '#10b981', '#34d399', '#6ee7b7', '#99f6e4', '#ccfbf1'];

              return (
                <div key={idx} className="policy-legend-item">
                  <div
                    className="policy-color-box"
                    style={{ backgroundColor: colors[idx % colors.length] }}
                  ></div>
                  <span className="policy-legend-label">
                    {area.category} ({area.mentions})
                  </span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="no-decisions">No policy areas detected</div>
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
            📸 Export
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
function ActionItemsTimeline({ fullText }) {
  const [actionItems, setActionItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    if (!fullText) return;

    setIsLoading(true);

    fetch('/api/analytics/action_items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: fullText })
    })
      .then(res => res.json())
      .then(data => {
        // Only keep items with actual dates
        const itemsWithDates = (data.action_items || []).filter(item =>
          item.date && item.date !== "No date specified"
        );
        setActionItems(itemsWithDates);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Action items error:', err);
        setIsLoading(false);
      });
  }, [fullText]);

  const exportCalendarImage = () => {
    const element = document.querySelector('.action-calendar-grid');
    if (!element) return;

    // Simple screenshot approach
    alert('Calendar export: Use browser screenshot (Cmd+Shift+4 on Mac, Win+Shift+S on Windows) to capture the calendar view.');
  };

  return (
    <div className="viz-card action-items-timeline">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Action Items Calendar</h3>
          <p className="viz-desc">
            Tasks with specific dates mentioned in the meeting. Click to see details.
          </p>
        </div>
        {actionItems.length > 0 && (
          <button className="btn btn-ghost btn-export" onClick={exportCalendarImage}>
            📸 Export
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="entities-loader-container">
          <div className="spinner" />
          <span>Extracting dated action items...</span>
        </div>
      ) : actionItems.length > 0 ? (
        <>
          <div className="action-calendar-grid">
            {actionItems.map((item, idx) => (
              <div
                key={idx}
                className={`calendar-item ${item.priority === 'high' ? 'calendar-item-high' : ''}`}
                onClick={() => setSelectedItem(item)}
              >
                <div className="calendar-date">{item.date}</div>
                <div className="calendar-text">{item.text.slice(0, 80)}...</div>
                {item.priority === 'high' && (
                  <div className="calendar-priority-dot"></div>
                )}
              </div>
            ))}
          </div>

          {selectedItem && (
            <div className="decision-popup">
              <div className="popup-header">
                <span>{selectedItem.date}</span>
                <button className="btn-close-popup" onClick={() => setSelectedItem(null)}>âœ•</button>
              </div>
              <div className="popup-text">
                {selectedItem.text}
              </div>
              <div className="popup-actions">
                <button className="btn btn-ghost" onClick={() => setSelectedItem(null)}>
                  Close
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="no-decisions">No action items with specific dates found</div>
      )}
    </div>
  );
}

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
          📸 Export
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
        <span style={{ color: '#3b82f6' }}>¼ Slow/Calm</span>
        <span style={{ color: '#10b981' }}>¼ Moderate</span>
        <span style={{ color: '#f59e0b' }}>¼ Active</span>
        <span style={{ color: '#ef4444' }}>¼ Fast/Intense</span>
      </div>
    </div>
  );
}

// NEW: Budget Impact Tracker - Bubble chart
function BudgetImpactTracker({ fullText }) {
  const [budgetItems, setBudgetItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    if (!fullText) return;

    setIsLoading(true);

    fetch('/api/analytics/budget_impact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: fullText })
    })
      .then(res => res.json())
      .then(data => {
        setBudgetItems(data.budget_items || []);
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Budget impact error:', err);
        setIsLoading(false);
      });
  }, [fullText]);

  const categoryColors = {
    "Capital Projects": "#1e7f63",
    "Salaries & Personnel": "#3b82f6",
    "Public Safety": "#ef4444",
    "Education": "#f59e0b",
    "Services": "#10b981",
    "Transportation": "#8b5cf6",
    "Other": "#64748b"
  };

  const maxAmount = budgetItems.length > 0 ? budgetItems[0].amount : 1;

  const exportBudgetImage = () => {
    alert('Budget export: Use browser screenshot to capture the visualization.');
  };

  return (
    <div className="viz-card budget-impact-tracker">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h3>Budget Impact Tracker</h3>
          <p className="viz-desc">
            Dollar amounts mentioned in the meeting. Size = amount, color = category. Click for details.
          </p>
        </div>
        {budgetItems.length > 0 && (
          <button className="btn btn-ghost btn-export" onClick={exportBudgetImage}>
            📸 Export
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="entities-loader-container">
          <div className="spinner" />
          <span>Analyzing budget mentions...</span>
        </div>
      ) : budgetItems.length > 0 ? (
        <>
          <div className="budget-bubble-container">
            {budgetItems.slice(0, 15).map((item, idx) => {
              const size = Math.max(40, Math.min(180, (item.amount / maxAmount) * 180));
              const color = categoryColors[item.category] || categoryColors["Other"];

              return (
                <div
                  key={idx}
                  className="budget-bubble"
                  style={{
                    width: `${size}px`,
                    height: `${size}px`,
                    backgroundColor: color,
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedItem(item)}
                  title={`${item.display} - ${item.category}`}
                >
                  <div className="budget-bubble-text">
                    {item.display}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="budget-legend">
            {Object.entries(categoryColors).map(([category, color]) => {
              const count = budgetItems.filter(item => item.category === category).length;
              if (count === 0) return null;

              return (
                <div key={category} className="budget-legend-item">
                  <div
                    className="budget-color-box"
                    style={{ backgroundColor: color }}
                  ></div>
                  <span>{category} ({count})</span>
                </div>
              );
            })}
          </div>

          {selectedItem && (
            <div className="decision-popup">
              <div className="popup-header">
                <span>{selectedItem.display} - {selectedItem.category}</span>
                <button className="btn-close-popup" onClick={() => setSelectedItem(null)}>âœ•</button>
              </div>
              <div className="popup-text">
                {selectedItem.context}
              </div>
              <div className="popup-actions">
                <button className="btn btn-ghost" onClick={() => setSelectedItem(null)}>
                  Close
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="no-decisions">No budget amounts detected in transcript</div>
      )}
    </div>
  );
}

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
            📸 Export
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
          <button className="btn-close" onClick={onClose}>âœ•</button>
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

function ProgressIndicator({ status, percent, message }) {
  return (
    <div className="progress-indicator animate-slideIn">
      <div className="progress-header">
        <div className={`status-dot ${status}`} />
        <span className="status-text">{message}</span>
      </div>
      {percent !== undefined && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${percent}%` }}>
            <span className="progress-percent">{Math.round(percent)}%</span>
          </div>
        </div>
      )}
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
          {timeEstimate && <span style={{ marginLeft: '8px' }}>â€¢ {timeEstimate}</span>}
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
            <button className="btn-close-popup" onClick={() => setShowForm(false)}>âœ•</button>
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
// 🔴 NEW v4.0 COMPONENTS: Enhanced Features
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

  return (
    <div
      className="clip-preview-wrapper"
      onMouseEnter={() => {
        loadPreview();
        setShowPreview(true);
      }}
      onMouseLeave={() => setShowPreview(false)}
    >
      <div className="basket-item">
        <div className="time">{padTime(clip.start)} â†’ {padTime(clip.end)}</div>
        <div className="text">{clip.text}</div>
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
function MeetingAssistant({ videoId, transcript }) {
  const [messages, setMessages] = useState([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
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
        💬 AI Assistant {isOpen ? 'âœ–' : ''}
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
        <h2>📸 Community Knowledge Base</h2>
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
            {isAddingToKB ? 'Adding...' : 'âž• Add Current Meeting to Knowledge Base'}
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

  // 🚀 NEW: Optimization stats state
  const [optimizationStats, setOptimizationStats] = useState(null);
  const [showOptimizationPanel, setShowOptimizationPanel] = useState(false);

  // 🔴 NEW v4.0: State for new features
  const [showAssistant, setShowAssistant] = useState(true);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showLiveMode, setShowLiveMode] = useState(false);

  const [expanded, setExpanded] = useState({ open: false, focusIdx: null });
  const [clipBasket, setClipBasket] = useState([]);
  const [lang, setLang] = useState("en");
  const [aiModel, setAiModel] = useState("gpt-4o");
  const [processStatus, setProcessStatus] = useState({ active: false, message: "", percent: 0 });
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
  // 🚀 NEW: Load optimization stats on mount
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

    setProcessStatus({ active: true, message: "Loading transcript...", percent: 10 });

    let vttText = "";
    try {
      setLoading(l => ({ ...l, transcript: true }));
      vttText = await apiTranscript(vid);


      setProcessStatus({ active: true, message: "Processing transcript...", percent: 30 });
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
    setProcessStatus({ active: true, message: "Generating word cloud...", percent: 50 });

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

    setProcessStatus({ active: true, message: "Generating AI summary...", percent: 70 });
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
          video_id: vid  // 🚀 NEW: For caching
        });

        let summaryText = "";
        if (res.summarySentences) {
          summaryText = res.summarySentences;
          summaryText = summaryText.replace(/^(Here's a concise 3-sentence summary:|Here is your summary:)\s*/i, '');
        }
        setSummary({ para: summaryText, bullets: [] });
      }

      setProcessStatus({ active: true, message: "Complete!", percent: 100 });
      setTimeout(() => setProcessStatus({ active: false, message: "", percent: 0 }), 2000);

    } catch (e) {
      console.error("Summary API error:", e);
      const sentences = all.split('.').filter(s => s.trim().length > 30);
      const fallbackSummary = sentences.slice(0, 3).join('. ') + '.';
      setSummary({ para: fallbackSummary, bullets: [] });
      setProcessStatus({ active: false, message: "", percent: 0 });
    }

    try {
      setProcessStatus({ active: true, message: "Extracting entities...", percent: 85 });
      const analyticsData = await apiExtendedAnalytics({
        transcript: all,
        model: aiModel,
        video_id: vid
      });
      setEntities(analyticsData.topEntities || []);
      setProcessStatus({ active: true, message: "Complete!", percent: 100 });
      setTimeout(() => setProcessStatus({ active: false, message: "", percent: 0 }), 2000);
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
        console.log("🔴 Live mode connected");
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
        console.log("🔴 Live mode disconnected");
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
    setProcessStatus({ active: true, message: "Generating AI summary...", percent: 70 });

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
        video_id: videoId  // 🚀 NEW: For caching
      });

      let summaryText = "";
      if (res.summarySentences) {
        summaryText = res.summarySentences;
        summaryText = summaryText.replace(/^(Here's a detailed summary:|Here is your summary:)\s*/i, '');
      }

      setSummary({ para: summaryText, bullets: [] });
      setProcessStatus({ active: true, message: "Complete!", percent: 100 });
      setTimeout(() => setProcessStatus({ active: false, message: "", percent: 0 }), 2000);

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
        setJob({
          id: jid,
          percent: status.percent || 0,
          message: status.message || "",
          status: status.status || "running",
          zip: status.zip || status.file || null
        });

        if (status.status === "done" || status.status === "error") {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
          setLoading(l => ({ ...l, clips: false, reel: false }));
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
      percent: 0
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

    if (!videoId || quotes.length === 0) {
      alert("Please generate AI highlights first. The reel is built from the quotes.");
      return;
    }

    setProcessStatus({
      active: true,
      message: format === 'social' ? "Building social media reel..." : "Building AI highlight reel...",
      percent: 0
    });
    setLoading(l => ({ ...l, reel: true }));

    try {
      const res = await apiHighlightReel({
        videoId,
        quotes: quotes,
        pad,
        format: format
      });
      pollJobStatus(res.jobId);
    } catch (e) {
      setProcessStatus({ active: false, message: "", percent: 0 });
      setLoading(l => ({ ...l, reel: false }));
    }
  };

  const generateHighlightsWithQuotes = async () => {
    if (!fullText) return;

    setProcessStatus({ active: true, message: "Generating highlights with quotes...", percent: 0 });
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
        const bullets = text.split(/\d+\.|¢|-/).filter(s => s.trim().length > 10);
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
    setProcessStatus({ active: true, message: `Translating to ${translateLang}...`, percent: 0 });

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
                ✕
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
                📰 Google News
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
                🗺️ Google Maps
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
                📚 Wikipedia
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
                Open in New Tab ↗
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

      {/* v5.6: Desktop download banner - only shows in cloud mode */}
      <DesktopAppBanner />
      
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
                {/* 🚀 NEW: Optimization button */}
                {optimizationStats && (
                  <button
                    className="btn btn-ghost"
                    onClick={() => setShowOptimizationPanel(!showOptimizationPanel)}
                    style={{
                      marginLeft: "12px",
                      fontSize: "13px",
                      padding: "8px 16px",
                      background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                      color: "white",
                      fontWeight: "700"
                    }}
                  >
                    🚀 {optimizationStats.estimated_savings?.percentage}% Savings
                  </button>
                )}
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
          <HowToGuide onOpenAssistant={() => setShowAssistant(true)} />

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
                  🔴 LIVE MODE - Real-time Updates
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
                âœ• Close
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
            {clipBasket.length > 0 && (
              <div className="basket-section animate-slideIn">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div style={{ fontWeight: 700 }}>
                    {t.savedClips}: {clipBasket.length}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn btn-primary animate-hover"
                      onClick={() => setShowExportModal(true)}
                    >
                      {t.exportClips}
                    </button>
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

            {job.status !== "idle" && (
              <div className="status-section animate-slideIn">
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

            {/* v5.2: Live Meeting Mode removed */}

            {videoId && (
              <div className="actions-section-vertical animate-slideIn">
                <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 16 }}>
                  {t.createReel}
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
                  Social Media Reel (60s)
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
                  className="btn-full-width btn-muted-ghost"
                  onClick={async () => {
                    if (!videoId) return;
                    setLoading(l => ({ ...l, mp4: true }));
                    try {
                      const d = await apiDownloadMp4(videoId);
                      window.open(d.file, '_blank');
                    } catch (e) { }
                    finally {
                      setLoading(l => ({ ...l, mp4: false }));
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
                  onClick={() => setShowAssistant(!showAssistant)}
                >
                  💬 AI Assistant
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowKnowledgeBase(!showKnowledgeBase)}
                >
                  📸 Knowledge Base
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
              <DecisionTimeline
                sents={sents}
                playerRef={playerRef}
                videoId={videoId}
                addToBasket={addToBasket}
                pad={pad}
                openExpandedAt={openExpandedAt}
              />

              <MentionedEntitiesCard
                entities={entities}
                isLoading={loadingEntities}
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

              {/* NEW DATA VISUALIZATIONS */}
              <PolicyImpactTracker
                fullText={fullText}
              />

              <CrossReferenceNetwork
                fullText={fullText}
                entities={entities}
              />

              <ActionItemsTimeline
                fullText={fullText}
              />


              {/* Add this */}
              <ConversationDynamics
                sents={sents}
                playerRef={playerRef}
                videoId={videoId}
              />



              {/* ADD THESE TWO */}
              <BudgetImpactTracker
                fullText={fullText}
              />


            </div>
          </section>
        )}

        {/* 💬 AI Meeting Assistant */}
        {showAssistant && videoId && (
          <MeetingAssistant
            videoId={videoId}
            transcript={fullText}
          />
        )}

      </main>

      {/* 📸 Knowledge Base */}
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
          </div>
        </div>
      </footer>


      {/* 🚀 NEW: Optimization Panel */}
      {showOptimizationPanel && optimizationStats && (
        <OptimizationPanel
          stats={optimizationStats}
          onClose={() => setShowOptimizationPanel(false)}
          onClearCache={async () => {
            try {
              await apiClearCache();
              alert("âœ… Cache cleared!");
              const newStats = await apiOptimizationStats();
              setOptimizationStats(newStats);
            } catch (e) {
              alert("Error clearing cache");
            }
          }}
        />
      )}




      {loading.transcript && <LoadingCard title="Loading transcript..." message="Fetching from YouTube" />}
      {loading.summary && <LoadingCard title="Generating AI highlights..." message={`Processing with ${aiModel}`} />}
      {loading.clips && <LoadingCard title="Processing export..." message={job.message} percent={job.percent} />}
      {loading.reel && <LoadingCard title="Building highlight reel..." message="Creating from AI highlights" />}
      {loading.translate && <LoadingCard title="Translating transcript..." message={`Translating to ${translateLang}`} />}
    </>
  );
}