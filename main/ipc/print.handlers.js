/**
 * IPC Handlers — Impression et export PDF
 */

const { BrowserWindow } = require('electron');
const PrintService = require('../services/PrintService');

function register(ipcMain) {
  // Ouvrir la fenêtre d'aperçu pour un document
  ipcMain.handle('documents:print', (_, docId) =>
    wrap(() => PrintService.openDocument(docId))
  );

  // Déclenché depuis la fenêtre d'aperçu : exporter en PDF
  ipcMain.handle('print:savePDF', (event, defaultName) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return wrap(() => PrintService.savePDF(win, defaultName));
  });
}

module.exports = { register };
