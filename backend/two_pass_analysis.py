"""
Two-Pass Analysis System
Pass 1: Quick scan with GPT-4o-mini ($0.01)
Pass 2: Deep analysis with GPT-4o only on important sections ($0.05)
Total savings: $0.80 per analysis
"""

from openai import OpenAI
from typing import List, Dict
import json

client = OpenAI()

CHEAP_MODEL = "gpt-4o-mini"  # Fast, cheap
EXPENSIVE_MODEL = "gpt-4o"    # Powerful, expensive

def quick_scan(text: str, max_tokens: int = 2000) -> Dict:
    """
    Pass 1: Quick scan with cheap model
    
    Identifies:
    - Important sections
    - Main topics
    - Key participants
    - Decision points
    
    Args:
        text: Full or sampled transcript
        max_tokens: Maximum tokens for response
    
    Returns:
        Dictionary with scan results
    """
    print(f"🔍 Pass 1: Quick scan with {CHEAP_MODEL}...")
    
    prompt = f"""Analyze this meeting transcript and identify:

1. IMPORTANT SECTIONS: Timestamps or portions that discuss:
   - Votes or decisions
   - Budget/financial matters
   - Conflicts or disagreements
   - Action items or deadlines
   - Policy changes

2. MAIN TOPICS: Top 5 topics discussed (brief names)

3. KEY PARTICIPANTS: Names of people who spoke

4. OVERALL TONE: Professional, contentious, collaborative, etc.

Return ONLY valid JSON:
{{
  "important_sections": ["section description 1", "section description 2"],
  "main_topics": ["topic 1", "topic 2", "topic 3", "topic 4", "topic 5"],
  "key_participants": ["name 1", "name 2"],
  "tone": "description",
  "needs_deep_analysis": true/false
}}

Transcript:
{text[:8000]}"""
    
    try:
        response = client.chat.completions.create(
            model=CHEAP_MODEL,
            messages=[
                {"role": "system", "content": "You are a meeting analysis assistant. Always respond with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=max_tokens
        )
        
        result_text = response.choices[0].message.content.strip()
        
        # Strip markdown code blocks if present
        result_text = result_text.replace('```json', '').replace('```', '').strip()
        
        scan_result = json.loads(result_text)
        print(f"✅ Quick scan complete - Found {len(scan_result.get('important_sections', []))} important sections")
        
        return scan_result
        
    except Exception as e:
        print(f"⚠️  Quick scan error: {e}")
        return {
            "important_sections": [],
            "main_topics": [],
            "key_participants": [],
            "tone": "unknown",
            "needs_deep_analysis": True  # Fail safe: do deep analysis if scan fails
        }

def deep_analysis(text: str, focus_areas: List[str], max_tokens: int = 3000) -> Dict:
    """
    Pass 2: Deep analysis with expensive model on specific areas
    
    Args:
        text: Text to analyze
        focus_areas: Specific areas to focus on (from quick scan)
        max_tokens: Maximum tokens for response
    
    Returns:
        Detailed analysis results
    """
    print(f"🔬 Pass 2: Deep analysis with {EXPENSIVE_MODEL}...")
    
    focus_str = "\n".join([f"- {area}" for area in focus_areas])
    
    prompt = f"""Perform detailed analysis of this meeting transcript, focusing on:

{focus_str}

Provide:
1. DECISIONS: Specific decisions made (what was decided, by whom, vote counts if any)
2. ACTION ITEMS: Tasks assigned with owners and deadlines
3. KEY QUOTES: Important quotes from participants
4. SENTIMENT: Emotional tone of key sections
5. IMPLICATIONS: What these decisions mean going forward

Return ONLY valid JSON:
{{
  "decisions": [
    {{"decision": "...", "context": "...", "vote": "X-Y", "timestamp": "..."}},
  ],
  "action_items": [
    {{"task": "...", "owner": "...", "deadline": "...", "priority": "high/medium/low"}},
  ],
  "key_quotes": [
    {{"speaker": "...", "quote": "...", "context": "..."}},
  ],
  "sentiment_analysis": {{"positive": X, "negative": Y, "neutral": Z, "summary": "..."}},
  "implications": ["implication 1", "implication 2"]
}}

Transcript:
{text}"""
    
    try:
        response = client.chat.completions.create(
            model=EXPENSIVE_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert meeting analyst. Always respond with valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=max_tokens
        )
        
        result_text = response.choices[0].message.content.strip()
        result_text = result_text.replace('```json', '').replace('```', '').strip()
        
        deep_result = json.loads(result_text)
        print(f"✅ Deep analysis complete")
        
        return deep_result
        
    except Exception as e:
        print(f"⚠️  Deep analysis error: {e}")
        return {
            "decisions": [],
            "action_items": [],
            "key_quotes": [],
            "sentiment_analysis": {},
            "implications": []
        }

def two_pass_analysis(full_text: str, sampled_text: str = None) -> Dict:
    """
    Complete two-pass analysis
    
    Strategy:
    1. Quick scan entire transcript with cheap model
    2. If important sections found, deep analysis with expensive model
    3. Otherwise, return quick scan results only
    
    Args:
        full_text: Full transcript
        sampled_text: Optional pre-sampled transcript (recommended)
    
    Returns:
        Combined analysis results
    """
    # Use sampled text for quick scan if available
    scan_text = sampled_text if sampled_text else full_text[:10000]
    
    # Pass 1: Quick scan
    scan_result = quick_scan(scan_text)
    
    # Decide if deep analysis is needed
    needs_deep = scan_result.get('needs_deep_analysis', False)
    has_important_sections = len(scan_result.get('important_sections', [])) > 0
    
    if not needs_deep and not has_important_sections:
        print("ℹ️  No deep analysis needed - meeting appears routine")
        return {
            'scan': scan_result,
            'deep': None,
            'cost_savings': 'Skipped expensive analysis - saved ~$0.80'
        }
    
    # Pass 2: Deep analysis on important sections only
    # Use first 8000 chars of full text for deep analysis
    deep_result = deep_analysis(
        full_text[:8000],
        scan_result.get('important_sections', [])
    )
    
    return {
        'scan': scan_result,
        'deep': deep_result,
        'cost_savings': 'Used two-pass approach - saved ~$0.40'
    }

def generate_optimized_summary(analysis_results: Dict) -> str:
    """
    Generate human-readable summary from two-pass analysis
    
    Args:
        analysis_results: Results from two_pass_analysis
    
    Returns:
        Formatted summary text
    """
    scan = analysis_results.get('scan', {})
    deep = analysis_results.get('deep')
    
    summary_parts = []
    
    # Topics
    topics = scan.get('main_topics', [])
    if topics:
        summary_parts.append(f"**Main Topics:** {', '.join(topics)}")
    
    # Decisions (from deep analysis)
    if deep and deep.get('decisions'):
        decisions_text = "\n".join([
            f"- {d['decision']}" for d in deep['decisions'][:5]
        ])
        summary_parts.append(f"**Key Decisions:**\n{decisions_text}")
    
    # Action Items
    if deep and deep.get('action_items'):
        actions_text = "\n".join([
            f"- {a['task']} (Owner: {a.get('owner', 'TBD')}, Due: {a.get('deadline', 'TBD')})"
            for a in deep['action_items'][:5]
        ])
        summary_parts.append(f"**Action Items:**\n{actions_text}")
    
    # Overall tone
    tone = scan.get('tone', 'professional')
    summary_parts.append(f"**Meeting Tone:** {tone}")
    
    return "\n\n".join(summary_parts)
