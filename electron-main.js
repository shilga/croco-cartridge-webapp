// Modules to control application life and create native browser window
const { app, BrowserWindow } = require("electron");
const util = require('util');
const path = require("path");
const isDev = require('electron-is-dev');
const PORT = 3000;

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
  });

  let grantedDeviceThroughPermHandler

  mainWindow.webContents.session.on('select-usb-device', (event, details, callback) => {
    // Add events to handle devices being added or removed before the callback on
    // `select-usb-device` is called.
    mainWindow.webContents.session.on('usb-device-added', (event, device) => {
      console.log('usb-device-added FIRED WITH', device)
      // Optionally update details.deviceList
    })

    mainWindow.webContents.session.on('usb-device-removed', (event, device) => {
      console.log('usb-device-removed FIRED WITH', device)
      // Optionally update details.deviceList
    })

    event.preventDefault()

    if (details.deviceList && details.deviceList.length > 0) {
      const deviceToReturn = details.deviceList.find((device) => {
        console.log("device: " + util.inspect(device, {showHidden: false, depth: null, colors: true}));
        if ((device.productName !== "Croco Cartridge") || (device.manufacturerName !== "x-pantion") )
        {
          return false;
        }
        return true;
      })
      if (deviceToReturn) {
        callback(deviceToReturn.deviceId)
      } else {
        callback()
      }
    }
  })

  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
    console.log("details.securityOrigin=" + details.securityOrigin);
    if (permission === 'usb' && (details.securityOrigin === "http://localhost:" + PORT + "/" || details.securityOrigin === "file:///") ) {
      return true
    }
  })

  mainWindow.webContents.session.setDevicePermissionHandler((details) => {
    console.log("details.origin=" + details.origin);
    if (details.deviceType === 'usb' && (details.origin === "http://localhost:" + PORT || details.origin === "file://") ) {
      return true;
    }
  })

  if(isDev)
  {
    mainWindow.loadURL('http://localhost:3000');
    // Open the DevTools.
    mainWindow.webContents.openDevTools();
  }
  else
    mainWindow.loadFile("build/index.html");

}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
