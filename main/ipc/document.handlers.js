/**
 * IPC Handlers — Documents
 */

const DocumentService = require('../services/DocumentService');
const { ValidationError } = require('../utils/validator');

function register(ipcMain) {
  ipcMain.handle('documents:getAll',     (_, filters) => wrap(() => DocumentService.getAll(filters)));
  ipcMain.handle('documents:getById',    (_, id) => wrap(() => DocumentService.getById(id)));
  ipcMain.handle('documents:create',     (_, data) => wrap(() => DocumentService.create(data)));
  ipcMain.handle('documents:update',     (_, id, data) => wrap(() => DocumentService.update(id, data)));
  ipcMain.handle('documents:validate',   (_, id) => wrap(() => DocumentService.validate(id)));
  ipcMain.handle('documents:transition', (_, id, to) => wrap(() => DocumentService.transition(id, to)));
  ipcMain.handle('documents:transform',  (_, id, type) => wrap(() => DocumentService.transform(id, type)));
  ipcMain.handle('documents:duplicate',  (_, id) => wrap(() => DocumentService.duplicate(id)));
}

module.exports = { register };
