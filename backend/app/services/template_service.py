import io
from pathlib import Path
from PIL import Image, ImageOps
import fitz  # PyMuPDF
from app.config import settings
from app.schemas.job import TemplateMetadata, TemplateOrientation


# Security: Limit maximum pixels processed by Pillow to prevent decompression bombs
Image.MAX_IMAGE_PIXELS = 100_000_000  # 100M pixels limit


class TemplateProcessingError(Exception):
    """Raised when template validation or processing fails."""
    pass


class TemplateService:
    @staticmethod
    def determine_orientation(width: int, height: int) -> TemplateOrientation:
        ratio = width / height
        if ratio > 1.05:
            return TemplateOrientation.LANDSCAPE
        elif ratio < 0.95:
            return TemplateOrientation.PORTRAIT
        else:
            return TemplateOrientation.SQUARE

    @classmethod
    def process_and_save(
        cls,
        file_bytes: bytes,
        filename: str,
        job_dir: Path,
        job_id: str,
    ) -> TemplateMetadata:
        """
        Validate, save original template, and generate PNG preview.
        Supports PNG, JPG/JPEG, and single-page PDF.
        """
        file_size = len(file_bytes)
        if file_size == 0:
            raise TemplateProcessingError("Uploaded template file is empty.")

        if file_size > settings.max_template_size_bytes:
            raise TemplateProcessingError(
                f"File size exceeds maximum allowed limit of {settings.max_template_size_bytes // (1024 * 1024)}MB."
            )

        suffix = Path(filename).suffix.lower()
        if suffix not in [".png", ".jpg", ".jpeg", ".pdf"]:
            raise TemplateProcessingError(
                "Unsupported file format. Please upload a PNG, JPG, or PDF file."
            )

        is_pdf = suffix == ".pdf" or file_bytes.startswith(b"%PDF-")

        # Create destination file paths
        original_template_path = job_dir / f"template_original{suffix}"
        preview_path = job_dir / "preview.png"

        width: int = 0
        height: int = 0
        detected_format: str = ""

        if is_pdf:
            width, height, detected_format = cls._process_pdf(
                file_bytes, preview_path
            )
        else:
            width, height, detected_format = cls._process_raster_image(
                file_bytes, preview_path
            )

        # Dimension limit check
        if (
            width > settings.max_image_dimension_px
            or height > settings.max_image_dimension_px
        ):
            raise TemplateProcessingError(
                f"Image dimensions ({width}x{height}) exceed maximum allowed dimension of {settings.max_image_dimension_px}px."
            )

        # Save original file untouched
        original_template_path.write_bytes(file_bytes)

        aspect_ratio = round(width / height, 4) if height > 0 else 1.0
        orientation = cls.determine_orientation(width, height)
        preview_url = f"{settings.api_prefix}/jobs/{job_id}/template/preview"

        return TemplateMetadata(
            filename=filename,
            format=detected_format,
            width=width,
            height=height,
            aspect_ratio=aspect_ratio,
            orientation=orientation,
            file_size_bytes=file_size,
            preview_url=preview_url,
        )

    @classmethod
    def _process_raster_image(
        cls, file_bytes: bytes, preview_path: Path
    ) -> tuple[int, int, str]:
        try:
            image_stream = io.BytesIO(file_bytes)
            with Image.open(image_stream) as img:
                img.verify()
        except Image.DecompressionBombError:
            raise TemplateProcessingError(
                "Image rejected: Image decompression bomb detected."
            )
        except Exception as e:
            raise TemplateProcessingError(
                f"Invalid or corrupted image file: {str(e)}"
            )

        # Re-open after verify()
        image_stream.seek(0)
        try:
            with Image.open(image_stream) as img:
                detected_format = img.format.lower() if img.format else "unknown"
                if detected_format not in ["png", "jpeg"]:
                    raise TemplateProcessingError(
                        f"Unsupported raster image format: {detected_format}. Expected PNG or JPEG."
                    )

                # Correct EXIF orientation
                oriented_img = ImageOps.exif_transpose(img)
                if oriented_img is None:
                    oriented_img = img

                # Convert palette/CMYK to RGB/RGBA for browser compatibility
                if oriented_img.mode in ("CMYK", "P", "1"):
                    render_img = oriented_img.convert("RGB")
                elif oriented_img.mode in ("RGBA", "RGB", "L"):
                    render_img = oriented_img
                else:
                    render_img = oriented_img.convert("RGB")

                width, height = render_img.size

                # Save browser-compatible PNG preview
                render_img.save(preview_path, format="PNG", optimize=True)
                return width, height, detected_format.upper()
        except TemplateProcessingError:
            raise
        except Exception as e:
            raise TemplateProcessingError(
                f"Failed to process raster image: {str(e)}"
            )

    @classmethod
    def _process_pdf(
        cls, file_bytes: bytes, preview_path: Path
    ) -> tuple[int, int, str]:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
        except Exception as e:
            raise TemplateProcessingError(
                f"Invalid or corrupted PDF file: {str(e)}"
            )

        try:
            if doc.is_encrypted:
                raise TemplateProcessingError(
                    "Encrypted / password-protected PDFs are not supported. Please remove encryption."
                )

            page_count = doc.page_count
            if page_count == 0:
                raise TemplateProcessingError("PDF contains no pages.")
            if page_count > 1:
                raise TemplateProcessingError(
                    f"Multipage PDFs are not supported in V1. Uploaded PDF has {page_count} pages. Please provide a single-page template."
                )

            page = doc.load_page(0)
            rect = page.rect
            pdf_width_pts = rect.width
            pdf_height_pts = rect.height

            # High-fidelity preview rendering at ~150 DPI (standard print/screen balance)
            # Default PDF point is 1/72 inch; 150/72 ≈ 2.0833
            zoom_factor = 150 / 72.0
            # Clamp rendering zoom if points are unusually large to prevent massive memory usage
            max_pt = max(pdf_width_pts, pdf_height_pts)
            if max_pt * zoom_factor > settings.max_image_dimension_px:
                zoom_factor = settings.max_image_dimension_px / max_pt

            matrix = fitz.Matrix(zoom_factor, zoom_factor)
            pix = page.get_pixmap(matrix=matrix, alpha=False)

            # Store preview
            preview_path.write_bytes(pix.tobytes(output="png"))

            # Effective pixel dimensions of the generated preview/rendering
            width = pix.width
            height = pix.height

            return width, height, "PDF"
        finally:
            doc.close()
