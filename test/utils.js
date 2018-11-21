/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

/* global describe */
/* global it */

const { assert } = require('chai')
const { urlHelper } = require('../src/utils')

describe('utils', () => {
	describe('#urlHelper.getInfo', () => {

		it('01 - Should return the extension of any uri.', () => {
			assert.equal(urlHelper.getInfo('dewde/dwdw/info.json').ext, '.json', '01')
			assert.equal(urlHelper.getInfo('dewde/dwdw/info.html').ext, '.html', '02')
			assert.equal(urlHelper.getInfo('dewde/dwdw/info.jpg').ext, '.jpg', '03')
			assert.equal(urlHelper.getInfo('dewde/dwdw/').ext, '', '04')
		})

		it('02 - Should return the content type of any uri.', () => {
			assert.equal(urlHelper.getInfo('dewde/dwdw/info.json').contentType, 'application/json', '01')
			assert.equal(urlHelper.getInfo('dewde/dwdw/info.html').contentType, 'text/html', '02')
			assert.equal(urlHelper.getInfo('dewde/dwdw/info.jpg').contentType, 'image/jpeg', '03')
		})
	})
})
