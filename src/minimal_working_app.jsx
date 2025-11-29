import React, { useState, useEffect, useRef } from "react";

// Minimal API functions (no external dependencies)
const apiTranscript = async (videoId) => {
  try {
    const res = await fetch("http://localhost:8000/api/transcript", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId })
    });
    return res.ok ? res.text() : "Error loading transcript";
  } catch (e) {
    console.error("API Error:", e);
    return "API connection failed";
  }
};

export default function App() {
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState("");
  const [transcript, setTranscript] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadVideo = async () => {
    try {
      setError("");
      setLoading(true);
      
      // Extract video ID
      const match = url.match(/[?&]v=([^&]+)/);
      if (!match) {
        setError("Invalid YouTube URL");
        return;
      }
      
      const id = match[1];
      setVideoId(id);
      
      // Load transcript
      const result = await apiTranscript(id);
      setTranscript(result);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app" style={{ padding: "20px", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: "30px" }}>
        <h1>🎬 Community Highlighter</h1>
        <p>Extract transcripts from YouTube videos</p>
      </header>

      <main>
        {/* URL Input Section */}
        <section style={{ marginBottom: "30px" }}>
          <div style={{ display: "flex", gap: "10px", maxWidth: "600px" }}>
            <input
              type="text"
              placeholder="Paste YouTube URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              style={{
                flex: 1,
                padding: "10px",
                fontSize: "16px",
                border: "2px solid #ddd",
                borderRadius: "4px"
              }}
            />
            <button
              onClick={loadVideo}
              disabled={loading || !url}
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
          
          {error && (
            <div style={{ color: "red", marginTop: "10px" }}>
              Error: {error}
            </div>
          )}
        </section>

        {/* Video Display */}
        {videoId && (
          <section style={{ marginBottom: "30px" }}>
            <h2>Video</h2>
            <iframe
              width="560"
              height="315"
              src={`https://www.youtube.com/embed/${videoId}`}
              frameBorder="0"
              allowFullScreen
              style={{ borderRadius: "8px" }}
            />
          </section>
        )}

        {/* Transcript Display */}
        {transcript && (
          <section>
            <h2>Transcript</h2>
            <div style={{
              background: "#f5f5f5",
              padding: "20px",
              borderRadius: "8px",
              maxHeight: "400px",
              overflow: "auto",
              whiteSpace: "pre-wrap"
            }}>
              {transcript}
            </div>
          </section>
        )}
      </main>

      <footer style={{ marginTop: "50px", paddingTop: "20px", borderTop: "1px solid #ddd" }}>
        <p style={{ color: "#666" }}>Community Highlighter - Minimal Working Version</p>
      </footer>
    </div>
  );
}