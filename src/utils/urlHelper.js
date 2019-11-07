const url = require('url')
const path = require('path')
const { getMimeType } = require('./fileHelper')

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
	ext == '.tiff' ||
	ext == '.webp'

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

const _getContentType = (ext) => {
	if (!ext)
		return 'application/octet-stream'

	const contentType = getMimeType(ext.toLowerCase().replace(/^\./, ''))
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



