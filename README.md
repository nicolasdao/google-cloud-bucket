# Google Cloud Bucket &middot;  [![NPM](https://img.shields.io/npm/v/google-cloud-bucket.svg?style=flat)](https://www.npmjs.com/package/google-cloud-bucket) [![Tests](https://travis-ci.org/nicolasdao/google-cloud-bucket.svg?branch=master)](https://travis-ci.org/nicolasdao/google-cloud-bucket) [![License](https://img.shields.io/badge/License-BSD%203--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause) [![Neap](https://neap.co/img/made_by_neap.svg)](#this-is-what-we-re-up-to)
__*Google Cloud Bucket*__ is a node.js package to manage Google Cloud Buckets and its objects. All read APIs uses an exponential backoff retry strategy in cases of errors. By default, that strategy times out after 10 seconds, but it can be configured.

# Table of Contents

> * [Install](#install) 
> * [Getting started](#getting-started) 
>	- [Prerequisite](#prerequisite)
>	- [Basics](#basics) 
>	- [Configuring your bucket or your file (CORS, Public, Static Website)](#configuring-your-bucket-or-your-file) 
>	- [Zipping files](#zipping-files) 
>	- [4 ways to create a client](#3-ways-to-create-a-client)
>		- [User the hosting identity](#user-the-hosting-identity)
>		- [Using a `service-account.json`](#using-a-service-accountjson)
>		- [Using explicit credentials](#using-explicit-credentials)
>		- [Using environment variables](#using-environment-variables)
>	- [Extra Precautions To Make Robust Queries](#extra-precautions-to-make-robust-queries)
>	- [Using An External OAuth2 Token](#using-an-external-oauth2-token)
>	- [Performance Tips](#performance-tips)
> * [Full API Doc](#full-api-doc)
>	- [Storage API](#storage-api)
>	- [Bucket API](#bucket-api)
>	- [BucketObject API](#bucketobject-api)
>	- [Objects](#objects)
> * [Annexes](#annexes) 
>	- [Bucket Name Restrictions](#bucket-name-restrictions)
>	- [List Of All Google Cloud Platform Locations](#list-of-all-google-cloud-platform-locations) 
> * [About Neap](#this-is-what-we-re-up-to)
> * [License](#license)

# Install
```
npm i google-cloud-bucket --save
```

# Getting started
## Prerequisite

Before using this package, you must first:

1. Have a Google Cloud Account.
2. Have a Service Account set up with the following three roles:
	- `roles/storage.objectCreator`
	- `roles/storage.objectAdmin` (only if you want to update access to object or create/delete buckets)
	- `roles/storage.admin` (only if you want to update access to an entire bucket)
3. Get the JSON keys file for that Service Account above, or set up an environment with the appropriate service identity (more about this in the [4 ways to create a client](#3-ways-to-create-a-client) section).
4. If you're using a service account JSON key file, then save that JSON key into a `service-account.json` file (make sure it is located under a path that is accessible to your app), or save the following properties to either manually set up the client or set up environment variables:
	- `project_id`
	- `client_email`
	- `private_key`

## Basics

```js
const { join } = require('path')
const { client } = require('google-cloud-bucket')

// This is one of the many options to create a storage client. To see all the different
// way to create a client, please refer to the '4 ways to create a client' section.
const storage = client.new({ 
	jsonKeyFile: join(__dirname, './service-account.json') 
})

// LISTING ALL THE BUCKETS IN THAT PROJECT 
storage.list().then(console.log)

const someObject = {
	firstname: 'Nicolas',
	lastname: 'Dao',
	company: 'Neap Pty Ltd',
	city: 'Sydney'
}

// CREATING A BUCKET (This method will fail if your bucket name is not globally unique. You also need to the role 'roles/storage.objectAdmin')
storage.bucket('your-globally-unique-bucket-name').create()
	.then(data => console.log(data))

// CREATING A BUCKET IN SPECIFIC LOCATION (default is US. A detailed list of all the locations can be found in the Annexes of this document)
storage.bucket('your-globally-unique-bucket-name').create({ location: 'australia-southeast1' })
	.then(data => console.log(data))

// DELETING A BUCKET
storage.bucket('your-globally-unique-bucket-name').delete({ force:true })
	.then(data => console.log(data))

// GET A BUCKET'S SETUP DATA 
storage.bucket('your-globally-unique-bucket-name').get()
	.then(data => console.log(data))

// ADDING AN OBJECT
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

storage.insert(html, 'your-bucket/a-path/index.html') 

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
storage.get('your-bucket/a-path/image.jpg', { dst: 'some-path/image.jpg' })
	.then(() => console.log(`Image successfully downloaded.`))

// USE CASE 3 - Piping the image buffer into a custom stream reader
const { Writable } = require('stream')
const customReader = new Writable({
	write(chunk, encoding, callback) {
		console.log('Hello chunk of image')
		callback()
	}
})
storage.get('your-bucket/a-path/image.jpg', { streamReader: customReader })
	.then(() => console.log(`Image successfully downloaded.`))

// TESTING IF A FILE OR A BUCKET EXISTS
storage.exists('your-bucket/a-path/image.jpg')
	.then(fileExists => fileExists ? console.log('File exists.') : console.log('File does not exist.'))

// LISTING ALL THE FILES METADATA WITH A FILEPATH THAT STARTS WITH SPECIFIC NAME
storage.list('your-bucket/a-path/')
	.then(files => console.log(files))
```

__*Bucket API*__

The examples above demonstrate how to insert and query any storage. We've also included a variant of those APIs that are more focused on the bucket:

```js
// THIS API:
storage.insert(someObject, 'your-bucket/a-path/filename.json')
// CAN BE REWRITTEN AS FOLLOW:
storage.bucket('your-bucket').object('a-path/filename.json').insert(someObject)

// THIS API:
storage.get('your-bucket/a-path/filename.json').then(obj => console.log(obj))
// CAN BE REWRITTEN AS FOLLOW:
storage.bucket('your-bucket').object('a-path/filename.json').get().then(obj => console.log(obj))

// THIS API:
storage.exists('your-bucket/a-path/image.jpg')
	.then(fileExists => fileExists ? console.log('File exists.') : console.log('File does not exist.'))
// CAN BE REWRITTEN AS FOLLOW:
storage.bucket('your-bucket').object('a-path/image.jpg').exists()
	.then(fileExists => fileExists ? console.log('File exists.') : console.log('File does not exist.'))

// THIS API:
storage.list('your-bucket/a-path/')
	.then(files => console.log(files))
// CAN BE REWRITTEN AS FOLLOW:
storage.bucket('your-bucket').object('a-path/').list()
	.then(files => console.log(files))
```

## Configuring your bucket or your file
### Publicly Readable Config

This allows to make any files publicly readable by anybody on the web. That's usefull if you want to host a website, or publish data (e.g., RSS feed).

Once your bucket is publicly readable, everyone can access it at this url: [https://storage.googleapis.com/your-bucket/some-path/index.html](https://storage.googleapis.com/your-bucket/some-path/index.html)

> WARNING: If that bucket hosts files that hsould be accessible cross domain (e.g., an RSS feed), don't forget to also set up CORS (next section [Configuring CORS On a Bucket](#configuring-cors-on-a-bucket)).

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

### Making A Single File Publicly Readable At Creation Time

It is also possible to make a single file publicly readable in a single command when the file is created:

```js
storage.insert(html, 'your-bucket/a-path/index.html', { public: true }) 
	.then(({ publicUri }) => console.log(`Your web page is publicly available at: ${publicUri}`)) 
```

Once your file is publicly readable, everyone can access it at this url: [https://storage.googleapis.com/your-bucket/a-path/index.html](https://storage.googleapis.com/your-bucket/a-path/index.html)

> WARNING: If that bucket hosts files that hsould be accessible cross domain (e.g., an RSS feed), don't forget to also set up CORS (next section [Configuring CORS On a Bucket](#configuring-cors-on-a-bucket)).


### Setting Single File Content Encoding At Creation Time

It is also possible to set a file's content encoding in a single command when the file is created:

```js
storage.insert(html, 'your-bucket/a-path/index.html', { contentEncoding: 'gzip' })
	.then(({ publicUri }) => console.log(`Your gzipped file is available at: ${publicUri}`))
```

### Configuring CORS On a Bucket

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

### Configuring A Bucket As A Static Website

To achieve this you need to setup 5 things:

1. You need to setup the service account that you've been using to manage your bucket (defined in your `service-account.json`) as a domain owner. To achieve that, the first step is to prove your ownership using [https://search.google.com/search-console/welcome](https://search.google.com/search-console/welcome). When that's done, open the __settings__ and select __User and permissions__. There, you'll be able to add a new owner, which will allow you to add the email of your service account.
2. Create a bucket with a name matching your domain (e.g., `www.your-domain-name.com`)
3. Make that bucket public. Refer to section [Publicly Readable Config](#publicly-readable-config) above.
4. Add a new CNAME record in your DNS similar to this:

	| Type  | Name | Value						|
	|-------|------|----------------------------|
	| CNAME | www  | c.storage.googleapis.com 	|

5. Configure the bucket so that each index.html and the 404.html page are the default pages (otherwise, you'll have to explicitly enter http://www.your-domain-name.com/index.html to reach your website instead of simply entering http://www.your-domain-name.com):

```js
bucket.website.setup({
	mainPageSuffix: 'index.html',
	notFoundPage: '404.html'
}).then(console.log)
```
## Zipping files

```js
const bucket = storage.bucket('your-bucket-name')

bucket.object('some-folder-path').zip({ 
	to: {
		local: 'some-path-on-your-local-machine',
		bucket: {
			name: 'another-existing-bucket-name', 	// Optional (default: Source bucket. In our example, that source bucket is 'your-bucket-name')
			path: 'some-folder-path.zip' 			// Optional (default: 'archive.zip'). If specified, must have the '.zip' extension.
		}
	}, 
	ignore:[/\.png$/, /\.jpg$/, /\.html$/] // Optional. Array of strings or regex
})
.then(({ count, data }) => {
	console.log(`${count} files have been zipped`)
	if (data) 
		// 'data' is null if the 'options.to' is defined
		console.log(`The zip file's size is: ${data.length/1024} KB`)
})
```

__*Extra Options*__

You can also track the various steps of the zipping process with the optional `on` object:

```js
const bucket = storage.bucket('your-bucket-name')

bucket.object('some-folder-path').zip({ 
	to: {
		local: 'some-path-on-your-local-machine',
		bucket: {
			name: 'another-existing-bucket-name', 	// Optional (default: Source bucket. In our example, that source bucket is 'your-bucket-name')
			path: 'some-folder-path.zip' 			// Optional (default: 'archive.zip'). If specified, must have the '.zip' extension.
		}
	}, 
	on:{
		'files-listed': (files) => {
			console.log(`Total number of files to be zipped: ${files.count}`)
			console.log(`Raw size: ${(files.size/1024/1024).toFixed(1)} MB`)
			// 'files.data' is an array of all the files' details
		},
		'file-received': ({ file, size }) => {
			console.log(`File ${file} (byte size: ${size}) is being zipped`)
		},
		'finished': ({ size }) => {
			console.log(`Zip process completed. The zip file's size is ${size} bytes`)
		},
		'saved': () => {
			console.log('The zipped file has been saved')
		},
		'error': err => {
			console.log(`${err.message}\n${err.stack}`)
		}
	}
})
.then(({ count, data }) => {
	console.log(`${count} files have been zipped`)
	if (data) 
		// 'data' is null if the 'options.to' is defined
		console.log(`The zip file's size is: ${data.length/1024} KB`)
})
```

## 4 ways to create a client

This library supports four different ways to create a client. The first method is the recommended way:
1. [User the hosting identity](#user-the-hosting-identity)
2. [Using a `service-account.json`](#using-a-service-accountjson)
3. [Using explicit credentials](#using-explicit-credentials)
4. [Using environment variables](#using-environment-variables)

### User the hosting identity

```js
const storage = client.new()
```

In this case, the package fetches the credentials automatically. It will try three different techniques to get those data, and if none of them work, an error is thrown. Those techniques are:
1. If the code is hosted on GCP (e.g., Cloud Compute, App Engine, Cloud Function or Cloud Run) then the credentials are extracted from the service account associated with the GCP service.
2. If the `GOOGLE_APPLICATION_CREDENTIALS` environment variable exists, its value is supposed to be the path to a service account JSON key file on the hosting machine.
3. If the `~/.config/gcloud/application_default_credentials.json` file exists, then the credentials it contains are used (more about setting that file up below).

When developing on your local environment, use either #2 or #3. #3 is equivalent to being invited by the SysAdmin to the project and granted specific privileges. To set up `~/.config/gcloud/application_default_credentials.json`, follow those steps:

- Make sure you have a Google account that can access both the GCP project and the resources you need on GCP. 
- Install the `GCloud CLI` on your environment.
- Execute the following commands:
	```
	gcloud auth login
	gcloud config set project <YOUR_GCP_PROJECT_HERE>
	gcloud auth application-default login
	```
	The first command logs you in. The second command sets the `<YOUR_GCP_PROJECT_HERE>` as your default project. Finally, the third command creates a new `~/.config/gcloud/application_default_credentials.json` file with the credentials you need for the `<YOUR_GCP_PROJECT_HERE>` project.

### Using a `service-account.json`

We assume that you have created a Service Account in your Google Cloud Account (using IAM) and that you've downloaded a `service-account.json` (the name of the file does not matter as long as it is a valid json file). The first way to create a client is to provide the path to that `service-account.json` as shown in the following example:

```js
const storage = client.new({ 
	jsonKeyFile: join(__dirname, './service-account.json') 
})
```

### Using explicit credentials

This method is similar to the previous one. You should have dowloaded a `service-account.json`, but instead of providing its path, you provide some of its details explicitly:

```js
const storage = client.new({ 
	credentials: {
		project_id: 'your-project-id', 
		client_email:'something-1234@your-project-id.iam.gserviceaccount.com', 
		private_key: '-----BEGIN PRIVATE KEY-----\n123456789-----END PRIVATE KEY-----\n'
	}
})
```

### Using environment variables

```js
const storage = client.new()
```

The above will only work if all the following environment variables are set:
- `GOOGLE_CLOUD_BUCKET_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT_ID`
- `GOOGLE_CLOUD_BUCKET_CLIENT_EMAIL` or `GOOGLE_CLOUD_CLIENT_EMAIL`
- `GOOGLE_CLOUD_BUCKET_PRIVATE_KEY` or `GOOGLE_CLOUD_PRIVATE_KEY`

### 4. Using a project_id

If you're managing an Google Cloud OAuth2 token yourself (most likely using the [`google-auto-auth`](https://www.npmjs.com/package/google-auto-auth) library), you are not required to explicitly pass account details like what was done in the previous 2 approaches. You can simply specify the `project_id`:

```js
const storage = client.new({ credentials: { project_id: 'your-project-id'} })
```

Refer to the next section to see how to pass an OAuth2 token.

## Extra Precautions To Make Robust Queries
### Avoiding Network Errors

Networks errors (e.g. socket hang up, connect ECONNREFUSED) are a fact of life. To deal with those undeterministic errors, this library uses a simple exponential back off retry strategy, which will reprocess your read or write request for 10 seconds by default. You can increase that retry period as follow:

```js
// Retry timeout for CHECKING FILE EXISTS
storage.exists('your-bucket/a-path/image.jpg', { timeout: 30000 }) // 30 seconds retry period timeout

// Retry timeout for INSERTS
storage.insert(someObject, 'your-bucket/a-path/filename.json', { timeout: 30000 }) // 30 seconds retry period timeout

// Retry timeout for QUERIES
storage.get('your-bucket/a-path/filename.json', { timeout: 30000 }) // 30 seconds retry period timeout
```

## Using An External OAuth2 Token

If you've used the 3rd method to create a client (i.e. [3. Using a ProjectId](#3-using-a-projectid)), then all the method you use require an explicit OAuth2 token:

```js
storage.list({ token }).then(console.log)
```

All method accept a last optional argument object.

## Performance Tips

The Google Cloud Storage API supports [partial response](https://cloud.google.com/storage/docs/json_api/v1/how-tos/performance#partial-response). This allows to only return specific fields rather than all of them, which can improve performances if you're querying a lot of objects. The only method that currently supports partial response is the the `list` API.

```js
storage.bucket('your-bucket').object('a-folder/').list({ fields:['name'] })
```

The above example only returns the `name` field. The full list of supported fields is detailed under [bucketObject.list([options])](#bucketobjectlistoptions-promisearrayobject) section. 

# Full API Doc
## Storage API

> To create the `storage` object, please refer to the previous section [3 ways to create a client](#3-ways-to-create-a-client). 

This object allows to perform most read/write operations. It uses a string representing the path to where the objects or folders are. If using path is the stragegy you decide to employ to manage objects, then the Storage API is the way to go. If, on the contrary, you need to reason based on a specific bucket or a specific object, then it is recommended to use the [Bucket API](#bucket-api) or the [BucketObject API](#bucketobject-api). 

### storage.get(filePath[, options]): `<Promise<`[`GoogleBucketObject`](#googlebucketobject)`>>`

`storage.get('your-bucket-name/path-to-file/your-file.css').then(console.log)`

This writes a CSS content to the output.

Gets an object located under the bucket's `filePath` path.
* `filePath` `<String>`
* `options` `<Object>`
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).
* Returns the content of the file in the format defined by its mime type (e.g., json object, string, buffer).

### storage.list([options]) or storage.list(filePath[, options]): `<Promise<Array<`[`GoogleBucketBase`](#googlebucketbase)|[`GoogleBucketObject`](#googlebucketobject)`>>>`

`storage.list('your-bucket-name/path-to-file').then(console.log)`

This writes an array of object describing all the files under that path to the output.

Lists buckets for this project or objects under a specific `filePath`.
* `filePath` `<String>` 
* `options` `<Object>`  
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).
* Returns either
	- An array of [GoogleBucketBase](#googlebucketbase) if no `filePath` is passed.
	- An array of [GoogleBucketObject](#googlebucketobject) if a `filePath` is passed.

### storage.insert(object, filePath[, options]): `<Promise<`[`GoogleBucketObjectPlus`](#googlebucketobjectplus)`>>`

`storage.insert({ hello:'world' }, 'your-bucket-name/path-to-file/sample.json').then(console.log)`

Inserts a new object to `filePath`.
* `object` `<Object>`Object you want to upload.
* `filePath` `<String>`Storage's pathname destination where that object is uploaded, e.g., `your-bucket-id/media/css/style.css`.
* `options` `<Object>`:
	- `headers` `<Object>`:
		- `contentType` `<String>` (standard): This is equivalent to the  `content-type` response header.
		- `contentDisposition` `<String>` (standard): This is equivalent to the `content-disposition` response header.
		- `contentEncoding` `<String>` (standard): This is equivalent to the  `content-encoding` response header.
		- `contentLanguage` `<String>` (standard): This is equivalent to the  `content-language` response header.
		- `whatever-you-want` `<String>` (custom)
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).
* Returns a [GoogleBucketObjectPlus](#googlebucketobjectplus) object.

> NOTE: The content type of each object request is automatically determined by the file's URL. However, there are scenarios where the extension is unknown or the content type must be overidden. In that case, use the option as follow: `{ headers: { 'Content-Type': 'application/json' } }`.

### storage.insertFile(localPath, filePath[, options]): `<Promise<`[`GoogleBucketObjectPlus`](#googlebucketobjectplus)`>>`

`storage.insertFile('/Users/you/your-file.jpg', 'your-bucket-name/path-to-file/your-file.jpg').then(console.log)`

Inserts a file located at `localPath` to `filePath`.
* `localPath` `<String>`Absolute path on your local machine of the file you want to upload.
* `filePath` `<String>` Storage's pathname destination where that object is uploaded, e.g., `your-bucket-id/media/css/style.css`.
* `options` `<Object>`:
	- `headers` `<Object>`:
		- `contentType` `<String>` (standard): This is equivalent to the  `content-type` response header.
		- `contentDisposition` `<String>` (standard): This is equivalent to the `content-disposition` response header.
		- `contentEncoding` `<String>` (standard): This is equivalent to the  `content-encoding` response header.
		- `contentLanguage` `<String>` (standard): This is equivalent to the  `content-language` response header.
		- `whatever-you-want` `<String>` (custom)
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).
* Returns a [GoogleBucketObjectPlus](#googlebucketobjectplus) object.

> NOTE: The content type of each object request is automatically determined by the file's URL. However, there are scenarios where the extension is unknown or the content type must be overidden. In that case, use the option as follow: `{ headers: { 'Content-Type': 'application/json' } }`.

### storage.exists(filePath[, options]): `<Promise<Boolean>>`

Checks whether an object located under the `filePath` path exists or not.
* `filePath` `<String>` 
* `options` `<Object>`  
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### storage.addPublicAccess(filePath[, options]): `<Promise<Object>>`

Grants public access to a file located under the `filePath` path.
* `filePath` `<String>` 
* `options` `<Object>`
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds). 

### storage.removePublicAccess(filePath[, options]): `<Promise<Object>>`

Removes public access from a file located under the `filePath` path.
* `filePath` `<String>` 
* `options` `<Object>`  
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### storage.bucket(bucketId): `<Bucket>`

Gets a bucket object. This object exposes a series of APIs described under the [bucket API](#bucket-api) section below.
* `bucketId` `<String>` 

## Bucket API

The `bucket` object is created using a code snippet similar to the following:

```js
const bucket = storage.bucket('your-bucket-id')
```

### bucket.name: `<String>`

Gets the bucket's name

### bucket.get([options]): `<Promise<Object>>`

Gets a bucket's metadata object.
* `options` `<Object>`  
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.exists([options]): `<Promise<Boolean>>`

Checks if a bucket exists.
* `options` `<Object>`  
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.create([options]): `<Promise<Object>>`

Creates a new bucket.
* `options` `<Object>`  
	- `location` `<String>` Default is `US`. The full list can be found in section [List Of All Google Cloud Platform Locations](#list-of-all-google-cloud-platform-locations).
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

> WARNING: A bucket's name must follow clear guidelines (more details in the [Annexes](#annexes) under the [Bucket Name Restrictions](#bucket-name-restrictions) section). To facilitate the buckets name validation, a mathod called `validate.bucketName` is provided:
>	```js
>	const { utils:{ validate } } = require('google-cloud-bucket')
>	const validate.bucketName('hello') 	// => { valid:true, reason:null }
>	validate.bucketName('hello.com') 	// => { valid:true, reason:null }
>	validate.bucketName('he_llo-23') 	// => { valid:true, reason:null }
>	validate.bucketName('_hello') 		// => { valid:false, reason:'The bucket name must start and end with a number or letter.' }
>	validate.bucketName('hEllo') 		// => { valid:false, reason:'The bucket name must contain only lowercase letters, numbers, dashes (-), underscores (_), and dots (.).' }
>	validate.bucketName('192.168.5.4') 	// => { valid:false, reason:'The bucket name cannot be represented as an IP address in dotted-decimal notation (for example, 192.168.5.4).' }
>	validate.bucketName('googletest') 	// => { valid:false, reason:'The bucket name cannot begin with the "goog" prefix or contain close misspellings, such as "g00gle".' }
>	```

### bucket.delete([options]): `<Promise<Object>>`

Deletes a bucket.
* `options` `<Object>`  
	- `force` `<Boolean>` Default is false. When false, deleting a non-empty bucket throws a 409 error. When set to true, even a non-empty bucket is deleted. Behind the scene, the entire content is deleted first. That's why forcing a bucket deletion might take longer.
* Returns an object:
	- `count` `<Number>` The number of files deleted. This count number does not include the bucket itself (e.g., `0` means that the bucket was empty and was deleted successfully).
	- `data` `<Object>` Extra information about the deleted bucket. 

### bucket.update(config,[options]): `<Promise<Object>>`

Updates a bucket.
* `config` `<Object>` 
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.addPublicAccess([options]): `<Promise<Object>>`

Grants public access to a bucket as well as all its files.
* `options` `<Object>`  
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.removePublicAccess([options]): `<Promise<Object>>`

Removes public access from a bucket as well as all its files.
* `options` `<Object>`  
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.isPublic([options]): `<Promise<Boolean>>`

Checks if a bucket is public or not.
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.zip([options]): `<Promise<Object>>`

Zips bucket.
* `options` `<Object>` 

### bucket.cors.get([options]): `<Promise<`[`GoogleBucketCORS`](#googlebucketcors)`>>`

Get's the bucket's CORS setup.
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

* Returns a [`GoogleBucketCORS`](#googlebucketcors) object.

### bucket.cors.exists(corsConfig, [options]): `<Promise<Boolean>>`

Checks if a bucket has been configured with specific CORS setup.
* `corsConfig` `<Object>` 
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.cors.setup(corsConfig, [options]): `<Promise<Object>>`

Configures a bucket with a specific CORS setup.
* [`corsConfig` `<GoogleBucketCORS>`](#googlebucketcors): 
	- `origin` `<Array<String>>`: e.g., `['*']`.
	- `method` `<Array<String>>`: e.g., `['GET', 'OPTIONS', 'HEAD', 'POST']`.
	- `responseHeader` `<Array<String>>`: e.g., `['Authorization', 'Origin', 'X-Requested-With', 'Content-Type', 'Accept']`.
	- `maxAgeSeconds` `<Number>`: e.g., `3600`.
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.cors.update({ add: addConfig, remove: delConfig }): `<Promise<`[`GoogleBucketCORS`](#googlebucketcors)`>>`

> WARNING: A CORS config must exist prior to calling this API, otherwise, an error is thrown.

`bucket.cors.update({ add:{ responseHeader:['Accept'] }, remove:{ responseHeader:['Authorize'] } })`

* `addConfig` `<`[`GoogleBucketCORS`](#googlebucketcors)`>`
* `delConfig` `<`[`GoogleBucketCORS`](#googlebucketcors)`>`

### bucket.cors.disable([options]): `<Promise<Object>>`

Removes any CORS setup from a bucket.
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.website.setup(webConfig, [options]): `<Promise<Object>>`

Configures a bucket with a specific website setup.

> NOTE: This API does not change the bucket access state. You should make this bucket public first using the `bucket.addPublicAccess` API described above.

* `webConfig` `<Object>` 
	- `mainPageSuffix` `<String>` This is the file that would be served by default when the website's pathname does not specify any explicit file name (e.g., use `index.html` so that https://your-domain.com is equivalent to http://your-domain.com/index.html).
	- `notFoundPage` `<String>` This is the page that would be served if your user enter a URL that does not match any file (e.g., `404.html`).
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucket.object(filePath): `<BucketObject>`

Gets a bucket's object reference. This object exposes a series of APIs detailed in the next section [BucketObject API](#bucketobject-api).
* `filePath` `<String>` This path represents a file or a folder.

## BucketObject API

The `bucketObject` object is created using a code snippet similar to the following:

```js
const bucket = storage.bucket('your-bucket-id')
const bucketObject = bucket.object('folder1/folder2/index.html')
```

An bucket object can also be a folder:

```js
const bucketFolder = bucket.object('folder1/folder2')
```

### bucketObject.file: `<String>`

`console.log(bucketObject.file)`

Gets bucketObject file name.

### bucketObject.get([options]): `<Promise<<Object>>`

> WARNING: Only works if the object is a file. Will not work for folder.

`bucketObject.get().then(console.log)`

Gets the bucket object.
* `options` `<Object>` 
	- `headers` `<Object>` The content type of each object request is automatically determined by the file's URL. However, there are scenarios where the extension is unknown or the content type must be overidden. In that case, this option can be used as follow: `{ headers: { 'Content-Type': 'application/json' } }`.
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucketObject.getInfo([options]): `<Promise<Object>>`

> WARNING: Only works if the object is a file. Will not work for folder.

`bucketObject.getInfo().then(console.log)`

Gets the file's metadata.
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucketObject.list([options]): `<Promise<<Array<Object>>>`

Lists all the objects' metadata located under the bucket object if that bucket object is a folder. If the object is a file, the response is a single object array where the only object represents the file's metadata.
* `options` `<Object>` 
	- `pattern` `<String|Array<String>>` Filters results using a glob pattern or an array of globbing patterns (e.g., `'**/*.png'` to only get png images).
	- `ignore` `<String|Array<String>>` Filters results using a glob pattern or an array of globbing patterns to ignore some files or folders (e.g., `'**/*.png'` to return everything except png images).
	- `fields` `<Array<String>>` Whitelists the properties that are returned to increase network performance. The available fields are: 'kind','id','selfLink','name','bucket','generation','metageneration','contentType','timeCreated','updated','storageClass','timeStorageClassUpdated','size','md5Hash','mediaLink','crc32c','etag'.
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucketObject.exists([options]): `<Promise<Boolean>>`

Checks if a bucket object exists or not.
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucketObject.insert(object[, options]): `<Promise<GoogleBucketObjectPlus>>`

Inserts a new object to that bucket object.
* `object` `<Object>`Object you want to upload.
* `options` `<Object>`:
	- `headers` `<Object>`:
		- `contentType` `<String>` (standard): This is equivalent to the  `content-type` response header.
		- `contentDisposition` `<String>` (standard): This is equivalent to the `content-disposition` response header.
		- `contentEncoding` `<String>` (standard): This is equivalent to the  `content-encoding` response header.
		- `contentLanguage` `<String>` (standard): This is equivalent to the  `content-language` response header.
		- `whatever-you-want` `<String>` (custom)
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).
* Returns a [GoogleBucketObjectPlus](#googlebucketobjectplus) object.

> NOTE: The content type of each object request is automatically determined by the file's URL. However, there are scenarios where the extension is unknown or the content type must be overidden. In that case, use the option as follow: `{ headers: { 'Content-Type': 'application/json' } }`.

### bucketObject.insertFile(localPath[, options]): `<Promise<GoogleBucketObjectPlus>>`

Inserts a file located at `localPath` to that bucket object.
* `localPath` `<String>`Absolute path on your local machine of the file you want to upload.
* `options` `<Object>`:
	- `headers` `<Object>`:
		- `contentType` `<String>` (standard): This is equivalent to the  `content-type` response header.
		- `contentDisposition` `<String>` (standard): This is equivalent to the `content-disposition` response header.
		- `contentEncoding` `<String>` (standard): This is equivalent to the  `content-encoding` response header.
		- `contentLanguage` `<String>` (standard): This is equivalent to the  `content-language` response header.
		- `whatever-you-want` `<String>` (custom)
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).
* Returns a [GoogleBucketObjectPlus](#googlebucketobjectplus) object.

> NOTE: The content type of each object request is automatically determined by the file's URL. However, there are scenarios where the extension is unknown or the content type must be overidden. In that case, use the option as follow: `{ headers: { 'Content-Type': 'application/json' } }`.

### bucketObject.delete([options]): `<Promise<Object>>`

Deletes an object or an entire folder. 
* `options` `<Object>` 
	- `type` `<String>` Valid values are `'file'` or `'folder'`. By default, the type is determined based on the `filePath` used when creating the `bucketObject` (`const bucketObject = storage.bucket(bucketId).object(filePath)`) but this can lead to errors. It is recommended to set this options explicitly.
* Returns an object:
	- `count` `<Number>` The number of files deleted.
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

> NOTE: To delete a folder, the argument used to create the `bucketObject` must be a folder (e.g., `storage.bucket('your-bucket-id').object('folderA/folderB').delete()`)

### bucketObject.zip([options]): `<Promise<Object>>`

Lists all the objects located under the bucket object (if that bucket object is a folder). 
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucketObject.addPublicAccess([options]): `<Promise<Object>>`

Grants public access to a bucket object.
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucketObject.removePublicAccess([options]): `<Promise<Object>>`

Removes public access from
 a bucket object.
* `options` `<Object>` 
	- `timeout` `<Number>`: Default 10,000 (i.e., 10 seconds).

### bucketObject.headers.update(headers): `<Promise<`[`GoogleBucketBase`](#googlebucketbase)`>>`

> WARNING: Only works if the object is a file. Will not work for folder.

`bucketObject.headers.update({ cacheControl:'public, max-age=3600', 'X-Content-Type-Options':'nosniff' })`

Adds or remove headers on the object.

* `headers` `<Object>`. There are 2 types of headers: The _standard_ and _custom_ headers. The _standard_ headers are a subset of the standard HTTP standard, while the _custom_ ones are whatever you want, BUT they will all be prefixed with `x-goog-meta-`.
	- `contentType` `<String>` (standard): This is equivalent to the  `content-type` response header.
	- `contentDisposition` `<String>` (standard): This is equivalent to the `content-disposition` response header.
	- `contentEncoding` `<String>` (standard): This is equivalent to the  `content-encoding` response header.
	- `contentLanguage` `<String>` (standard): This is equivalent to the  `content-language` response header.
	- `whatever-you-want` `<String>` (custom)

### bucketObject.removeHeaders(object): `<Promise<Object>>`

> WARNING: Only works if the object is a file. Will not work for folder.

## Objects
### GoogleBucketBase

* `kind` `<String>` Always set to 'storage#bucket'.
* `id` `<String>`
* `selfLink` `<String>`
* `projectNumber` `<String>`
* `name` `<String>` 
* `timeCreated` `<String>` UTC date, e.g., '2019-01-18T05:57:24.213Z'.
* `updated` `<String>` UTC date, e.g., '2019-01-18T05:57:32.548Z'.
* `metageneration` `<String>` 
* `iamConfiguration` `<String>` { bucketPolicyOnly: { enabled: false } },
* `location` `<String>` Valid values are described in section [List Of All Google Cloud Platform Locations](#list-of-all-google-cloud-platform-locations).
* `website` `<`[`GoogleBucketWebsite`](#googlebucketwebsite)`>`
* `cors` `<Array<`[`GoogleBucketCORS`](#googlebucketcors)`>>`
* `storageClass` `<String>` 
* `etag` `<String>`

### GoogleBucketFull

Same as [GoogleBucketBase](#googlebucketbase) with an extra property:

* `iam` `<`[`GoogleBucketIAM`](#GoogleBucketIAM)`>`

### GoogleBucketWebsite

* `mainPageSuffix` `<String>` Defines which is the default file served when none is explicitly specified un a URI. For example, setting this property to 'index.html' means that this content could be reached using [https://your-domain.com](https://your-domain.com) instead of [https://your-domain.com/index.html](https://your-domain.com/index.html).
* `notFoundPage` `<String>` E.g., '404.html'. This means that all not found page are redirected to this page.

### GoogleBucketCORS

* `origin` `<Array<String>>` 
* `method` `<Array<String>>` 
* `responseHeader` `<Array<String>>` 
* `maxAgeSeconds` `<Number>` 

### GoogleBucketIAM

* `kind` `<String>` Always set to 'storage#policy',
* `resourceId` `<String>` 
* `bindings` `<Array<`[`GoogleBucketBindings`](#googlebucketbindings)`>>` 
* `etag` `<String>` 

### GoogleBucketBindings

* `role` `<String>` E.g., 'roles/storage.objectViewer', ...
* `members` `<Array<String>>` E.g., 'allUsers', 'projectEditor:your-project-id', 'projectOwner:your-project-id', ...

### GoogleBucketObject 

* `kind` `<String>` Always set to 'storage#object'.
* `id` `<String>`
* `selfLink` `<String>`
* `name` `<String>` Pathname to the object inside the bucket, e.g., 'new/css/line-icons.min.css'.
* `bucket` `<String>` Bucket's ID
* `generation` `<String>` Date stamp in milliseconds from epoc.
* `metageneration` `<String>`
* `contentType` `<String>` e.g., 'text/css'.
* `timeCreated` `<String>` UTC date, e.g., '2019-04-02T22:33:18.362Z'.
* `updated` `<String>` UTC date, e.g., '2019-04-02T22:33:18.362Z'.
* `storageClass` `<String>` Valid value are: 'STANDARD', 'MULTI-REGIONAL', 'NEARLINE', 'COLDLINE'.
* `timeStorageClassUpdated` `<String>`  UTC date, e.g., '2019-04-02T22:33:18.362Z'.
* `size` `<String>` Size in bytes, e.g., '5862'.
* `md5Hash` `<String>`
* `mediaLink` `<String>`
* `crc32c` `<String>`
* `etag` `<String>`

### GoogleBucketObjectPlus 

Same as [GoogleBucketObject](#googlebucketobject), but with the following extra property:

* `publicUri` `<String>` If the object is publicly available, this URI indicates where it is located. This URI follows this structure: [https://storage.googleapis.com/your-bucket-id/your-file-path](https://storage.googleapis.com/your-bucket-id/your-file-path).

# Annexes
## Bucket Name Restrictions

Follow those rules to choose a bucket's name (those rules were extracted from the [official Google Cloud Storage documentation](https://cloud.google.com/storage/docs/naming)): 

- Bucket names must contain only lowercase letters, numbers, dashes (-), underscores (\_), and dots (.). Names containing dots require verification.
- Bucket names must start and end with a number or letter.
- Bucket names must contain 3 to 63 characters. Names containing dots can contain up to 222 characters, but each dot-separated component can be no longer than 63 characters.
- Bucket names cannot be represented as an IP address in dotted-decimal notation (for example, 192.168.5.4).
- Bucket names cannot begin with the "goog" prefix.
- Bucket names cannot contain "google" or close misspellings, such as "g00gle".

To help validate if a name follows those rules, this package provides a utility method called `validate.bucketName`:

```js
const { utils:{ validate } } = require('google-cloud-bucket')
const validate.bucketName('hello') 	// => { valid:true, reason:null }
validate.bucketName('hello.com') 	// => { valid:true, reason:null }
validate.bucketName('he_llo-23') 	// => { valid:true, reason:null }
validate.bucketName('_hello') 		// => { valid:false, reason:'The bucket name must start and end with a number or letter.' }
validate.bucketName('hEllo') 		// => { valid:false, reason:'The bucket name must contain only lowercase letters, numbers, dashes (-), underscores (_), and dots (.).' }
validate.bucketName('192.168.5.4') 	// => { valid:false, reason:'The bucket name cannot be represented as an IP address in dotted-decimal notation (for example, 192.168.5.4).' }
validate.bucketName('googletest') 	// => { valid:false, reason:'The bucket name cannot begin with the "goog" prefix or contain close misspellings, such as "g00gle".' }
```

## List Of All Google Cloud Platform Locations
### Single Regions

Single reagions are bucket locations that indicate that your data are replicated in multiple servers in that single region. Though it is unlikely that you would loose your data because all servers fail, it is however possible that a network failure brings that region inaccessbile. At this stage, your data would not be lost, but they would be unavailable for the period of that network outage. This type of storage is the cheapest.

Use this type of location if your data:
- Are not highly critical.
- Do not have to be quickly delivered wherever your clients are located (choosing us-west2 means that the data access will be fast for clients in Los Angeles, but slower for clients in Belgium). 
- Are so big (multiple terabytes) that the storage cost is a primary concern.

If the above limits are too strict for your use case, then you should probably use a [Multi Regions](#multi-regions).

| Location 					| Description 				|
|---------------------------|---------------------------|
| northamerica-northeast1 	| Canada - Montréal 		|
| us-central1 				| US - Iowa 				|
| us-east1 					| US - South Carolina 		|
| us-east4 					| US - Northern Virginia 	|
| us-west1 					| US - Oregon 				|
| us-west2 					| US - Los Angeles 			|
| southamerica-east1 		| South America - Brazil 	|
| europe-north1 			| Europe - Finland 			|
| europe-west1 				| Europe - Belgium 			|
| europe-west2 				| Europe - England 			|
| europe-west3 				| Europe - Germany 			|
| europe-west4 				| Europe - Netherlands 		|
| asia-east1 				| Asia - Taiwan 			|
| asia-east2 				| Asia - Hong Kong 			|
| asia-northeast1 			| Asia - Japan 				|
| asia-south1 				| Asia - Mumbai 			|
| asia-southeast1 			| Asia - Singapore 			|
| australia-southeast1 		| Asia - Australia 			|
| asia 						| Asia 						|
| us 						| US 						|
| eu 						| Europe 					|

### Multi Regions

Multi regions are bucket locations where your data are not only replicated in multiple servers in the same regions, but also replicated across multiple locations (e.g., `asia` will replicate your data across _Taiwan_, _Hong Kong_, _Japan_, _Mumbai_, _Singapore_, _Australia_). That means that your data are:

- Quickly accessible wherever your clients are in that continent.
- Highly available. Even if a region goes down, the others will carry on serving your data.
- A bit more expensive. 

| Location 					| Description 				|
|---------------------------|---------------------------|
| asia 						| Asia 						|
| us 						| US 						|
| eu 						| Europe 					|


# This Is What We re Up To
We are Neap, an Australian Technology consultancy powering the startup ecosystem in Sydney. We simply love building Tech and also meeting new people, so don't hesitate to connect with us at [https://neap.co](https://neap.co).

Our other open-sourced projects:
#### GraphQL
* [__*graphql-s2s*__](https://github.com/nicolasdao/graphql-s2s): Add GraphQL Schema support for type inheritance, generic typing, metadata decoration. Transpile the enriched GraphQL string schema into the standard string schema understood by graphql.js and the Apollo server client.
* [__*schemaglue*__](https://github.com/nicolasdao/schemaglue): Naturally breaks down your monolithic graphql schema into bits and pieces and then glue them back together.
* [__*graphql-authorize*__](https://github.com/nicolasdao/graphql-authorize.git): Authorization middleware for [graphql-serverless](https://github.com/nicolasdao/graphql-serverless). Add inline authorization straight into your GraphQl schema to restrict access to certain fields based on your user's rights.

#### React & React Native
* [__*react-native-game-engine*__](https://github.com/bberak/react-native-game-engine): A lightweight game engine for react native.
* [__*react-native-game-engine-handbook*__](https://github.com/bberak/react-native-game-engine-handbook): A React Native app showcasing some examples using react-native-game-engine.

#### Authentication & Authorization
* [__*userin*__](https://github.com/nicolasdao/userin): UserIn let's App engineers to implement custom login/register feature using Identity Providers (IdPs) such as Facebook, Google, Github. 

#### General Purposes
* [__*core-async*__](https://github.com/nicolasdao/core-async): JS implementation of the Clojure core.async library aimed at implementing CSP (Concurrent Sequential Process) programming style. Designed to be used with the npm package 'co'.
* [__*jwt-pwd*__](https://github.com/nicolasdao/jwt-pwd): Tiny encryption helper to manage JWT tokens and encrypt and validate passwords using methods such as md5, sha1, sha256, sha512, ripemd160.

#### Google Cloud Platform
* [__*google-cloud-bucket*__](https://github.com/nicolasdao/google-cloud-bucket): Nodejs package to manage Google Cloud Buckets and perform CRUD operations against them.
* [__*google-cloud-bigquery*__](https://github.com/nicolasdao/google-cloud-bigquery): Nodejs package to manage Google Cloud BigQuery datasets, and tables and perform CRUD operations against them.
* [__*google-cloud-tasks*__](https://github.com/nicolasdao/google-cloud-tasks): Nodejs package to push tasks to Google Cloud Tasks. Include pushing batches.

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
