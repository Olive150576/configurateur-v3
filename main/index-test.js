// Test absolument minimal - copié depuis la doc officielle Electron
const { app, BrowserWindow } = require('electron')

console.log('process.type:', process.type)
console.log('app exists:', !!app)

function createWindow () {
  const win = new BrowserWindow({ width: 800, height: 600 })
  win.loadURL('about:blank')
}

app.whenReady().then(() => {
  console.log('APP READY!')
  createWindow()
  setTimeout(() => { app.quit() }, 2000)
})
