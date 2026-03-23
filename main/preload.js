/**
 * Preload — Bridge sécurisé entre main et renderer
 * Le renderer accède uniquement à window.api.*
 * Aucun accès direct à Node.js depuis la UI
 */

const { contextBridge, ipcRenderer, shell } = require('electron');

contextBridge.exposeInMainWorld('api', {

  // ==================== PRODUITS ====================
  products: {
    getAll:        ()              => ipcRenderer.invoke('products:getAll'),
    getAllArchived: ()              => ipcRenderer.invoke('products:getAllArchived'),
    getById:       (id)            => ipcRenderer.invoke('products:getById', id),
    create:    (data)          => ipcRenderer.invoke('products:create', data),
    update:    (id, data)      => ipcRenderer.invoke('products:update', id, data),
    archive:   (id)            => ipcRenderer.invoke('products:archive', id),
    restore:   (id)            => ipcRenderer.invoke('products:restore', id),
    duplicate: (id)            => ipcRenderer.invoke('products:duplicate', id),
    search:    (term)          => ipcRenderer.invoke('products:search', term),
    setActive: (id, active)    => ipcRenderer.invoke('products:setActive', id, active),
    bulkUpdatePrices: (supplierId, collection, pct) =>
      ipcRenderer.invoke('products:bulkUpdatePrices', supplierId, collection, pct),
    generateQR: (text) => ipcRenderer.invoke('products:generateQR', text),
  },

  // ==================== FOURNISSEURS ====================
  suppliers: {
    getAll:       ()         => ipcRenderer.invoke('suppliers:getAll'),
    findOrCreate: (name)     => ipcRenderer.invoke('suppliers:findOrCreate', name),
    create:       (data)     => ipcRenderer.invoke('suppliers:create', data),
    update:       (id, data) => ipcRenderer.invoke('suppliers:update', id, data),
    search:       (term)     => ipcRenderer.invoke('suppliers:search', term),
    archive:      (id)       => ipcRenderer.invoke('suppliers:archive', id),
  },

  // ==================== DOCUMENTS ====================
  documents: {
    getAll:     (filters)   => ipcRenderer.invoke('documents:getAll', filters),
    getById:    (id)        => ipcRenderer.invoke('documents:getById', id),
    create:     (data)      => ipcRenderer.invoke('documents:create', data),
    update:     (id, data)  => ipcRenderer.invoke('documents:update', id, data),
    validate:   (id)        => ipcRenderer.invoke('documents:validate', id),
    transition: (id, to)    => ipcRenderer.invoke('documents:transition', id, to),
    transform:  (id, type)  => ipcRenderer.invoke('documents:transform', id, type),
    duplicate:  (id)        => ipcRenderer.invoke('documents:duplicate', id),
    delete:     (id)        => ipcRenderer.invoke('documents:delete', id),
    print:         (id) => ipcRenderer.invoke('documents:print', id),
    printSupplier: (id) => ipcRenderer.invoke('documents:printSupplier', id),
  },

  // ==================== CLIENTS ====================
  clients: {
    getAll:    ()          => ipcRenderer.invoke('clients:getAll'),
    getById:   (id)        => ipcRenderer.invoke('clients:getById', id),
    create:    (data)      => ipcRenderer.invoke('clients:create', data),
    update:    (id, data)  => ipcRenderer.invoke('clients:update', id, data),
    search:    (term)      => ipcRenderer.invoke('clients:search', term),
    exportCSV: ()          => ipcRenderer.invoke('clients:exportCSV'),
    importCSV: (rows)      => ipcRenderer.invoke('clients:importCSV', rows),
  },

  // ==================== IMPRESSION ====================
  print: {
    savePDF:   (defaultName) => ipcRenderer.invoke('print:savePDF', defaultName),
    openEmail: (opts)        => ipcRenderer.invoke('print:openEmail', opts),
  },

  // ==================== ÉTIQUETTES ====================
  etiquette: {
    print: (productId, config) => ipcRenderer.invoke('etiquette:print', productId, config),
  },

  // ==================== CATALOGUE ====================
  catalogue: {
    print: (supplierId) => ipcRenderer.invoke('catalogue:print', supplierId),
  },

  // ==================== STATISTIQUES ====================
  stats: {
    get:         (period) => ipcRenderer.invoke('stats:get', period),
    getAdvanced: ()       => ipcRenderer.invoke('stats:getAdvanced'),
  },

  // ==================== MISE À JOUR AUTO ====================
  update: {
    check:    ()  => ipcRenderer.invoke('update:check'),
    download: ()  => ipcRenderer.invoke('update:download'),
    install:  ()  => ipcRenderer.invoke('update:install'),
    onAvailable: (cb) => ipcRenderer.on('update:available', (_, info) => cb(info)),
    onProgress:  (cb) => ipcRenderer.on('update:progress',  (_, info) => cb(info)),
    onReady:     (cb) => ipcRenderer.on('update:ready',     ()        => cb()),
    onError:     (cb) => ipcRenderer.on('update:error',     (_, info) => cb(info)),
  },

  // ==================== APP ====================
  app: {
    backup:        ()        => ipcRenderer.invoke('app:backup'),
    getBackups:    ()        => ipcRenderer.invoke('app:getBackups'),
    restore:       (file)    => ipcRenderer.invoke('app:restore', file),
    getConfig:     (key)     => ipcRenderer.invoke('app:getConfig', key),
    setConfig:     (key, val)=> ipcRenderer.invoke('app:setConfig', key, val),
    getStats:      ()        => ipcRenderer.invoke('app:getStats'),
    getDashboard:        ()        => ipcRenderer.invoke('app:getDashboard'),
    getAutoBackupStatus: ()        => ipcRenderer.invoke('app:getAutoBackupStatus'),
    getLogo:       ()        => ipcRenderer.invoke('app:getConfig', 'company_logo'),
    exportDb:      ()        => ipcRenderer.invoke('app:exportDb'),
    importDb:      ()        => ipcRenderer.invoke('app:importDb'),
    getVersion:    ()        => ipcRenderer.invoke('app:getVersion'),
  },
});
