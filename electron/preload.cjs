const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('smartbitzDesktop', {
  isElectron: true,
  openCustomerDisplay: () => ipcRenderer.invoke('pos:open-customer-display'),
  printReceipt: () => ipcRenderer.invoke('pos:print-silent'),
});
