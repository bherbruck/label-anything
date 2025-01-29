import React from 'react'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'

interface ToolbarProps {
  onSave: () => void
  hasChanges: boolean
  hasMasks: boolean
}

export const Toolbar: React.FC<ToolbarProps> = ({ onSave, hasChanges }) => {
  return (
    <div className="flex h-12 items-center gap-2 px-6">
      <Button variant="outline" size="sm" onClick={onSave} disabled={!hasChanges}>
        <Save className="mr-2 h-4 w-4" />
        Save Masks
      </Button>
    </div>
  )
}
