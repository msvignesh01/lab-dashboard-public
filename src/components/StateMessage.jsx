import React from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, FileText, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

const StateMessage = ({
    type = 'empty',
    title,
    description,
    actionLabel,
    onAction,
    actionHref,
}) => {
    const Icon = type === 'error' ? AlertCircle : FileText
    const action = actionLabel && (onAction || actionHref)

    return (
        <div className="flex flex-col items-center justify-center gap-4 rounded-md border bg-card p-8 text-center">
            <Icon className={type === 'error' ? 'h-12 w-12 text-destructive/70' : 'h-12 w-12 text-muted-foreground/40'} />
            <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">{title}</h3>
                {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
            </div>
            {action && (
                <Button variant={type === 'error' ? 'outline' : 'default'} onClick={onAction} asChild={Boolean(actionHref)}>
                    {actionHref ? (
                        <Link to={actionHref}>{actionLabel}</Link>
                    ) : (
                        <>
                            {type === 'error' && <RefreshCw className="mr-2 h-4 w-4" />}
                            {actionLabel}
                        </>
                    )}
                </Button>
            )}
        </div>
    )
}

export default StateMessage
