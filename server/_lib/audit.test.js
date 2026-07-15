import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./firebaseAdmin.js', () => ({
    adminDb: {
        collection: vi.fn(),
        runTransaction: vi.fn(),
    },
}))

import { adminDb } from './firebaseAdmin.js'
import { runAuditedTransaction } from './audit.js'

const machineRef = { collectionName: 'machines', id: 'machine-1' }

const makeTransaction = ({ failAudit = false } = {}) => {
    const pending = []
    return {
        pending,
        transaction: {
            set: vi.fn((ref, data, options) => {
                if (failAudit && ref.collectionName === 'audit_log') {
                    throw new Error('audit write failed')
                }
                pending.push({ operation: 'set', ref, data, options })
            }),
        },
    }
}

const auditedMachineMutation = (calls = null) => async (transaction) => {
    if (calls) calls.count += 1
    transaction.set(machineRef, { id: machineRef.id, name: 'Printer' })
    return {
        result: { id: machineRef.id, name: 'Printer' },
        audit: {
            action: 'machine.created',
            entity_type: 'machine',
            entity_id: machineRef.id,
            metadata: { name: 'Printer' },
        },
    }
}

describe('audited Firestore transactions', () => {
    let committed

    beforeEach(() => {
        vi.clearAllMocks()
        committed = []
        adminDb.collection.mockImplementation((collectionName) => ({
            doc: (id) => ({ collectionName, id }),
        }))
    })

    it('commits the domain mutation and audit record together', async () => {
        adminDb.runTransaction.mockImplementation(async (callback) => {
            const attempt = makeTransaction()
            const result = await callback(attempt.transaction)
            committed.push(...attempt.pending)
            return result
        })

        await expect(runAuditedTransaction({
            actor: { uid: 'admin-1', profile: { role: 'admin' } },
            mutate: auditedMachineMutation(),
        })).resolves.toEqual({ id: 'machine-1', name: 'Printer' })

        expect(committed.map((write) => write.ref.collectionName)).toEqual([
            'machines',
            'audit_log',
        ])
        expect(committed[1].data).toMatchObject({
            action: 'machine.created',
            entity_type: 'machine',
            entity_id: 'machine-1',
            actor_uid: 'admin-1',
            actor_role: 'admin',
        })
    })

    it('does not commit a staged domain mutation when the audit write fails', async () => {
        adminDb.runTransaction.mockImplementation(async (callback) => {
            const attempt = makeTransaction({ failAudit: true })
            const result = await callback(attempt.transaction)
            committed.push(...attempt.pending)
            return result
        })

        await expect(runAuditedTransaction({
            mutate: auditedMachineMutation(),
        })).rejects.toThrow('audit write failed')
        expect(committed).toEqual([])
    })

    it('rejects an unaudited mutation before the transaction can commit', async () => {
        adminDb.runTransaction.mockImplementation(async (callback) => {
            const attempt = makeTransaction()
            const result = await callback(attempt.transaction)
            committed.push(...attempt.pending)
            return result
        })

        await expect(runAuditedTransaction({
            mutate: async (transaction) => {
                transaction.set(machineRef, { id: machineRef.id })
                return { result: { id: machineRef.id } }
            },
        })).rejects.toThrow('did not provide an audit descriptor')
        expect(committed).toEqual([])
    })

    it('does not duplicate committed writes when Firestore retries the callback', async () => {
        const calls = { count: 0 }
        adminDb.runTransaction.mockImplementation(async (callback) => {
            const discardedAttempt = makeTransaction()
            await callback(discardedAttempt.transaction)

            const committedAttempt = makeTransaction()
            const result = await callback(committedAttempt.transaction)
            committed.push(...committedAttempt.pending)
            return result
        })

        await runAuditedTransaction({ mutate: auditedMachineMutation(calls) })

        expect(calls.count).toBe(2)
        expect(committed).toHaveLength(2)
        expect(committed.filter((write) => write.ref.collectionName === 'machines')).toHaveLength(1)
        expect(committed.filter((write) => write.ref.collectionName === 'audit_log')).toHaveLength(1)
    })
})
