/**
 * browserApi.ts
 *
 * Browser-compatible shim for window.api that matches the shape exposed by
 * the Electron preload script.  Installed by installBrowserApi.ts when
 * window.api is absent (i.e. not running inside Electron).
 *
 * Storage strategy:
 *  - Models  → localStorage key "fd_models"  (JSON array of RCModel)
 *  - Photos  → localStorage keys "fd_photo_<uuid>"  (data URLs)
 *  - SD card → FileSystemDirectoryHandle  (File System Access API)
 */

import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import type { RCModel } from '../components/ModelCard'

type NewModel = Omit<RCModel, 'id' | 'created_at' | 'updated_at'>

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const MODELS_KEY = 'fd_models'

function loadModels(): RCModel[] {
  try {
    const raw = localStorage.getItem(MODELS_KEY)
    return raw ? (JSON.parse(raw) as RCModel[]) : []
  } catch {
    return []
  }
}

function saveModels(models: RCModel[]): void {
  localStorage.setItem(MODELS_KEY, JSON.stringify(models))
}

// ── SD Card — File System Access API ─────────────────────────────────────────

let sdDirectoryHandle: FileSystemDirectoryHandle | null = null
let modelsDirHandle: FileSystemDirectoryHandle | null = null

/** Returns the MODELS directory handle — tries MODELS/ subfolder first, falls back to selected dir */
async function getModelsDir(): Promise<FileSystemDirectoryHandle | null> {
  if (!sdDirectoryHandle) return null
  try {
    modelsDirHandle = await (sdDirectoryHandle as any).getDirectoryHandle('MODELS')
  } catch {
    modelsDirHandle = sdDirectoryHandle
  }
  return modelsDirHandle
}

/**
 * Opens the OS directory picker so the user can grant access to their EdgeTX
 * SD card.  Must be called from a user gesture (e.g. a button click).
 * Stores the resulting handle for all subsequent sdcard/edgetx calls.
 */
export async function selectSdCard(): Promise<boolean> {
  if (!('showDirectoryPicker' in window)) {
    console.warn('[FlightDeck] File System Access API not supported in this browser.')
    return false
  }
  try {
    // Cast to any: `mode` option exists in the spec but may not be in older TS DOM types
    sdDirectoryHandle = (await (window as any).showDirectoryPicker({
      mode: 'readwrite'
    })) as FileSystemDirectoryHandle
    return true
  } catch {
    // User cancelled or denied permission
    sdDirectoryHandle = null
    return false
  }
}

/** Write a UTF-8 text file to the root of the selected SD card directory. */
async function writeFileToSd(filename: string, content: string): Promise<void> {
  if (!sdDirectoryHandle) throw new Error('No SD card directory selected')
  const fileHandle = await sdDirectoryHandle.getFileHandle(filename, { create: true })
  // createWritable() is part of File System Access API; cast for TS lib compatibility
  const writable = (await (fileHandle as any).createWritable()) as FileSystemWritableFileStream
  await writable.write(content)
  await writable.close()
}

/** Read a UTF-8 text file from the SD card, supporting nested paths like MODELS/model01.yml */
async function readFileFromSd(filename: string): Promise<string | null> {
  if (!sdDirectoryHandle) return null
  try {
    const parts = filename.split('/')
    let dirHandle: FileSystemDirectoryHandle = sdDirectoryHandle
    for (let i = 0; i < parts.length - 1; i++) {
      dirHandle = await (dirHandle as any).getDirectoryHandle(parts[i])
    }
    const fileHandle = await dirHandle.getFileHandle(parts[parts.length - 1])
    const file = await fileHandle.getFile()
    return await file.text()
  } catch {
    return null
  }
}

/**
 * Recursively walk a FileSystemDirectoryHandle and return a flat list of all
 * file entries with their relative paths.
 */
async function collectEntries(
  dirHandle: FileSystemDirectoryHandle,
  prefix = ''
): Promise<{ name: string; path: string }[]> {
  const results: { name: string; path: string }[] = []
  // .entries() is in the File System Access API spec; cast for TS lib compatibility
  for await (const [name, handle] of (dirHandle as any).entries() as AsyncIterable<
    [string, FileSystemHandle]
  >) {
    const fullPath = prefix ? `${prefix}/${name}` : name
    if (handle.kind === 'directory') {
      const sub = await collectEntries(handle as FileSystemDirectoryHandle, fullPath)
      results.push(...sub)
    } else {
      results.push({ name, path: fullPath })
    }
  }
  return results
}

// ── Browser shim — matches the exact shape of the Electron preload api ────────

export const browserApi = {
  // ── models ──────────────────────────────────────────────────────────────────

  models: {
    getAll: (): Promise<RCModel[]> => Promise.resolve(loadModels()),

    add: (model: NewModel): Promise<RCModel> => {
      const models = loadModels()
      const now = Date.now()
      const newModel: RCModel = {
        ...model,
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now
      }
      models.push(newModel)
      saveModels(models)
      return Promise.resolve(newModel)
    },

    update: (model: Partial<RCModel> & { id: string }): Promise<RCModel | undefined> => {
      const models = loadModels()
      const idx = models.findIndex((m) => m.id === model.id)
      if (idx === -1) return Promise.resolve(undefined)
      models[idx] = { ...models[idx], ...model, updated_at: Date.now() }
      saveModels(models)
      return Promise.resolve(models[idx])
    },

    delete: (id: string): Promise<boolean> => {
      const models = loadModels()
      const next = models.filter((m) => m.id !== id)
      if (next.length === models.length) return Promise.resolve(false)
      saveModels(next)
      return Promise.resolve(true)
    }
  },

  // ── dialog ──────────────────────────────────────────────────────────────────

  dialog: {
    /**
     * Opens a native file picker restricted to images.
     * Returns the selected image as a data URL (instead of a file-system path
     * as Electron does), or null if the user cancelled.
     * This data URL is then passed directly to photo.save().
     */
    openImage: (): Promise<string | null> =>
      new Promise((resolve) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.style.cssText =
          'position:fixed;top:-100px;left:-100px;opacity:0;pointer-events:none;'
        document.body.appendChild(input)

        let settled = false
        const done = (result: string | null): void => {
          if (settled) return
          settled = true
          if (document.body.contains(input)) document.body.removeChild(input)
          resolve(result)
        }

        input.onchange = (): void => {
          const file = input.files?.[0]
          if (!file) {
            done(null)
            return
          }
          const reader = new FileReader()
          reader.onload = (e): void => done((e.target?.result as string) ?? null)
          reader.onerror = (): void => done(null)
          reader.readAsDataURL(file)
        }

        // Fires in Chrome 113+ / Firefox when the picker is dismissed without selecting
        input.oncancel = (): void => done(null)

        input.click()
      })
  },

  // ── photo ───────────────────────────────────────────────────────────────────

  photo: {
    /**
     * If srcPath is a data URL (starts with "data:"), persist it in
     * localStorage under a generated key "fd_photo_<uuid>" and return that key.
     * If srcPath is already an "fd_photo_" key, return it as-is.
     * The stored key becomes the model's photo_path.
     */
    save: (srcPath: string): Promise<string> => {
      if (srcPath.startsWith('data:')) {
        const key = `fd_photo_${crypto.randomUUID()}`
        try {
          localStorage.setItem(key, srcPath)
        } catch (e) {
          console.warn('[FlightDeck] localStorage quota exceeded — photo not saved', e)
        }
        return Promise.resolve(key)
      }
      // Already a storage key — pass through unchanged
      return Promise.resolve(srcPath)
    },

    /**
     * If filePath starts with "fd_photo_", retrieve the data URL from
     * localStorage.  Otherwise return null (Electron-style file paths
     * cannot be resolved in the browser).
     */
    getDataUrl: (filePath: string): Promise<string | null> => {
      if (filePath.startsWith('fd_photo_')) {
        return Promise.resolve(localStorage.getItem(filePath))
      }
      return Promise.resolve(null)
    }
  },

  // ── sdcard ──────────────────────────────────────────────────────────────────

  sdcard: {
    detect: (): Promise<{ connected: boolean; drivePath: string | null }> =>
      Promise.resolve({
        connected: sdDirectoryHandle !== null,
        drivePath: sdDirectoryHandle !== null ? 'browser-fs' : null
      }),

    connect: (): Promise<boolean> => selectSdCard(),

    writeConfig: (
      _drivePath: string,
      modelName: string,
      config: object
    ): Promise<{ success: boolean; filePath?: string; error?: string }> => {
      const filename = `${modelName.replace(/[^a-zA-Z0-9_-]/g, '_')}_config.json`
      return writeFileToSd(filename, JSON.stringify(config, null, 2))
        .then(() => ({ success: true, filePath: filename }))
        .catch((err: unknown) => ({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        }))
    }
  },

  // ── sounds ──────────────────────────────────────────────────────────────────

  sounds: {
    listFiles: async (): Promise<string[]> => {
      if (!sdDirectoryHandle) return []
      const result: string[] = []
      try {
        const soundsDir = await (sdDirectoryHandle as any).getDirectoryHandle('SOUNDS')
        let enDir: FileSystemDirectoryHandle
        try {
          enDir = await (soundsDir as any).getDirectoryHandle('en')
        } catch {
          enDir = soundsDir
        }
        for await (const [name, handle] of (enDir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
          if (handle.kind === 'file' && name.toLowerCase().endsWith('.wav')) {
            result.push(name)
          }
        }
      } catch { /* SOUNDS/ not found */ }
      return result.sort()
    },

    writeBinary: async (path: string, data: ArrayBuffer): Promise<{ success: boolean; error?: string }> => {
      if (!sdDirectoryHandle) return { success: false, error: 'No SD card connected' }
      try {
        const parts = path.split('/')
        let dir: FileSystemDirectoryHandle = sdDirectoryHandle
        for (let i = 0; i < parts.length - 1; i++) {
          dir = await (dir as any).getDirectoryHandle(parts[i], { create: true })
        }
        const fileHandle = await (dir as any).getFileHandle(parts[parts.length - 1], { create: true })
        const writable = await (fileHandle as any).createWritable()
        await writable.write(data)
        await writable.close()
        return { success: true }
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },

    readBinary: async (path: string): Promise<ArrayBuffer | null> => {
      if (!sdDirectoryHandle) return null
      try {
        const parts = path.split('/')
        let dir: FileSystemDirectoryHandle = sdDirectoryHandle
        for (let i = 0; i < parts.length - 1; i++) {
          dir = await (dir as any).getDirectoryHandle(parts[i])
        }
        const fileHandle = await (dir as any).getFileHandle(parts[parts.length - 1])
        const file = await fileHandle.getFile()
        return await file.arrayBuffer()
      } catch {
        return null
      }
    },
  },

  // ── edgetx ──────────────────────────────────────────────────────────────────

  edgetx: {
    scanSdCard: async (
      _sdDrive: string
    ): Promise<{
      hasModels: boolean
      hasYamlModels: boolean
      yamlModelFiles: string[]
      soundFiles: string[]
      scriptFiles: string[]
      dsmdataFiles: string[]
    }> => {
      const empty = { hasModels: false, hasYamlModels: false, yamlModelFiles: [], soundFiles: [], scriptFiles: [], dsmdataFiles: [] }
      const modelsDir = await getModelsDir()
      if (!modelsDir) return empty

      const yamlModelFiles: string[] = []
      const dsmdataFiles: string[] = []
      const soundFiles: string[] = []
      const scriptFiles: string[] = []

      // List the MODELS directory top-level only — skip subfolders like DELETED/UNUSED/DSMDATA
      try {
        for await (const [name, handle] of (modelsDir as any).entries() as AsyncIterable<[string, FileSystemHandle]>) {
          if (handle.kind !== 'file') continue
          const lc = name.toLowerCase()
          if ((lc.endsWith('.yml') || lc.endsWith('.yaml')) && lc !== 'labels.yml' && !lc.includes('.bak.')) {
            yamlModelFiles.push(name)
          } else if (lc.endsWith('.bin') || lc.endsWith('.dsmdata')) {
            dsmdataFiles.push(name)
          }
        }
      } catch (e) {
        console.warn('[FlightDeck] Error scanning MODELS dir:', e)
      }

      return {
        hasModels: yamlModelFiles.length > 0 || dsmdataFiles.length > 0,
        hasYamlModels: yamlModelFiles.length > 0,
        yamlModelFiles,
        soundFiles,
        scriptFiles,
        dsmdataFiles
      }
    },

    loadModelConfig: async (
      _sdDrive: string,
      filename: string
    ): Promise<{
      success: boolean
      modelName?: string
      channels?: object[]
      error?: string
    }> => {
      try {
        // Read directly from modelsDirHandle (set during scan)
        const dir = modelsDirHandle ?? sdDirectoryHandle
        if (!dir) return { success: false, error: 'No SD card connected' }
        const baseName = filename.split('/').pop() ?? filename
        const fileHandle = await (dir as any).getFileHandle(baseName)
        const file = await fileHandle.getFile()
        const text = await file.text()
        if (!text) return { success: false, error: 'File is empty' }
        const parsed = yamlLoad(text) as Record<string, unknown> | null
        const header = parsed?.header as Record<string, unknown> | undefined
        return {
          success: true,
          modelName: header?.name as string | undefined,
          channels: Array.isArray(parsed?.channels) ? (parsed.channels as object[]) : []
        }
      } catch (err: unknown) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },

    saveModelYaml: (
      _sdDrive: string,
      filename: string,
      config: object
    ): Promise<{ success: boolean; error?: string }> =>
      writeFileToSd(filename, yamlDump(config))
        .then(() => ({ success: true }))
        .catch((err: unknown) => ({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        })),

    /** Write a raw YAML string to MODELS/<filename> on the SD card */
    writeModelYaml: async (
      filename: string,
      content: string
    ): Promise<{ success: boolean; error?: string }> => {
      try {
        const dir = await getModelsDir()
        if (!dir) throw new Error('No SD card selected — connect your radio SD card first')
        const fileHandle = await (dir as any).getFileHandle(filename, { create: true })
        const writable = await (fileHandle as any).createWritable()
        await writable.write(content)
        await writable.close()
        return { success: true }
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) }
      }
    },

    writeSetupScript: (
      _drivePath: string,
      modelName: string
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      const safe = modelName.replace(/[^a-zA-Z0-9_-]/g, '_')
      const filename = `${safe}_setup.lua`
      const content = `-- FlightDeck setup script for ${modelName}\n-- Generated by FlightDeck Web\n`
      return writeFileToSd(filename, content)
        .then(() => ({ success: true, path: filename }))
        .catch((err: unknown) => ({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        }))
    },

    writeConfigScript: (
      _sdDrive: string,
      config: object
    ): Promise<{ success: boolean; path?: string; error?: string }> => {
      const filename = 'flightdeck_config.lua'
      const content = `-- FlightDeck configuration\nlocal config = ${JSON.stringify(config, null, 2)}\nreturn config\n`
      return writeFileToSd(filename, content)
        .then(() => ({ success: true, path: filename }))
        .catch((err: unknown) => ({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        }))
    }
  }
}
