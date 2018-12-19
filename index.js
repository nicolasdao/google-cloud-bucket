/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const googleAuth = require('google-auto-auth')
const { posix } = require('path')
const { promise: { retry } } = require('./src/utils')
const gcp = require('./src/gcp')

const getToken = auth => new Promise((onSuccess, onFailure) => auth.getToken((err, token) => err ? onFailure(err) : onSuccess(token)))

const _validateRequiredParams = (params={}) => Object.keys(params).forEach(p => {
	if (!params[p])
		throw new Error(`Parameter '${p}' is required.`)
})

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

const createClient = ({ jsonKeyFile }) => {
	_validateRequiredParams({ jsonKeyFile })

	const { project_id:projectId } = require(jsonKeyFile)
	if (!projectId)
		throw new Error(`The service account JSON key file ${jsonKeyFile} does not contain a 'project_id' field.`)

	const auth = googleAuth({ 
		keyFilename: jsonKeyFile,
		scopes: ['https://www.googleapis.com/auth/cloud-platform']
	})

	const putObject = (object, filePath, options) => getToken(auth).then(token => _retryFn(() => gcp.insert(object, filePath, token, options), options))
		.then(_throwHttpErrorIfBadStatus)
		.then(({ data }) => data)
	const getObject = (bucket, filePath, options) => getToken(auth).then(token => _retryFn(() => gcp.get(bucket, filePath, token, options), options))
		.then(res => res && res.status == 404 ? { data:null } : _throwHttpErrorIfBadStatus(res))
		.then(({ data }) => data)
	const listObjects = (bucket, filePath, options) => getToken(auth).then(token => _retryFn(() => gcp.filterFiles(bucket, filePath, token), options)
		.then(res => res && res.status == 404 ? { data:[] } : _throwHttpErrorIfBadStatus(res))
		.then(({ data }) => data))
	
	const objectExists = (bucket, filePath, options={}) => getToken(auth).then(token => _retryFn(() => gcp.doesFileExist(bucket, filePath, token), options).then(({ data }) => data))
	const getBucket = (bucket) => getToken(auth).then(token => _retryFn(() => gcp.config.get(bucket, token)).then(({ data }) => data))

	const createBucket = (bucket, options={}) => getToken(auth).then(token => gcp.bucket.create(bucket, projectId, token, options)).then(({ data }) => data)
	const deleteBucket = (bucket) => getToken(auth).then(token => gcp.bucket.delete(bucket, token)).then(({ data }) => data)
	const isBucketPublic = (bucket) => getToken(auth).then(token => gcp.config.isBucketPublic(bucket, token))
	const isCorsSetUp = (bucket, corsConfig) => getToken(auth).then(token => gcp.config.cors.isCorsSetup(bucket, corsConfig, token))
	const setupCors = (bucket, corsConfig) => getToken(auth).then(token => gcp.config.cors.setup(bucket, corsConfig, token)).then(({ data }) => data)
	const disableCors = (bucket) => getToken(auth).then(token => gcp.config.cors.disable(bucket, token)).then(({ data }) => data)
	const updateConfig = (bucket, config={}) => getToken(auth).then(token => gcp.config.update(bucket, config, token)).then(({ data }) => data)
	const addPublicAccess = filePath => getToken(auth).then(token => {
		const { bucket, file } = _getBucketAndPathname(filePath, { ignoreMissingFile: true })
		return gcp.addPublicAccess(bucket, file, token)
	}).then(({ data }) => data)
	const removePublicAccess = filePath => getToken(auth).then(token => {
		const { bucket, file } = _getBucketAndPathname(filePath, { ignoreMissingFile: true })
		return gcp.removePublicAccess(bucket, file, token)
	}).then(({ data }) => data)

	const retryPutObject = (object, filePath, options={}) => putObject(object, filePath, options)
		.then(data => {
			if (data)
				data.publicUri = `https://storage.googleapis.com/${(filePath || '').replace(/^\/*/, '').split('/').map(p => encodeURIComponent(p)).join('/')}`
			if (options.public)
				return addPublicAccess(filePath).then(({ uri }) => {
					if (data)
						data.uri = uri
					return data
				})
			return data
		})

	const retryGetObject = (filePath, options={}) => Promise.resolve(null).then(() => {
		const { bucket, file } = _getBucketAndPathname(filePath)
		return getObject(bucket, file, options)
	})

	return {
		insert: retryPutObject,
		'get': retryGetObject,
		addPublicAccess,
		removePublicAccess,
		list: (filepath, options={}) => Promise.resolve(null).then(() => {
			if(!filepath)
				throw new Error('Missing required \'filepath\' argument')

			const { bucket, file } = _getBucketAndPathname(filepath, { ignoreMissingFile: true })
			return listObjects(bucket, file, options)
		}),
		exists: (filepath, options={}) => Promise.resolve(null).then(() => {
			if(!filepath)
				throw new Error('Missing required \'filepath\' argument')

			const { bucket, file } = _getBucketAndPathname(filepath, { ignoreMissingFile: true })
			return objectExists(bucket, file, options)
		}),
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
				'get': () => getBucket(bucketName),
				exists: (options={}) => objectExists(bucketName, null, options),
				create: (options={}) => createBucket(bucketName, options),
				delete: () => deleteBucket(bucketName),
				update: (config={}) => updateConfig(bucketName, config),
				addPublicAccess: () => addPublicAccess(bucketName),
				removePublicAccess: () => removePublicAccess(bucketName),
				isPublic: () => isBucketPublic(bucketName),
				cors: {
					exists: (corsConfig) => isCorsSetUp(bucketName, corsConfig),
					setup: (corsConfig) => setupCors(bucketName, corsConfig),
					disable: () => disableCors(bucketName)
				},
				object: (filePath) => {
					if (!filePath)
						throw new Error('Missing required \'filePath\' argument')

					return {
						file: filePath,
						exists: (options={}) => objectExists(bucketName, filePath, options),
						list: (options={}) => listObjects(bucketName, filePath, options),
						'get': (options={}) => retryGetObject(posix.join(bucketName, filePath), options),
						insert: (object, options={}) => retryPutObject(object, posix.join(bucketName, filePath), options),
						addPublicAccess: () => addPublicAccess(posix.join(bucketName, filePath)),
						removePublicAccess: () => removePublicAccess(posix.join(bucketName, filePath))
					}
				}
			}
		}
	}
}

module.exports = {
	client: {
		new: createClient
	}
}



