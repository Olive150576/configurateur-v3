/**
 * IPC Handlers — Clients
 */

const ClientService = require('../services/ClientService');

function register(ipcMain) {
  ipcMain.handle('clients:getAll',  ()           => wrap(() => ClientService.getAll()));
  ipcMain.handle('clients:getById', (_, id)      => wrap(() => ClientService.getById(id)));
  ipcMain.handle('clients:create',  (_, data)    => wrap(() => ClientService.create(data)));
  ipcMain.handle('clients:update',  (_, id, data)=> wrap(() => ClientService.update(id, data)));
  ipcMain.handle('clients:search',  (_, term)    => wrap(() => ClientService.search(term)));
}

module.exports = { register };
