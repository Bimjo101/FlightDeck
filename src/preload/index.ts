import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface RCModel {
  id: string
  name: string
  brand?: string
  type?: string
  receiver?: string
  protocol?: string
  notes?: string
  status?: string
  photo_path?: string
  manufacturer?: string
  sub_type?: string
  created_at?: number
  updated_at?: number
  // AS3X / Forward Programming
  roll_gain?: number
  pitch_gain?: number
  yaw_gain?: number
  safe_enabled?: number
  ch1_function?: string
  ch2_function?: string
  ch3_function?: string
  ch4_function?: string
  ch5_function?: string
  ch6_function?: string
  frame_rate?: string
}

export type NewModel = Omit<RCModel, 'id' | 'created_at' | 'updated_at'>

export interface SDCardStatus {
  connected: boolean
  drivePath: string | null
}

const api = {
  models: {
    getAll: (): Promise<RCModel[]> => ipcRenderer.invoke('models:getAll'),
    add: (model: NewModel): Promise<RCModel> => ipcRenderer.invoke('models:add', model),
    update: (model: Partial<RCModel> & { id: string }): Promise<RCModel | undefined> =>
      ipcRenderer.invoke('models:update', model),
    delete: (id: string): Promise<boolean> => ipcRenderer.invoke('models:delete', id)
  },
  dialog: {
    openImage: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile')
  },
  photo: {
    save: (srcPath: string): Promise<string> => ipcRenderer.invoke('photo:save', srcPath),
    getDataUrl: (filePath: string): Promise<string | null> =>
      ipcRenderer.invoke('photo:getDataUrl', filePath)
  },
  sdcard: {
    detect: (): Promise<SDCardStatus> => ipcRenderer.invoke('sdcard:detect'),
    writeConfig: (
      drivePath: string,
      modelName: string,
      config: object
    ): Promise<{ success: boolean; filePath?: string; error?: string }> =>
      ipcRenderer.invoke('sdcard:writeConfig', drivePath, modelName, config)
  },
  edgetx: {
    writeSetupScript: (
      drivePath: string,
      modelName: string
    ): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('edgetx:writeSetupScript', drivePath, modelName),

    scanSdCard: (
      sdDrive: string
    ): Promise<{
      hasModels: boolean
      hasYamlModels: boolean
      yamlModelFiles: string[]
      soundFiles: string[]
      scriptFiles: string[]
      dsmdataFiles: string[]
    }> => ipcRenderer.invoke('edgetx:scanSdCard', sdDrive),

    writeConfigScript: (
      sdDrive: string,
      config: object
    ): Promise<{ success: boolean; path?: string; error?: string }> =>
      ipcRenderer.invoke('edgetx:writeConfigScript', sdDrive, config),

    loadModelConfig: (
      sdDrive: string,
      filename: string
    ): Promise<{
      success: boolean
      modelName?: string
      channels?: object[]
      error?: string
    }> => ipcRenderer.invoke('edgetx:loadModelConfig', sdDrive, filename),

    saveModelYaml: (
      sdDrive: string,
      filename: string,
      config: object
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('edgetx:saveModelYaml', sdDrive, filename, config)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
