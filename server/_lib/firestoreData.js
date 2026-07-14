export const fromFirestoreDocument = (snapshot) => ({
    ...snapshot.data(),
    // A stored `id` field is untrusted denormalized data. The Firestore
    // document name is the authoritative identifier for every server action.
    id: snapshot.id,
})

export const hasStoredDocumentIdMismatch = (snapshot) => {
    const data = snapshot?.data?.()
    return Boolean(
        data
        && typeof data === 'object'
        && !Array.isArray(data)
        && Object.prototype.hasOwnProperty.call(data, 'id')
        && data.id !== snapshot.id,
    )
}
