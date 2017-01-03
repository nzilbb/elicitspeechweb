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

var uploads = {};
var uploadQueue = [];
var settings = null;
var retryFrequency = 30000;
var timeout = null;
var fileSystem = null;
var uploading = false;

function fileError(e) {
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
}

function getParticipantId(upload) {
    console.log("uploader.js: getParticipantId: " + upload.seriesDirectory.name);
    upload.seriesDirectory.getFile("participant.json", {}, function(fileEntry) {
	fileEntry.file(function(file) {
	    var reader = new FileReader();	    
	    reader.onloadend = function(e) {
		var participantAttributes = JSON.parse(this.result);
		if (participantAttributes.id && ""+participantAttributes.id != "undefined") {
		    // we already have an ID, so move to the next step
		    gotParticipantId(upload, participantAttributes);
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
					gotParticipantId(upload, participantAttributes);
				    };		    
				    fileWriter.onerror = function(e) {
					console.log("uploader.js: Write failed for "+fileEntry.fullPath);
					fileError(e);
					// try again later
					timeout = setTimeout(doNextUpload, retryFrequency);
				    };		    
				    var blob = new Blob([JSON.stringify(participantAttributes)], {type: 'application/json'});		    
				    fileWriter.write(blob);				
				}, function(e) {
				    console.log("uploader.js: Could not create writer for " + fileEntry.fullPath);
				    fileError(e);
				    // try again later
				    timeout = setTimeout(doNextUpload, retryFrequency);
				}); // createWriter
			    } else { // no ID was returned
				console.log("uploader.js: No ID was returned" + fileEntry.fullPath);
				console.log(this.responseText);
				// try again later
				timeout = setTimeout(doNextUpload, retryFrequency);
			    }
			} catch (x) {
		    	    console.log("uploader.js: invalid participant ID response "+x);
			    console.log(this.responseText);
			    // try again later
			    timeout = setTimeout(doNextUpload, retryFrequency);
			}
		    };
		    xhr.onerror = function(e) {
			console.log("Uploader: Could not generate participant ID: " + e);
			// try again later
			timeout = setTimeout(doNextUpload, retryFrequency);
		    };
		    console.log('uploader: requesting new participant ID: ' + settings.newParticipantUrl);
		    var query = "";
		    for (k in participantAttributes) {
			if (query) query += "&";
			query += k + "=" + participantAttributes[k];
		    }
		    xhr.open("GET", settings.newParticipantUrl+"?"+query);
		    xhr.send(participantAttributes);			
		} // try to generate an ID		
	    }	    
	    reader.readAsText(file);
	}, function(e) {
	    fileError(e);
	    // try again later
	    timeout = setTimeout(doNextUpload, retryFrequency);
	})
    }, function(e) { 
	console.log("uploader.js: Could get read file: " + e.toString());
	fileError(e);
	// try again later
	timeout = setTimeout(doNextUpload, retryFrequency);
    });
}
function gotParticipantId(upload, participantAttributes) {
    upload.participantId = participantAttributes.id;
    console.log("gotParticipantId " + participantAttributes.id);
    if (upload.participantId) {
	// upload files
	var series = upload.participantId + "-" + upload.seriesDirectory.name;
	upload.finalTranscriptName = upload.participantId + "-" + upload.transcriptName;
	console.log("uploader.js: transcript "+upload.finalTranscriptName);
			
	// create form data
	upload.transcriptFile.file(function(file) {
	    gotTranscript(upload, file);
	}, function(e) { // upload.transcriptFile.file(...
		console.log("uploader.js: Could read transcript "+upload.transcriptFile.fullPath);
		fileError(e);
		timeout = setTimeout(doNextUpload, retryFrequency);
	}); // upload.transcriptFile.file(...)
    } else {
	// no participantId means that we're not online yet, so wait until we are
	console.log("uploader.js: Could not get participantId for " + upload.transcriptName + " - will retry...");
	timeout = setTimeout(doNextUpload, retryFrequency);
    }
} // gotParticipantId
function gotTranscript(upload, transcript) {
    var transcriptReader = new FileReader();	    
    transcriptReader.onloadend = function(e) {
	// insert participant ID after meta-data and before initial comment with prompt text
	var aTranscript = [this.result.replace(/{/, upload.participantId + ": {")];	
	upload.oTranscript = new Blob(aTranscript, {type : 'text/plain'});

	// gather up doc if there is one
	if (upload.docFile) {
	    upload.docFile.file(function(file) {
		gotDoc(upload, file);
	    }, function(e) { // upload.mediaFile.file(...
		if (e.code == FileError.NOT_FOUND_ERR) {
		    console.log("uploader.js: doc already deleted: "+upload.docFile.fullPath);
		    upload.docFile = null;
		    upload.mediaFile.file(function(file) {
			gotMedia(upload, file);
		    }, function(e) { // upload.mediaFile.file(...
			console.log("uploader.js: Could read media "+upload.mediaFile.fullPath);
			fileError(e);
			timeout = setTimeout(doNextUpload, retryFrequency);
		    }); // upload.mediaFile.file(...)
		} else {
		    console.log("uploader.js: Could read doc "+upload.docFile.fullPath);
		    fileError(e);
		    timeout = setTimeout(doNextUpload, retryFrequency);
		}
	    }); // upload.mediaFile.file(...)
	} else { // otherwise, gather up media
	    upload.mediaFile.file(function(file) {
		gotMedia(upload, file);
	    }, function(e) { // upload.mediaFile.file(...
		console.log("uploader.js: Could read media "+upload.mediaFile.fullPath);
		fileError(e);
		timeout = setTimeout(doNextUpload, retryFrequency);
	    }); // upload.mediaFile.file(...)
	}
    } // transcriptReader.onloadend
    transcriptReader.readAsText(transcript);
}
function gotDoc(upload, doc) {
    upload.docFileData = doc;
    // gather up media
    upload.mediaFile.file(function(file) {
	gotMedia(upload, file);
    }, function(e) { // upload.mediaFile.file(...
	console.log("uploader.js: Could read media "+upload.mediaFile.fullPath);
	fileError(e);
	timeout = setTimeout(doNextUpload, retryFrequency);
    }); // upload.mediaFile.file(...)
}
function gotMedia(upload, media) {
    // create form
    upload.form = new FormData();
    upload.form.append("num_transcripts", "1");
    upload.form.append("todo", "upload");
    upload.form.append("auto", "true");
    upload.form.append("transcript_type", settings.transcriptType);
    upload.form.append("corpus", settings.corpus);
    upload.form.append("family_name", upload.participantId + "-" + upload.series);
    upload.form.append("uploadfile1_0", upload.oTranscript, upload.finalTranscriptName);
    upload.form.append("uploadmedia1", media, upload.mediaName);
    if (upload.docFile) {
	upload.form.append("doc", upload.docFileData, upload.docFile.name);
    }
    // create HTTP request
    upload.request = new XMLHttpRequest();
    // for knowing what status to update during events:
    upload.request.transcriptName = upload.transcriptName;
    upload.request.open('POST', settings.uploadUrl);
    upload.request.setRequestHeader("Accept", "application/json");
    upload.request.onload = function(e) {
	uploadSuccess(upload, e, this);
    };
    upload.request.onerror = uploadError;
    upload.request.onsendstream = uploadProgress;
    
    upload.percentComplete = 1;
    upload.status = "uploading...";
    uploadProgress(uploads, "Uploading...");
    
    upload.request.send(upload.form);			
    console.log("uploader.js: post " + settings.uploadUrl);
}
function uploadSuccess(upload, e, request) {
    var answer = JSON.parse(request.response);
    if (answer.errors.length > 0) {
	console.log("uploader.js: Upload failed " + upload.transcriptFile.fullPath);
	var alreadyUploaded = false;
	for (e in answer.errors) {
	    console.log("uploader.js: " + answer.errors[e]);
	    if (/already exists/.test(answer.errors[e])) {
		alreadyUploaded = true;
	    }
	}
	if (alreadyUploaded) {
	    uploadComplete(upload);
	    // start next one, if any
	    timeout = setTimeout(doNextUpload, 50);
	} else { // try again in a while
	    timeout = setTimeout(doNextUpload, retryFrequency);
	}
    } else {
	uploadComplete(upload);
	// start next one, if any
	timeout = setTimeout(doNextUpload, 50);
    } // success			    
}
function uploadComplete(upload) {
    upload.percentComplete = 100;
    upload.status = "complete";
    uploadProgress(uploads, upload.transcriptName + " complete");
    // remove it from the queue
    uploadQueue.pop();
    // and delete the files
    upload.transcriptFile.remove(function(e) {
	console.log("uploader.js: Deleted " + upload.transcriptFile.fullPath);
    }, fileError);
    upload.mediaFile.remove(function(e) {
	console.log("uploader.js: Deleted " + upload.mediaFile.fullPath);
    }, fileError);
    if (upload.docFile) {
	upload.docFile.remove(function(e) {
	    console.log("uploader.js: Deleted " + upload.docFile.fullPath);
	}, fileError);
    }
    // unset possibly large objects to save memory
    upload.docFileData = null;
    upload.oTranscript = null;
    upload.form = null;
    upload.request = null;
}
function uploadError(e) {
    console.log("uploader.js: " + e.error);
    console.log("uploader.js: " + this.responseText);
    var transcriptName = e.source.transcriptName;
    uploads[transcriptName].status = "failed";
    uploadProgress(uploads, (e.error||"Could not upload.") + " Will try again...");
    timeout = setTimeout(doNextUpload, retryFrequency);
}
function uploadProgress(e) {
    //console.log('uploader: progress...' + e.progress);
    var transcriptName = e.source.transcriptName;
    uploads[transcriptName].percentComplete = e.progress * 100;
    uploads[transcriptName].status = "uploading...";
    uploadProgress(uploads, "Uploading " + transcriptName + "...");
}

function doNextUpload() {
    if (timeout) clearTimeout(timeout);
    timeout = null;    
    if (uploadQueue.length > 0) {
	var upload = uploadQueue[uploadQueue.length-1];
	console.log("uploader.js: next in queue " + upload.transcriptName);
	if (upload.mediaFile) {
	    getParticipantId(upload); 
	} else {
	    console.log("uploader.js: " + upload.transcriptName + " has no media and will be ignored");
	    // remove it from the queue
	    uploadQueue.pop();
	    doNextUpload();
	}
    } else {
	// nothing in the queue, so wait a minute and try again
	console.log("uploader.js: nothing in the queue - checking for files...");
	scanForUploads();
	// set a timeout to check again - if scanForUploads() finds anything, it will replace this
	if (!timeout) {
	    timeout = setTimeout(doNextUpload, retryFrequency); 
	}
    }
}

// checks the filesystem for previously unseen transcripts
function scanForUploads() {
    var rootReader = fileSystem.root.createReader();
    var entries = [];
    // keep reading directory entries until nothing more is returned
    var readRootEntries = function(results) {
	rootReader.readEntries (function(results) {
	    if (!results.length) {
		scanRoot(entries.sort(function(a,b) {
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
	    fileError(e);
	});
    };
    readRootEntries();
}

function scanRoot(files) {
    // each subdirectory is a series
    for (f in files) {
	var file = files[f];	
	if (file.isDirectory) { // series
	    checkDirectory(file);
	} // series directory
    } // next file
}

function checkDirectory(dir) {
    // check participant file exists
    dir.getFile("participant.json", {create: false}, function(participantEntry) {
	// there is a participant.json
	var seriesReader = dir.createReader();
	var entries = [];
	// keep reading directory entries until nothing more is returned
	var readSeriesEntries = function(results) {
	    seriesReader.readEntries (function(results) {
		if (!results.length) {
		    scanSeries(dir, entries.sort(function(a,b) {
			if (a.name < b.name) return -1;
			if (a.name > b.name) return 1;
			return 0;
		    }));
		} else {
		    entries = entries.concat(results);
		    readSeriesEntries();
		}
	    }, function(e) {
		console.log("uploader.js: Could not list series " + dir.fullPath);
		fileError(e);
	    });
	};
	readSeriesEntries();
	
    }, function(e) {
	console.log("uploader.js: skipping " + dir.fullPath + " - there's no participant file");
	// delete it if it's old
	dir.getMetadata(function(m) {
	    var tooOld = new Date();
	    tooOld.setDate(tooOld.getDate()-0.125);
	    if (m.modificationTime < tooOld) {
		// older than half a day, so delete it
		dir.removeRecursively(function(e) {
		    console.log("uploader.js: " + dir.fullPath + " removed");
		}, function(e) {
		    console.log("uploader.js: Could not remove" + dir.fullPath);
		    fileError(e);
		});
	    }
	}, function(e) {
	    fileError(e);
	});
    }); // getFile
}

function scanSeries(seriesEntry, seriesFiles) {
    var doc = null;
    // look for html or pdf files, which are consent forms
    for (t in seriesFiles) {
	var file = seriesFiles[t];
	if (file.name.match(/\.html$/) || file.name.match(/\.pdf$/)) {
	    console.log("uploader.js: doc " + file.name);
	    doc = file;
	}
    } // next file
    // look for txt files, which are transcripts
    var foundTranscripts = false;
    for (t in seriesFiles) {
	var file = seriesFiles[t];
	if (file.name.match(/\.txt$/) && !uploads[file.name]) {
	    console.log("uploader.js: transcript " + file.name);
	    foundTranscripts = true;
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
	    uploads[file.name] = upload;
	    uploadQueue.unshift(upload);
	} // previously unknown transcript
    } // next possible transcript

    // look for wav files
    for (t in seriesFiles) {
	var file = seriesFiles[t];
	if (file.name.match(/\.wav$/)) {
	    console.log("uploader.js: media " + file.name);
	    var transcriptName = file.name.replace(/wav$/,"txt");	    
	    var upload = uploads[transcriptName];
	    if (upload) {
		upload.mediaName = file.name;
		upload.mediaFile = file;
	    }
	} // previously unknown transcript
    } // next possible transcript

    if (!foundTranscripts) {
	//console.log("uploader.js: " + seriesEntry.fullPath + " has no transcripts");
	// delete it if it's old (not if it's new - they might be still recording)
	seriesEntry.getMetadata(function(m) {
	    var tooOld = new Date();
	    tooOld.setDate(tooOld.getDate()-0.125);
	    if (m.modificationTime < tooOld) {
		// older than half a day, so delete it
		seriesEntry.removeRecursively(function(e) {
		    console.log("uploader.js: " + seriesEntry.fullPath + " removed");
		}, function(e) {
		    console.log("uploader.js: Could not remove" + seriesEntry.fullPath);
		    fileError(e);
		});
	    }
	}, function(e) {
	    fileError(e);
	});
    }
}

// callback for upload progress updates	
function uploadProgress(uploads, message) {
    var uploadsCopy = {};
    for (var transcriptName in uploads) {
	upload = uploads[transcriptName];
	// copy only the necessary cloneable fields
	uploadsCopy[transcriptName] = {
	    series: upload.series,
	    transcriptName: upload.transcriptName,
	    percentComplete: upload.percentComplete,
	    status: upload.status
	};
    }
    postMessage({
	message: "progress",
	uploads: uploadsCopy,
	text: message
    });
}

// wake the uploader up if it's asleep
function prod() {
    scanForUploads();
};

// initialise the uploader
function initialise(settingsFromInitialiser) {
    settings = settingsFromInitialiser;
    console.log("uploader.js initialising");
/* TODO something like this for app:
	Ti.Network.addEventListener('change', function(e) {
  		if (e.online) {
  			// wake the uploader up again as soon as we come online
  			exports.prod();
  		}
	});
*/
    self.requestFileSystem  = self.requestFileSystem || self.webkitRequestFileSystem;
//    window.webkitStorageInfo.requestQuota(PERSISTENT, 100*1024*1024, function(grantedBytes) {
//	console.log("uploader.js: Granted " + grantedBytes + " bytes storage");
	self.requestFileSystem(PERSISTENT, 100*1024*1024, function(fs) {
	    fileSystem = fs;
	    // start uploads
	    doNextUpload();
	}, fileError);
//    }, fileError);
};

this.onmessage = function (event) {
    switch (event.data.message) {
    case "initialise": 
	initialise(event.data.settings, event.data.workingDirectory);
	break;
    case "prod":
	prod();
	break;		
    }
};
