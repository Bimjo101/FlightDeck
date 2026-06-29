import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import { randomUUID } from 'crypto'

const dbPath = path.join(app.getPath('userData'), 'flightdeck.db')
const db = new Database(dbPath)

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL')

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS models (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    type TEXT,
    receiver TEXT,
    protocol TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active',
    photo_path TEXT,
    created_at INTEGER,
    updated_at INTEGER
  )
`)

// Migrate: add AS3X / Forward Programming columns if they don't exist
const existingCols = (
  db.prepare('PRAGMA table_info(models)').all() as { name: string }[]
).map((c) => c.name)

const asxCols: { name: string; def: string }[] = [
  { name: 'roll_gain',     def: 'INTEGER DEFAULT 0' },
  { name: 'pitch_gain',    def: 'INTEGER DEFAULT 0' },
  { name: 'yaw_gain',      def: 'INTEGER DEFAULT 0' },
  { name: 'safe_enabled',  def: 'INTEGER DEFAULT 0' },
  { name: 'ch1_function',  def: "TEXT DEFAULT 'Aileron'" },
  { name: 'ch2_function',  def: "TEXT DEFAULT 'Elevator'" },
  { name: 'ch3_function',  def: "TEXT DEFAULT 'Throttle'" },
  { name: 'ch4_function',  def: "TEXT DEFAULT 'Rudder'" },
  { name: 'ch5_function',  def: "TEXT DEFAULT 'SAFE Select'" },
  { name: 'ch6_function',  def: "TEXT DEFAULT ''" },
  { name: 'frame_rate',    def: "TEXT DEFAULT '22ms'" },
  { name: 'manufacturer',  def: "TEXT DEFAULT ''" },
  { name: 'sub_type',      def: "TEXT DEFAULT ''" }
]

for (const col of asxCols) {
  if (!existingCols.includes(col.name)) {
    db.exec(`ALTER TABLE models ADD COLUMN ${col.name} ${col.def}`)
  }
}

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
  created_at?: number
  updated_at?: number
  manufacturer?: string
  sub_type?: string
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

export function getAllModels(): RCModel[] {
  return db.prepare('SELECT * FROM models ORDER BY created_at DESC').all() as RCModel[]
}

export function getModelById(id: string): RCModel | undefined {
  return db.prepare('SELECT * FROM models WHERE id = ?').get(id) as RCModel | undefined
}

export function addModel(model: Omit<RCModel, 'id' | 'created_at' | 'updated_at'>): RCModel {
  const now = Date.now()
  const id = randomUUID()
  const stmt = db.prepare(`
    INSERT INTO models (
      id, name, brand, type, receiver, protocol, notes, status, photo_path,
      roll_gain, pitch_gain, yaw_gain, safe_enabled,
      ch1_function, ch2_function, ch3_function, ch4_function, ch5_function, ch6_function,
      frame_rate, manufacturer, sub_type, created_at, updated_at
    )
    VALUES (
      @id, @name, @brand, @type, @receiver, @protocol, @notes, @status, @photo_path,
      @roll_gain, @pitch_gain, @yaw_gain, @safe_enabled,
      @ch1_function, @ch2_function, @ch3_function, @ch4_function, @ch5_function, @ch6_function,
      @frame_rate, @manufacturer, @sub_type, @created_at, @updated_at
    )
  `)
  stmt.run({
    id,
    name: model.name,
    brand: model.brand ?? null,
    type: model.type ?? null,
    receiver: model.receiver ?? null,
    protocol: model.protocol ?? null,
    notes: model.notes ?? null,
    status: model.status ?? 'active',
    photo_path: model.photo_path ?? null,
    roll_gain: model.roll_gain ?? 0,
    pitch_gain: model.pitch_gain ?? 0,
    yaw_gain: model.yaw_gain ?? 0,
    safe_enabled: model.safe_enabled ?? 0,
    ch1_function: model.ch1_function ?? 'Aileron',
    ch2_function: model.ch2_function ?? 'Elevator',
    ch3_function: model.ch3_function ?? 'Throttle',
    ch4_function: model.ch4_function ?? 'Rudder',
    ch5_function: model.ch5_function ?? 'SAFE Select',
    ch6_function: model.ch6_function ?? '',
    frame_rate: model.frame_rate ?? '22ms',
    manufacturer: model.manufacturer ?? '',
    sub_type: model.sub_type ?? '',
    created_at: now,
    updated_at: now
  })
  return getModelById(id)!
}

export function updateModel(model: Partial<RCModel> & { id: string }): RCModel | undefined {
  const now = Date.now()
  const stmt = db.prepare(`
    UPDATE models
    SET name          = COALESCE(@name, name),
        brand         = COALESCE(@brand, brand),
        type          = COALESCE(@type, type),
        receiver      = COALESCE(@receiver, receiver),
        protocol      = COALESCE(@protocol, protocol),
        notes         = COALESCE(@notes, notes),
        status        = COALESCE(@status, status),
        photo_path    = COALESCE(@photo_path, photo_path),
        roll_gain     = COALESCE(@roll_gain, roll_gain),
        pitch_gain    = COALESCE(@pitch_gain, pitch_gain),
        yaw_gain      = COALESCE(@yaw_gain, yaw_gain),
        safe_enabled  = COALESCE(@safe_enabled, safe_enabled),
        ch1_function  = COALESCE(@ch1_function, ch1_function),
        ch2_function  = COALESCE(@ch2_function, ch2_function),
        ch3_function  = COALESCE(@ch3_function, ch3_function),
        ch4_function  = COALESCE(@ch4_function, ch4_function),
        ch5_function  = COALESCE(@ch5_function, ch5_function),
        ch6_function  = COALESCE(@ch6_function, ch6_function),
        frame_rate    = COALESCE(@frame_rate, frame_rate),
        manufacturer  = COALESCE(@manufacturer, manufacturer),
        sub_type      = COALESCE(@sub_type, sub_type),
        updated_at    = @updated_at
    WHERE id = @id
  `)
  const params = {
    roll_gain: null,
    pitch_gain: null,
    yaw_gain: null,
    safe_enabled: null,
    ch1_function: null,
    ch2_function: null,
    ch3_function: null,
    ch4_function: null,
    ch5_function: null,
    ch6_function: null,
    frame_rate: null,
    manufacturer: null,
    sub_type: null,
    ...model,
    updated_at: now
  }
  stmt.run(params)
  return getModelById(model.id)
}

export function deleteModel(id: string): boolean {
  const result = db.prepare('DELETE FROM models WHERE id = ?').run(id)
  return result.changes > 0
}
