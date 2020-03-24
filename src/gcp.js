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

const co = require('co')
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

const BUCKET_BASE_UPLOAD_URL = 'https://www.googleapis.com/upload/storage/v1/b'
const BUCKET_UPLOAD_URL = (bucket, fileName, options={}) => `${BUCKET_BASE_UPLOAD_URL}/${encodeURIComponent(bucket)}/o?uploadType=${options.resumable ? 'resumable' : 'media'}&name=${encodeURIComponent(fileName)}${options.contentEncoding ? `&contentEncoding=${encodeURIComponent(options.contentEncoding)}` : ''}`
const BUCKET_UPLOAD_MULTIPART_URL = bucket => `${BUCKET_BASE_UPLOAD_URL}/${encodeURIComponent(bucket)}/o?uploadType=multipart`
const BUCKET_URL = bucket => `https://www.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}`
const BUCKET_FILE_URL = (bucket, filepath) => `${BUCKET_URL(bucket)}/o${ filepath ? `${filepath ? `/${encodeURIComponent(filepath)}` : ''}` : ''}`

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

const _validateRequiredParams = (params={}) => Object.keys(params).forEach(p => {
	if (params[p] === null || params[p] === undefined)
		throw new Error(`Parameter '${p}' is required.`)
})

const putObject = (object, filePath, token, options={}) => Promise.resolve(null).then(() => {
	const h = options.headers || {}
	const headersProps = Object.keys(h)
	const useMultiPartUpload = 
		headersProps.length > 0 
		&& !(headersProps.length == 1 && (h['Content-Type'] || h['content-type']))

	if (useMultiPartUpload)
		return putObjectMultipart(object, filePath, token, h)

	_validateRequiredParams({ object, filePath, token })
	const t = typeof(object)
	const payload = t == 'string' || t == 'number' || t == 'boolean' || (object instanceof Buffer) ? object : JSON.stringify(object || {})
	const [ bucket, ...names ] = filePath.split('/')

	const { contentType='application/json' } = urlHelper.getInfo(`https://neap.co/${filePath}`)

	let headers = merge(options.headers || {}, { 
		'Content-Length': payload.length,
		Authorization: `Bearer ${token}`
	})

	if (!headers['Content-Type'] && !headers['content-type'])
		headers['Content-Type'] = contentType

	return fetch.post({ uri: BUCKET_UPLOAD_URL(bucket, names.join('/'), options), headers, body: payload })
})

const putObjectMultipart = (object, filePath, token, headers) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ object, filePath, token })
	const t = typeof(object)
	const content = Buffer.from(t == 'string' || t == 'number' || t == 'boolean' || (object instanceof Buffer) ? object : JSON.stringify(object || {}), 'binary')

	const [ bucket, ...names ] = filePath.split('/')
	const file = names.join('/')

	const { contentType='application/json' } = urlHelper.getInfo(`https://neap.co/${filePath}`)

	const boundary = 'foo_bar_baz'

	const meta = Object.keys(headers).reduce((acc, header) => {
		const v = headers[header]
		const stdHeader = _getStdHeader(header)
		const keyValue = typeof(v) == 'string' ? `"${stdHeader || header}": "${v}"` : `"${stdHeader || header}": ${v}`
		if (stdHeader)
			acc.std.push(keyValue)
		else 
			acc.metadata.push(`	${keyValue}`)
		return acc
	}, { std:[], metadata:[] })

	let fields = meta.std.join(',\r\n	')
	if (meta.metadata[0]) {
		if (fields)
			fields += ',\r\n	'

		fields += `"metadata": {\r\n		${meta.metadata.join(',\r\n		')}\r\n	}`
	}

	if (fields)
		fields = `"name": "${file}",\r\n	${fields}`
	else
		fields = `"name": "${file}"`

	const metadata = [
		`--${boundary}`,
		'Content-Type: application/json; charset=UTF-8',
		'',
		'{',
		`	${fields}`,
		'}',
		'',
		`--${boundary}`,
		`Content-Disposition: form-data; name="${file}"; filename="${file}"`,
		`Content-Type: ${headers['Content-Type'] || headers['content-type'] || contentType}`,
		'',
		''
	].join('\r\n')

	const payload = Buffer.concat([
		Buffer.from(metadata, 'utf8'),
		Buffer.from(content, 'binary'),
		Buffer.from('\r\n--' + boundary + '--\r\n', 'utf8')
	])

	return fetch.post({ 
		uri: BUCKET_UPLOAD_MULTIPART_URL(bucket), 
		headers:{ 
			'Content-Type': `multipart/related; boundary=${boundary}`,
			'Content-Length': payload.length,
			Authorization: `Bearer ${token}`
		}, 
		body: payload })
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

	let headers = merge(options.headers || {}, { 
		Authorization: `Bearer ${token}`
	})

	if (!headers['Content-Type'] && !headers['content-type'])
		headers['Accept'] = contentType || 'application/json'
	else
		headers['Accept'] = headers['Content-Type'] || headers['content-type']

	return fetch.get({ 
		uri: `${BUCKET_FILE_URL(bucket, filepath)}?alt=media`, 
		headers,
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

/**
 * Gets a bucket's files metadata
 * 
 * @param  {String}   bucket   
 * @param  {String}   filepath 				Folder's path relative to the bucket
 * @param  {String}   token    				OAuth2 token
 * @param  {Number}   options.maxResults   	Default is 1000. 
 * @param  {Number}   options.pageToken   	Used to access the next page. Use the 'nextPageToken' property returned by the previous page.
 * @param  {[String]} options.fields   	  	Limits the number of fields returned to increase performances. Valid values are:
 * 
 *                                         	'kind','id','selfLink','name','bucket','generation','metageneration','contentType',
 *                                         	'timeCreated','updated','storageClass','timeStorageClassUpdated','size','md5Hash',
 *                                         	'mediaLink','crc32c','etag'
 * @return {Number}   output.status       	
 * @return {[Object]} output.data    		Array of bucket's metadata   	
 */
const filterFiles = (bucket, filepath, token, options={}) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ bucket, token })
	const queries = [`maxResults=${options.maxResults || 1000}`]
	if (options.pageToken)
		queries.push(`pageToken=${encodeURIComponent(options.pageToken)}`)
	if (filepath)
		queries.push(`prefix=${filepath.replace(/^\/*/, '').split('/').map(p => encodeURIComponent(p)).join('/')}`)
	if (options.fields && Array.isArray(options.fields) && options.fields.length)
		queries.push(`fields=nextPageToken,items(${options.fields})`)
	
	const queryUrl = `${BUCKET_FILE_URL(bucket)}?${queries.join('&')}`

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

const _addValuesToCORS = (cors, { origin, method, responseHeader, maxAgeSeconds }) => {
	cors = cors || {}
	if (origin && origin[0]) {
		cors.origin = cors.origin || []
		origin.forEach(x => {
			if (!cors.origin.some(y => y == x))
				cors.origin.push(x)
		})
	}
	if (method && method[0]) {
		cors.method = cors.method || []
		method.forEach(x => {
			if (!cors.method.some(y => y == x))
				cors.method.push(x)
		})
	}
	if (responseHeader && responseHeader[0]) {
		cors.responseHeader = cors.responseHeader || []
		responseHeader.forEach(x => {
			if (!cors.responseHeader.some(y => y == x))
				cors.responseHeader.push(x)
		})
	}
	if (typeof(maxAgeSeconds) == 'number')
		cors.maxAgeSeconds = maxAgeSeconds
}

const _removeValuesToCORS = (cors, { origin, method, responseHeader }) => {
	if (!cors)
		return

	if (cors.origin && cors.origin[0] && origin && origin[0])
		cors.origin = cors.origin.filter(y => !origin.some(x => x == y))
	if (cors.method && cors.method[0] && method && method[0])
		cors.method = cors.method.filter(y => !method.some(x => x == y))
	if (cors.responseHeader && cors.responseHeader[0] && responseHeader && responseHeader[0])
		cors.responseHeader = cors.responseHeader.filter(y => !responseHeader.some(x => x == y))
}

/**
 * Manages the CORS cofiguration of a bucket. The CORS object's schema is as follow:
 * 	- origin: e.g., ['*']
 * 	- method: e.g., ['GET', 'POST']
 * 	- responseHeader: e.g., ['Authorization', 'Origin', 'X-Requested-With', 'Content-Type', 'Accept']
 * 	- maxAgeSeconds: e.g., 3600
 * 
 * @param {String}	bucket
 * @param {Object}	corsConfig		Either a CORS object or { add: <CORS>, remove: <CORS> } in case of options.mode == 'update'
 * @param {String}	token
 * @yield {String}	options.mode	Default 'override'. Valid values: 'override', 'update', 'delete'
 */
const setupCors = (bucket, corsConfig={}, token, options) => co(function *() {
	options = options || {}
	_validateRequiredParams({ bucket, token })

	const updateMode = options.mode == 'update'
	const deleteMode = options.mode == 'delete'

	if (updateMode) {
		const { add, remove } = corsConfig
		if (!add && !remove)
			throw new Error(`Failed to update CORS configuration for bucket ${bucket}. Missing required property. 'corsConfig' must contain an 'add' or 'remove' property.`)

		if (add && typeof(add) != 'object')
			throw new Error(`Failed to update CORS configuration for bucket ${bucket}. Wrong argument exception for property 'add'. Expecting an object, found a ${typeof(add)}.`)
		if (remove && typeof(remove) != 'object')
			throw new Error(`Failed to update CORS configuration for bucket ${bucket}. Wrong argument exception for property 'remove'. Expecting an object, found a ${typeof(remove)}.`)
	}

	if (!deleteMode && !updateMode)
		_validateCorsConfig(corsConfig)

	let cors = yield (updateMode 
		? getBucket(bucket, token).then(({ status, data }) => {
			if (status == 404)
				throw new Error(`Bucket ${bucket} not found.`)
			
			const cors = ((data || {}).cors || [])[0]
			if (!cors)
				throw new Error(`CORS configuration for bucket ${bucket} not found.`)
			return [cors]
		})
		: Promise.resolve(!deleteMode ? [corsConfig] : []))

	if (updateMode) {
		const { add, remove } = corsConfig
		if (add) 
			_addValuesToCORS(cors[0], add)
		if (remove) 
			_removeValuesToCORS(cors[0], remove)
		
	}

	const payload = JSON.stringify({cors})

	let { status, data } = yield fetch.patch({ 
		uri: BUCKET_URL(bucket), 
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`
		}, 
		body: payload,
		parsing: 'json'
	})

	data = data || {}
	data.uri = `https://storage.googleapis.com/${encodeURIComponent(bucket)}`
	return { status, data }
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

const _getStdHeader = header => {
	if (!header)
		return null
	const h = header.toLowerCase().replace(/-/g,'')
	if (h == 'cachecontrol')
		return 'cacheControl'
	else if (h == 'contentdisposition')
		return 'contentDisposition' 
	else if (h == 'contentencoding')
		return 'contentEncoding' 
	else if (h == 'contentlanguage')
		return 'contentLanguage' 
	else if (h == 'contenttype')
		return 'contentType' 
	else if (h == 'eventbasedhold')
		return 'eventBasedHold' 
	else if (h == 'temporaryhold')
		return 'temporaryHold'
	else
		return null
}

// Doc: https://cloud.google.com/storage/docs/json_api/v1/objects/update
const updateObjectMetadata = (bucket, filepath, meta, token) => co(function *(){
	_validateRequiredParams({ bucket, token, filepath, meta })

	if (typeof(meta) != 'object')
		throw new Error(`meta must be an object (currently ${typeof(meta)})`)

	const metaKeys = Object.keys(meta)

	if (!metaKeys[0])
		return { status:200, data:{ message: 'Void operation. No metadata were passed.' } }

	const { ext } = urlHelper.getInfo(`https://neap.co/${filepath}`)
	if (!ext)
		throw new Error('Bucket\'s folders do not support metadata updates.')

	const resourceUri = BUCKET_FILE_URL(bucket, filepath)

	const { status, data } = yield fetch.get({ 
		uri: resourceUri, 
		headers: { 
			'Content-Type': 'application/json',
			Authorization: `Bearer ${token}`			
		}})

	if (status == 404)
		throw new Error(`Resource ${resourceUri} not found.`)

	metaKeys.forEach(key => {
		const stdKey = _getStdHeader(key)
		if (stdKey)
			data[stdKey] = meta[key]
		else {
			if (!data.metadata)
				data.metadata = {}
			data.metadata[key] = meta[key]
		}
	})

	return yield fetch.put({ uri: resourceUri, headers: {
		'Content-Type': 'application/json',
		Authorization: `Bearer ${token}`
	}, body: JSON.stringify(data) })
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
		},
		object: {
			update: updateObjectMetadata
		}
	}
}




