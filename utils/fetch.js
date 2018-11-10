/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/
const fetch = require('node-fetch')

const postData = (url, headers={}, body) => Promise.resolve(null).then(() => {
	return fetch(url, { method: 'POST', headers, body })
		.then(res => res.json().then(data => ({ status: res.status, data })))
})

const getData = (url, headers={}) => Promise.resolve(null).then(() => {
	return fetch(url, { method: 'GET', headers })
		.then(res => res.json().then(data => ({ status: res.status, data })))
})

module.exports = {
	post: postData,
	'get': getData
}