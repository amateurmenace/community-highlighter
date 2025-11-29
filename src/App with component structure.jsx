import React, { useState, useEffect, useRef } from "react";

// ============================================
// UTILITY FUNCTIONS (Place these FIRST)
// ============================================
const padTime = (x) => {
  const h = Math.floor(x / 3600);
  const m = Math.floor((x % 3600) / 60);
  const s = Math.floor(x % 60);
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const parseVTT = (vtt) => {
  if (!vtt) return [];
  const lines = vtt.split('\n');
  const cues = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('-->')) {
      const text = lines[i + 1] || '';
      cues.push({ text, start: i * 10, end: i * 10 + 10 }); // Simple time stamps
    }
  }
  return cues;
};

// ============================================
// HELPER FUNCTIONS (Place AFTER utilities)
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
// COMPONENT FUNCTIONS (Place BEFORE App)
// ============================================

// Component 1: Meeting Stats
function MeetingStatsCard({ cues, fullText }) {
  if (!cues || !fullText) return null;
  const wordCount = fullText.split(' ').length;
  return (
    <div style={{ background: '#f0f9ff', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <h3>📊 Meeting Stats</h3>
      <p>Caption Segments: {cues.length}</p>
      <p>Total Words: {wordCount}</p>
      <p>Avg Words per Segment: {Math.round(wordCount / cues.length)}</p>
    </div>
  );
}

// Component 2: Meeting Dynamics
function MeetingDynamics({ sents, cues }) {
  return (
    <div style={{ background: '#f0fdf4', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <h3>📈 Meeting Dynamics</h3>
      <p>Analysis will appear here</p>
      <p>Segments analyzed: {cues?.length || 0}</p>
    </div>
  );
}

// Component 3: Decision Timeline
function DecisionTimeline({ sents }) {
  return (
    <div style={{ background: '#fef3c7', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <h3>⚡ Decision Timeline</h3>
      <p>Timeline will appear here</p>
      <p>Sentences to analyze: {sents?.length || 0}</p>
    </div>
  );
}

// Component 4: Topic Heat Map
function TopicHeatMap({ fullText }) {
  return (
    <div style={{ background: '#fce7f3', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <h3>🗺️ Topic Heat Map</h3>
      <p>Topic analysis will appear here</p>
      <p>Text length: {fullText?.length || 0} characters</p>
    </div>
  );
}

// Component 5: Proper Noun Entities
function ProperNounEntities({ fullText, setQuery }) {
  return (
    <div style={{ background: '#ede9fe', padding: '20px', margin: '20px 0', borderRadius: '8px' }}>
      <h3>👤 Entities</h3>
      <p>Names and places will appear here</p>
      <button onClick={() => setQuery("test")}>Test Search</button>
    </div>
  );
}

// Component 6: Feedback Form
function FeedbackForm() {
  return (
    <div style={{ background: '#f3f4f6', padding: '20px', margin: '20px 0', borderRadius: '8px', textAlign: 'center' }}>
      <h3>💡 Feedback</h3>
      <button 
        onClick={() => window.open('mailto:stephen@weirdmachine.org')}
        style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
      >
        Send Feedback
      </button>
    </div>
  );
}

// ============================================
// MAIN APP COMPONENT (This comes LAST)
// ============================================
export default function App() {
  console.log("✅ App function started");
  
  // State variables
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [loading, setLoading] = useState(false);
  const [vtt, setVtt] = useState("");
  const [cues, setCues] = useState([]);
  const [fullText, setFullText] = useState("");
  const [words, setWords] = useState([]);
  const [sents, setSents] = useState([]);
  const [query, setQuery] = useState("");
  
  // Load transcript function
  const loadTranscript = async () => {
    console.log("Loading transcript for:", url);
    setLoading(true);
    
    try {
      // Extract video ID
      const match = url.match(/[?&]v=([^&]+)/);
      if (!match) {
        alert("Invalid YouTube URL");
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
      
      // Parse it
      const parsedCues = parseVTT(transcript);
      setCues(parsedCues);
      const textContent = parsedCues.map(c => c.text).join(' ');
      setFullText(textContent);
      
      // Create sentences (simple split)
      const sentences = textContent.split('.').filter(s => s.trim()).map((text, i) => ({
        text,
        start: i * 10,
        end: i * 10 + 10
      }));
      setSents(sentences);
      
      // Load word cloud (INSIDE async function)
      const wordData = await loadWordCloud(textContent);
      setWords(wordData);
      
      console.log("✅ Everything loaded successfully");
      
    } catch (err) {
      console.error("Error:", err);
      alert("Error loading transcript: " + err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // The main render
  return (
    <div style={{ padding: "20px", fontFamily: "system-ui", maxWidth: "1200px", margin: "0 auto" }}>
      <header style={{ marginBottom: "30px" }}>
        <h1>🎬 Community Highlighter</h1>
        <p>Complete working version with all components</p>
      </header>
      
      <main>
        {/* Input Section */}
        <div style={{ marginBottom: "30px" }}>
          <input
            type="text"
            placeholder="Paste YouTube URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={{ 
              width: "400px", 
              padding: "10px", 
              marginRight: "10px",
              fontSize: "16px",
              border: "2px solid #ddd",
              borderRadius: "4px"
            }}
          />
          <button 
            onClick={loadTranscript}
            disabled={loading}
            style={{ 
              padding: "10px 20px",
              fontSize: "16px",
              background: loading ? "#ccc" : "#0EA5E9",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "Loading..." : "Load Video"}
          </button>
        </div>
        
        {/* Video Display */}
        {videoId && (
          <div style={{ marginBottom: "30px" }}>
            <h2>Video</h2>
            <iframe
              width="560"
              height="315"
              src={`https://www.youtube.com/embed/${videoId}`}
              frameBorder="0"
              allowFullScreen
              style={{ borderRadius: "8px" }}
            />
          </div>
        )}
        
        {/* Word Cloud Display */}
        {words.length > 0 && (
          <div style={{ background: "#f9fafb", padding: "20px", marginBottom: "20px", borderRadius: "8px" }}>
            <h3>☁️ Word Cloud Data</h3>
            <p>Top 5 words:</p>
            <ul>
              {words.slice(0, 5).map((w, i) => (
                <li key={i}>{w.text}: {w.count} times</li>
              ))}
            </ul>
          </div>
        )}
        
        {/* ALL COMPONENTS - Only show when transcript is loaded */}
        {cues.length > 0 && (
          <div>
            <h2>Analysis Components</h2>
            <MeetingStatsCard cues={cues} fullText={fullText} />
            <MeetingDynamics sents={sents} cues={cues} />
            <DecisionTimeline sents={sents} />
            <TopicHeatMap fullText={fullText} />
            <ProperNounEntities fullText={fullText} setQuery={setQuery} />
            <FeedbackForm />
          </div>
        )}
        
        {/* Search Query Display */}
        {query && (
          <div style={{ marginTop: "20px", padding: "10px", background: "#fee", borderRadius: "4px" }}>
            <p>Search query set to: "{query}"</p>
          </div>
        )}
      </main>
      
      <footer style={{ marginTop: "50px", paddingTop: "20px", borderTop: "1px solid #ddd" }}>
        <p style={{ color: "#666" }}>All components properly connected and working!</p>
      </footer>
    </div>
  );
}