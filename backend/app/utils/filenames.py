import re
import unicodedata
from typing import Dict, List, Set


def sanitize_filename_base(name: str, max_length: int = 100) -> str:
    """
    Sanitize a participant's name for safe use as a filename on macOS, Windows, and Linux.
    - Normalizes unicode characters (NFC).
    - Removes dangerous path characters, null bytes, slashes, backslashes, colons, control chars.
    - Strips leading/trailing dots and whitespace.
    - Falls back to 'Certificate' if empty.
    - Limits base length to prevent filesystem errors.
    """
    if not name or not name.strip():
        return "Certificate"

    # Normalize unicode
    clean = unicodedata.normalize("NFC", name.strip())

    # Replace invalid filesystem characters: / \ : * ? " < > | \0 and control chars
    clean = re.sub(r'[\/\\:\*\?"<>\|\x00-\x1f]', "_", clean)

    # Collapse repeated underscores or whitespace
    clean = re.sub(r"\s+", " ", clean)
    clean = re.sub(r"_+", "_", clean)

    # Strip dots, underscores, and spaces from both ends (prevents hidden files or invalid Windows filenames)
    clean = clean.strip(". _")

    # Windows reserved names check (CON, PRN, AUX, NUL, COM1..9, LPT1..9)
    reserved = {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    }
    if clean.upper() in reserved:
        clean = f"Certificate_{clean}"

    if not clean:
        clean = "Certificate"

    # Limit length
    if len(clean) > max_length:
        clean = clean[:max_length].rstrip(". _")

    return clean or "Certificate"


class FilenameGenerator:
    """
    Deterministic participant-based filename generator with duplicate resolution.
    Format:
      - 'Aarav Sharma.pdf'
      - 'Aarav Sharma (2).pdf'
      - 'Aarav Sharma (3).pdf'
    Case-insensitive collision detection prevents OS-specific overwrites (e.g., macOS/Windows APFS/NTFS).
    """

    def __init__(self):
        self._used_lower_names: Set[str] = set()
        self._name_counts: Dict[str, int] = {}

    def get_pdf_filename(self, participant_name: str) -> str:
        base = sanitize_filename_base(participant_name)
        lower_base = base.lower()

        if lower_base not in self._name_counts:
            self._name_counts[lower_base] = 1
            filename = f"{base}.pdf"
        else:
            self._name_counts[lower_base] += 1
            count = self._name_counts[lower_base]
            filename = f"{base} ({count}).pdf"

        # Double check case-insensitive uniqueness
        while filename.lower() in self._used_lower_names:
            self._name_counts[lower_base] += 1
            count = self._name_counts[lower_base]
            filename = f"{base} ({count}).pdf"

        self._used_lower_names.add(filename.lower())
        return filename
