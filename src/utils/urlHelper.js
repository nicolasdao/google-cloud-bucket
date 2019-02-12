const url = require('url')
const path = require('path')

const getUrlInfo = (uri, option={}) => {
	if (uri) {
		let u = uri.trim()
		if (u.trim().indexOf('//') == 0)
			u = `http:${uri}`
		else if (!u.match(/^http:/) && !u.match(/^https:/))
			u = `http://${u.replace(/^\//,'')}`

		try {
			const { host, protocol, origin, pathname, search:querystring, hash } = new url.URL(u)
			let ext
			try {
				ext = (pathname ? path.extname(pathname) : '') || ''
			}
			/*eslint-disable */
			catch(err) {
				/*eslint-enable */
				ext = ''
			}
			const pathnameonly = path.posix.extname(pathname) ? path.posix.dirname(pathname) : pathname
			const contentType = _getContentType(ext)
			return { host, protocol, origin, pathname, querystring, hash, ext: ext, uri, shorturi: joinUrlParts(origin, pathname).replace(/\/$/, '') , pathnameonly, contentType }
		}
		catch(err) {
			if (option.ignoreFailure)
				return { host: null, protocol: null, origin: null, pathname: null, querystring: null, hash: null, ext: null, uri, shorturi: uri, pathnameonly: null, contentType: null }
			else
				return {}
		}
	}
	else
		return {}
}

const joinUrlParts = (...values) => {
	const v = values.filter(x => x)
	return v.length == 0 ? '' : path.join(...v).replace(':/', '://')
}

const isPopularWebPageExt = ext => 
	!ext ||
	ext == '.asp' ||
	ext == '.aspx' ||
	ext == '.axd' ||
	ext == '.asx' ||
	ext == '.asmx' ||
	ext == '.ashx' ||
	ext == '.yaws' ||
	ext == '.html' ||
	ext == '.htm' ||
	ext == '.xhtml' ||
	ext == '.jhtml' ||
	ext == '.jsp' ||
	ext == '.jspx' ||
	ext == '.pl' ||
	ext == '.php' ||
	ext == '.php4' ||
	ext == '.php3' ||
	ext == '.phtml' ||
	ext == '.py' ||
	ext == '.rb' ||
	ext == '.rhtml' ||
	ext == '.shtml'

const isPopularImgExt = ext => 
	ext == '.ai' ||
	ext == '.bmp' ||
	ext == '.gif' ||
	ext == '.ico' ||
	ext == '.jpeg' ||
	ext == '.jpg' ||
	ext == '.png' ||
	ext == '.ps' ||
	ext == '.psd' ||
	ext == '.svg' ||
	ext == '.tif' ||
	ext == '.tiff'

const isPopularFontExt = ext => 
	ext == '.eot' ||
	ext == '.woff2' ||
	ext == '.woff' ||
	ext == '.ttf' ||
	ext == '.otf'

const makePageHtml = uri => {
	if (!uri)
		return 'index.html'
	const { origin, pathname, querystring, hash, ext } = getUrlInfo(uri)
	const u = `${origin}${pathname}`.replace(/\/*$/, '')
	if (!ext)
		return `${u}/index.html${querystring || ''}${hash || ''}`
	else if (!ext || ext == '.html' || ext == '.htm')
		return uri 
	else
		return `${origin}${pathname.split('.').slice(0,-1).join('.')}.html${querystring || ''}${hash || ''}`

}

const _supportedContentType = {
	// web pages
	'.asp': 'text/html',
	'.aspx': 'text/html',
	'.axd': 'text/html',
	'.asx': 'text/html',
	'.asmx': 'text/html',
	'.ashx': 'text/html',
	'.yaws': 'text/html',
	'.html': 'text/html',
	'.htm': 'text/html',
	'.xhtml': 'text/html',
	'.jhtml': 'text/html',
	'.jsp': 'text/html',
	'.jspx': 'text/html',
	'.pl': 'text/html',
	'.php': 'text/html',
	'.php4': 'text/html',
	'.php3': 'text/html',
	'.phtml': 'text/html',
	'.py': 'text/html',
	'.rb': 'text/html',
	'.rhtml': 'text/html',
	'.shtml': 'text/html',
	// web files
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.json': 'application/json',
	'.xml': 'text/xml',
	'.rss': 'text/xml',
	'.pdf': 'application/pdf',
	'.doc': 'application/msword',
	'.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'.xls': 'application/vnd.ms-excel',
	'.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'.ppt': 'application/vnd.ms-powerpoint',
	'.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
	'.csv': 'text/csv',
	// images
	'.ai': 'application/postscript',
	'.bmp': 'image/bmp',
	'.gif': 'image/gif',
	'.ico': 'image/x-icon',
	'.jpeg': 'image/jpeg',
	'.jpg': 'image/jpeg',
	'.png': 'image/png',
	'.ps': 'application/postscript',
	'.psd': 'application/octet-stream',
	'.svg': 'image/svg+xml',
	'.tif': 'image/tiff',
	'.tiff': 'image/tiff',
	// font
	'.eot': 'application/vnd.ms-fontobject',
	'.woff2': 'font/woff2',
	'.woff': 'application/font-woff',
	'.ttf': 'application/font-sfnt',
	'.otf': 'application/font-sfnt',
	// text
	'.txt': 'text/plain',
	'.md': 'text/plain'
}
const _getContentType = (ext) => {
	if (!ext)
		return 'application/octet-stream'

	const contentType = _supportedContentType[ext.toLowerCase()]	
	return contentType || 'application/octet-stream'
}

module.exports = {
	getInfo: getUrlInfo,
	join: joinUrlParts,
	makeHtml: makePageHtml,
	ext:{
		isPage: isPopularWebPageExt,
		isImg: isPopularImgExt,
		isFont: isPopularFontExt
	}
}



