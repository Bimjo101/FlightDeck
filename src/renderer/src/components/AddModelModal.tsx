import { useState, useEffect, FormEvent } from 'react'
import { RCModel } from './ModelCard'

type NewModel = Omit<RCModel, 'id' | 'created_at' | 'updated_at'>

interface AddModelModalProps {
  onClose: () => void
  onSave: (model: NewModel) => Promise<void>
  editModel?: RCModel | null
}

const RADIO_BRANDS = ['RadioMaster', 'Spektrum', 'Futaba', 'FrSky', 'Graupner', 'FlySky', 'Jumper', 'ELRS', 'Other']
const MANUFACTURERS = [
  // E-flite / Horizon Hobby
  'E-flite', 'HobbyZone', 'Blade', 'Losi', 'Team Associated',
  // FMS / Volantex
  'FMS', 'Volantex RC',
  // Other popular
  'Freewing', 'Dynam', 'Motion RC', 'Arrows RC', 'Phoenix Model',
  'Top Flite', 'Great Planes', 'ParkZone', 'Tower Hobbies',
  'HSDJETS', 'VQ Model', 'Hangar 9', 'Other'
]
const TYPES = ['Airplane', 'Helicopter', 'Glider', 'Multirotor', 'Boat', 'Car']
const RECEIVERS = [
  // Spektrum
  'AR410', 'AR630', 'AR631', 'AR631 Plus', 'AR636', 'AR636A',
  'AR6335', 'AR6600T', 'AR8360T', 'AR9350', 'AR10360T', 'AR12360T',
  'SR6000T', 'SR3300T', 'DSMX Remote Receiver',
  // FrSky
  'XM+', 'R-XSR', 'X8R', 'RX4R', 'R9 Mini', 'R9 Slim+',
  // ELRS
  'RadioMaster RP1', 'RadioMaster RP2', 'Happymodel EP1', 'Happymodel EP2',
  'BetaFPV ELRS Lite', 'BETAFPV SuperD',
  // Futaba
  'R2008SB', 'R3008SB', 'R6208SB', 'R7008SB',
  // FlySky
  'FS-A8S', 'FS-X8B', 'FS-iA6B',
]

const RF_PROTOCOLS: Record<string, string[]> = {
  'DSMX':   ['22ms', '11ms'],
  'DSM2':   ['22ms', '11ms'],
  'ACCESS': ['18ch / 16ms', '12ch / 8ms'],
  'ELRS':   ['50 Hz', '150 Hz', '250 Hz', '500 Hz'],
  'FASST':  ['Multi', '7ch'],
  'FHSS':   ['Multi', 'Single'],
  'Other':  [],
}
const STATUSES = ['active', 'archived']

const defaultForm: NewModel = {
  name: '',
  brand: '',
  manufacturer: '',
  type: '',
  receiver: '',
  protocol: '',
  sub_type: '',
  notes: '',
  status: 'active',
  photo_path: ''
}

function AddModelModal({ onClose, onSave, editModel }: AddModelModalProps): JSX.Element {
  const [form, setForm] = useState<NewModel>(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  useEffect(() => {
    if (editModel) {
      // Handle legacy combined "DSMX 22ms" protocol format
      let proto = editModel.protocol ?? ''
      let subtype = editModel.sub_type ?? ''
      if (!subtype && proto.includes(' ')) {
        const spaceIdx = proto.indexOf(' ')
        subtype = proto.slice(spaceIdx + 1)
        proto = proto.slice(0, spaceIdx)
      }
      setForm({
        name: editModel.name ?? '',
        brand: editModel.brand ?? '',
        manufacturer: editModel.manufacturer ?? '',
        type: editModel.type ?? '',
        receiver: editModel.receiver ?? '',
        protocol: proto,
        sub_type: subtype,
        notes: editModel.notes ?? '',
        status: editModel.status ?? 'active',
        photo_path: editModel.photo_path ?? ''
      })
      if (editModel.photo_path) {
        window.api.photo.getDataUrl(editModel.photo_path).then(setPhotoPreview)
      } else {
        setPhotoPreview(null)
      }
    } else {
      setForm(defaultForm)
      setPhotoPreview(null)
    }
  }, [editModel])

  const pickPhoto = async (): Promise<void> => {
    const srcPath = await window.api.dialog.openImage()
    if (!srcPath) return
    const savedPath = await window.api.photo.save(srcPath)
    setForm((prev) => ({ ...prev, photo_path: savedPath }))
    const dataUrl = await window.api.photo.getDataUrl(savedPath)
    setPhotoPreview(dataUrl)
  }

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!form.name.trim()) {
      setError('Model name is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      setError('Failed to save model. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose()
  }

  const inputClass =
    'w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-[#e6edf3] text-sm placeholder-[#8b949e] focus:outline-none focus:border-[#2563eb] transition-colors'

  const labelClass = 'block text-[#8b949e] text-[12px] font-semibold uppercase tracking-wider mb-1.5'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
      onClick={handleBackdropClick}
    >
      <div className="bg-[#161b22] rounded-2xl border border-[#30363d] w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#30363d]">
          <div>
            <h2 className="text-[#e6edf3] font-semibold text-base">
              {editModel ? 'Edit Model' : 'Add New Model'}
            </h2>
            <p className="text-[#8b949e] text-[12px] mt-0.5">
              {editModel ? 'Update your RC model details' : 'Register a new RC model to your library'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-[#e6edf3] text-xl leading-none px-1 transition-colors"
          >
            ×
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Photo upload */}
          <div>
            <label className={labelClass}>Photo</label>
            <button
              type="button"
              onClick={pickPhoto}
              className="w-full h-32 rounded-lg border-2 border-dashed border-[#30363d] hover:border-[#2563eb] transition-colors overflow-hidden flex items-center justify-center bg-[#0d1117]"
            >
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Model preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-[#8b949e] pointer-events-none">
                  <span className="text-3xl">📷</span>
                  <span className="text-[12px]">Click to add photo</span>
                </div>
              )}
            </button>
          </div>

          {/* Name */}
          <div>
            <label className={labelClass}>
              Model Name <span className="text-red-400 normal-case text-[11px]">*</span>
            </label>
            <input
              type="text"
              className={inputClass}
              placeholder="e.g. Apprentice STS 1.5m"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
          </div>

          {/* Radio Brand + Aircraft Type row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Radio / RX Brand</label>
              <select
                className={inputClass}
                value={form.brand ?? ''}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
              >
                <option value="">Select radio brand</option>
                {RADIO_BRANDS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
              <p className="text-[#8b949e] text-[11px] mt-1">Your transmitter / receiver system</p>
            </div>
            <div>
              <label className={labelClass}>Aircraft Type</label>
              <select
                className={inputClass}
                value={form.type ?? ''}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="">Select type</option>
                {TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Plane Manufacturer + Date Added row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Plane Maker</label>
              <input
                type="text"
                list="manufacturer-list"
                className={inputClass}
                placeholder="e.g. E-flite, FMS..."
                value={form.manufacturer ?? ''}
                onChange={(e) => setForm({ ...form, manufacturer: e.target.value })}
              />
              <datalist id="manufacturer-list">
                {MANUFACTURERS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="text-[#8b949e] text-[11px] mt-1">Who made the aircraft</p>
            </div>
            <div>
              <label className={labelClass}>Date Added</label>
              <div className={`${inputClass} text-[#8b949e] select-none`}>
                {editModel?.created_at
                  ? new Date(editModel.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : 'Today — ' + new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Receiver Model */}
          <div>
            <label className={labelClass}>Receiver Model</label>
            <input
              type="text"
              list="receiver-list"
              className={inputClass}
              placeholder="Select or type receiver..."
              value={form.receiver ?? ''}
              onChange={(e) => setForm({ ...form, receiver: e.target.value })}
            />
            <datalist id="receiver-list">
              {RECEIVERS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>

          {/* RF Protocol + Sub Type — mirrors RadioMaster model setup */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>RF Protocol</label>
              <select
                className={inputClass}
                value={form.protocol ?? ''}
                onChange={(e) => {
                  const newProto = e.target.value
                  const subtypes = RF_PROTOCOLS[newProto] ?? []
                  setForm({ ...form, protocol: newProto, sub_type: subtypes[0] ?? '' })
                }}
              >
                <option value="">Select protocol</option>
                {Object.keys(RF_PROTOCOLS).map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Sub Type</label>
              {(RF_PROTOCOLS[form.protocol ?? ''] ?? []).length > 0 ? (
                <select
                  className={inputClass}
                  value={form.sub_type ?? ''}
                  onChange={(e) => setForm({ ...form, sub_type: e.target.value })}
                >
                  {(RF_PROTOCOLS[form.protocol ?? ''] ?? []).map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              ) : (
                <div className={`${inputClass} text-[#484f58] select-none`}>
                  {form.protocol ? 'No sub type' : 'Select protocol first'}
                </div>
              )}
              {(form.protocol === 'DSMX' || form.protocol === 'DSM2') && (
                <p className="text-[#8b949e] text-[11px] mt-1">Use 22ms with analog or mixed servos</p>
              )}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelClass}>Status</label>
            <select
              className={inputClass}
              value={form.status ?? 'active'}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              className={`${inputClass} resize-none`}
              rows={3}
              placeholder="Battery config, servo types (analog/digital/mixed), trim settings, flight notes..."
              value={form.notes ?? ''}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          {error && (
            <div className="text-red-400 text-[13px] bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#30363d] bg-[#161b22]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d] text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-[#2563eb] hover:bg-[#1d4ed8] disabled:opacity-50 text-white text-sm font-medium transition-colors"
          >
            {saving ? 'Saving...' : editModel ? 'Save Changes' : 'Add Model'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddModelModal
