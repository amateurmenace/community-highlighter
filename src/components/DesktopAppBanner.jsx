/**
 * DesktopAppBanner.jsx
 * 
 * Shows a banner prompting users to download the desktop app for full features
 * when running in cloud mode.
 * 
 * Add this component to your App.jsx
 */

import React, { useState, useEffect } from 'react';

// Styles for the banner (can be moved to CSS file)
const styles = {
  banner: {
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    padding: '12px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
    fontSize: '14px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  bannerContent: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    flex: 1,
  },
  icon: {
    fontSize: '24px',
  },
  text: {
    lineHeight: '1.4',
  },
  title: {
    fontWeight: '600',
    marginBottom: '2px',
  },
  subtitle: {
    opacity: '0.9',
    fontSize: '13px',
  },
  buttons: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  downloadBtn: {
    background: 'white',
    color: '#667eea',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  dismissBtn: {
    background: 'transparent',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.3)',
    padding: '8px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'background 0.2s',
  },
  // Compact inline version for clip sections
  inlinePrompt: {
    background: '#f0f4ff',
    border: '1px solid #c7d2fe',
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '16px',
  },
  inlineIcon: {
    fontSize: '32px',
    marginBottom: '8px',
  },
  inlineTitle: {
    fontWeight: '600',
    color: '#4338ca',
    marginBottom: '4px',
  },
  inlineText: {
    color: '#6366f1',
    fontSize: '14px',
    marginBottom: '12px',
  },
  inlineBtn: {
    background: '#4f46e5',
    color: 'white',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '6px',
    fontWeight: '600',
    cursor: 'pointer',
    fontSize: '14px',
  }
};

/**
 * Main banner component - shows at top of page in cloud mode
 */
export function DesktopAppBanner({ onDismiss }) {
  const [isCloudMode, setIsCloudMode] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState('https://github.com/amateurmenace/community-highlighter/releases');
  
  useEffect(() => {
    // Check if running in cloud mode
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setIsCloudMode(data.cloud_mode === true);
      })
      .catch(() => {
        // If health check fails, assume not cloud mode
        setIsCloudMode(false);
      });
    
    // Check if user previously dismissed
    const wasDismissed = localStorage.getItem('desktop_banner_dismissed');
    if (wasDismissed) {
      const dismissedAt = new Date(wasDismissed);
      const hoursSince = (Date.now() - dismissedAt) / (1000 * 60 * 60);
      // Show again after 24 hours
      if (hoursSince < 24) {
        setDismissed(true);
      }
    }
  }, []);
  
  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('desktop_banner_dismissed', new Date().toISOString());
    if (onDismiss) onDismiss();
  };
  
  const handleDownload = () => {
    window.open(downloadUrl, '_blank');
  };
  
  if (!isCloudMode || dismissed) {
    return null;
  }
  
  return (
    <div style={styles.banner}>
      <div style={styles.bannerContent}>
        <span style={styles.icon}>🖥️</span>
        <div style={styles.text}>
          <div style={styles.title}>Want to create video clips and highlight reels?</div>
          <div style={styles.subtitle}>
            Download the desktop app for full features including video downloads
          </div>
        </div>
      </div>
      <div style={styles.buttons}>
        <button 
          style={styles.downloadBtn}
          onClick={handleDownload}
          onMouseOver={e => {
            e.target.style.transform = 'scale(1.05)';
            e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
          }}
          onMouseOut={e => {
            e.target.style.transform = 'scale(1)';
            e.target.style.boxShadow = 'none';
          }}
        >
          <span>⬇️</span> Download App
        </button>
        <button 
          style={styles.dismissBtn}
          onClick={handleDismiss}
          onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.1)'}
          onMouseOut={e => e.target.style.background = 'transparent'}
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}

/**
 * Inline prompt - shows in clip/download sections when feature is unavailable
 */
export function DesktopAppInlinePrompt({ feature = 'this feature' }) {
  const [downloadUrl, setDownloadUrl] = useState('https://github.com/amateurmenace/community-highlighter/releases');
  
  return (
    <div style={styles.inlinePrompt}>
      <div style={styles.inlineIcon}>🎬</div>
      <div style={styles.inlineTitle}>Desktop App Required</div>
      <div style={styles.inlineText}>
        {feature} requires the desktop app because YouTube blocks video downloads from cloud servers. 
        The desktop app runs on your computer where there are no restrictions.
      </div>
      <button 
        style={styles.inlineBtn}
        onClick={() => window.open(downloadUrl, '_blank')}
      >
        Download Desktop App
      </button>
    </div>
  );
}

/**
 * Hook to check cloud mode status
 */
export function useCloudMode() {
  const [isCloudMode, setIsCloudMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [features, setFeatures] = useState({});
  
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setIsCloudMode(data.cloud_mode === true);
        setFeatures(data.features || {});
        setLoading(false);
      })
      .catch(() => {
        setIsCloudMode(false);
        setLoading(false);
      });
  }, []);
  
  return { isCloudMode, loading, features };
}

export default DesktopAppBanner;
