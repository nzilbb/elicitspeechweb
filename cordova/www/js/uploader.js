//
// Copyright 2016 New Zealand Institute of Language, Brain and Behaviour, 
// University of Canterbury
// Written by Robert Fromont - robert.fromont@canterbury.ac.nz
//
//    This file is part of ElicitSpeech Web.
//
//    ElicitSpeech Web is free software; you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation; either version 2 of the License, or
//    (at your option) any later version.
//
//    ElicitSpeech Web is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with ElicitSpeech Web; if not, write to the Free Software
//    Foundation, Inc., 59 Temple Place, Suite 330, Boston, MA  02111-1307  USA
//

// uploader class
Uploader = function(settings, httpAuthorization, progressCallback) {

    this.uploads = {};
    this.finishedTasks = {};
    this.uploadQueue = [];
    this.settings = settings;
    this.progressCallback = progressCallback;
    this.retryFrequency = 30000;
    this.timeout = null;
    this.fileSystem = null;
    this.uploading = false;
    this.httpAuthorization = httpAuthorization;
    
    var uploader = this;

    console.log("uploader.js initialising");
    window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
    window.requestFileSystem(PERSISTENT, 100*1024*1024, function(fs) {
	uploader.fileSystem = fs;
	// start uploads
	uploader.timeout = setTimeout(function() { uploader.scanForUploads(); }, 1000);
    }, uploader.fileError);

}
Uploader.prototype = {
    fileError : function(e) {
	var message = e.message;
	if (!e.message) {
	    switch (e.code) {
	    case FileError.ENCODING_ERR: 
		message = "The URL is malformed. Make sure that the URL is complete and valid.";
		break;
	    case FileError.INVALID_MODIFICATION_ERR: 
		message = "The modification requested is not allowed.";
		break;
	    case FileError.INVALID_STATE_ERR: 
		message = "The operation cannot be performed on the current state of the interface object.";
		break;
	    case FileError.NO_MODIFICATION_ALLOWED_ERR: 
		message = "The state of the underlying file system prevents any writing to a file or a directory.";
		break;
	    case FileError.NOT_FOUND_ERR: 
		message = "A required file or directory could not be found at the time an operation was processed.";
		break;
	    case FileError.NOT_READABLE_ERR: 
		message = "The file or directory cannot be read";
		break;
	    case FileError.PATH_EXISTS_ERR: 
		message = "The file or directory with the same path already exists.";
		break;
	    case FileError.QUOTA_EXCEEDED_ERR: 
		message = "Quota exceeded.";
		break;
	    case FileError.SECURITY_ERR: 
	    message = "Access to the files were denied.";
		break;
	    case FileError.TYPE_MISMATCH_ERR: 
		message = "The app looked up an entry, but the entry found is of the wrong type.";
		break;
	default:
		message = "Unexpected error.";
	    }
	}
	console.log("uploader.js: " + message);
    },

    getParticipantId : function(upload) {
	console.log("uploader.js: getParticipantId: " + upload.seriesDirectory.name);
	var uploader = this;
	upload.seriesDirectory.getFile("participant.json", {}, function(fileEntry) {
	    fileEntry.file(function(file) {
		var reader = new FileReader();	    
		reader.onloadend = function(e) {
		    try {
			console.log("result: "+this.result)
			var participantAttributes = JSON.parse(this.result);
			if (participantAttributes.id && ""+participantAttributes.id != "undefined") {
			    // we already have an ID, so move to the next step
			    uploader.gotParticipantId(upload, participantAttributes);
			} else { // try to generate an ID
			    var xhr = new XMLHttpRequest();
			    xhr.onload = function(e) {
				try {
				    var data = JSON.parse(this.responseText);
				    participantAttributes.id = data.model.name;
				    if (participantAttributes.id) {
		    			console.log("uploader.js: participant ID "+participantAttributes.id);
					fileEntry.createWriter(function(fileWriter) {		    
					    fileWriter.onwriteend = function(e) {
						console.log("uploader.js: Wrote " + fileEntry.fullPath + " with ID");
						// we now have an ID, so move to the next step
						uploader.gotParticipantId(upload, participantAttributes);
					    };		    
					    fileWriter.onerror = function(e) {
						console.log("uploader.js: Write failed for "+fileEntry.fullPath);
						uploader.fileError(e);
						// try again later
						uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
					    };		    
					    var blob = new Blob([JSON.stringify(participantAttributes)], {type: 'application/json'});		    
					    fileWriter.write(blob);				
					}, function(e) {
					    console.log("uploader.js: Could not create writer for " + fileEntry.fullPath);
					    uploader.fileError(e);
					    // try again later
					    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
					}); // createWriter
				    } else { // no ID was returned
					console.log("uploader.js: No ID was returned" + fileEntry.fullPath);
					console.log(this.responseText);
					// try again later
					uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
				    }
				} catch (x) {
		    		    console.log("uploader.js: invalid participant ID response "+x);
				    console.log(this.responseText);
				    // try again later
				    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
				}
			    };
			    xhr.onerror = function(e) {
				console.log("Uploader: Could not generate participant ID: " + e);
				// try again later
				uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
			    };
			    console.log('uploader: requesting new participant ID: ' + uploader.settings.newParticipantUrl);
			    var query = "";
			    for (k in participantAttributes) {
				if (query) query += "&";
				query += k + "=" + participantAttributes[k];
			    }
			    xhr.open("GET", uploader.settings.newParticipantUrl+"?"+query);
			    if (uploader.httpAuthorization) xhr.setRequestHeader("Authorization", uploader.httpAuthorization);
			    xhr.send(participantAttributes);			
			} // try to generate an ID
		    } catch (x) {
			console.log("invalid participant file "+x);
			console.log(this.result);
			// try again later
			uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		    }
		}	    
		reader.readAsText(file);
	    }, function(e) {
		uploader.fileError(e);
		// try again later
		uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
	    })
	}, function(e) { 
	    console.log("uploader.js: Could get read file: " + e.toString());
	    uploader.fileError(e);
	    // try again later
	    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
	});
    },
    gotParticipantId : function(upload, participantAttributes) {
	var uploader = this;
	upload.participantId = participantAttributes.id;
	upload.corpus = participantAttributes.corpus;
	upload.transcriptType = participantAttributes.transcriptType;
	console.log("gotParticipantId " + participantAttributes.id);
	if (upload.participantId) {
	    // upload files
	    var series = upload.participantId + "-" + upload.seriesDirectory.name;
	    upload.finalTranscriptName = upload.participantId + "-" + upload.transcriptName;
	    console.log("uploader.js: transcript "+upload.finalTranscriptName);

	    // gather up doc if there is one
	    if (upload.docFile) {
		upload.docFile.file(function(file) {
		    uploader.gotDoc(upload, file);
		}, function(e) { // upload.mediaFile.file(...
		    // if (e.code == FileError.NOT_FOUND_ERR) {
		    console.log("uploader.js: doc already deleted: "+upload.docFile.fullPath);
		    upload.docFile = null;
		    if (upload.mediaFile) {
			upload.mediaFile.file(function(file) {
			    uploader.gotMedia(upload, file);
			}, function(e) { // upload.mediaFile.file(...
			    console.log("uploader.js: Could read media "+upload.mediaFile.fullPath);
			    uploader.fileError(e);
			    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
			}); // upload.mediaFile.file(...)
		    } else { // no media
			upload.transcriptFile.file(function(file) {
			    uploader.gotTranscript(upload, file);
			}, function(e) { // upload.transcriptFile.file(...
			    console.log("uploader.js: Could read transcript "+upload.transcriptFile.fullPath);
			    uploader.fileError(e);
			    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
			}); // upload.transcriptFile.file(...)
		    }
		    // } else {
		    // 	console.log("uploader.js: Could not read doc "+upload.docFile.fullPath);
		    // 	uploader.fileError(e);
		    // 	uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		    // }
		}); // upload.mediaFile.file(...)
	    } else { // otherwise, gather up media
		if (upload.mediaFile) {
		    upload.mediaFile.file(function(file) {
			uploader.gotMedia(upload, file);
		    }, function(e) { // upload.mediaFile.file(...
			console.log("uploader.js: Could read media "+upload.mediaFile.fullPath);
			uploader.fileError(e);
			uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		    }); // upload.mediaFile.file(...)
		} else { // no media
		    upload.transcriptFile.file(function(file) {
			uploader.gotTranscript(upload, file);
		    }, function(e) { // upload.transcriptFile.file(...
			console.log("uploader.js: Could read transcript "+upload.transcriptFile.fullPath);
			uploader.fileError(e);
			uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		    }); // upload.transcriptFile.file(...)
		}
	    }

	    // create form data
	    /*
	    upload.transcriptFile.file(function(file) {
		uploader.gotTranscript(upload, file);
	    }, function(e) { // upload.transcriptFile.file(...
		console.log("uploader.js: Could read transcript "+upload.transcriptFile.fullPath);
		uploader.fileError(e);
		uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
	    }); // upload.transcriptFile.file(...)
	    */
	} else {
	    // no participantId means that we're not online yet, so wait until we are
	    console.log("uploader.js: Could not get participantId for " + upload.transcriptName + " - will retry...");
	    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
	}
    }, // gotParticipantId
    
    gotTranscript : function(upload, transcript) {
	var uploader = this;
	var transcriptReader = new FileReader();	    
	transcriptReader.onloadend = function(e) {
	    // insert participant ID after meta-data and before initial comment with prompt text
	    var aTranscript = [this.result.replace(/{/, upload.participantId + ": {")];	
	    upload.oTranscript = new Blob(aTranscript, {type : 'text/plain'});

	    // create form
	    upload.form = new FormData();
	    upload.form.append("content-type", "application/json");
	    upload.form.append("num_transcripts", "1");
	    upload.form.append("todo", "upload");
	    upload.form.append("auto", "true");
	    upload.form.append("transcript_type", upload.transcriptType);
	    upload.form.append("corpus", upload.corpus);
	    upload.form.append("family_name", upload.participantId + "-" + upload.series);
	    upload.form.append("uploadfile1_0", upload.oTranscript, upload.finalTranscriptName);
	    if (upload.mediaFile) {
		upload.form.append("uploadmedia1", upload.mediaData, upload.mediaName);
	    }
	    if (upload.docFile) {
		upload.form.append("doc", upload.docFileData, upload.docFile.name);
	    }
	    // create HTTP request
	    upload.request = new XMLHttpRequest();
	    // for knowing what status to update during events:
	    upload.request.transcriptName = upload.transcriptName;
	    upload.request.onload = function(e) {
		uploader.uploadSuccess(upload, e, this);
	    };
	    upload.request.onerror = uploader.uploadError;
	    upload.request.uploader = uploader;
	    upload.request.onsendstream = uploader.requestUploadProgress;	    
	    upload.percentComplete = 1;
	    upload.status = "uploading...";
	    uploader.uploadProgress("Uploading...");
	    uploader.uploading = true;
	    
	    upload.request.open('POST', uploader.settings.uploadUrl);
	    upload.request.setRequestHeader("Accept", "application/json");
	    if (uploader.httpAuthorization) {
		upload.request.setRequestHeader("Authorization", uploader.httpAuthorization);
	    }
	    upload.request.send(upload.form);			
	    console.log("uploader.js: post " + uploader.settings.uploadUrl);

	    /*
	    // gather up doc if there is one
	    if (upload.docFile) {
		upload.docFile.file(function(file) {
		    uploader.gotDoc(upload, file);
		}, function(e) { // upload.mediaFile.file(...
		    // if (e.code == FileError.NOT_FOUND_ERR) {
		    console.log("uploader.js: doc already deleted: "+upload.docFile.fullPath);
		    upload.docFile = null;
		    upload.mediaFile.file(function(file) {
			uploader.gotMedia(upload, file);
		    }, function(e) { // upload.mediaFile.file(...
			console.log("uploader.js: Could read media "+upload.mediaFile.fullPath);
			uploader.fileError(e);
			uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		    }); // upload.mediaFile.file(...)
		    // } else {
		    // 	console.log("uploader.js: Could not read doc "+upload.docFile.fullPath);
		    // 	uploader.fileError(e);
		    // 	uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		    // }
		}); // upload.mediaFile.file(...)
	    } else { // otherwise, gather up media
		upload.mediaFile.file(function(file) {
		    uploader.gotMedia(upload, file);
		}, function(e) { // upload.mediaFile.file(...
		    console.log("uploader.js: Could read media "+upload.mediaFile.fullPath);
		    uploader.fileError(e);
		    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		}); // upload.mediaFile.file(...)
	    }
	    */
	} // transcriptReader.onloadend
	transcriptReader.readAsText(transcript);
	
    },
    
    gotDoc : function(upload, doc) { // TODO load into a blob
	var uploader = this;
	var docReader = new FileReader();	    
	docReader.onloadend = function(e) {
	    var docBlob = new Blob([new Uint8Array(this.result)], { type: "application/pdf" });

	    upload.docFileData = docBlob;
	    if (upload.mediaFile) {
		// gather up media
		upload.mediaFile.file(function(file) {
		    uploader.gotMedia(upload, file);
		}, function(e) { // upload.mediaFile.file(...
		    console.log("uploader.js: Could read media "+upload.mediaFile.fullPath);
		    uploader.fileError(e);
		    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		}); // upload.mediaFile.file(...)
	    } else { // no media
		upload.transcriptFile.file(function(file) {
		    uploader.gotTranscript(upload, file);
		}, function(e) { // upload.transcriptFile.file(...
		    console.log("uploader.js: Could read transcript "+upload.transcriptFile.fullPath);
		    uploader.fileError(e);
		    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		}); // upload.transcriptFile.file(...)
	    }
	}; 
	docReader.readAsArrayBuffer(doc);
    },
    
    gotMedia : function(upload, media) {
	var uploader = this;
	
	var mediaReader = new FileReader();	    
	mediaReader.onloadend = function(e) {
	    var mediaBlob = new Blob([new Uint8Array(this.result)], { type: "audio/wav" });
	    upload.mediaData = mediaBlob;

	    upload.transcriptFile.file(function(file) {
		uploader.gotTranscript(upload, file);
	    }, function(e) { // upload.transcriptFile.file(...
		console.log("uploader.js: Could read transcript "+upload.transcriptFile.fullPath);
		uploader.fileError(e);
		uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
	    }); // upload.transcriptFile.file(...)

	    /*
	    // create form
	    upload.form = new FormData();
	    upload.form.append("num_transcripts", "1");
	    upload.form.append("todo", "upload");
	    upload.form.append("auto", "true");
	    upload.form.append("transcript_type", uploader.settings.transcriptType);
	    upload.form.append("corpus", uploader.settings.corpus);
	    upload.form.append("family_name", upload.participantId + "-" + upload.series);
	    upload.form.append("uploadfile1_0", upload.oTranscript, upload.finalTranscriptName);
	    upload.form.append("uploadmedia1", mediaBlob, upload.mediaName);
	    if (upload.docFile) {
		upload.form.append("doc", upload.docFileData, upload.docFile.name);
	    }
	    // create HTTP request
	    upload.request = new XMLHttpRequest();
	    // for knowing what status to update during events:
	    upload.request.transcriptName = upload.transcriptName;
	    upload.request.open('POST', uploader.settings.uploadUrl);
	    if (uploader.httpAuthorization) upload.request.setRequestHeader("Authorization", uploader.httpAuthorization);
	    upload.request.setRequestHeader("Accept", "application/json");
	    upload.request.onload = function(e) {
		uploader.uploadSuccess(upload, e, this);
	    };
	    upload.request.onerror = uploader.uploadError;
	    upload.request.onsendstream = uploader.requestUploadProgress;
	    
	    upload.percentComplete = 1;
	    upload.status = "uploading...";
	    uploader.uploadProgress("Uploading...");
	    
	    uploader.uploading = true;
	    upload.request.send(upload.form);			
	    console.log("uploader.js: post " + uploader.settings.uploadUrl);
	    */
	}; // mediaReader.onloadend
	mediaReader.readAsArrayBuffer(media);

    },
    
    uploadSuccess : function(upload, e, request) {
	this.uploading = false;
	var uploader = this;
	try {
	    var answer = JSON.parse(request.response);
	    if (answer.errors.length > 0) {
		console.log("uploader.js: Upload error " + upload.transcriptFile.fullPath);
		for (e in answer.errors) {
		    console.log("uploader.js: " + answer.errors[e]);
		}
	    } 
	    // verify the transcript is really in the database
	    var verifyRequest = new XMLHttpRequest();
	    verifyRequest.transcriptName = upload.transcriptName;
	    verifyRequest.onload = function(e) {
		try {
		    var verification = JSON.parse(this.response);
		    if (verification.model.ag_id) {	
			console.log("uploader.js: Verified: " + verification.model.ag_id);			
			uploader.uploadComplete(upload);
			// start next one, if any
			uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, 50);
		    } else {
			console.log("uploader.js: Verification failed");
			for (err in verification.errors) {
			    console.log("uploader.js: uploader.js: " + answer.errors[err]);
			}
			uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		    }
		} catch (x) {
		    console.log("uploader.js: Could not parse JSON for verification: " + x);
		    console.log(request.response);
		    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
		}
	    };
	    verifyRequest.onerror = uploader.uploadError;
	    verifyRequest.uploader = uploader;
	    upload.status = "verifying...";
	    uploader.uploadProgress("Verifying...");
	    verifyRequest.open('GET', uploader.settings.verifyUrl + "?transcript_id=" + upload.finalTranscriptName);
	    verifyRequest.setRequestHeader("Accept", "application/json");
	    if (uploader.httpAuthorization) {
		verifyRequest.setRequestHeader("Authorization", uploader.httpAuthorization);
	    }
	    verifyRequest.send();			
	    console.log("uploader.js: get " + uploader.settings.verifyUrl);		    
	} catch (x) {
	    console.log("uploader.js: Could not parse JSON: " + x);
	    console.log(request.response);
	    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
	}
    },
    
    uploadComplete : function(upload) {
	var uploader = this;
	upload.percentComplete = 100;
	upload.status = "complete";
	uploader.uploadProgress(upload.transcriptName + " complete");
	// remove it from the queue
	uploader.uploadQueue.pop();
	// and delete the files
	upload.transcriptFile.remove(function(e) {
	    console.log("uploader.js: Deleted " + upload.transcriptFile.fullPath);
	}, uploader.fileError);
	if (upload.mediaFile) {
	    upload.mediaFile.remove(function(e) {
		console.log("uploader.js: Deleted " + upload.mediaFile.fullPath);
	    }, uploader.fileError);
	}
	if (upload.docFile) {
	    upload.docFile.remove(function(e) {
		console.log("uploader.js: Deleted " + upload.docFile.fullPath);
	    }, uploader.fileError);
	}
	// unset possibly large objects to save memory
	upload.docFileData = null;
	upload.oTranscript = null;
	upload.form = null;
	upload.request = null;

	// mark the series as having one fewer files to upload
	console.log("series " + upload.series + " : " + uploader.finishedTasks[upload.series.name]);
	if (uploader.finishedTasks[upload.series]) {
	    uploader.finishedTasks[upload.series].toUpload--;
	}
    },
    uploadError : function(e) {
	var uploader = this.uploader;
	uploader.uploading = false;
	console.log("uploader.js: " + e);
	console.log("uploader.js: " + e.error);
	console.log("uploader.js: " + this.responseText);
	try {
	    var transcriptName = e.source.transcriptName;
	    uploader.uploads[transcriptName].status = "failed";
	    uploader.uploadProgress((e.error||"Could not upload.") + " Will try again...");
	} catch (x) {}
	uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency);
    },
    requestUploadProgress : function(e) {
	//console.log('uploader: progress...' + e.progress);
	var transcriptName = e.source.transcriptName;
	this.uploads[transcriptName].percentComplete = e.progress * 100;
	this.uploads[transcriptName].status = "uploading...";
	this.uploadProgress("Uploading " + transcriptName + "...");
    },

    doNextUpload : function() {
	var uploader = this;
	if (uploader.timeout) clearTimeout(uploader.timeout);
	uploader.timeout = null;
	if (uploader.uploadQueue.length > 0) {
	    var upload = uploader.uploadQueue[uploader.uploadQueue.length-1];
	    console.log("uploader.js: next in queue " + upload.transcriptName);
	    uploader.getParticipantId(upload); 
	} else {
	    // nothing in the queue, so wait a minute and try again
	    console.log("uploader.js: nothing in the queue - checking for files...");
	    uploader.uploadProgress();
	    uploader.scanForUploads();
//	    // set a timeout to check again - if scanForUploads() finds anything, it will replace this
//	    if (!uploader.timeout) {
//		uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency); 
//	    }
	}
    },

    // checks the filesystem for previously unseen transcripts
    scanForUploads : function() {
	var rootReader = this.fileSystem.root.createReader();
	var entries = [];
	var uploader = this;
	// keep reading directory entries until nothing more is returned
	var readRootEntries = function(results) {
	    rootReader.readEntries (function(results) {
		if (!results.length) {
		    uploader.scanRoot(entries.sort(function(a,b) {
			if (a.name < b.name) return -1;
			if (a.name > b.name) return 1;
			return 0;
		    }));
		} else {
		    entries = entries.concat(results);
		    readRootEntries();
		}
	    }, function(e) {
		console.log("uploader.js: Could not list root");
		uploader.fileError(e);
	    });
	};
	readRootEntries();
    },

    scanRoot : function(files) {
	var uploader = this;
	var promises = [];
	// each subdirectory is a series
	for (f in files) {
	    var file = files[f];	
	    if (file.isDirectory) { // series
		promises.push(this.checkDirectory(file));
	    } // series directory
	} // next file
	// once all directories are scanned...
	Promise.all(promises).then(function(values) {
	    if (uploader.uploadQueue.length > 0) {
		uploader.doNextUpload();
	    } else {
		// check again in a little while
		if (!uploader.timeout) {
		    uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, uploader.retryFrequency); 
		}
	    }

	});
    },

    checkDirectory : function(dir) {
		// check participant file exists
		var uploader = this;
		return new Promise(function(resolve,reject) {
			dir.getFile("participant.json", {create: false}, function(participantEntry) {
				// there is a participant.json
				var seriesReader = dir.createReader();
				var entries = [];
				// keep reading directory entries until nothing more is returned
				var readSeriesEntries = function(results) {
					seriesReader.readEntries (function(results) {
						if (!results.length) {
							uploader.scanSeries(dir, entries.sort(function(a,b) {
								if (a.name < b.name) return -1;
								if (a.name > b.name) return 1;
								return 0;
							}));
							resolve();
						} else {
							entries = entries.concat(results);
							readSeriesEntries();
						}
					}, function(e) {
						console.log("uploader.js: Could not list series " + dir.fullPath);
						uploader.fileError(e);
						resolve();
					});
				};
				readSeriesEntries();
				
			}, function(e) {
				console.log("uploader.js: skipping " + dir.fullPath + " - there's no participant file");
				resolve();
			}); // getFile
		});
    },

    scanSeries : function(seriesEntry, seriesFiles) {
		var doc = null;
		var uploader = this;
		// look for html or pdf files, which are consent forms
		for (t in seriesFiles) {
			var file = seriesFiles[t];
			if (file.name.match(/\.html$/) || file.name.match(/\.pdf$/)) {
				console.log("uploader.js: doc " + file.name);
				doc = file;
			}
		} // next file
		// look for txt files, which are transcripts
		var foundTranscripts = 0;
		for (t in seriesFiles) {
			var file = seriesFiles[t];
			if (file.name.match(/\.txt$/) && !uploader.uploads[file.name]) {
				foundTranscripts++;
				console.log("uploader.js: transcript " + file.name + " " + foundTranscripts);
				var upload = {
					transcriptName: file.name,
					transcriptFile: file,
					series: seriesEntry.name,
					seriesDirectory: seriesEntry,
					status: "waiting...",
					percentComplete: 0
				};
				if (doc) {
					upload.docFile = doc;
					doc = null;
				}
				uploader.uploads[file.name] = upload;
				uploader.uploadQueue.unshift(upload);
			} // previously unknown transcript
		} // next possible transcript
		
		// look for wav files
		for (t in seriesFiles) {
			var file = seriesFiles[t];
			if (file.name.match(/\.wav$/)) {
				console.log("uploader.js: media " + file.name);
				var transcriptName = file.name.replace(/wav$/,"txt");	    
				var upload = uploader.uploads[transcriptName];
				if (upload) {
					upload.mediaName = file.name;
					upload.mediaFile = file;
				}
			} // previously unknown transcript
		} // next possible wav

		// look for series.json, which tells us they've completed the task
		for (t in seriesFiles) {
			var sentinel = seriesFiles[t];
			if (sentinel.name.match(/series\.json$/)) {
				if (!uploader.finishedTasks[seriesEntry.name]) {
					console.log("uploader.js: finished task " + seriesEntry.name);
					sentinel.file(function(file) {
						var reader = new FileReader();	    
						reader.onloadend = function(e) {
							try {
								var series = JSON.parse(this.result);
								series.toUpload = foundTranscripts;
								uploader.finishedTasks[seriesEntry.name] = series;
								uploader.uploadProgress();
							} catch(x) {
								console.log("Error reading finished task " + seriesEntry.name + ": " + x);
								console.log(this.result);
							}
						};
						reader.readAsText(file);
					});
				} // we don't already have an entry for it
				break;
			} // series file
		} // next possible wav

		if (foundTranscripts == 0) {
			console.log("uploader.js: " + seriesEntry.fullPath + " has no transcripts: " + foundTranscripts);
		}
    },

    // callback for upload progress updates	
    uploadProgress : function(message) {
	if (this.progressCallback) {
	    this.progressCallback({
		uploads: this.uploads,
		finishedTasks: this.finishedTasks
	    }, message);
	}
    },
    
    // wake the uploader up if it's asleep
    prod : function() {
	if (!this.uploading) this.scanForUploads();
//	if (!this.uploading) {
//	    if (!uploader.timeout) {
//		uploader.timeout = setTimeout(function() { uploader.doNextUpload(); }, 2000); 
//	    }
//	}
    },
};
