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

  return { opened: true };
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

/**
 * Sauvegarde le PDF dans Documents/Devis/ puis ouvre le client mail
 */
async function saveAndEmail(win, opts = {}) {
  const { defaultName = 'document.pdf', clientEmail = '', subject = '', body = '' } = opts;

  // Dossier Documents/Devis/
  const { app } = require('electron');
  const devisDir = path.join(app.getPath('documents'), 'Devis');
  if (!fs.existsSync(devisDir)) fs.mkdirSync(devisDir, { recursive: true });

  const pdfPath = path.join(devisDir, defaultName);

  const pdfBuffer = await win.webContents.printToPDF({
    printBackground: true,
    pageSize:        'A4',
    margins:         { marginType: 'none' },
    landscape:       false,
  });

  fs.writeFileSync(pdfPath, pdfBuffer);
  shell.showItemInFolder(pdfPath);

  const mailto = `mailto:${encodeURIComponent(clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  await shell.openExternal(mailto);

  return { saved: true, path: pdfPath };
}

/**
 * Ouvre le bon de commande fournisseur (sans prix) pour un document
 */
async function openSupplierDocument(documentId) {
  const win = new BrowserWindow({
    width:  800,
    height: 1000,
    minWidth: 650,
    title: 'Bon de commande fournisseur',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const htmlPath = path.join(__dirname, '../../renderer/print/print-supplier.html');
  await win.loadFile(htmlPath, { query: { docId: documentId } });

  return { opened: true };
}

/**
 * Ouvre la fenêtre d'impression pour une étiquette magasin
 * @param {string} productId
 * @param {object} config { tissu, badge, rangeIds, optionIds }
 */
async function openEtiquette(productId, config = {}) {
  const { tissu = '', badge = '', configs = '[]', showQR = '0' } = config;

  const win = new BrowserWindow({
    width:  880,
    height: 1160,
    minWidth: 700,
    title: 'Étiquette magasin',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const htmlPath = path.join(__dirname, '../../renderer/print/etiquette.html');
  await win.loadFile(htmlPath, {
    query: {
      productId,
      tissu,
      badge,
      configs: encodeURIComponent(configs),
      showQR,
    },
  });

  return { opened: true };
}

/**
 * Ouvre la fenêtre catalogue PDF pour un fournisseur
 * @param {string|null} supplierId — null = tous les fournisseurs actifs
 */
async function openCatalogue(supplierId) {
  const win = new BrowserWindow({
    width:  920,
    height: 1160,
    minWidth: 700,
    title: 'Catalogue produits',
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const htmlPath = path.join(__dirname, '../../renderer/print/catalogue.html');
  await win.loadFile(htmlPath, { query: { supplierId: supplierId || '' } });

  return { opened: true };
}

module.exports = { openDocument, openSupplierDocument, savePDF, saveAndEmail, openEtiquette, openCatalogue };
