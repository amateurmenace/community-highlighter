import { useState, useEffect } from "react";

const TERMINAL_LINES = [
  { delay: 0, text: "Fetching transcript from YouTube...", icon: ">" },
  { delay: 2500, text: "Downloading captions and parsing segments", icon: " " },
  { delay: 5500, text: "Reading transcript...", icon: ">" },
  { delay: 8000, text: "Parsing words across transcript segments", icon: " " },
  { delay: 11000, text: "Identifying speakers and topics...", icon: ">" },
  { delay: 14000, text: "Found key topics — extracting decisions and votes", icon: " " },
  { delay: 17000, text: "Generating executive summary...", icon: ">" },
  { delay: 20000, text: "Matching timestamps to key moments", icon: " " },
  { delay: 23000, text: "Composing brief with specifics...", icon: ">" },
  { delay: 26000, text: "Finalizing...", icon: ">" },
];

export default function SummaryLoadingTerminal() {
  const [visibleLines, setVisibleLines] = useState([]);
  const [typingIdx, setTypingIdx] = useState(0);
  const [typedChars, setTypedChars] = useState(0);

  useEffect(() => {
    const timers = TERMINAL_LINES.map((line, i) =>
      setTimeout(() => setVisibleLines(prev => [...prev, { ...line, charCount: 0 }]), line.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  // Typewriter effect for the latest line
  useEffect(() => {
    if (visibleLines.length === 0) return;
    const lastIdx = visibleLines.length - 1;
    const lastLine = TERMINAL_LINES[lastIdx];
    if (!lastLine) return;
    const fullText = lastLine.text;
    let charIdx = 0;
    const interval = setInterval(() => {
      charIdx++;
      if (charIdx > fullText.length) {
        clearInterval(interval);
        return;
      }
      setVisibleLines(prev => {
        const updated = [...prev];
        if (updated[lastIdx]) updated[lastIdx] = { ...updated[lastIdx], charCount: charIdx };
        return updated;
      });
    }, 35);
    return () => clearInterval(interval);
  }, [visibleLines.length]);

  return (
    <div className="summary-terminal">
      <div className="summary-terminal-header">
        <div className="summary-terminal-dots"><span /><span /><span /></div>
        <span className="summary-terminal-title">AI Analysis</span>
      </div>
      <div className="summary-terminal-body">
        {visibleLines.map((line, i) => {
          const fullText = TERMINAL_LINES[i]?.text || "";
          const isLast = i === visibleLines.length - 1;
          const displayText = isLast ? fullText.slice(0, line.charCount || 0) : fullText;
          const isDone = !isLast || (line.charCount || 0) >= fullText.length;
          return (
            <div key={i} className={`summary-terminal-line ${isDone ? 'done' : 'typing'}`}>
              <span className="summary-terminal-icon">{line.icon === ">" ? "\u276F" : " "}</span>
              <span>{displayText}</span>
              {isLast && !isDone && <span className="streaming-cursor" style={{ height: 14, width: 6 }} />}
            </div>
          );
        })}
        {visibleLines.length > 0 && visibleLines.length < TERMINAL_LINES.length && (
          <div className="summary-terminal-line typing">
            <span className="summary-terminal-icon">{"\u276F"}</span>
            <span className="streaming-cursor" style={{ height: 14, width: 6 }} />
          </div>
        )}
      </div>
    </div>
  );
}
