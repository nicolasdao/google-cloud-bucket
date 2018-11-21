/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const { fetch, urlHelper } = require('./utils')

const BUCKET_UPLOAD_URL = (bucket, fileName) => `https://www.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(fileName)}`
const BUCKET_URL = bucket => `https://www.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}`
const BUCKET_FILE_URL = (bucket, filepath) => `${BUCKET_URL(bucket)}/o${ filepath ? `${filepath ? `/${encodeURIComponent(filepath)}` : ''}` : ''}`

const _validateRequiredParams = (params={}) => Object.keys(params).forEach(p => {
	if (!params[p])
		throw new Error(`Parameter '${p}' is required.`)
})

const putObject = (object, filePath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ object, filePath, token })
	const payload = typeof(object) == 'string' ? object : JSON.stringify(object || {})
	const [ bucket, ...names ] = filePath.split('/')

	const { contentType } = urlHelper.getInfo(filePath)

	return fetch.post(BUCKET_UPLOAD_URL(bucket, names.join('/')), {
		'Content-Type': contentType || 'application/json',
		'Content-Length': payload.length,
		Authorization: `Bearer ${token}`
	}, payload)
})

const getBucketFile = (bucket, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ filepath, token })

	const { contentType } = urlHelper.getInfo(filepath)

	return fetch.get(`${BUCKET_FILE_URL(bucket, filepath)}?alt=media`, {
		Accept: contentType || 'application/json',
		Authorization: `Bearer ${token}`
	}).then(({ status, data }) => {
		if (status < 400)
			return { status, data }

		let e = new Error(status == 404 ? 'Object not found' : status == 401 ? 'Access denied' : 'Internal Server Error')
		e.code = status
		e.data = data
		throw e
	})
})

const makePublic = (bucket, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })

	if (filepath) {
		const { ext } = urlHelper.getInfo(filepath)
		if (!ext)
			throw new Error('Bucket\'s folder cannot be made public. Only buckets or existing objects can be made public.')

		const payload = JSON.stringify({
			entity: 'allUsers',
			role: 'READER'
		})
		return fetch.post(`${BUCKET_FILE_URL(bucket, filepath)}/acl`, {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, payload).then(({ status, data }) => {
			if (status < 400) {
				data = data || {}
				data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
				return { status, data }
			}
			let e = new Error(status == 404 ? 'Object not found' : status == 401 ? 'Access denied' : 'Internal Server Error')
			e.code = status
			e.data = data
			throw e
		})
	} else {
		const payload = JSON.stringify({
			bindings:[{
				role: 'roles/storage.objectViewer',
				members: ['allUsers']
			}]
		})
		return fetch.put(`${BUCKET_URL(bucket)}/iam`, {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, payload).then(({ status, data }) => {
			if (status < 400) {
				data = data || {}
				data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
				return { status, data }
			}

			console.log(JSON.stringify(data, null, ' '))

			let e = new Error(status == 404 ? 'Object not found' : status == 401 ? 'Access denied' : 'Internal Server Error')
			e.code = status
			e.data = data
			throw e
		})
	}
})


module.exports = {
	insert: putObject,
	'get': getBucketFile,
	makePublic
}




