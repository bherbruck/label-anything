import React from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export interface Label {
  id: string
  name: string
}

interface LabelManagerProps {
  labels: Label[]
  selectedLabelId: string | null
  onLabelSelect: (id: string | null) => void
  onLabelAdd: (name: string) => void
  onLabelRemove: (id: string) => void
}

const LabelManager: React.FC<LabelManagerProps> = ({
  labels,
  selectedLabelId,
  onLabelSelect,
  onLabelAdd,
  onLabelRemove,
}) => {
  const [newLabelName, setNewLabelName] = React.useState('')

  const handleAddLabel = (e: React.FormEvent) => {
    e.preventDefault()
    if (newLabelName.trim()) {
      onLabelAdd(newLabelName.trim())
      setNewLabelName('')
    }
  }

  return (
    <Card className="w-[200px] flex-none">
      <CardContent className="p-4">
        <div className="space-y-4">
          <form onSubmit={handleAddLabel} className="flex gap-2">
            <Input
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              placeholder="Add label..."
              className="h-8"
            />
            <Button type="submit" size="sm" variant="outline" className="h-8 w-8 p-0">
              <Plus className="h-4 w-4" />
            </Button>
          </form>

          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <Badge
                key={label.id}
                variant={selectedLabelId === label.id ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => onLabelSelect(selectedLabelId === label.id ? null : label.id)}
              >
                {label.name}
                <button
                  className="hover:bg-primary-foreground/20 ml-1 rounded-full"
                  onClick={(e) => {
                    e.stopPropagation()
                    onLabelRemove(label.id)
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default LabelManager
