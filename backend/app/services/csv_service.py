import csv
import io
from typing import List, Dict, Optional, Tuple
from app.config import settings
from app.schemas.job import ParticipantRecord, CsvSummary


class CsvProcessingError(Exception):
    """Raised when CSV parsing or validation fails."""
    pass


# Candidate patterns for participant name headers (case-insensitive)
NAME_HEADER_KEYWORDS = [
    "name",
    "full_name",
    "fullname",
    "participant",
    "participant_name",
    "student_name",
    "attendee",
    "attendee_name",
    "recipient",
    "recipient_name",
]


class CsvService:
    @classmethod
    def detect_candidate_name_columns(cls, headers: List[str]) -> List[str]:
        candidates: List[str] = []
        for header in headers:
            clean = header.strip().lower().replace(" ", "_").replace("-", "_")
            if any(kw == clean or kw in clean for kw in NAME_HEADER_KEYWORDS):
                candidates.append(header)
        return candidates

    @classmethod
    def parse_csv(
        cls,
        file_bytes: bytes,
        filename: str,
        preferred_name_column: Optional[str] = None,
    ) -> Tuple[CsvSummary, List[ParticipantRecord]]:
        file_size = len(file_bytes)
        if file_size == 0:
            raise CsvProcessingError("Uploaded CSV file is empty.")

        if file_size > settings.max_csv_size_bytes:
            raise CsvProcessingError(
                f"CSV file size exceeds the allowed limit of {settings.max_csv_size_bytes // (1024 * 1024)}MB."
            )

        # Handle UTF-8 and UTF-8-BOM safely
        try:
            # utf-8-sig automatically strips BOM if present
            decoded_text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError as e:
            raise CsvProcessingError(
                f"CSV encoding error: File must be UTF-8 encoded ({str(e)})."
            )

        lines = decoded_text.splitlines()
        # Filter out trailing/leading empty newlines to assess actual content
        non_empty_lines = [line for line in lines if line.strip()]
        if not non_empty_lines:
            raise CsvProcessingError("CSV file contains no data rows.")

        try:
            stream = io.StringIO(decoded_text)
            reader = csv.reader(stream)
            raw_rows = list(reader)
        except Exception as e:
            raise CsvProcessingError(f"Malformed CSV data: {str(e)}")

        if not raw_rows:
            raise CsvProcessingError("CSV file contains no rows.")

        raw_headers = raw_rows[0]
        # Clean headers while preserving original casing
        headers = [h.strip() for h in raw_headers if h is not None]
        if not any(headers):
            raise CsvProcessingError("CSV file has empty header row.")

        data_rows = raw_rows[1:]
        if len(data_rows) > settings.max_csv_rows:
            raise CsvProcessingError(
                f"CSV row count ({len(data_rows)}) exceeds configured limit of {settings.max_csv_rows}."
            )

        candidates = cls.detect_candidate_name_columns(headers)

        # Determine selected name column
        selected_column = preferred_name_column
        if not selected_column:
            if len(candidates) == 1:
                selected_column = candidates[0]
            elif len(candidates) > 1:
                # Prefer exact "name" or "full_name" if present
                for cand in candidates:
                    norm = cand.strip().lower().replace(" ", "_")
                    if norm in ("name", "full_name", "fullname", "participant"):
                        selected_column = cand
                        break
                if not selected_column:
                    # Let the user explicitly choose if ambiguous
                    selected_column = candidates[0]
            elif headers:
                # Fallback to the first column if no candidate match
                selected_column = headers[0]

        summary, records = cls._evaluate_participants(
            filename=filename,
            headers=headers,
            data_rows=data_rows,
            selected_column=selected_column,
            candidates=candidates,
        )

        return summary, records

    @classmethod
    def reevaluate_with_column(
        cls,
        summary: CsvSummary,
        data_rows: List[List[str]],
        column_name: str,
    ) -> Tuple[CsvSummary, List[ParticipantRecord]]:
        if column_name not in summary.headers:
            raise CsvProcessingError(
                f"Column '{column_name}' not found in CSV headers: {summary.headers}"
            )

        return cls._evaluate_participants(
            filename=summary.filename,
            headers=summary.headers,
            data_rows=data_rows,
            selected_column=column_name,
            candidates=summary.candidate_name_columns,
        )

    @classmethod
    def _evaluate_participants(
        cls,
        filename: str,
        headers: List[str],
        data_rows: List[List[str]],
        selected_column: Optional[str],
        candidates: List[str],
    ) -> Tuple[CsvSummary, List[ParticipantRecord]]:
        records: List[ParticipantRecord] = []
        warnings: List[str] = []
        errors: List[str] = []

        if selected_column and selected_column in headers:
            col_index = headers.index(selected_column)
        else:
            col_index = 0 if headers else -1

        name_occurrences: Dict[str, int] = {}
        valid_count = 0
        invalid_count = 0
        duplicate_count = 0

        # Pass 1: Count name frequencies for accurate duplicate detection (case-insensitive for duplicate check, keep original capitalization)
        for row in data_rows:
            if not row or not any(cell.strip() for cell in row):
                continue
            if 0 <= col_index < len(row):
                raw_name = row[col_index].strip()
                if raw_name:
                    normalized = raw_name.lower()
                    name_occurrences[normalized] = name_occurrences.get(normalized, 0) + 1

        # Pass 2: Build records with row numbers (1-indexed CSV row, row 1 is header, data starts at row 2)
        for idx, row in enumerate(data_rows, start=2):
            is_blank_row = not row or not any(cell.strip() for cell in row)
            if is_blank_row:
                invalid_count += 1
                records.append(
                    ParticipantRecord(
                        row_number=idx,
                        name="",
                        extra_fields={},
                        is_valid=False,
                        is_duplicate=False,
                        validation_errors=["Empty row in CSV."],
                    )
                )
                continue

            # Extract fields
            extra_fields: Dict[str, str] = {}
            for h_idx, h_name in enumerate(headers):
                if h_idx < len(row):
                    extra_fields[h_name] = row[h_idx].strip()
                else:
                    extra_fields[h_name] = ""

            row_errors: List[str] = []
            name_val = ""
            if 0 <= col_index < len(row):
                name_val = row[col_index].strip()

            if not name_val:
                row_errors.append(f"Missing participant name in column '{selected_column}'.")

            is_dup = False
            if name_val:
                if name_occurrences.get(name_val.lower(), 0) > 1:
                    is_dup = True
                    duplicate_count += 1

            is_valid = len(row_errors) == 0
            if is_valid:
                valid_count += 1
            else:
                invalid_count += 1

            records.append(
                ParticipantRecord(
                    row_number=idx,
                    name=name_val,
                    extra_fields=extra_fields,
                    is_valid=is_valid,
                    is_duplicate=is_dup,
                    validation_errors=row_errors,
                )
            )

        if valid_count == 0:
            errors.append("No valid participant records found in the uploaded CSV.")

        if duplicate_count > 0:
            warnings.append(
                f"{duplicate_count} participant rows contain duplicate names. Unique files will be generated without overwriting."
            )

        if invalid_count > 0:
            warnings.append(
                f"{invalid_count} row(s) contain missing names or empty rows and will require attention."
            )

        summary = CsvSummary(
            filename=filename,
            total_rows=len(data_rows),
            valid_count=valid_count,
            invalid_count=invalid_count,
            duplicate_count=duplicate_count,
            headers=headers,
            candidate_name_columns=candidates,
            selected_name_column=selected_column,
            warnings=warnings,
            errors=errors,
        )

        return summary, records
