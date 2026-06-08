import React from 'react'
import { cn } from '@/lib/utils'

const PORTFOLIO_URL = 'https://portfolio-msrishav.vercel.app/'

const CreatorCredit = ({ className, compact = false }) => (
    <p className={cn(
        'text-center text-xs leading-relaxed text-muted-foreground',
        compact && 'text-left leading-snug',
        className,
    )}>
        Created by{' '}
        <a
            href={PORTFOLIO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-4 hover:underline"
        >
            M S Rishav Subhin
        </a>
        , BTech ELCS 2023 batch.
    </p>
)

export default CreatorCredit
