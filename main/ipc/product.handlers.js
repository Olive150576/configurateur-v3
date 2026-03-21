/**
 * IPC Handlers — Produits
 * Pont entre le renderer (window.api.products.*) et ProductService
 */

const ProductService = require('../services/ProductService');
const { ValidationError } = require('../utils/validator');

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
}

module.exports = { register };
