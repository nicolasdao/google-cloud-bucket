/**
 * Copyright (c) 2017-2019, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license.
*/

const mime = require('mime-types')

/**
 * Gets the mime type associated with a file extension. 
 *
 * @param {String}		fileOrExt	e.g., 'json', '.md', 'file.html', 'folder/file.js', 'data:image/png;base64,....'
 * @return {String}					e.g., 'application/json', 'text/markdown', 'text/html', 'application/javascript'
 */
const getMimeType = fileOrExt => {
	if (!fileOrExt)
		return ''
	
	// Test if 'fileOrExt' is a data URI
	if (/^data:(.*?),/.test(fileOrExt)) 
		return (fileOrExt.match(/^data:(.*?);/, '') || [])[1] || ''
	
	return mime.lookup(fileOrExt) || ''
}

/**
 * Gets the content type associated with a file extension. 
 *
 * @param {String}		fileOrExt	e.g., 'json', '.md', 'file.html', 'folder/file.js'
 * @return {String}					e.g., 'application/json; charset=utf-8', 'text/x-markdown; charset=utf-8', 'text/html; charset=utf-8'
 */
const getContentType = fileOrExt => !fileOrExt ? '' : (mime.contentType(fileOrExt) || '')

/**
 * Gets the a file's extension or the file extension associated with a mime type.
 *
 * @param {String}		mimeType	e.g., 'application/json', 'text/x-markdown', 'hello.pdf'
 * @return {String}					e.g., 'json', 'md', 'pdf'
 */
const getExt = fileOrMimeType => {
	if (!fileOrMimeType)
		return ''
	
	const t = fileOrMimeType.split('.')
	const [ext] = t[1] ? t.slice(-1) : [null]
	let x
	if (!ext && fileOrMimeType.indexOf('/') >= 0)
		x = mime.extension(fileOrMimeType) || ''
	else
		x = ext

	return x == 'document' ? 'doc' : x
}

module.exports = {
	getMimeType,
	getContentType,
	getExt
}