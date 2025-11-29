/**
 * DesktopAppBanner.jsx - v5.6
 * 
 * Shows a banner prompting users to download the desktop app
 * when running in cloud mode (video features disabled).
 */

import React, { useState, useEffect } from 'react';

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

/**
 * Main banner component - shows at top of page in cloud mode
 */
export function DesktopAppBanner({ onDismiss }) {
  const [isCloudMode, setIsCloudMode] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const downloadUrl = 'https://github.com/amateurmenace/community-highlighter/releases';
  
  useEffect(() => {
    // Check if running in cloud mode
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        setIsCloudMode(data.cloud_mode === true);
      })
      .catch(() => {
        setIsCloudMode(false);
      });
    
    // Check if user previously dismissed
    const wasDismissed = localStorage.getItem('desktop_banner_dismissed');
    if (wasDismissed) {
      const dismissedAt = new Date(wasDismissed);
      const hoursSince = (Date.now() - dismissedAt) / (1000 * 60 * 60);
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
    <div style={{
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      color: 'white',
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      fontSize: '14px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flex: 1,
      }}>
        <span style={{ fontSize: '24px' }}>🖥️</span>
        <div>
          <div style={{ fontWeight: '600', marginBottom: '2px' }}>
            Want to create video clips and highlight reels?
          </div>
          <div style={{ opacity: '0.9', fontSize: '13px' }}>
            Download the desktop app for full features including video downloads
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button 
          onClick={handleDownload}
          style={{
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
          }}
        >
          <span>⬇️</span> Download App
        </button>
        <button 
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '8px 12px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
}

/**
 * Inline prompt for clip sections when feature is unavailable
 */
export function DesktopAppInlinePrompt({ feature = 'this feature' }) {
  const downloadUrl = 'https://github.com/amateurmenace/community-highlighter/releases';
  
  return (
    <div style={{
      background: '#f0f4ff',
      border: '1px solid #c7d2fe',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎬</div>
      <div style={{ fontWeight: '600', color: '#4338ca', marginBottom: '4px' }}>
        Desktop App Required
      </div>
      <div style={{ color: '#6366f1', fontSize: '14px', marginBottom: '12px' }}>
        {feature} requires the desktop app because YouTube blocks video downloads from cloud servers.
      </div>
      <button 
        onClick={() => window.open(downloadUrl, '_blank')}
        style={{
          background: '#4f46e5',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '6px',
          fontWeight: '600',
          cursor: 'pointer',
          fontSize: '14px',
        }}
      >
        Download Desktop App
      </button>
    </div>
  );
}

export default DesktopAppBanner;
