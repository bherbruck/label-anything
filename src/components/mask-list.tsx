import { Card, CardContent } from '@/components/ui/card'
import { Label, Mask } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Trash2 } from 'lucide-react'
import React from 'react'

interface MaskListProps {
  masks: Mask[]
  labels: Label[]
  selectedMaskId: number | null
  onMaskSelect: (id: number) => void
  onMaskRemove: (id: number) => void
}

export const MaskList: React.FC<MaskListProps> = ({
  masks,
  labels,
  selectedMaskId,
  onMaskSelect,
  onMaskRemove,
}) => {
  const getLabelName = (labelId: string | undefined) => {
    if (!labelId) return null
    return labels.find((l) => l.id === labelId)?.name
  }

  return (
    <Card className="w-[200px] flex-none">
      <CardContent className="p-4">
        <div className="space-y-2">
          <div className="text-sm font-medium">Masks</div>
          <div className="space-y-1">
            {masks.length > 0 ? (
              masks
                .filter((mask) => mask.id !== -1) // Exclude preview masks
                .map((mask) => (
                  <div
                    key={mask.id}
                    className={cn(
                      'group flex cursor-pointer flex-col gap-1 rounded-md px-2 py-1.5',
                      'transition-colors duration-200',
                      'hover:bg-accent/80 hover:text-accent-foreground',
                      selectedMaskId === mask.id && 'bg-accent text-accent-foreground',
                    )}
                    onClick={() => onMaskSelect(mask.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-sm"
                          style={{
                            backgroundColor: `rgb(${mask.color[0]}, ${mask.color[1]}, ${mask.color[2]})`,
                          }}
                        />
                        <span className="text-sm">
                          {mask.labelId ? getLabelName(mask.labelId) : `Mask ${mask.id}`}
                        </span>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onMaskRemove(mask.id)
                        }}
                        className="opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
            ) : (
              <div className="text-muted-foreground py-8 text-center text-sm">
                No masks created yet
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
