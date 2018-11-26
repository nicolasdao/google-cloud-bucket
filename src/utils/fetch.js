/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/
const fetch = require('node-fetch')
const { getInfo } = require('./urlHelper')

const _processResponse = (res, uri) => {
	const { ext, contentType } = getInfo(uri || '')
	const action = !ext || !contentType || !contentType.match(/(html|css|xml|javascript|rss|csv)/) ? (() => res.json()) : (() => res.text())
	return action()
		.then(data => ({ status: res.status, data }))
		.catch(() => ({ status: 200, data: res }))
}

const postData = (url, headers={}, body) => 
	fetch(url, { method: 'POST', headers, body }).then(res => _processResponse(res, url))

const putData = (url, headers={}, body) => 
	fetch(url, { method: 'PUT', headers, body }).then(res => _processResponse(res, url))

const patchData = (url, headers={}, body) => 
	fetch(url, { method: 'PATCH', headers, body }).then(res => _processResponse(res, url))

const deleteData = (url, headers={}, body) => 
	fetch(url, { method: 'DELETE', headers, body }).then(res => _processResponse(res, url))

const getData = (url, headers={}) => 
	fetch(url, { method: 'GET', headers }).then(res => _processResponse(res, url))

module.exports = {
	post: postData,
	'get': getData,
	put: putData,
	patch: patchData,
	delete: deleteData
}