import { useState, useMemo, useRef } from "react";
import VizExportButton from './VizExportButton';

const RECHARTS_COLORS = ['#1E7F63', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// ============================================================================
// Question Flow — shows actual questions with patterns and similarity grouping
// ============================================================================

export function QuestionFlowDiagram({ sents, onTimestampClick, addToBasket, pad = 3 }) {
  const cardRef = useRef(null);
  const [expandedType, setExpandedType] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const questionData = useMemo(() => {
    if (!sents || sents.length < 10) return { questions: [], byQuality: {}, patterns: [], byType: {} };
    const totalDuration = sents[sents.length - 1].end;
    const questions = [];

    sents.forEach((sent, idx) => {
      if (!sent.text.includes('?') || sent.text.length < 15) return;
      let responseQuality = 'unanswered';
      const responseWindow = sents.slice(idx + 1, Math.min(idx + 6, sents.length));
      const responseText = responseWindow.map(s => s.text).join(' ').toLowerCase();
      if (responseWindow.length > 0) {
        if (/\b(yes|no|will|plan|budget|recommend|specifically|data|number|percent|\d+)\b/.test(responseText)) {
          responseQuality = 'substantive';
        } else if (/\b(review|look into|follow up|get back|staff will|we'll consider|under consideration|working on)\b/.test(responseText)) {
          responseQuality = 'procedural';
        } else if (responseWindow[0].text.length > 20) {
          responseQuality = 'substantive';
        } else {
          responseQuality = 'deflection';
        }
      }
      const qLower = sent.text.toLowerCase();
      let questionType = 'general';
      if (/\b(how much|cost|budget|fund|dollar|spend|price)\b/.test(qLower)) questionType = 'budget';
      else if (/\b(when|timeline|deadline|schedule|date)\b/.test(qLower)) questionType = 'timeline';
      else if (/\b(who|responsible|in charge|accountable)\b/.test(qLower)) questionType = 'accountability';
      else if (/\b(why|reason|rationale|explain|justif)\b/.test(qLower)) questionType = 'rationale';
      else if (/\b(what|plan|proposal|option|alternative)\b/.test(qLower)) questionType = 'information';

      questions.push({ text: sent.text.slice(0, 200), time: sent.start, quality: responseQuality, type: questionType, pct: (sent.start / totalDuration) * 100 });
    });

    const byQuality = { substantive: 0, procedural: 0, deflection: 0, unanswered: 0 };
    const byType = {};
    questions.forEach(q => {
      byQuality[q.quality]++;
      if (!byType[q.type]) byType[q.type] = [];
      byType[q.type].push(q);
    });

    // Similarity grouping: find questions with >35% shared significant words
    const getWords = (text) => {
      const stop = new Set(['what','when','where','which','that','this','they','them','their','there','have','been','were','does','with','from','will','about','would','could','should','your','just','than','then','also','very','some','more']);
      return new Set((text.toLowerCase().match(/\b[a-z]{3,}\b/g) || []).filter(w => !stop.has(w)));
    };
    const patterns = [];
    const used = new Set();
    for (let i = 0; i < questions.length; i++) {
      if (used.has(i)) continue;
      const wordsA = getWords(questions[i].text);
      if (wordsA.size < 2) continue;
      const group = [i];
      for (let j = i + 1; j < questions.length; j++) {
        if (used.has(j)) continue;
        const wordsB = getWords(questions[j].text);
        if (wordsB.size < 2) continue;
        const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
        const union = new Set([...wordsA, ...wordsB]);
        if (union.size > 0 && intersection.size / union.size > 0.35) {
          group.push(j);
          used.add(j);
        }
      }
      if (group.length >= 2) {
        used.add(i);
        patterns.push({ questions: group.map(idx => questions[idx]), sharedWords: [...wordsA].slice(0, 5) });
      }
    }
    patterns.sort((a, b) => b.questions.length - a.questions.length);

    return { questions, byQuality, byType, patterns, total: questions.length };
  }, [sents]);

  if (questionData.total < 3) return null;

  const qualityColors = { substantive: '#22c55e', procedural: '#f59e0b', deflection: '#ef4444', unanswered: '#94a3b8' };
  const typeIcons = { budget: '$', timeline: 'T', accountability: 'A', rationale: '?', information: 'i', general: 'Q' };
  const typeColors = { budget: '#22c55e', timeline: '#3b82f6', accountability: '#8b5cf6', rationale: '#f59e0b', information: '#14b8a6', general: '#64748b' };
  const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const typeEntries = Object.entries(questionData.byType).sort((a, b) => b[1].length - a[1].length);
  const visibleLimit = showAll ? 999 : 30;

  // SVG donut chart data for question types
  const donutData = useMemo(() => {
    const entries = typeEntries.filter(([, qs]) => qs.length > 0);
    const total = entries.reduce((sum, [, qs]) => sum + qs.length, 0);
    let cumAngle = 0;
    return entries.map(([type, qs]) => {
      const frac = qs.length / total;
      const startAngle = cumAngle;
      cumAngle += frac * 360;
      return { type, count: qs.length, frac, startAngle, endAngle: cumAngle, color: typeColors[type] };
    });
  }, [typeEntries]);

  // Helper: SVG arc path for donut segment
  const arcPath = (cx, cy, r, inner, startDeg, endDeg) => {
    const toRad = d => (d - 90) * Math.PI / 180;
    const clampedEnd = endDeg - startDeg >= 360 ? startDeg + 359.99 : endDeg;
    const x1 = cx + r * Math.cos(toRad(startDeg)), y1 = cy + r * Math.sin(toRad(startDeg));
    const x2 = cx + r * Math.cos(toRad(clampedEnd)), y2 = cy + r * Math.sin(toRad(clampedEnd));
    const ix1 = cx + inner * Math.cos(toRad(clampedEnd)), iy1 = cy + inner * Math.sin(toRad(clampedEnd));
    const ix2 = cx + inner * Math.cos(toRad(startDeg)), iy2 = cy + inner * Math.sin(toRad(startDeg));
    const large = clampedEnd - startDeg > 180 ? 1 : 0;
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${ix1},${iy1} A${inner},${inner} 0 ${large} 0 ${ix2},${iy2} Z`;
  };

  // Selected type for filtering the question list below
  const [selectedType, setSelectedType] = useState(null);
  const [hoveredType, setHoveredType] = useState(null);
  const [showQuestions, setShowQuestions] = useState(false);
  const activeType = hoveredType || selectedType;

  // Filtered questions based on selected type
  const displayQuestions = useMemo(() => {
    if (!selectedType) return questionData.questions;
    return questionData.byType[selectedType] || [];
  }, [selectedType, questionData]);

  return (
    <div ref={cardRef} className="viz-card" style={{ gridColumn: '1 / -1', position: 'relative' }}>
      <VizExportButton targetRef={cardRef} filename="question-flow" />
      <h3>Question Flow</h3>
      <p className="viz-desc">{questionData.total} questions detected. Click a question type to filter. Click any timestamp to jump to that moment.</p>

      {/* ===== QUESTION TYPE VISUALIZATION — top hero section ===== */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* Donut chart */}
        <div style={{ position: 'relative', width: 180, height: 180, flexShrink: 0 }}>
          <svg viewBox="0 0 180 180" style={{ width: 180, height: 180 }}>
            {donutData.map((seg) => (
              <path key={seg.type} d={arcPath(90, 90, 80, 50, seg.startAngle, seg.endAngle)}
                fill={seg.color}
                opacity={activeType && activeType !== seg.type ? 0.25 : 0.85}
                stroke="#fff" strokeWidth="1.5"
                style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHoveredType(seg.type)}
                onMouseLeave={() => setHoveredType(null)}
                onClick={() => setSelectedType(selectedType === seg.type ? null : seg.type)}
              >
                <title>{`${seg.type}: ${seg.count} questions (${Math.round(seg.frac * 100)}%)`}</title>
              </path>
            ))}
            {/* Center label */}
            <text x="90" y="84" textAnchor="middle" fill="#1e293b" fontSize="22" fontWeight="800">{questionData.total}</text>
            <text x="90" y="102" textAnchor="middle" fill="#94a3b8" fontSize="10">questions</text>
          </svg>
        </div>

        {/* Type cards — interactive legend */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 8, minWidth: 0 }}>
          {donutData.map((seg) => {
            const isActive = selectedType === seg.type;
            const qs = questionData.byType[seg.type] || [];
            const substCount = qs.filter(q => q.quality === 'substantive').length;
            const deflectCount = qs.filter(q => q.quality === 'deflection' || q.quality === 'unanswered').length;
            return (
              <div key={seg.type}
                onClick={() => setSelectedType(isActive ? null : seg.type)}
                onMouseEnter={() => setHoveredType(seg.type)}
                onMouseLeave={() => setHoveredType(null)}
                style={{
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer', transition: 'all 0.2s',
                  background: isActive ? `${seg.color}15` : '#f8fafc',
                  border: `2px solid ${isActive ? seg.color : activeType === seg.type ? `${seg.color}60` : '#e2e8f0'}`,
                  transform: isActive ? 'scale(1.03)' : 'scale(1)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{
                    display: 'inline-flex', width: 26, height: 26, alignItems: 'center', justifyContent: 'center',
                    borderRadius: '50%', fontSize: 13, fontWeight: 800, background: `${seg.color}25`, color: seg.color,
                  }}>{typeIcons[seg.type]}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', textTransform: 'capitalize' }}>{seg.type}</span>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: seg.color, lineHeight: 1 }}>{seg.count}</div>
                {/* Quality breakdown mini-bar */}
                <div style={{ display: 'flex', gap: 1, height: 4, borderRadius: 2, overflow: 'hidden', marginTop: 6, background: '#e2e8f0' }}>
                  {substCount > 0 && <div style={{ width: `${(substCount / seg.count) * 100}%`, background: '#22c55e' }} />}
                  {qs.filter(q => q.quality === 'procedural').length > 0 && <div style={{ width: `${(qs.filter(q => q.quality === 'procedural').length / seg.count) * 100}%`, background: '#f59e0b' }} />}
                  {deflectCount > 0 && <div style={{ width: `${(deflectCount / seg.count) * 100}%`, background: '#ef4444' }} />}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#94a3b8' }}>
                  <span>{substCount} answered</span>
                  <span>{deflectCount} unanswered</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quality legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap', fontSize: 11 }}>
        {Object.entries(qualityColors).map(([k, c]) => (
          <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} />
            <span style={{ color: '#64748b', textTransform: 'capitalize' }}>{k}</span>
          </span>
        ))}
        {selectedType && (
          <button onClick={() => setSelectedType(null)} style={{ marginLeft: 'auto', fontSize: 11, color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
            Clear filter
          </button>
        )}
      </div>

      {/* Timeline strip — colored by quality, filterable */}
      <div style={{ position: 'relative', height: 28, background: '#f1f5f9', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
        {questionData.questions.map((q, i) => {
          const dimmed = selectedType && q.type !== selectedType;
          return (
            <div key={i}
              onClick={() => onTimestampClick && onTimestampClick(q.time)}
              style={{
                position: 'absolute', left: `${q.pct}%`, top: 3, width: 10, height: 22,
                borderRadius: 5, background: dimmed ? '#cbd5e1' : qualityColors[q.quality],
                opacity: dimmed ? 0.2 : 0.75, cursor: 'pointer',
                transform: 'translateX(-5px)', transition: 'opacity 0.2s, background 0.2s',
                border: activeType === q.type ? `2px solid ${typeColors[q.type]}` : 'none',
              }}
              title={`[${q.type}] ${formatTime(q.time)}: ${q.text.slice(0, 60)}`}
              onMouseOver={e => { if (!dimmed) e.currentTarget.style.opacity = '1'; }}
              onMouseOut={e => { if (!dimmed) e.currentTarget.style.opacity = '0.75'; }}
            />
          );
        })}
      </div>

      {/* Expand/collapse toggle for full question list */}
      <button onClick={() => { setShowQuestions(!showQuestions); if (!showQuestions) setShowAll(false); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px',
          background: showQuestions ? '#f0fdf4' : '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10,
          cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1e293b', transition: 'all 0.15s', marginBottom: showQuestions ? 12 : 0,
        }}>
        <span style={{ color: '#94a3b8', fontSize: 12 }}>{showQuestions ? '▼' : '▶'}</span>
        {showQuestions ? 'Hide' : 'Show'} All Questions
        {selectedType && <span style={{ fontSize: 11, color: typeColors[selectedType], fontWeight: 500 }}> — filtered to {selectedType}</span>}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>{displayQuestions.length} question{displayQuestions.length !== 1 ? 's' : ''}</span>
        {questionData.patterns.length > 0 && !selectedType && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 8, background: '#8b5cf615', color: '#8b5cf6', fontWeight: 600 }}>{questionData.patterns.length} patterns</span>}
      </button>

      {showQuestions && (
        <div>
          {/* Repeated Patterns section */}
          {questionData.patterns.length > 0 && !selectedType && (
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                Repeated Patterns
                <span style={{ fontSize: 11, fontWeight: 500, color: '#8b5cf6', background: '#8b5cf610', padding: '2px 8px', borderRadius: 8 }}>
                  Similar questions asked multiple times
                </span>
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {questionData.patterns.slice(0, 5).map((pattern, pi) => (
                  <div key={pi} style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '12px 16px' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#7c3aed', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ background: '#8b5cf6', color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 10, fontWeight: 700 }}>
                        Asked {pattern.questions.length}x
                      </span>
                      <span style={{ color: '#a78bfa', fontWeight: 500 }}>about: {pattern.sharedWords.join(', ')}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {pattern.questions.map((q, qi) => (
                        <div key={qi} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12 }}>
                          <button onClick={() => onTimestampClick && onTimestampClick(q.time)} style={{
                            fontFamily: 'monospace', fontSize: 10, color: '#4ade80', background: '#166534',
                            border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap',
                          }}>{formatTime(q.time)}</button>
                          <span style={{ flex: 1, color: '#334155', lineHeight: 1.4 }}>{q.text}</span>
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, background: `${qualityColors[q.quality]}20`, color: qualityColors[q.quality], fontWeight: 600, whiteSpace: 'nowrap' }}>
                            {q.quality}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Questions list — filtered by selected type */}
          <div style={{ maxHeight: 480, overflowY: 'auto' }}>
            {selectedType && (
              <div style={{ fontSize: 13, fontWeight: 700, color: typeColors[selectedType], marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}>
                <span style={{ display: 'inline-flex', width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: '50%', fontSize: 11, fontWeight: 800, background: `${typeColors[selectedType]}20`, color: typeColors[selectedType] }}>
                  {typeIcons[selectedType]}
                </span>
                {selectedType} Questions ({displayQuestions.length})
              </div>
            )}
            {displayQuestions.slice(0, visibleLimit).map((q, i) => (
              <div key={i} style={{
                display: 'flex', gap: 8, padding: '7px 10px', marginBottom: 4, background: '#f8fafc', borderRadius: 8,
                borderLeft: `3px solid ${qualityColors[q.quality]}`, alignItems: 'flex-start', fontSize: 13,
              }}>
                <button onClick={() => onTimestampClick && onTimestampClick(q.time)} style={{
                  fontFamily: 'monospace', fontSize: 11, color: '#4ade80', background: '#166534',
                  border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap', marginTop: 1,
                }}>{formatTime(q.time)}</button>
                <span style={{
                  display: 'inline-flex', width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
                  borderRadius: '50%', fontSize: 10, fontWeight: 700, background: `${typeColors[q.type]}20`, color: typeColors[q.type], flexShrink: 0, marginTop: 1,
                }}>{typeIcons[q.type]}</span>
                <span style={{ flex: 1, color: '#1e293b', lineHeight: 1.4 }}>{q.text}</span>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: `${qualityColors[q.quality]}20`, color: qualityColors[q.quality], fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {q.quality}
                </span>
                <button onClick={() => addToBasket && addToBasket({ start: Math.max(0, q.time - pad), end: q.time + 15, label: q.text.slice(0, 50) })}
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}
                >+ Clip</button>
              </div>
            ))}
            {displayQuestions.length > visibleLimit && !showAll && (
              <button onClick={() => setShowAll(true)} style={{ background: 'none', border: 'none', fontSize: 12, color: '#3b82f6', cursor: 'pointer', padding: '8px 10px', fontWeight: 600 }}>
                Show all {displayQuestions.length} questions...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Framing Plurality Map — how the same issue is discussed through different lenses
// ============================================================================

export function FramingPluralityMap({ sents, entities, onTimestampClick }) {
  const cardRef = useRef(null);
  const [expandedTopic, setExpandedTopic] = useState(null);
  const framingData = useMemo(() => {
    if (!sents || sents.length < 20) return [];
    const topicCandidates = {};
    const issueKeywords = ['housing', 'development', 'budget', 'school', 'parking', 'zoning', 'traffic', 'safety', 'park', 'water', 'sewer', 'tax', 'police', 'fire', 'building', 'project', 'property', 'street'];
    const framingLenses = {
      'financial': ['cost', 'budget', 'expense', 'tax', 'revenue', 'funding', 'afford', 'price', 'economic', 'investment', 'dollar', 'spend', 'money', 'fund', 'fee', 'rate'],
      'safety': ['safe', 'danger', 'risk', 'protect', 'emergency', 'security', 'hazard', 'concern', 'accident', 'health'],
      'community': ['neighbor', 'resident', 'community', 'family', 'quality of life', 'character', 'livability', 'people', 'children', 'senior'],
      'environmental': ['environment', 'green', 'sustainability', 'pollution', 'water', 'tree', 'wildlife', 'climate', 'stormwater', 'drainage'],
      'legal': ['regulation', 'code', 'ordinance', 'bylaw', 'compliance', 'requirement', 'permit', 'zoning', 'law', 'legal', 'violation'],
      'equity': ['affordable', 'access', 'equity', 'inclusive', 'fair', 'serve', 'low-income', 'underserved', 'diversity', 'equal'],
      'infrastructure': ['road', 'traffic', 'parking', 'transit', 'construction', 'build', 'repair', 'maintain', 'sewer', 'utility', 'sidewalk'],
      'process': ['timeline', 'deadline', 'delay', 'urgent', 'long-term', 'future', 'plan', 'schedule', 'phase', 'vote', 'approve', 'review']
    };

    const textLower = sents.map(s => s.text).join(' ').toLowerCase();
    issueKeywords.forEach(kw => {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      const matches = textLower.match(regex);
      if (matches && matches.length >= 4) topicCandidates[kw] = matches.length;
    });
    if (entities) {
      entities.slice(0, 10).forEach(e => {
        if (e.count >= 3 && e.type !== 'PERSON') topicCandidates[e.text.toLowerCase()] = e.count;
      });
    }

    const topTopics = Object.entries(topicCandidates).sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topTopics.length === 0) return [];

    return topTopics.map(([topic]) => {
      const framings = {};
      sents.forEach(sent => {
        if (!sent.text.toLowerCase().includes(topic)) return;
        const sentLower = sent.text.toLowerCase();
        Object.entries(framingLenses).forEach(([lens, keywords]) => {
          if (keywords.some(kw => sentLower.includes(kw))) {
            if (!framings[lens]) framings[lens] = { count: 0, examples: [] };
            framings[lens].count++;
            if (framings[lens].examples.length < 3) framings[lens].examples.push({ text: sent.text.slice(0, 120), time: sent.start });
          }
        });
      });
      return {
        topic: topic.charAt(0).toUpperCase() + topic.slice(1),
        framings: Object.entries(framings)
          .map(([lens, data]) => ({ lens, count: data.count, examples: data.examples }))
          .filter(f => f.count > 0)
          .sort((a, b) => b.count - a.count)
      };
    }).filter(t => t.framings.length >= 2);
  }, [sents, entities]);

  if (framingData.length === 0) return null;

  return (
    <div ref={cardRef} className="viz-card" style={{ gridColumn: '1 / -1', position: 'relative' }}>
      <VizExportButton targetRef={cardRef} filename="framing-plurality-map" />
      <h3>Framing Plurality Map</h3>
      <p className="viz-desc">A single issue is simultaneously many things. Each spoke shows a lens through which this topic was discussed.</p>
      <div style={{ background: '#f0fdf4', borderRadius: 8, padding: '12px 16px', marginBottom: 16, borderLeft: '3px solid #1E7F63' }}>
        <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, fontStyle: 'italic' }}>
          <strong style={{ fontStyle: 'normal' }}>How to read this:</strong> Each radial burst represents one topic. The center circle is the topic name. Spokes extend outward to show the different <em>frames</em> people used when discussing it — financial, safety, community, legal, etc. Longer spokes with larger dots mean that frame was used more often. A topic with many long spokes is being discussed from many angles, meaning it is complex and contested. Click any topic to see the actual quotes from the meeting that triggered each framing.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center' }}>
        {framingData.map((topic, tIdx) => {
          const cx = 190, cy = 175, baseRadius = 55;
          const maxCount = Math.max(...topic.framings.map(f => f.count), 1);
          const spokeCount = topic.framings.length;
          const isExpanded = expandedTopic === tIdx;
          return (
            <div key={tIdx} style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => setExpandedTopic(isExpanded ? null : tIdx)}>
              <svg width={380} height={370} viewBox="0 0 380 370">
                {/* Faint background rings */}
                <circle cx={cx} cy={cy} r={baseRadius + 20} fill="none" stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="4 4" />
                <circle cx={cx} cy={cy} r={baseRadius + 50} fill="none" stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="4 4" />
                <circle cx={cx} cy={cy} r={baseRadius + 80} fill="none" stroke="#e2e8f0" strokeWidth={0.5} strokeDasharray="4 4" />
                {/* Center topic */}
                <circle cx={cx} cy={cy} r={35} fill="#1E7F63" opacity={0.9} />
                <text x={cx} y={cy + 5} textAnchor="middle" fontSize={12} fill="white" fontWeight={700}>
                  {topic.topic.length > 12 ? topic.topic.slice(0, 12) + '..' : topic.topic}
                </text>
                {/* Spokes */}
                {topic.framings.map((framing, fIdx) => {
                  const angle = (fIdx / spokeCount) * 2 * Math.PI - Math.PI / 2;
                  const spokeLen = baseRadius + (framing.count / maxCount) * 80;
                  const endX = cx + Math.cos(angle) * spokeLen;
                  const endY = cy + Math.sin(angle) * spokeLen;
                  const labelX = cx + Math.cos(angle) * (spokeLen + 20);
                  const labelY = cy + Math.sin(angle) * (spokeLen + 20);
                  const color = RECHARTS_COLORS[fIdx % RECHARTS_COLORS.length];
                  const dotSize = 5 + (framing.count / maxCount) * 10;
                  return (
                    <g key={fIdx}>
                      <line x1={cx} y1={cy} x2={endX} y2={endY} stroke={color} strokeWidth={Math.max(2, (framing.count / maxCount) * 5)} opacity={0.5} />
                      <circle cx={endX} cy={endY} r={dotSize} fill={color} opacity={0.85} />
                      <text x={endX} y={endY + 3} textAnchor="middle" fontSize={9} fill="white" fontWeight={700}>{framing.count}</text>
                      <text x={labelX} y={labelY} textAnchor="middle" fontSize={11} fill={color} fontWeight={600}>{framing.lens}</text>
                    </g>
                  );
                })}
              </svg>
              {/* Expanded detail table */}
              {isExpanded && (
                <div style={{ textAlign: 'left', marginTop: 8, background: '#f8fafc', borderRadius: 8, padding: 12, maxWidth: 380, border: '1px solid #e2e8f0' }} onClick={e => e.stopPropagation()}>
                  {topic.framings.map((framing, fIdx) => (
                    <div key={fIdx} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: RECHARTS_COLORS[fIdx % RECHARTS_COLORS.length], display: 'inline-block' }} />
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>{framing.lens}</span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>({framing.count}x)</span>
                      </div>
                      {framing.examples.map((ex, eIdx) => (
                        <div key={eIdx} style={{ fontSize: 11, color: '#64748b', padding: '3px 0 3px 14px', borderLeft: `2px solid ${RECHARTS_COLORS[fIdx % RECHARTS_COLORS.length]}30`, lineHeight: 1.4, marginBottom: 2, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                          <button onClick={(ev) => { ev.stopPropagation(); onTimestampClick && onTimestampClick(ex.time); }}
                            style={{ fontFamily: 'monospace', fontSize: 10, color: '#4ade80', background: '#166534', border: 'none', borderRadius: 3, padding: '1px 4px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {Math.floor(ex.time / 60)}:{String(Math.floor(ex.time % 60)).padStart(2, '0')}
                          </button>
                          <span>"{ex.text}"</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Disagreement Topology — map the structure of debate
// ============================================================================

export function DisagreementTopology({ sents, onTimestampClick, addToBasket, pad = 3 }) {
  const cardRef = useRef(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const topology = useMemo(() => {
    if (!sents || sents.length < 20) return { nodes: [], edges: [] };
    const supportWords = ['support', 'agree', 'favor', 'approve', 'recommend', 'believe', 'think we should', 'need to', 'important'];
    const opposeWords = ['oppose', 'disagree', 'against', 'concerned', 'object', 'problem', "don't think", "don't agree", 'not in favor', "shouldn't", 'issue with', 'worried'];
    const positions = [];

    sents.forEach(sent => {
      if (sent.text.length < 30) return;
      const textLower = sent.text.toLowerCase();
      const hasOpinion = /\b(should|must|need|think|believe|support|oppose|recommend|propose|want|urge|request|ask)\b/i.test(sent.text);
      if (!hasOpinion) return;

      let stance = 'neutral';
      if (opposeWords.some(w => textLower.includes(w))) stance = 'oppose';
      else if (supportWords.some(w => textLower.includes(w))) stance = 'support';
      else return;

      // Tier 1: Expanded civic topic keywords (~100+)
      const topicWords = textLower.match(/\b(budget|school|housing|development|traffic|parking|zoning|project|building|property|tax|safety|police|water|sewer|park|street|plan|proposal|ordinance|policy|program|grant|fund|road|bridge|sidewalk|library|hospital|transit|bus|train|construction|permit|variance|density|commercial|residential|affordable|rent|homeless|shelter|environment|pollution|stormwater|flood|waste|recycling|energy|solar|playground|recreation|senior|youth|education|curriculum|election|ballot|resolution|revenue|debt|bond|levy|contract|bid|audit|transparency|ethics|annexation|equity|diversity|accessibility|disability|emergency|disaster|climate|pedestrian|bicycle|historic|landmark|noise|code|compliance|infrastructure|maintenance|renovation|demolition|crosswalk|intersection|speed|commuter|enrollment|staffing|overtime|pension|insurance|healthcare|childcare|broadband|internet|stormwater|drainage|wetland|conservation|composting|solar|wind|electric|vehicle|charging|rideshare)\b/);
      // Tier 2: Extract object of opinion verb
      let topic = topicWords ? topicWords[1] : null;
      if (!topic) {
        const objectMatch = textLower.match(/(?:support|oppose|against|about|regarding|on the|with the|for the|issue with)\s+(?:the\s+)?(\w{4,}(?:\s+\w{4,})?)/);
        if (objectMatch) topic = objectMatch[1];
      }
      // Tier 3: Longest meaningful word as topic
      if (!topic) {
        const stopwords = new Set(['this','that','they','them','their','there','these','those','have','been','were','what','when','where','which','while','would','could','should','about','after','before','because','between','through','during','under','above','with','from','into','than','then','some','such','very','also','just','more','most','only','other','each','every','both','many','much','here','will','your','does','done','like','make','made','want','need','know','going','come','take','give','keep','think','said','says','really','actually','certainly','believe','people','someone','something','anything','everyone','anybody','nothing','everything']);
        const words = textLower.match(/\b[a-z]{4,}\b/g) || [];
        const meaningful = words.filter(w => !stopwords.has(w));
        if (meaningful.length > 0) topic = meaningful.reduce((a, b) => a.length >= b.length ? a : b);
      }
      if (!topic) topic = 'general';

      positions.push({ text: sent.text.slice(0, 120), time: sent.start, stance, topic });
    });

    if (positions.length < 3) return { nodes: [], edges: [] };

    const edges = [];
    const usedPositions = new Set();
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        if (positions[i].topic === positions[j].topic && positions[i].stance !== positions[j].stance) {
          edges.push({ from: i, to: j });
          usedPositions.add(i);
          usedPositions.add(j);
        }
      }
    }

    const nodeIndices = [...usedPositions].slice(0, 16);
    const nodes = nodeIndices.map(i => ({ ...positions[i], idx: i }));
    const filteredEdges = edges.filter(e => nodeIndices.includes(e.from) && nodeIndices.includes(e.to)).slice(0, 24);

    return { nodes, edges: filteredEdges };
  }, [sents]);

  if (topology.nodes.length < 2) return null;

  const width = 750, height = 420;
  const nodePositions = topology.nodes.map((_, idx) => {
    const angle = (idx / topology.nodes.length) * 2 * Math.PI - Math.PI / 4;
    const r = 130 + (idx % 2) * 35;
    return { x: width / 2 + Math.cos(angle) * r, y: height / 2 + Math.sin(angle) * (r * 0.75) };
  });

  // Find edges connected to hovered node
  const hoveredEdges = hoveredNode !== null ? new Set(
    topology.edges.filter(e => {
      const fromIdx = topology.nodes.findIndex(n => n.idx === e.from);
      const toIdx = topology.nodes.findIndex(n => n.idx === e.to);
      return fromIdx === hoveredNode || toIdx === hoveredNode;
    }).map((_, i) => i)
  ) : new Set();

  return (
    <div ref={cardRef} className="viz-card" style={{ gridColumn: '1 / -1', position: 'relative' }}>
      <VizExportButton targetRef={cardRef} filename="disagreement-topology" />
      <h3>Disagreement Topology</h3>
      <p className="viz-desc">The shape of the controversy. Each node is a stated position; red lines connect opposing stances on the same topic.</p>
      <div style={{ background: '#fef2f2', borderRadius: 8, padding: '12px 16px', marginBottom: 16, borderLeft: '3px solid #ef4444' }}>
        <div style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, fontStyle: 'italic' }}>
          <strong style={{ fontStyle: 'normal' }}>How to read this:</strong> Green nodes are statements of <em>support</em>; red nodes are <em>opposition</em>. The topic keyword is shown inside each node. Dashed red lines connect opposing positions on the <em>same</em> topic — these are the fault lines of debate. Hover any node to highlight its connections and read the full statement. Clusters of connected nodes reveal the most contested issues.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} /> Support</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}><span style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} /> Oppose</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}><span style={{ width: 12, height: 2, background: '#ef4444', display: 'inline-block', opacity: 0.4 }} /> Contestation</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} style={{ maxHeight: 440 }}>
        {/* Edges */}
        {topology.edges.map((edge, edgeIdx) => {
          const fromIdx = topology.nodes.findIndex(n => n.idx === edge.from);
          const toIdx = topology.nodes.findIndex(n => n.idx === edge.to);
          if (fromIdx < 0 || toIdx < 0) return null;
          const isHighlighted = hoveredEdges.has(edgeIdx);
          return (
            <line key={edgeIdx}
              x1={nodePositions[fromIdx].x} y1={nodePositions[fromIdx].y}
              x2={nodePositions[toIdx].x} y2={nodePositions[toIdx].y}
              stroke="#ef4444" strokeWidth={isHighlighted ? 2.5 : 1.5}
              opacity={hoveredNode !== null ? (isHighlighted ? 0.7 : 0.08) : 0.25}
              strokeDasharray="6 3"
              style={{ transition: 'opacity 0.2s, stroke-width 0.2s' }}
            />
          );
        })}
        {/* Nodes */}
        {topology.nodes.map((node, idx) => {
          const pos = nodePositions[idx];
          const color = node.stance === 'support' ? '#22c55e' : '#ef4444';
          const isHovered = hoveredNode === idx;
          const isConnected = hoveredNode !== null && topology.edges.some(e => {
            const fi = topology.nodes.findIndex(n => n.idx === e.from);
            const ti = topology.nodes.findIndex(n => n.idx === e.to);
            return (fi === hoveredNode && ti === idx) || (ti === hoveredNode && fi === idx);
          });
          const dimmed = hoveredNode !== null && !isHovered && !isConnected;
          return (
            <g key={idx}
              onMouseEnter={() => setHoveredNode(idx)}
              onMouseLeave={() => setHoveredNode(null)}
              style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
              opacity={dimmed ? 0.2 : 1}
            >
              <circle cx={pos.x} cy={pos.y} r={isHovered ? 28 : 24} fill={color} opacity={isHovered ? 0.95 : 0.75}
                stroke={isHovered ? '#1e293b' : 'none'} strokeWidth={2}
                style={{ transition: 'r 0.2s, opacity 0.2s' }}
              />
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={10} fill="white" fontWeight={700}>{(node.topic.charAt(0).toUpperCase() + node.topic.slice(1)).slice(0, 12)}</text>
              {/* Text preview above node */}
              <text x={pos.x} y={pos.y - 32} textAnchor="middle" fontSize={10} fill="#475569" fontWeight={500}>
                {node.text.slice(0, 50)}{node.text.length > 50 ? '...' : ''}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Floating tooltip for hovered node */}
      {hoveredNode !== null && topology.nodes[hoveredNode] && (
        <div style={{
          position: 'absolute', bottom: 16, left: 16, right: 16,
          background: '#1e293b', color: '#e2e8f0', padding: '12px 16px', borderRadius: 8,
          fontSize: 13, lineHeight: 1.5, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          borderLeft: `4px solid ${topology.nodes[hoveredNode].stance === 'support' ? '#22c55e' : '#ef4444'}`,
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
            <span style={{ fontWeight: 700, color: topology.nodes[hoveredNode].stance === 'support' ? '#4ade80' : '#fca5a5' }}>
              {topology.nodes[hoveredNode].stance.toUpperCase()}
            </span>
            <span style={{ color: '#94a3b8' }}>on</span>
            <span style={{ fontWeight: 600 }}>{topology.nodes[hoveredNode].topic}</span>
          </div>
          <div style={{ marginBottom: 8 }}>"{topology.nodes[hoveredNode].text}"</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onTimestampClick && onTimestampClick(topology.nodes[hoveredNode].time)}
              style={{ fontSize: 11, padding: '3px 10px', background: '#334155', border: 'none', borderRadius: 4, color: '#4ade80', cursor: 'pointer', fontFamily: 'monospace' }}>
              {Math.floor(topology.nodes[hoveredNode].time / 60)}:{String(Math.floor(topology.nodes[hoveredNode].time % 60)).padStart(2, '0')} Jump
            </button>
            <button onClick={() => addToBasket && addToBasket({ start: Math.max(0, topology.nodes[hoveredNode].time - pad), end: topology.nodes[hoveredNode].time + 15, label: topology.nodes[hoveredNode].text.slice(0, 50) })}
              style={{ fontSize: 11, padding: '3px 10px', background: '#f59e0b', border: 'none', borderRadius: 4, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
              + Clip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// IssueLifecycle removed in v9.2
