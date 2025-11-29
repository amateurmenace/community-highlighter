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
  const downloadUrl = 'https://github.com/amateurmenace/community-highlighter/releases/latest';
  
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
      background: '#f5f0e6',
      color: '#1a1a1a',
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '16px',
      fontSize: '14px',
      borderBottom: '2px solid #1e7f63',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        flex: 1,
      }}>
        <span style={{ fontSize: '24px' }}>🖥️</span>
        <div>
          <div style={{ fontWeight: '700', marginBottom: '2px', color: '#1e7f63' }}>
            Want to create video clips and highlight reels?
          </div>
          <div style={{ color: '#4a4a4a', fontSize: '13px' }}>
            Download the desktop app for full features including video downloads
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <button 
          onClick={handleDownload}
          style={{
            background: '#1e7f63',
            color: 'white',
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
            color: '#1a1a1a',
            border: '1px solid #ccc',
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
  const downloadUrl = 'https://github.com/amateurmenace/community-highlighter/releases/latest';
  
  return (
    <div style={{
      background: '#f5f0e6',
      border: '2px solid #1e7f63',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '16px',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎬</div>
      <div style={{ fontWeight: '700', color: '#1e7f63', marginBottom: '4px' }}>
        Desktop App Required
      </div>
      <div style={{ color: '#4a4a4a', fontSize: '14px', marginBottom: '12px' }}>
        {feature} requires the desktop app because YouTube blocks video downloads from cloud servers.
      </div>
      <button 
        onClick={() => window.open(downloadUrl, '_blank')}
        style={{
          background: '#1e7f63',
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
