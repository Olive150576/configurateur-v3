const StatsService = require('../services/StatsService');

function register(ipcMain) {
  ipcMain.handle('stats:get',         (_, period) => wrap(() => StatsService.getStats(period || 'all')));
  ipcMain.handle('stats:getAdvanced', ()          => wrap(() => StatsService.getAdvancedStats()));
}

module.exports = { register };
