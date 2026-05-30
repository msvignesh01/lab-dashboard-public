import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const ConfirmDialog = ({
    open,
    title,
    description,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    loading = false,
    onConfirm,
    onOpenChange,
}) => (
    <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
                    {cancelLabel}
                </Button>
                <Button variant={destructive ? 'destructive' : 'default'} onClick={onConfirm} disabled={loading}>
                    {loading ? 'Working...' : confirmLabel}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
)

export default ConfirmDialog
