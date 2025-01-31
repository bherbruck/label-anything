import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface UnsavedChangesDialogProps {
  isOpen: boolean
  onContinue: () => void
  onCancel: () => void
  onSave: () => void
}

export function UnsavedChangesDialog({
  isOpen,
  onContinue,
  onCancel,
  onSave,
}: UnsavedChangesDialogProps) {
  return (
    <AlertDialog open={isOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
          <AlertDialogDescription>
            You have unsaved changes. Are you sure you want to switch images? Your changes will be
            lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={onContinue}>
            Discard and Continue
          </Button>
          <AlertDialogAction onClick={onSave}>Save and Continue</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
