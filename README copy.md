# PageSignal

PageSignal turns scanned PDFs and images into structured JSON. It supports browser-based OCR and optional OpenAI vision extraction for page-level document classification, fields, checkboxes, and tables.

## Deploy on Vercel

1. Import this repository into Vercel. The included configuration serves the web UI and two server-side functions.
2. Keep Vercel Deployment Protection enabled on every domain where a paid API key is configured. The extraction endpoint relies on the hosting access boundary.
3. Set `OPENAI_API_KEY` as a server-side environment variable. Optionally set `OPENAI_DOCUMENT_MODEL` to another compatible vision model with Structured Outputs.
4. Deploy, enable **Use OpenAI vision extraction**, and select **Try sample documents**.

## Local OCR

From this directory, run `python3 -m http.server 8000 --directory web` and open http://localhost:8000. For local AI extraction use `vercel dev` with the server-side environment variable configured. OCR and PDF libraries load from their package CDN.

Local OCR processes document content in the tab. AI mode sends page images and OCR text to OpenAI. Review extracted data before export, especially dense tables, handwriting, and low-quality scans.

MIT licensed.
