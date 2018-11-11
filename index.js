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
	}, content).then(({ status, data }) => {
		if (status > 299) {
			const message = ((data || {}).error || {}).message || JSON.stringify(data || {})
			let e = new Error(message)
			e.code = status
			throw e 
		}
		return { status, data }
	})
})

const createClient = ({ jsonKeyFile }) => {
	_validateRequiredParams({ jsonKeyFile })

	const auth = googleAuth({ 
		keyFilename: jsonKeyFile,
		scopes: ['https://www.googleapis.com/auth/cloud-platform']
	})

	const putObject = (object, filePath) => getToken(auth).then(token => _putObject(object, filePath, token))

	const retryPutObject = (object, filePath, options={}) => retry(
		() => putObject(object, filePath), 
		() => true, 
		err => {
			if (err && err.message && err.message.indexOf('access') > 0)
				return false
			else
				return true
		},
		{ ignoreFailure: true, retryInterval: 800 })
		.catch(e => {
			if (options.retryCatch)
				return options.retryCatch(e)
			else
				throw e
		})

	return {
		putObject: retryPutObject
	}
}

module.exports = createClient



