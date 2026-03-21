/**
 * PrintService — Gestion de la fenêtre d'impression et export PDF
 */

const { BrowserWindow, dialog, shell } = require('electron');
const path = require('path');
const fs   = require('fs');

/**
 * Ouvre une fenêtre d'aperçu pour un document
 */
async function openDocument(documentId) {
  const win = new BrowserWindow({
    width:  880,
    height: 1080,
    minWidth: 700,
    title: 'Aperçu document',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const htmlPath = path.join(__dirname, '../../renderer/print/print.html');
  await win.loadFile(htmlPath, { query: { docId: documentId } });

  return win;
}

/**
 * Exporte le contenu de la fenêtre en PDF (déclenché depuis le renderer)
 */
async function savePDF(win, defaultName) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Sauvegarder le PDF',
    defaultPath: defaultName || 'document.pdf',
    filters: [{ name: 'Fichiers PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) return { saved: false };

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize:        'A4',
    margins:         { marginType: 'none' },
    landscape:       false,
  });

  fs.writeFileSync(filePath, pdfBuffer);
  shell.openPath(filePath);

  return { saved: true, path: filePath };
}

module.exports = { openDocument, savePDF };
