'use strict';

const CompositionService = require('../services/CompositionService');

function register(ipcMain) {
  ipcMain.handle('compositions:getAll',  ()        => wrap(() => CompositionService.getAll()));
  ipcMain.handle('compositions:save',    (_, data) => wrap(() => CompositionService.save(data)));
  ipcMain.handle('compositions:delete',  (_, id)   => wrap(() => CompositionService.remove(id)));
}

module.exports = { register };
