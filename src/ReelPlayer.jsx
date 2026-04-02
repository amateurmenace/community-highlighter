import React, { useEffect, useRef, useState, useCallback } from "react";

export default function ReelPlayer({ videoId, clips, showLabels = true, onOpenEditor }) {
  const [currentClip, setCurrentClip] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [showEndCard, setShowEndCard] = useState(false);
  const [progress, setProgress] = useState(0);
  const iframeRef = useRef(null);
  const timerRef = useRef(null);
  const progressRef = useRef(null);
  const startTimeRef = useRef(null);

  const totalDuration = clips.reduce((sum, c) => sum + (c.end - c.start), 0);

  const playClip = useCallback((idx) => {
    if (idx >= clips.length) {
      setIsPlaying(false);
      setShowEndCard(true);
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
      return;
    }
    const clip = clips[idx];
    setCurrentClip(idx);
    setShowEndCard(false);

    // Fade in
    setIsFading(true);
    setTimeout(() => {
      if (iframeRef.current) {
        iframeRef.current.src = `https://www.youtube.com/embed/${videoId}?start=${Math.floor(clip.start)}&autoplay=1&controls=0&modestbranding=1&rel=0&showinfo=0&enablejsapi=1`;
      }
      setTimeout(() => setIsFading(false), 300);
    }, 500);

    const duration = (clip.end - clip.start) * 1000;
    startTimeRef.current = Date.now();

    // Update progress during playback
    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const clipProgress = Math.min(elapsed / duration, 1);
      const priorDuration = clips.slice(0, idx).reduce((s, c) => s + (c.end - c.start), 0);
      const currentElapsed = clipProgress * (clip.end - clip.start);
      setProgress((priorDuration + currentElapsed) / totalDuration);
      if (clipProgress < 1) {
        progressRef.current = requestAnimationFrame(updateProgress);
      }
    };
    progressRef.current = requestAnimationFrame(updateProgress);

    // Schedule next clip
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      playClip(idx + 1);
    }, duration);
  }, [clips, videoId, totalDuration]);

  const handlePlay = () => {
    setIsPlaying(true);
    setShowEndCard(false);
    setProgress(0);
    playClip(0);
  };

  const handlePause = () => {
    setIsPlaying(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) cancelAnimationFrame(progressRef.current);
    if (iframeRef.current) {
      iframeRef.current.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'pauseVideo' }), '*');
    }
  };

  const handleSkip = (dir) => {
    const next = currentClip + dir;
    if (next < 0 || next >= clips.length) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (progressRef.current) cancelAnimationFrame(progressRef.current);
    setIsPlaying(true);
    playClip(next);
  };

  const handleReplay = () => {
    setShowEndCard(false);
    setProgress(0);
    setCurrentClip(0);
    setIsPlaying(true);
    playClip(0);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (progressRef.current) cancelAnimationFrame(progressRef.current);
    };
  }, []);

  const editorUrl = `${window.location.origin}/?v=${videoId}&clips=${clips.map(c => `${Math.round(c.start)}-${Math.round(c.end)}`).join(',')}&titles=${encodeURIComponent(clips.map(c => c.label || '').join('|'))}`;

  if (showEndCard) {
    return (
      <div className="reel-player-overlay">
        <div className="reel-player-end-card">
          <h2>Reel Complete</h2>
          <p>{clips.length} clips from this civic meeting</p>
          <div className="reel-end-actions">
            <button className="reel-end-replay-btn" onClick={handleReplay}>Replay</button>
            <button className="reel-end-editor-btn" onClick={() => { window.location.href = editorUrl; }}>Open in Editor</button>
            <a className="reel-end-desktop-btn" href="https://github.com/amateurmenace/community-highlighter/releases/latest" target="_blank" rel="noopener noreferrer">
              Download Desktop App
            </a>
          </div>
          <p style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Render as a real MP4 video with captions, transitions, and effects using the desktop app
          </p>
        </div>
        <div className="reel-player-branding">Powered by Community Highlighter</div>
      </div>
    );
  }

  return (
    <div className="reel-player-overlay">
      <div className="reel-player-header">
        <h2>{clips[currentClip]?.label || `Clip ${currentClip + 1}`}</h2>
        <span className="reel-clip-counter">{currentClip + 1} / {clips.length}</span>
      </div>

      <div className="reel-player-video-wrap">
        <iframe
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(clips[0]?.start || 0)}&enablejsapi=1&controls=0&modestbranding=1&rel=0`}
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
        <div className={`reel-player-fade ${isFading ? 'active' : ''}`} />
        {isPlaying && showLabels && clips[currentClip]?.label && (
          <div className="reel-player-lower-third">
            <div className="reel-player-lower-third-inner" key={currentClip}>
              {clips[currentClip].label}
            </div>
          </div>
        )}
      </div>

      <div className="reel-player-controls">
        <button onClick={() => handleSkip(-1)} disabled={currentClip === 0}>Prev</button>
        {isPlaying ? (
          <button className="reel-play-btn" onClick={handlePause}>Pause</button>
        ) : (
          <button className="reel-play-btn" onClick={isPlaying ? handlePause : handlePlay}>
            {progress > 0 ? 'Resume' : 'Play Reel'}
          </button>
        )}
        <button onClick={() => handleSkip(1)} disabled={currentClip >= clips.length - 1}>Next</button>
        <button onClick={() => { window.location.href = editorUrl; }} style={{ marginLeft: 8 }}>Open in Editor</button>
      </div>

      {/* Segmented progress bar */}
      <div className="reel-player-progress">
        {clips.map((clip, i) => {
          const clipDuration = clip.end - clip.start;
          const priorDuration = clips.slice(0, i).reduce((s, c) => s + (c.end - c.start), 0);
          const clipStart = priorDuration / totalDuration;
          const clipEnd = (priorDuration + clipDuration) / totalDuration;
          let fillPct = 0;
          if (progress >= clipEnd) fillPct = 100;
          else if (progress > clipStart) fillPct = ((progress - clipStart) / (clipEnd - clipStart)) * 100;
          return (
            <div key={i} className={`reel-player-progress-seg ${i === currentClip ? 'active' : ''} ${fillPct >= 100 ? 'done' : ''}`}
              style={{ flex: clipDuration }}
              onClick={() => { if (timerRef.current) clearTimeout(timerRef.current); if (progressRef.current) cancelAnimationFrame(progressRef.current); setIsPlaying(true); playClip(i); }}
            >
              {fillPct > 0 && fillPct < 100 && <div className="reel-player-progress-fill" style={{ width: `${fillPct}%` }} />}
            </div>
          );
        })}
      </div>

      <div className="reel-player-branding">Powered by Community Highlighter</div>
    </div>
  );
}
