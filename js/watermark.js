/**
 * PDF preview + watermarking utilities.
 *
 * - renderLimitedPreview(): uses pdf.js to render the first N pages of a PDF
 *   onto canvases, with a blur + lock overlay for users who don't yet have access.
 * - downloadWatermarkedPdf(): uses pdf-lib to stamp a subtle, personalized
 *   watermark ("Licensed to <email> - NOUN Summary Hub") onto every page of the
 *   PDF before triggering the browser download, for authorized users.
 *
 * Loaded from CDN on-demand (lazy) to keep initial page weight small.
 */

let pdfjsLibPromise = null;
function loadPdfJs() {
  if (pdfjsLibPromise) return pdfjsLibPromise;
  pdfjsLibPromise = import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs";
    return mod;
  });
  return pdfjsLibPromise;
}

let pdfLibPromise = null;
function loadPdfLib() {
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = import("https://cdn.skypack.dev/pdf-lib@1.17.1?min");
  return pdfLibPromise;
}

/**
 * Renders up to `maxPages` pages of the PDF at `pdfUrl` into `containerEl`.
 * If `locked` is true, pages are blurred and a lock overlay is shown.
 */
export async function renderLimitedPreview(pdfUrl, containerEl, { maxPages = 3, locked = true } = {}) {
  containerEl.innerHTML = `<div class="pdf-preview__loading">Loading preview…</div>`;
  try {
    const pdfjsLib = await loadPdfJs();
    const loadingTask = pdfjsLib.getDocument(pdfUrl);
    const pdf = await loadingTask.promise;
    const pagesToRender = Math.min(maxPages, pdf.numPages);

    containerEl.innerHTML = "";
    for (let i = 1; i <= pagesToRender; i++) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.15 });
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-preview__page" + (locked ? " pdf-preview__page--blurred" : "");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      containerEl.appendChild(canvas);
    }

    if (locked) {
      const overlay = document.createElement("div");
      overlay.className = "pdf-preview__lock-overlay";
      overlay.innerHTML = `
        <div class="pdf-preview__lock-badge">
          🔒 <span>Unlock this course to view the full document</span>
        </div>`;
      containerEl.appendChild(overlay);
    } else if (pdf.numPages > pagesToRender) {
      const more = document.createElement("p");
      more.className = "pdf-preview__more";
      more.textContent = `+ ${pdf.numPages - pagesToRender} more page(s). Use Download to save the full PDF.`;
      containerEl.appendChild(more);
    }
  } catch (err) {
    console.warn("PDF preview failed:", err.message);
    containerEl.innerHTML = `<p class="pdf-preview__error">Preview unavailable right now. You can still download the PDF if you have access.</p>`;
  }
}

/**
 * Fetches the PDF, stamps a subtle personalized watermark on every page,
 * and triggers a browser download. Falls back to a plain download if
 * watermarking fails for any reason (e.g. CORS on the PDF host).
 */
export async function downloadWatermarkedPdf(pdfSource, userEmail, fileName = "course-summary.pdf") {
  const isBlob = typeof Blob !== "undefined" && pdfSource instanceof Blob;
  try {
    const [{ PDFDocument, rgb, degrees, StandardFonts }, existingBytes] = await Promise.all([
      loadPdfLib(),
      isBlob ? pdfSource.arrayBuffer() : fetch(pdfSource).then((r) => r.arrayBuffer())
    ]);
    const pdfDoc = await PDFDocument.load(existingBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const watermarkText = `Licensed to ${userEmail} - NOUN Summary Hub`;

    pdfDoc.getPages().forEach((page) => {
      const { width, height } = page.getSize();
      page.drawText(watermarkText, {
        x: width / 2 - (watermarkText.length * 3.2),
        y: height / 2,
        size: 14,
        font,
        color: rgb(0, 0.39, 0), // dark green, subtle
        opacity: 0.18,
        rotate: degrees(35)
      });
      // Small footer tag too, for pages where the diagonal mark is easy to miss.
      page.drawText(watermarkText, {
        x: 20,
        y: 14,
        size: 7,
        font,
        color: rgb(0.35, 0.35, 0.35),
        opacity: 0.6
      });
    });

    const outBytes = await pdfDoc.save();
    triggerDownload(new Blob([outBytes], { type: "application/pdf" }), fileName);
  } catch (err) {
    console.warn("Watermarking failed, falling back to plain download:", err.message);
    if (isBlob) {
      // Save the exact PDF we already retrieved from our own server.
      triggerDownload(pdfSource, fileName);
      return;
    }
    // Fallback: open the original URL so the user still gets their file.
    window.open(pdfSource, "_blank", "noopener");
  }
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
