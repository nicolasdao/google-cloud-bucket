/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/
const fetch = require('node-fetch')

const _processResponse = res => res.json()
	.then(data => ({ status: res.status, data }))
	.catch(() => ({ status: 200, data: res }))

const postData = (url, headers={}, body) => 
	fetch(url, { method: 'POST', headers, body }).then(_processResponse)

const getData = (url, headers={}) => 
	fetch(url, { method: 'GET', headers }).then(_processResponse)

module.exports = {
	post: postData,
	'get': getData
}