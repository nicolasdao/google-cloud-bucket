/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const googleAuth = require('google-auto-auth')
const { fetch, promise: { retry } } = require('./utils')

const getToken = auth => new Promise((onSuccess, onFailure) => auth.getToken((err, token) => err ? onFailure(err) : onSuccess(token)))

const BUCKET_UPLOAD_URL = (bucket, fileName) => `https://www.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o?uploadType=media&name=${encodeURIComponent(fileName)}`
const BUCKET_URL = bucket => `https://www.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}`
const BUCKET_FILE_URL = (bucket, filepath) => `${BUCKET_URL(bucket)}/o${ filepath ? `${filepath ? `/${encodeURIComponent(filepath)}` : ''}` : ''}`

const _validateRequiredParams = (params={}) => Object.keys(params).forEach(p => {
	if (!params[p])
		throw new Error(`Parameter '${p}' is required.`)
})

const _putObject = (object, filePath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ object, filePath, token })
	const content = JSON.stringify(object || {})
	const [ bucket, ...names ] = filePath.split('/')
	return fetch.post(BUCKET_UPLOAD_URL(bucket, names.join('/')), {
		'Content-Type': 'application/json',
		'Content-Length': content.length,
		Authorization: `Bearer ${token}`
	}, content)
})

const _getBucketFile = (bucket, filepath, token) => Promise.resolve(null).then(() => {
	_validateRequiredParams({ filepath, token })

	return fetch.get(`${BUCKET_FILE_URL(bucket, filepath)}?alt=media`, {
		Accept: 'application/json',
		Authorization: `Bearer ${token}`
	})
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

const createClient = ({ jsonKeyFile }) => {
	_validateRequiredParams({ jsonKeyFile })

	const auth = googleAuth({ 
		keyFilename: jsonKeyFile,
		scopes: ['https://www.googleapis.com/auth/cloud-platform']
	})

	const putObject = (object, filePath) => getToken(auth).then(token => _putObject(object, filePath, token))
	const getObject = (bucket, filePath) => getToken(auth).then(token => _getBucketFile(bucket, filePath, token))

	const retryPutObject = (object, filePath, options={}) => _retryFn(() => putObject(object, filePath), options)
	const retryGetObject = (filePath, options={}) => Promise.resolve(null).then(() => {
		if (!filePath)
			throw new Error(`Missing required argument 'filePath'`)

		const [bucket, ...rest] = filePath.replace(/^\//, '').split('/')
		const file = rest.join('/')
		if (!file)
			throw new Error(`Invalid filePath '${filePath}'. 'filePath' must describe a file (e.g., 'your-bucket/some-optional-path/your-file.json'). It seems you've only passed a bucket.`)

		return _retryFn(() => getObject(bucket, file), options) 
	})

	return {
		insert: retryPutObject,
		'get': retryGetObject
	}
}

module.exports = {
	client: {
		new: createClient
	}
}



