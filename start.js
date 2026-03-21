/**
 * Lanceur Electron — supprime ELECTRON_RUN_AS_NODE avant de démarrer
 * (electron-rebuild le définit dans la session, ce qui casse le démarrage)
 */
const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);  // passe les args supplémentaires (ex: --dev)

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electronBin = path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe');

const proc = spawn(electronBin, ['.', ...args], {
  stdio: 'inherit',
  env,
});

proc.on('exit', code => process.exit(code ?? 0));
