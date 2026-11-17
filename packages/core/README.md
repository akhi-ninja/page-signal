# @pagesignal/core
MIT, prerelease 0.1.0. Import extractPage from this package in a Node.js server.
Pass { image, text } and { apiKey, model }. image must be a rendered JPEG data URL.
The existing browser app converts PDFs to page images and performs local OCR.
This engine exposes the existing page extraction workflow. Caller supplies access control,
storage, accounting, and orchestration. Responses include the detected type, fields and tables.
