// api.js - API functions for Community Highlighter
const BACKEND_URL = "http://localhost:8000";

export async function apiTranscript(data) {
  // Accept either a string (videoId) or an object {url, videoId}
  const payload = typeof data === 'string' ? { videoId: data } : data;
  
  const res = await fetch(`${BACKEND_URL}/api/transcript`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error("Failed to fetch transcript");
  return res.text();
}

export async function apiWordfreq(text) {
  const res = await fetch(`${BACKEND_URL}/api/wordfreq`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text })
  });
  return res.json();
}

export async function apiSummaryAI(data) {
  const res = await fetch(`${BACKEND_URL}/api/summary_ai`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function apiTranslate(data) {
  const res = await fetch(`${BACKEND_URL}/api/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function apiRenderJob(data) {
  const res = await fetch(`${BACKEND_URL}/api/render_clips`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  return res.json();
}

export async function apiJobStatus(jobId) {
  const res = await fetch(`${BACKEND_URL}/api/job_status?jobId=${jobId}`);
  return res.json();
}

export async function apiDownloadMp4(videoId) {
  const res = await fetch(`${BACKEND_URL}/api/download_mp4`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId })
  });
  return res.json();
}

export async function apiMetadata(videoId) {
  const res = await fetch(`${BACKEND_URL}/api/metadata`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId })
  });
  return res.json();
}

export async function apiHighlightReel(videoId) {
  const res = await fetch(`${BACKEND_URL}/api/highlight_reel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoId })
  });
  return res.json();
}

// Extended analytics
export async function apiExtendedAnalytics(transcript) {
  const res = await fetch(`${BACKEND_URL}/api/analytics/extended`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transcript })
  });
  return res.json();
}
