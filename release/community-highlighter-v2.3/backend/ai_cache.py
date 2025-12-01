"""
AI Response Caching System
Saves 50% on AI costs by caching results
"""

import hashlib
import json
import os
from datetime import datetime, timedelta
from typing import Any, Optional, Callable

CACHE_DIR = './ai_cache'
CACHE_DURATION_DAYS = 30

def ensure_cache_dir():
    """Create cache directory if it doesn't exist"""
    os.makedirs(CACHE_DIR, exist_ok=True)

def get_cache_key(video_id: str, analysis_type: str, extra_params: dict = None) -> str:
    """
    Generate unique cache key
    
    Args:
        video_id: YouTube video ID
        analysis_type: Type of analysis (e.g., 'entities', 'summary', 'topics')
        extra_params: Additional parameters that affect the result
    
    Returns:
        MD5 hash key
    """
    key_parts = [video_id, analysis_type]
    if extra_params:
        key_parts.append(json.dumps(extra_params, sort_keys=True))
    
    key_string = "_".join(key_parts)
    return hashlib.md5(key_string.encode()).hexdigest()

def get_cached_result(video_id: str, analysis_type: str, extra_params: dict = None) -> Optional[Any]:
    """
    Retrieve cached result if available and not expired
    
    Args:
        video_id: YouTube video ID
        analysis_type: Type of analysis
        extra_params: Additional parameters
    
    Returns:
        Cached result or None
    """
    ensure_cache_dir()
    cache_key = get_cache_key(video_id, analysis_type, extra_params)
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json")
    
    if not os.path.exists(cache_file):
        return None
    
    # Check if cache is expired
    file_age = datetime.now() - datetime.fromtimestamp(os.path.getmtime(cache_file))
    if file_age > timedelta(days=CACHE_DURATION_DAYS):
        print(f"🗑️  Cache expired for {analysis_type}")
        os.remove(cache_file)
        return None
    
    try:
        with open(cache_file, 'r', encoding='utf-8') as f:
            cached_data = json.load(f)
            print(f"✅ Cache hit for {analysis_type} (video: {video_id[:8]}...)")
            return cached_data['result']
    except Exception as e:
        print(f"⚠️  Cache read error: {e}")
        return None

def save_to_cache(video_id: str, analysis_type: str, result: Any, extra_params: dict = None):
    """
    Save analysis result to cache
    
    Args:
        video_id: YouTube video ID
        analysis_type: Type of analysis
        result: Result to cache
        extra_params: Additional parameters
    """
    ensure_cache_dir()
    cache_key = get_cache_key(video_id, analysis_type, extra_params)
    cache_file = os.path.join(CACHE_DIR, f"{cache_key}.json")
    
    try:
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump({
                'result': result,
                'cached_at': datetime.now().isoformat(),
                'video_id': video_id,
                'analysis_type': analysis_type
            }, f, indent=2)
        print(f"💾 Cached {analysis_type} for {video_id[:8]}...")
    except Exception as e:
        print(f"⚠️  Cache write error: {e}")

def cached_ai_analysis(
    video_id: str,
    analysis_type: str,
    analysis_function: Callable,
    extra_params: dict = None,
    force_refresh: bool = False
) -> Any:
    """
    Wrapper for AI analysis with automatic caching
    
    Args:
        video_id: YouTube video ID
        analysis_type: Type of analysis
        analysis_function: Function that performs the analysis
        extra_params: Additional parameters affecting the result
        force_refresh: If True, ignore cache and recompute
    
    Returns:
        Analysis result (from cache or fresh)
    
    Example:
        result = cached_ai_analysis(
            video_id='abc123',
            analysis_type='entities',
            analysis_function=lambda: extract_entities(transcript)
        )
    """
    # Try cache first (unless force refresh)
    if not force_refresh:
        cached = get_cached_result(video_id, analysis_type, extra_params)
        if cached is not None:
            return cached
    
    # Not cached or force refresh - run analysis
    print(f"🔄 Running fresh {analysis_type} analysis for {video_id[:8]}...")
    result = analysis_function()
    
    # Cache the result
    save_to_cache(video_id, analysis_type, result, extra_params)
    
    return result

def clear_cache(video_id: str = None, analysis_type: str = None):
    """
    Clear cache entries
    
    Args:
        video_id: If provided, only clear this video's cache
        analysis_type: If provided, only clear this type
    """
    ensure_cache_dir()
    
    if not video_id and not analysis_type:
        # Clear all cache
        for file in os.listdir(CACHE_DIR):
            os.remove(os.path.join(CACHE_DIR, file))
        print("🗑️  Cleared all cache")
    else:
        # Clear specific entries
        count = 0
        for file in os.listdir(CACHE_DIR):
            file_path = os.path.join(CACHE_DIR, file)
            try:
                with open(file_path, 'r') as f:
                    data = json.load(f)
                    if (not video_id or data.get('video_id') == video_id) and \
                       (not analysis_type or data.get('analysis_type') == analysis_type):
                        os.remove(file_path)
                        count += 1
            except:
                pass
        print(f"🗑️  Cleared {count} cache entries")

def get_cache_stats() -> dict:
    """
    Get cache statistics
    
    Returns:
        Dictionary with cache stats
    """
    ensure_cache_dir()
    
    total_files = 0
    total_size = 0
    by_type = {}
    
    for file in os.listdir(CACHE_DIR):
        file_path = os.path.join(CACHE_DIR, file)
        total_files += 1
        total_size += os.path.getsize(file_path)
        
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                analysis_type = data.get('analysis_type', 'unknown')
                by_type[analysis_type] = by_type.get(analysis_type, 0) + 1
        except:
            pass
    
    return {
        'total_entries': total_files,
        'total_size_mb': round(total_size / (1024 * 1024), 2),
        'by_type': by_type
    }
