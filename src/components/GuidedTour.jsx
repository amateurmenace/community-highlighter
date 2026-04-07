import { useEffect } from "react";

export default function GuidedTour({ onClose }) {
  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' || e.key === 'Enter') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="guided-tour-overlay" onClick={onClose}>
      <div className="guided-tour-tooltip" style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} onClick={e => e.stopPropagation()}>
        <div className="guided-tour-title">Welcome to Community Highlighter</div>
        <div className="guided-tour-desc" style={{ lineHeight: 1.7 }}>
          Paste any YouTube URL or search for a community meeting to get started. Our AI tools will extract the meeting content and help you highlight, analyze, remix, and share the video and the insights you discover.
        </div>
        <div className="guided-tour-actions" style={{ marginTop: 16 }}>
          <button className="guided-tour-btn-next" onClick={onClose}>Get Started</button>
        </div>
      </div>
    </div>
  );
}
