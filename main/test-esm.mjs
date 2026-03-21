import electron from 'electron';
console.log('typeof electron:', typeof electron);
console.log('electron:', JSON.stringify(electron)?.slice(0,100));
const { app } = electron;
console.log('app:', app ? 'OK' : 'undefined');
