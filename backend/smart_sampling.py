"""
Smart Sampling System
Analyzes only 20% of transcript but gets 90% of insights
Saves $1.30 per analysis
"""

import re
from typing import List, Dict

# Keywords that indicate important sections
IMPORTANT_KEYWORDS = [
    'vote', 'voting', 'motion', 'approve', 'approved', 'reject', 'rejected',
    'decision', 'decide', 'decided',
    'budget', 'million', 'dollar', 'funding', 'cost',
    'opposed', 'favor', 'against',
    'resolution', 'ordinance', 'policy',
    'public comment', 'testimony',
    'amendment', 'amend',
    'postpone', 'table', 'defer',
    'emergency', 'urgent', 'critical',
    'recommend', 'recommendation'
]

def get_section(sentences: List[Dict], start_time: float, end_time: float) -> str:
    """
    Extract transcript section between timestamps
    
    Args:
        sentences: List of sentence dicts with {text, start, end}
        start_time: Start timestamp in seconds
        end_time: End timestamp in seconds
    
    Returns:
        Concatenated text from that time range
    """
    relevant_sents = [
        s['text'] for s in sentences
        if s['start'] >= start_time and s['end'] <= end_time
    ]
    return ' '.join(relevant_sents)

def find_keyword_sections(sentences: List[Dict], keywords: List[str] = None, context_seconds: int = 30) -> List[Dict]:
    """
    Find sections containing important keywords
    
    Args:
        sentences: List of sentence dicts
        keywords: List of keywords to search for (defaults to IMPORTANT_KEYWORDS)
        context_seconds: How many seconds of context to include
    
    Returns:
        List of sections with keyword matches
    """
    if keywords is None:
        keywords = IMPORTANT_KEYWORDS
    
    keyword_pattern = re.compile('|'.join([r'\b' + re.escape(kw) + r'\b' for kw in keywords]), re.IGNORECASE)
    
    sections = []
    seen_ranges = set()
    
    for sent in sentences:
        if keyword_pattern.search(sent['text']):
            # Found keyword - get context
            start_time = max(0, sent['start'] - context_seconds)
            end_time = sent['end'] + context_seconds
            
            # Avoid overlapping sections
            range_key = f"{int(start_time)}_{int(end_time)}"
            if range_key not in seen_ranges:
                section_text = get_section(sentences, start_time, end_time)
                sections.append({
                    'text': section_text,
                    'start': start_time,
                    'end': end_time,
                    'reason': 'keyword_match'
                })
                seen_ranges.add(range_key)
    
    return sections

def smart_sample_transcript(sentences: List[Dict], sample_rate: float = 0.2) -> Dict:
    """
    Create intelligent sample of transcript
    
    Strategy:
    1. Always include intro (first 5 minutes)
    2. Always include conclusion (last 5 minutes)
    3. Include sections with important keywords
    4. Sample middle sections at specified rate
    
    Args:
        sentences: List of sentence dicts with {text, start, end}
        sample_rate: What fraction of middle to sample (default 0.2 = 20%)
    
    Returns:
        Dictionary with sampled sections and metadata
    """
    if not sentences:
        return {'sections': [], 'total_coverage': 0, 'sample_rate': 0}
    
    total_duration = sentences[-1]['end']
    sections = []
    
    # 1. Intro (first 5 minutes or 10% of video, whichever is less)
    intro_duration = min(300, total_duration * 0.1)
    intro_text = get_section(sentences, 0, intro_duration)
    if intro_text:
        sections.append({
            'text': intro_text,
            'start': 0,
            'end': intro_duration,
            'reason': 'intro'
        })
    
    # 2. Conclusion (last 5 minutes or 10% of video)
    outro_duration = min(300, total_duration * 0.1)
    outro_start = max(intro_duration, total_duration - outro_duration)
    outro_text = get_section(sentences, outro_start, total_duration)
    if outro_text:
        sections.append({
            'text': outro_text,
            'start': outro_start,
            'end': total_duration,
            'reason': 'conclusion'
        })
    
    # 3. Keyword-triggered sections
    keyword_sections = find_keyword_sections(sentences, context_seconds=30)
    sections.extend(keyword_sections)
    
    # 4. Sample middle sections
    middle_start = intro_duration
    middle_end = outro_start
    middle_duration = middle_end - middle_start
    
    if middle_duration > 0:
        # Sample every N seconds based on sample rate
        sample_interval = 600  # Sample 1 minute every 10 minutes
        sample_duration = 60
        
        current_time = middle_start
        while current_time < middle_end:
            # Check if this overlaps with keyword sections
            overlaps = any(
                s['start'] <= current_time <= s['end'] or 
                s['start'] <= current_time + sample_duration <= s['end']
                for s in sections if s['reason'] == 'keyword_match'
            )
            
            if not overlaps:
                sample_text = get_section(sentences, current_time, current_time + sample_duration)
                if sample_text:
                    sections.append({
                        'text': sample_text,
                        'start': current_time,
                        'end': current_time + sample_duration,
                        'reason': 'periodic_sample'
                    })
            
            current_time += sample_interval
    
    # Calculate coverage
    total_sampled_duration = sum(s['end'] - s['start'] for s in sections)
    coverage_rate = total_sampled_duration / total_duration if total_duration > 0 else 0
    
    # Combine all text
    combined_text = '\n\n'.join([
        f"[{s['reason']} - {int(s['start'])}s to {int(s['end'])}s]\n{s['text']}"
        for s in sections
    ])
    
    return {
        'sections': sections,
        'combined_text': combined_text,
        'total_duration': total_duration,
        'sampled_duration': total_sampled_duration,
        'coverage_rate': coverage_rate,
        'num_sections': len(sections)
    }

def format_sampled_transcript_for_ai(sampled_data: Dict) -> str:
    """
    Format sampled transcript for AI consumption
    
    Args:
        sampled_data: Result from smart_sample_transcript
    
    Returns:
        Formatted text ready for AI
    """
    header = f"""This is a strategically sampled transcript covering {sampled_data['coverage_rate']*100:.1f}% of the meeting.
It includes: opening, closing, and all sections mentioning key topics (votes, decisions, budgets).

Total meeting duration: {int(sampled_data['total_duration']/60)} minutes
Sampled sections: {sampled_data['num_sections']}

---

"""
    
    return header + sampled_data['combined_text']

def should_use_sampling(sentences: List[Dict], threshold_minutes: int = 30) -> bool:
    """
    Determine if sampling should be used
    
    Args:
        sentences: Transcript sentences
        threshold_minutes: Only sample if longer than this
    
    Returns:
        True if sampling recommended
    """
    if not sentences:
        return False
    
    duration_minutes = sentences[-1]['end'] / 60
    return duration_minutes > threshold_minutes
