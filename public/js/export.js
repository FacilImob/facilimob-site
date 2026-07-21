export async function exportPdf(target, fileName) {
  const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff' });
  const image = canvas.toDataURL('image/jpeg', 0.95);
  const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const ratio = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
  const width = canvas.width * ratio;
  const height = canvas.height * ratio;
  pdf.addImage(image, 'JPEG', (pageWidth - width) / 2, 10, width, height);
  pdf.save(`${fileName}.pdf`);
}

export async function exportJpeg(target, fileName) {
  const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff' });
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.download = `${fileName}.jpg`;
  link.click();
}
