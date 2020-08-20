/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const co = require('co')
const { throttle } = require('core-async')
const { GoogleAuth } = require('google-auth-library')
const archiver = require('archiver')
const fs = require('fs')
const { toBuffer } = require('convert-stream')
const { posix, extname } = require('path')
const { Writable } = require('stream')
const anymatch = require('anymatch')
const { promise: { retry }, collection } = require('./src/utils')
const gcp = require('./src/gcp')

const _retryFn = (fn, options={}) => retry(
	fn, 
	() => true, 
	{ ignoreFailure: true, retryInterval: [500, 2000], timeOut: options.timeout || 10000 })
	.catch(e => {
		if (options.retryCatch)
			return options.retryCatch(e)
		else
			throw e
	})

const _retryPutFn = (fn, options={}) => retry(
	fn, 
	res => {
		//console.log(`STATUS: ${res.status}`)
		if (res && res.status == 429) {
			//console.log('TOO MANY UPDATES')
			return false
		} else
			return true
	}, 
	{ ignoreFailure: true, retryInterval: [800, 2000], timeOut: options.timeout || 10000 })
	.catch(e => {
		if (options.retryCatch)
			return options.retryCatch(e)
		else
			throw e
	})

const _throwHttpErrorIfBadStatus = res => Promise.resolve(null).then(() => {
	if (res && res.status && res.status >= 400) {
		const errorMsg = `Failed with error ${res.status}.${res.data ? ` Details:\n${JSON.stringify(res.data, null, ' ')}` : ''}`
		throw new Error(errorMsg)
	}
	return res 
}) 

const _getBucketAndPathname = (filePath, options={}) => {
	if (!filePath)
		throw new Error('Missing required argument \'filePath\'')

	const [bucket, ...rest] = filePath.replace(/^\//, '').split('/')
	const file = rest.join('/')
	if (!options.ignoreMissingFile && !file)
		throw new Error(`Invalid filePath '${filePath}'. 'filePath' must describe a file (e.g., 'your-bucket/some-optional-path/your-file.json'). It seems you've only passed a bucket.`)

	return { bucket, file }
}

const _saveFile = ({ to, buffer }) => new Promise((onSuccess, onFailure) => {
	try {
		if (!to) {
			const e = new Error('Missing required \'to\' argument')
			onFailure(e)
		}
		fs.writeFile(to, buffer, (err) => {
			if (err) 
				onFailure(err)
			onSuccess()
		})
	} catch(err) {
		onFailure(err)
	}
})

const _readFile = filePath => new Promise((onSuccess, onFailure) => {
	try {
		if (!filePath) {
			const e = new Error('Missing required \'filePath\' argument')
			onFailure(e)
		}
		fs.readFile(filePath, (err, buffer) => {
			if (err) 
				onFailure(err)
			onSuccess(buffer)
		})
	} catch(err) {
		onFailure(err)
	}
})

/**
 * Filters list of bucket objects using globbing patterns. 
 * 
 * @param  {[BucketObject]}  data    			Array of bucket objects.
 * @param  {String|[String]} options.pattern 	Glob string pattern or array of glob string patterns used to match the 'data[].name'
 * @param  {String|[String]} options.ignore 	Glob string pattern or array of glob string patterns used to ignore a 'data[].name'
 * @return {[BucketObject]}  output 			'data' but filtered
 */
const _filterBucketObjects = (data, options) => {
	if (!data || data.length == 0)
		return data 
	
	const { pattern, ignore } = options || {}
	if (!pattern && !ignore)
		return data 

	return data.filter(o => {
		if (!o.name)
			return false 

		const patternMatches = pattern ? anymatch(pattern,o.name) : true
		const ignoreMatches =  ignore ? anymatch(ignore,o.name) : false

		if (ignoreMatches)
			return false

		return patternMatches
	})
}

const _getPublicUri = filePath => `https://storage.googleapis.com/${(filePath || '').replace(/^\/*/, '').split('/').map(p => encodeURIComponent(p)).join('/')}`

/**
 * Creates a new Google Cloud Bucket client. 
 * 
 * @param  {String} config.jsonKeyFile 					Path to the service-account.json file. If specified, 'clientEmail', 'privateKey', 'projectId' are not required.
 * @param  {String} config.credentials.project_id
 * @param  {String} config.credentials.client_email
 * @param  {String} config.credentials.private_key
 * @param  {String} config.clientEmail 					Deprecated. Use config.credentials.client_email instead.
 * @param  {String} config.privateKey 					Deprecated. Use config.credentials.private_key instead.
 * @param  {String} config.projectId 					Deprecated. Use config.credentials.project_id instead.
 * @return {Object}        				
 */
const createClient = config => {
	// 1. Organize the input into usable bits
	let { jsonKeyFile, clientEmail, privateKey, projectId, credentials } = config || {}
	let { project_id, client_email, private_key } = credentials ? credentials : jsonKeyFile ? require(jsonKeyFile) : {}
	
	projectId = projectId || project_id || process.env.GOOGLE_CLOUD_BUCKET_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT_ID
	client_email = clientEmail || client_email || process.env.GOOGLE_CLOUD_BUCKET_CLIENT_EMAIL || process.env.GOOGLE_CLOUD_CLIENT_EMAIL
	private_key = privateKey || private_key || process.env.GOOGLE_CLOUD_BUCKET_PRIVATE_KEY || process.env.GOOGLE_CLOUD_PRIVATE_KEY

	const authConfig = {
		scopes: ['https://www.googleapis.com/auth/cloud-platform']
	}

	if (client_email && private_key)
		authConfig.credentials = { client_email, private_key }

	const auth = new GoogleAuth(authConfig)
	const getToken = existingToken => existingToken ? Promise.resolve(existingToken) : auth.getAccessToken()

	const getProjectId = () => Promise.resolve(null)
		.then(() => projectId ? projectId : auth.getProjectId())
		.then(id => {
			if (!id)
				throw new Error('Missing required \'projectId\'. The \'projectId\' was not defined explicitly nor was it found in the application default credentials.')
			if (!projectId)
				projectId = id 

			return id
		})

	// 2. Create the client methods.
	const putObject = (object, filePath, options={}) => getToken(options.token).then(token => _retryPutFn(() => gcp.insert(object, filePath, token, options), options))
		.then(_throwHttpErrorIfBadStatus)
		.then(({ data }) => data)
	const getObject = (bucket, filePath, options={}) => getToken(options.token).then(token => _retryFn(() => gcp.get(bucket, filePath, token, options), options))
		.then(res => res && res.status == 404 ? { data:null } : _throwHttpErrorIfBadStatus(res))
		.then(({ data }) => data)
	const deleteObject = (bucket, filePath, options={}) => getToken(options.token).then(token => _retryFn(() => gcp.delete(bucket, filePath, token, options), options))
		.then(res => res && res.status == 404 ? { data:null } : _throwHttpErrorIfBadStatus(res))
		.then(({ data }) => data)
	const listObjectsMetadata = (bucket, filePath, options={}) => getToken(options.token).then(token => _retryFn(() => gcp.filterFiles(bucket, filePath, token, options), options)
		.then(res => res && res.status == 404 ? { data:[] } : _throwHttpErrorIfBadStatus(res))
		.then(({ data }) => _filterBucketObjects(data, options))
		.then(data => data ? data.map(d => { d.publicUri = _getPublicUri(`${bucket}/${filePath}`);return d }) : data))
	const listBuckets = (options={}) => getProjectId().then(_projectId => getToken(options.token).then(token => _retryFn(() => gcp.bucket.list(_projectId, token, options), options))
		.then(res => res && res.status == 404 ? { data:[] } : _throwHttpErrorIfBadStatus(res))
		.then(({ data }) => data))
	
	const objectExists = (bucket, filePath, options={}) => getToken(options.token).then(token => _retryFn(() => gcp.doesFileExist(bucket, filePath, token), options).then(({ data }) => data))
	const getBucket = (bucket, options={}) => getToken(options.token).then(token => _retryFn(() => gcp.config.get(bucket, token), options).then(({ data }) => data))
	const getObjectInfo = (bucket, filePath, options) => listObjectsMetadata(bucket, filePath, options || {}).then(data => {
		if (!data)
			return null 
		if (data.length == 1)
			return data[0]
		else
			return null
	})

	const createBucket = (bucket, options={}) => getProjectId().then(_projectId => getToken(options.token).then(token => gcp.bucket.create(bucket, _projectId, token, options))).then(({ status, data }) => {
		if (status > 299) {
			let errMsg 
			try {
				errMsg = JSON.stringify(data)
			} catch(e) {
				(() => errMsg=`${data}`)(e)
			}
			throw new Error(`Failed to create bucket. Details: ${errMsg}`)
		}
		
		return data
	})
	const deleteBucket = (bucket, options={}) => getToken(options.token).then(token => _retryFn(() => gcp.bucket.delete(bucket, token))).then(({ status, data }) => {
		let d = data
		if (data instanceof Buffer) {
			const s = data.toString()
			try {
				d = JSON.parse(s)
			} catch(e) {
				d = (() => s)(e)
			}
		}
		if (status > 299)
			throw new Error(`Delete failed: ${JSON.stringify(d)}`)
		return d
	})
	const isBucketPublic = (bucket, options={}) => getToken(options.token).then(token => gcp.config.isBucketPublic(bucket, token))
	const isCorsSetUp = (bucket, corsConfig, options={}) => getToken(options.token).then(token => gcp.config.cors.isCorsSetup(bucket, corsConfig, token))
	const setupCors = (bucket, corsConfig, options={}) => getToken(options.token).then(token => gcp.config.cors.setup(bucket, corsConfig, token, options)).then(({ data }) => data)
	const disableCors = (bucket, options={}) => getToken(options.token).then(token => gcp.config.cors.disable(bucket, token)).then(({ data }) => data)
	const setupWebsite = (bucket, webConfig, options={}) => getToken(options.token).then(token => gcp.config.website.setup(bucket, webConfig, token)).then(({ data }) => data)
	const updateConfig = (bucket, config={}, options={}) => getToken(options.token).then(token => gcp.config.update(bucket, config, token)).then(({ data }) => data)
	const addPublicAccess = (filePath, options={}) => getToken(options.token).then(token => {
		const { bucket, file } = _getBucketAndPathname(filePath, { ignoreMissingFile: true })
		return gcp.addPublicAccess(bucket, file, token)
	}).then(({ data }) => data)
	const removePublicAccess = (filePath, options={}) => getToken(options.token).then(token => {
		const { bucket, file } = _getBucketAndPathname(filePath, { ignoreMissingFile: true })
		return gcp.removePublicAccess(bucket, file, token)
	}).then(({ data }) => data)

	const insertObject = (object, filePath, options={}) => putObject(object, filePath, options)
		.then(data => {
			if (data)
				data.publicUri = _getPublicUri(filePath)
			if (options.public)
				return addPublicAccess(filePath).then(({ uri }) => {
					if (data)
						data.uri = uri
					return data
				})
			return data
		})

	const insertFile = (localPath, filePath, options={}) => _readFile(localPath).then(buffer => insertObject(buffer, filePath, options))

	const getObjectV2 = (filePath, options={}) => Promise.resolve(null).then(() => {
		const { bucket, file } = _getBucketAndPathname(filePath)
		return getObject(bucket, file, options)
	})

	const updateObjectHeaders = (filePath, meta, options={}) => getToken(options.token).then(token => {
		const { bucket, file } = _getBucketAndPathname(filePath, { ignoreMissingFile: true })
		return gcp.config.object.update(bucket, file, meta, token)
	}).then(({ data }) => data)

	/**
	 * Augments the 'deleteObject' function with the ability to delete all files under a path. 
	 * 
	 * @param  {String} bucket  		Bucket ID
	 * @param  {String} filePath  		Path under that 'bucket'
	 * @param  {String} options.type  	Valid values: 'file', 'folder'. By default, the type is determined based on the 'filePath'
	 *                                 	but this can lead to errors. It is recommended to set this options.
	 * @yield {Void} 
	 */
	const deleteObjectPlus = (bucket, filePath, options={}) => co(function *(){
		const { type } = options
		if (type != 'folder' && (type == 'file' || !filePath || !bucket || extname(filePath))) {
			yield deleteObject(bucket, filePath, options)
			return { count:1 }
		}
		
		const files = yield listObjectsMetadata(bucket, filePath, options)
		const count = files ? files.length : 0
		if (count > 0) {
			const deleteTasks = files.map(({ name }) => (() => deleteObject(bucket, name, options)))
			yield throttle(deleteTasks, 20)
		}
		return { count }
	})

	/**
	 * Deletes a bucket, supporting forcing deletion of buckets with content.
	 * @param  {String} bucket  		Bucket ID
	 * @param  {Object} options.force 	Default false. If true, even bucket containing files are deleted. Otherwise, a 409 error is returned.
	 * @return {[type]}         		[description]
	 */
	const deleteBucketPlus = (bucket, options) => co(function *(){
		options = options || {}
		if (!options.force) {
			const res = yield deleteBucket(bucket, options)
			return { count:0, data:res }
		}

		const files = (yield listObjectsMetadata(bucket, '/', options)) || []
		const count = files.length
		if (count > 0) {
			const deleteTasks = files.map(({ name }) => (() => deleteObject(bucket, name, options)))
			yield throttle(deleteTasks, 20)
		}
		const data = yield deleteBucket(bucket, options)
		return { count, data }
	})

	/**
	 * [description]
	 * @param  {[type]} bucket   						Source Bucket
	 * @param  {[type]} filePath 						Source path where the files are located
	 * @param  {String} options.to.local  				Destination in the local machine where the zip file will be stored
	 * @param  {String} options.to.bucket.name  		Destination bucket in the Google Cloud Storage machine where the zip file will be stored
	 * @param  {String} options.to.bucket.path  		Destination path in the destination bucket where the zip file will be stored
	 * @param  {String} options.ignore  				Array if strings or regex , or string or regex that will be ignored
	 * @param  {String} options.on['files-listed']	
	 * @param  {String} options.on['file-received']
	 * @param  {String} options.on['finished']
	 * @param  {String} options.on['saved']
	 * @param  {String} options.on['error']
	 * @return {[type]}          						[description]
	 */
	const zipFiles = (bucket, filePath, options) => listObjectsMetadata(bucket, filePath, options)
		.then(objects => {
			objects = objects || []
			options = options || {}

			const totalSize = objects.reduce((s,{size}) => {
				const fileSize = size*1
				return !isNaN(fileSize) ? (s+fileSize) : s
			}, 0)
			
			const on = options.on || {}
			const onFilesListed = on['files-listed'] || (() => null)
			const onFileReceived = on['file-received'] || (() => null)
			const onFilesZipped = on['finished'] || (() => null)
			const onFilesSaved = on['saved'] || (() => null)
			onFilesListed({ count: objects.length, size: totalSize, data:objects })
			
			if (options.ignore) {
				if (typeof(options.ignore) == 'string')
					objects = objects.filter(({ name }) => name != options.ignore)
				else if (options.ignore instanceof RegExp)
					objects = objects.filter(({ name }) => !options.ignore.test(name))
				else if (Array.isArray(options.ignore))
					objects = options.ignore.reduce((acc,i) => {
						if (typeof(i) == 'string')
							acc = acc.filter(({ name }) => name != i)
						else if (i instanceof RegExp)
							acc = acc.filter(({ name }) => !i.test(name))
						return acc
					}, objects)
			}
			
			if (options.to && options.to.bucket && options.to.bucket.path && !/\.zip$/.test(options.to.bucket.path))
				throw new Error('Wrong argument exception. Optional argument \'options.to.bucket.path\' does not have a \'.zip\' extension')

			const archive = archiver('zip', { zlib: { level: 9 } })
			const buffer = toBuffer(archive)
			// Load the files by batch of 50
			return collection.batch(objects, 50).reduce((job,filesBatch) => job.then(() => {
				return Promise.all(filesBatch.map(obj => {
					let chunks = []
					const streamReader = new Writable({
						write(chunk, encoding, callback) {
							//console.log('HELOOOOOO: ', encoding)
							chunks.push(chunk)
							callback()
						}
					})
					const objName = obj.name ? `${obj.bucket}/${obj.name}` : obj.bucket
					return getObjectV2(objName, { streamReader, timeout: 55 * 60 * 1000 }).then(() => {
						const b = Buffer.concat(chunks)
						onFileReceived({ file: obj.name, size: b.length })
						archive.append(b, { name: obj.name })
						chunks = null
					})
				}))
			}), Promise.resolve(null))
				.then(() => archive.finalize())
				.then(() => buffer)
				.then(b => {
					onFilesZipped({ size:b.length })
					const to = options.to
					if (to) {
						const tasks = []
						if (to.local)
							tasks.push(_saveFile({ to: to.local, buffer:b }))

						if (to.bucket) {
							const toBucket = to.bucket.name || bucket
							const toPath = to.bucket.path || 'archive.zip'
							tasks.push(insertObject(b, posix.join(toBucket, toPath), options))
						} 

						return Promise.all(tasks).then(() => ({ count: objects.length, data: null }))
					} else
						return { count: objects.length, data: b }
				})
				.then(res => {
					onFilesSaved(res)
					return res
				})
		})
		.catch(err => {
			const onError = ((options || {}).on || {})['error']
			if (onError)
				onError(err)
			else
				throw err
		})

	return {
		'get': getObjectV2,
		list: (filepath, options={}) => Promise.resolve(null).then(() => {
			if (typeof(filepath) == 'object') {
				options = filepath
				filepath = null
			}

			if (!filepath)
				return listBuckets(options)

			const { bucket, file } = _getBucketAndPathname(filepath, { ignoreMissingFile: true })
			return listObjectsMetadata(bucket, file, options)
		}),
		insert: insertObject,
		insertFile,
		exists: (filepath, options={}) => Promise.resolve(null).then(() => {
			if(!filepath)
				throw new Error('Missing required \'filepath\' argument')

			const { bucket, file } = _getBucketAndPathname(filepath, { ignoreMissingFile: true })
			return objectExists(bucket, file, options)
		}),
		addPublicAccess,
		removePublicAccess,
		zip: (filePath, options) => {
			const { bucket, file } = _getBucketAndPathname(filePath)
			return zipFiles(bucket, file, options)
		},
		config: (bucket) => {
			if(!bucket)
				throw new Error('Missing required \'bucket\' argument')
			return {
				'get': () => getBucket(bucket),
				update: (config={}) => updateConfig(bucket, config),
				addPublicAccess: () => addPublicAccess(bucket),
				removePublicAccess: () => removePublicAccess(bucket)
			}
		},
		bucket: (bucketName) => {
			if (!bucketName)
				throw new Error('Missing required \'bucketName\' argument')
			return {
				name: bucketName,
				'get': (options={}) => getBucket(bucketName, options),
				exists: (options={}) => objectExists(bucketName, null, options),
				create: (options={}) => createBucket(bucketName, options),
				delete: (options={}) => deleteBucketPlus(bucketName, options),
				update: (config={}, options={}) => updateConfig(bucketName, config, options),
				addPublicAccess: (options={}) => addPublicAccess(bucketName, options),
				removePublicAccess: (options={}) => removePublicAccess(bucketName, options),
				isPublic: (options={}) => isBucketPublic(bucketName, options),
				cors: {
					'get': (options={}) => getBucket(bucketName, options).then(data => ((data || {}).cors || [])[0] || null),
					exists: (corsConfig, options={}) => isCorsSetUp(bucketName, corsConfig, options),
					setup: (corsConfig, options={}) => setupCors(bucketName, corsConfig, options),
					disable: (options={}) => disableCors(bucketName, options),
					update: ({ add, remove }, options={}) => setupCors(bucketName, { add, remove }, { ...options, mode:'update' })
				},
				website: {
					// webConfig: {
					// 		mainPageSuffix: 'index.html',
					// 		notFoundPage: '404.html'
					// }
					setup: (webConfig, options={}) => setupWebsite(bucketName, webConfig, options)
				},
				zip: (options={}) => zipFiles(bucketName, '/', options),
				object: (filePath) => {
					if (!filePath)
						throw new Error('Missing required \'filePath\' argument')

					return {
						file: filePath,
						'get': (options={}) => getObjectV2(posix.join(bucketName, filePath), options),
						getInfo: (options={}) => getObjectInfo(bucketName, filePath, options),
						delete: (options={}) => deleteObjectPlus(bucketName, filePath, options),
						list: (options={}) => listObjectsMetadata(bucketName, filePath, options),
						exists: (options={}) => objectExists(bucketName, filePath, options),
						insert: (object, options={}) => insertObject(object, posix.join(bucketName, filePath), options),
						insertFile: (localPath, options={}) => insertFile(localPath, posix.join(bucketName, filePath), options),
						zip: (options={}) => zipFiles(bucketName, filePath, options),
						addPublicAccess: (options={}) => addPublicAccess(posix.join(bucketName, filePath), options),
						removePublicAccess: (options={}) => removePublicAccess(posix.join(bucketName, filePath), options),
						headers: {
							update: (meta, options={}) => updateObjectHeaders(posix.join(bucketName, filePath), meta, options),
						}
					}
				}
			}
		}
	}
}

/**
 * Validate a bucket's name
 * @param  {String}  name 			Bucket's name.
 * @return {Boolean} output.valid
 * @return {String}  output.reason  Reason for failure.
 */
const validateBucketName = name => {
	if (!name || typeof(name) != 'string')
		return { valid:false, reason:'The bucket name is required.' }
	if (name.length < 3)
		return { valid:false, reason:'The bucket name contain more than 2 characters.' }
	if (!/^[a-z0-9].*[a-z0-9]$/.test(name))
		return { valid:false, reason:'The bucket name must start and end with a number or letter.' }
	if (/[^a-z0-9-_.]/.test(name))
		return { valid:false, reason:'The bucket name must contain only lowercase letters, numbers, dashes (-), underscores (_), and dots (.).' }
	if (/^[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}.[0-9]{1,3}$/.test(name))
		return { valid:false, reason:'The bucket name cannot be represented as an IP address in dotted-decimal notation (for example, 192.168.5.4).' }
	if (name.indexOf('goog') == 0 || name.indexOf('g00g') == 0)
		return { valid:false, reason:'The bucket name cannot begin with the "goog" prefix or contain close misspellings, such as "g00gle".' }
	if (name.indexOf('.') > 0) {
		if (name.length > 222)
			return { valid:false, reason:'Bucket names containing dots cannot exceed 222 characters.' }
		if (name.split('.').some(c => c.length > 63))
			return { valid:false, reason:'Bucket names containing dots cannot have dot-separated components longer than 63 characters.' }
	} else if (name.length > 63)
		return { valid:false, reason:'Bucket names cannot be longer than 63 characters.' }

	return { valid:true, reason:null }
}

module.exports = {
	client: {
		new: createClient
	},
	utils: {
		validate:{
			bucketName: validateBucketName
		}
	}
}



