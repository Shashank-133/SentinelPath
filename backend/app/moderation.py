import re
from typing import Tuple, List, Optional

# Rule-based moderation blocklists and regex rules
PROF_BLOCKLIST = {
    "spam", "fake", "test", "nonsense", "placeholder", "garbage", 
    "abuse", "slur", "bitch", "fuck", "shit", "asshole", "idiot"
}

REPETITIVE_CHAR_REGEX = re.compile(r'(.)\1{4,}')  # Any character repeated 5 or more times (e.g. "aaaaa" or "!!!!!")
HTML_TAGS_REGEX = re.compile(r'<[^>]*>')          # Basic HTML tags check

def moderate_report(category: str, description: Optional[str]) -> Tuple[bool, List[str]]:
    """
    Moderates a safety report description and category.
    Returns:
        (is_approved: bool, reasons_for_rejection: List[str])
    """
    reasons = []
    
    # 1. Category validation
    valid_categories = {"poor_lighting", "harassment", "suspicious_activity", "other"}
    if category not in valid_categories:
        reasons.append(f"Invalid category '{category}'. Must be one of {valid_categories}")

    # If description is empty, it's fine (anonymous pin drop)
    if not description or not description.strip():
        # Approve coordinate-only submissions
        return len(reasons) == 0, reasons

    desc = description.strip()

    # 2. Length check
    if len(desc) < 5:
        reasons.append("Description is too short (minimum 5 characters).")
    if len(desc) > 500:
        reasons.append("Description is too long (maximum 500 characters).")

    # 3. Profanity/Junk Word blocklist check
    # Tokenize input words
    words = set(re.findall(r'\b[a-zA-Z]+\b', desc.lower()))
    triggered_blocked = words.intersection(PROF_BLOCKLIST)
    if triggered_blocked:
        reasons.append(f"Blocked words found: {', '.join(triggered_blocked)}")

    # 4. Repetitive character check
    if REPETITIVE_CHAR_REGEX.search(desc):
        reasons.append("Contains excessive repetitive characters (e.g., 'aaaaa' or '!!!!!').")

    # 5. All Caps check (Spam/Shouting check)
    # Count total letters vs uppercase letters
    letters = [c for c in desc if c.isalpha()]
    if letters:
        uppercase_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
        if uppercase_ratio > 0.8 and len(letters) > 10:
            reasons.append("Description contains too much uppercase text (all-caps spam).")

    # 6. HTML Injection check
    if HTML_TAGS_REGEX.search(desc):
        reasons.append("HTML tags or code scripts are not allowed in description.")

    return len(reasons) == 0, reasons
