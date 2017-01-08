var app = {
    // Application Constructor
    initialize: function() {
	$( document ).on( "mobileinit", function() {
	    $.mobile.defaultPageTransition = "slide";
	    // disable back button:
	    $.mobile.hashListeningEnabled = false;
	    $.mobile.pushStateEnabled = false;
	    $.mobile.changePage.defaults.changeHash = false;
	});
	
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);	
    },

    // deviceready Event Handler
    //
    // Bind any cordova events here. Common events are:
    // 'pause', 'resume', etc.
    onDeviceReady: function() {
        this.receivedEvent('deviceready');
	storage = window.localStorage;
	username = storage.getItem("u");
	password = storage.getItem("p");
	if (username) {
	    httpAuthorization = username?"Basic "+btoa(username+':'+password):null;
	}
	loadFileSystem();
    },

    // Update DOM on a Received Event
    receivedEvent: function(id) {
        console.log('Received Event: ' + id);
    }
};

app.initialize();

var manifest = /*chrome.runtime.getManifest();*/ { // TODO
    version : "0.1",
    url : "http://192.168.1.145:8080/labbcat/elicit/steps",
    task : "diary"
};
var storage = null;

var url = manifest.url;
var task = manifest.task;

var username = null;
var password = null;
var httpAuthorization = null;

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

var firstPage = null;
var iCurrentStep = -1;

var uploader = null;

var steps = [{
    title: "Elicit Speech",
    prompt: "Configuration not loaded. Please connect to the internet and try again.",
    transcript: ""
}];


// cordova-plugin-audioinput stuff


CordovaAudioInput = function() {

    // Capture configuration object
    this.captureCfg = {};

    // Audio Buffer
    this.audioDataBuffer = [];

    // Timers
    this.timerInterVal = null;

    // Info/Debug
    this.totalReceivedData = 0;

    // URL shim
    window.URL = window.URL || window.webkitURL;

};
CordovaAudioInput.prototype = {
    record : function() {
	try {
            if (window.audioinput && !audioinput.isCapturing()) {
                this.audioDataBuffer = [];
		// Get the audio capture configuration from the UI elements
		//
		this.captureCfg = {
                    sampleRate: sampleRate,
                    bufferSize: 2048,
                    channels: mono?1:2,
                    format: audioinput.FORMAT.PCM_16BIT,
		    audioSourceType: audioinput.AUDIOSOURCE_TYPE.DEFAULT
		};
		console.log(JSON.stringify(this.captureCfg));
		
		audioinput.start(this.captureCfg);
		console.log("audio input started");
		
		// Start the Interval that outputs time and debug data while capturing
		//
		var ai = this;
		this.timerInterVal = setInterval(function () {
		    if (audioinput.isCapturing()) {
			console.log("" +
				    new Date().toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, "$1") +
				    "|Received:" + ai.totalReceivedData);
		    }
		}, 1000);
	    }
	}
	catch (e) {
            console.log("startCapture exception: " + e);
	}
    },
    stop : function() {
	try {
            if (window.audioinput && audioinput.isCapturing()) {
		if (this.timerInterVal) {
                    clearInterval(this.timerInterVal);
		}
		
		if (window.audioinput) {
                    audioinput.stop();
		}
		
		this.totalReceivedData = 0;	    
            }
	}
	catch (e) {
            console.log("stopCapture exception: " + e);
	}
    },
    clear : function() {
    },
    getBuffers : function(getBuffersCallback) {
	getBuffersCallback();
    },
    exportMonoWAV : function(exportWAVCallback) {
	this.exportWAV(exportWAVCallback);
    },
    exportWAV : function(exportWAVCallback) {
	console.log("Encoding WAV...");
        var encoder = new WavAudioEncoder(this.captureCfg.sampleRate, this.captureCfg.channels);
        encoder.encode([this.audioDataBuffer]);

        console.log("Encoding WAV finished");

        var blob = encoder.finish("audio/wav");

        console.log("BLOB created: " + blob);
	exportWAVCallback(blob);
    },
    /**
     * Called continuously while AudioInput capture is running.
     */
    onAudioInputCapture : function(evt) {
	try {
            if (evt && evt.data) {
		// Increase the debug counter for received data
		audioRecorder.totalReceivedData += evt.data.length;
		
		// Add the chunk to the buffer
		audioRecorder.audioDataBuffer = audioRecorder.audioDataBuffer.concat(evt.data);
            }
            else {
		console.log("Unknown audioinput event!");
            }
	}
	catch (ex) {
            console.log("onAudioInputCapture ex: " + ex);
	}
    },
    /**
     * Called when a plugin error happens.
     */
    onAudioInputError : function(error) {
	console.log("onAudioInputError event recieved: " + JSON.stringify(error));
    }
};

// end of cordova-plugin-audioinput stuff

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
    var xhr = new XMLHttpRequest();
    xhr.onload = function(e) {
	try {
	    var data = JSON.parse(this.responseText);

	    // save username/password?
	    if (username) {
		storage.setItem("u", username);
		storage.setItem("p", password);
	    }
	    
	    if (data.errors.length) {
		for (e in data.errors) {
		    console.log("task failed to load: " + data.errors[e]); // TODO display?
		}
		loadSettings();
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
	} catch (x) {
	    console.log("invalid response "+x);
	    console.log(this.responseText);
	    loadSettings();
	}
    };
    xhr.onerror = function(e) {
	console.log("request failed: " + this.status);
	if (username) { // they've tried a username, so give them a message
	    alert("Participant ID or Access Code incorrect, please try again.");
	    document.getElementById("password").focus();
	}
	document.getElementById("loginButton").onclick = function(e) {
	    username = document.getElementById("username").value;
	    password = document.getElementById("password").value;
	    document.getElementById("password").value = "";
	    httpAuthorization = username?"Basic "+btoa(username+':'+password):null;
	    loadPrompts(fs);
	};
	$( ":mobile-pagecontainer" ).pagecontainer( "change", "#login");
    };
    xhr.open("GET", url + "?task="+task+"&d=" + new Date());
    if (httpAuthorization) xhr.setRequestHeader("Authorization", httpAuthorization);
    xhr.send();
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
	uploader = new Uploader(settings, httpAuthorization, uploadsProgress);
    }
    
    // download images/videos, if possible
    var flatStepsList = allSteps(data.model.steps);
    var promises = [];
    document.getElementById("overallProgress").max = 0;
    document.getElementById("overallProgress").value = 0;
    for (s in flatStepsList) {
	var step = flatStepsList[s];
	if (step.image) {
	    document.getElementById("overallProgress").max++;
	    promises.push(new Promise(function(resolve,reject) {
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
					document.getElementById("overallProgress").value++;
					resolve();
				    }
				};		    
				fileWriter.onerror = function(e) {
				    console.log(req.imageName + ' failed: ' + e.toString());
				    resolve();
				};
				
				console.log('Saving ' + req.imageName);
				// clear the file first
				fileWriter.truncate(0);
			    }, function(e) {
				console.log("Could not create writer for " + c.imageName);
				fileError(e);
				resolve();
			    }); // createWriter
			}, function(e) {
			    console.log("Could not get "+req.imageName+": " + e.toString());
			    fileError(e);
			    resolve();
			}); // getFile
		    } else {
			console.log("ERROR downloading "+req.imageName+": " + c.status);
			resolve();
		    }
		};
		c.error = function(e) { 
		    console.log("ERROR downloading "+c.imageName+": " + e.error);
		    resolve();
		};
		c.open('GET', data.model.imageBaseUrl + step.image, true);
		if (httpAuthorization) c.setRequestHeader("Authorization", httpAuthorization);
		c.send();
	    }));
	} // step has an image/video
    } // next step

    Promise.all(promises).then(function(values) {
	console.log("Downloads complete");
	// create instance of steps for this time round
	steps = createStepsInstanceFromDefinition(data.model.steps, "ordered", 0);
	
	startSession();
    });
}

// recursively return all steps
function allSteps(steps) {
    var list = [];
    for (s in steps) {
	list.push(steps[s]);
	if (steps[s].steps) {
	    list = list.concat(allSteps(steps[s].steps));
	}
    } // next step
    return list;
}

// recursively creates task steps to use, based on the defined steps, and the sample configuration, 
// which may specify that steps are randomly ordered and/or only a subset are used
function createStepsInstanceFromDefinition(steps, sample, step_count) {
    // random order?
    if (/.*random.*/.test(sample)) {
	steps = shuffle(steps.slice()); // shuffle a copy
    }
    // sample only?
    if (!/.*sample.*/.test(sample) || step_count == 0) {
	step_count = steps.length;
    }
    var stepsInstance = [];
    for (var i = 0; i < step_count; i++) {
        var step = steps[i];
	// if the step has more than just a title
	if (step.prompt || step.transcript || step.image) {
	    // include it
	    stepsInstance.push(step);
	}
	// does this step have children?
	if (step.steps) {
	    stepsInstance = stepsInstance.concat(
		createStepsInstanceFromDefinition( // recursive call
		    step.steps, step.sample, step.step_count));
	}
    } // next step
    return stepsInstance;
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
	document.getElementById("recording").title = noTags(settings.resources.recording);
    }

    clearPrompts();
    $("#prompt").html("");

    // determine the amount of zero-padding we will need
    var numRecordings = 0;
    for (step in steps) {
	if (steps[step].record) numRecordings++;
    }
    transcriptIndexLength = String(numRecordings).length;
    
    // ensure any previous participants are forgotten
    var now = new Date();
    series = now.toISOString().substring(0,16).replace(/[-:]/g,"").replace("T","-");
    // create a directory named after the series - this will be where all series-related files are kept until they're uploaded
    var seriesDirPromise = new Promise(function(resolve,reject) {
	fileSystem.root.getDirectory(series, {create: true}, function(dirEntry) {
	    seriesDir = dirEntry;
	    resolve();
	}, function (e) {
	    console.log("Could not create directory for series: " + series);
	    seriesDir = null;
	    fileError(e);
	    resolve();
	});
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

    // create pages    
    var lastNextButton = createPreamble();
    lastNextButton = createConsentForm(lastNextButton);
    for (f in settings.participantFields) {
	lastNextButton = createFieldPage(settings.participantFields, f, lastNextButton);	
    }
    for (f in settings.transcriptFields) {
	lastNextButton = createFieldPage(settings.transcriptFields, f, lastNextButton);	
    }
    for (s in steps) {
	createStepPage(s); 
    }
    firstPage = settings.preamble?"stepPreamble"
	:settings.consent?"stepConsent"
	:settings.participantFields.length?"field"+settings.participantFields[0].attribute
	:settings.transcriptFields.length?"field"+settings.transcriptFields[0].attribute
	:"step0";
    console.log("first " + firstPage);
    //clearPrompts();
    
    // start user interface...
    seriesDirPromise.then(function(val) {
	testForAudio();
    });
}

function createPreamble() {
    if (settings.preamble) {
	var nextButton = document.createElement("span"); // TODO "button"
	nextButton.className = "nextButton";
	nextButton.id = "nextButtonPreamble";
	nextButton.title = noTags(settings.resources.next);
	nextButton.nextPage = "step0"; // default to starting steps next
	nextButton.onclick = function(e) {
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#"+this.nextPage);
	}
	
	var stepPage = document.createElement("div");
	stepPage.id = "stepPreamble";
	stepPage.className = "step";
	stepPage.setAttribute("data-role", "page");
	var preambleDiv = document.createElement("div");
	preambleDiv.id = "preamble";
	preambleDiv.setAttribute("role", "main");
	preambleDiv.classList.add("preambleDiv");
	preambleDiv.classList.add("ui-content");
	
	preambleDiv.innerHTML = settings.preamble;
	
	stepPage.appendChild(preambleDiv);
	
	var controls = document.createElement("div");
	controls.className = "controls";
	var nextLabel = document.createElement("span");
	nextLabel.className = "nextLabel";
	nextLabel.appendChild(document.createTextNode(noTags(settings.resources.next)));
	nextButton.appendChild(nextLabel);
	var nextIcon = document.createElement("img");
	nextIcon.className = "nextIcon";
	nextIcon.src = "img/go-next.svg";
	nextButton.appendChild(nextIcon);
	controls.appendChild(nextButton);
	stepPage.appendChild(controls);
	document.getElementById("body").appendChild(stepPage);
	return nextButton.id;
    }
    return null;
}

function createConsentForm(lastNextButton) {
    // create signature box
    signature = document.createElement("input");
    signature.type = "text";
    signature.placeholder = noTags(settings.resources.pleaseEnterYourNameHere);
    signature.title = noTags(settings.resources.pleaseEnterYourNameHere);
    signature.className = "signature";
    
    if (settings.consent) {
	var nextButton = document.createElement("span"); // TODO "button"
	nextButton.className = "nextButton";
	nextButton.id = "nextButtonConsent";
	nextButton.title = noTags(settings.resources.next);
	nextButton.nextPage = "step0"; // default to starting steps next
	nextButton.onclick = function(e) {
	    if (!signature.value) {
		alert(noTags(settings.resources.pleaseEnterYourNameToIndicateYourConsent));
		signature.focus();
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
		signature.parentNode.removeChild(signature);
		
		// create PDF
		consent = new jsPDF();
		consent.setProperties({
		    title: 'Consent for ' + settings.task_name,
		    subject: 'Consent signed by ' + signature.value + ' on ' + datestamp,
		    creator: 'LaBB-CAT using jspdf',
		    author: signature.value
		});
		consent.fromHTML($('#consent').get(0), 15, 15, {
		    'width': 170, 
		    'elementHandlers': {}
		});
		
		// let them save it
		consent.save("consent-"+settings.task_name+"-"+signature.value.replace(/ /g,"-")+".pdf");
		
		// create a blob to send to the server
		consent = consent.output("blob");
	    
		// move on...
		$( ":mobile-pagecontainer" ).pagecontainer( "change", "#"+this.nextPage);
	    }
	}

	var stepPage = document.createElement("div");
	stepPage.id = "stepConsent";
	// update previous next button to open this page
	if (lastNextButton) document.getElementById(lastNextButton).nextPage = stepPage.id;
	stepPage.className = "step";
	stepPage.setAttribute("data-role", "page");
	var consentDiv = document.createElement("div");
	consentDiv.id = "consent";
	consentDiv.setAttribute("role", "main");
	consentDiv.classList.add("consentDiv");
	consentDiv.classList.add("ui-content");

	consentDiv.innerHTML = settings.consent;

	// add a box for them to enter their 'signature'
	signatureDiv = document.createElement("div");
	signatureDiv.className = "signatureContainer";
	signatureDiv.appendChild(signature);
	consentDiv.appendChild(signatureDiv);

	stepPage.appendChild(consentDiv);
	
	var controls = document.createElement("div");
	controls.className = "controls";
	var nextLabel = document.createElement("span");
	nextLabel.className = "nextLabel";
	nextLabel.appendChild(document.createTextNode(noTags(settings.resources.next)));
	nextButton.appendChild(nextLabel);
	var nextIcon = document.createElement("img");
	nextIcon.className = "nextIcon";
	nextIcon.src = "img/go-next.svg";
	nextButton.appendChild(nextIcon);
	controls.appendChild(nextButton);
	stepPage.appendChild(controls);
	document.getElementById("body").appendChild(stepPage);
	return nextButton.id;
    } else {
	consent = " ";
	signature.value = " ";
	return lastNextButton;
    }    
}

function createFieldPage(fieldsCollection, i, lastNextButton) {
    var field = fieldsCollection[i];

    var nextButton = document.createElement("span"); // TODO "button"
    nextButton.className = "nextButton";
    nextButton.id = "nextButton" + field.attribute;
    nextButton.title = noTags(settings.resources.next);
    nextButton.nextPage = "step0"; // default to starting steps next
    nextButton.onclick = function(e) {
	var input = field.input;
	// validate before continuing
	if (input.value.length == 0)
	{
	    alert(noTags(settings.resources.pleaseSupplyAValueFor) + " " + field.label);
	    input.focus();
	    return false;
	}
	$( ":mobile-pagecontainer" ).pagecontainer( "change", "#"+this.nextPage);
    }

    var stepPage = document.createElement("div");
    stepPage.id = "field"+field.attribute;
    // update previous next button to open this page
    if (lastNextButton) document.getElementById(lastNextButton).nextPage = stepPage.id;
    stepPage.className = "field";
    stepPage.fieldIndex = i;
    stepPage.setAttribute("data-role", "page");
    
    var fieldDiv = document.createElement("div"); // TODO use mobile UI elements
    fieldDiv.setAttribute("role", "main");
    fieldDiv.classList.add("formDiv");
    fieldDiv.classList.add("ui-content");

    var prompt = document.createElement("prompt");
    prompt.className = "form_prompt";
    prompt.appendChild(document.createTextNode(noTags(settings.resources.participantInfoPrompt)));
    fieldDiv.appendChild(prompt);
    
    var label = document.createElement("label");
    label.className = "form_label";
    label.title = field.description;
    label.appendChild(document.createTextNode(field.label));
    label.for = field.attribute;
    fieldDiv.appendChild(label);

    if (field.description)
    {
	var description = document.createElement("div");
	description.className = "form_description";
	description.appendChild(document.createTextNode(field.description));
	fieldDiv.appendChild(description);
    }

    var input;
    if (field.type == "select")
    {
	if (field.style.match(/radio/)) {
	    console.log(field.attribute + " is a radio selection");
	    input = document.createElement("input");
	    input.type = "hidden";
	    // and add a radio button for each option
	    for (o in field.options)
	    {
		var option = field.options[o];
		var optionLabel = document.createElement("label");
		var radio = document.createElement("input");
		radio.type = "radio";
		radio.name = field.attribute + "_options";
		radio.value = option.value;
		radio.onclick = function(e) {
		    input.value = this.value;
		};
		optionLabel.appendChild(radio);
		optionLabel.appendChild(document.createTextNode(option.description));
		fieldDiv.appendChild(optionLabel);
	    }	    
	} else { // not a radio button, so use the select widget
	    input = document.createElement("select");
	    input.setAttribute("data-native-menu", false);
	    for (o in field.options)
	    {
		var option = field.options[o];
		var selectOption = document.createElement("option");
		selectOption.value = option.value;
		selectOption.appendChild(document.createTextNode(option.description));
		input.appendChild(selectOption);
	    }
	}
    } else {
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
	    if (field.style.match(/radio/)) {
		input = document.createElement("input");
		input.type = "hidden";
		// and add a radio button for each option
		
		var optionLabel = document.createElement("label");
		var radio = document.createElement("input");
		radio.type = "radio";
		radio.name = field.attribute + "_options";
		radio.value = "1";
		radio.onclick = function(e) {
		    input.value = this.value;
		};
		optionLabel.appendChild(radio);
		optionLabel.appendChild(document.createTextNode("Yes")); // TODO i18n
		fieldDiv.appendChild(optionLabel);
		
	    	optionLabel = document.createElement("label");
		radio = document.createElement("input");
		radio.type = "radio";
		radio.name = field.attribute + "_options";
		radio.value = "0";
		radio.onclick = function(e) {
		    input.value = this.value;
		};
		optionLabel.appendChild(radio);
		optionLabel.appendChild(document.createTextNode("No")); // TODO i18n
		fieldDiv.appendChild(optionLabel);
	    } else {
		input.type = "checkbox";
	    }
	}
	else
	{
	    input.type = "text";
	}
	input.placeholder = field.description;
    }
    input.className = "form_value";
    input.title = field.description;
    input.id = field.attribute;
    input.name = field.attribute;
    fieldDiv.appendChild(input);
    field.input = input;

    stepPage.appendChild(fieldDiv);

    var controls = document.createElement("div");
    controls.className = "controls";
    var nextLabel = document.createElement("span");
    nextLabel.className = "nextLabel";
    nextLabel.appendChild(document.createTextNode(noTags(settings.resources.next)));
    nextButton.appendChild(nextLabel);
    var nextIcon = document.createElement("img");
    nextIcon.className = "nextIcon";
    nextIcon.src = "img/go-next.svg";
    nextButton.appendChild(nextIcon);
    controls.appendChild(nextButton);
    stepPage.appendChild(controls);
    document.getElementById("body").appendChild(stepPage);

    return nextButton.id;
}

function createStepPage(i) {
    var step = steps[i];

    var nextButton = document.createElement("span"); // TODO "button"
    nextButton.className = "nextButton";
    nextButton.id = "nextButton" + i;
    nextButton.title = noTags(settings.resources.next);
    nextButton.onclick = clickNext;

    var stepPage = document.createElement("div");
    stepPage.id = "step"+i;
    stepPage.className = "step";
    stepPage.stepIndex = i;
    stepPage.setAttribute("data-role", "page");
    var promptDiv = document.createElement("div");
    promptDiv.setAttribute("role", "main");
    promptDiv.classList.add("promptDiv");
    promptDiv.classList.add("ui-content");
    if (step.title.trim()) {
	var stepTitle = document.createElement("div");
	stepTitle.className = "stepTitle";
	stepTitle.appendChild(document.createTextNode(step.title));
	promptDiv.appendChild(stepTitle);
    }
    if (step.prompt.trim()) {
	var prompt = document.createElement("div");
	prompt.className = "prompt";
	prompt.innerHTML = step.prompt;
	promptDiv.appendChild(prompt);
    }
    if (step.transcript.trim() || step.image) {
	var transcript = document.createElement("div");
	transcript.className = "transcript";
	if (step.transcript.trim()) {
	    transcript.innerHTML = "<p>"+step.transcript.replace(/\n/g,"<br>")+"</p>";
	}
	if (step.image) {	    
	    var image = document.createElement(step.image.endsWith(".mp4")?"video":"img");
	    if (step.image.endsWith(".mp4")) {
		$(document).on("pageshow","#"+stepPage.id,function(){
		    image.play();
		});
		// disable next button
		nextButton.style.opacity = "0.25";
		image.addEventListener("ended", function(e) {
		    // start recording, if appropriate, and enable 'next'
		    startRecording();				
		    if (step.record) {
			// reveal that we're recording
			document.getElementById("recording").className = "active";    
			// and ensure they don't go over the max time
			startTimer(step.max_seconds, stopRecording);
		    }
		},false);
	    }
	    fileSystem.root.getFile(step.image, {}, function(fileEntry) {
		fileEntry.file(function(file) {
		    var reader = new FileReader();	    
		    reader.onloadend = function(e) {
			image.src = this.result;
		    }
		    reader.readAsDataURL(file);
		}, fileError)
	    }, function(e) { 
		console.log("Could get read "+step.image+": " + e.toString());
	    });
	
	    transcript.appendChild(image);
	} // there's an image
	promptDiv.appendChild(transcript);
    }
    stepPage.appendChild(promptDiv);
    var controls = document.createElement("div");
    controls.className = "controls";
    var nextLabel = document.createElement("span");
    nextLabel.className = "nextLabel";
    nextLabel.appendChild(document.createTextNode(noTags(settings.resources.next)));
    nextButton.appendChild(nextLabel);
    var nextIcon = document.createElement("img");
    nextIcon.className = "nextIcon";
    nextIcon.src = "img/go-next.svg";
    nextButton.appendChild(nextIcon);
    if (i < steps.length - 1) { // not last step
	controls.appendChild(nextButton);
    }
    stepPage.appendChild(controls);
    document.getElementById("body").appendChild(stepPage);
}

function testForAudio() {
    console.log("testForAudio");
    if (window.cordova && window.audioinput && device.platform != "browser") {
	// use cordova plugin
	console.log("using cordova plugin for audio capture");
	
	audioRecorder = new CordovaAudioInput();

	// Subscribe to audioinput events
        //
        window.addEventListener('audioinput', function(e) { audioRecorder.onAudioInputCapture(e); }, false);
        window.addEventListener('audioinputerror', function(e) { audioRecorder.onAudioInputError(e); }, false);

	goNext();
	
    } else {
	
	// use web audio
	window.AudioContext = window.AudioContext || window.webkitAudioContext;
	if (!window.AudioContext) {
	    $("#prompt").html(settings.resources.webAudioNotSupported);
	} else {
	    initAudio();
	}
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
    document.getElementById("overallProgress").max = steps.length - 1;    
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
	if (field.type == "select" && !field.style.match(/radio/))
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

    // start steps
    iCurrentStep = 0;
}

function getNewParticipantId(participantAttributes) {
    if (username) { // already know the participant ID
	participantAttributes.id = username;
	console.log("Participant ID is username: " + participantAttributes.id);
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
    } else {	
	var query = "";
	for (k in participantAttributes) {
	    if (query) query += "&";
	    query += k + "=" + participantAttributes[k];
	}
	var xhr = new XMLHttpRequest();
	xhr.onload = function(e) {
	    try {
		var data = JSON.parse(this.responseText);
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
	    } catch (x) {
		console.log("invalid response "+x);
		console.log(this.responseText);
		loadSettings();
	    }
	};
	xhr.onerror = function(e) {
	    console.log("Could not get participant ID right now.");
	};
	xhr.open("GET", settings.newParticipantUrl + "?" + query);
	if (httpAuthorization) xhr.setRequestHeader("Authorization", httpAuthorization);
	xhr.send();
    }
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
		document.getElementById("nextButton" + iCurrentStep).style.opacity = "0.25";
		startTimer(steps[iCurrentStep].countdown_seconds, showCurrentPhrase);
	    } else {
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

    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#step" + iCurrentStep);

    /*
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
    */

    if (steps[iCurrentStep].record
	&& (!steps[iCurrentStep].image 
	    || !steps[iCurrentStep].image.endsWith(".mp4"))) { // not video, starts recording when finished
	console.log("reveal that we're recording");
	document.getElementById("recording").className = "active";    
	// and ensure they don't go over the max time
	startTimer(steps[iCurrentStep].max_seconds, stopRecording);
    }
    console.log(" image " + steps[iCurrentStep].image);
    if (!steps[iCurrentStep].image 
	|| !steps[iCurrentStep].image.endsWith(".mp4")) { // not video, which enables when finished
	console.log("enable next button");
	//	document.getElementById("nextButton").style.opacity = "1";
	document.getElementById("nextButton" + iCurrentStep).style.opacity = "1";
    }
}

function finished() {
    if (countdownContext) {
	countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height)
    }

    stopRecording();
    document.getElementById("nextButton" + iCurrentStep).style.opacity = "0";
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
    document.getElementById("nextButton" + iCurrentStep).style.opacity = "1";
    $("#nextLabel").html(noTags(settings.resources.startAgain));
    document.getElementById("nextButton" + iCurrentStep).title = noTags(settings.resources.startAgain);
	
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
    if (iCurrentStep < 0 || iCurrentStep >= steps.length - 1) {
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
    var aTranscript = [];
    // meta-data
    aTranscript.push("app=cordova\r\n");
    aTranscript.push("appVersion="+manifest.version+"\r\n");
    aTranscript.push("appPlatform="+navigator.platform+"\r\n");
    aTranscript.push("appDevice="+device.platform+" "+device.model+"\r\n");
    // attributes specified by the participant
    for (f in settings.transcriptFields)
    {
	var field = settings.transcriptFields[f];
	var input = field.input;
	var name = field.attribute;
	var value;
	if (field.type == "select" && !field.style.match(/radio/))
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
	if (value) aTranscript.push(field.attribute+"="+value+"\r\n"); // TODO what about multiline values?
    } // next field
    // step-specific tags
    aTranscript.push(steps[iCurrentStep].tags + "\r\n");    
    // the transcript
    aTranscript.push("{" + noTags(steps[iCurrentStep].prompt) + "} " + steps[iCurrentStep].transcript);
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
					    uploader.prod();
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
					uploader.prod();
				    }); // createWriter .pdf
				}, function(e) {
				    console.log("Could not get consent-"+series+".pdf");
				    fileError(e);
				    // let the uploader know that an upload is ready anyway
				    uploader.prod();
				}); // getFile .pdf

			    } else { // we've already saved the consent (or there isn't one)
				// let the uploader know that an upload is ready
				uploader.prod();
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

		nextPhrase();
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

    //nextPhrase();
}

function stopRecording() {
    killTimer();
    if (steps[iCurrentStep]) {
	if (steps[iCurrentStep].record) {
	    // stop recording
	    audioRecorder.stop();
	    audioRecorder.getBuffers( gotBuffers );
	    document.getElementById("recording").className = "inactive";
	    document.getElementById("nextButton" + iCurrentStep).style.opacity = "0.25";
	} else {
	    // clear timer countdown
	    if (countdownContext) {
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
    try {
	document.getElementById("nextButton" + iCurrentStep).style.opacity = "1";
    } catch(X) {}
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

    goNext();
}

function clickNext()
{
    // ignore clicks if the button is already disabled
    if (iCurrentStep >= 0) {
	if (document.getElementById("nextButton" + iCurrentStep).style.opacity == "0.25") {
	    return;
	}
	if (document.getElementById("nextButton" + iCurrentStep).title == noTags(settings.resources.startAgain)) { // TODO implement starting again
	    loadPrompts(fileSystem);
	    return;
	}

	// clicking the next button causes the button briefly disable 
	// so that double-clicks don't skip steps
	document.getElementById("nextButton" + iCurrentStep).style.opacity = "0.25";
    }
    // and then we go to the next step after a short delay, 
    // so that if the click slightly before finishing the last word, the end of it is recorded
    window.setTimeout(goNext, 250);
}

function goNext() {
    console.log("goNext " + consent);
    if (!consent) {	
	console.log("signature " + signature);
	if (!signature) { // haven't seen consent form yet
	    showConsent();
	    return;
	}
    }

    console.log("audioRecorder " + audioRecorder);
    if (!audioRecorder) {
	console.log("no audioRecorder");
	initAudio();
	return;
    }

    console.log("iCurrentStep " + iCurrentStep);
    if (iCurrentStep >= 0) {
	// stop recording and send the last phrase to the server
	stopRecording();
	
    } else if (!participantAttributes) {
	console.log("newParticipant...");

	// save the data
	newParticipant();

	// start the task steps
	$( ":mobile-pagecontainer" ).pagecontainer( "change", "#" + firstPage);
    } else {
	console.log("nextPhrase...");
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

