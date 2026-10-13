import asyncio
import os
import zipfile
import fitz  # PyMuPDF
from playwright.async_api import async_playwright

FIXTURES_DIR = os.path.abspath("tests/fixtures")
ARTIFACTS_DIR = os.path.abspath("test-artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

TEMPLATE_PATH = os.path.join(FIXTURES_DIR, "sample_template.png")
CSV_PATH = os.path.join(FIXTURES_DIR, "sample_participants.csv")

assert os.path.exists(TEMPLATE_PATH), f"Fixture not found: {TEMPLATE_PATH}"
assert os.path.exists(CSV_PATH), f"Fixture not found: {CSV_PATH}"

async def run_e2e_workflow():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1440, "height": 900}, accept_downloads=True)
        page = await context.new_page()

        print("[E2E] 1. Opening Certificate Studio...")
        await page.goto("http://localhost:5173")
        await page.wait_for_selector("text=Certificate Studio")
        await page.wait_for_timeout(1000)

        print("[E2E] 2. Testing New Project creation & dialog handling...")
        page.on("dialog", lambda dialog: asyncio.create_task(dialog.accept()))
        new_project_btn = page.locator("button:has-text('New Project')")
        await new_project_btn.click()
        await page.wait_for_timeout(1500)

        print("[E2E] 3. Uploading self-contained Certificate Template and CSV...")
        file_inputs = page.locator("input[type='file']")
        await file_inputs.nth(0).set_input_files(TEMPLATE_PATH)
        await page.wait_for_timeout(1500)

        # Confirm template thumbnail loaded (Ready indicator visible)
        await page.wait_for_selector("text=Ready", timeout=5000)
        img_element = page.locator("img[alt='Certificate template preview']")
        assert await img_element.is_visible(), "Template preview image must be visible"

        await file_inputs.nth(1).set_input_files(CSV_PATH)
        await page.wait_for_timeout(1500)

        print("[E2E] 4. Capturing Upload screen (1440px)...")
        await page.screenshot(path=os.path.join(ARTIFACTS_DIR, "e2e_upload_1440.png"), full_page=True)

        print("[E2E] 5. Checking responsive layouts (1280px, 1024px, 768px)...")
        for w, h in [(1280, 800), (1024, 768), (768, 1024)]:
            await page.set_viewport_size({"width": w, "height": h})
            await page.wait_for_timeout(400)
            await page.screenshot(path=os.path.join(ARTIFACTS_DIR, f"e2e_upload_{w}.png"), full_page=True)

        await page.set_viewport_size({"width": 1440, "height": 900})
        await page.wait_for_timeout(400)

        print("[E2E] 6. Navigating to Visual Editor...")
        continue_edit_btn = page.locator("button:has-text('Continue to Edit')")
        await continue_edit_btn.click()
        await page.wait_for_timeout(2000)

        print("[E2E] 7. Testing font switching (Alex Brush, Allura, Great Vibes)...")
        font_select = page.locator("label:has-text('Font Family') + select")
        await font_select.select_option(value="alex_brush")
        await page.wait_for_timeout(600)
        await font_select.select_option(value="allura")
        await page.wait_for_timeout(600)
        await font_select.select_option(value="great_vibes")
        await page.wait_for_timeout(600)

        print("[E2E] 8. Testing Preview Mode toggle...")
        preview_btn = page.locator("button:has-text('Preview')")
        await preview_btn.click()
        await page.wait_for_timeout(800)
        await page.screenshot(path=os.path.join(ARTIFACTS_DIR, "e2e_editor_preview.png"), full_page=True)
        
        exit_preview_btn = page.locator("button:has-text('Exit Preview')")
        await exit_preview_btn.click()
        await page.wait_for_timeout(500)

        print("[E2E] 9. Running Perfect Fit All Names...")
        fit_btn = page.locator("button:has-text('Perfect Fit All Names')")
        await fit_btn.click()
        await page.wait_for_timeout(2000)
        await page.screenshot(path=os.path.join(ARTIFACTS_DIR, "e2e_editor_fitted.png"), full_page=True)

        print("[E2E] 10. Saving template as reusable preset...")
        save_tpl_btn = page.locator("button:has-text('Save Template')")
        await save_tpl_btn.click()
        await page.wait_for_selector("text=Save Template Preset", timeout=3000)
        preset_input = page.locator("input[placeholder*='Annual']")
        await preset_input.fill("E2E Automated Preset")
        modal_save_btn = page.locator("button[type='submit']:has-text('Save Preset')")
        await modal_save_btn.click()
        await page.wait_for_selector("text=Template saved as \"E2E Automated Preset\"", timeout=5000)

        print("[E2E] 11. Navigating to Export Screen...")
        continue_export = page.locator("button:has-text('Continue to Export')")
        await continue_export.click()
        await page.wait_for_timeout(2000)

        print("[E2E] 12. Generating batch certificates and downloading ZIP...")
        gen_btn = page.locator("button:has-text('Generate Certificates')")
        if not await gen_btn.is_visible():
            gen_btn = page.locator("button:has-text('Regenerate Batch')")
        await gen_btn.click()

        await page.wait_for_selector("text=Ready for Download", timeout=25000)
        await page.wait_for_timeout(1000)
        download_link = page.locator("a:has-text('Download certificates.zip')")
        assert await download_link.is_visible(), "Download button must be visible"

        # Intercept and download file
        download_path = os.path.join(ARTIFACTS_DIR, "e2e_certificates.zip")
        async with page.expect_download() as download_info:
            await download_link.click()
        download = await download_info.value
        await download.save_as(download_path)
        assert os.path.exists(download_path), "Downloaded ZIP must exist on disk"
        print(f"[E2E] Downloaded ZIP saved to {download_path} ({os.path.getsize(download_path)} bytes)")

        print("[E2E] 13. Verifying downloaded ZIP contents and opening all PDFs with PyMuPDF...")
        with zipfile.ZipFile(download_path, 'r') as zf:
            zip_names = zf.namelist()
            pdf_names = [n for n in zip_names if n.lower().endswith('.pdf')]
            print(f"[E2E] Found {len(pdf_names)} PDFs inside ZIP: {pdf_names}")
            assert len(pdf_names) == 5, f"Expected 5 participant PDFs, found {len(pdf_names)}"

            for pdf_name in pdf_names:
                pdf_bytes = zf.read(pdf_name)
                assert len(pdf_bytes) > 0, f"PDF {pdf_name} should not be empty"
                # Open with PyMuPDF to verify validity
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
                assert doc.page_count == 1, f"Expected 1 page in {pdf_name}, got {doc.page_count}"
                page0 = doc[0]
                rect = page0.rect
                print(f"      Verified valid PDF: {pdf_name} ({rect.width}x{rect.height})")
                doc.close()

        print("[E2E] 14. Testing page reload session recovery...")
        await page.reload()
        await page.wait_for_timeout(2000)
        assert await page.locator("text=Export Certificates").is_visible(), "Session should restore on Export tab"
        assert await page.locator("text=Configuration Summary").is_visible(), "Configuration Summary must be intact"

        print("[E2E] 15. Testing New Project and reusing saved template preset...")
        new_project_btn2 = page.locator("button:has-text('New Project')")
        await new_project_btn2.click()
        await page.wait_for_timeout(2000)

        # Check saved templates section has our preset
        await page.wait_for_selector("text=E2E Automated Preset", timeout=5000)
        use_template_btn = page.locator("button:has-text('Use Template')").first
        await use_template_btn.click()
        await page.wait_for_timeout(2000)

        # Confirm template is loaded and CSV prompt is visible
        assert await page.locator("text=Upload participant CSV").is_visible(), "CSV upload must be prompt"
        img_reused = page.locator("img[alt='Certificate template preview']")
        assert await img_reused.is_visible(), "Reused template preview image must be visible"

        print("[E2E] All browser tests and verifications passed successfully!")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(run_e2e_workflow())
