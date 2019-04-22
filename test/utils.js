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
const { utils:{ validate } } = require('../index.js')

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
	describe('#validate.bucketName', () => {
		it('01 - Should validate any bucket name.', () => {
			const v_01 = validate.bucketName('hello')
			const v_02 = validate.bucketName('hello.com')
			const v_03 = validate.bucketName('hello-23')
			const v_04 = validate.bucketName('he_llo-23')
			const v_10 = validate.bucketName('ffebwjfbdwgfubfjdbwfgjbfwfuewfjbwjfgjewgfjgwugfuew.fegwqufbdjhwfuyeqfueowvfuyevwqufvuyoewvfuyoeguyfbchw')
			const v_05 = validate.bucketName('192.168.5.4')
			const v_06 = validate.bucketName('w')
			const v_07 = validate.bucketName('_hello')
			const v_08 = validate.bucketName('hello_')
			const v_09 = validate.bucketName('ffebwjfbdwgfubfjdbwfgjbfwfuewfjbwjfgjewgfjgwugfuewfegwqufbdjhwfuyeqfueowvfuyevwqufvuyoewvfuyoeguyfbchw')
			const v_11 = validate.bucketName('googletest')
			const v_12 = validate.bucketName('g00gletest')
			const v_13 = validate.bucketName('hEllo')
			assert.equal(v_01.valid, true, '01')
			assert.equal(v_01.reason, null, '02')
			assert.equal(v_02.valid, true, '03')
			assert.equal(v_02.reason, null, '04')
			assert.equal(v_03.valid, true, '05')
			assert.equal(v_03.reason, null, '06')
			assert.equal(v_04.valid, true, '07')
			assert.equal(v_04.reason, null, '08')
			assert.equal(v_10.valid, true, '09')
			assert.equal(v_10.reason, null, '10')
			assert.equal(v_05.valid, false, '11')
			assert.equal(v_05.reason, 'The bucket name cannot be represented as an IP address in dotted-decimal notation (for example, 192.168.5.4).', '12')
			assert.equal(v_06.valid, false, '13')
			assert.equal(v_06.reason, 'The bucket name contain more than 2 characters.', '14')
			assert.equal(v_07.valid, false, '15')
			assert.equal(v_07.reason, 'The bucket name must start and end with a number or letter.', '16')
			assert.equal(v_08.valid, false, '17')
			assert.equal(v_08.reason, 'The bucket name must start and end with a number or letter.', '18')
			assert.equal(v_09.valid, false, '19')
			assert.equal(v_09.reason, 'Bucket names cannot be longer than 63 characters.', '20')
			assert.equal(v_11.valid, false, '21')
			assert.equal(v_11.reason, 'The bucket name cannot begin with the "goog" prefix or contain close misspellings, such as "g00gle".', '22')
			assert.equal(v_12.valid, false, '23')
			assert.equal(v_12.reason, 'The bucket name cannot begin with the "goog" prefix or contain close misspellings, such as "g00gle".', '24')
			assert.equal(v_13.valid, false, '25')
			assert.equal(v_13.reason, 'The bucket name must contain only lowercase letters, numbers, dashes (-), underscores (_), and dots (.).', '26')
		})
	})
})
