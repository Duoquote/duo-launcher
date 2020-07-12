const { app, BrowserWindow, ipcMain } = require('electron');
const Minecraft = require('./app/minecraft.js');

const minecraft = new Minecraft("official");
var manifest;



function createWindow() {
  let win = new BrowserWindow({
    height: 720,
    width: 1280,
    webPreferences: {
      nodeIntegration: true
    },
    show: false
  })

  win.setMenuBarVisibility(false)
  win.loadFile("dist-web/index.html")

  win.once("ready-to-show", ()=>{
    win.show();
  })

  win.webContents.openDevTools();

}

ipcMain.on("init-mc", (e, arg)=>{
  minecraft.initialize(arg).then(()=>{
    e.reply("init-mc", "complete");
  })
})

function initAssets() {

  // var minecraft = new Minecraft("official");
  // minecraft.initialize("1.12.2").then(()=>{
  //   minecraft.checkFiles().then(()=>{
  //     minecraft.genCMD();
  //   })
  // })

}

app.on("ready", ()=>{
  createWindow();
  initAssets();
})
