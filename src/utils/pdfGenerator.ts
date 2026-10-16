import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface PDFExportOptions {
  fileName?: string;
  orientation?: "portrait" | "landscape";
  format?: "a4" | "a5" | "letter";
  forceSinglePage?: boolean;
}

/**
 * Generates and triggers download of a Smart 1-Page PDF from a DOM element
 */
export async function generatePdfFromElement(
  element: HTMLElement,
  options: PDFExportOptions = {}
): Promise<void> {
  const {
    fileName = "dokumen-lala-dentist.pdf",
    orientation = "portrait",
    format = "a4",
    forceSinglePage = true
  } = options;

  try {
    const canvas = await html2canvas(element, {
      scale: 2.5, // High resolution crisp rendering
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: 800
    });

    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({
      orientation,
      unit: "mm",
      format
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const marginX = 8;
    const marginY = 8;
    const printableWidth = pdfWidth - marginX * 2;
    const printableHeight = pdfHeight - marginY * 2;

    const canvasRatio = canvas.width / canvas.height;

    if (forceSinglePage) {
      // Smart 1-Page Auto-Fitting: Scaled precisely to fit on exactly 1 page with no cutoff
      let imgWidth = printableWidth;
      let imgHeight = imgWidth / canvasRatio;

      if (imgHeight > printableHeight) {
        imgHeight = printableHeight;
        imgWidth = imgHeight * canvasRatio;
      }

      // Center horizontally and vertically within printable margins
      const posX = marginX + (printableWidth - imgWidth) / 2;
      const posY = marginY;

      pdf.addImage(imgData, "PNG", posX, posY, imgWidth, imgHeight, undefined, "FAST");
    } else {
      // Multi-page slicing fallback if needed
      const imgWidth = printableWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;
      let position = marginY;

      pdf.addImage(imgData, "PNG", marginX, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= printableHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight + marginY;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", marginX, position, imgWidth, imgHeight, undefined, "FAST");
        heightLeft -= printableHeight;
      }
    }

    pdf.save(fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
  } catch (err) {
    console.error("Gagal membuat file PDF:", err);
    throw new Error("Gagal mengunduh PDF: " + (err instanceof Error ? err.message : String(err)));
  }
}
