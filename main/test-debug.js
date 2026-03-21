console.log('process.type:', process.type);
const { app } = require('electron');
console.log('app:', app ? 'OK' : 'undefined');
if (app) {
  app.whenReady().then(() => {
    console.log('✓ App ready!');
    app.quit();
  });
}
