const { app, BrowserWindow } = require('electron');
const mc = require('./app/mcFunctions');

var downloader;
var manifest;

function createWindow() {
  let win = new BrowserWindow({
    height: 720,
    width: 1280,
    webPreferences: {
      nodeIntegration: true
    }
  })

  win.webContents.openDevTools();
  win.loadFile("dist-web/index.html")
}

function initAssets() {
  downloader = new  mc.DownloadsHandler();
  manifest = mc.getManifest();
  console.log(manifest);

}

app.on("ready", ()=>{
  createWindow();
  initAssets();
})
