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

  // Bon de commande fournisseur (sans prix)
  ipcMain.handle('documents:printSupplier', (_, docId) =>
    wrap(() => PrintService.openSupplierDocument(docId))
  );

  // Sauvegarde dans Documents/Devis/ et ouvre le client mail
  ipcMain.handle('print:openEmail', (event, opts) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return wrap(() => PrintService.saveAndEmail(win, opts));
  });

  // Étiquette magasin
  ipcMain.handle('etiquette:print', (_, productId, config) =>
    wrap(() => PrintService.openEtiquette(productId, config || {}))
  );

  // Catalogue PDF fournisseur
  ipcMain.handle('catalogue:print', (_, supplierId) =>
    wrap(() => PrintService.openCatalogue(supplierId || null))
  );

  // Catalogue PDF client (prix de vente TTC, 2 produits / page)
  ipcMain.handle('catalogue:printClient', () =>
    wrap(() => PrintService.openCatalogueClient())
  );
}

module.exports = { register };
