#!/usr/bin/env python3
"""
Certificate Studio — Benchmark Script
Measures performance, peak memory usage, and throughput across batch sizes (20, 100, 500).
Usage:
    python backend/scripts/benchmark_exports.py [--sizes 20 100 500]
"""

import argparse
import io
import os
import sys
import time
import tracemalloc
from pathlib import Path
from PIL import Image

# Ensure backend root is on sys.path
backend_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_root))

from app.schemas.job import TemplateMetadata, TemplateOrientation, ParticipantRecord
from app.schemas.placement import PlacementRegion
from app.schemas.typography import TypographyConfig, SizingMode
from app.services.job_service import JobService
from app.services.batch_generation_service import BatchGenerationService
from app.services.typography_service import TypographyService


NAMES_POOL = [
    "Ada Lovelace",
    "Alan Turing",
    "Grace Hopper",
    "Katherine Johnson",
    "Claude Shannon",
    "Margaret Hamilton",
    "Donald Knuth",
    "John von Neumann",
    "Barbara Liskov",
    "Tim Berners-Lee",
    "Linus Torvalds",
    "Ken Thompson",
    "Dennis Ritchie",
    "Guido van Rossum",
    "Bjarne Stroustrup",
    "James Gosling",
    "Brendan Eich",
    "Niklaus Wirth",
    "Leslie Lamport",
    "Edsger Dijkstra",
    "Radia Perlman",
    "Vint Cerf",
    "Steve Wozniak",
    "Sister Mary Kenneth Keller",
    "Frances Allen",
    "Shafi Goldwasser",
    "Silvio Micali",
    "Whitfield Diffie",
    "Martin Hellman",
    "Ralph Merkle",
]


def generate_names(count: int) -> list:
    names = []
    pool_len = len(NAMES_POOL)
    for i in range(count):
        base = NAMES_POOL[i % pool_len]
        suffix = f" {i // pool_len + 1}" if i >= pool_len else ""
        names.append(f"{base}{suffix}")
    return names


def run_benchmark(batch_size: int, width: int = 1200, height: int = 800) -> dict:
    print(f"\n--- Running Benchmark for Batch Size: {batch_size} ---")
    tracemalloc.start()
    start_time = time.perf_counter()

    # 1. Create a job
    job = JobService.create_job()
    job_id = job.job_id
    job_dir = JobService.get_job_dir(job_id)

    # 2. Create template PNG
    img = Image.new("RGB", (width, height), color=(250, 248, 245))
    template_path = job_dir / "template_original.png"
    img.save(template_path, format="PNG")
    template_meta = TemplateMetadata(
        filename="template_original.png",
        format="PNG",
        width=width,
        height=height,
        aspect_ratio=round(width / height, 3),
        orientation=TemplateOrientation.LANDSCAPE,
        file_size_bytes=template_path.stat().st_size,
        preview_url=f"/api/jobs/{job_id}/preview",
    )
    JobService.update_template(job_id, template_meta)

    # 3. Create CSV with participants
    names = generate_names(batch_size)
    csv_lines = ["Name,Email"]
    for i, n in enumerate(names, start=1):
        csv_lines.append(f"{n},participant{i}@example.com")
    raw_csv = "\n".join(csv_lines).encode("utf-8")

    from app.schemas.job import CsvSummary
    participants = [
        ParticipantRecord(row_number=i, name=n, is_valid=True)
        for i, n in enumerate(names, start=1)
    ]
    summary = CsvSummary(
        filename="participants.csv",
        total_rows=batch_size,
        valid_count=batch_size,
        invalid_count=0,
        duplicate_count=0,
        headers=["Name", "Email"],
        candidate_name_columns=["Name"],
        selected_name_column="Name",
    )
    JobService.update_csv(job_id, summary, participants, raw_csv)

    # 4. Placement & Typography
    placement = PlacementRegion(x=0.15, y=0.45, width=0.7, height=0.14)
    JobService.save_placement(job_id, placement)

    config = TypographyConfig(
        font_id="great_vibes",
        preferred_font_size=52,
        min_font_size=18,
        sizing_mode=SizingMode.SMART_CONSISTENT,
        text_color="#111827",
    )
    JobService.save_typography_config(job_id, config)

    # 5. Start batch export and wait until completed
    exp = BatchGenerationService.start_batch_export(job_id)
    export_id = exp.export_id

    while True:
        time.sleep(0.05)
        status = BatchGenerationService.get_export_status(job_id, export_id)
        if status.status.value in ["completed", "failed"]:
            break

    elapsed_time = time.perf_counter() - start_time
    current_mem, peak_mem = tracemalloc.get_traced_memory()
    tracemalloc.stop()

    if status.status.value == "failed":
        print(f"FAILED: {status.error_message}")
        return {"status": "failed", "error": status.error_message}

    zip_path = BatchGenerationService.get_export_zip_path(job_id, export_id)
    zip_size_bytes = zip_path.stat().st_size
    zip_size_mb = zip_size_bytes / (1024 * 1024)
    peak_mem_mb = peak_mem / (1024 * 1024)
    sec_per_cert = elapsed_time / batch_size

    print(f"Results for {batch_size} certificates:")
    print(f"  Total Elapsed Time: {elapsed_time:.2f} seconds")
    print(f"  Average Time/Cert:  {sec_per_cert * 1000:.1f} ms/cert")
    print(f"  Peak Memory Usage:  {peak_mem_mb:.2f} MB")
    print(f"  ZIP Output Size:    {zip_size_mb:.2f} MB ({zip_size_bytes} bytes)")
    print(f"  Throughput:         {batch_size / elapsed_time:.1f} certificates/second")

    return {
        "status": "success",
        "batch_size": batch_size,
        "elapsed_seconds": round(elapsed_time, 2),
        "ms_per_cert": round(sec_per_cert * 1000, 1),
        "peak_memory_mb": round(peak_mem_mb, 2),
        "zip_size_mb": round(zip_size_mb, 2),
        "throughput_cert_per_sec": round(batch_size / elapsed_time, 1),
    }


def main():
    parser = argparse.ArgumentParser(description="Benchmark Certificate Studio Exports")
    parser.add_argument("--sizes", nargs="+", type=int, default=[20, 100, 500])
    args = parser.parse_args()

    results = []
    for size in args.sizes:
        res = run_benchmark(size)
        results.append(res)

    print("\n=======================================================")
    print("               BENCHMARK SUMMARY MATRIX                ")
    print("=======================================================")
    print(f"{'Batch':<8} | {'Total (s)':<10} | {'ms / cert':<10} | {'Peak RAM':<10} | {'ZIP Size':<10} | {'Throughput':<12}")
    print("-" * 75)
    for r in results:
        if r.get("status") == "success":
            print(
                f"{r['batch_size']:<8} | {r['elapsed_seconds']:<10.2f} | {r['ms_per_cert']:<10.1f} | "
                f"{r['peak_memory_mb']:<7.2f} MB | {r['zip_size_mb']:<7.2f} MB | {r['throughput_cert_per_sec']:<8.1f} cert/s"
            )
        else:
            print(f"{r.get('batch_size', '?'):<8} | FAILED")
    print("=======================================================\n")


if __name__ == "__main__":
    main()
