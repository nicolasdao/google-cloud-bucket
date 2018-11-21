/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const { obj: { merge } } = require('./core')
const { arities } = require('./functional')

const delay = timeout => new Promise(onSuccess => setTimeout(onSuccess, timeout))

const wait = (stopWaiting, options) => Promise.resolve(null).then(() => {
	const now = Date.now()
	const { timeout=300000, start=now, interval=2000 } = options || {}
	
	if ((now - start) > timeout)
		throw new Error('timeout')
	
	return Promise.resolve(null).then(() => stopWaiting()).then(stop => {
		if (stop)
			return
		else
			return delay(interval).then(() => wait(stopWaiting, { timeout, start, interval }))
	})
})

const check = (request, verify, options={}) => request(options.nextState).then(resp => Promise.resolve(verify(resp)).then(result => {
	const { interval=4000, timeOut=300000 } = options
	if (result === true)
		return resp
	else if (timeOut < 0)
		throw new Error('timeout')
	else if (!result || result.nextState)
		return delay(interval).then(() => check(request, verify, { interval, timeOut: timeOut - interval, nextState: result.nextState }))
	else
		return resp
}))

/**
 * [description]
 * @param  {Function} fn        				[description]
 * @param  {Function} successFn 				Returns a boolean that determines whether a response is valid or not. 
 *                                  			Can be a normal function or a promise
 * @param  {Function} failureFn 				(Optional) Returns a boolean that determines whether an exception can be ignored or not. 
 *                                  			Can be a normal function or a promise                           			
 * @param  {Number}   options.retryAttempts   	default: 5. Number of retry
 * @param  {Number}   options.retryInterval   	default: 5000. Time interval in milliseconds between each retry
 * @param  {Number}   options.attemptsCount   	Current retry count. When that counter reaches the 'retryAttempts', the function stops.
 * @param  {Boolean}  options.ignoreError   	In case of constant failure to pass the 'successFn' test, this function will either throw an error
 *                                           	or return the current result without throwing an error if this flag is set to true.
 * @param  {String}   options.errorMsg   		Customize the exception message in case of failure.
 * @param  {String}   options.ignoreFailure   	If set to true, then failure from fn will cause a retry
 * @return {[type]}             				[description]
 */
const retry = arities(
	'function fn, function successFn, object options={}',
	'function fn, function successFn, function failureFn, object options={}',
	({ fn, successFn, failureFn, options={} }) => Promise.resolve(null)
		.then(() => fn()).then(data => ({ error: null, data }))
		.catch(error => { 
			if (options.ignoreFailure && !failureFn)
				failureFn = () => true
			return { error, data: null }
		})
		.then(({ error, data }) => Promise.resolve(null).then(() => {
			if (error && failureFn)
				return failureFn(error)
			else if (error)
				throw error 
			else
				return successFn(data)
		})
			.then(passed => {
				if (!error && passed)
					return data
				else if ((!error && !passed) || (error && passed)) {
					const { retryAttempts=5, retryInterval=5000, attemptsCount=0 } = options
					if (attemptsCount < retryAttempts)
						return delay(retryInterval).then(() => retry(fn, successFn, merge(options, { attemptsCount:attemptsCount+1 })))
					else if (options.ignoreError)
						return data
					else 
						throw new Error(options.errorMsg ? options.errorMsg : `${retryAttempts} attempts to retry the procedure failed to pass the test`)
				} else 
					throw error
			})))


module.exports = {
	delay,
	wait,
	check,
	retry
}