"""
Hybrid Rules System
Use regex/rules for simple extractions instead of expensive AI
Saves $0.40 per analysis
"""

import re
from typing import List, Dict, Set
from datetime import datetime, timedelta
import dateparser

def extract_emails_regex(text: str) -> List[str]:
    """
    Extract email addresses using regex (free vs $0.01 with AI)
    
    Args:
        text: Text to search
    
    Returns:
        List of unique email addresses
    """
    email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
    emails = re.findall(email_pattern, text, re.IGNORECASE)
    return list(set(emails))

def extract_phone_numbers_regex(text: str) -> List[str]:
    """
    Extract phone numbers using regex
    
    Args:
        text: Text to search
    
    Returns:
        List of phone numbers
    """
    patterns = [
        r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b',  # 123-456-7890 or 1234567890
        r'\(\d{3}\)\s*\d{3}[-.]?\d{4}',     # (123) 456-7890
        r'\b\d{3}\s\d{3}\s\d{4}\b'          # 123 456 7890
    ]
    
    phones = []
    for pattern in patterns:
        phones.extend(re.findall(pattern, text))
    
    return list(set(phones))

def extract_dates_regex(text: str) -> List[Dict]:
    """
    Extract dates using regex and dateparser
    
    Args:
        text: Text to search
    
    Returns:
        List of date dictionaries
    """
    # Common date patterns
    date_patterns = [
        r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',
        r'\b\d{1,2}/\d{1,2}/\d{2,4}\b',
        r'\b\d{1,2}-\d{1,2}-\d{2,4}\b',
        r'\bnext\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b',
        r'\b(?:today|tomorrow|yesterday)\b'
    ]
    
    dates = []
    for pattern in date_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            parsed = dateparser.parse(match)
            if parsed:
                dates.append({
                    'text': match,
                    'date': parsed.isoformat(),
                    'formatted': parsed.strftime('%B %d, %Y')
                })
    
    return dates

def extract_money_amounts_regex(text: str) -> List[Dict]:
    """
    Extract money amounts using regex
    
    Args:
        text: Text to search
    
    Returns:
        List of money amount dictionaries
    """
    patterns = [
        r'\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s*(?:million|billion|thousand|M|B|K))?',
        r'\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*dollars?',
    ]
    
    amounts = []
    for pattern in patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        for match in matches:
            # Parse amount
            amount_str = re.sub(r'[^\d.]', '', match.split()[0])
            try:
                amount = float(amount_str)
                
                # Handle multipliers
                if re.search(r'million|M\b', match, re.IGNORECASE):
                    amount *= 1_000_000
                elif re.search(r'billion|B\b', match, re.IGNORECASE):
                    amount *= 1_000_000_000
                elif re.search(r'thousand|K\b', match, re.IGNORECASE):
                    amount *= 1_000
                
                amounts.append({
                    'text': match,
                    'amount': amount,
                    'formatted': f'${amount:,.2f}'
                })
            except ValueError:
                pass
    
    return amounts

def extract_addresses_regex(text: str) -> List[str]:
    """
    Extract street addresses using regex
    
    Args:
        text: Text to search
    
    Returns:
        List of addresses
    """
    # Pattern for US addresses
    address_pattern = r'\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl)\b'
    addresses = re.findall(address_pattern, text, re.IGNORECASE)
    return list(set(addresses))

def extract_urls_regex(text: str) -> List[str]:
    """
    Extract URLs using regex
    
    Args:
        text: Text to search
    
    Returns:
        List of URLs
    """
    url_pattern = r'https?://[^\s<>"{}|\\^`\[\]]+'
    urls = re.findall(url_pattern, text)
    return list(set(urls))

def extract_percentages_regex(text: str) -> List[Dict]:
    """
    Extract percentages using regex
    
    Args:
        text: Text to search
    
    Returns:
        List of percentage dictionaries
    """
    pattern = r'\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s*percent\b'
    matches = re.findall(pattern, text, re.IGNORECASE)
    
    percentages = []
    for match in matches:
        # Extract numeric value
        value_str = re.search(r'\d+(?:\.\d+)?', match).group()
        try:
            value = float(value_str)
            percentages.append({
                'text': match,
                'value': value,
                'formatted': f'{value}%'
            })
        except ValueError:
            pass
    
    return percentages

def count_speakers_simple(sentences: List[Dict]) -> int:
    """
    Simple speaker count (if speaker info available in transcript)
    
    Args:
        sentences: List of sentences with optional 'speaker' field
    
    Returns:
        Number of unique speakers
    """
    speakers = set()
    for sent in sentences:
        if 'speaker' in sent and sent['speaker']:
            speakers.add(sent['speaker'])
    
    return len(speakers) if speakers else None

def detect_votes_regex(text: str) -> List[Dict]:
    """
    Detect voting patterns using regex
    
    Args:
        text: Text to search
    
    Returns:
        List of vote dictionaries
    """
    vote_patterns = [
        r'(?:voted?|voting)\s+(\d+)\s*(?:to|-)\s*(\d+)',
        r'(\d+)\s+(?:in favor|ayes?)\s+(?:and\s+)?(\d+)\s+(?:opposed|nays?|against)',
        r'motion\s+(?:passes|passed|fails|failed)\s+(\d+)\s*(?:to|-)\s*(\d+)'
    ]
    
    votes = []
    for pattern in vote_patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            try:
                yes_votes = int(match.group(1))
                no_votes = int(match.group(2))
                votes.append({
                    'text': match.group(0),
                    'yes': yes_votes,
                    'no': no_votes,
                    'total': yes_votes + no_votes,
                    'passed': yes_votes > no_votes
                })
            except (ValueError, IndexError):
                pass
    
    return votes

def extract_all_structured_data(text: str, sentences: List[Dict] = None) -> Dict:
    """
    Extract all structured data using regex (no AI needed!)
    
    This replaces expensive AI calls for simple extractions
    
    Args:
        text: Full transcript text
        sentences: Optional list of sentences for additional analysis
    
    Returns:
        Dictionary with all extracted data
    """
    print("🔧 Using hybrid rules for structured data extraction...")
    
    return {
        'emails': extract_emails_regex(text),
        'phone_numbers': extract_phone_numbers_regex(text),
        'dates': extract_dates_regex(text),
        'money_amounts': extract_money_amounts_regex(text),
        'addresses': extract_addresses_regex(text),
        'urls': extract_urls_regex(text),
        'percentages': extract_percentages_regex(text),
        'votes': detect_votes_regex(text),
        'speaker_count': count_speakers_simple(sentences) if sentences else None
    }

def get_keyword_frequency(text: str, keywords: List[str]) -> Dict[str, int]:
    """
    Count keyword occurrences using simple counting (not AI)
    
    Args:
        text: Text to search
        keywords: List of keywords to count
    
    Returns:
        Dictionary mapping keyword to count
    """
    text_lower = text.lower()
    return {
        keyword: len(re.findall(r'\b' + re.escape(keyword.lower()) + r'\b', text_lower))
        for keyword in keywords
    }

def extract_action_items_regex(text: str) -> List[str]:
    """
    Simple action item extraction using patterns
    
    Args:
        text: Text to search
    
    Returns:
        List of potential action items
    """
    action_patterns = [
        r'(?:need to|must|should|will|shall)\s+([^.!?]{10,100})',
        r'(?:action item|to do|task):\s*([^.!?]{10,100})',
        r'([A-Z][^.!?]*(?:by|before|until)\s+(?:next|the)\s+\w+[^.!?]*[.!?])'
    ]
    
    action_items = []
    for pattern in action_patterns:
        matches = re.findall(pattern, text, re.IGNORECASE)
        action_items.extend([m.strip() for m in matches if len(m.strip()) > 10])
    
    return list(set(action_items))[:20]  # Limit to top 20
