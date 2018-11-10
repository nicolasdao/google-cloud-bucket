/**
 * Copyright (c) 2018, Neap Pty Ltd.
 * All rights reserved.
 * 
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

const TYPES = { 'string': true, 'number': true, 'boolean': true, 'object': true, 'function': true }
const arities = (...args) => {
	const fn = args.slice(-1)[0]
	const signatures = args.slice(0,-1)
	if (args.length == 0)
		throw new Error('Missing required arguments. Function \'arities\' must have at least one argument.')
	else if (typeof(fn) != 'function')
		throw new Error('Wrong argument exception. The last argument must be a function.')

	if (signatures.length == 0)
		return fn 

	const argsRules = signatures.map(def => def.split(',').map(d => {
		let [ type, ...varDetails ] = d.trim().split(/\s+/)
		type = type ? type.toLowerCase() : type
		if (!type || !TYPES[type])
			throw new Error(`Type '${type}' is not supported`)
		
		if (varDetails.length == 0)
			throw new Error(`Argument definition '${d}' is invalid`)
		else {
			const variable = varDetails.join(' ')
			const [ name, ...defaultValue ] = variable.split('=')
			const defaultVal = eval(defaultValue.length == 0 ? null : defaultValue.join('='))
			return { type, name: name.trim(), default: defaultVal }
		}
	}))

	return (...args) => {
		if (args.length == 0)
			return fn({})

		const validRules = args.reduce((canditateRules,value,idx) => {
			const type = typeof(value)
			const maxAriry = Math.max(canditateRules.map(r => r.length))
			if (idx >= maxAriry) // there are more arguments than there are defined in the rules. They will be ignored.
				return canditateRules
			const rules = canditateRules.filter(r => (r[idx] || {}).type == type)
			if (rules.length == 0) { // No rules match. Throw an error
				const argsSequence = args.map(a => `${typeof(a)} ${a}`).join(', ')
				const signs = signatures.join('\n    - ')
				throw new Error(`Invalid arguments exception. None of the predefined function signatures match your arguments sequence:\n- Arguments: ${argsSequence}\n- Allowed arities:\n    - ${signs}`)
			} else
				return rules

		}, argsRules)
		
		const input = validRules[0].reduce((acc, arg, idx) => {
			acc[arg.name] = args[idx]
			return acc
		}, {})

		return fn(input)
	}
} 

module.exports = {
	arities
}