console.log('process.type:', process.type);
console.log('versions.electron:', process.versions.electron);
console.log('versions.node:', process.versions.node);

// Tenter différentes façons d'accéder à l'API Electron
const mod = require('module');
console.log('electron in builtins:', mod.builtinModules.includes('electron'));

// Lister les modules builtins electron
const electronBuiltins = mod.builtinModules.filter(m => m.includes('electron') || m.includes('Electron'));
console.log('electron builtins:', electronBuiltins.slice(0, 10));
