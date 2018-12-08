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
	{ ignoreFailure: true, retryInterval: 800 })
	.catch(e => {
		if (options.retryCatch)
			return options.retryCatch(e)
		else
			throw e
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

	const auth = googleAuth({ 
		keyFilename: jsonKeyFile,
		scopes: ['https://www.googleapis.com/auth/cloud-platform']
	})

	const putObject = (object, filePath, options) => getToken(auth).then(token => gcp.insert(object, filePath, token, options)).then(({ data }) => data)
	const getObject = (bucket, filePath) => getToken(auth).then(token => gcp.get(bucket, filePath, token)).then(({ data }) => data)
	const getBucket = (bucket) => getToken(auth).then(token => gcp.config.get(bucket, token)).then(({ data }) => data)
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

	const retryPutObject = (object, filePath, options={}) => _retryFn(() => putObject(object, filePath, options), options)
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
		return _retryFn(() => getObject(bucket, file), options) 
	})

	return {
		insert: retryPutObject,
		'get': retryGetObject,
		addPublicAccess,
		removePublicAccess,
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



