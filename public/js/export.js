export async function exportPdf(target, fileName) {
  await waitForImages(target);
  const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
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
  await waitForImages(target);
  const canvas = await html2canvas(target, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/jpeg', 0.95);
  link.download = `${fileName}.jpg`;
  link.click();
}

export async function printTarget(target) {
  const printRoot = document.createElement('div');
  printRoot.className = 'print-export-root';
  printRoot.append(target.cloneNode(true));
  document.body.append(printRoot);
  document.body.classList.add('printing-export');
  await waitForImages(printRoot);

  const cleanup = () => {
    document.body.classList.remove('printing-export');
    printRoot.remove();
    window.removeEventListener('afterprint', cleanup);
  };

  window.addEventListener('afterprint', cleanup);
  window.print();
  window.setTimeout(cleanup, 1000);
}

async function waitForImages(target) {
  const images = [...target.querySelectorAll('img')].filter((image) => !image.complete);
  await Promise.all(
    images.map(
      (image) =>
        new Promise((resolve) => {
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        })
    )
  );
}
