import { StrictMode, lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

// Code-split: each route loads its own chunk
const ReelPlayer = lazy(() => import('./ReelPlayer.jsx'))
const App = lazy(() => import('./App.jsx'))
const KBDashboard = lazy(() => import('./components/KBDashboard.jsx'))

// Parse URL params once to determine which chunk to load
function parseReelParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('mode') !== 'play') return null;
  const videoId = params.get('v');
  const urlClips = params.get('clips');
  if (!videoId || !urlClips) return null;
  const titles = (params.get('titles') || '').split('|');
  const clips = urlClips.split(',').map((seg, i) => {
    const [s, e] = seg.split('-').map(Number);
    if (isNaN(s) || isNaN(e)) return null;
    return { start: s, end: e, label: titles[i] || `Clip ${i + 1}`, highlight: titles[i] || '' };
  }).filter(Boolean);
  if (clips.length === 0) return null;
  const showLabels = params.get('labels') !== 'off';
  return { videoId, clips, showLabels };
}

function parseKBParams() {
  const params = new URLSearchParams(window.location.search);
  return params.get('page') === 'kb';
}

const reelParams = parseReelParams();
const kbMode = parseKBParams();

function Root() {
  if (reelParams) {
    return (
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: 'system-ui' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>Loading Reel Player...</div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Community Highlighter</div>
          </div>
        </div>
      }>
        <ReelPlayer
          videoId={reelParams.videoId}
          clips={reelParams.clips}
          showLabels={reelParams.showLabels}
          onOpenEditor={() => {
            window.location.search = '';
          }}
        />
      </Suspense>
    );
  }

  if (kbMode) {
    return (
      <Suspense fallback={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0a0f1a', color: '#fff', fontFamily: 'system-ui' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#f1f5f9' }}>Knowledge Base</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Loading analytics...</div>
          </div>
        </div>
      }>
        <KBDashboard onNavigateHome={() => { window.location.href = '/'; }} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F7F3E9', fontFamily: 'system-ui' }}>
        <div style={{ textAlign: 'center', color: '#1e293b' }}>
          <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Community Highlighter</div>
          <div style={{ fontSize: 13, color: '#64748b' }}>Loading...</div>
        </div>
      </div>
    }>
      <StrictMode>
        <App />
      </StrictMode>
    </Suspense>
  );
}

createRoot(document.getElementById('root')).render(<Root />)
