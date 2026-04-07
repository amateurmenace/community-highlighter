import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { apiListKBMeetings, apiSearchKnowledgeBase, apiRenderMultiVideoClips } from '../../api';

function parseTime(str) {
  const parts = (str || '0:00').split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] || 0;
}

function fmtTime(sec) {
  const s = Math.round(sec);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

const BADGE_COLORS = ['#4ade80', '#3b82f6', '#f59e0b', '#a78bfa', '#ec4899', '#14b8a6', '#f97316', '#ef4444'];

export default function KBMontage({ S }) {
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Clip form state (inline form when adding a clip)
  const [addingFrom, setAddingFrom] = useState(null); // { resultIdx, videoId, meetingTitle, meetingDate }
  const [clipForm, setClipForm] = useState({ start: '0:00', end: '0:30', label: '' });

  // Timeline
  const [clips, setClips] = useState([]);
  const [previewClip, setPreviewClip] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);

  // Export
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportResult, setExportResult] = useState(null);

  // Color map for meeting badges
  const colorMap = useRef({});
  const colorIdx = useRef(0);
  const getColor = useCallback((videoId) => {
    if (!colorMap.current[videoId]) {
      colorMap.current[videoId] = BADGE_COLORS[colorIdx.current % BADGE_COLORS.length];
      colorIdx.current++;
    }
    return colorMap.current[videoId];
  }, []);

  // Load meetings
  useEffect(() => {
    apiListKBMeetings()
      .then(r => setMeetings(r.meetings || []))
      .catch(() => setMeetings([]))
      .finally(() => setLoading(false));
  }, []);

  // Search within a meeting
  const doSearch = useCallback(async (videoId) => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults([]);
    try {
      const r = await apiSearchKnowledgeBase({ query: searchQuery.trim(), filters: { video_id: videoId } });
      setSearchResults(r.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Add clip to timeline
  const addClip = useCallback((videoId, meetingTitle, meetingDate) => {
    const start = parseTime(clipForm.start);
    const end = parseTime(clipForm.end);
    if (end <= start) return;
    setClips(prev => [...prev, {
      id: Date.now(),
      videoId,
      start,
      end,
      label: clipForm.label || `Clip ${prev.length + 1}`,
      meetingTitle,
      meetingDate
    }]);
    setAddingFrom(null);
    setClipForm({ start: '0:00', end: '0:30', label: '' });
  }, [clipForm]);

  const removeClip = useCallback((id) => {
    setClips(prev => prev.filter(c => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setClips([]);
    setPreviewClip(null);
    setExportResult(null);
    setExportError('');
  }, []);

  // Drag reorder
  const handleDragStart = useCallback((e, idx) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e, dropIdx) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) return;
    setClips(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
  }, [dragIdx]);

  // Total duration
  const totalDuration = useMemo(() => clips.reduce((sum, c) => sum + (c.end - c.start), 0), [clips]);

  // Export
  const doExport = useCallback(async () => {
    if (!clips.length) return;
    setExporting(true);
    setExportError('');
    setExportResult(null);
    try {
      // Group clips by videoId
      const byVideo = {};
      for (const c of clips) {
        if (!byVideo[c.videoId]) byVideo[c.videoId] = [];
        byVideo[c.videoId].push({ start: c.start, end: c.end, title: c.label });
      }
      const clipsByVideo = Object.entries(byVideo).map(([video_id, selections]) => ({ video_id, selections }));
      const r = await apiRenderMultiVideoClips({ clips_by_video: clipsByVideo });
      setExportResult(r);
    } catch (err) {
      setExportError(err.message || 'Export failed');
    } finally {
      setExporting(false);
    }
  }, [clips]);

  // --- Styles ---
  const st = {
    container: { display: 'flex', gap: 16, minHeight: 500 },
    left: { width: 360, flexShrink: 0, overflowY: 'auto', maxHeight: 700 },
    right: { flex: 1, minWidth: 0 },
    meetingItem: (active) => ({
      ...S.card,
      padding: '10px 14px',
      cursor: 'pointer',
      marginBottom: 8,
      border: `1px solid ${active ? '#4ade80' : '#334155'}`,
      transition: 'border-color 0.15s'
    }),
    meetingTitle: { fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 2 },
    meetingDate: { fontSize: 11, color: '#94a3b8' },
    searchRow: { display: 'flex', gap: 6, marginTop: 8, marginBottom: 8 },
    searchInput: {
      flex: 1, padding: '6px 10px', fontSize: 12, borderRadius: 6,
      border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0', outline: 'none'
    },
    resultCard: {
      background: '#0f172a', borderRadius: 8, padding: '8px 12px',
      border: '1px solid #334155', marginBottom: 6, fontSize: 12, color: '#cbd5e1'
    },
    clipCard: (isDragging) => ({
      ...S.card,
      display: 'inline-flex', flexDirection: 'column', gap: 4,
      padding: '8px 12px', marginRight: 8, minWidth: 180, maxWidth: 220,
      cursor: 'grab', opacity: isDragging ? 0.4 : 1,
      verticalAlign: 'top', flexShrink: 0
    }),
    badge: (color) => ({
      display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '2px 6px',
      borderRadius: 4, background: color + '22', color, marginBottom: 2
    }),
    inlineForm: {
      background: '#0f172a', borderRadius: 8, padding: '8px 10px',
      border: '1px solid #4ade80', marginTop: 6
    },
    formInput: {
      padding: '4px 8px', fontSize: 12, borderRadius: 4,
      border: '1px solid #334155', background: '#1e293b', color: '#e2e8f0',
      outline: 'none', width: 60
    },
    formLabel: { fontSize: 11, color: '#94a3b8', marginBottom: 2 },
    previewWrap: { marginBottom: 12, borderRadius: 8, overflow: 'hidden', background: '#000' },
    timelineTrack: {
      display: 'flex', overflowX: 'auto', padding: '12px 0',
      minHeight: 100, alignItems: 'flex-start'
    },
    sectionLabel: { fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 },
    durationBar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 0', borderTop: '1px solid #334155', marginTop: 8
    }
  };

  // --- Render ---
  return (
    <div>
      <div style={{ ...S.card, marginBottom: 16 }}>
        <div style={S.cardTitle}>Meeting Montage Maker</div>
        <div style={{ fontSize: 12, color: '#94a3b8' }}>
          Browse KB meetings, search transcripts, pick clips from multiple meetings, then export a cross-meeting highlight reel.
        </div>
      </div>

      <div style={st.container}>
        {/* ===== LEFT PANEL: Meeting Browser ===== */}
        <div style={st.left}>
          <div style={st.sectionLabel}>Meetings in KB</div>
          {loading && <div style={{ fontSize: 12, color: '#64748b' }}>Loading meetings...</div>}
          {!loading && !meetings.length && (
            <div style={S.emptyState}>No meetings in the Knowledge Base yet. Add some from the Meetings tab.</div>
          )}
          {meetings.map(m => {
            const vid = m.video_id;
            const active = expandedId === vid;
            return (
              <div key={vid}>
                <div
                  style={st.meetingItem(active)}
                  onClick={() => {
                    setExpandedId(active ? null : vid);
                    setSearchResults([]);
                    setSearchQuery('');
                    setAddingFrom(null);
                  }}
                >
                  <div style={st.meetingTitle}>{m.title || vid}</div>
                  <div style={st.meetingDate}>
                    {m.date || 'No date'} &middot; {m.chunk_count || 0} chunks
                  </div>
                </div>

                {active && (
                  <div style={{ paddingLeft: 8, paddingRight: 8, marginBottom: 12 }}>
                    <div style={st.searchRow}>
                      <input
                        style={st.searchInput}
                        placeholder="Search this meeting..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && doSearch(vid)}
                      />
                      <button
                        style={S.btn('green')}
                        onClick={() => doSearch(vid)}
                        disabled={searching}
                      >
                        {searching ? '...' : 'Search'}
                      </button>
                    </div>

                    {searching && <div style={{ fontSize: 11, color: '#64748b' }}>Searching...</div>}

                    {searchResults.map((r, ri) => (
                      <div key={ri} style={st.resultCard}>
                        <div style={{ marginBottom: 6, lineHeight: 1.5 }}>
                          {(r.text || r.document || '').slice(0, 200)}
                          {(r.text || r.document || '').length > 200 ? '...' : ''}
                        </div>

                        {addingFrom && addingFrom.resultIdx === ri ? (
                          <div style={st.inlineForm}>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                              <div>
                                <div style={st.formLabel}>Start (mm:ss)</div>
                                <input
                                  style={st.formInput}
                                  value={clipForm.start}
                                  onChange={e => setClipForm(f => ({ ...f, start: e.target.value }))}
                                  placeholder="0:00"
                                />
                              </div>
                              <div>
                                <div style={st.formLabel}>End (mm:ss)</div>
                                <input
                                  style={st.formInput}
                                  value={clipForm.end}
                                  onChange={e => setClipForm(f => ({ ...f, end: e.target.value }))}
                                  placeholder="0:30"
                                />
                              </div>
                              <div>
                                <div style={st.formLabel}>Label</div>
                                <input
                                  style={{ ...st.formInput, width: 100 }}
                                  value={clipForm.label}
                                  onChange={e => setClipForm(f => ({ ...f, label: e.target.value }))}
                                  placeholder="Optional label"
                                />
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                              <button
                                style={S.btn('green')}
                                onClick={() => addClip(vid, m.title || vid, m.date || '')}
                              >
                                Add
                              </button>
                              <button
                                style={S.btn()}
                                onClick={() => setAddingFrom(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            style={S.btn('blue')}
                            onClick={() => {
                              setAddingFrom({ resultIdx: ri, videoId: vid, meetingTitle: m.title || vid, meetingDate: m.date || '' });
                              setClipForm({ start: '0:00', end: '0:30', label: '' });
                            }}
                          >
                            Add to Montage
                          </button>
                        )}
                      </div>
                    ))}

                    {!searching && searchResults.length === 0 && searchQuery && (
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                        No results. Try a different query.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ===== RIGHT PANEL: Preview + Timeline ===== */}
        <div style={st.right}>
          {/* Preview */}
          {previewClip && (
            <div style={st.previewWrap}>
              <iframe
                width="100%"
                height="300"
                src={`https://www.youtube.com/embed/${previewClip.videoId}?start=${Math.floor(previewClip.start)}&autoplay=1`}
                frameBorder="0"
                allow="autoplay; encrypted-media"
                allowFullScreen
                title="Clip preview"
                style={{ display: 'block' }}
              />
              <div style={{ padding: '6px 10px', fontSize: 11, color: '#94a3b8', background: '#1e293b' }}>
                Previewing: {previewClip.label} ({fmtTime(previewClip.start)} - {fmtTime(previewClip.end)})
              </div>
            </div>
          )}

          {/* Timeline */}
          <div style={st.sectionLabel}>
            Montage Timeline
            {clips.length > 0 && (
              <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 8 }}>
                {clips.length} clip{clips.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {clips.length === 0 ? (
            <div style={{ ...S.card, ...S.emptyState }}>
              Search a meeting on the left and add clips to build your montage.
            </div>
          ) : (
            <>
              <div style={st.timelineTrack}>
                {clips.map((c, idx) => (
                  <div
                    key={c.id}
                    style={st.clipCard(dragIdx === idx)}
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={handleDragOver}
                    onDrop={e => handleDrop(e, idx)}
                  >
                    <div style={st.badge(getColor(c.videoId))}>
                      {(c.meetingTitle || '').slice(0, 28)}
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0' }}>
                      {c.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                      {fmtTime(c.start)} - {fmtTime(c.end)} ({fmtTime(c.end - c.start)})
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button
                        style={{ ...S.btn(), padding: '3px 8px', fontSize: 11 }}
                        onClick={() => setPreviewClip(c)}
                        title="Preview this clip"
                      >
                        Preview
                      </button>
                      <button
                        style={{ ...S.btn(), padding: '3px 8px', fontSize: 11, color: '#f87171' }}
                        onClick={() => removeClip(c.id)}
                        title="Remove clip"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div style={st.durationBar}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>
                  Total: {fmtTime(totalDuration)}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    style={S.btn()}
                    onClick={clearAll}
                  >
                    Clear All
                  </button>
                  <button
                    style={S.btn('green')}
                    onClick={doExport}
                    disabled={exporting || !clips.length}
                  >
                    {exporting ? 'Exporting...' : 'Export Montage'}
                  </button>
                </div>
              </div>
            </>
          )}

          {exportError && (
            <div style={{ ...S.card, border: '1px solid #ef4444', color: '#fca5a5', fontSize: 12, marginTop: 8 }}>
              {exportError}
            </div>
          )}

          {exportResult && (
            <div style={{ ...S.card, border: '1px solid #4ade80', fontSize: 12, marginTop: 8 }}>
              <div style={{ color: '#4ade80', fontWeight: 700, marginBottom: 4 }}>Export started</div>
              <div style={{ color: '#cbd5e1' }}>
                Job ID: {exportResult.job_id || 'N/A'}. Check job status for progress.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
