/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/


// Uploading data: https://cloud.google.com/storage/docs/json_api/v1/how-tos/upload
// Best practices: https://cloud.google.com/storage/docs/json_api/v1/how-tos/performance
// Object versioning: https://cloud.google.com/storage/docs/object-versioning
// Resumable upload: https://cloud.google.com/storage/docs/json_api/v1/how-tos/resumable-upload

const { fetch, urlHelper, obj: { merge } } = require('./utils')

const BUCKET_UPLOAD_URL = (bucket, fileName, options={}) => `https://www.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=${options.resumable ? 'resumable' : 'media'}&name=${encodeURIComponent(fileName)}`
const BUCKET_URL = bucket => `https://www.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}`
const BUCKET_FILE_URL = (bucket, filepath) => `${BUCKET_URL(bucket)}/o${ filepath ? `${filepath ? `/${encodeURIComponent(filepath)}` : ''}` : ''}`

const _validateRequiredParams = (params={}) => Object.keys(params).forEach(p => {
	if (!params[p])
		throw new Error(`Parameter '${p}' is required.`)
})

const putObject = (object, filePath, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ object, filePath, token })
	const payload = typeof(object) == 'string' || (object instanceof Buffer) ? object : JSON.stringify(object || {})
	const [ bucket, ...names ] = filePath.split('/')

	const { contentType='application/json' } = urlHelper.getInfo(filePath)

	let headers = merge(options.headers || {}, { 
		'Content-Length': payload.length,
		Authorization: `Bearer ${token}`
	})

	if (!headers['Content-Type'])
		headers['Content-Type'] = contentType

	return fetch.post(BUCKET_UPLOAD_URL(bucket, names.join('/')), headers, payload)
})

const getBucket = (bucket, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })

	const getData = fetch.get(BUCKET_URL(bucket), {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	}).catch(err => ({ status: 500, data: { error: { code: 500, message: err.message, stack: err.stack } } }))
	const getIam = fetch.get(`${BUCKET_URL(bucket)}/iam`, {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	}).catch(err => ({ status: 500, data: { error: { code: 500, message: err.message, stack: err.stack } } }))

	return Promise.all([getData, getIam]).then(([bucketRes, iamRes]) => {
		if (bucketRes && bucketRes.status < 400 && bucketRes.data) {
			let data = bucketRes.data
			data.iam = iamRes && iamRes.data ? iamRes.data : {}
			return { status: bucketRes.status, data }
		} else
			return bucketRes
	})
})

const getBucketFile = (bucket, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, filepath, token })

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

// Doc: https://cloud.google.com/storage/docs/json_api/v1/
const isBucketPublic = (bucket, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	return getBucket(bucket, token).then(({ data }) => {
		const bindings = data && data.iam ? (data.iam.bindings || []) : []
		const objectViewerBinding = bindings.find(b => b && b.role == 'roles/storage.objectViewer')
		return objectViewerBinding && (objectViewerBinding.members || []).some(m => m == 'allUsers') ? true : false
	})
})

const _validateCorsConfig = cors => {
	cors = cors || {}
	if (!cors.origin)
		throw new Error('Missing required \'origin\' argument.')

	if (!cors.method)
		throw new Error('Missing required \'method\' argument.')

	if (!Array.isArray(cors.origin))
		throw new Error('Wrong argument exception. \'origin\' must be an array of strings.')

	if (!Array.isArray(cors.method))
		throw new Error('Wrong argument exception. \'method\' must be an array of strings.')

	if (cors.responseHeader && !Array.isArray(cors.responseHeader))
		throw new Error('Wrong argument exception. \'responseHeader\' must be an array of strings.')

	const t = typeof(cors.maxAgeSeconds)
	if (cors.maxAgeSeconds && t != 'number' && t != 'string')
		throw new Error('Wrong argument exception. \'maxAgeSeconds\' must be a number or a string representing a number.')
}

const isCorsSetup = (bucket, corsConfig, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	if (corsConfig)
		_validateCorsConfig(corsConfig)
	return getBucket(bucket, token).then(({ data }) => {
		const cors = (data.cors || []).filter(x => x)
		if (!cors.some(x => x))
			return false

		return !corsConfig || cors.some(({ origin=[], method=[], responseHeader=[], maxAgeSeconds }) => {
			const originMatch = origin.every(o => corsConfig.origin.some(x => x == o))
			const methodMatch = method.every(o => corsConfig.method.some(x => x == o))
			const responseHeaderMatch = responseHeader.every(o => corsConfig.responseHeader.some(x => x == o))
			const maxAgeSecondsMatches = maxAgeSeconds == corsConfig.maxAgeSeconds

			return originMatch && methodMatch && responseHeaderMatch && maxAgeSecondsMatches
		})
	})
})

// Doc: https://cloud.google.com/storage/docs/json_api/v1/
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
	} else
		return getBucket(bucket, token).then(({ data }) => {
			const bindings = data && data.iam ? (data.iam.bindings || []) : []
			const objectViewerBinding = bindings.find(b => b && b.role == 'roles/storage.objectViewer')
			if (!objectViewerBinding)
				bindings.push({
					role: 'roles/storage.objectViewer',
					members: ['allUsers']
				})
			else if (objectViewerBinding && !(objectViewerBinding.members || []).some(m => m == 'allUsers'))
				objectViewerBinding.members.push('allUsers')
			else 
				return { status: 200, data: { message: 'The public access was already added.' } }

			const payload = JSON.stringify({ bindings })

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
		})
})

// Doc: https://cloud.google.com/storage/docs/json_api/v1/
const makePrivate = (bucket, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })

	if (filepath) {
		const { ext } = urlHelper.getInfo(filepath)
		if (!ext)
			throw new Error('Bucket\'s folder cannot be made public. Only buckets or existing objects can be made public.')

		return fetch.delete(`${BUCKET_FILE_URL(bucket, filepath)}/acl/allUsers`, {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}).then(({ status, data }) => {
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
	} else
		return getBucket(bucket, token).then(({ data }) => {
			let bindings = data && data.iam ? (data.iam.bindings || []) : []
			const objectViewerBinding = bindings.find(b => b && b.role == 'roles/storage.objectViewer')
			if (!objectViewerBinding || (objectViewerBinding && !(objectViewerBinding.members || []).some(m => m == 'allUsers')))
				return { status: 200, data: { message: 'The public access was already removed.' } }
			else 
				bindings = bindings.map(b => {
					if (b.role == 'roles/storage.objectViewer') {
						const members = b.members.filter(m => m != 'allUsers')
						if (members.some(x => x))
							b.members = members
						else
							return null
					}

					return b
				}).filter(b => b)

			const payload = JSON.stringify({ bindings })
			
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
		})
})

const updateConfig = (bucket, config={}, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	if (!Object.keys(config).some(x => x))
		return { status: 200, data: { message: 'Empty config. Nothing to update.' } }

	const payload = JSON.stringify(config)

	return fetch.patch(`${BUCKET_URL(bucket)}`, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, payload).then(({ status, data }) => {
		if (status < 400) {
			data = data || {}
			data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}`
			return { status, data }
		}

		let e = new Error(status == 404 ? 'Object not found' : status == 401 ? 'Access denied' : 'Internal Server Error')
		e.code = status
		e.data = data
		throw e
	})
})

const setupCors = (bucket, corsConfig={}, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	if (options.mode != 'delete')
		_validateCorsConfig(corsConfig)

	const cors = options.mode != 'delete' ? [corsConfig] : []
	const payload = JSON.stringify({cors})

	return fetch.patch(`${BUCKET_URL(bucket)}`, {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, payload).then(({ status, data }) => {
		if (status < 400) {
			data = data || {}
			data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}`
			return { status, data }
		}

		let e = new Error(status == 404 ? 'Object not found' : status == 401 ? 'Access denied' : 'Internal Server Error')
		e.code = status
		e.data = data
		throw e
	})
})

module.exports = {
	insert: putObject,
	'get': getBucketFile,
	addPublicAccess: makePublic,
	removePublicAccess: makePrivate,
	config: {
		'get': getBucket,
		update: updateConfig,
		isBucketPublic,
		cors: {
			isCorsSetup,
			setup: setupCors,
			disable: (bucket, token) => setupCors(bucket, {}, token, { mode: 'delete' })
		}
	}
}




