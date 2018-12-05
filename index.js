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
	.then(({ status, data }) => {
		if (status > 299) {
			const message = ((data || {}).error || {}).message || JSON.stringify(data || {})
			let e = new Error(message)
			e.code = status
			throw e 
		}
		return { status, data }
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

	const putObject = (object, filePath, options) => getToken(auth).then(token => gcp.insert(object, filePath, token, options))
	const getObject = (bucket, filePath) => getToken(auth).then(token => gcp.get(bucket, filePath, token))
	const getBucket = (bucket) => getToken(auth).then(token => gcp.config.get(bucket, token))
	const isBucketPublic = (bucket) => getToken(auth).then(token => gcp.config.isBucketPublic(bucket, token))
	const updateConfig = (bucket, config={}) => getToken(auth).then(token => gcp.config.update(bucket, config, token))
	const addPublicAccess = filePath => getToken(auth).then(token => {
		const { bucket, file } = _getBucketAndPathname(filePath, { ignoreMissingFile: true })
		return gcp.addPublicAccess(bucket, file, token)
	})
	const removePublicAccess = filePath => getToken(auth).then(token => {
		const { bucket, file } = _getBucketAndPathname(filePath, { ignoreMissingFile: true })
		return gcp.removePublicAccess(bucket, file, token)
	})

	const retryPutObject = (object, filePath, options={}) => _retryFn(() => putObject(object, filePath, options), options)
		.then(res => {
			if (options.public)
				return addPublicAccess(filePath).then(({ data:{ uri } }) => {
					if (res && res.data)
						res.data.uri = uri
					return res
				})
			return res
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
				'get': () => getBucket(bucketName),
				update: (config={}) => updateConfig(bucketName, config),
				addPublicAccess: () => addPublicAccess(bucketName),
				removePublicAccess: () => removePublicAccess(bucketName),
				isPublic: () => isBucketPublic(bucketName),
				object: {
					'get': (filePath, options={}) => retryGetObject(posix.join(bucketName, filePath), options),
					insert: (object, filePath, options={}) => retryPutObject(object, posix.join(bucketName, filePath), options),
					addPublicAccess: (filePath) => addPublicAccess(posix.join(bucketName, filePath)),
					removePublicAccess: (filePath) => removePublicAccess(posix.join(bucketName, filePath))
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



