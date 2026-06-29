import { useState, useEffect, useCallback } from 'react'
import ModelCard, { RCModel } from './ModelCard'
import AddModelModal from './AddModelModal'

type NewModel = Omit<RCModel, 'id' | 'created_at' | 'updated_at'>

interface ModelLibraryProps {
  statusFilter?: 'active' | 'archived'
  onSelectModel?: (model: RCModel) => void
}

declare global {
  interface Window {
    api: {
      models: {
        getAll: () => Promise<RCModel[]>
        add: (model: NewModel) => Promise<RCModel>
        update: (model: Partial<RCModel> & { id: string }) => Promise<RCModel | undefined>
        delete: (id: string) => Promise<boolean>
      }
      dialog: {
        openImage: () => Promise<string | null>
      }
      photo: {
        save: (srcPath: string) => Promise<string>
        getDataUrl: (filePath: string) => Promise<string | null>
      }
      sdcard: {
        detect: () => Promise<{ connected: boolean; drivePath: string | null }>
        writeConfig: (
          drivePath: string,
          modelName: string,
          config: object
        ) => Promise<{ success: boolean; filePath?: string; error?: string }>
      }
    }
  }
}

function ModelLibrary({ statusFilter, onSelectModel }: ModelLibraryProps): JSX.Element {
  const [models, setModels] = useState<RCModel[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editModel, setEditModel] = useState<RCModel | null>(null)

  const loadModels = useCallback(async (): Promise<void> => {
    try {
      const all = await window.api.models.getAll()
      setModels(all)
    } catch (err) {
      console.error('Failed to load models:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadModels()
  }, [loadModels])

  const filtered = models.filter((m) => {
    const matchesStatus = statusFilter ? m.status === statusFilter : true
    const q = search.toLowerCase()
    const matchesSearch =
      !q ||
      m.name.toLowerCase().includes(q) ||
      (m.brand ?? '').toLowerCase().includes(q) ||
      (m.type ?? '').toLowerCase().includes(q) ||
      (m.receiver ?? '').toLowerCase().includes(q)
    return matchesStatus && matchesSearch
  })

  const handleSave = async (model: NewModel): Promise<void> => {
    if (editModel) {
      await window.api.models.update({ ...model, id: editModel.id })
    } else {
      await window.api.models.add(model)
    }
    await loadModels()
  }

  const handleEdit = (model: RCModel): void => {
    setEditModel(model)
    setShowModal(true)
  }

  const handleDelete = async (id: string): Promise<void> => {
    await window.api.models.delete(id)
    await loadModels()
  }

  const handleAddClick = (): void => {
    setEditModel(null)
    setShowModal(true)
  }

  const title = statusFilter === 'active'
    ? 'Active Models'
    : statusFilter === 'archived'
    ? 'Archived Models'
    : 'Model Library'

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-[#30363d] shrink-0">
        <div>
          <h1 className="text-[#e6edf3] text-xl font-bold tracking-tight">{title}</h1>
          <p className="text-[#8b949e] text-[13px] mt-0.5">
            {loading ? 'Loading...' : `${filtered.length} model${filtered.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={handleAddClick}
          className="flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <span className="text-base leading-none">+</span>
          Add Model
        </button>
      </div>

      {/* Search */}
      <div className="px-8 py-4 shrink-0">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e] text-sm">
            🔍
          </span>
          <input
            type="text"
            placeholder="Search by name, brand, type, receiver..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#21262d] border border-[#30363d] rounded-lg pl-9 pr-4 py-2.5 text-[#e6edf3] text-sm placeholder-[#8b949e] focus:outline-none focus:border-[#2563eb] transition-colors max-w-md"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8b949e] hover:text-[#e6edf3] text-lg leading-none transition-colors"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 pb-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-[#8b949e] text-sm">Loading your fleet...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="text-6xl mb-4 opacity-40">✈️</div>
            {search ? (
              <>
                <h3 className="text-[#e6edf3] font-semibold text-base mb-1">No models found</h3>
                <p className="text-[#8b949e] text-sm mb-4">
                  No results for "{search}". Try a different search.
                </p>
                <button
                  onClick={() => setSearch('')}
                  className="text-[#2563eb] hover:text-[#1d4ed8] text-sm font-medium transition-colors"
                >
                  Clear search
                </button>
              </>
            ) : (
              <>
                <h3 className="text-[#e6edf3] font-semibold text-base mb-1">No models yet</h3>
                <p className="text-[#8b949e] text-sm mb-5">
                  Add your first RC model to start building your fleet.
                </p>
                <button
                  onClick={handleAddClick}
                  className="flex items-center gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  <span className="text-base leading-none">+</span>
                  Add Your First Model
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
            {filtered.map((model) => (
              <ModelCard
                key={model.id}
                model={model}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onClick={onSelectModel ? () => onSelectModel(model) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <AddModelModal
          onClose={() => setShowModal(false)}
          onSave={handleSave}
          editModel={editModel}
        />
      )}
    </div>
  )
}

export default ModelLibrary
