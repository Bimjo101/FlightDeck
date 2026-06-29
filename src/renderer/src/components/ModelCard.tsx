import { useState, useEffect } from 'react'

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

interface ModelCardProps {
  model: RCModel
  onEdit: (model: RCModel) => void
  onDelete: (id: string) => void
  onClick?: () => void
}

function getBrandAccent(brand?: string): string {
  switch (brand?.toLowerCase()) {
    case 'spektrum':
      return '#2563eb'
    case 'futaba':
      return '#dc2626'
    case 'frsky':
      return '#ea580c'
    case 'graupner':
      return '#16a34a'
    case 'flysky':
      return '#7c3aed'
    case 'elrs':
      return '#0891b2'
    default:
      return '#374151'
  }
}

function getTypeIcon(type?: string): string {
  switch (type?.toLowerCase()) {
    case 'airplane':
      return '✈️'
    case 'helicopter':
      return '🚁'
    case 'glider':
      return '🛩️'
    case 'multirotor':
      return '🚀'
    case 'boat':
      return '⛵'
    case 'car':
      return '🏎️'
    default:
      return '✈️'
  }
}

function ModelCard({ model, onEdit, onDelete, onClick }: ModelCardProps): JSX.Element {
  const accent = getBrandAccent(model.brand)
  const icon = getTypeIcon(model.type)
  const isActive = !model.status || model.status === 'active'
  const [photoSrc, setPhotoSrc] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (model.photo_path) {
      window.api.photo.getDataUrl(model.photo_path).then(setPhotoSrc)
    } else {
      setPhotoSrc(null)
    }
  }, [model.photo_path])

  const handleDeleteClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    setConfirmDelete(true)
  }

  const handleEditClick = (e: React.MouseEvent): void => {
    e.stopPropagation()
    onEdit(model)
  }

  return (
    <div
      className={[
        'bg-[#161b22] rounded-xl border border-[#30363d] overflow-hidden flex flex-col',
        'hover:border-[#484f58] transition-colors duration-150 group',
        onClick ? 'cursor-pointer' : ''
      ].join(' ')}
      onClick={onClick}
    >
      {/* Brand color band */}
      <div className="h-1.5 w-full" style={{ background: accent }} />

      {/* Photo or icon area */}
      {photoSrc ? (
        <div className="h-36 w-full overflow-hidden">
          <img
            src={photoSrc}
            alt={model.name}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center py-7 px-4 bg-[#161b22]">
          <div
            className="flex items-center justify-center w-20 h-20 rounded-2xl text-4xl"
            style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
          >
            {icon}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex flex-col gap-2 px-4 pb-4 flex-1">
        <div>
          <h3 className="text-[#e6edf3] font-semibold text-[15px] leading-tight truncate">
            {model.name}
          </h3>
          <p className="text-[#8b949e] text-[13px] mt-0.5 truncate">
            {[model.manufacturer, model.type].filter(Boolean).join(' · ') || 'No maker/type set'}
          </p>
        </div>

        {model.receiver && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#8b949e] text-[11px] uppercase tracking-wider font-medium">RX</span>
            <span className="text-[#e6edf3] text-[12px] font-mono bg-[#21262d] px-2 py-0.5 rounded truncate">
              {model.receiver}
            </span>
          </div>
        )}

        {model.protocol && (
          <div className="flex items-center gap-1.5">
            <span className="text-[#8b949e] text-[11px] uppercase tracking-wider font-medium">Proto</span>
            <span
              className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: `${accent}20`,
                color: accent,
                border: `1px solid ${accent}40`
              }}
            >
              {[model.protocol, model.sub_type].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Status + actions */}
        <div className="flex items-center justify-between pt-2 border-t border-[#30363d] mt-1">
          <span
            className={[
              'text-[11px] font-semibold px-2.5 py-0.5 rounded-full',
              isActive
                ? 'bg-[#3fb95020] text-[#3fb950] border border-[#3fb95040]'
                : 'bg-[#30363d] text-[#8b949e] border border-[#484f58]'
            ].join(' ')}
          >
            {isActive ? 'Active' : 'Archived'}
          </span>

          {confirmDelete ? (
            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              <span className="text-[#e6edf3] text-[11px]">Delete?</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(model.id) }}
                className="text-white text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-500 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}
                className="text-[#8b949e] hover:text-[#e6edf3] text-xs px-2 py-1 rounded bg-[#21262d] hover:bg-[#30363d] transition-colors"
              >
                No
              </button>
            </div>
          ) : (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
              <button
                onClick={handleEditClick}
                className="text-[#8b949e] hover:text-[#e6edf3] text-xs px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] transition-colors"
              >
                Edit
              </button>
              <button
                onClick={handleDeleteClick}
                className="text-[#8b949e] hover:text-red-400 text-xs px-2.5 py-1 rounded bg-[#21262d] hover:bg-[#30363d] transition-colors"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ModelCard
