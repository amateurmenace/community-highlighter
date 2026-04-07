import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, Legend, ReferenceLine } from 'recharts';
import {
  apiKBDashboardStats, apiEntityTracking, apiSentimentTimeline,
  apiDecisionsAcross, apiTopicClusters, apiKBCompareMeetings,
  apiIssueAISummary, apiParticipationAcross, streamEnrichMeeting,
  apiListKBMeetings, apiCreateIssue, apiListIssues, apiAddMeetingToIssue,
  apiGetIssueTimeline, apiAIComparison, streamAddToKnowledgeBase, apiDeleteKBMeeting,
  apiTopicDrilldown, apiSentimentExcerpts, apiSearchKnowledgeBase,
  apiKBFramingAnalysis, apiKBWordCloud
} from '../api';

const KBMontage = lazy(() => import('./kb/KBMontage.jsx'));

const COLORS = ['#4ade80', '#3b82f6', '#f59e0b', '#ef4444', '#a78bfa', '#ec4899', '#14b8a6', '#f97316'];
const DECISION_COLORS = { approved: '#22c55e', denied: '#ef4444', tabled: '#f59e0b', discussed: '#94a3b8' };
const FRAMING_COLORS = {
  financial: '#4ade80', safety: '#ef4444', community: '#3b82f6', environmental: '#22c55e',
  legal: '#f59e0b', equity: '#a78bfa', infrastructure: '#f97316', process: '#94a3b8'
};

// --- Shared styles ---
const S = {
  overlay: { minHeight: '100vh', background: '#0a0f1a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid #1e293b', background: '#0f172a', position: 'sticky', top: 0, zIndex: 10 },
  closeBtn: { background: 'none', border: '1px solid #475569', color: '#e2e8f0', width: 36, height: 36, borderRadius: 8, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  content: { padding: '20px 24px', maxWidth: 1400, margin: '0 auto' },
  card: { background: '#1e293b', borderRadius: 12, padding: '20px 24px', border: '1px solid #334155', marginBottom: 16 },
  cardTitle: { fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 14 },
  statCard: { background: '#0f172a', borderRadius: 10, padding: '20px 24px', border: '1px solid #334155', textAlign: 'center', minWidth: 140 },
  statValue: { fontSize: 36, fontWeight: 800, color: '#4ade80', lineHeight: 1.2 },
  statLabel: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  btn: (variant = 'default') => ({
    padding: '8px 16px', fontSize: 13, fontWeight: 600, borderRadius: 6, border: 'none', cursor: 'pointer',
    background: variant === 'green' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : variant === 'blue' ? '#3b82f6' : '#334155',
    color: 'white', transition: 'opacity 0.15s'
  }),
  tooltip: { background: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#e2e8f0', fontSize: 12 },
  emptyState: { fontSize: 14, color: '#64748b', textAlign: 'center', padding: '40px 20px' },
  enrichBanner: { background: '#1e293b', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid #f59e0b33' },
};

// --- Stat Card ---
function StatCard({ value, label, color }) {
  return (
    <div style={S.statCard}>
      <div style={{ ...S.statValue, color: color || '#4ade80' }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

// --- Enrichment Banner ---
function EnrichBanner({ stats, meetings, onEnrich }) {
  const unenriched = (stats?.total_meetings || 0) - (stats?.enriched_count || 0);
  const [enriching, setEnriching] = useState(false);
  const [currentMeeting, setCurrentMeeting] = useState('');
  const [progress, setProgress] = useState(0);
  const [completed, setCompleted] = useState(0);

  if (unenriched <= 0) return null;

  const enrichAll = async () => {
    if (enriching || !meetings?.length) return;
    setEnriching(true);
    setCompleted(0);
    for (let i = 0; i < meetings.length; i++) {
      const m = meetings[i];
      setCurrentMeeting(m.title || m.video_id);
      setProgress(0);
      await new Promise((resolve) => {
        streamEnrichMeeting(m.video_id,
          (data) => setProgress(data.progress),
          () => { setCompleted(prev => prev + 1); resolve(); },
          () => { setCompleted(prev => prev + 1); resolve(); }
        );
      });
    }
    setEnriching(false);
    setCurrentMeeting('');
    if (onEnrich) onEnrich();
  };

  return (
    <div style={{ ...S.enrichBanner, flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div>
          <span style={{ fontSize: 14, color: '#f59e0b', fontWeight: 600 }}>{unenriched} meeting{unenriched > 1 ? 's' : ''} need enrichment</span>
          <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8 }}>for full analytics</span>
        </div>
        <button onClick={enrichAll} disabled={enriching}
          style={{ ...S.btn('green'), padding: '10px 20px', fontSize: 14, opacity: enriching ? 0.7 : 1 }}>
          {enriching ? `Enriching ${completed + 1}/${meetings.length}...` : 'Enrich All Meetings'}
        </button>
      </div>
      {enriching && (
        <div style={{ width: '100%' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{currentMeeting}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 8, background: '#0f172a', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#4ade80', transition: 'width 0.3s' }} />
            </div>
            <span style={{ fontSize: 12, color: '#4ade80', minWidth: 35 }}>{progress}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ADD MEETING PANEL — prominent, with large progress and success state
// ============================================================================
function AddMeetingPanel({ onAdd, addingMeeting, addProgress, addSuccess, addUrl, setAddUrl, meetingCount, scrollToSection, addResult, onBulkAdd }) {
  const [showBulk, setShowBulk] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkStatus, setBulkStatus] = useState(null); // { total, completed, current, progress, stage }

  const handleBulkAdd = async () => {
    const lines = bulkUrls.split('\n').map(l => l.trim()).filter(Boolean);
    const extractId = (url) => {
      const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/,
      ];
      for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
      return null;
    };
    const videoIds = lines.map(extractId).filter(Boolean);
    if (!videoIds.length) return;

    setBulkStatus({ total: videoIds.length, completed: 0, current: '', progress: 0, stage: 'Starting...' });

    for (let i = 0; i < videoIds.length; i++) {
      setBulkStatus(prev => ({ ...prev, completed: i, current: videoIds[i], progress: 0, stage: `Processing meeting ${i + 1} of ${videoIds.length}...` }));

      await new Promise((resolve) => {
        streamAddToKnowledgeBase(
          { videoId: videoIds[i], metadata: {} },
          (data) => setBulkStatus(prev => ({ ...prev, progress: data.progress, stage: data.stage })),
          (data) => {
            setBulkStatus(prev => ({ ...prev, completed: i + 1, stage: `Completed: ${data.title || videoIds[i]}` }));
            resolve();
          },
          () => {
            setBulkStatus(prev => ({ ...prev, completed: i + 1, stage: `Failed: ${videoIds[i]}` }));
            resolve();
          }
        );
      });

      // Small delay between meetings to avoid rate limits
      if (i < videoIds.length - 1) {
        setBulkStatus(prev => ({ ...prev, stage: `Waiting before next meeting (${i + 2}/${videoIds.length})...` }));
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setBulkStatus(prev => ({ ...prev, stage: `Done! ${videoIds.length} meetings processed.` }));
    setBulkUrls('');
    if (onBulkAdd) onBulkAdd();
    setTimeout(() => setBulkStatus(null), 5000);
  };

  return (
    <div style={{ ...S.card, background: 'linear-gradient(135deg, #0f172a, #1e293b)', border: '1px solid #334155', marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: addingMeeting || addSuccess ? 16 : 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#f1f5f9', marginBottom: 4 }}>Add a Meeting</div>
          <div style={{ fontSize: 13, color: '#94a3b8' }}>Paste a YouTube URL to index and analyze with AI</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flex: 1, maxWidth: 500 }}>
          <input type="text" value={addUrl} onChange={e => setAddUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !addingMeeting && addUrl.trim() && onAdd()}
            placeholder="Paste a YouTube URL..."
            disabled={addingMeeting}
            style={{ flex: 1, padding: '12px 16px', fontSize: 14, borderRadius: 8, border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', outline: 'none' }} />
          <button onClick={onAdd} disabled={addingMeeting || !addUrl.trim()}
            style={{ ...S.btn('green'), padding: '12px 24px', fontSize: 14, minWidth: 100, opacity: addingMeeting ? 0.7 : 1 }}>
            {addingMeeting ? 'Adding...' : 'Add Meeting'}
          </button>
        </div>
      </div>

      {/* Progress indicator */}
      {addingMeeting && addProgress && (
        <div style={{ background: '#0f172a', borderRadius: 10, padding: '16px 20px', border: '1px solid #334155' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ade80', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 600 }}>{addProgress.stage}</span>
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: '#4ade80' }}>{addProgress.progress}%</span>
          </div>
          <div style={{ height: 12, background: '#1e293b', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${addProgress.progress}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #4ade80)', transition: 'width 0.3s', borderRadius: 6 }} />
          </div>
        </div>
      )}

      {/* Success state */}
      {addSuccess && !addingMeeting && (
        <div style={{ background: '#052e16', borderRadius: 10, padding: '16px 20px', border: '1px solid #22c55e44' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 20, color: '#4ade80' }}>&#10003;</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#4ade80' }}>{addSuccess}</div>
              <div style={{ fontSize: 12, color: '#86efac' }}>
                {addResult?.documents_added ? `${addResult.documents_added} chunks indexed` : 'Successfully indexed'}
                {addResult?.enrichment_added ? ` \u00b7 AI enrichment complete` : ''}
              </div>
            </div>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 10 }}>
            {meetingCount === 1
              ? 'Add one more meeting to unlock cross-meeting analytics like Topic Evolution, Entity Tracking, and Framing Analysis.'
              : meetingCount === 2
              ? 'Cross-meeting analytics are now available! Scroll down to explore Topics, Entities, Framing, and more.'
              : `Your Knowledge Base now has ${meetingCount} meetings. Check the analytics sections below for updated insights.`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => scrollToSection('meetings')} style={S.btn()}>View in Meetings</button>
            {meetingCount >= 2 && <>
              <button onClick={() => scrollToSection('topics')} style={S.btn('blue')}>Topics</button>
              <button onClick={() => scrollToSection('entities')} style={S.btn('blue')}>Entities</button>
              <button onClick={() => scrollToSection('framing')} style={S.btn('blue')}>Framing</button>
            </>}
            <button onClick={() => { setAddUrl(''); }} style={{ ...S.btn('green') }}>Add Another</button>
          </div>
        </div>
      )}

      {/* Bulk Add Toggle */}
      <div style={{ marginTop: addingMeeting || addSuccess ? 0 : 12 }}>
        <button onClick={() => setShowBulk(!showBulk)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, padding: 0 }}>
          {showBulk ? 'Hide bulk add' : 'Add multiple meetings at once'}
        </button>
      </div>
      {showBulk && (
        <div style={{ marginTop: 10, background: '#0f172a', borderRadius: 8, padding: '14px 16px', border: '1px solid #334155' }}>
          <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Paste one YouTube URL per line (up to 20). Meetings will be queued and processed sequentially.</div>
          <textarea value={bulkUrls} onChange={e => setBulkUrls(e.target.value)}
            placeholder="https://youtube.com/watch?v=...\nhttps://youtube.com/watch?v=...\nhttps://youtube.com/watch?v=..."
            rows={4} disabled={!!bulkStatus}
            style={{ width: '100%', padding: '10px 12px', fontSize: 13, borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', outline: 'none', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {bulkUrls.split('\n').filter(l => l.trim()).length} URL{bulkUrls.split('\n').filter(l => l.trim()).length !== 1 ? 's' : ''}
            </span>
            <button onClick={handleBulkAdd} disabled={!!bulkStatus || !bulkUrls.trim()}
              style={{ ...S.btn('green'), padding: '8px 20px', fontSize: 13 }}>
              {bulkStatus ? `Processing ${bulkStatus.completed}/${bulkStatus.total}...` : 'Add All Meetings'}
            </button>
          </div>
          {bulkStatus && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: '#94a3b8' }}>{bulkStatus.stage}</span>
                <span style={{ color: '#4ade80', fontWeight: 600 }}>{bulkStatus.completed}/{bulkStatus.total}</span>
              </div>
              <div style={{ height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${(bulkStatus.completed / bulkStatus.total) * 100}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #4ade80)', transition: 'width 0.5s', borderRadius: 4 }} />
              </div>
              {bulkStatus.progress > 0 && bulkStatus.progress < 100 && (
                <div style={{ height: 4, background: '#1e293b', borderRadius: 2, overflow: 'hidden', marginTop: 4 }}>
                  <div style={{ width: `${bulkStatus.progress}%`, height: '100%', background: '#3b82f6', transition: 'width 0.3s' }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================================
// ONBOARDING — first-visit tutorial overlay
// ============================================================================
function KBOnboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const steps = [
    {
      title: 'Welcome to Knowledge Base Analytics',
      content: 'Track civic issues across multiple meetings. Add YouTube recordings of public meetings, and AI will automatically extract topics, entities, decisions, and discussion framing patterns.',
    },
    {
      title: 'How It Works',
      items: [
        { icon: '1', text: 'Add meetings by pasting YouTube URLs' },
        { icon: '2', text: 'AI automatically extracts entities, decisions, topics, and analyzes discussion framing' },
        { icon: '3', text: 'Cross-meeting analytics reveal patterns, trends, and evolving civic narratives' },
      ]
    },
    {
      title: 'What You Can Do',
      items: [
        { icon: '\u2261', text: 'Topics — See how discussion themes evolve meeting to meeting', color: '#4ade80' },
        { icon: '\u2731', text: 'Entities — Track people, organizations, and places across meetings', color: '#3b82f6' },
        { icon: '\u25CE', text: 'Framing — Understand how issues are discussed through different lenses (financial, safety, equity, etc.)', color: '#a78bfa' },
        { icon: '\u2714', text: 'Decisions — Follow motions, votes, and outcomes over time', color: '#f59e0b' },
        { icon: '\u2194', text: 'Discourse — Trace how any topic or entity is discussed across meetings', color: '#ec4899' },
      ]
    },
    {
      title: 'Tips for Getting Started',
      items: [
        { icon: '\u2605', text: 'Add 2 or more meetings to unlock cross-meeting analytics' },
        { icon: '\u2605', text: 'Use Discourse Analysis to trace how specific civic issues evolve' },
        { icon: '\u2605', text: 'Check Framing Analysis to see how discussions are framed through different perspectives' },
        { icon: '\u2605', text: 'Build cross-meeting highlight reels with the Montage Maker' },
      ]
    }
  ];

  const s = steps[step];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => e.target === e.currentTarget && onComplete()}>
      <div style={{ background: '#0f172a', borderRadius: 16, padding: '32px 36px', maxWidth: 520, width: '90%', border: '1px solid #334155', position: 'relative' }}>
        <button onClick={onComplete} style={{ position: 'absolute', top: 12, right: 16, background: 'none', border: 'none', color: '#64748b', fontSize: 20, cursor: 'pointer' }}>&times;</button>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#f1f5f9', marginBottom: 16 }}>{s.title}</div>
        {s.content && <div style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.7, marginBottom: 20 }}>{s.content}</div>}
        {s.items && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
            {s.items.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 16, color: item.color || '#4ade80', minWidth: 24, textAlign: 'center', fontWeight: 700 }}>{item.icon}</span>
                <span style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.6 }}>{item.text}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {steps.map((_, i) => (
              <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i === step ? '#4ade80' : '#334155', transition: 'background 0.2s' }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && <button onClick={() => setStep(step - 1)} style={S.btn()}>Back</button>}
            {step < steps.length - 1
              ? <button onClick={() => setStep(step + 1)} style={S.btn('green')}>Next</button>
              : <button onClick={onComplete} style={S.btn('green')}>Get Started</button>}
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// OVERVIEW TAB
// ============================================================================
function OverviewTab({ stats, meetings }) {
  const fmtDate = d => d ? (d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}` : d) : '?';
  const sorted = useMemo(() => [...meetings].sort((a, b) => (a.date || '').localeCompare(b.date || '')), [meetings]);
  const [comparison, setComparison] = useState(null);
  const [compLoading, setCompLoading] = useState(false);
  const [previewVid, setPreviewVid] = useState(null);

  const runComparison = async () => {
    setCompLoading(true);
    try { const res = await apiAIComparison(); setComparison(res); } catch {}
    setCompLoading(false);
  };

  return (
    <div>
      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <StatCard value={stats.total_meetings || 0} label="Meetings" />
          <StatCard value={stats.enriched_count || 0} label="Enriched" color="#3b82f6" />
          <StatCard value={stats.total_decisions || 0} label="Decisions" color="#f59e0b" />
          <StatCard value={stats.top_entities?.length || 0} label="Entities" color="#a78bfa" />
        </div>
      )}

      {/* AI Comparison Hero */}
      <button onClick={runComparison} disabled={compLoading || (stats?.total_meetings || 0) < 2}
        style={{
          display: 'block', width: '100%', padding: '18px 24px', fontSize: 17, fontWeight: 800, borderRadius: 12,
          border: 'none', cursor: compLoading ? 'wait' : 'pointer', marginBottom: 20,
          background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: 'white', letterSpacing: '0.02em',
          opacity: (stats?.total_meetings || 0) < 2 ? 0.5 : 1, transition: 'opacity 0.2s'
        }}>
        {compLoading ? 'Generating AI Comparison...' : 'AI Comparison \u2014 Analyze All Meetings'}
      </button>

      {comparison && (
        <div style={{ marginBottom: 20 }}>
          {comparison.summary && (
            <div style={{ ...S.card, borderLeft: '4px solid #3b82f6' }}>
              <div style={S.cardTitle}>AI Summary</div>
              <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.7 }}>{comparison.summary}</div>
            </div>
          )}
          {comparison.key_themes?.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>Key Themes</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {comparison.key_themes.map((t, i) => (
                  <div key={i} style={{ background: '#0f172a', borderRadius: 8, padding: '14px 16px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: COLORS[i % COLORS.length], marginBottom: 6 }}>{t.theme}</div>
                    <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{t.description}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>{t.meetings_count} meetings</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {comparison.trends?.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>Trends</div>
              {comparison.trends.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #0f172a', alignItems: 'center' }}>
                  <span style={{ fontSize: 18, color: t.direction === 'increasing' ? '#4ade80' : t.direction === 'decreasing' ? '#ef4444' : '#f59e0b' }}>
                    {t.direction === 'increasing' ? '\u2191' : t.direction === 'decreasing' ? '\u2193' : '\u2192'}
                  </span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>{t.trend}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{t.details}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {comparison.recurring_entities?.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>Recurring People & Entities</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {comparison.recurring_entities.map((e, i) => (
                  <div key={i} style={{ background: '#0f172a', borderRadius: 8, padding: '10px 14px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#4ade80' }}>{e.name}</div>
                    <div style={{ fontSize: 12, color: '#94a3b8' }}>{e.role}</div>
                    <div style={{ fontSize: 11, color: '#64748b' }}>{e.appearances} appearances</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {comparison.recommendation && (
            <div style={{ ...S.card, borderLeft: '4px solid #f59e0b' }}>
              <div style={{ ...S.cardTitle, color: '#f59e0b' }}>Insight</div>
              <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.6 }}>{comparison.recommendation}</div>
            </div>
          )}
        </div>
      )}

      {/* Meeting Timeline SVG */}
      <div style={S.card}>
        <div style={S.cardTitle}>Meeting Timeline</div>
        {sorted.length > 0 ? (
          <svg viewBox={`0 0 ${Math.max(sorted.length * 100, 500)} 180`} style={{ width: '100%', height: 180 }}>
            <line x1="40" y1="90" x2={sorted.length * 100 - 10} y2="90" stroke="#334155" strokeWidth="2" />
            {sorted.map((m, i) => {
              const x = 40 + i * ((Math.max(sorted.length * 100, 500) - 80) / Math.max(sorted.length - 1, 1));
              const r = Math.min(10 + (m.chunk_count || 10) / 8, 24);
              return (
                <g key={m.video_id} style={{ cursor: 'pointer' }} onClick={() => setPreviewVid(previewVid === m.video_id ? null : m.video_id)}>
                  <circle cx={x} cy={90} r={r} fill="#1e7f63" stroke="#4ade80" strokeWidth="2" opacity={0.9} />
                  <text x={x} y={130} textAnchor="middle" fill="#94a3b8" fontSize="11">{fmtDate(m.date).slice(5)}</text>
                  <text x={x} y={55} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="600">{(m.title || '').slice(0, 22)}</text>
                </g>
              );
            })}
          </svg>
        ) : <div style={S.emptyState}>Add meetings to see the timeline</div>}
        {previewVid && (
          <div style={{ marginTop: 12 }}>
            <iframe src={`https://www.youtube.com/embed/${previewVid}`}
              style={{ width: '100%', height: 340, border: 'none', borderRadius: 8 }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={() => window.open(`/?v=${previewVid}`, '_blank')} style={S.btn('green')}>Open Full Analysis</button>
              <button onClick={() => setPreviewVid(null)} style={S.btn()}>Close</button>
            </div>
          </div>
        )}
      </div>

      {/* Recent Meetings */}
      <div style={S.card}>
        <div style={S.cardTitle}>Recently Added ({meetings.length})</div>
        {[...meetings].reverse().slice(0, 8).map(m => (
          <div key={m.video_id} style={{ borderBottom: '1px solid #0f172a' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <img src={`https://img.youtube.com/vi/${m.video_id}/default.jpg`} alt="" style={{ width: 72, height: 54, borderRadius: 6, objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                <div>
                  <div style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 500 }}>{m.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{fmtDate(m.date)} \u00b7 {m.chunk_count} chunks</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => setPreviewVid(previewVid === m.video_id ? null : m.video_id)} style={S.btn()}>
                  {previewVid === m.video_id ? 'Hide' : 'Preview'}
                </button>
                <button onClick={() => window.open(`/?v=${m.video_id}`, '_blank')} style={S.btn('green')}>Open</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top Entities */}
      {stats?.top_entities?.length > 0 && (
        <div style={S.card}>
          <div style={S.cardTitle}>Top Entities Across All Meetings</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {stats.top_entities.map((e, i) => (
              <span key={i} style={{ padding: '6px 12px', background: '#0f172a', borderRadius: 6, fontSize: 13, color: COLORS[i % COLORS.length], border: '1px solid #334155', fontWeight: 500 }}>
                {e.name} <span style={{ color: '#64748b' }}>({e.count})</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TOPICS TAB — heatmap + bump chart + lifecycle indicators
// ============================================================================
function TopicsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [drilldown, setDrilldown] = useState(null);
  const [drilldownData, setDrilldownData] = useState(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [hoverTopic, setHoverTopic] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiTopicClusters().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const handleCellClick = async (topic, meeting) => {
    const key = `${topic}_${meeting.video_id}`;
    if (drilldown?.key === key) { setDrilldown(null); setDrilldownData(null); return; }
    setDrilldown({ key, topic, video_id: meeting.video_id, meetingTitle: meeting.title });
    setDrilldownLoading(true);
    try {
      const res = await apiTopicDrilldown({ topic, video_id: meeting.video_id });
      setDrilldownData(res.excerpts || []);
    } catch { setDrilldownData([]); }
    setDrilldownLoading(false);
  };

  const heatmapData = useMemo(() => {
    if (!data?.clusters?.length || !data?.meetings?.length) return null;
    return data;
  }, [data]);

  // Compute lifecycle badges for each topic
  const lifecycles = useMemo(() => {
    if (!heatmapData) return {};
    const result = {};
    heatmapData.clusters.forEach(c => {
      const scores = c.scores;
      const len = scores.length;
      if (len < 2) { result[c.topic] = { badge: 'STABLE', color: '#64748b' }; return; }

      // Check if topic is new (only appears in last 2 meetings)
      const earlyScores = scores.slice(0, Math.max(1, len - 2));
      const lateScores = scores.slice(-2);
      const earlyMax = Math.max(...earlyScores);
      const lateMax = Math.max(...lateScores);
      if (earlyMax < 0.05 && lateMax >= 0.1) {
        result[c.topic] = { badge: 'NEW', color: '#4ade80' }; return;
      }

      // Check trend direction
      let rising = 0, falling = 0;
      for (let i = 1; i < len; i++) {
        if (scores[i] > scores[i-1] + 0.02) rising++;
        else if (scores[i] < scores[i-1] - 0.02) falling++;
      }
      if (rising >= 2 && rising > falling) {
        const pct = len >= 3 ? Math.round((scores[len-1] - scores[Math.max(0, len-3)]) * 100) : 0;
        result[c.topic] = { badge: 'RISING', color: '#3b82f6', pct }; return;
      }
      if (falling >= 2 && falling > rising) {
        result[c.topic] = { badge: 'FADING', color: '#f59e0b' }; return;
      }
      result[c.topic] = { badge: 'STABLE', color: '#64748b' };
    });
    return result;
  }, [heatmapData]);

  // Bump chart data: rank topics per meeting (must be before conditional returns)
  const bumpData = useMemo(() => {
    if (!heatmapData) return [];
    const meetings = heatmapData.meetings;
    const clusters = heatmapData.clusters;
    return meetings.map((m, j) => {
      const scored = clusters.map((c, i) => ({ topic: c.topic, score: c.scores[j] || 0, idx: i }));
      scored.sort((a, b) => b.score - a.score);
      const ranks = {};
      scored.forEach((s, rank) => { ranks[s.topic] = { rank: rank + 1, score: s.score }; });
      return { meeting: m, ranks };
    });
  }, [heatmapData]);

  if (loading) return <div style={S.emptyState}>Loading topic analysis...</div>;
  if (!heatmapData) return <div style={S.emptyState}>Need 2+ enriched meetings for topic analysis. Add more meetings and enrich them.</div>;

  const meetings = heatmapData.meetings;
  const clusters = heatmapData.clusters;
  const cellW = Math.max(70, Math.min(110, 900 / meetings.length));
  const cellH = 44;
  const labelW = 180;
  const badgeW = 60;
  const svgW = labelW + badgeW + meetings.length * cellW + 20;
  const svgH = 50 + clusters.length * cellH + 60;

  // Topic delta summary
  const newTopics = clusters.filter(c => lifecycles[c.topic]?.badge === 'NEW');
  const risingTopics = clusters.filter(c => lifecycles[c.topic]?.badge === 'RISING');
  const fadingTopics = clusters.filter(c => lifecycles[c.topic]?.badge === 'FADING');

  const bumpH = 450;
  const bumpW = Math.max(meetings.length * 120, 600);
  const bumpPadL = 50, bumpPadR = 30, bumpPadT = 40, bumpPadB = 60;
  const bumpPlotW = bumpW - bumpPadL - bumpPadR;
  const bumpPlotH = bumpH - bumpPadT - bumpPadB;

  return (
    <div>
      {/* Topic lifecycle summary */}
      {(newTopics.length > 0 || risingTopics.length > 0 || fadingTopics.length > 0) && (
        <div style={{ ...S.card, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {newTopics.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#4ade80', padding: '3px 8px', background: '#052e16', borderRadius: 4 }}>NEW</span>
              <span style={{ fontSize: 13, color: '#e2e8f0' }}>{newTopics.map(t => t.topic).join(', ')}</span>
            </div>
          )}
          {risingTopics.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6', padding: '3px 8px', background: '#172554', borderRadius: 4 }}>↑ RISING</span>
              <span style={{ fontSize: 13, color: '#e2e8f0' }}>{risingTopics.map(t => {
                const lc = lifecycles[t.topic];
                return `${t.topic}${lc?.pct ? ` (+${lc.pct}%)` : ''}`;
              }).join(', ')}</span>
            </div>
          )}
          {fadingTopics.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b', padding: '3px 8px', background: '#451a03', borderRadius: 4 }}>↓ FADING</span>
              <span style={{ fontSize: 13, color: '#e2e8f0' }}>{fadingTopics.map(t => t.topic).join(', ')}</span>
            </div>
          )}
        </div>
      )}

      {/* Topic Heatmap */}
      <div style={S.card}>
        <div style={S.cardTitle}>Topic Relevance Heatmap</div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>AI-generated topics scored by semantic relevance per meeting. Click a cell to see transcript excerpts.</p>
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', minWidth: svgW, height: svgH }}>
            {/* Column labels */}
            {meetings.map((m, j) => (
              <text key={j} x={labelW + badgeW + j * cellW + cellW / 2} y={38} textAnchor="middle" fill="#94a3b8" fontSize="11" transform={`rotate(-25 ${labelW + badgeW + j * cellW + cellW / 2} 38)`}>
                {m.date?.slice(5) || `M${j + 1}`}
              </text>
            ))}
            {/* Rows */}
            {clusters.map((c, i) => {
              const lc = lifecycles[c.topic];
              // Sparkline data
              const sparkW = 50, sparkH = 14;
              const sparkY = 55 + i * cellH + cellH / 2 - sparkH / 2;
              const maxScore = Math.max(...c.scores, 0.01);
              return (
                <g key={i}>
                  <text x={labelW - 6} y={55 + i * cellH + cellH / 2 + 4} textAnchor="end" fill="#e2e8f0" fontSize="13" fontWeight="600">{c.topic}</text>
                  {/* Sparkline */}
                  <polyline
                    points={c.scores.map((s, si) => `${labelW + 4 + si * (sparkW / Math.max(c.scores.length - 1, 1))},${sparkY + sparkH - (s / maxScore) * sparkH}`).join(' ')}
                    fill="none" stroke={lc?.color || '#64748b'} strokeWidth="1.5" opacity="0.7"
                  />
                  {/* Badge */}
                  {lc?.badge !== 'STABLE' && (
                    <text x={labelW + sparkW + 10} y={55 + i * cellH + cellH / 2 + 4} fill={lc?.color} fontSize="9" fontWeight="700">{lc?.badge}</text>
                  )}
                  {/* Heatmap cells */}
                  {c.scores.map((score, j) => (
                    <rect key={j} x={labelW + badgeW + j * cellW + 1} y={55 + i * cellH + 1} width={cellW - 2} height={cellH - 2}
                      rx="5" fill={drilldown?.key === `${c.topic}_${meetings[j]?.video_id}` ? '#3b82f6' : '#22c55e'}
                      opacity={Math.max(0.06, score)} style={{ cursor: 'pointer' }}
                      onClick={() => meetings[j] && handleCellClick(c.topic, meetings[j])}>
                      <title>{`${c.topic} in ${meetings[j]?.title || ''}: ${Math.round(score * 100)}% relevance`}</title>
                    </rect>
                  ))}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Drilldown Panel */}
        {drilldown && (
          <div style={{ background: '#0f172a', borderRadius: 8, padding: '16px 18px', marginTop: 14, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>{drilldown.topic}</span>
                <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 10 }}>in {drilldown.meetingTitle}</span>
              </div>
              <button onClick={() => { setDrilldown(null); setDrilldownData(null); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>&times;</button>
            </div>
            {drilldownLoading ? (
              <div style={{ fontSize: 13, color: '#64748b' }}>Loading excerpts...</div>
            ) : drilldownData?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {drilldownData.map((ex, i) => (
                  <div key={i} style={{ background: '#1e293b', borderRadius: 6, padding: '12px 14px', border: '1px solid #334155' }}>
                    <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>{ex.text}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>Relevance: {Math.round(ex.relevance * 100)}%</div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#64748b' }}>No relevant excerpts found.</div>
            )}
          </div>
        )}
      </div>

      {/* Bump Chart — Topic Ranking Over Time */}
      <div style={S.card}>
        <div style={S.cardTitle}>Topic Rankings Over Time</div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>Shows how each topic's rank changes across meetings. #1 = most relevant topic for that meeting.</p>
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${bumpW} ${bumpH}`} style={{ width: '100%', minWidth: bumpW, height: bumpH }}>
            {/* Top 3 rank bands */}
            {[0, 1, 2].map(rank => (
              <rect key={rank} x={bumpPadL} y={bumpPadT + (rank / clusters.length) * bumpPlotH}
                width={bumpPlotW} height={bumpPlotH / clusters.length}
                fill={rank === 0 ? '#4ade8008' : rank === 1 ? '#3b82f608' : '#f59e0b06'} />
            ))}
            {/* Y-axis labels */}
            {clusters.map((_, i) => {
              const y = bumpPadT + ((i + 0.5) / clusters.length) * bumpPlotH;
              return <text key={i} x={bumpPadL - 8} y={y + 4} textAnchor="end" fill="#64748b" fontSize="11">#{i + 1}</text>;
            })}
            {/* X-axis labels */}
            {meetings.map((m, j) => {
              const x = bumpPadL + (j / Math.max(meetings.length - 1, 1)) * bumpPlotW;
              return (
                <g key={j}>
                  <line x1={x} y1={bumpPadT} x2={x} y2={bumpPadT + bumpPlotH} stroke="#1e293b" strokeWidth="1" />
                  <text x={x} y={bumpH - 10} textAnchor="middle" fill="#94a3b8" fontSize="11">
                    {(m.date || '').slice(5) || `M${j + 1}`}
                  </text>
                  <text x={x} y={bumpH - 25} textAnchor="middle" fill="#64748b" fontSize="9">
                    {(m.title || '').slice(0, 18)}
                  </text>
                </g>
              );
            })}
            {/* Topic lines */}
            {clusters.map((c, ci) => {
              const color = COLORS[ci % COLORS.length];
              const points = bumpData.map((bd, j) => {
                const rank = bd.ranks[c.topic]?.rank || clusters.length;
                const x = bumpPadL + (j / Math.max(meetings.length - 1, 1)) * bumpPlotW;
                const y = bumpPadT + ((rank - 0.5) / clusters.length) * bumpPlotH;
                return { x, y, rank, score: bd.ranks[c.topic]?.score || 0 };
              });
              const isHovered = hoverTopic === c.topic;
              return (
                <g key={ci} onMouseEnter={() => setHoverTopic(c.topic)} onMouseLeave={() => setHoverTopic(null)}
                  style={{ cursor: 'pointer' }} opacity={hoverTopic && !isHovered ? 0.15 : 1}>
                  {/* Line */}
                  <polyline
                    points={points.map(p => `${p.x},${p.y}`).join(' ')}
                    fill="none" stroke={color} strokeWidth={isHovered ? 4 : 2.5} strokeLinejoin="round"
                  />
                  {/* Dots */}
                  {points.map((p, j) => (
                    <g key={j}>
                      <circle cx={p.x} cy={p.y} r={isHovered ? 8 : 5} fill={color} stroke="#0a0f1a" strokeWidth="2">
                        <title>{`${c.topic}: #${p.rank} (${Math.round(p.score * 100)}% relevance)`}</title>
                      </circle>
                      {isHovered && <text x={p.x} y={p.y - 12} textAnchor="middle" fill={color} fontSize="10" fontWeight="700">#{p.rank}</text>}
                    </g>
                  ))}
                  {/* Label at end */}
                  {points.length > 0 && (
                    <text x={points[points.length - 1].x + 8} y={points[points.length - 1].y + 4}
                      fill={color} fontSize={isHovered ? 12 : 10} fontWeight={isHovered ? 700 : 500}>{c.topic}</text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// ENTITIES TAB
// ============================================================================
function EntitiesTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiEntityTracking().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data?.entities) return [];
    if (!filter) return data.entities.slice(0, 25);
    return data.entities.filter(e => e.name.toLowerCase().includes(filter.toLowerCase())).slice(0, 25);
  }, [data, filter]);

  const chartData = useMemo(() => filtered.slice(0, 15).map(e => ({ name: e.name.length > 20 ? e.name.slice(0, 18) + '..' : e.name, count: e.total, type: e.type })), [filtered]);

  if (loading) return <div style={S.emptyState}>Loading entity data...</div>;
  if (!data?.entities?.length) return <div style={S.emptyState}>No entity data available. Enrich your meetings to see entities.</div>;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter entities..."
          style={{ padding: '10px 16px', fontSize: 14, borderRadius: 8, border: '1px solid #475569', background: '#1e293b', color: '#e2e8f0', outline: 'none', width: 320 }} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={S.card}>
          <div style={S.cardTitle}>Entity Frequency (Top 15)</div>
          <ResponsiveContainer width="100%" height={500}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 5 }}>
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis dataKey="name" type="category" tick={{ fill: '#e2e8f0', fontSize: 12 }} width={90} />
              <Tooltip contentStyle={S.tooltip} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={S.card}>
          <div style={S.cardTitle}>Entity Details</div>
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {filtered.map(e => (
              <div key={e.name} onClick={() => setSelected(selected === e.name ? null : e.name)}
                style={{ padding: '10px 12px', borderBottom: '1px solid #0f172a', cursor: 'pointer', background: selected === e.name ? '#0f172a' : 'transparent' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#f1f5f9', fontWeight: 500 }}>{e.name}</span>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, background: '#0f172a', color: e.type === 'person' ? '#4ade80' : e.type === 'organization' ? '#f59e0b' : e.type === 'place' ? '#3b82f6' : '#a78bfa' }}>
                      {e.type}
                    </span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{e.total} meetings</span>
                  </div>
                </div>
                {selected === e.name && e.appearances && (
                  <div style={{ marginTop: 8, paddingLeft: 10, borderLeft: '2px solid #334155' }}>
                    {e.appearances.map((a, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#94a3b8', padding: '3px 0' }}>
                        {a.date} \u2014 <span style={{ color: '#e2e8f0' }}>{a.title}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// DECISIONS TAB — visual timeline (replaces bar chart)
// ============================================================================
function DecisionsTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    apiDecisionsAcross().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const groupedByMeeting = useMemo(() => {
    if (!data?.decisions) return [];
    const groups = {};
    data.decisions.forEach(d => {
      const key = d.meeting_title || d.video_id || 'Unknown Meeting';
      if (!groups[key]) groups[key] = { title: key, date: d.date, decisions: [] };
      groups[key].decisions.push(d);
    });
    return Object.values(groups).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [data]);

  const totals = useMemo(() => {
    if (!data?.decisions) return { approved: 0, denied: 0, tabled: 0, discussed: 0 };
    const t = { approved: 0, denied: 0, tabled: 0, discussed: 0 };
    data.decisions.forEach(d => { t[d.type] = (t[d.type] || 0) + 1; });
    return t;
  }, [data]);

  if (loading) return <div style={S.emptyState}>Loading decisions...</div>;
  if (!data?.decisions?.length) return <div style={S.emptyState}>No decisions found. Enrich meetings to extract decisions.</div>;

  const total = data.total || data.decisions.length;

  return (
    <div>
      {/* Decision Outcomes Summary */}
      <div style={{ ...S.card, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <StatCard value={total} label="Total Decisions" />
        <div style={{ flex: 1, minWidth: 300 }}>
          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {Object.entries(totals).filter(([,v]) => v > 0).map(([type, count]) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: DECISION_COLORS[type] || '#94a3b8' }} />
                <span style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600 }}>{count}</span>
                <span style={{ fontSize: 12, color: '#94a3b8', textTransform: 'capitalize' }}>{type}</span>
              </div>
            ))}
          </div>
          {/* Proportional bar */}
          <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden' }}>
            {Object.entries(totals).filter(([,v]) => v > 0).map(([type, count]) => (
              <div key={type} style={{ width: `${(count / total) * 100}%`, background: DECISION_COLORS[type] || '#94a3b8', minWidth: 4 }}>
                <title>{`${type}: ${count} (${Math.round(count / total * 100)}%)`}</title>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Decision Timeline */}
      <div style={S.card}>
        <div style={S.cardTitle}>Decision Timeline</div>
        <div style={{ position: 'relative', paddingLeft: 28, maxHeight: 700, overflowY: 'auto' }}>
          <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, background: '#334155' }} />
          {groupedByMeeting.map((group, gi) => (
            <div key={gi} style={{ position: 'relative', marginBottom: 24 }}>
              {/* Timeline dot */}
              <div style={{ position: 'absolute', left: -24, top: 6, width: 16, height: 16, borderRadius: '50%', background: '#1e7f63', border: '3px solid #0a0f1a' }} />
              {/* Meeting header */}
              <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginBottom: 4 }}>{group.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
                {group.date ? `${group.date.slice(0,4)}-${group.date.slice(4,6)}-${group.date.slice(6)}` : ''} \u00b7 {group.decisions.length} decision{group.decisions.length !== 1 ? 's' : ''}
              </div>
              {/* Decisions for this meeting */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {group.decisions.map((d, di) => (
                  <div key={di} style={{ background: '#0f172a', borderRadius: 8, padding: '12px 16px', borderLeft: `4px solid ${DECISION_COLORS[d.type] || '#94a3b8'}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 4, background: '#1e293b', color: DECISION_COLORS[d.type] || '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {d.type}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, color: '#f1f5f9', lineHeight: 1.6 }}>{d.text}</div>
                    {d.context && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6, fontStyle: 'italic', lineHeight: 1.5 }}>{d.context}</div>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


// ============================================================================
// FRAMING TAB — replaces Sentiment (non-judgmental civic discourse analysis)
// ============================================================================
function FramingTab({ filterIds }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);

  useEffect(() => {
    setLoading(true);
    const body = filterIds ? { video_ids: filterIds } : {};
    apiKBFramingAnalysis(body).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [filterIds]);

  const fmtDate = d => d ? (d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}` : d) : '?';
  const lenses = Object.keys(FRAMING_COLORS);

  // Framing shift indicators (must be before conditional returns)
  const shifts = useMemo(() => {
    if (!data?.meetings?.length || data.meetings.length < 2) return [];
    const meetings = data.meetings;
    const result = [];
    lenses.forEach(lens => {
      const values = meetings.map(m => m.framings[lens] || 0);
      const first = values.slice(0, Math.ceil(values.length / 2));
      const second = values.slice(Math.ceil(values.length / 2));
      const avgFirst = first.reduce((a, b) => a + b, 0) / first.length;
      const avgSecond = second.reduce((a, b) => a + b, 0) / second.length;
      const change = avgSecond - avgFirst;
      if (Math.abs(change) > 2) {
        result.push({ lens, direction: change > 0 ? 'increasing' : 'decreasing', change: Math.round(Math.abs(change)) });
      }
    });
    return result.sort((a, b) => b.change - a.change).slice(0, 4);
  }, [data, lenses]);

  if (loading) return <div style={S.emptyState}>Loading framing analysis...</div>;
  if (!data?.meetings?.length) return <div style={S.emptyState}>No framing data available. Add and enrich meetings to see how civic issues are discussed through different lenses.</div>;

  const meetings = data.meetings;
  const maxCount = Math.max(...meetings.flatMap(m => lenses.map(l => m.framings[l] || 0)), 1);

  // Heatmap dimensions
  const cellW = Math.max(70, Math.min(110, 900 / meetings.length));
  const cellH = 44;
  const labelW = 120;
  const svgW = labelW + meetings.length * cellW + 20;
  const svgH = 50 + lenses.length * cellH + 60;

  // Selected meeting radial burst data
  const selectedData = selectedMeeting ? meetings.find(m => m.video_id === selectedMeeting) : null;

  return (
    <div>
      {/* Framing shift indicators */}
      {shifts.length > 0 && (
        <div style={{ ...S.card, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {shifts.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, color: s.direction === 'increasing' ? '#4ade80' : '#f59e0b' }}>
                {s.direction === 'increasing' ? '\u2191' : '\u2193'}
              </span>
              <span style={{ fontSize: 13, color: '#e2e8f0' }}>
                <span style={{ fontWeight: 700, textTransform: 'capitalize', color: FRAMING_COLORS[s.lens] }}>{s.lens}</span> framing is {s.direction}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Framing Heatmap */}
      <div style={S.card}>
        <div style={S.cardTitle}>Discussion Framing Across Meetings</div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>Shows how civic issues are discussed through 8 different perspectives. Click a meeting column to see its radial framing breakdown.</p>
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', minWidth: svgW, height: svgH }}>
            {/* Column labels */}
            {meetings.map((m, j) => (
              <text key={j} x={labelW + j * cellW + cellW / 2} y={38} textAnchor="middle" fill="#94a3b8" fontSize="11" transform={`rotate(-25 ${labelW + j * cellW + cellW / 2} 38)`}
                style={{ cursor: 'pointer' }} onClick={() => setSelectedMeeting(selectedMeeting === m.video_id ? null : m.video_id)}>
                {fmtDate(m.date).slice(5)}
              </text>
            ))}
            {/* Rows */}
            {lenses.map((lens, i) => (
              <g key={i}>
                <text x={labelW - 8} y={55 + i * cellH + cellH / 2 + 4} textAnchor="end" fill={FRAMING_COLORS[lens]} fontSize="13" fontWeight="600" style={{ textTransform: 'capitalize' }}>{lens}</text>
                {meetings.map((m, j) => {
                  const val = m.framings[lens] || 0;
                  const opacity = Math.max(0.06, val / maxCount);
                  return (
                    <rect key={j} x={labelW + j * cellW + 1} y={55 + i * cellH + 1} width={cellW - 2} height={cellH - 2}
                      rx="5" fill={FRAMING_COLORS[lens]} opacity={opacity}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedMeeting(selectedMeeting === m.video_id ? null : m.video_id)}>
                      <title>{`${lens} in ${m.title}: ${val} sentences`}</title>
                    </rect>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      </div>

      {/* Radial Burst for selected meeting */}
      {selectedData && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={S.cardTitle}>{selectedData.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: -8 }}>{fmtDate(selectedData.date)} \u00b7 {selectedData.total_sentences} sentences analyzed</div>
            </div>
            <button onClick={() => setSelectedMeeting(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20 }}>&times;</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <svg viewBox="0 0 420 420" style={{ width: 420, height: 420 }}>
              {/* Background rings */}
              {[70, 110, 150].map(r => (
                <circle key={r} cx={210} cy={210} r={r} fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" />
              ))}
              {/* Center */}
              <circle cx={210} cy={210} r={40} fill="#1e7f63" opacity="0.8" />
              <text x={210} y={206} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700">Framing</text>
              <text x={210} y={220} textAnchor="middle" fill="#86efac" fontSize="9">Analysis</text>
              {/* Spokes */}
              {lenses.map((lens, i) => {
                const val = selectedData.framings[lens] || 0;
                const angle = (i / lenses.length) * Math.PI * 2 - Math.PI / 2;
                const spokeLen = 50 + (val / maxCount) * 120;
                const endX = 210 + Math.cos(angle) * spokeLen;
                const endY = 210 + Math.sin(angle) * spokeLen;
                const labelX = 210 + Math.cos(angle) * (spokeLen + 28);
                const labelY = 210 + Math.sin(angle) * (spokeLen + 28);
                const dotR = 6 + (val / maxCount) * 14;
                return (
                  <g key={lens}>
                    <line x1={210} y1={210} x2={endX} y2={endY} stroke={FRAMING_COLORS[lens]} strokeWidth={Math.max(2, (val / maxCount) * 5)} opacity="0.6" />
                    <circle cx={endX} cy={endY} r={dotR} fill={FRAMING_COLORS[lens]} opacity="0.85">
                      <title>{`${lens}: ${val} sentences`}</title>
                    </circle>
                    <text x={endX} y={endY + 4} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="700">{val}</text>
                    <text x={labelX} y={labelY + 4} textAnchor="middle" fill={FRAMING_COLORS[lens]} fontSize="12" fontWeight="600" style={{ textTransform: 'capitalize' }}>{lens}</text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {/* Framing Evolution Line Chart */}
      <div style={S.card}>
        <div style={S.cardTitle}>Framing Evolution Over Time</div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>How the use of each framing perspective changes across meetings.</p>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={meetings.map(m => ({
            date: fmtDate(m.date),
            title: m.title,
            ...lenses.reduce((acc, l) => ({ ...acc, [l]: m.framings[l] || 0 }), {})
          }))} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} tickLine={false} axisLine={false} label={{ value: 'Sentences', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
            <Tooltip contentStyle={S.tooltip} labelFormatter={(l, p) => p?.[0]?.payload?.title || l} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            {lenses.map(lens => (
              <Line key={lens} type="monotone" dataKey={lens} stroke={FRAMING_COLORS[lens]} strokeWidth={2} dot={{ r: 4 }} name={lens.charAt(0).toUpperCase() + lens.slice(1)} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}


// ============================================================================
// PEOPLE TAB — unified participation matrix (sized circles, not binary)
// ============================================================================
function PeopleTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState(null);

  useEffect(() => {
    setLoading(true);
    apiParticipationAcross().then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Build matrix with mention counts (must be before conditional returns)
  const matrix = useMemo(() => {
    if (!data?.people?.length) return [];
    const people = data.people.slice(0, 15);
    const meetings = data.meetings || [];
    return people.map(p => {
      const meetingCounts = {};
      (p.meetings || []).forEach(m => { meetingCounts[m.video_id] = (m.count || 1); });
      return {
        name: p.name,
        total: p.total,
        cells: meetings.map(m => meetingCounts[m.video_id] || 0),
        meetings: p.meetings || []
      };
    });
  }, [data]);

  if (loading) return <div style={S.emptyState}>Loading participation data...</div>;
  if (!data?.people?.length) return <div style={S.emptyState}>No people data available. Enrich your meetings to see participation patterns.</div>;

  const people = data.people.slice(0, 15);
  const meetings = data.meetings || [];
  const fmtDate = d => d ? (d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}` : d) : '?';

  const maxCount = Math.max(...matrix.flatMap(r => r.cells), 1);

  // Summary stats
  const mostActive = people[0];
  const mostMeetings = [...people].sort((a, b) => (b.meetings?.length || 0) - (a.meetings?.length || 0))[0];

  const cellW = Math.max(50, Math.min(80, 800 / meetings.length));
  const cellH = 44;
  const labelW = 150;
  const svgW = labelW + meetings.length * cellW + 80;
  const svgH = 60 + matrix.length * cellH + 50;

  return (
    <div>
      {/* Summary */}
      <div style={{ ...S.card, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {mostActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>Most mentioned:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#4ade80' }}>{mostActive.name}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>({mostActive.total} times)</span>
          </div>
        )}
        {mostMeetings && mostMeetings.name !== mostActive?.name && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>Most active:</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>{mostMeetings.name}</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>({mostMeetings.meetings?.length || 0} meetings)</span>
          </div>
        )}
      </div>

      {/* Participation Matrix */}
      <div style={S.card}>
        <div style={S.cardTitle}>Participation Matrix</div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>Circle size shows how often each person is mentioned in each meeting. Click a row to see details.</p>
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox={`0 0 ${svgW} ${svgH}`} style={{ width: '100%', minWidth: svgW, height: svgH }}>
            {/* Column headers */}
            {meetings.map((m, j) => (
              <text key={j} x={labelW + j * cellW + cellW / 2} y={30} textAnchor="middle" fill="#94a3b8" fontSize="10" transform={`rotate(-30 ${labelW + j * cellW + cellW / 2} 30)`}>
                {fmtDate(m.date).slice(5)}
              </text>
            ))}
            {/* Rows */}
            {matrix.map((row, i) => {
              const isSelected = selectedPerson === row.name;
              return (
                <g key={i} style={{ cursor: 'pointer' }} onClick={() => setSelectedPerson(isSelected ? null : row.name)}>
                  {/* Row background on selection */}
                  {isSelected && <rect x={0} y={50 + i * cellH} width={svgW} height={cellH} fill="#0f172a" rx="4" />}
                  {/* Name */}
                  <text x={labelW - 8} y={50 + i * cellH + cellH / 2 + 4} textAnchor="end" fill={isSelected ? '#4ade80' : '#e2e8f0'} fontSize="12" fontWeight={isSelected ? 700 : 500}>
                    {row.name.length > 18 ? row.name.slice(0, 16) + '..' : row.name}
                  </text>
                  {/* Total badge */}
                  <text x={svgW - 30} y={50 + i * cellH + cellH / 2 + 4} textAnchor="middle" fill="#64748b" fontSize="10">{row.total}</text>
                  {/* Circles */}
                  {row.cells.map((val, j) => {
                    const cx = labelW + j * cellW + cellW / 2;
                    const cy = 50 + i * cellH + cellH / 2;
                    const maxR = Math.min(cellW, cellH) / 2 - 3;
                    const r = val > 0 ? Math.max(4, (val / maxCount) * maxR) : 0;
                    const opacity = val > 0 ? Math.max(0.3, val / maxCount) : 0;
                    return val > 0 ? (
                      <circle key={j} cx={cx} cy={cy} r={r} fill="#3b82f6" opacity={opacity}>
                        <title>{`${row.name} in ${meetings[j]?.title || 'meeting'}: ${val} mentions`}</title>
                      </circle>
                    ) : (
                      <circle key={j} cx={cx} cy={cy} r={3} fill="#1e293b" opacity={0.3} />
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>

      {/* Selected person detail */}
      {selectedPerson && (() => {
        const person = people.find(p => p.name === selectedPerson);
        if (!person) return null;
        return (
          <div style={{ ...S.card, borderLeft: '3px solid #3b82f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={S.cardTitle}>{person.name}</div>
              <button onClick={() => setSelectedPerson(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>&times;</button>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <StatCard value={person.total} label="Total Mentions" />
              <StatCard value={person.meetings?.length || 0} label="Meetings" color="#3b82f6" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Appearance Timeline</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(person.meetings || []).map((m, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: '#0f172a', borderRadius: 6 }}>
                  <span style={{ fontSize: 12, color: '#64748b', minWidth: 80 }}>{m.date || '?'}</span>
                  <span style={{ fontSize: 13, color: '#e2e8f0' }}>{m.title || m.video_id}</span>
                  {m.count && <span style={{ fontSize: 11, color: '#3b82f6', marginLeft: 'auto' }}>{m.count}x</span>}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}


// ============================================================================
// COMPARE TAB
// ============================================================================
function CompareTab({ meetings }) {
  const [vid1, setVid1] = useState('');
  const [vid2, setVid2] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleCompare = async () => {
    if (!vid1 || !vid2 || vid1 === vid2) return;
    setLoading(true);
    try { const res = await apiKBCompareMeetings({ video_id_1: vid1, video_id_2: vid2 }); setResult(res); } catch {}
    setLoading(false);
  };

  return (
    <div>
      <div style={{ ...S.card, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Meeting 1</div>
          <select value={vid1} onChange={e => setVid1(e.target.value)}
            style={{ padding: '10px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', minWidth: 280 }}>
            <option value="">Select meeting...</option>
            {meetings.map(m => <option key={m.video_id} value={m.video_id}>{m.title || m.video_id}</option>)}
          </select>
        </div>
        <div style={{ fontSize: 20, color: '#475569', paddingBottom: 10 }}>vs</div>
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Meeting 2</div>
          <select value={vid2} onChange={e => setVid2(e.target.value)}
            style={{ padding: '10px 14px', fontSize: 13, borderRadius: 6, border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', minWidth: 280 }}>
            <option value="">Select meeting...</option>
            {meetings.map(m => <option key={m.video_id} value={m.video_id}>{m.title || m.video_id}</option>)}
          </select>
        </div>
        <button onClick={handleCompare} disabled={loading || !vid1 || !vid2 || vid1 === vid2} style={{ ...S.btn('blue'), padding: '10px 20px', fontSize: 14 }}>
          {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {result && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, marginBottom: 16 }}>
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>{result.meeting1?.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{result.meeting1?.date}</div>
              <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 10 }}>{result.meeting1?.summary}</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <StatCard value={result.meeting1?.entity_count || 0} label="Entities" />
                <StatCard value={result.meeting1?.decision_count || 0} label="Decisions" color="#3b82f6" />
              </div>
            </div>
            <div style={{ ...S.card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 160 }}>
              <div style={{ ...S.statValue, fontSize: 40 }}>{Math.round((result.overlap_score || 0) * 100)}%</div>
              <div style={S.statLabel}>Entity Overlap</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>{result.shared_entities?.length || 0} shared</div>
            </div>
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6', marginBottom: 8 }}>{result.meeting2?.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 8 }}>{result.meeting2?.date}</div>
              <div style={{ fontSize: 13, color: '#e2e8f0', marginBottom: 10 }}>{result.meeting2?.summary}</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <StatCard value={result.meeting2?.entity_count || 0} label="Entities" />
                <StatCard value={result.meeting2?.decision_count || 0} label="Decisions" color="#3b82f6" />
              </div>
            </div>
          </div>
          {result.shared_entities?.length > 0 && (
            <div style={S.card}>
              <div style={S.cardTitle}>Shared Entities</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {result.shared_entities.map((e, i) => (
                  <span key={i} style={{ padding: '5px 12px', background: '#0f172a', borderRadius: 6, fontSize: 13, color: '#4ade80', border: '1px solid #22c55e44' }}>{e}</span>
                ))}
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={S.card}>
              <div style={S.cardTitle}>Unique to Meeting 1</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(result.unique_entities_1 || []).map((e, i) => (
                  <span key={i} style={{ padding: '4px 10px', background: '#0f172a', borderRadius: 4, fontSize: 12, color: '#94a3b8' }}>{e}</span>
                ))}
                {!result.unique_entities_1?.length && <span style={{ fontSize: 13, color: '#64748b' }}>None</span>}
              </div>
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>Unique to Meeting 2</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(result.unique_entities_2 || []).map((e, i) => (
                  <span key={i} style={{ padding: '4px 10px', background: '#0f172a', borderRadius: 4, fontSize: 12, color: '#94a3b8' }}>{e}</span>
                ))}
                {!result.unique_entities_2?.length && <span style={{ fontSize: 13, color: '#64748b' }}>None</span>}
              </div>
            </div>
          </div>
        </div>
      )}
      {!result && <div style={S.emptyState}>Select two meetings above to compare their entities, decisions, and framing.</div>}
    </div>
  );
}


// ============================================================================
// DISCOURSE TAB
// ============================================================================
function DiscourseTab() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [previewVid, setPreviewVid] = useState(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await apiSearchKnowledgeBase({ query: query.trim(), limit: 30 });
      const grouped = {};
      (res.results || []).forEach(r => {
        const vid = r.video_id;
        if (!grouped[vid]) grouped[vid] = { video_id: vid, title: r.title || vid, date: r.date || '', excerpts: [] };
        let text = r.text || r.document || '';
        if (text.includes('\n\nContent: ')) text = text.split('\n\nContent: ')[1];
        grouped[vid].excerpts.push({ text: text?.slice(0, 400), score: r.score || r.relevance || 0 });
      });
      setResults(Object.values(grouped).sort((a, b) => (a.date || '').localeCompare(b.date || '')));
    } catch { setResults([]); }
    setLoading(false);
  };

  const fmtDate = d => d ? (d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}` : d) : 'Date unknown';

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>Discourse Analysis</div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14, lineHeight: 1.6 }}>
          Search for an entity, topic, or phrase to see how it appears across different meetings over time.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="e.g., budget, zoning, school committee, public safety..."
            style={{ flex: 1, padding: '12px 16px', fontSize: 14, borderRadius: 8, border: '1px solid #475569', background: '#0f172a', color: '#e2e8f0', outline: 'none' }} />
          <button onClick={handleSearch} disabled={loading || !query.trim()} style={{ ...S.btn('green'), padding: '12px 24px', fontSize: 14 }}>
            {loading ? 'Searching...' : 'Trace Discourse'}
          </button>
        </div>
      </div>

      {results && results.length === 0 && (
        <div style={S.emptyState}>No mentions found across meetings for "{query}". Try a different search term.</div>
      )}

      {results && results.length > 0 && (
        <div>
          <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 14 }}>
            Found mentions across {results.length} meeting{results.length !== 1 ? 's' : ''} \u2014 shown chronologically
          </div>
          <div style={{ position: 'relative', paddingLeft: 28 }}>
            <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, background: '#334155' }} />
            {results.map((meeting, mi) => (
              <div key={meeting.video_id} style={{ position: 'relative', marginBottom: 20 }}>
                <div style={{ position: 'absolute', left: -24, top: 6, width: 16, height: 16, borderRadius: '50%', background: COLORS[mi % COLORS.length], border: '3px solid #0a0f1a' }} />
                <div style={S.card}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9' }}>{meeting.title}</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>
                        {fmtDate(meeting.date)} \u00b7 {meeting.excerpts.length} mention{meeting.excerpts.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => setPreviewVid(previewVid === meeting.video_id ? null : meeting.video_id)} style={S.btn()}>
                        {previewVid === meeting.video_id ? 'Hide Video' : 'Preview'}
                      </button>
                      <button onClick={() => window.open(`/?v=${meeting.video_id}`, '_blank')} style={S.btn('green')}>Open</button>
                    </div>
                  </div>
                  {previewVid === meeting.video_id && (
                    <div style={{ marginBottom: 12 }}>
                      <iframe src={`https://www.youtube.com/embed/${meeting.video_id}`}
                        style={{ width: '100%', height: 280, border: 'none', borderRadius: 8 }}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {meeting.excerpts.slice(0, 5).map((ex, ei) => (
                      <div key={ei} style={{ background: '#0f172a', borderRadius: 6, padding: '10px 12px', borderLeft: `3px solid ${COLORS[mi % COLORS.length]}` }}>
                        <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>{ex.text}</div>
                      </div>
                    ))}
                    {meeting.excerpts.length > 5 && (
                      <div style={{ fontSize: 12, color: '#64748b', paddingLeft: 12 }}>+ {meeting.excerpts.length - 5} more</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ============================================================================
// WORD CLOUD TAB — cross-meeting word analysis with connections
// ============================================================================
function WordCloudTab({ filterIds }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hoverWord, setHoverWord] = useState(null);
  const [selectedWord, setSelectedWord] = useState(null);
  const [searchResults, setSearchResults] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const body = filterIds ? { video_ids: filterIds } : {};
    apiKBWordCloud(body).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [filterIds]);

  // Layout words in a grid-like arrangement
  const layout = useMemo(() => {
    if (!data?.words?.length) return [];
    const words = data.words.slice(0, 60);
    const maxTotal = Math.max(...words.map(w => w.total), 1);
    const positioned = [];
    let x = 20, y = 30, rowHeight = 0, maxX = 900;

    words.forEach(w => {
      const fontSize = Math.max(13, Math.min(44, 13 + (w.total / maxTotal) * 31));
      const width = w.word.length * fontSize * 0.6 + 16;
      const height = fontSize + 12;

      if (x + width > maxX) { x = 20; y += rowHeight + 8; rowHeight = 0; }
      positioned.push({ ...w, x, y, fontSize, width, height });
      x += width + 10;
      rowHeight = Math.max(rowHeight, height);
    });

    return positioned;
  }, [data]);

  const svgH = layout.length > 0 ? Math.max(...layout.map(w => w.y + w.height)) + 30 : 400;

  const handleWordClick = async (word) => {
    if (selectedWord === word) { setSelectedWord(null); setSearchResults(null); return; }
    setSelectedWord(word);
    setSearchLoading(true);
    try {
      const res = await apiSearchKnowledgeBase({ query: word, limit: 10 });
      setSearchResults(res.results || []);
    } catch { setSearchResults([]); }
    setSearchLoading(false);
  };

  if (loading) return <div style={S.emptyState}>Loading word cloud data...</div>;
  if (!data?.words?.length) return <div style={S.emptyState}>No word data available. Add meetings to see cross-meeting word analysis.</div>;

  const meetings = data.meetings || [];
  const hoverData = data.words.find(w => w.word === hoverWord);

  return (
    <div>
      <div style={S.card}>
        <div style={S.cardTitle}>Cross-Meeting Word Cloud</div>
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 14 }}>Words sized by frequency across all meetings. Hover to see per-meeting breakdown. Click for transcript excerpts.</p>
        <div style={{ overflowX: 'auto', position: 'relative' }}>
          <svg viewBox={`0 0 900 ${svgH}`} style={{ width: '100%', minWidth: 700, height: svgH }}>
            {layout.map((w, i) => {
              const isHovered = hoverWord === w.word;
              const isSelected = selectedWord === w.word;
              // Color by which meeting it appears most in
              const primaryMeetingIdx = meetings.findIndex(m => m.video_id === w.meetings[0]?.video_id);
              const color = COLORS[(primaryMeetingIdx >= 0 ? primaryMeetingIdx : i) % COLORS.length];
              return (
                <g key={w.word} style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoverWord(w.word)} onMouseLeave={() => setHoverWord(null)}
                  onClick={() => handleWordClick(w.word)}>
                  {(isHovered || isSelected) && (
                    <rect x={w.x - 4} y={w.y - 2} width={w.width + 8} height={w.height + 4} rx="6" fill={isSelected ? '#3b82f620' : '#4ade8010'} stroke={isSelected ? '#3b82f6' : '#4ade8040'} strokeWidth="1" />
                  )}
                  <text x={w.x + 4} y={w.y + w.fontSize} fill={isHovered || isSelected ? '#fff' : color}
                    fontSize={w.fontSize} fontWeight={isHovered || isSelected ? 700 : 500}
                    opacity={hoverWord && !isHovered && !isSelected ? 0.3 : 1}>
                    {w.word}
                  </text>
                  {/* Meeting count badge */}
                  {w.num_meetings > 1 && (
                    <text x={w.x + w.width - 8} y={w.y + 10} fill="#64748b" fontSize="9">{w.num_meetings}m</text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Hover tooltip */}
          {hoverData && !selectedWord && (
            <div style={{ position: 'absolute', top: 8, right: 8, background: '#0f172a', borderRadius: 10, padding: '12px 16px', border: '1px solid #334155', minWidth: 200, zIndex: 5 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>{hoverData.word}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6 }}>{hoverData.total} total mentions across {hoverData.num_meetings} meeting{hoverData.num_meetings !== 1 ? 's' : ''}</div>
              {hoverData.meetings.slice(0, 5).map((m, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontSize: 12 }}>
                  <span style={{ color: '#e2e8f0' }}>{(m.title || '').slice(0, 25)}{(m.title || '').length > 25 ? '..' : ''}</span>
                  <span style={{ color: COLORS[i % COLORS.length], fontWeight: 600, marginLeft: 8 }}>{m.count}x</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Selected word detail */}
      {selectedWord && (
        <div style={{ ...S.card, borderLeft: '3px solid #3b82f6' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={S.cardTitle}>"{selectedWord}" across meetings</div>
            <button onClick={() => { setSelectedWord(null); setSearchResults(null); }} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 18 }}>&times;</button>
          </div>
          {/* Per-meeting frequency */}
          {(() => {
            const wd = data.words.find(w => w.word === selectedWord);
            if (!wd) return null;
            return (
              <div style={{ marginBottom: 16 }}>
                <ResponsiveContainer width="100%" height={Math.max(120, wd.meetings.length * 28 + 40)}>
                  <BarChart data={wd.meetings.slice(0, 10).map(m => ({ name: (m.title || '').slice(0, 20), count: m.count }))} layout="vertical" margin={{ top: 5, right: 20, left: 100, bottom: 5 }}>
                    <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fill: '#e2e8f0', fontSize: 11 }} width={100} />
                    <Tooltip contentStyle={S.tooltip} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
          {/* Transcript snippets */}
          <div style={{ fontSize: 14, fontWeight: 600, color: '#94a3b8', marginBottom: 8 }}>Transcript Excerpts</div>
          {searchLoading ? <div style={{ fontSize: 13, color: '#64748b' }}>Loading excerpts...</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(searchResults || []).slice(0, 6).map((r, i) => {
                let text = r.text || r.document || '';
                if (text.includes('\n\nContent: ')) text = text.split('\n\nContent: ')[1];
                return (
                  <div key={i} style={{ background: '#0f172a', borderRadius: 6, padding: '10px 12px', borderLeft: `3px solid ${COLORS[i % COLORS.length]}` }}>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{r.title || ''}</div>
                    <div style={{ fontSize: 13, color: '#e2e8f0', lineHeight: 1.6 }}>{(text || '').slice(0, 300)}</div>
                  </div>
                );
              })}
              {(!searchResults || searchResults.length === 0) && <div style={{ fontSize: 13, color: '#64748b' }}>No excerpts found.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ============================================================================
// MEETING LIST
// ============================================================================
function MeetingListTab({ meetings: initialMeetings, onEnrich }) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [previewVid, setPreviewVid] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [reanalyzing, setReanalyzing] = useState(null);
  const [reanalyzeProgress, setReanalyzeProgress] = useState(0);

  useEffect(() => { setMeetings(initialMeetings); }, [initialMeetings]);
  const fmtDate = d => d ? (d.length === 8 ? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}` : d) : 'Date unknown';

  const handleReanalyze = (videoId) => {
    setReanalyzing(videoId);
    setReanalyzeProgress(0);
    streamEnrichMeeting(videoId,
      (data) => setReanalyzeProgress(data.progress),
      () => { setReanalyzing(null); setReanalyzeProgress(0); if (onEnrich) onEnrich(); },
      () => { setReanalyzing(null); setReanalyzeProgress(0); }
    );
  };

  const handleDelete = async (videoId) => {
    try {
      await apiDeleteKBMeeting(videoId);
      setMeetings(prev => prev.filter(m => m.video_id !== videoId));
      setConfirmDelete(null);
      if (onEnrich) onEnrich();
    } catch { setConfirmDelete(null); }
  };

  if (!meetings.length) return <div style={S.emptyState}>No meetings yet. Add a YouTube URL using the panel above.</div>;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
      {meetings.map(m => (
        <div key={m.video_id} style={{ background: '#0f172a', borderRadius: 10, overflow: 'hidden', border: '1px solid #334155' }}>
          {previewVid === m.video_id ? (
            <div style={{ position: 'relative', paddingTop: '56.25%' }}>
              <iframe src={`https://www.youtube.com/embed/${m.video_id}?autoplay=1`}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen />
            </div>
          ) : (
            <div style={{ position: 'relative', paddingTop: '56.25%', background: '#0a0f1a', cursor: 'pointer' }}
              onClick={() => setPreviewVid(m.video_id)}>
              <img src={`https://img.youtube.com/vi/${m.video_id}/mqdefault.jpg`} alt=""
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => e.target.style.display = 'none'} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#fff', fontSize: 20, marginLeft: 3 }}>&#9654;</span>
              </div>
            </div>
          )}
          <div style={{ padding: '12px 14px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 6 }}>{m.title}</div>
            <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>
              {fmtDate(m.date)} \u00b7 {m.chunk_count} chunks
            </div>
            {reanalyzing === m.video_id && (
              <div style={{ marginBottom: 8 }}>
                <div style={{ height: 6, background: '#1e293b', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${reanalyzeProgress}%`, height: '100%', background: '#4ade80', transition: 'width 0.3s' }} />
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>Re-analyzing... {reanalyzeProgress}%</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => window.open(`/?v=${m.video_id}`, '_blank')} style={S.btn()}>Open in App</button>
              {previewVid === m.video_id && <button onClick={() => setPreviewVid(null)} style={S.btn()}>Stop</button>}
              {!reanalyzing && (
                <button onClick={() => handleReanalyze(m.video_id)} style={S.btn('blue')} title="Re-run AI analysis">Re-analyze</button>
              )}
              {confirmDelete === m.video_id ? (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#ef4444' }}>Remove?</span>
                  <button onClick={() => handleDelete(m.video_id)} style={{ ...S.btn(), background: '#ef4444', color: '#fff', fontSize: 11, padding: '4px 10px' }}>Yes</button>
                  <button onClick={() => setConfirmDelete(null)} style={{ ...S.btn(), fontSize: 11, padding: '4px 10px' }}>No</button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(m.video_id)}
                  style={{ ...S.btn(), color: '#94a3b8', fontSize: 11 }}>Remove</button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}


// ============================================================================
// SECTION HEADER
// ============================================================================
function SectionHeader({ id, title, subtitle }) {
  return (
    <div id={`kb-${id}`} style={{ marginTop: 36, marginBottom: 18, scrollMarginTop: 80 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9', letterSpacing: '-0.01em' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{subtitle}</div>}
      <div style={{ height: 3, background: 'linear-gradient(90deg, #4ade80, transparent)', marginTop: 10, borderRadius: 1 }} />
    </div>
  );
}

// ============================================================================
// SIDEBAR SECTIONS
// ============================================================================
const SECTIONS = [
  { id: 'overview', label: 'Overview', icon: '\u2302' },
  { id: 'meetings', label: 'Meetings', icon: '\u25A3' },
  { id: 'topics', label: 'Topics', icon: '\u2261' },
  { id: 'entities', label: 'Entities', icon: '\u2731' },
  { id: 'wordcloud', label: 'Word Cloud', icon: '\u2601' },
  { id: 'decisions', label: 'Decisions', icon: '\u2714' },
  { id: 'framing', label: 'Framing', icon: '\u25CE' },
  { id: 'people', label: 'People', icon: '\u263A' },
  { id: 'compare', label: 'Compare', icon: '\u21C4' },
  { id: 'discourse', label: 'Discourse', icon: '\u2194' },
  { id: 'divider', label: '' },
  { id: 'montage', label: 'Montage Maker', icon: '\u25B6' },
];

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================
export default function KBDashboard({ onClose, onNavigateHome }) {
  const navigateBack = onNavigateHome || onClose || (() => { window.location.href = '/'; });
  const [stats, setStats] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addUrl, setAddUrl] = useState('');
  const [addingMeeting, setAddingMeeting] = useState(false);
  const [addProgress, setAddProgress] = useState(null);
  const [addSuccess, setAddSuccess] = useState('');
  const [addResult, setAddResult] = useState(null);
  const [activeSection, setActiveSection] = useState('overview');
  const [showOnboarding, setShowOnboarding] = useState(() => !localStorage.getItem('kb_onboarding_complete'));
  const [selectedMeetingIds, setSelectedMeetingIds] = useState(null); // null = all, array = filtered
  const [dashboardGenerated, setDashboardGenerated] = useState(false);

  const extractVideoId = (url) => {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/,
    ];
    for (const p of patterns) { const m = url.match(p); if (m) return m[1]; }
    return null;
  };

  const handleAddByUrl = () => {
    const vid = extractVideoId(addUrl.trim());
    if (!vid) return;
    setAddingMeeting(true);
    setAddProgress({ progress: 0, stage: 'Starting...' });
    setAddSuccess('');
    setAddResult(null);
    streamAddToKnowledgeBase(
      { videoId: vid, metadata: {} },
      (data) => setAddProgress({ progress: data.progress, stage: data.stage }),
      (data) => {
        setAddingMeeting(false);
        setAddProgress(null);
        setAddUrl('');
        setAddSuccess(data.title || 'Meeting added and enriched');
        setAddResult(data);
        loadData();
      },
      () => { setAddingMeeting(false); setAddProgress(null); }
    );
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, meetingsRes] = await Promise.all([
        apiKBDashboardStats().catch(() => null),
        apiListKBMeetings().catch(() => ({ meetings: [] }))
      ]);
      if (statsRes) setStats(statsRes);
      setMeetings(meetingsRes.meetings || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Override body background for dark theme
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = '#0a0f1a';
    return () => { document.body.style.background = prev; };
  }, []);

  const scrollToSection = (id) => {
    setActiveSection(id);
    const el = document.getElementById(`kb-${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Track visible section
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id.replace('kb-', '');
          setActiveSection(id);
        }
      }
    }, { rootMargin: '-80px 0px -60% 0px' });
    SECTIONS.forEach(sec => {
      if (sec.id !== 'divider') {
        const el = document.getElementById(`kb-${sec.id}`);
        if (el) observer.observe(el);
      }
    });
    return () => observer.disconnect();
  }, [loading]);

  const handleRefresh = () => loadData();
  const completeOnboarding = () => { setShowOnboarding(false); localStorage.setItem('kb_onboarding_complete', 'true'); };

  // Empty state
  if (!loading && meetings.length === 0 && !addingMeeting && !addSuccess) {
    return (
      <div style={S.overlay} role="main" aria-label="Knowledge Base Analytics Dashboard">
        {showOnboarding && <KBOnboarding onComplete={completeOnboarding} />}
        <div style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button onClick={navigateBack}
              style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
              aria-label="Back to app">
              <span style={{ fontSize: 14 }}>&larr;</span> App
            </button>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Knowledge Base Analytics</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>Cross-meeting insights, patterns, and comparisons</div>
            </div>
          </div>
        </div>
        <div style={{ maxWidth: 600, margin: '80px auto', textAlign: 'center', padding: '0 24px' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f1f5f9', marginBottom: 14 }}>Get Started</div>
          <div style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.7, marginBottom: 36 }}>
            Paste a YouTube URL below to add your first meeting. Each meeting is automatically analyzed with AI to extract entities, decisions, and discussion framing. Add 2 or more meetings to unlock cross-meeting analytics.
          </div>
          <div style={{ display: 'flex', gap: 8, maxWidth: 520, margin: '0 auto' }}>
            <input type="text" value={addUrl} onChange={e => setAddUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addUrl.trim() && handleAddByUrl()}
              placeholder="Paste a YouTube URL..."
              style={{ flex: 1, padding: '14px 18px', fontSize: 15, borderRadius: 8, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', outline: 'none' }} />
            <button onClick={handleAddByUrl} disabled={!addUrl.trim() || addingMeeting}
              style={{ ...S.btn('green'), padding: '14px 28px', fontSize: 15 }}>
              {addingMeeting ? 'Adding...' : 'Add Meeting'}
            </button>
          </div>
          {addProgress && (
            <div style={{ maxWidth: 520, margin: '16px auto 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#94a3b8' }}>{addProgress.stage}</span>
                <span style={{ color: '#4ade80', fontWeight: 700 }}>{addProgress.progress}%</span>
              </div>
              <div style={{ height: 12, background: '#1e293b', borderRadius: 6, overflow: 'hidden' }}>
                <div style={{ width: `${addProgress.progress}%`, height: '100%', background: 'linear-gradient(90deg, #22c55e, #4ade80)', transition: 'width 0.3s', borderRadius: 6 }} />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={S.overlay} role="main" aria-label="Knowledge Base Analytics Dashboard">
      {showOnboarding && <KBOnboarding onComplete={completeOnboarding} />}

      {/* Header */}
      <div style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button onClick={navigateBack}
            style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}
            aria-label="Back to app">
            <span style={{ fontSize: 14 }}>&larr;</span> App
          </button>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f1f5f9' }}>Knowledge Base Analytics</div>
            <div style={{ fontSize: 13, color: '#94a3b8' }}>Cross-meeting insights, patterns, and comparisons</div>
          </div>
        </div>
        <button onClick={() => setShowOnboarding(true)}
          style={{ background: 'none', border: '1px solid #334155', color: '#94a3b8', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Show tutorial">?</button>
      </div>

      {/* Sidebar + Content */}
      <div style={{ display: 'flex', minHeight: 'calc(100vh - 65px)' }}>
        {/* Sidebar */}
        <nav style={{ width: 200, background: '#0f172a', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'sticky', top: 65, height: 'calc(100vh - 65px)', overflowY: 'auto' }}>
          <div style={{ flex: 1, padding: '12px 6px' }}>
            {SECTIONS.map(sec => {
              if (sec.id === 'divider') return <div key="div" style={{ height: 1, background: '#1e293b', margin: '8px 4px' }} />;
              const active = activeSection === sec.id;
              return (
                <button key={sec.id} onClick={() => scrollToSection(sec.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 10px',
                    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 500,
                    background: active ? '#1e293b' : 'transparent', color: active ? '#4ade80' : '#94a3b8',
                    borderLeft: active ? '3px solid #4ade80' : '3px solid transparent',
                    transition: 'all 0.15s', textAlign: 'left', marginBottom: 1,
                  }}>
                  <span style={{ fontSize: 14, width: 20, textAlign: 'center', opacity: active ? 1 : 0.6 }}>{sec.icon}</span>
                  <span>{sec.label}</span>
                  {sec.id === 'meetings' && meetings.length > 0 && (
                    <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 6px', borderRadius: 8, background: '#334155', color: '#94a3b8' }}>{meetings.length}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Sidebar Add Meeting */}
          <div style={{ padding: '10px', borderTop: '1px solid #1e293b' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>Quick Add</div>
            <input type="text" value={addUrl} onChange={e => { setAddUrl(e.target.value); setAddSuccess(''); }}
              onKeyDown={e => e.key === 'Enter' && !addingMeeting && addUrl.trim() && handleAddByUrl()}
              placeholder="YouTube URL..."
              style={{ width: '100%', padding: '7px 8px', fontSize: 11, borderRadius: 6, border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0', outline: 'none', boxSizing: 'border-box', marginBottom: 4 }} />
            <button onClick={handleAddByUrl} disabled={addingMeeting || !addUrl.trim()}
              style={{ ...S.btn('green'), width: '100%', padding: '6px', fontSize: 11, opacity: addingMeeting ? 0.7 : 1 }}>
              {addingMeeting ? 'Adding...' : 'Add'}
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <div style={{ ...S.content, maxWidth: 1200 }}>

            {loading && !stats ? (
              <div style={S.emptyState}>Loading dashboard...</div>
            ) : (
              <>
                {/* Add Meeting Panel */}
                <AddMeetingPanel
                  onAdd={handleAddByUrl} addingMeeting={addingMeeting} addProgress={addProgress}
                  addSuccess={addSuccess} addUrl={addUrl} setAddUrl={setAddUrl}
                  meetingCount={meetings.length} scrollToSection={scrollToSection} addResult={addResult}
                  onBulkAdd={loadData}
                />

                <EnrichBanner stats={stats} meetings={meetings} onEnrich={handleRefresh} />

                {/* MEETING SELECTOR — choose which meetings to include */}
                {meetings.length > 0 && (
                  <div style={{ ...S.card, background: '#0f172a', border: '1px solid #334155', marginBottom: 24 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>Select Meetings to Analyze</div>
                        <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>Choose which meetings to include in the dashboard analytics</div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => { setSelectedMeetingIds(null); }}
                          style={{ ...S.btn(), fontSize: 12, opacity: selectedMeetingIds === null ? 0.5 : 1 }}>Select All</button>
                        <button onClick={() => { setSelectedMeetingIds([]); }}
                          style={{ ...S.btn(), fontSize: 12, opacity: selectedMeetingIds?.length === 0 ? 0.5 : 1 }}>Clear</button>
                        <button onClick={() => { setDashboardGenerated(true); }}
                          disabled={(selectedMeetingIds !== null && selectedMeetingIds.length === 0)}
                          style={{ ...S.btn('green'), fontSize: 13, padding: '8px 20px' }}>
                          {dashboardGenerated ? 'Refresh Dashboard' : 'Generate Dashboard'}
                        </button>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {meetings.map(m => {
                        const isSelected = selectedMeetingIds === null || selectedMeetingIds.includes(m.video_id);
                        return (
                          <button key={m.video_id}
                            onClick={() => {
                              if (selectedMeetingIds === null) {
                                // Was "all selected" — deselect this one
                                setSelectedMeetingIds(meetings.filter(x => x.video_id !== m.video_id).map(x => x.video_id));
                              } else if (isSelected) {
                                setSelectedMeetingIds(selectedMeetingIds.filter(id => id !== m.video_id));
                              } else {
                                const newIds = [...selectedMeetingIds, m.video_id];
                                // If all are now selected, set to null (= all)
                                if (newIds.length === meetings.length) setSelectedMeetingIds(null);
                                else setSelectedMeetingIds(newIds);
                              }
                              setDashboardGenerated(false);
                            }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px',
                              borderRadius: 8, border: `2px solid ${isSelected ? '#4ade80' : '#334155'}`,
                              background: isSelected ? '#052e16' : '#1e293b', cursor: 'pointer',
                              transition: 'all 0.15s'
                            }}>
                            <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSelected ? '#4ade80' : '#475569'}`, background: isSelected ? '#4ade80' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isSelected && <span style={{ color: '#052e16', fontSize: 12, fontWeight: 700 }}>&#10003;</span>}
                            </div>
                            <img src={`https://img.youtube.com/vi/${m.video_id}/default.jpg`} alt="" style={{ width: 40, height: 30, borderRadius: 4, objectFit: 'cover' }} onError={e => e.target.style.display = 'none'} />
                            <div style={{ textAlign: 'left' }}>
                              <div style={{ fontSize: 12, color: isSelected ? '#f1f5f9' : '#94a3b8', fontWeight: 500 }}>{(m.title || '').slice(0, 35)}{(m.title || '').length > 35 ? '..' : ''}</div>
                              <div style={{ fontSize: 10, color: '#64748b' }}>{m.date ? `${m.date.slice(0,4)}-${m.date.slice(4,6)}-${m.date.slice(6)}` : ''}</div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
                      {selectedMeetingIds === null ? `All ${meetings.length} meetings selected` : `${selectedMeetingIds.length} of ${meetings.length} meetings selected`}
                    </div>
                  </div>
                )}

                {/* Analytics sections — shown after Generate Dashboard or automatically for first load */}
                {(dashboardGenerated || (meetings.length > 0 && selectedMeetingIds === null)) && (() => {
                  const activeMeetings = selectedMeetingIds ? meetings.filter(m => selectedMeetingIds.includes(m.video_id)) : meetings;
                  const filterIds = selectedMeetingIds; // null = all, array = filtered
                  return (<>
                    {/* OVERVIEW */}
                    <div id="kb-overview" style={{ scrollMarginTop: 80 }}>
                      <OverviewTab stats={stats} meetings={activeMeetings} />
                    </div>

                    {/* MEETINGS */}
                    <SectionHeader id="meetings" title="Meetings Library" subtitle={`${activeMeetings.length} meeting${activeMeetings.length !== 1 ? 's' : ''} indexed and analyzed`} />
                    <MeetingListTab meetings={activeMeetings} onEnrich={handleRefresh} stats={stats} />

                    {/* TOPICS */}
                    <SectionHeader id="topics" title="Topic Analysis" subtitle="AI-generated topics scored by semantic relevance per meeting" />
                    <TopicsTab />

                    {/* ENTITIES */}
                    <SectionHeader id="entities" title="Entity Tracking" subtitle="People, organizations, and places across all meetings" />
                    <EntitiesTab />

                    {/* WORD CLOUD */}
                    <SectionHeader id="wordcloud" title="Cross-Meeting Word Cloud" subtitle="Most significant words across selected meetings, sized by frequency" />
                    <WordCloudTab filterIds={filterIds} />

                    {/* DECISIONS */}
                    <SectionHeader id="decisions" title="Decision Tracker" subtitle="Motions, votes, and outcomes across meetings" />
                    <DecisionsTab />

                    {/* FRAMING */}
                    <SectionHeader id="framing" title="Framing Analysis" subtitle="How civic issues are discussed through different perspectives (financial, safety, equity, etc.)" />
                    <FramingTab filterIds={filterIds} />

                    {/* PEOPLE */}
                    <SectionHeader id="people" title="People & Participation" subtitle="Who appears across which meetings and how often" />
                    <PeopleTab />

                    {/* COMPARE */}
                    <SectionHeader id="compare" title="Meeting Comparison" subtitle="Compare entities, decisions, and framing between two meetings" />
                    <CompareTab meetings={activeMeetings} />

                    {/* DISCOURSE */}
                    <SectionHeader id="discourse" title="Discourse Analysis" subtitle="Trace how topics and entities are discussed across meetings over time" />
                    <DiscourseTab />

                    {/* MONTAGE */}
                    <SectionHeader id="montage" title="Meeting Montage Maker" subtitle="Build cross-meeting highlight reels from your Knowledge Base" />
                    <Suspense fallback={<div style={S.emptyState}>Loading Montage Maker...</div>}>
                      <KBMontage S={S} />
                    </Suspense>
                  </>);
                })()}

                <div style={{ height: 60 }} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Pulse animation */}
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
}
