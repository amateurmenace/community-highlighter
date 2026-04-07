import { useState } from 'react';

export default function VizExportButton({ targetRef, filename = 'chart' }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!targetRef?.current || exporting) return;
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(targetRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
      });
      const link = document.createElement('a');
      link.download = `${filename}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Export failed:', err);
    }
    setExporting(false);
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      title="Export as image"
      style={{
        position: 'absolute', top: 12, right: 12, zIndex: 10,
        background: exporting ? '#94a3b8' : '#f1f5f9', border: '1px solid #e2e8f0',
        borderRadius: 6, padding: '4px 10px', fontSize: 11, color: '#475569',
        cursor: exporting ? 'wait' : 'pointer', fontWeight: 600,
        transition: 'all 0.15s',
      }}
      onMouseOver={e => { if (!exporting) e.target.style.background = '#e2e8f0'; }}
      onMouseOut={e => { if (!exporting) e.target.style.background = '#f1f5f9'; }}
    >
      {exporting ? 'Exporting...' : 'Export'}
    </button>
  );
}
