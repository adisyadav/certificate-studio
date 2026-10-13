import zipfile
import json
from pathlib import Path
from typing import List, Tuple


class ZipPackagingError(Exception):
    pass


class ZipService:
    """
    Service for bundling generated certificate PDFs and the generation report into certificates.zip.
    Ensures safe archive generation with atomic publication.
    """

    @classmethod
    def create_certificates_zip(
        cls,
        pdf_files: List[Tuple[Path, str]],  # List of (absolute_source_path, archive_filename)
        generation_report_json: str,
        output_zip_path: Path,
    ) -> int:
        """
        Creates a verified ZIP archive containing:
        - All generated participant PDFs with sanitized, unique filenames.
        - generation_report.json
        Writes to a temporary file first, validates integrity, and atomically moves to output_zip_path.
        Returns the final size of the ZIP in bytes.
        """
        if not pdf_files:
            raise ZipPackagingError("Cannot create ZIP: No PDF files to bundle.")

        temp_zip_path = output_zip_path.parent / f"{output_zip_path.name}.tmp"
        temp_zip_path.parent.mkdir(parents=True, exist_ok=True)

        try:
            with zipfile.ZipFile(
                temp_zip_path, mode="w", compression=zipfile.ZIP_DEFLATED, compresslevel=6
            ) as zf:
                # Add each PDF
                seen_archive_names = set()
                for src_path, archive_name in pdf_files:
                    if not src_path.exists():
                        raise ZipPackagingError(f"PDF source file missing: {src_path}")

                    # Prevent directory traversal or duplicates in ZIP
                    clean_arc_name = Path(archive_name).name
                    if clean_arc_name in seen_archive_names:
                        raise ZipPackagingError(f"Duplicate entry name in ZIP: {clean_arc_name}")
                    seen_archive_names.add(clean_arc_name)

                    zf.write(src_path, arcname=clean_arc_name)

                # Add generation report
                zf.writestr("generation_report.json", generation_report_json)

            # Test archive integrity
            with zipfile.ZipFile(temp_zip_path, mode="r") as zf:
                bad_file = zf.testzip()
                if bad_file:
                    raise ZipPackagingError(f"Corrupt entry detected in created ZIP: {bad_file}")
                
                # Check expected file count (PDFs + 1 report)
                namelist = zf.namelist()
                expected_count = len(pdf_files) + 1
                if len(namelist) != expected_count:
                    raise ZipPackagingError(
                        f"ZIP file count mismatch: expected {expected_count}, got {len(namelist)}"
                    )

            # Atomic rename to final output path
            if output_zip_path.exists():
                output_zip_path.unlink()
            temp_zip_path.replace(output_zip_path)

            return output_zip_path.stat().st_size

        except Exception as e:
            if temp_zip_path.exists():
                temp_zip_path.unlink()
            raise ZipPackagingError(f"Failed to create certificates ZIP: {e}")
