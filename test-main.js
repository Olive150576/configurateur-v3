console.log('process.type:', process.type);
try {
  const { app } = require('electron/main');
  console.log('electron/main app:', app ? 'OK' : 'undefined');
  if (app) {
    app.whenReady().then(() => {
      console.log('✓ App ready!');
      app.quit();
    });
  }
} catch(e) {
  console.log('ERROR electron/main:', e.message);
}
