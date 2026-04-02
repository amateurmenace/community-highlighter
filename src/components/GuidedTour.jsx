import { useState, useEffect, useCallback } from "react";

const TOUR_STEPS = [
  { targetId: null, title: 'Welcome to Community Highlighter', desc: 'Paste any YouTube meeting URL above to get started. AI will extract the transcript and analyze the full meeting for you.', position: 'center' },
  { targetId: 'preview-highlight', title: 'Search & Highlight', desc: 'Search any word across the transcript. Explore the interactive word cloud to spot the most-discussed topics instantly.', position: 'bottom' },
  { targetId: 'preview-edit', title: 'Edit & Export Reels', desc: 'AI picks the best moments and loads them into a timeline editor. Drag to reorder, trim clips, and export highlight reels.', position: 'bottom' },
  { targetId: 'preview-analyze', title: 'Deep Analysis', desc: 'See who spoke, what was decided, budget impacts, disagreements, and more — all extracted automatically by AI.', position: 'bottom' },
];

export default function GuidedTour({ onClose }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState(null);

  const currentStep = TOUR_STEPS[step];

  const measureTarget = useCallback(() => {
    if (!currentStep.targetId) { setTargetRect(null); return; }
    const el = document.getElementById(currentStep.targetId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        setTargetRect({ x: r.x - 8, y: r.y - 8, w: r.width + 16, h: r.height + 16 });
      }, 350);
    }
  }, [currentStep.targetId]);

  useEffect(() => { measureTarget(); }, [measureTarget]);

  useEffect(() => {
    const handleResize = () => measureTarget();
    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);
    return () => { window.removeEventListener('resize', handleResize); window.removeEventListener('scroll', handleResize, true); };
  }, [measureTarget]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' || e.key === 'Enter') { if (step < TOUR_STEPS.length - 1) setStep(s => s + 1); else onClose(); }
      if (e.key === 'ArrowLeft' && step > 0) setStep(s => s - 1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [step, onClose]);

  const isCenter = currentStep.position === 'center' || !targetRect;

  // Tooltip position
  let tooltipStyle = {};
  if (isCenter) {
    tooltipStyle = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  } else {
    const tx = targetRect.x + targetRect.w / 2;
    const ty = currentStep.position === 'bottom' ? targetRect.y + targetRect.h + 16 : targetRect.y - 16;
    tooltipStyle = {
      position: 'fixed',
      left: Math.max(16, Math.min(tx - 180, window.innerWidth - 376)),
      top: currentStep.position === 'bottom' ? ty : undefined,
      bottom: currentStep.position === 'top' ? (window.innerHeight - ty) : undefined,
    };
  }

  return (
    <div className="guided-tour-overlay" onClick={onClose}>
      {/* SVG spotlight mask */}
      <svg className="guided-tour-svg" width="100%" height="100%">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect x={targetRect.x} y={targetRect.y} width={targetRect.w} height={targetRect.h} rx="12" fill="black" className="guided-tour-cutout" />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tour-mask)" />
        {targetRect && (
          <rect x={targetRect.x} y={targetRect.y} width={targetRect.w} height={targetRect.h} rx="12" fill="none" stroke="#22C55E" strokeWidth="2" className="guided-tour-ring" />
        )}
      </svg>

      {/* Tooltip */}
      <div className="guided-tour-tooltip" style={tooltipStyle} onClick={e => e.stopPropagation()} key={step}>
        <div className="guided-tour-step-num">Step {step + 1} of {TOUR_STEPS.length}</div>
        <div className="guided-tour-title">{currentStep.title}</div>
        <div className="guided-tour-desc">{currentStep.desc}</div>
        <div className="guided-tour-dots">
          {TOUR_STEPS.map((_, i) => (
            <div key={i} className={`guided-tour-dot ${i === step ? 'guided-tour-dot-active' : ''} ${i < step ? 'guided-tour-dot-done' : ''}`} />
          ))}
        </div>
        <div className="guided-tour-actions">
          {step > 0 && <button className="guided-tour-btn-back" onClick={() => setStep(s => s - 1)}>Back</button>}
          <button className="guided-tour-btn-next" onClick={() => step < TOUR_STEPS.length - 1 ? setStep(s => s + 1) : onClose()}>
            {step < TOUR_STEPS.length - 1 ? 'Next' : 'Get Started'}
          </button>
          <button className="guided-tour-btn-skip" onClick={onClose}>Skip</button>
        </div>
      </div>
    </div>
  );
}
