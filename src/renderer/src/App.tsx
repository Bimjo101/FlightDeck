import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ModelLibrary from './components/ModelLibrary'
import ModelDetail from './components/ModelDetail'
import RadioDashboard from './components/RadioDashboard'
import { RCModel } from './components/ModelCard'

export type Section = 'library' | 'active' | 'archived' | 'radio' | 'settings'

function App(): JSX.Element {
  const [activeSection, setActiveSection] = useState<Section>('library')
  const [selectedModel, setSelectedModel] = useState<RCModel | null>(null)

  const handleSelectModel = (model: RCModel): void => {
    setSelectedModel(model)
  }

  const handleBackFromDetail = (): void => {
    setSelectedModel(null)
  }

  const handleModelUpdate = (updated: RCModel): void => {
    setSelectedModel(updated)
  }

  const renderContent = (): JSX.Element => {
    // If a model is selected, show detail view regardless of which section is active
    if (selectedModel) {
      return (
        <ModelDetail
          model={selectedModel}
          onBack={handleBackFromDetail}
          onUpdate={handleModelUpdate}
        />
      )
    }

    switch (activeSection) {
      case 'library':
        return <ModelLibrary onSelectModel={handleSelectModel} />
      case 'active':
        return <ModelLibrary statusFilter="active" onSelectModel={handleSelectModel} />
      case 'archived':
        return <ModelLibrary statusFilter="archived" onSelectModel={handleSelectModel} />
      case 'radio':
        return <RadioDashboard />
      case 'settings':
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="text-5xl mb-4">⚙️</div>
              <h2 className="text-xl font-semibold text-[#e6edf3] mb-2">Settings</h2>
              <p className="text-[#8b949e]">Coming soon in the next milestone</p>
            </div>
          </div>
        )
      default:
        return <ModelLibrary onSelectModel={handleSelectModel} />
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0d1117]">
      <Sidebar activeSection={activeSection} onSectionChange={(section) => {
        setSelectedModel(null)   // Clear detail when navigating sections
        setActiveSection(section)
      }} />
      <main className="flex-1 overflow-hidden">
        {renderContent()}
      </main>
    </div>
  )
}

export default App
