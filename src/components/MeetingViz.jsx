import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const RECHARTS_COLORS = ['#1E7F63', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

// ============================================================================
// Question Flow Diagram — shows when questions clustered and actual question text
// ============================================================================

export function QuestionFlowDiagram({ sents, onTimestampClick, addToBasket, pad = 3 }) {
  const [showQuestions, setShowQuestions] = useState(false);
  const questionData = useMemo(() => {
    if (!sents || sents.length < 10) return { questions: [], byQuality: {}, bySegment: [] };
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
        } else if (responseWindow.length > 0 && responseWindow[0].text.length > 20) {
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

      questions.push({ text: sent.text.slice(0, 150), time: sent.start, quality: responseQuality, type: questionType, pct: (sent.start / totalDuration) * 100 });
    });

    const byQuality = { substantive: 0, procedural: 0, deflection: 0, unanswered: 0 };
    const byType = {};
    questions.forEach(q => {
      byQuality[q.quality]++;
      byType[q.type] = (byType[q.type] || 0) + 1;
    });

    const bucketSize = totalDuration / 10;
    const bySegment = Array.from({ length: 10 }, (_, i) => {
      const start = i * bucketSize;
      const end = (i + 1) * bucketSize;
      const segQ = questions.filter(q => q.time >= start && q.time < end);
      return {
        label: `${Math.floor(start / 60)}m`,
        total: segQ.length,
        substantive: segQ.filter(q => q.quality === 'substantive').length,
        procedural: segQ.filter(q => q.quality === 'procedural').length,
        deflection: segQ.filter(q => q.quality === 'deflection').length,
        unanswered: segQ.filter(q => q.quality === 'unanswered').length,
      };
    });

    return { questions, byQuality, byType: Object.entries(byType).sort((a, b) => b[1] - a[1]), bySegment, total: questions.length };
  }, [sents]);

  if (questionData.total < 3) return null;
  const qualityColors = { substantive: '#22c55e', procedural: '#f59e0b', deflection: '#ef4444', unanswered: '#94a3b8' };

  const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1' }}>
      <h3>Question Flow</h3>
      <p className="viz-desc">{questionData.total} questions detected. Shows when questions clustered, what types were asked, and whether they received substantive answers.</p>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        {Object.entries(qualityColors).map(([quality, color]) => (
          <div key={quality} style={{ padding: '8px 14px', background: `${color}15`, borderRadius: 8, borderLeft: `3px solid ${color}` }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{questionData.byQuality[quality]}</div>
            <div style={{ fontSize: 11, color: '#64748b' }}>{quality.charAt(0).toUpperCase() + quality.slice(1)}</div>
          </div>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={questionData.bySegment} margin={{ left: 0, right: 10, top: 5, bottom: 5 }}>
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} />
          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 8, color: '#e2e8f0', fontSize: 12 }} />
          <Bar dataKey="substantive" stackId="q" fill="#22c55e" name="Substantive" radius={[0, 0, 0, 0]} />
          <Bar dataKey="procedural" stackId="q" fill="#f59e0b" name="Procedural" />
          <Bar dataKey="deflection" stackId="q" fill="#ef4444" name="Deflection" />
          <Bar dataKey="unanswered" stackId="q" fill="#94a3b8" name="Unanswered" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {questionData.byType.length > 1 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {questionData.byType.map(([type, count]) => (
            <span key={type} style={{ padding: '3px 10px', background: '#f1f5f9', borderRadius: 12, fontSize: 11, color: '#475569', fontWeight: 500 }}>
              {type}: {count}
            </span>
          ))}
        </div>
      )}

      {/* Actual questions list */}
      <div style={{ marginTop: 16 }}>
        <button onClick={() => setShowQuestions(!showQuestions)} style={{
          background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: '6px 14px',
          fontSize: 12, color: '#475569', cursor: 'pointer', fontWeight: 600,
        }}>
          {showQuestions ? 'Hide' : 'Show'} Questions ({questionData.total})
        </button>
        {showQuestions && (
          <div style={{ marginTop: 10 }}>
            {/* Visual timeline strip showing question positions */}
            <div style={{ position: 'relative', height: 20, background: '#f1f5f9', borderRadius: 10, marginBottom: 10, overflow: 'hidden' }}>
              {questionData.questions.map((q, i) => (
                <div key={i}
                  onClick={() => onTimestampClick && onTimestampClick(q.time)}
                  style={{
                    position: 'absolute', left: `${q.pct}%`, top: 2, width: 8, height: 16,
                    borderRadius: 4, background: qualityColors[q.quality], opacity: 0.7, cursor: 'pointer',
                    transform: 'translateX(-4px)', transition: 'opacity 0.15s',
                  }}
                  title={`${formatTime(q.time)}: ${q.text.slice(0, 60)}`}
                  onMouseOver={e => e.target.style.opacity = '1'}
                  onMouseOut={e => e.target.style.opacity = '0.7'}
                />
              ))}
            </div>
          </div>
        )}
        {showQuestions && (
          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {questionData.questions.slice(0, 20).map((q, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, padding: '8px 12px', background: '#f8fafc', borderRadius: 8,
                borderLeft: `3px solid ${qualityColors[q.quality]}`, alignItems: 'flex-start', fontSize: 13,
              }}>
                <button onClick={() => onTimestampClick && onTimestampClick(q.time)} style={{
                  fontFamily: 'monospace', fontSize: 11, color: '#4ade80', background: '#166534',
                  border: 'none', borderRadius: 4, padding: '2px 6px', cursor: 'pointer', whiteSpace: 'nowrap', marginTop: 1,
                }} title="Jump to this moment in the video">
                  {formatTime(q.time)}
                </button>
                <span style={{ flex: 1, color: '#1e293b', lineHeight: 1.4 }} title={q.text}>
                  {q.text}
                </span>
                <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 8, background: `${qualityColors[q.quality]}20`, color: qualityColors[q.quality], fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {q.quality}
                </span>
                <button onClick={() => addToBasket && addToBasket({ start: Math.max(0, q.time - pad), end: q.time + 15, label: q.text.slice(0, 50) })}
                  style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}
                  title="Add this question to the clip timeline"
                >+ Clip</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Framing Plurality Map — how the same issue is discussed through different lenses
// ============================================================================

export function FramingPluralityMap({ sents, entities, onTimestampClick }) {
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
    <div className="viz-card" style={{ gridColumn: '1 / -1' }}>
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

      const topicWords = textLower.match(/\b(budget|school|housing|development|traffic|parking|zoning|project|building|property|tax|safety|police|water|sewer|park|street|plan|proposal|ordinance|policy|program|grant|fund)\b/);
      const topic = topicWords ? topicWords[1] : 'general';

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
    <div className="viz-card" style={{ gridColumn: '1 / -1', position: 'relative' }}>
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
              <text x={pos.x} y={pos.y + 4} textAnchor="middle" fontSize={11} fill="white" fontWeight={700}>{node.topic.slice(0, 10)}</text>
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

// ============================================================================
// Issue Lifecycle — track how topics progress through stages within a meeting
// ============================================================================

export function IssueLifecycle({ sents }) {
  const issues = useMemo(() => {
    if (!sents || sents.length < 10) return [];
    const totalDuration = sents[sents.length - 1].end;
    const stageKeywords = {
      introduced: ['new business', 'introduce', 'first time', 'bring up', 'raising', 'item number', 'agenda item', 'next item'],
      discussed: ['discuss', 'debate', 'consider', 'review', 'talk about', 'question about', 'thoughts on', 'comment on'],
      tabled: ['table', 'defer', 'postpone', 'continue', 'next meeting', 'revisit', 'push back', 'delay'],
      voted: ['vote', 'motion', 'approve', 'deny', 'all in favor', 'aye', 'nay', 'pass', 'second', 'carried', 'adopted'],
    };
    const stageColors = { introduced: '#3b82f6', discussed: '#f59e0b', tabled: '#f97316', voted: '#22c55e' };
    const stageLabels = { introduced: 'Introduced', discussed: 'Discussed', tabled: 'Tabled', voted: 'Voted' };

    const issueSegments = [];
    let currentIssue = null;
    sents.forEach((sent) => {
      const text = sent.text.toLowerCase();
      if (stageKeywords.introduced.some(kw => text.includes(kw)) && text.length > 20) {
        if (currentIssue && currentIssue.stages.length > 0) {
          issueSegments.push(currentIssue);
        }
        currentIssue = {
          label: sent.text.slice(0, 80),
          startTime: sent.start,
          stages: [{ stage: 'introduced', time: sent.start, pct: (sent.start / totalDuration) * 100 }]
        };
      }
      if (currentIssue) {
        for (const [stage, keywords] of Object.entries(stageKeywords)) {
          if (stage === 'introduced') continue;
          if (keywords.some(kw => text.includes(kw))) {
            const lastStage = currentIssue.stages[currentIssue.stages.length - 1];
            if (lastStage.stage !== stage && sent.start - lastStage.time > 10) {
              currentIssue.stages.push({ stage, time: sent.start, pct: (sent.start / totalDuration) * 100 });
            }
          }
        }
      }
    });
    if (currentIssue && currentIssue.stages.length > 0) issueSegments.push(currentIssue);

    return issueSegments.filter(i => i.stages.length >= 2).slice(0, 8).map(issue => ({
      ...issue, stageColors, stageLabels
    }));
  }, [sents]);

  if (issues.length === 0) return null;

  return (
    <div className="viz-card" style={{ gridColumn: '1 / -1' }}>
      <h3>Issue Lifecycle</h3>
      <p className="viz-desc">Track how topics progress through stages within this meeting. Each row is an issue; nodes show stages reached.</p>
      <div style={{ display: 'flex', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        {[['introduced', '#3b82f6'], ['discussed', '#f59e0b'], ['tabled', '#f97316'], ['voted', '#22c55e']].map(([stage, color]) => (
          <span key={stage} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block' }} />
            {stage.charAt(0).toUpperCase() + stage.slice(1)}
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {issues.map((issue, idx) => (
          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ width: 180, fontSize: 11, color: '#334155', fontWeight: 500, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={issue.label}>
              {issue.label.slice(0, 50)}{issue.label.length > 50 ? '...' : ''}
            </div>
            <div style={{ flex: 1, position: 'relative', height: 24 }}>
              <div style={{ position: 'absolute', top: 11, left: 0, right: 0, height: 2, background: '#e2e8f0' }} />
              {issue.stages.map((stage, sIdx) => (
                <div key={sIdx} style={{
                  position: 'absolute', left: `${stage.pct}%`, top: 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: issue.stageColors[stage.stage],
                  border: '2px solid white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transform: 'translateX(-9px)', cursor: 'default'
                }} title={`${issue.stageLabels[stage.stage]} at ${Math.floor(stage.time / 60)}:${String(Math.floor(stage.time % 60)).padStart(2, '0')}`} />
              ))}
              {issue.stages.length > 1 && (
                <div style={{
                  position: 'absolute', top: 11, left: `${issue.stages[0].pct}%`,
                  width: `${issue.stages[issue.stages.length - 1].pct - issue.stages[0].pct}%`,
                  height: 3, background: 'linear-gradient(90deg, #3b82f6, #22c55e)', borderRadius: 2
                }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, paddingLeft: 188, fontSize: 10, color: '#94a3b8' }}>
        <span>Start</span><span>25%</span><span>50%</span><span>75%</span><span>End</span>
      </div>
    </div>
  );
}
