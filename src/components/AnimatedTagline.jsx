import { useState, useEffect } from "react";

const TAGLINE_ACTIONS = [
  { verb: 'Search', color: '#1e7f63' },
  { verb: 'Highlight', color: '#f59e0b' },
  { verb: 'Edit', color: '#8b5cf6' },
  { verb: 'Analyze', color: '#3b82f6' },
  { verb: 'Share', color: '#ec4899' },
];

const TAGLINE_MISSIONS = [
  'Six-hour meetings shouldn\'t disappear into the void.',
  'Every resident deserves to know what was decided and why.',
  'Civic data belongs to everyone, not just those with time to watch.',
  'Making public meetings work for the public.',
  'The meetings happen. Now make them matter.',
];

export default function AnimatedTagline() {
  const [idx, setIdx] = useState(0);
  const [fadeClass, setFadeClass] = useState('tagline-fade-in');

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeClass('tagline-fade-out');
      setTimeout(() => {
        setIdx(i => (i + 1) % TAGLINE_MISSIONS.length);
        setFadeClass('tagline-fade-in');
      }, 400);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const action = TAGLINE_ACTIONS[idx % TAGLINE_ACTIONS.length];
  return (
    <div className="animated-tagline">
      <div className={`animated-tagline-mission ${fadeClass}`}>
        {TAGLINE_MISSIONS[idx]}
      </div>
      <div className="animated-tagline-action">
        <span className={`animated-tagline-verb ${fadeClass}`} style={{ color: action.color }}>{action.verb}</span>
        <span className="animated-tagline-rest">{" your city\'s public meetings — entirely in your browser."}</span>
      </div>
    </div>
  );
}
