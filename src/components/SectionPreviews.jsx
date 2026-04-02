import React from "react";

export default function SectionPreviews() {
  return (
    <div className="section-previews-grid">
      {/* Highlight Preview */}
      <div className="section-preview-card" id="preview-highlight">
        <div className="section-preview-badge" style={{ background: '#059669' }}>
          <span style={{ fontSize: 18 }}>{'\u2315'}</span>
        </div>
        <div className="section-preview-title">Search & Highlight</div>
        <div className="section-preview-sub">Search any word or phrase across any video on YouTube. Discover patterns, see what was really talked about at a meeting, and collect video highlights you want others to see.</div>
        <div className="section-preview-mockup" style={{ background: '#0f172a', borderRadius: 8, padding: 16, marginTop: 12 }}>
          {/* Word cloud skeleton */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center', minHeight: 80 }}>
            {[52, 36, 28, 44, 20, 32, 40, 24, 48, 16, 30, 22, 38, 26, 34].map((w, i) => (
              <div key={i} className="shimmer-block" style={{ width: w, height: 14, borderRadius: 3, opacity: 0.15 + (i % 3) * 0.1, animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
          {/* Search bar skeleton */}
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <div className="shimmer-block" style={{ flex: 1, height: 28, borderRadius: 6 }} />
            <div className="shimmer-block" style={{ width: 60, height: 28, borderRadius: 6, opacity: 0.4 }} />
          </div>
        </div>
      </div>

      {/* Edit Preview */}
      <div className="section-preview-card" id="preview-edit">
        <div className="section-preview-badge" style={{ background: '#7c3aed' }}>
          <span style={{ fontSize: 16 }}>{'\u25B6'}</span>
        </div>
        <div className="section-preview-title">Edit & Export</div>
        <div className="section-preview-sub">Use the innovative editor to actually pull out clips from the video straight into a new timeline for a shareable highlight reel right in your web browser. Or have AI analyze and build a reel for you, and edit, add effects, download, and more.</div>
        <div className="section-preview-mockup" style={{ background: '#0f1419', borderRadius: 8, padding: 16, marginTop: 12 }}>
          {/* Video player skeleton */}
          <div className="shimmer-block" style={{ width: '100%', height: 60, borderRadius: 4, marginBottom: 10 }} />
          {/* Timeline track */}
          <div style={{ background: '#1a1f26', borderRadius: 4, padding: '8px 6px', display: 'flex', gap: 4, alignItems: 'center' }}>
            {[{ w: '28%', c: '#22C55E' }, { w: '18%', c: '#3b82f6' }, { w: '24%', c: '#22C55E' }, { w: '14%', c: '#f59e0b' }, { w: '16%', c: '#3b82f6' }].map((clip, i) => (
              <div key={i} style={{ width: clip.w, height: 22, background: clip.c, opacity: 0.25, borderRadius: 3, animation: `shimmer 2s ease-in-out ${i * 0.15}s infinite` }} />
            ))}
          </div>
        </div>
      </div>

      {/* Analyze Preview */}
      <div className="section-preview-card" id="preview-analyze">
        <div className="section-preview-badge" style={{ background: '#0891b2' }}>
          <span style={{ fontSize: 18 }}>{'\u2261'}</span>
        </div>
        <div className="section-preview-title">Analyze & Discover</div>
        <div className="section-preview-sub">Discover patterns and insights with powerful, playful video content analytics. Entities, topics, participation, disagreements, and cross-references in one view. Everything is exportable, translatable, sharable. Always free, always open source.</div>
        <div className="section-preview-mockup" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginTop: 12 }}>
          {/* Chart skeleton */}
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', height: 60, marginBottom: 10 }}>
            {[55, 80, 40, 65, 30, 72, 48, 58].map((h, i) => (
              <div key={i} className="shimmer-block" style={{ flex: 1, height: `${h}%`, borderRadius: '3px 3px 0 0', background: i % 2 === 0 ? '#1E7F63' : '#0891b2', opacity: 0.2, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 8 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="shimmer-block" style={{ flex: 1, height: 18, borderRadius: 4 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
