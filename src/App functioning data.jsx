import React, { useState, useEffect, useRef } from "react";

// ============================================
// UTILITY FUNCTIONS
// ============================================
const padTime = (x) => {
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const s = Math.floor(x % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const timeToSeconds = (time) => {
  const parts = time.split(':');
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
};

const parseVTT = (vtt) => {
  if (!vtt) return [];
  const lines = vtt.split('\n');
  const cues = [];
  let i = 0;
  
  while (i < lines.length) {
    if (lines[i].includes('-->')) {
      const times = lines[i].split('-->');
      const start = timeToSeconds(times[0].trim());
      const end = timeToSeconds(times[1].trim());
      const text = lines[i + 1] || '';
      if (text && !text.includes('-->')) {
        cues.push({ start, end, text: text.trim() });
      }
      i += 2;
    } else {
      i++;
    }
  }
  return cues;
};

// ============================================
// API FUNCTIONS
// ============================================
async function loadWordCloud(text) {
  try {
    const res = await fetch("http://localhost:8000/api/wordfreq", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    return data.words || [];
  } catch (err) {
    console.error("Word freq error:", err);
    return [];
  }
}

// ============================================
// COMPONENT FUNCTIONS
// ============================================

// Component 1: Meeting Stats Card
function MeetingStatsCard({ cues, fullText, videoTitle }) {
  if (!cues || !fullText) return null;
  
  const calculateStats = () => {
    const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;
    const duration = cues.length > 0 ? cues[cues.length - 1].end : 0;
    const minutes = duration / 60;
    const wpm = minutes > 0 ? Math.round(wordCount / minutes) : 0;
    
    return {
      duration: padTime(duration),
      totalWords: wordCount.toLocaleString(),
      totalCues: cues.length.toLocaleString(),
      wordsPerMinute: wpm,
      avgWordsPerCue: cues.length > 0 ? Math.round(wordCount / cues.length) : 0
    };
  };
  
  const stats = calculateStats();
  
  return (
    <div className="viz-card stats-card" style={{ background: '#f0f9ff', padding: '20px', margin: '20px 0', borderRadius: '8px', border: '2px solid #0EA5E9' }}>
      <h3>📊 Meeting Statistics</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px', marginTop: '15px' }}>
        <div style={{ textAlign: 'center', padding: '10px', background: 'white', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#0EA5E9' }}>{stats.duration}</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Duration</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', background: 'white', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>{stats.totalWords}</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Total Words</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', background: 'white', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>{stats.wordsPerMinute}</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Words/Min</div>
        </div>
        <div style={{ textAlign: 'center', padding: '10px', background: 'white', borderRadius: '6px' }}>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#8B5CF6' }}>{stats.totalCues}</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>Segments</div>
        </div>
      </div>
    </div>
  );
}

// Component 2: Decision Timeline
function DecisionTimeline({ sents, playerRef, videoId, addToBasket, pad }) {
  const [decisions, setDecisions] = useState([]);
  const [selectedDecision, setSelectedDecision] = useState(null);
  
  useEffect(() => {
    if (!sents || sents.length === 0) return;
    
    const keywords = ['approved', 'motion', 'vote', 'decided', 'resolution', 'passed', 'carried', 'adopted'];
    const found = sents.filter(s => 
      keywords.some(k => s.text.toLowerCase().includes(k))
    ).slice(0, 10); // Limit to 10 for display
    setDecisions(found);
  }, [sents]);
  
  if (decisions.length === 0) {
    return (
      <div className="viz-card" style={{ background: '#fef3c7', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
        <h3>⚡ Decision Timeline</h3>
        <p style={{ color: '#92400E' }}>No decision points detected in this transcript</p>
      </div>
    );
  }
  
  return (
    <div className="viz-card" style={{ background: '#fef3c7', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <h3>⚡ Key Decision Points ({decisions.length})</h3>
      <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginTop: '15px' }}>
        {decisions.map((d, i) => (
          <div key={i} style={{ 
            minWidth: '250px', 
            padding: '15px', 
            background: 'white',
            borderRadius: '6px',
            border: '2px solid #F59E0B',
            cursor: 'pointer',
            transition: 'transform 0.2s',
            ':hover': { transform: 'translateY(-2px)' }
          }}
          onClick={() => {
            if (addToBasket) {
              addToBasket({
                start: Math.max(0, d.start - pad),
                end: d.end + pad,
                label: d.text.substring(0, 50) + "..."
              });
            }
          }}
          >
            <div style={{ fontSize: '12px', color: '#92400E', marginBottom: '8px' }}>{padTime(d.start)}</div>
            <p style={{ fontSize: '14px', lineHeight: '1.4' }}>{d.text.substring(0, 100)}...</p>
            <button style={{ 
              marginTop: '10px', 
              padding: '5px 10px', 
              background: '#F59E0B', 
              color: 'white', 
              border: 'none', 
              borderRadius: '4px',
              fontSize: '12px',
              cursor: 'pointer'
            }}>
              + Add Clip
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// Component 3: Meeting Dynamics
function MeetingDynamics({ sents, cues }) {
  const [selectedMetric, setSelectedMetric] = useState('wpm');
  
  if (!sents || sents.length === 0) {
    return (
      <div className="viz-card" style={{ background: '#f0fdf4', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
        <h3>📈 Meeting Dynamics</h3>
        <p style={{ color: '#14532D' }}>Load a transcript to see meeting dynamics</p>
      </div>
    );
  }
  
  // Calculate basic metrics
  const totalWords = sents.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);
  const duration = sents[sents.length - 1].end;
  const wpm = Math.round(totalWords / (duration / 60));
  const questions = sents.filter(s => s.text.includes('?')).length;
  const avgSentenceLength = Math.round(totalWords / sents.length);
  
  const metrics = {
    wpm: { value: wpm, label: 'Words per Minute', color: '#0EA5E9' },
    questions: { value: questions, label: 'Questions Asked', color: '#8B5CF6' },
    sentences: { value: sents.length, label: 'Total Sentences', color: '#10B981' },
    avgLength: { value: avgSentenceLength, label: 'Avg Words/Sentence', color: '#F59E0B' }
  };
  
  const current = metrics[selectedMetric] || metrics.wpm;
  
  return (
    <div className="viz-card" style={{ background: '#f0fdf4', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3>📈 Meeting Dynamics</h3>
        <select 
          value={selectedMetric} 
          onChange={(e) => setSelectedMetric(e.target.value)}
          style={{ 
            padding: '6px 12px', 
            borderRadius: '6px', 
            border: '2px solid #10B981',
            background: 'white',
            cursor: 'pointer'
          }}
        >
          <option value="wpm">Words per Minute</option>
          <option value="questions">Questions Asked</option>
          <option value="sentences">Total Sentences</option>
          <option value="avgLength">Avg Sentence Length</option>
        </select>
      </div>
      
      <div style={{ 
        padding: '30px', 
        background: 'white', 
        borderRadius: '8px', 
        textAlign: 'center',
        border: `3px solid ${current.color}`
      }}>
        <div style={{ fontSize: '48px', fontWeight: 'bold', color: current.color }}>
          {current.value}
        </div>
        <div style={{ fontSize: '16px', color: '#666', marginTop: '10px' }}>
          {current.label}
        </div>
      </div>
    </div>
  );
}

// Component 4: Topic Heat Map
function TopicHeatMap({ fullText, sents }) {
  const [topicData, setTopicData] = useState([]);
  
  useEffect(() => {
    if (!fullText) return;
    
    const topics = {
      'Budget & Finance': ['budget', 'funding', 'cost', 'expense', 'revenue', 'financial'],
      'Development': ['development', 'construction', 'building', 'zoning', 'permit'],
      'Public Safety': ['safety', 'police', 'fire', 'emergency', 'crime'],
      'Infrastructure': ['road', 'street', 'water', 'sewer', 'utility'],
      'Community': ['community', 'service', 'program', 'resident', 'public']
    };
    
    const results = [];
    Object.entries(topics).forEach(([topic, keywords]) => {
      let count = 0;
      keywords.forEach(keyword => {
        const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
        const matches = fullText.match(regex);
        if (matches) count += matches.length;
      });
      if (count > 0) {
        results.push({ name: topic, mentions: count });
      }
    });
    
    results.sort((a, b) => b.mentions - a.mentions);
    setTopicData(results);
  }, [fullText]);
  
  return (
    <div className="viz-card" style={{ background: '#fce7f3', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <h3>🗺️ Topic Coverage</h3>
      <div style={{ marginTop: '15px' }}>
        {topicData.length === 0 ? (
          <p style={{ color: '#831843' }}>No civic topics detected</p>
        ) : (
          topicData.map((topic, i) => (
            <div key={i} style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px',
              marginBottom: '8px',
              background: 'white',
              borderRadius: '6px',
              border: '2px solid #EC4899'
            }}>
              <span style={{ fontWeight: 'bold', color: '#831843' }}>{topic.name}</span>
              <span style={{ 
                background: '#EC4899', 
                color: 'white', 
                padding: '2px 8px', 
                borderRadius: '12px',
                fontSize: '12px'
              }}>
                {topic.mentions} mentions
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// Component 5: Proper Noun Entities
function ProperNounEntities({ fullText, setQuery }) {
  const [entities, setEntities] = useState([]);
  
  useEffect(() => {
    if (!fullText) return;
    
    const words = fullText.split(/\s+/);
    const properNouns = {};
    
    words.forEach((word, idx) => {
      const cleaned = word.replace(/[^a-zA-Z'-]/g, '');
      if (cleaned && 
          cleaned[0] === cleaned[0].toUpperCase() && 
          cleaned !== cleaned.toUpperCase() &&
          cleaned.length > 2 &&
          !['The', 'This', 'That', 'These', 'Those'].includes(cleaned)) {
        properNouns[cleaned] = (properNouns[cleaned] || 0) + 1;
      }
    });
    
    const sorted = Object.entries(properNouns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }));
    
    setEntities(sorted);
  }, [fullText]);
  
  return (
    <div className="viz-card" style={{ background: '#ede9fe', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <h3>👤 Most Mentioned Names & Places</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '15px' }}>
        {entities.length === 0 ? (
          <p style={{ color: '#4C1D95' }}>No proper nouns detected</p>
        ) : (
          entities.map((entity, i) => (
            <button
              key={i}
              onClick={() => setQuery(entity.name)}
              style={{
                padding: '6px 12px',
                background: 'white',
                border: '2px solid #8B5CF6',
                borderRadius: '20px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                ':hover': { background: '#8B5CF6', color: 'white' }
              }}
            >
              <span style={{ fontWeight: 'bold' }}>{entity.name}</span>
              <span style={{ marginLeft: '6px', fontSize: '12px', color: '#6B7280' }}>({entity.count})</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

// Component 6: Feedback Form
function FeedbackForm() {
  const [showForm, setShowForm] = useState(false);
  const [feedback, setFeedback] = useState('');
  
  if (!showForm) {
    return (
      <div style={{ textAlign: 'center', margin: '40px 0' }}>
        <button 
          onClick={() => setShowForm(true)}
          style={{
            padding: '12px 24px',
            background: '#1E293B',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            cursor: 'pointer'
          }}
        >
          💡 Suggest a Feature
        </button>
      </div>
    );
  }
  
  return (
    <div style={{ 
      background: '#f3f4f6', 
      padding: '30px', 
      margin: '40px 0', 
      borderRadius: '12px',
      maxWidth: '600px',
      marginLeft: 'auto',
      marginRight: 'auto'
    }}>
      <h3>🚀 Feature Request</h3>
      <textarea
        placeholder="Describe your feature idea..."
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        style={{
          width: '100%',
          minHeight: '100px',
          padding: '10px',
          border: '2px solid #E5E7EB',
          borderRadius: '6px',
          fontSize: '14px',
          marginTop: '10px'
        }}
      />
      <div style={{ marginTop: '15px', display: 'flex', gap: '10px' }}>
        <button
          onClick={() => {
            window.open(`mailto:stephen@weirdmachine.org?subject=Community Highlighter Feedback&body=${encodeURIComponent(feedback)}`);
            setShowForm(false);
            setFeedback('');
          }}
          style={{
            padding: '10px 20px',
            background: '#10B981',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Send Feedback
        </button>
        <button
          onClick={() => setShowForm(false)}
          style={{
            padding: '10px 20px',
            background: '#6B7280',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================
// MAIN APP COMPONENT
// ============================================
export default function App() {
  // Core state
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [vtt, setVtt] = useState("");
  const [cues, setCues] = useState([]);
  const [fullText, setFullText] = useState("");
  const [sents, setSents] = useState([]);
  
  // Feature state
  const [words, setWords] = useState([]);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [basket, setBasket] = useState([]);
  const [summary, setSummary] = useState({ para: "", bullets: [] });
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [extendedAnalytics, setExtendedAnalytics] = useState(null);
  const [pad, setPad] = useState(10);
  const [videoTitle, setVideoTitle] = useState("");
  
  // Refs
  const playerRef = useRef(null);
  
  // Load transcript function
  const loadTranscript = async () => {
    setLoading(true);
    
    try {
      const match = url.match(/[?&]v=([^&]+)/);
      if (!match) {
        alert("Please enter a valid YouTube URL");
        return;
      }
      
      const id = match[1];
      setVideoId(id);
      
      // Fetch transcript
      const res = await fetch("http://localhost:8000/api/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id })
      });
      
      const transcript = await res.text();
      setVtt(transcript);
      
      // Parse VTT
      const parsedCues = parseVTT(transcript);
      setCues(parsedCues);
      
      // Create full text and sentences
      const textContent = parsedCues.map(c => c.text).join(' ');
      setFullText(textContent);
      
      const sentences = [];
      parsedCues.forEach(cue => {
        const sentParts = cue.text.split(/[.!?]+/);
        sentParts.forEach(part => {
          if (part.trim()) {
            sentences.push({
              text: part.trim(),
              start: cue.start,
              end: cue.end
            });
          }
        });
      });
      setSents(sentences);
      
      // Load word cloud
      const wordData = await loadWordCloud(textContent);
      setWords(wordData);
      
      // Load metadata
      try {
        const metaRes = await fetch("http://localhost:8000/api/metadata", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId: id })
        });
        const metaData = await metaRes.json();
        setVideoTitle(metaData.title || "");
      } catch (err) {
        console.error("Metadata error:", err);
      }
      
      // Load analytics
      try {
        const analyticsRes = await fetch("http://localhost:8000/api/analytics/extended", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript: textContent })
        });
        const analytics = await analyticsRes.json();
        setExtendedAnalytics(analytics);
      } catch (err) {
        console.error("Analytics error:", err);
      }
      
    } catch (err) {
      console.error("Error loading transcript:", err);
      alert("Error loading transcript: " + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Search handler
  const handleSearch = (searchQuery) => {
    setQuery(searchQuery);
    if (!searchQuery || !cues.length) {
      setSearchResults([]);
      return;
    }
    
    const results = cues.filter(cue => 
      cue.text.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setSearchResults(results);
  };
  
  // Generate AI summary
  const generateSummary = async () => {
    if (!fullText) return;
    setSummaryLoading(true);
    
    try {
      const res = await fetch("http://localhost:8000/api/summary_ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: fullText.substring(0, 3000),
          language: "en",
          model: "gpt-3.5-turbo"
        })
      });
      
      const data = await res.json();
      setSummary({ para: data.summarySentences || "No summary available", bullets: [] });
    } catch (err) {
      console.error("Summary error:", err);
      setSummary({ para: "Summary generation failed", bullets: [] });
    } finally {
      setSummaryLoading(false);
    }
  };
  
  // Clip management
  const addToBasket = (clip) => {
    const newClip = {
      ...clip,
      id: Date.now(),
      label: clip.label || `Clip at ${padTime(clip.start)}`
    };
    setBasket(prev => [...prev, newClip]);
  };
  
  const removeFromBasket = (id) => {
    setBasket(prev => prev.filter(c => c.id !== id));
  };
  
  const exportClips = async () => {
    if (basket.length === 0) return;
    
    try {
      const res = await fetch("http://localhost:8000/api/render_clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId,
          clips: basket,
          format: "individual"
        })
      });
      
      const data = await res.json();
      if (data.jobId) {
        alert(`Export started! Job ID: ${data.jobId}`);
      }
    } catch (err) {
      console.error("Export error:", err);
      alert("Export failed");
    }
  };
  
  // Render
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      {/* Header */}
      <header style={{ marginBottom: '40px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '36px', color: '#1E293B', marginBottom: '10px' }}>
          🎬 Community Highlighter
        </h1>
        <p style={{ color: '#64748B', fontSize: '18px' }}>
          Extract insights from YouTube community meetings
        </p>
      </header>
      
      {/* Input Section */}
      <div style={{ marginBottom: '30px', display: 'flex', gap: '10px', justifyContent: 'center' }}>
        <input
          type="text"
          placeholder="Paste YouTube URL (e.g., https://youtube.com/watch?v=...)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{ 
            width: '500px',
            padding: '12px 16px',
            fontSize: '16px',
            border: '2px solid #E2E8F0',
            borderRadius: '8px'
          }}
        />
        <button 
          onClick={loadTranscript}
          disabled={loading || !url}
          style={{ 
            padding: '12px 24px',
            fontSize: '16px',
            fontWeight: 'bold',
            background: loading ? '#94A3B8' : '#0EA5E9',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? "Loading..." : "Load Video"}
        </button>
      </div>
      
      {/* Video Player */}
      {videoId && (
        <div style={{ marginBottom: '30px', textAlign: 'center' }}>
          {videoTitle && <h2 style={{ marginBottom: '15px' }}>{videoTitle}</h2>}
          <iframe
            ref={playerRef}
            width="800"
            height="450"
            src={`https://www.youtube.com/embed/${videoId}`}
            frameBorder="0"
            allowFullScreen
            style={{ borderRadius: '12px', maxWidth: '100%' }}
          />
        </div>
      )}
      
      {/* AI Summary Section */}
      {fullText && (
        <div style={{ marginBottom: '30px', textAlign: 'center' }}>
          <button 
            onClick={generateSummary}
            disabled={summaryLoading}
            style={{ 
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 'bold',
              background: summaryLoading ? '#94A3B8' : '#10B981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: summaryLoading ? 'not-allowed' : 'pointer'
            }}
          >
            {summaryLoading ? "Generating..." : "✨ Generate AI Summary"}
          </button>
          
          {summary.para && (
            <div style={{ 
              marginTop: '20px',
              padding: '20px',
              background: 'linear-gradient(135deg, #F0FDF4 0%, #DCFCE7 100%)',
              borderRadius: '12px',
              border: '2px solid #10B981',
              textAlign: 'left',
              maxWidth: '800px',
              marginLeft: 'auto',
              marginRight: 'auto'
            }}>
              <h3 style={{ marginBottom: '10px', color: '#15803D' }}>✨ AI Summary</h3>
              <p style={{ lineHeight: '1.6', color: '#1E293B' }}>{summary.para}</p>
            </div>
          )}
        </div>
      )}
      
      {/* Search Section */}
      {cues.length > 0 && (
        <div style={{ marginBottom: '30px' }}>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Search transcript..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              style={{ 
                width: '400px',
                padding: '10px 16px',
                fontSize: '14px',
                border: '2px solid #E2E8F0',
                borderRadius: '8px'
              }}
            />
          </div>
          
          {searchResults.length > 0 && (
            <div style={{ 
              maxWidth: '800px',
              margin: '0 auto',
              background: '#F8FAFC',
              padding: '20px',
              borderRadius: '12px',
              border: '2px solid #E2E8F0'
            }}>
              <h4 style={{ marginBottom: '15px' }}>📍 Search Results ({searchResults.length})</h4>
              <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {searchResults.slice(0, 10).map((r, i) => (
                  <div key={i} style={{ 
                    marginBottom: '12px',
                    padding: '12px',
                    background: 'white',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    border: '1px solid #E2E8F0'
                  }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: '12px', color: '#64748B' }}>{padTime(r.start)}</span>
                      <p style={{ margin: '4px 0', color: '#1E293B' }}>{r.text}</p>
                    </div>
                    <button
                      onClick={() => addToBasket({
                        start: Math.max(0, r.start - pad),
                        end: r.end + pad,
                        label: r.text.substring(0, 50) + "..."
                      })}
                      style={{
                        padding: '6px 12px',
                        background: '#0EA5E9',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      + Add Clip
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Word Cloud */}
      {words.length > 0 && (
        <div style={{ 
          marginBottom: '30px',
          padding: '30px',
          background: 'linear-gradient(135deg, #F0F9FF 0%, #E0F2FE 100%)',
          borderRadius: '12px',
          border: '2px solid #0EA5E9'
        }}>
          <h3 style={{ marginBottom: '20px', color: '#0C4A6E' }}>☁️ Word Cloud</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
            {words.slice(0, 40).map((w, i) => {
              const size = Math.max(14, Math.min(48, Math.log(w.count + 1) * 12));
              const opacity = Math.max(0.6, Math.min(1, w.count / 20));
              return (
                <span 
                  key={i}
                  onClick={() => handleSearch(w.text)}
                  style={{ 
                    fontSize: `${size}px`,
                    color: `rgba(14, 165, 233, ${opacity})`,
                    cursor: 'pointer',
                    padding: '4px 8px',
                    transition: 'all 0.2s',
                    fontWeight: size > 24 ? 'bold' : 'normal',
                    ':hover': { transform: 'scale(1.1)' }
                  }}
                  title={`${w.count} occurrences`}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Analytics Components */}
      {cues.length > 0 && (
        <div>
          <MeetingStatsCard cues={cues} fullText={fullText} videoTitle={videoTitle} />
          <DecisionTimeline sents={sents} playerRef={playerRef} videoId={videoId} addToBasket={addToBasket} pad={pad} />
          <MeetingDynamics sents={sents} cues={cues} />
          <TopicHeatMap fullText={fullText} sents={sents} />
          <ProperNounEntities fullText={fullText} setQuery={handleSearch} />
        </div>
      )}
      
      {/* Floating Clip Basket */}
      {basket.length > 0 && (
        <div style={{ 
          position: 'fixed',
          right: '20px',
          bottom: '20px',
          width: '350px',
          maxHeight: '500px',
          background: 'white',
          border: '3px solid #1E293B',
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
          zIndex: 1000
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h3 style={{ margin: 0 }}>📎 Clip Basket ({basket.length})</h3>
            <button
              onClick={() => setBasket([])}
              style={{
                padding: '4px 8px',
                background: '#EF4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Clear All
            </button>
          </div>
          
          <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '15px' }}>
            {basket.map(clip => (
              <div key={clip.id} style={{ 
                marginBottom: '10px',
                padding: '10px',
                background: '#F8FAFC',
                borderRadius: '8px',
                border: '1px solid #E2E8F0'
              }}>
                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '4px' }}>
                  {padTime(clip.start)} - {padTime(clip.end)}
                </div>
                <div style={{ fontSize: '14px', marginBottom: '8px' }}>{clip.label}</div>
                <button
                  onClick={() => removeFromBasket(clip.id)}
                  style={{
                    padding: '4px 8px',
                    background: '#DC2626',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '11px',
                    cursor: 'pointer'
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          
          <button
            onClick={exportClips}
            style={{
              width: '100%',
              padding: '12px',
              background: '#10B981',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            📦 Export {basket.length} Clips
          </button>
        </div>
      )}
      
      {/* Feedback Form */}
      <FeedbackForm />
      
      {/* Footer */}
      <footer style={{ 
        marginTop: '60px',
        paddingTop: '30px',
        borderTop: '2px solid #E2E8F0',
        textAlign: 'center',
        color: '#64748B'
      }}>
        <p>🎬 Community Highlighter v2.0 - Full Feature Set</p>
        <p style={{ fontSize: '14px', marginTop: '10px' }}>
          Extract insights from community meetings • Powered by AI
        </p>
      </footer>
    </div>
  );
}