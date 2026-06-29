import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs'
import { is } from '@electron-toolkit/utils'
import { getAllModels, addModel, updateModel, deleteModel } from './db'
import { scanSdCard, writeConfigScript, readModelYaml, saveModelYaml, applyConfigToYaml, extractChannelsFromYaml, RadioConfig } from './edgetx-model'
import path from 'path'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// IPC handlers — file dialog
ipcMain.handle('dialog:openFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showOpenDialog(win!, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// IPC handlers — photos
ipcMain.handle('photo:save', async (_event, srcPath: string) => {
  const photosDir = join(app.getPath('userData'), 'photos')
  if (!existsSync(photosDir)) {
    mkdirSync(photosDir, { recursive: true })
  }
  const ext = srcPath.split('.').pop() ?? 'jpg'
  const filename = `${Date.now()}.${ext}`
  const destPath = join(photosDir, filename)
  copyFileSync(srcPath, destPath)
  return destPath
})

// IPC handlers — photo data URL
ipcMain.handle('photo:getDataUrl', (_event, filePath: string) => {
  try {
    const data = readFileSync(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpg'
    const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : 'image/jpeg'
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
})

// IPC handlers — models
ipcMain.handle('models:getAll', () => {
  return getAllModels()
})

ipcMain.handle('models:add', (_event, model) => {
  return addModel(model)
})

ipcMain.handle('models:update', (_event, model) => {
  return updateModel(model)
})

ipcMain.handle('models:delete', (_event, id) => {
  return deleteModel(id)
})

// IPC handlers — SD card detection
ipcMain.handle('sdcard:detect', () => {
  const drives = 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('')
  for (const letter of drives) {
    const markerPath = path.join(letter + ':\\', 'SCRIPTS', 'TOOLS', 'DSMLIB', 'msg_fwdp_en.txt')
    try {
      if (existsSync(markerPath)) {
        return { connected: true, drivePath: letter + ':' }
      }
    } catch {
      // Drive not accessible — skip
    }
  }
  return { connected: false, drivePath: null }
})

// IPC handlers — write EdgeTX Lua setup script to SD card
ipcMain.handle('edgetx:writeSetupScript', (_event, drivePath: string, modelName: string) => {
  try {
    const scriptDir = path.join(drivePath + '\\', 'SCRIPTS', 'TOOLS')
    if (!existsSync(scriptDir)) {
      mkdirSync(scriptDir, { recursive: true })
    }

    const scriptPath = path.join(scriptDir, 'FDSETUP.lua')

    const lua = `-- FlightDeck Radio Setup v1.0
-- Generated for: ${modelName}
-- Run this from your radio's TOOLS menu while the target model is loaded.
--
-- What this does:
--   CH5 (SAFE Select) = Switch SB
--     SB UP   = SAFE ON  (self-leveling, angle limits active)
--     SB DOWN = SAFE OFF (AS3X only, full pilot control)

local done    = false
local success = false
local errMsg  = ""

local function applyConfig()
  -- Dynamically resolve SB switch source (works on any EdgeTX radio)
  local sbInfo = getFieldInfo("sb")
  if not sbInfo then
    return false, "Switch SB not found on this radio"
  end

  local CH5 = 4  -- Channel 5, zero-indexed

  -- Clear any existing mixes on CH5
  while model.getMixesCount(CH5) > 0 do
    model.deleteMix(CH5, 0)
  end

  -- Assign SB switch directly as the CH5 source
  -- SB position drives the channel value — no extra switch condition needed
  model.insertMix(CH5, 0, {
    srcRaw    = sbInfo.id,
    weight    = 100,
    offset    = 0,
    switch    = 0,
    speedUp   = 0,
    speedDown = 0,
    delayUp   = 0,
    delayDown = 0,
    mode      = 0,
    curveType = 0,
    curveValue = 0,
    noExpo    = false,
    name      = "SAFE/SB"
  })

  if model.getMixesCount(CH5) < 1 then
    return false, "Mix insert failed — is a model loaded?"
  end

  return true, nil
end

local function run(event, touchState)
  if not done then
    success, errMsg = applyConfig()
    errMsg = errMsg or ""
    done = true
  end

  lcd.clear()
  lcd.drawText(10, 5,  "FlightDeck Setup", BOLD)
  lcd.drawText(10, 30, "Model: ${modelName}", SMLSIZE)

  if success then
    lcd.drawText(10, 60,  "DONE!", BOLD)
    lcd.drawText(10, 90,  "CH5 = Switch SB")
    lcd.drawText(10, 118, "SB UP   = SAFE ON")
    lcd.drawText(10, 146, "SB DOWN = SAFE OFF")
    lcd.drawText(10, 185, "Verify: Tools > Plane AS3X Monitor", SMLSIZE)
    lcd.drawText(10, 202, "Flip SB and watch SAFE indicator.", SMLSIZE)
  else
    lcd.drawText(10, 60,  "ERROR", BOLD)
    lcd.drawText(10, 90,  errMsg)
    lcd.drawText(10, 130, "Make sure the correct model", SMLSIZE)
    lcd.drawText(10, 148, "is loaded, then run again.", SMLSIZE)
  end

  lcd.drawText(10, 248, "Press RTN to exit", SMLSIZE)

  if event == EVT_VIRTUAL_EXIT or event == EVT_VIRTUAL_ENTER then
    return 1
  end
  return 0
end

return { run = run }
`
    writeFileSync(scriptPath, lua, 'utf-8')
    return { success: true, path: scriptPath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// IPC handlers — SD card write config
ipcMain.handle('sdcard:writeConfig', (_event, drivePath: string, modelName: string, config: object) => {
  try {
    const sanitized = modelName.replace(/[^a-zA-Z0-9_\- ]/g, '_').trim().replace(/\s+/g, '_')
    const modelDir = path.join(drivePath + '\\', 'MODELS', 'DSMDATA')
    if (!existsSync(modelDir)) {
      mkdirSync(modelDir, { recursive: true })
    }
    const filePath = path.join(modelDir, `${sanitized}.json`)
    writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8')
    return { success: true, filePath }
  } catch (err) {
    return { success: false, error: String(err) }
  }
})

// IPC handlers — EdgeTX SD card scan
ipcMain.handle('edgetx:scanSdCard', (_event, sdDrive: string) => {
  return scanSdCard(sdDrive)
})

// IPC handlers — write full configuration script
ipcMain.handle('edgetx:writeConfigScript', (_event, sdDrive: string, config: RadioConfig) => {
  return writeConfigScript(sdDrive, config)
})

// IPC handlers — YAML model direct read
ipcMain.handle('edgetx:readModelYaml', (_event, sdDrive: string, filename: string) => {
  return readModelYaml(sdDrive, filename)
})

// IPC handlers — YAML model extract channels (for "Load from Radio")
ipcMain.handle('edgetx:loadModelConfig', (_event, sdDrive: string, filename: string) => {
  const { data, error } = readModelYaml(sdDrive, filename)
  if (!data) return { success: false, error: error ?? 'Could not parse model YAML' }
  const channels = extractChannelsFromYaml(data)
  const name = data.header?.name ?? filename.replace(/\.ya?ml$/i, '')
  return { success: true, modelName: name, channels }
})

// IPC handlers — YAML model direct save (apply FlightDeck config, write file)
ipcMain.handle('edgetx:saveModelYaml', (_event, sdDrive: string, filename: string, config: RadioConfig) => {
  const { data, error } = readModelYaml(sdDrive, filename)
  if (!data) return { success: false, error: error ?? 'Could not read model YAML' }
  const updated = applyConfigToYaml(data, config)
  return saveModelYaml(sdDrive, filename, updated)
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
