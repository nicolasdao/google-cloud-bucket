# Google Cloud Bucket &middot;  [![NPM](https://img.shields.io/npm/v/google-cloud-bucket.svg?style=flat)](https://www.npmjs.com/package/google-cloud-bucket) [![Tests](https://travis-ci.org/nicolasdao/google-cloud-bucket.svg?branch=master)](https://travis-ci.org/nicolasdao/google-cloud-bucket) [![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause) [![Neap](https://neap.co/img/made_by_neap.svg)](#this-is-what-we-re-up-to)
__*Google Cloud Bucket*__ is node.js package to add objects to a Google Cloud Bucket.

# Table of Contents

> * [Install](#install) 
> * [How To Use It](#how-to-use-it) 
> * [About Neap](#this-is-what-we-re-up-to)
> * [License](#license)


# Install
```
npm i google-cloud-bucket --save
```

# How To Use It

## Prerequisite

Before using this package, you must first:

1. Have a Google Cloud Account.

2. Have a bucket in that Google Account.

3. Have a Service Account set up with the following 2 roles:
	- `roles/storage.objectCreator`
	- `roles/storage.objectAdmin` (only if you want to update access to object)
	- `roles/storage.admin` (only if you want to update access to an entire bucket)

4. Get the JSON keys file for that Service Account above

5. Save that JSON key into a `service-account.json` file. Make sure it is located under a path that is accessible to your app (the root folder usually).

## Show Me The Code

### Basics

```js
const { join } = require('path')
const { client } = require('google-cloud-bucket')

const storage = client.new({ 
	jsonKeyFile: join(__dirname, './service-account.json') 
})

const someObject = {
	firstname: 'Nicolas',
	lastname: 'Dao',
	company: 'Neap Pty Ltd',
	city: 'Sydney'
}


// ADDING AN OBJECT WITH PRIVATE ACCESS
storage.insert(someObject, 'your-bucket/a-path/filename.json') // insert an object into a bucket 'a-path/filename.json' does not need to exist
	.then(() => storage.get('your-bucket/a-path/filename.json')) // retrieve that new object
	.then(res => console.log(JSON.stringify(res, null, ' ')))

// ADDING A HTML PAGE WITH PUBLIC ACCESS (warning: Your service account must have the 'roles/storage.objectAdmin' role)
const html = `
<!doctype html>
<html>
	<body>
		<h1>Hello Giiiiirls</h1>
	</body>
</html>`

storage.insert(html, 'your-bucket/a-path/index.html', { public: true }) 
	.then(({ publicUri }) => console.log(`Your web page is publicly available at: ${publicUri}`)) 

// UPLOADING AN IMAGE (we assume we have access to an image as a buffer variable called 'imgBuffer')
storage.insert(imgBuffer, 'your-bucket/a-path/image.jpg') 

// GETTING BACK THE OBJECT
storage.get('your-bucket/a-path/filename.json').then(obj => console.log(obj))

// GETTING THE HTML BACK
storage.get('your-bucket/a-path/index.html').then(htmlString => console.log(htmlString))

// GETTING BACK THE IMAGE
// USE CASE 1 - Loading the entire buffer in memory
storage.get('your-bucket/a-path/image.jpg').then(imgBuffer => console.log(imgBuffer))

// USE CASE 2 - Loading the image on your filesystem
storage.get('your-bucket/a-path/image.jpg', { dst: 'some-path/image.jpg' }).then(() => console.log(`Image successfully downloaded.`))

// USE CASE 3 - Piping the image buffer into a custom stream reader
const { Writable } = require('stream')
const customReader = new Writable({
	write(chunk, encoding, callback) {
		console.log('Hello chunk of image')
		callback()
	}
})
storage.get('your-bucket/a-path/image.jpg', { streamReader: customReader }).then(() => console.log(`Image successfully downloaded.`))
```

> Notice the usage of the `public: true` flag in the `insert` statement above. This automatically makes this specific file publicly available at [https://storage.googleapis.com/your-bucket/a-path/index.html](https://storage.googleapis.com/your-bucket/a-path/index.html). If that file is supposed to stay private, then don't use that flag. To make the entire bucket public, refer to the next section [Publicly Readable Config](#publicly-readable-config).

### Bucket API

The examples above show how to insert and query any storage. We've also included a variant of those APIs that are more focused on a specific bucket:

```js
// THIS API
storage.insert(someObject, 'your-bucket/a-path/filename.json')
// CAN BE REWRITTEN
storage.bucket('your-bucket').object('a-path/filename.json').insert(someObject)

// THIS API
storage.get('your-bucket/a-path/filename.json').then(obj => console.log(obj))
// CAN BE REWRITTEN
storage.bucket('your-bucket').object('a-path/filename.json').get().then(obj => console.log(obj))
```

### Buckets & Files Configuration
#### Publicly Readable Config

This allows to make any files publicly readable by anybody on the web. That's usefull if you want to host a website, or publish data (e.g., RSS feed).

```js
const bucket = storage.bucket('your-bucket')

// TEST WHETHER A BUCKET IS PUBLIC OR NOT
bucket.isPublic().then(isPublic => isPublic ? console.log(`Bucket '${bucket.name}' is public`) : console.log(`Bucket '${bucket.name}' is not public`))

// MAKING A BUCKET PUBLICLY READABLE (warning: Your service account must have the 'roles/storage.admin' role)
// Once a bucket is public, all content added to it (even when omitting the 'public' flag) is public
bucket.addPublicAccess()
	.then(({ publicUri }) => console.log(`Your web page is publicly available at: ${publicUri}`)) 

// REMOVING THE PUBLICLY READABLE ACCESS FROM A BUCKET (warning: Your service account must have the 'roles/storage.admin' role)
bucket.removePublicAccess()

// MAKING AN EXISTING OBJECT PUBLICLY READABLE (warning: Your service account must have the 'roles/storage.objectAdmin' role)
bucket.object('a-path/private.html').addPublicAccess()
	.then(({ publicUri }) => console.log(`Your web page is publicly available at: ${publicUri}`)) 

// REMOVING THE PUBLICLY READABLE ACCESS FROM A FILE  (warning: Your service account must have the 'roles/storage.objectAdmin' role)
bucket.object('a-path/private.html').removePublicAccess()
```

#### Configuring CORS On a Bucket

If your files are publicly readable on the web, they might not be accessible when referenced from other websites. To enable other websites to access your files, you will have to configure [CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS) on your bucket:

```js
// CONFIGURE CORS ON A BUCKET (warning: Your service account must have the 'roles/storage.admin' role)
bucket.cors.setup({
	origin: ['*'],
	method: ['GET', 'OPTIONS', 'HEAD', 'POST'],
	responseHeader: ['Authorization', 'Origin', 'X-Requested-With', 'Content-Type', 'Accept'],
	maxAgeSeconds: 3600
})
.then(() => console.log(`CORS successfully set up on your bucket.`))
```

If you want to check if CORS has already been set up on a bucket:

```js
bucket.cors.exists().then(yes => yes 
	? console.log(`CORS already set up on bucket '${bucket.name}'.`)
	: console.log(`CORS not set up yet on bucket '${bucket.name}'.`))
```

You can also check if a specific CORS config exists:

```js
bucket.cors.exists({
	origin: ['*'],
	method: ['GET', 'OPTIONS', 'HEAD', 'POST'],
	responseHeader: ['Authorization', 'Origin', 'X-Requested-With', 'Content-Type', 'Accept'],
	maxAgeSeconds: 3600
}).then(yes => yes 
	? console.log(`CORS already set up on bucket '${bucket.name}'.`)
	: console.log(`CORS not set up yet on bucket '${bucket.name}'.`))
```

To remove CORS from a bucket:

```js
bucket.cors.disable().then(() => console.log(`CORS successfully disabled on bucket '${bucket.name}'.`))
```

# This Is What We re Up To
We are Neap, an Australian Technology consultancy powering the startup ecosystem in Sydney. We simply love building Tech and also meeting new people, so don't hesitate to connect with us at [https://neap.co](https://neap.co).

Our other open-sourced projects:
#### GraphQL
* [__*graphql-serverless*__](https://github.com/nicolasdao/graphql-serverless): GraphQL (incl. a GraphiQL interface) middleware for [webfunc](https://github.com/nicolasdao/webfunc).
* [__*schemaglue*__](https://github.com/nicolasdao/schemaglue): Naturally breaks down your monolithic graphql schema into bits and pieces and then glue them back together.
* [__*graphql-s2s*__](https://github.com/nicolasdao/graphql-s2s): Add GraphQL Schema support for type inheritance, generic typing, metadata decoration. Transpile the enriched GraphQL string schema into the standard string schema understood by graphql.js and the Apollo server client.
* [__*graphql-authorize*__](https://github.com/nicolasdao/graphql-authorize.git): Authorization middleware for [graphql-serverless](https://github.com/nicolasdao/graphql-serverless). Add inline authorization straight into your GraphQl schema to restrict access to certain fields based on your user's rights.

#### React & React Native
* [__*react-native-game-engine*__](https://github.com/bberak/react-native-game-engine): A lightweight game engine for react native.
* [__*react-native-game-engine-handbook*__](https://github.com/bberak/react-native-game-engine-handbook): A React Native app showcasing some examples using react-native-game-engine.

#### Tools
* [__*aws-cloudwatch-logger*__](https://github.com/nicolasdao/aws-cloudwatch-logger): Promise based logger for AWS CloudWatch LogStream.

# License
Copyright (c) 2018, Neap Pty Ltd.
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
* Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
* Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
* Neither the name of Neap Pty Ltd nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL NEAP PTY LTD BE LIABLE FOR ANY
DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

<p align="center"><a href="https://neap.co" target="_blank"><img src="https://neap.co/img/neap_color_horizontal.png" alt="Neap Pty Ltd logo" title="Neap" height="89" width="200"/></a></p>
