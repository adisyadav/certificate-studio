from pathlib import Path
from typing import Dict, List, Optional
from fontTools.ttLib import TTFont
from PIL import ImageFont

from app.schemas.typography import FontInfo, GlyphCheckResult


class FontNotFoundError(Exception):
    pass


class FontService:
    FONTS_DIR: Path = Path(__file__).resolve().parent.parent / "assets" / "fonts"

    REGISTRY: Dict[str, Dict[str, str]] = {
        "great_vibes": {
            "name": "Great Vibes",
            "category": "Calligraphic Script",
            "filename": "GreatVibes-Regular.ttf",
        },
        "allura": {
            "name": "Allura",
            "category": "Formal Script",
            "filename": "Allura-Regular.ttf",
        },
        "alex_brush": {
            "name": "Alex Brush",
            "category": "Classic Script",
            "filename": "AlexBrush-Regular.ttf",
        },
        "cinzel": {
            "name": "Cinzel",
            "category": "Classic Serif",
            "filename": "Cinzel-Regular.ttf",
        },
        "eb_garamond": {
            "name": "EB Garamond",
            "category": "Readable Serif",
            "filename": "EBGaramond-Regular.ttf",
        },
    }

    _ttfont_cache: Dict[str, TTFont] = {}
    _cmap_cache: Dict[str, set] = {}

    @classmethod
    def list_fonts(cls) -> List[FontInfo]:
        """Return list of all registered fonts."""
        result: List[FontInfo] = []
        for font_id, meta in cls.REGISTRY.items():
            result.append(
                FontInfo(
                    id=font_id,
                    name=meta["name"],
                    category=meta["category"],
                    filename=meta["filename"],
                )
            )
        return result

    @classmethod
    def get_font_path(cls, font_id: str) -> Path:
        """Resolve font file path from registered font ID."""
        if font_id not in cls.REGISTRY:
            raise FontNotFoundError(f"Font ID '{font_id}' is not a registered font.")

        path = cls.FONTS_DIR / cls.REGISTRY[font_id]["filename"]
        if not path.exists():
            raise FontNotFoundError(f"Font file '{path.name}' not found on server.")

        return path

    @classmethod
    def get_ttfont(cls, font_id: str) -> TTFont:
        """Get or cache TTFont object for fast glyph coverage lookups."""
        if font_id not in cls._ttfont_cache:
            font_path = cls.get_font_path(font_id)
            cls._ttfont_cache[font_id] = TTFont(str(font_path))
        return cls._ttfont_cache[font_id]

    @classmethod
    def get_glyph_codepoints(cls, font_id: str) -> set:
        """Get set of supported unicode codepoints."""
        if font_id not in cls._cmap_cache:
            ttfont = cls.get_ttfont(font_id)
            cmap = ttfont.getBestCmap()
            cls._cmap_cache[font_id] = set(cmap.keys()) if cmap else set()
        return cls._cmap_cache[font_id]

    @classmethod
    def check_glyphs(cls, font_id: str, text: str) -> GlyphCheckResult:
        """Check whether every non-whitespace character in text has a glyph in the font."""
        supported_codepoints = cls.get_glyph_codepoints(font_id)
        unsupported: List[str] = []

        for ch in text:
            if ch.isspace():
                continue
            codepoint = ord(ch)
            if codepoint not in supported_codepoints and ch not in unsupported:
                unsupported.append(ch)

        return GlyphCheckResult(
            supported=len(unsupported) == 0,
            unsupported_chars=unsupported,
        )

    @classmethod
    def load_pillow_font(cls, font_id: str, size: int) -> ImageFont.FreeTypeFont:
        """Load Pillow FreeTypeFont at specified size."""
        font_path = cls.get_font_path(font_id)
        return ImageFont.truetype(str(font_path), size=size)
