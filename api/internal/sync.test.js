import { describe, expect, it } from 'vitest'
import { toSafeString } from './sync'

describe('audit sync sanitization', () => {
    it('escapes spreadsheet formula prefixes', () => {
        expect(toSafeString('=IMPORTXML("https://example.com")')).toBe('\'=IMPORTXML("https://example.com")')
        expect(toSafeString('+SUM(1,2)')).toBe("'+SUM(1,2)")
        expect(toSafeString('-10+20')).toBe("'-10+20")
        expect(toSafeString('@cmd')).toBe("'@cmd")
    })

    it('trims and bounds values', () => {
        expect(toSafeString('  normal  ', 20)).toBe('normal')
        expect(toSafeString('abcdef', 3)).toBe('abc')
    })
})
