export const isValidFirestoreId = (id) => {
    return typeof id === 'string'
        && id.length > 0
        && id.length <= 128
        && id !== '.'
        && id !== '..'
        && !id.includes('/')
        && !/^__.*__$/.test(id)
}
