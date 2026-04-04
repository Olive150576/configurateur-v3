const SupplierService = require('../services/SupplierService');

function register(ipcMain) {
  ipcMain.handle('suppliers:getAll',       ()           => wrap(() => SupplierService.getAll()));
  ipcMain.handle('suppliers:findOrCreate', (_, name)    => wrap(() => SupplierService.findOrCreate(name)));
  ipcMain.handle('suppliers:create',       (_, data)    => wrap(() => SupplierService.create(data)));
  ipcMain.handle('suppliers:update',       (_, id, data)=> wrap(() => SupplierService.update(id, data)));
  ipcMain.handle('suppliers:search',       (_, term)    => wrap(() => SupplierService.search(term)));
  ipcMain.handle('suppliers:archive',      (_, id)      => wrap(() => SupplierService.archive(id)));
  ipcMain.handle('suppliers:remove',       (_, id)      => wrap(() => SupplierService.remove(id)));
}

module.exports = { register };
