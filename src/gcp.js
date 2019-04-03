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
// Partial Response: https://cloud.google.com/storage/docs/json_api/v1/how-tos/performance#partial-response

const { fetch, urlHelper, obj: { merge } } = require('./utils')

// Bucket Object Schema:
// =====================
// kind: 'storage#bucket',
// id: 'your-bucket-name',
// selfLink: 'https://www.googleapis.com/storage/v1/b/your-bucket-name',
// projectNumber: '1233456',
// name: 'your-bucket-name',
// timeCreated: '2019-01-19T07:01:07.063Z',
// updated: '2019-01-19T07:01:15.110Z',
// metageneration: '4',
// iamConfiguration: { bucketPolicyOnly: [Object] },
// location: 'ASIA',
// website: { mainPageSuffix: 'index.html', notFoundPage: '404.html' },
// cors: [ [Object] ],
// storageClass: 'STANDARD',
// etag: 'CAQ='

/**
 * [description]
 * @param  {String} projectId 			[description]
 * @param  {Number} options.maxResults 	[description]
 * @param  {String} options.pageToken 	[description]
 * @param  {String} options.prefix 		[description]
 * @return {[type]}           			[description]
 */
const BUCKET_LIST_URL = (projectId, options) => {
	const { maxResults, pageToken, prefix } = options || {}
	const query = [`project=${projectId}`]
	if (maxResults) query.push(`maxResults=${maxResults}`)
	if (pageToken) query.push(`pageToken=${pageToken}`)
	if (prefix) query.push(`prefix=${prefix}`)

	return `https://www.googleapis.com/storage/v1/b?${query.join('&')}`
}
const BUCKET_UPLOAD_URL = (bucket, fileName, options={}) => `https://www.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=${options.resumable ? 'resumable' : 'media'}&name=${encodeURIComponent(fileName)}${options.contentEncoding ? `&contentEncoding=${encodeURIComponent(options.contentEncoding)}` : ''}`
const BUCKET_URL = bucket => `https://www.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}`
const BUCKET_FILE_URL = (bucket, filepath) => `${BUCKET_URL(bucket)}/o${ filepath ? `${filepath ? `/${encodeURIComponent(filepath)}` : ''}` : ''}`

const _validateRequiredParams = (params={}) => Object.keys(params).forEach(p => {
	if (params[p] === null || params[p] === undefined)
		throw new Error(`Parameter '${p}' is required.`)
})

const putObject = (object, filePath, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ object, filePath, token })
	const t = typeof(object)
	const payload = t == 'string' || t == 'number' || t == 'boolean' || (object instanceof Buffer) ? object : JSON.stringify(object || {})
	const [ bucket, ...names ] = filePath.split('/')

	const { contentType='application/json' } = urlHelper.getInfo(`https://neap.co/${filePath}`)

	let headers = merge(options.headers || {}, { 
		'Content-Length': payload.length,
		Authorization: `Bearer ${token}`
	})

	if (!headers['Content-Type'])
		headers['Content-Type'] = contentType

	return fetch.post({ uri: BUCKET_UPLOAD_URL(bucket, names.join('/'), options), headers, body: payload })
})

const deleteObject = (bucketId, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucketId, filepath, token })

	filepath = filepath.replace(/^\//, '')

	const { contentType } = urlHelper.getInfo(`https://neap.co/${filepath}`)

	return fetch.delete({ 
		uri: BUCKET_FILE_URL(bucketId, filepath), 
		headers: {
			Accept: contentType || 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
})

/**
 * Lists all buckets for project ID
 * 
 * @param  {String} projectId 			[description]
 * @param  {String} token     			[description]
 * @return {[type]}           			[description]
 */
const listBuckets = (projectId, token, options) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, token })
	options = options || {}

	return fetch.get({ 
		uri: BUCKET_LIST_URL(projectId, options), 
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	}).then(({ status, data }) => {
		const maxResults = options.maxResults === undefined ? 1000 : options.maxResults
		const items = data && data.items ? data.items : []
		const l = items.length
		if (l <= maxResults || !data.nextPageToken)
			return { status, data:items }
		else
			return listBuckets(projectId, token, merge(options, { maxResults:maxResults - l, pageToken:data.nextPageToken })).then(({ data:restData }) => {
				items.push(...restData)
				return { status, data:items }
			})
	})
})

/**
 * [description]
 * @param  {String} name      			[description]
 * @param  {String} projectId 			[description]
 * @param  {String} token     			[description]
 * @param  {Object} options.location   	[description]
 * @return {[type]}           			[description]
 */
const createBucket = (name, projectId, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ projectId, name, token })

	const payload = { name, location: options.location }

	return fetch.post({ 
		uri: BUCKET_LIST_URL(projectId), 
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, 
		body: JSON.stringify(payload)
	})
})

const deleteBucket = (bucketName, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucketName, token })
	return fetch.delete({
		uri: BUCKET_URL(bucketName), 
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}
	})
})

const getBucket = (bucket, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })

	const getData = fetch.get({ 
		uri: BUCKET_URL(bucket), 
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		},
		parsing: 'json'
	}).catch(err => ({ status: 500, data: { error: { code: 500, message: err.message, stack: err.stack } } }))
	const getIam = fetch.get({ 
		uri: `${BUCKET_URL(bucket)}/iam`, 
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		},
		parsing: 'json'
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

const getBucketFile = (bucket, filepath, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, filepath, token })

	const { contentType } = urlHelper.getInfo(`https://neap.co/${filepath}`)

	return fetch.get({ 
		uri: `${BUCKET_FILE_URL(bucket, filepath)}?alt=media`, 
		headers: {
			Accept: contentType || 'application/json',
			Authorization: `Bearer ${token}`
		},
		streamReader: options.streamReader,
		dst: options.dst
	})
})

const doesFileExist = (bucket, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })

	return fetch.get({ 
		uri: `${BUCKET_FILE_URL(bucket)}${filepath ? `?prefix=${filepath.replace(/^\/*/, '').split('/').map(p => encodeURIComponent(p)).join('/')}` : ''}`, 
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		},
		parsing: 'json'
	}).then(({ status, data }) => {
		const answer = filepath 
			? (data && (data.items || []).some(x => x) ? true : false)
			: status < 400
		return { status, data: answer }
	})
})

const filterFiles = (bucket, filepath, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	const queryUrl = `${BUCKET_FILE_URL(bucket)}${filepath ? `?maxResults=1000${options.pageToken ? `&pageToken=${encodeURIComponent(options.pageToken)}` : ''}&prefix=${filepath.replace(/^\/*/, '').split('/').map(p => encodeURIComponent(p)).join('/')}` : ''}`
	return fetch.get({ 
		uri: queryUrl, 
		headers: {
			Accept: 'application/json',
			Authorization: `Bearer ${token}`
		},
		parsing: 'json'
	}).then(({ status, data }) => {
		if (data && (data.items || []).length == 1000 && data.nextPageToken)
			return filterFiles(bucket, filepath, token, { pageToken: data.nextPageToken })
				.then(({ data: moreData }) => ({ status, data: [...data.items, ...moreData] }))
		else
			return { status, data: data.items || [] }
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

const getWebsiteSetup = (bucket, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	return getBucket(bucket, token).then(({ data }) => (data || {}).website || null)
})

// Doc: https://cloud.google.com/storage/docs/json_api/v1/
const makePublic = (bucket, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })

	if (filepath) {
		const { ext } = urlHelper.getInfo(`https://neap.co/${filepath}`)
		if (!ext)
			throw new Error('Bucket\'s folder cannot be made public. Only buckets or existing objects can be made public.')

		const payload = JSON.stringify({
			entity: 'allUsers',
			role: 'READER'
		})
		return fetch.post({ uri: `${BUCKET_FILE_URL(bucket, filepath)}/acl`, headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, body: payload }).then(({ status, data }) => {
			data = data || {}
			data.publicUri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
			data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
			return { status, data }
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

			return fetch.put({ uri: `${BUCKET_URL(bucket)}/iam`, headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			}, body: payload }).then(({ status, data }) => {
				data = data || {}
				data.publicUri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
				data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
				return { status, data }
			})
		})
})

// Doc: https://cloud.google.com/storage/docs/json_api/v1/
const makePrivate = (bucket, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })

	if (filepath) {
		const { ext } = urlHelper.getInfo(`https://neap.co/${filepath}`)
		if (!ext)
			throw new Error('Bucket\'s folder cannot be made public. Only buckets or existing objects can be made public.')

		return fetch.delete({ uri: `${BUCKET_FILE_URL(bucket, filepath)}/acl/allUsers`, headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}}).then(({ status, data }) => {
			data = data || {}
			data.publicUri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
			data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
			return { status, data }
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
			
			return fetch.put({ uri: `${BUCKET_URL(bucket)}/iam`, headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${token}`
			}, body: payload }).then(({ status, data }) => {
				data = data || {}
				data.publicUri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
				data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}/${filepath}`
				return { status, data }
			})
		})
})

const updateConfig = (bucket, config={}, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	if (!Object.keys(config).some(x => x))
		return { status: 200, data: { message: 'Empty config. Nothing to update.' } }

	const payload = JSON.stringify(config)

	return fetch.patch({ 
		uri: BUCKET_URL(bucket), 
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, 
		body: payload,
		parsing: 'json'
	}).then(({ status, data }) => {
		data = data || {}
		data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}`
		return { status, data }
	})
})

const setupCors = (bucket, corsConfig={}, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	if (options.mode != 'delete')
		_validateCorsConfig(corsConfig)

	const cors = options.mode != 'delete' ? [corsConfig] : []
	const payload = JSON.stringify({cors})

	return fetch.patch({ 
		uri: BUCKET_URL(bucket), 
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, 
		body: payload,
		parsing: 'json'
	}).then(({ status, data }) => {
		data = data || {}
		data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}`
		return { status, data }
	})
})

const setupWebsite = (bucket, webConfig={}, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, webConfig, token })

	const payload = JSON.stringify({
		website: {
			mainPageSuffix: webConfig.mainPageSuffix,
			notFoundPage: webConfig.notFoundPage
		}
	})

	return fetch.patch({ 
		uri: BUCKET_URL(bucket), 
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, 
		body: payload,
		parsing: 'json' 
	}).then(({ status, data }) => {
		data = data || {}
		data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}`
		return { status, data }
	})
})

module.exports = {
	insert: putObject,
	'get': getBucketFile,
	delete: deleteObject,
	addPublicAccess: makePublic,
	removePublicAccess: makePrivate,
	doesFileExist,
	filterFiles,
	bucket: {
		create: createBucket,
		delete: deleteBucket,
		list: listBuckets
	},
	config: {
		'get': getBucket,
		update: updateConfig,
		isBucketPublic,
		cors: {
			isCorsSetup,
			setup: setupCors,
			disable: (bucket, token) => setupCors(bucket, {}, token, { mode: 'delete' })
		},
		website: {
			'get': getWebsiteSetup,
			setup: setupWebsite
		}
	}
}




