/**
 * IPC Handlers — Produits
 * Pont entre le renderer (window.api.products.*) et ProductService
 */

const ProductService    = require('../services/ProductService');
const WebPublishService = require('../services/WebPublishService');
const { ValidationError } = require('../utils/validator');
const QRCode = require('qrcode');

function register(ipcMain) {
  ipcMain.handle('products:getAll',         () => wrap(() => ProductService.getAll()));
  ipcMain.handle('products:getAllArchived', () => wrap(() => ProductService.getAll(true)));
  ipcMain.handle('products:getById',   (_, id) => wrap(() => ProductService.getById(id)));
  ipcMain.handle('products:create',    (_, data) => wrap(() => ProductService.create(data)));
  ipcMain.handle('products:update',    (_, id, data) => wrap(() => ProductService.update(id, data)));
  ipcMain.handle('products:archive',   (_, id) => wrap(() => ProductService.archive(id)));
  ipcMain.handle('products:restore',   (_, id) => wrap(() => ProductService.restore(id)));
  ipcMain.handle('products:duplicate', (_, id) => wrap(() => ProductService.duplicate(id)));
  ipcMain.handle('products:search',    (_, term) => wrap(() => ProductService.search(term)));
  ipcMain.handle('products:setActive', (_, id, active) => wrap(() => ProductService.setActive(id, active)));
  ipcMain.handle('products:bulkUpdatePrices', (_, supplierId, collection, pct) =>
    wrap(() => ProductService.bulkUpdatePrices(supplierId, collection, pct))
  );
  ipcMain.handle('products:remove', (_, id) => wrap(() => ProductService.remove(id)));

  // ── Publication vers le site mildecor.fr ─────────────────────────────────
  ipcMain.handle('products:publishToWeb', (_, id, webSettings, webpArray) =>
    wrap(async () => {
      const product    = await ProductService.getById(id);
      if (!product) throw new Error(`Produit ${id} introuvable`);
      const webpBuffer = webpArray ? new Uint8Array(webpArray) : null;
      return WebPublishService.publish(product, webSettings, webpBuffer);
    })
  );

  ipcMain.handle('products:unpublishFromWeb', (_, name, category) =>
    wrap(() => WebPublishService.unpublish(name, category))
  );

  ipcMain.handle('products:checkWebStatus', (_, name, category) =>
    wrap(() => WebPublishService.findSiteProduct(name, category))
  );

  ipcMain.handle('products:generateQR', (_, text) =>
    wrap(() => QRCode.toDataURL(text, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 160,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    }))
  );
}

module.exports = { register };
