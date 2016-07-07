/* Copyright 2013 Chris Wilson

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS1" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/

/*
  Modified by robert.fromont@canterbury.ac.nz 2015-01
*/

var manifest = chrome.runtime.getManifest();

var url = manifest.url;
var task = manifest.task;

var audioContext = null;
var audioInput = null;
var realAudioInput = null;
var inputPoint = null;
var audioRecorder = null;
var audioStream = null;
var settings = null;
var series = null;
var seriesDir = null;
var participantAttributes = null;
    
var recIndex = 0;
var transcriptIndexLength = 0;
var wav;
var uploading = false;

var countdownCanvas = null;
var countdownContext = null;
var countdownTimer = null;
var countdownStart = null;
var countdownEnd = null;
var countdownCall = null;
var countdownReverse = false;
var mono = true;
var sampleRate = 16000;

var consent = null;
var consentPdf = null;
var signatureDiv = null;
var signature = null;
var consentShown = false;
var consentSent = false;
var participantFormControls = {};

var iCurrentStep = -1;

var uploader = null;

var steps = [{
    title: "Elicit Speech",
    prompt: "Configuration not loaded. Please connect to the internet and try again.",
    transcript: ""
}];

alert = function(message) {
    chrome.app.window.create('alert.html', {
    'outerBounds': {
      'width': 400,
      'height': 150
    }
  }, function(createdWindow) {
      console.log("Alert: " + message);
      createdWindow.contentWindow.message = message;
  });

}

var fileSystem = null;
function loadFileSystem() {
    window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
    window.webkitStorageInfo.requestQuota(PERSISTENT, 100*1024*1024, function(grantedBytes) {
	console.log("Granted " + grantedBytes + " bytes storage");
	window.requestFileSystem(window.PERSISTENT, grantedBytes, loadPrompts, fileError);
    }, fileError);
}

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
    console.log(message);
}
function loadPrompts(fs) {
    console.log("Got file system: " + fs.name);
    fileSystem = fs;
    $.getJSON(url + "?task="+task+"&d=" + new Date(), function(data) {
	if (data.errors.length) {
	    for (e in data.errors) {
		console.log("task failed to load: " + data.errors[e]);
	    }
	    // TODO something on the UI
	} else {
	    console.log("settings downloaded");
	    fileSystem.root.getFile("settings.json", {create: true}, function(fileEntry) {
		fileEntry.createWriter(function(fileWriter) {		    
		    fileWriter.onwriteend = function(e) {
			if (fileWriter.length === 0) {
			    // now write the content
			    var blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
			    console.log("Writing settings file");
			    fileWriter.write(blob);
			} else { // actual content has been written
			    loadSettings();
			}
		    };
		    fileWriter.onerror = function(e) {
			console.log("Write failed");
			    fileError(e);
			loadSettings();
		    };		    
		    // clear the file first
		    fileWriter.truncate(0); 
		}, function(e) {
		    console.log("Could not create writer");
		    fileError(e);
		    loadSettings();
		}); // createWriter
	    }, function(e) {
		console.log("Could not get file: " + e.toString());
		fileError(e);
		loadSettings();
	    }); // getFile
	} // request success
    }).fail(function(jqxhr, textStatus, error) {
	console.log("request failed: " + textStatus + " " + error);
	console.log(jqxhr.responseText);
	loadSettings();
    });
}

function loadSettings() {
    console.log("loadSettings");
    
    fileSystem.root.getFile("settings.json", {}, function(fileEntry) {
	fileEntry.file(function(file) {
	    var reader = new FileReader();	    
	    reader.onloadend = function(e) {
		console.log("settings read.");
		try {
		    promptsLoaded(JSON.parse(this.result));
		} catch(e) {
		    console.log("Error " + e);
		    console.log(this.result);
		}
	    }	    
	    reader.readAsText(file);
	}, fileError)
    }, function(e) { 
	console.log("Could get read file: " + e.toString());
    });
}

function promptsLoaded(data) 
{ 
    settings = data.model;

    // start the uploader
    if (!uploader) {
	uploader = new Worker("uploader.js?" + new Date());
	uploader.onmessage = function(event) {
	    if (event.data.message == "progress") {
		var progress = event.data;
		uploadsProgress(event.data.uploads, progress.text);
	    }
	}
	uploader.postMessage({
	    message: "initialise",
	    settings: settings
	});
    }
    
    // download images/videos, if possible
    for (s in data.model.steps) {
	var step = data.model.steps[s];
	if (step.image) {
	    var c = new XMLHttpRequest();
	    c.imageName = step.image;
	    c.responseType = "blob";
	    console.log("downloading: " + data.model.imageBaseUrl + step.image);
	    c.onload = function() {
		var req = this;
		if (req.status == 200 ) {
		    fileSystem.root.getFile(req.imageName, {create: true}, function(fileEntry) {
			fileEntry.createWriter(function(fileWriter) {		    
			    fileWriter.onwriteend = function(e) {
				if (fileWriter.length === 0) {
				    // now write the content
				    fileWriter.write(req.response);
				} else {
				    console.log(req.imageName + ' completed.');
				}
			    };		    
			    fileWriter.onerror = function(e) {
				console.log(req.imageName + ' failed: ' + e.toString());
			    };
		    
			    console.log('Saving ' + req.imageName);
			    // clear the file first
			    fileWriter.truncate(0);
			}, function(e) {
			    console.log("Could not create writer for " + c.imageName);
			    fileError(e);
			}); // createWriter
		    }, function(e) {
			console.log("Could not get "+req.imageName+": " + e.toString());
			fileError(e);
		    }); // getFile
		} else {
		    console.log("ERROR downloading "+req.imageName+": " + c.status);
		}
	    };
	    c.error = function(e) { 
		console.log("ERROR downloading "+c.imageName+": " + e.error);
	    };
	    c.open('GET', data.model.imageBaseUrl + step.image, true);
            c.send();
	} // step has an image/video
    } // next step

    // create instance of steps for this time round
    steps = createStepsInstanceFromDefinition(data.model.steps, data.model.groups); 

    startSession();
}

// creates task steps to use, based on the defined steps, and the defined groups, 
// which may specify that steps are randomly ordered and/or only a subset are used
function createStepsInstanceFromDefinition(steps, groups) {
    var stepsInstance = [];
    var currentGroupId = -1;
    var groupSteps = [];
    for (var s in steps) {
	var step = steps[s];
	// is it a new group?
	if (step.group_id != currentGroupId) {
	    if (groupSteps.length > 0) { // finish last group
		stepsInstance = stepsInstance.concat(prepareStepsGroup(groupSteps, groups[currentGroupId]));
	    }
	    // start new group
	    currentGroupId = step.group_id;
	    groupSteps = [];
	} // change in group
	groupSteps.push(step);
    } // next step
    // finish last group
    if (groupSteps.length > 0) { // finish last group
	stepsInstance = stepsInstance.concat(prepareStepsGroup(groupSteps, groups[currentGroupId]));
    }
    return stepsInstance;
}

// creates steps to use for a particular group, based on the defined group steps, 
// and the group definition, which may specify that steps are randomly ordered
// and/or only a subset are used
function prepareStepsGroup(steps, group) {
    // random order?
    if (/.*random.*/.test(group.sample)) {
	steps = shuffle(steps);
    }

    // sample only?
    if (/.*sample.*/.test(group.sample) && group.step_count > 0) {
	// use the first step_count elements
	steps = steps.slice(0, group.step_count);
    }
    return steps;
}

// Fisher-Yates (aka Knuth) array shuffling
// thanks to http://www.itsmycodeblog.com/shuffling-a-javascript-array/
function shuffle(array) {
  var currentIndex = array.length, temporaryValue, randomIndex ;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}

function startSession() {

    // set up UI
    document.getElementById("overallProgress").max = steps.length;
    document.getElementById("overallProgress").value = 0;
    if (settings) {
	document.getElementById("overallProgress").title = noTags(settings.resources.overallProgress);
	document.getElementById("nextButton").title = noTags(settings.resources.next);
	$("#nextLabel").html(noTags(settings.resources.next));
	document.getElementById("recording").title = noTags(settings.resources.recording);
	// activate next button
	document.getElementById("nextButton").onclick = clickNext;
	document.getElementById("nextButton").style.display = "";
    }

    clearPrompts();
    $("#prompt").html("");
    
    // determine the amount of zero-padding we will need
    var numRecordings = 0;
    for (step in steps)
    {
	if (steps[step].record) numRecordings++;
    }
    transcriptIndexLength = String(numRecordings).length;
    
    // ensure any previous participants are forgotten
    var now = new Date();
    series = now.toISOString().substring(0,16).replace(/[-:]/g,"").replace("T","-");
    // create a directory named after the series - this will be where all series-related files are kept until they're uploaded
    fileSystem.root.getDirectory(series, {create: true}, function(dirEntry) {
	seriesDir = dirEntry;
    }, function (e) {
	console.log("Could not create directory for series: " + series);
	seriesDir = null;
	fileError(e);
    });
    participantAttributes = null;
    recIndex = 0;
    consentShown = false;
    signatureDiv = null;
    signature = null;
    consent = null;
    consentPdf = null;
    consentShown = false;
    consentSent = false;
    participantFormControls = {};
    iCurrentStep = -1;
    console.log("startSession");

    //clearPrompts();
    document.getElementById("nextButton").style.opacity = "1";
    
    // start user interface...
    showPreamble();
}

function showPreamble() {
    $("#prompt").html("");
    document.getElementById("blurb").style.display = "";
    if (settings.preamble) {
	$("#blurb").html(settings.preamble);
    } else {
	showConsent();
    }
}

function showConsent() {
    if (!signature) {
	// create signature box
	signature = document.createElement("input");
	signature.type = "text";
	signature.placeholder = noTags(settings.resources.pleaseEnterYourNameHere);
	signature.title = noTags(settings.resources.pleaseEnterYourNameHere);
	signature.className = "signature";
    }
    
    if (settings.consent) {
	// show consent text
	$("#blurb").html(settings.consent);
	// add a box for them to enter their 'signature'
	signatureDiv = document.createElement("div");
	signatureDiv.className = "signatureContainer";
	signatureDiv.appendChild(signature);
	document.getElementById("blurb").appendChild(signatureDiv);
    }
    else {
	consent = " ";
	signature.value = " ";
	testForAudio();
    }
}

function testForAudio() {
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!window.AudioContext) {
	$("#prompt").html(settings.resources.webAudioNotSupported);
    } else {
	initAudio();
    }
}

function initAudio() {
    console.log("initAudio");
    audioContext = new window.AudioContext();
    $("#prompt").html(settings.resources.pleaseEnableMicrophone);
    if (!navigator.getUserMedia)
        navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (!navigator.cancelAnimationFrame)
        navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
    if (!navigator.requestAnimationFrame)
        navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;
    
    if (!navigator.getUserMedia) 
    {
	$("#prompt").html(settings.resources.webAudioNotSupported);
	return;
    }
    
    navigator.getUserMedia(
        {
	    "audio": {
                "mandatory": {
		    "googEchoCancellation": "false",
		    "googAutoGainControl": "false",
		    "googNoiseSuppression": "false",
		    "googHighpassFilter": "false"
                },
                "optional": []
	    },
        }, gotStream, function(e) {
	    $("#prompt").html(settings.resources.getUserMediaFailed + "<p>" + e + "</p>");
	    console.log(e);
        });
}

function createParticipantForm() {
    // if we're showing participant form, we're not showing uploader messages
    $("#uploadermessage").html(""); 
    document.getElementById("overallProgress").max = steps.length;    
    document.getElementById("overallProgress").value = 0;

    $("#stepTitle").html("");
    $("#fields").html("");
    document.getElementById("fields").style.display = "";
    $("#prompt").html(settings.resources.participantInfoPrompt);
    var form = document.getElementById("fields");
    for (f in settings.participantFields)
    {
	var field = settings.participantFields[f];

	var fieldDiv = document.createElement("div");
	fieldDiv.className = "form_field";

	var label = document.createElement("div");
	label.className = "form_label";
	label.title = field.description;
	label.appendChild(document.createTextNode(field.label));
	fieldDiv.appendChild(label);
	
	var input;
	if (field.type == "select")
	{
	    input = document.createElement("select");
	    for (o in field.options)
	    {
		var option = field.options[o];
		var selectOption = document.createElement("option");
		selectOption.value = option.value;
		selectOption.appendChild(document.createTextNode(option.description));
		input.appendChild(selectOption);
	    }
	}
	else
	{
	    input = document.createElement("input");
	    if (field.type == "integer" || field.type == "number")
	    {
		input.size = 4;
		input.type = "number";
	    }
	    else if (field.type == "date")
	    {
		input.type = "date";
	    }
	    else if (field.type == "time")
	    {
		input.type = "time";
	    }
	    else if (field.type == "datetime")
	    {
		input.type = "datetime";
	    }
	    else if (field.type == "boolean")
	    {
		input.type = "checkbox";
	    }
	    else
	    {
		input.type = "text";
	    }
	    input.placeholder = field.description;
	}
	input.className = "form_value";
	input.title = field.description;
	fieldDiv.appendChild(input);
	field.input = input;

	form.appendChild(fieldDiv);
    }
}

function newParticipant()
{
    console.log("newParticipant ");
    var provisionalAttributes = {};
    for (f in settings.participantFields)
    {
	var field = settings.participantFields[f];
	var input = field.input;
	var name = field.attribute;
	var value;
	if (field.type == "select")
	{
	    value = input.options[input.selectedIndex].value;
	}
	else if (field.type == "boolean")
	{
	    value = input.checked?"1":"0";
	}
	else
	{
	    value = input.value;
	}
	if (value) provisionalAttributes[field.attribute] = value;
    } // next field
    participantAttributes = provisionalAttributes;
    participantAttributes["newSpeakerName"] = settings.task_name+"-{0}";
    participantAttributes["content-type"] = "application/json";

    // save the attributes to a file
    seriesDir.getFile("participant.json", {create: true}, function(fileEntry) {
	fileEntry.createWriter(function(fileWriter) {		    
	    fileWriter.onwriteend = function(e) {
		console.log('Wrote ' + fileEntry.fullPath + ' without ID');
		getNewParticipantId(participantAttributes);
	    };		    
	    fileWriter.onerror = function(e) {
		console.log('Write failed for '+fileEntry.fullPath+': ' + e.toString());
		fileError(e);
	    };		    
	    var blob = new Blob([JSON.stringify(participantAttributes)], {type: 'application/json'});		    
	    fileWriter.write(blob);
	}, function(e) {
	    console.log("Could not create writer for " + fileEntry.fullPath);
	    fileError(e);
	}); // createWriter
    }, function(e) {
	console.log("Could not get participant file for series " + series);
	fileError(e);
    }); // getFile    
}

function getNewParticipantId(participantAttributes) {
    var query = "";
    for (k in participantAttributes) {
	if (query) query += "&";
	query += k + "=" + participantAttributes[k];
    }
    $.getJSON( settings.newParticipantUrl + "?" + query, function(data) { 
	participantAttributes.id = data.model.name;
	console.log("Participant ID: " + participantAttributes.id);
	seriesDir.getFile("participant.json", {create: true}, function(fileEntry) {
	    fileEntry.createWriter(function(fileWriter) {		    
		fileWriter.onwriteend = function(e) {
		    console.log('Wrote ' + fileEntry.fullPath + ' with ID');
		};		    
		fileWriter.onerror = function(e) {
		    console.log('Write failed for '+fileEntry.fullPath+': ' + e.toString());
		    fileError(e);
		};		    
		var blob = new Blob([JSON.stringify(participantAttributes)], {type: 'application/json'});		    
			   fileWriter.write(blob);
	    }, function(e) {
		console.log("Could not create writer for " + fileEntry.fullPath);
		fileError(e);
	    }); // createWriter
	}, function(e) {
	    console.log("Could not get participant file for series " + series);
	    fileError(e);
	}); // getFile    
    }).fail(function(e) {
	console.log("Could not get participant ID right now.");
    });
}

function nextPhrase() {
    iCurrentStep++
    console.log("step " + iCurrentStep + " of " + steps.length);
    document.getElementById("overallProgress").value++;
    if (steps.length > iCurrentStep) {
	if (steps.length - 1 > iCurrentStep) { // not the last step
	    if (steps[iCurrentStep].record
		&& (!steps[iCurrentStep].image 
		    || !steps[iCurrentStep].image.endsWith(".mp4"))) { // not video
		startRecording();
	    }
	    if (steps[iCurrentStep].countdown_seconds > 0) {
		clearPrompts();
		document.getElementById("nextButton").style.opacity = "0.25";
		startTimer(steps[iCurrentStep].countdown_seconds, showCurrentPhrase);
	    }
	    else {
		showCurrentPhrase();
	    }
	}
	else { // the last step
	    showCurrentPhrase();
	    finished();
	}
    }
    else {
	finished();
    }
}

function clearPrompts() {
    $("#stepTitle").html("");
    $("#prompt").html(settings.resources.countdownMessage);
    $("#transcript").html("");
}
function showCurrentPhrase() {
    if (!steps[iCurrentStep]) return;
    console.log("show current phrase: " + iCurrentStep + " " + steps[iCurrentStep].title);
    $("#stepTitle").html(steps[iCurrentStep].title.trim()?
			 steps[iCurrentStep].title
			 :"");
    $("#prompt").html(steps[iCurrentStep].prompt.trim()?
		      steps[iCurrentStep].prompt
		      :"");
    $("#transcript").html(steps[iCurrentStep].transcript.trim()?
			  "<p>"+steps[iCurrentStep].transcript.replace(/\n/g,"<br>")+"</p>"
			  :"");
    if (steps[iCurrentStep].image) {	    
	var image = document.createElement(steps[iCurrentStep].image.endsWith(".mp4")?"video":"img");
	if (steps[iCurrentStep].image.endsWith(".mp4")) {
	    console.log("video: " + steps[iCurrentStep].image);
	    image.autoplay = "autoplay";
	    // disable next button
	    document.getElementById("nextButton").style.opacity = "0.25";
	    image.addEventListener("ended", function(e) {
		// start recording, if appropriate, and enable 'next'
		startRecording();				
		if (steps[iCurrentStep] && steps[iCurrentStep].record) {
		    // reveal that we're recording
		    document.getElementById("recording").className = "active";    
		    // and ensure they don't go over the max time
		    startTimer(steps[iCurrentStep].max_seconds, stopRecording);
		}
	    },false);
	}
	fileSystem.root.getFile(steps[iCurrentStep].image, {}, function(fileEntry) {
	    fileEntry.file(function(file) {
		var reader = new FileReader();	    
		reader.onloadend = function(e) {
		    image.src = this.result;
		}	    
		reader.readAsDataURL(file);
	    }, fileError)
	}, function(e) { 
	    console.log("Could get read "+steps[iCurrentStep].image+": " + e.toString());
	});
	
	document.getElementById("transcript").appendChild(image);
    }

    if (steps[iCurrentStep].record
	&& (!steps[iCurrentStep].image 
	    || !steps[iCurrentStep].image.endsWith(".mp4"))) { // not video, starts recording when finished
	// reveal that we're recording
	document.getElementById("recording").className = "active";    
	// and ensure they don't go over the max time
	startTimer(steps[iCurrentStep].max_seconds, stopRecording);
    }
    if (!steps[iCurrentStep].image 
	|| !steps[iCurrentStep].image.endsWith(".mp4")) { // not video, which enables when finished
	document.getElementById("nextButton").style.opacity = "1";
    }
}

function finished() {
    if (countdownContext) {
	countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height)
    }

    stopRecording();
    document.getElementById("nextButton").style.opacity = "0";
    if (audioStream) {
	if (audioStream.stop) audioStream.stop();    
	if (audioStream.getTracks) {
	    var tracks = audioStream.getTracks();
	    for (var t in tracks) {
		tracks[t].stop();
	    }
	}
    }
    audioContext = null;
    audioInput = null;
    realAudioInput = null;
    inputPoint = null;
    audioRecorder = null;
    audioStream = null;

    if (participantAttributes.id) {
	$("#prompt").html("<p>"+steps[iCurrentStep-1].prompt.replace(/\n/g,"<br>")+"</p>"
			  + settings.resources.yourParticipantIdIs
			  + "<p id='participantId'>"+participantAttributes.id+"</p>");
    }
    document.getElementById("nextButton").style.opacity = "1";
    $("#nextLabel").html(noTags(settings.resources.startAgain));
    document.getElementById("nextButton").title = noTags(settings.resources.startAgain);
	
}

function startTimer(durationSeconds, whatToDo, reverse) {
    killTimer();
    countdownCall = whatToDo;
    countdownStart = new Date().getTime();
    countdownEnd = countdownStart + 1000 * durationSeconds;
    countdownTimer = window.setInterval(timerTick, 50);
    countdownReverse = reverse;
}

function killTimer() {
    if (countdownTimer) window.clearInterval(countdownTimer);
    countdownTimer = null;
    countdownStart = null;
    countdownEnd = null;
    if (countdownContext) {
	countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height)
    }
}

function timerTick() {
    var now = new Date().getTime();

    // paint timer
    var totalDuration = countdownEnd - countdownStart;
    var soFar = (now - countdownStart) / totalDuration;
    if (soFar > 0.75 && document.getElementById("recording").className == "active") {
	// blink the recording icon
	document.getElementById("recording").className = "blinking";    
    }
    if (countdownReverse) soFar = (countdownEnd - now) / totalDuration;
    var soFarRadians = soFar * 2*Math.PI;
    // we start at 1.5 pi radians, so we add that to the end angle
    soFarRadians += 1.5*Math.PI
    if (soFarRadians > 2*Math.PI) soFarRadians -= 2*Math.PI;
    countdownCanvas = document.getElementById("countdown");
    countdownContext = countdownCanvas.getContext("2d");
    countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height)
    countdownContext.beginPath();
    countdownContext.lineWidth = 4;
    countdownContext.lineCap = "butt";
    var gradient=countdownContext.createLinearGradient(0,0,countdownCanvas.width,countdownCanvas.height);
    gradient.addColorStop("0","#FAB5B5");
    gradient.addColorStop("0.5","#EC2525");
    countdownContext.strokeStyle = gradient;
    var startRadians = 1.5*Math.PI;
    var endRadians = soFarRadians;
    countdownContext.arc(countdownCanvas.width/2, countdownCanvas.height/2, countdownCanvas.width/2 - countdownContext.lineWidth - 1, startRadians, endRadians);
    countdownContext.stroke();

    if (document.getElementById("recording").className != "active") {
	// recording icon not visible
	// display the number of seconds remaining
	countdownContext.font = "bold "+countdownCanvas.width/2+"px Arial";
	countdownContext.fillStyle = "#EC2525";
	var secondsLeft = ""+(Math.floor((countdownEnd - now) / 1000) + 1);
	var metrics = countdownContext.measureText(secondsLeft);
	countdownContext.fillText(secondsLeft, (countdownCanvas.width - metrics.width)/2, countdownCanvas.width*2/3);
    }

    // have we finished?
    if (now >= countdownEnd) {
	killTimer();
	countdownCall();
    }
}

var lastUploaderStatus = "";
// progress of all uploads
function uploadsProgress(uploads, message) {
    var transcriptCount = 0;
    var percentComplete = 0;
    var currentFile = null;
    for (transcriptName in uploads) {
	transcriptCount++;
	percentComplete += uploads[transcriptName].percentComplete; 
	if (uploads[transcriptName].status == "uploading...") {
	    currentFile = transcriptName;
	}
    } // next upload
    if (transcriptCount > 0) {
	lastUploaderStatus = message || noTags(settings.resources.uploadingPleaseWait);
	lastUploaderStatus += " " + Math.floor(percentComplete / transcriptCount) + "%";
	if (currentFile) {
	    lastUploaderStatus += " ("+currentFile+")";
	}
    } else {
	lastUploaderStatus = "";
    }
    // if we're actually displaying progress
    if (document.getElementById("blurb").style.display != "none" 
	|| iCurrentStep >= steps.length - 1) {
	if (transcriptCount > 0) {
	    var uploadProgress = document.getElementById("overallProgress");
	    uploadProgress.max = 100;
	    uploadProgress.value = percentComplete / transcriptCount;
	    uploadProgress.title = Math.floor(percentComplete / transcriptCount) + "%" + (message?" "+message:"");
	    
	    // display message only if we've just finished a task
	    if (uploadProgress.value == uploadProgress.max) {
		$("#uploadermessage").html(noTags(settings.resources.uploadFinished));
	    } else {
		$("#uploadermessage").html(noTags(settings.resources.uploadingPleaseWait) + (currentFile?" (" + currentFile+ ")":""));
	    }
	} // there are transcripts
    }
}
// Adding a unique query string ensures the worker is loaded each time, ensuring it starts (in Firefox)

function gotBuffers( buffers ) {
    // the ONLY time gotBuffers is called is right after a new recording is completed - 
    // so here's where we should set up the download.
    if (mono) {
	audioRecorder.exportMonoWAV( doneEncoding );
    }
    else {
	audioRecorder.exportWAV( doneEncoding );
    }
}

function doneEncoding( blob ) {
    wav = blob;
    if (steps.length > iCurrentStep) {
	uploadRecording();
    }
}

function uploadRecording() {
    if (!wav) return;
    var sName = series + "-" + zeropad(++recIndex, transcriptIndexLength);
    var aTranscript = [	
	// meta-data
	"app=chrome\r\n",
	"appVersion="+chrome.runtime.getManifest().version+"\r\n",
	"appPlatform="+navigator.platform+"\r\n",
	"appDevice="+(navigator.userAgent.search("Firefox")>=0?"Firefox":navigator.userAgent.search("Chrome")>=0?"Chrome":"")+"\r\n",
	steps[iCurrentStep].tags + "\r\n",
	"{" + noTags(steps[iCurrentStep].prompt) + "} " + steps[iCurrentStep].transcript];
    var oTranscript = new Blob(aTranscript, {type : 'text/plain'});

    // save the wav file
    seriesDir.getFile(sName + ".wav", {create: true}, function(fileEntry) {
	fileEntry.createWriter(function(fileWriter) {		    
	    fileWriter.onwriteend = function(e) {
		console.log(sName + ".wav completed.");

		// save the transcript
		seriesDir.getFile(sName + ".txt", {create: true}, function(fileEntry) {
		    fileEntry.createWriter(function(fileWriter) {		    
			fileWriter.onwriteend = function(e) {
			    console.log(sName + ".txt completed.");

			    // save the consent if we haven't already
			    if (!consentSent) {
				seriesDir.getFile("consent-"+series+".pdf", {create: true}, function(fileEntry) {
				    fileEntry.createWriter(function(fileWriter) {
					fileWriter.onwriteend = function(e) {
					    console.log("consent-"+series+".pdf completed.");
					    consentSent = true;
					    // let the uploader know that an upload is ready
					    uploader.postMessage({message: "prod"});
					};		    
					fileWriter.onerror = function(e) {
					    console.log("Saving consent-"+series+".pdf failed");
					    fileError(e);
					};	    
					console.log("Saving consent-"+series+".pdf");
					fileWriter.write(consent);
				    }, function(e) {
					console.log("Could not create writer for consent-"+series+".pdf");
					fileError(e);
					// let the uploader know that an upload is ready anyway
					uploader.postMessage({message: "prod"});
				    }); // createWriter .pdf
				}, function(e) {
				    console.log("Could not get consent-"+series+".pdf");
				    fileError(e);
				    // let the uploader know that an upload is ready anyway
				    uploader.postMessage({message: "prod"});
				}); // getFile .pdf

			    } else { // we've already saved the consent (or there isn't one)
				// let the uploader know that an upload is ready
				uploader.postMessage({message: "prod"});
			    } // consentSent
			};		    
			fileWriter.onerror = function(e) {
			    console.log(sName + ".txt failed: " + e.toString());
			};	    
			console.log("Saving " + sName + ".txt");
			fileWriter.write(oTranscript);
		    }, function(e) {
			console.log("Could not create writer for " + sName + ".txt");
			fileError(e);
		    }); // createWriter .txt
		}, function(e) {
		    console.log("Could not get "+sName + ".txt: " + e.toString());
		    fileError(e);
		}); // getFile .txt
	    };		    
	    fileWriter.onerror = function(e) {
		console.log(sName + ".wav failed");
		fileError(e);
	    };	    
	    console.log("Saving " + sName + ".wav");
	    fileWriter.write(wav);
	}, function(e) {
	    console.log("Could not create writer for " + sName + ".wav");
	    fileError(e);
	}); // createWriter .wav
    }, function(e) {
	console.log("Could not get "+sName + ".wav: " + e.toString());
	fileError(e);
    }); // getFile .wav

    nextPhrase();
}

function stopRecording() {
    killTimer();
    if (steps[iCurrentStep]) {
	if (steps[iCurrentStep].record) {
	    // stop recording
	    audioRecorder.stop();
	    audioRecorder.getBuffers( gotBuffers );
	    document.getElementById("recording").className = "inactive";
	    document.getElementById("nextButton").style.opacity = "0.25";
	}
	else {
	    // clear timer countdown
	    if (countdownContext)
	    {
		countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height)
	    }
	    // display the phrase
	    nextPhrase();
	}
    }
} 

function startRecording() {
    if (steps[iCurrentStep] && steps[iCurrentStep].record) {
	// start recording
	if (!audioRecorder) return;
	audioRecorder.clear();
	audioRecorder.record();
    }
    document.getElementById("nextButton").style.opacity = "1";
}

function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

function gotStream(stream) {
    console.log("gotStream");

    inputPoint = audioContext.createGain();

    // Create an AudioNode from the stream.
    audioStream = stream;
    realAudioInput = audioContext.createMediaStreamSource(stream);
    if (mono) {
	audioInput = convertToMono( realAudioInput );
    } else {
	audioInput = realAudioInput;
    }

    // we will end up downsampling, but recorderWorker.js does this by simply dropping samples
    // so we use a low pass filter to prevent aliasing of higher frequencies
    if (sampleRate < audioContext.sampleRate) {
	var lowPassFilter = audioContext.createBiquadFilter();
	audioInput.connect(lowPassFilter);
	lowPassFilter.connect(inputPoint);
	lowPassFilter.type = lowPassFilter.LOWPASS||"lowpass";
	lowPassFilter.frequency.value = sampleRate/2;
	lowPassFilter.connect(inputPoint);
    } else {
	audioInput.connect(inputPoint);
    }
    
    console.log("creating audioRecorder");
    audioRecorder = new Recorder( inputPoint, { sampleRate: sampleRate } );
    console.log("audioRecorder " + audioRecorder);

    // pump through zero gain so that the microphone input doesn't play out the speakers causing feedback
    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );

//    document.getElementById("record").style.opacity = "1";

    createParticipantForm();
}

function clickNext()
{
    // ignore clicks if the button is already disabled
    if (document.getElementById("nextButton").style.opacity == "0.25") {
	return;
    }
    if (document.getElementById("nextButton").title == noTags(settings.resources.startAgain)) {
	loadPrompts(fileSystem);
	return;
    }

    // clicking the next button causes the button briefly disable 
    // so that double-clicks don't skip steps
    document.getElementById("nextButton").style.opacity = "0.25";
    
    // and then we go to the next step after a short delay, 
    // so that if the click slightly before finishing the last word, the end of it is recorded
    window.setTimeout(function() { 
	document.getElementById('nextButton').style.opacity = '1'; goNext();
    }, 250);
}

function goNext() {
    console.log("goNext " + consent);
    if (!consent) {	
	console.log("signature " + signature);
	if (!signature) { // haven't seen consent form yet
	    showConsent();
	    return;
	} else if (!signature.value) { // hanven't signed it yet
	    alert(noTags(settings.resources.pleaseEnterYourNameToIndicateYourConsent));
	    signature.focus();
	    return;
	} else { // have signed the form, so create a PDF from it
	    console.log("signature value " + signature.value);
	    // add their name and current date as spans
	    var signatureSpan = document.createElement("div");
	    signatureSpan.className = "signature";
	    signatureSpan.appendChild(document.createTextNode(signature.value));
	    signatureDiv.appendChild(signatureSpan);
	    var datestamp = new Date().toDateString();
	    var datestampSpan = document.createElement("div");
	    datestampSpan.className = "datestamp";
	    datestampSpan.appendChild(document.createTextNode(datestamp));
	    signatureDiv.appendChild(datestampSpan);
	    
	    // remove the text box
	    signatureDiv.removeChild(signature);

	    // create PDF
	    consent = new jsPDF();
	    consent.setProperties({
		title: 'Consent for ' + settings.task_name,
		subject: 'Consent signed by ' + signature.value + ' on ' + datestamp,
		creator: 'LaBB-CAT using jspdf',
		author: signature.value
	    });
	    consent.fromHTML($('#blurb').get(0), 15, 15, {
		'width': 170, 
		'elementHandlers': {}
	    });
	    
	    // let them save it
	    consent.save("consent-"+settings.task_name+"-"+signature.value.replace(/ /g,"-")+".pdf");
	    
	    // create a blob to send to the server
	    consent = consent.output("blob");
	    
	    // hide the consent text
	    document.getElementById("blurb").style.display = "none";
	    
	    // move on...
	    testForAudio();
	    return;
	}
    } else if (consent == " ") { // i.e. there's no consent to sign
	// there's no PDF to upload, so mark it as 'already uploaded'
	consentSent = true; 
    }

    console.log("audioRecorder " + audioRecorder);
    if (!audioRecorder) {
	console.log("no audioRecorder");
	initAudio();
	return;
    }

    console.log("iCurrentStep " + iCurrentStep + " fields display " + document.getElementById("fields").style.display);
    if (iCurrentStep >= 0) {
	// stop recording and send the last phrase to the server
	stopRecording();
    } else if (document.getElementById("fields").style.display == "") {
	console.log("checking form");
	// check they've filled everything in
	for (f in settings.participantFields) {
	    var field = settings.participantFields[f];
	    var input = field.input;
	    if (field.type != "select") {
		if (input.value.length == 0)
		{
		    alert(noTags(settings.resources.pleaseSupplyAValueFor) + " " + field.label);
		    input.focus();
		    return;
		}
	    }
	} // next field
	
	// save the data
	newParticipant();

	// hide the form
	document.getElementById("fields").style.display = "none";
	// start the task steps
	nextPhrase();
    } else {
	nextPhrase();
    }
}

function noTags(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
}

function zeropad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

window.addEventListener('load', loadFileSystem);
