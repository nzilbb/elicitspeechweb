var appVersion = 0;
var appBuild = 0;
var appName = "?";
var appPackage = "?";

var storage = null;

var url = config.url;
var tasks = null;
var task = null;
var lastLoadAllTasks = new Date().getTime();
var lastNotificationTap = null;
var currentlyLoadingTasks = false;
var firstTaskId = null;
var defaultTaskId = null;

var username = null;
var password = null;
var httpAuthorization = null;

// possible values for step.record:
const ELICIT_NOTHING = 0;
const ELICIT_AUDIO = 1;
const ELICIT_ATTRIBUTE = 2;

console.log("index.js...");

var app = {
    // Cordova Application Constructor
    initialize: function() {
	console.log("initialize...");
	$( document ).on( "mobileinit", function() {
	    $.mobile.defaultPageTransition = "slide";
	    // disable back button:
	    $.mobile.hashListeningEnabled = false;
	    $.mobile.pushStateEnabled = false;
	    $.mobile.changePage.defaults.changeHash = false;
	});
	console.log("waiting for device ready...");
        document.addEventListener("deviceready", this.onDeviceReady.bind(this), false);	
    },

    // deviceready Event Handler
    //
    // Bind any cordova events here. Common events are:
    // 'pause', 'resume', etc.
    onDeviceReady: function() {
	console.log("device ready...");
	// get app info
	var xhr = new XMLHttpRequest(); // try config.xml
	xhr.addEventListener("load", function () {
	    var parser = new DOMParser();
	    var doc = parser.parseFromString(xhr.responseText, "application/xml");
	    appName = doc.getElementsByTagName("name").item(0).textContent;
	    var widget = doc.getElementsByTagName("widget").item(0);
	    appVersion = widget.getAttribute("version");
	    appPackage = widget.getAttribute("id");
	});
	xhr.onerror = function(e) { // if that fails, use cordova-plugin-app-version 
	    cordova.getAppVersion.getVersionNumber().then(function (version) {appVersion = version;});
	    cordova.getAppVersion.getAppName().then(function (name) {appName = name;});
	    cordova.getAppVersion.getPackageName().then(function (package) {appPackage = package;});
	}
	xhr.open("get", "config.xml", true);
	xhr.send();
	
        document.addEventListener("pause", this.onPause.bind(this), false);	
        document.addEventListener("resume", this.onResume.bind(this), false);	
        document.addEventListener("backbutton", this.onBack.bind(this), false);		
	document.getElementById("tryAgainButton").onclick = function(e) {
	    console.log("Try again...");
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#page_content", { transition: "slidedown", reverse: true });
	    loadAllTasks();
	};
	
        this.receivedEvent('deviceready');
	storage = window.localStorage;
	username = storage.getItem("u");
	password = storage.getItem("p");
	if (username) {
	    httpAuthorization = username?"Basic "+btoa(username+':'+password):null;
	    console.log("participant " + username);
	}
	if (cordova.plugins && cordova.plugins.notification) {
	    cordova.plugins.notification.local.on("trigger", this.onReminderTriggered.bind(this));
	    cordova.plugins.notification.local.on("click", this.onReminderTapped.bind(this));
	}
	
	// save schedule button
	document.getElementById("saveSchedule").onclick = function(e) {
	    scheduleReminders();
	    startTask(defaultTaskId);
	};

	// login button
	document.getElementById("loginButton").onclick = function(e) {
	    console.log("login...");
	    currentlyLoadingTasks = false;
	    $.mobile.loading("show");
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#page_content", { transition: "slidedown", reverse: true });
	    username = document.getElementById("username").value;
	    password = document.getElementById("password").value;
	    document.getElementById("password").value = "";
	    httpAuthorization = username?"Basic "+btoa(username+':'+password):null;
	    loadAllTasks();
	};

	// hide splash
	$("#splash").hide();

	// register page change event
	$( ":mobile-pagecontainer" ).on( "pagecontainerchange", onPageChange );
	
	loadFileSystem();
    },

    // Update DOM on a Received Event
    receivedEvent: function(id) {
        console.log('Received Event: ' + id);
    },

    onPause: function(e) {
	console.log("pause...");
	if (device.platform == "browser") return;
	// if we've finished a task
	console.log("current: " + $(":mobile-pagecontainer").pagecontainer("getActivePage").attr("id") + " last: " + lastPageId);
	if ($(":mobile-pagecontainer").pagecontainer("getActivePage").attr("id") == lastPageId) {
	    // reload task definitions
	    loadAllTasks();
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#page_content");
	}
    },
    onResume: function(e) {
	console.log("resume...");
	if (device.platform == "browser") return;

	if (lastNotificationTap && new Date().getTime() - lastNotificationTap < 2000) {
	    console.log("just tapped, so run with that...");
	    return;
	}


	// if tasks were loaded fairly recently
	if (new Date().getTime() - lastLoadAllTasks < 300000) {
	    console.log("recently downloaded tasks...");
	    // had we finished a task?
	    if ($(":mobile-pagecontainer").pagecontainer("getActivePage").attr("id") == lastPageId) {
		console.log("task finished, so start another - " + defaultTaskId);
		startTask(defaultTaskId);
	    }
	    // otherwise, just stay where we were
	    return;
	}

	// cancel out of any audio handling
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
	audioStream = null;

	console.log("start another task - " + defaultTaskId);
	startTask(defaultTaskId);
    },
    onBack: function(e) {
	console.log("back");
	// prevent back button from closing app
    },

    onReminderTriggered: function(notification) {
	console.log("triggered notification for " + notification.data);
	defaultTaskId = notification.data;
    },
    onReminderTapped: function(notification) {
	console.log("tapped notification for " + notification.data);
	lastNotificationTap = new Date().getTime();
	// start the task of the notification
	if (currentlyLoadingTasks || !tasks) {
	    console.log("defer task until loading finished");
	    // when loading finishes, start this task
	    defaultTaskId = notification.data;
	} else { // not currently loading
	    // start the task immediately
	    startTask(notification.data);
	}
    }
    
};

app.initialize();

var audioContext = null;
var audioInput = null;
var realAudioInput = null;
var inputPoint = null;
var audioRecorder = null;
var audioStream = null;
var settings = null;
var series = null;
var seriesTime = null;
var seriesDir = null;
var participantAttributes = null;
var elicitedAttributes = null;
var maxAttributePageIndex = -1;
var maxRecordingPageIndex = -1;
var pages = [];
var notificationId = 0;
    
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
var iRecordingStep = -1;
var numRecordings = 0;
var fieldCount = 0;

var uploader = null;
var lastPageId = null;
var steps = [{
    title: "Elicit Speech",
    prompt: "Configuration not loaded. Please connect to the internet and try again.",
    transcript: ""
}];

// index keyed on step_id 
var stepsIndex = {};


// cordova-plugin-audioinput stuff for Android/iOS
// (the browser version uses recorder.js)
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
    getUserPermission : function() {
	try {
            if (window.audioinput && !audioinput.isCapturing()) {
		var permissions = cordova.plugins.permissions;
		permissions.hasPermission(permissions.RECORD_AUDIO, function(status) {
		    if(!status.hasPermission) {
			var errorCallback = function() {
			    console.warn('Denied permission to record');
			}
			console.log("asking for permission to record");
			permissions.requestPermission(
			    permissions.RECORD_AUDIO,
			    function(status) {
				if(!status.hasPermission) {
				    errorCallback();
				} else {
				    console.log("granted permission to record");
				    // close testAudio dialog
				    hideAudioMessage();
				}
			    },
			    errorCallback);
		    } else {
			console.log("already have permission to record");
			// close testAudio dialog
			hideAudioMessage();
		    }
		});
	    }
	}
	catch (e) {
            console.log("startCapture exception: " + e);
	}
    },
    record : function() {
	try {
            if (window.audioinput && !audioinput.isCapturing()) {
                this.audioDataBuffer = [];
 		// Get the audio capture configuration from the UI elements
 		//
 		this.captureCfg = {
                    sampleRate: sampleRate,
                    bufferSize: 1024,
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
	} catch (e) {
            console.log("startCapture exception: " + e);
	}
    },
    stop : function() {
	try {
            if (window.audioinput && audioinput.isCapturing()) {		
		if (window.audioinput) {		    
                    audioinput.stop();
		    if (this.timerInterVal) {
			clearInterval(this.timerInterVal);
		    }
		}
            }
	    this.totalReceivedData = 0;
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
	console.log("onAudioInputError event received: " + JSON.stringify(error));
    },
};

// end of cordova-plugin-audioinput stuff

// in order to store task configurations and recordings, we request a filesystem
var fileSystem = null;
function loadFileSystem() {
    $.mobile.loading("show", { theme: "a"});
    window.requestFileSystem  = window.requestFileSystem || window.webkitRequestFileSystem;
    if (window.webkitStorageInfo && window.webkitStorageInfo.requestQuota
	// don't call requestQuota in browsers - it's temporary storage anyway
	&& device.platform != "browser") { 
	// Chrome/Android requires calling requestQuota first
	window.webkitStorageInfo.requestQuota(
	    device.platform=="browser"?window.TEMPORARY:window.PERSISTENT,
	    10*1024*1024, function(grantedBytes) {
		console.log("Granted " + grantedBytes + " bytes storage");
		window.requestFileSystem(
		    device.platform=="browser"?window.TEMPORARY:window.PERSISTENT,
		    grantedBytes, loadPrompts, fileError);
	    }, fileError);
    } else {
	// Firefox and Safari/iOS require calling requestFileSystem directly
	window.requestFileSystem(
	    device.platform=="browser"?window.TEMPORARY:window.PERSISTENT,
	    10*1024*1024, loadPrompts, fileError);
    }
}

// interpret and report file-system related errors
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
// once we've got a file system, we can download task configurations
function loadPrompts(fs) {
    console.log("Got file system: " + fs.name);
    fileSystem = fs;
    loadAllTasks();
}

function loadAllTasks() {
    // only one loading at a time...
    if (currentlyLoadingTasks) return;
    
    lastLoadAllTasks = new Date().getTime();
    currentlyLoadingTasks = true;
    // visual feedback that something is happening:
    $.mobile.loading("show"); 

    tasks = {};
    notificationId = 0; // TODO cancel all prior notifications
    var controlPanelList = document.getElementById("taskList");
    while (controlPanelList.children.length) {
	controlPanelList.removeChild(controlPanelList.firstChild);
    }
    controlPanelList = document.getElementById("taskSchedule");
    while (controlPanelList.children.length) {
	controlPanelList.removeChild(controlPanelList.firstChild);
    }
    loadNextTask();
}

function loadNextTask() {
    // we keep calling loadNextTask until all tasks are loaded
    for (t in config.tasks) {
	var taskId = config.tasks[t];
	if (!tasks[taskId]) {
	    // default task is the first one
	    firstTaskId = firstTaskId || taskId;
	    
	    loadTask(taskId);
	    return;
	}
    } // next task
    
    // if we got this far, all tasks are loaded, and we can start the first task
    $.mobile.loading("hide");
    currentlyLoadingTasks = false;
    scheduleReminders();
    defaultTaskId = defaultTaskId||firstTaskId;
    startTask(defaultTaskId);
}

// try to get task definition from server
function loadTask(taskId) {
    console.log("loadTask " + taskId);
    var xhr = new XMLHttpRequest();
    
    // if the request succeeds:
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
		loadSettings(taskId);
	    } else {
		console.log("settings downloaded");
		fileSystem.root.getFile(taskId+".json", {create: true}, function(fileEntry) {
		    fileEntry.createWriter(function(fileWriter) {		    
			fileWriter.onwriteend = function(e) {
			    loadSettings(taskId);
			};
			fileWriter.onerror = function(e) {
			    console.log("Write failed");
			    fileError(e);
			    loadSettings(taskId);
			};		    
			// now write the content
			var blob = new Blob([JSON.stringify(data)], {type: 'application/json'});
			console.log("Writing settings file");
			fileWriter.write(blob);
		    }, function(e) {
			console.log("Could not create writer");
			fileError(e);
			loadSettings(taskId);
		    }); // createWriter
		}, function(e) {
		    console.log("Could not get file: " + e.toString());
		    fileError(e);
		    loadSettings(taskId);
		}); // getFile
	    } // request success
	} catch (x) {
	    if (this.status == 401) { // not allowed
		this.onerror(null); // ask for username/password
	    } else {
		console.log("invalid response "+x);
		console.log(this.responseText);
		loadSettings(taskId);
	    }
	}
    };

    // if the request fails:
    xhr.onerror = function(e) {
	console.log("request failed: " + this.status);
	if (e && storage.getItem("u")) {
	    // returning user, but can't connect, so just load what we've got
	    console.log("Falling back to previously saved configuration");
	    loadSettings(taskId);
	} else {
	    if (username) { // they've tried a username, so give them a message
		alert(noTags(settings.resources.participantIdOrAccessCodeIncorrect));
		document.getElementById("password").focus();
	    }
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#login", { transition: "slidedown" });
	}
    };

    // don't wait longer than a few seconds:
    xhr.timeout = 8000; 
    xhr.ontimeout = function (e) {
	console.log("Request timeout");
	// fall back to previously saved definition
	loadSettings(taskId);
    };
    
    console.log("open " + url + "?task="+taskId+"&d=" + new Date());
    xhr.open("GET", url + "?task="+taskId+"&d=" + new Date());
    if (httpAuthorization) xhr.setRequestHeader("Authorization", httpAuthorization);
    console.log("send...");
    xhr.send();
}

// load the task definition from the local file
function loadSettings(taskId) {
    console.log("loadSettings");
    
    fileSystem.root.getFile(taskId+".json", {}, function(fileEntry) {
	fileEntry.file(function(file) {
	    var reader = new FileReader();	    
	    reader.onloadend = function(e) {
		console.log("settings read.");
		try {
		    promptsLoaded(taskId, JSON.parse(this.result));
		} catch(e) {
		    console.log("Error " + e);
		    console.log(this.result);
		}
	    }	    
	    reader.readAsText(file);
	}, fileError)
    }, function(e) { 
	// request probably timed out or failed, and we've got no task file to fall back on, so it's a first-time run situation
	fileError(e);
	$.mobile.loading("hide");

	if (device.platform == "iOS") {
	    // On iOS, when http status 401 (unauthorized) is returned by the server (meaning they have to enter username/password)
	    // a bug in iOS prevents xhr.onerror from being called, and instead the request times out.
	    // This means that a real timeout and a rejection for lack of credentials look the same. So we assume they've been rejected,
	    // and ask them for their username/password
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#login", { transition: "slidedown" });
	} else if (device.platform == "browser" && navigator.platform.match(/iP/i)) {
	    $("#timeoutMessage").html("<p>Sorry, this page doesn't work on "+navigator.platform+"</p><p>Please try again using a different device.</p>"); // TODO i18n
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#timeout", { transition: "slidedown" });
	} else {
	    // But on other platforms, 401 correctly invokes xhr.onerror above, so we know this is really a timeout or lack of connectivity
	    // and we display an informative message:
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#timeout", { transition: "slidedown" });
	}
	currentlyLoadingTasks = false;
    });
}

// we have loaded the task, so download any other resources, create buttons in the console menu, etc.
function promptsLoaded(taskId, data) 
{ 
    tasks[taskId] = data.model;

    // add options to the control panel for this task
    var li = document.createElement("li");
    var a = document.createElement("a");
    a.appendChild(document.createTextNode(tasks[taskId].description));
    a.href="#page_content";
    a.onclick = function(e) { startTask(taskId); };
    a.setAttribute("data-rel","close");
    a.classList.add("ui-btn");
    a.classList.add("ui-icon-carat-r");
    a.classList.add("ui-btn-icon-right");
    li.appendChild(a);
    document.getElementById("taskList").appendChild(li);

    var taskSchedule = document.getElementById("taskSchedule");

    if (tasks[taskId].reminders.length) { // scheduled reminders exist
	li = document.createElement("li");
	li.setAttribute("data-role","list-divider");
	li.setAttribute("role","heading");
	li.appendChild(document.createTextNode(tasks[taskId].description));
	taskSchedule.appendChild(li);
	
	for (i in tasks[taskId].reminders) {
	    var reminderId = taskId + "_" + i;
	    // load time from storage, falling back to the default time in config.tasks
	    var timeString = storage.getItem(reminderId) || tasks[taskId].reminders[i];
	    
	    li = document.createElement("li");
	    var input = document.createElement("input");
	    input.id = taskId + "_" + i;
	    input.type = "time";
	    input.value = timeString;
	    li.appendChild(input);
	    taskSchedule.appendChild(li);
	} // next scheduled time
    } // scheduled reminders exist

    // start the uploader (once only)
    if (!uploader) {
	uploader = new Uploader(tasks[taskId], httpAuthorization, uploadsProgress, fileSystem);
    }
    
    // download images/videos, if possible
    var flatStepsList = allSteps(data.model.steps);
    var promises = [];
    document.getElementById("overallProgress").max = 0;
    document.getElementById("overallProgress").value = 0;
    for (s in flatStepsList) {
	var step = flatStepsList[s];
	stepsIndex[step.step_id] = step; // index
	if (step.image) { // TODO only if it doesn't already exist
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
				    console.log(req.imageName + ' completed.');
				    document.getElementById("overallProgress").value++;
				    resolve();
				};		    
				fileWriter.onerror = function(e) {
				    console.log(req.imageName + ' failed: ' + e.toString());
				    resolve();
				};
				
				console.log('Saving ' + req.imageName);
				fileWriter.write(req.response);
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

    defaultTaskId = defaultTaskId || taskId;
    var notificationText = tasks[taskId].description;
    var notificationTaskId = taskId;

    // once we've got everything...
    Promise.all(promises).then(function(values) {
	console.log("Downloads complete");
	// load next task...
	loadNextTask();
    });
}

// if the task defines shceduled reminder times, we need to schedule those notifications on the mobile device
function scheduleReminders() {
    console.log("scheduling reminders...");
    notificationId = 0;
    for (taskId in tasks) {
	for (i in tasks[taskId].reminders) {
	    var reminderId = taskId + "_" + i;
	    var timeString = document.getElementById(reminderId).value;
	    var timeParts = timeString.split(":");
	    var sheduleTime = new Date();
	    sheduleTime.setHours(timeParts[0]);
	    sheduleTime.setMinutes(timeParts[1]);
	    sheduleTime.setSeconds(0);
	    // if the time is already passed for today
	    if (sheduleTime.getTime() < Date.now()) {
		// schedule for tomorrow
		sheduleTime.setDate(sheduleTime.getDate() + 1);
	    }

	    console.log("Scheduling notification for " + taskId + " at " + sheduleTime.toString());
	    cordova.plugins.notification.local.schedule({
		id: notificationId++,
		title: noTags(settings.resources.timeFor) + " " + tasks[taskId].description,
		every: "day",
		at: sheduleTime,
		data: taskId
	    });
	    // save configuration
	    storage.setItem(reminderId, timeString);
	} // next time
    } // next task
    if (notificationId == 0) { // there are no scheduled notifications
	$("#scheduleMenu").hide();
    }
    
}

// start presentation of a given task to the user
function startTask(taskId) {
    // reset default task to first one
    defaultTaskId = firstTaskId;
    
    // remove any previous task pages
    for (p in pages) {
	var page = pages[p];
	if (page.parentElement) {
	    page.parentElement.removeChild(page);
	}
    } // next page
    pages = [];
    
    $("#uploadermessage").html(""); 

    settings = tasks[taskId];
    
    // create instance of steps for this time round
    steps = createStepsInstanceFromDefinition(settings.steps, "ordered", 0);
    
    startSession();
}

// recursively return all steps - steps are usually just in a list, but can have nested structure
// if parts of the task need to have randomized order, etc.
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
	// include it
	stepsInstance.push(step);
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

// given a final task step sequence, start it in the UI.
function startSession() {
    // set up UI
    document.getElementById("recording").className = "inactive";
    if (settings) {
	document.getElementById("overallProgress").title = noTags(settings.resources.overallProgress);
	document.getElementById("recording").title = noTags(settings.resources.recording);
    }

    // determine the amount of zero-padding we will need
    numRecordings = 0;
    for (step in steps) {
	if (steps[step].record == ELICIT_AUDIO) numRecordings++;
    }
    transcriptIndexLength = String(numRecordings).length;
    
    // ensure any previous participants are forgotten
    var now = new Date();
    seriesTime = zeropad(now.getFullYear(),4)
	+ "-" + zeropad(now.getMonth()+1,2) // getMonth() is 0-based
	+ "-" + zeropad(now.getDate(),2)
	+ " " + zeropad(now.getHours(),2)
	+ ":" + zeropad(now.getMinutes(),2);
    series = zeropad(now.getFullYear(),4)
	+ zeropad(now.getMonth()+1,2) // getMonth() is 0-based
	+ zeropad(now.getDate(),2)
	+ "-" + zeropad(now.getHours(),2)
	+ zeropad(now.getMinutes(),2);
    // create a directory named after the series - this will be where all series-related files are kept until they're uploaded
    var seriesDirPromise = new Promise(function(resolve,reject) {
	fileSystem.root.getDirectory(series, {create: true, exclusive: true}, function(dirEntry) {
	    seriesDir = dirEntry;
	    resolve();
	}, function (e) {
	    console.log("Could not create directory for series: " + series + " - adding seconds");
	    fileError(e);
	    series = zeropad(now.getFullYear(),4)
		+ zeropad(now.getMonth()+1,2) // getMonth() is 0-based
		+ zeropad(now.getDate(),2)
		+ "-" + zeropad(now.getHours(),2)
		+ zeropad(now.getMinutes(),2)
		+ "." + zeropad(now.getSeconds(),2);
	    fileSystem.root.getDirectory(series, {create: true, exclusive: true}, function(dirEntry) {
		seriesDir = dirEntry;
		resolve();
	    }, function (e) {
		console.log("Could not create directory for series: " + series);
		seriesDir = null;
		fileError(e);
		resolve();
	    });
	});
    });
    participantAttributes = null;
    elicitedAttributes = [];
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
    maxAttributePageIndex = -1;
    maxRecordingPageIndex = -1;
    console.log("startSession");

    // create pages    
    var lastId = createPreamble();
    fieldCount = 0;
    lastId = createConsentForm(lastId);
    for (s in steps) {
	createStepPage(s); 
    }
    firstPage = settings.preamble?"stepPreamble"
	:settings.consent?"stepConsent"
	:null;

    // insert side panel and button in first page
    var firstPageDiv = document.getElementById(firstPage||"step0");
    if (firstPageDiv.firstChild.getAttribute("data-role") == "header") {
	// add the button to the header instead
	firstPageDiv = firstPageDiv.firstChild;
    }
    lastPageId = "step" + (steps.length - 1);
    if (device.platform != "browser") {
	var controlPanelButton = createControlPanelButton();
	firstPageDiv.insertBefore(controlPanelButton, firstPageDiv.firstChild);
	// ...and the last page
	if (lastPageId != firstPage) {
	    var lastPageDiv = document.getElementById(lastPageId);
	    if (lastPageDiv.firstChild.getAttribute("data-role") == "header") {
		// add the button to the header instead
		lastPageDiv = lastPageDiv.firstChild;
	    }
	controlPanelButton = createControlPanelButton();
	    lastPageDiv.insertBefore(controlPanelButton, lastPageDiv.firstChild);
	}
    }

    document.getElementById("overallProgress").max = steps.length;
    document.getElementById("overallProgress").value = 0;

    // start user interface...
    seriesDirPromise.then(function(val) {
	startUI();
    });
}

// create UI components for the "Next" button
function createNextButton() {
    var nextButton = document.createElement("button");
    nextButton.classList.add("ui-btn");
    nextButton.classList.add("ui-btn-inline");
    nextButton.classList.add("ui-icon-arrow-r");
    nextButton.classList.add("ui-btn-icon-right");
    nextButton.classList.add("ui-corner-all");
    nextButton.title = noTags(settings.resources.next);
    nextButton.appendChild(document.createTextNode(noTags(settings.resources.next)));
    return nextButton;
}

// create UI components for the "Previous" button
function createPreviousButton() {
    var previousButton = document.createElement("button");
    previousButton.classList.add("ui-btn");
    previousButton.classList.add("ui-btn-inline");
    previousButton.classList.add("ui-icon-arrow-l");
    previousButton.classList.add("ui-btn-icon-left");
    previousButton.classList.add("ui-corner-all");
    previousButton.title = noTags(settings.resources.back);
    previousButton.appendChild(document.createTextNode(noTags(settings.resources.back)));
    return previousButton;
}

// create UI components for a control panel button
function createControlPanelButton() {
    var controlPanelButton = document.createElement("a");
    controlPanelButton.href = "#controlPanel";
    controlPanelButton.setAttribute("data-iconpos", "notext");
    controlPanelButton.classList.add("controlPanelButton");
    controlPanelButton.classList.add("ui-btn");
    controlPanelButton.classList.add("ui-shadow");
    controlPanelButton.classList.add("ui-corner-all");
    controlPanelButton.classList.add("ui-btn-icon-notext");
    controlPanelButton.classList.add("ui-icon-bars");
    return controlPanelButton;
}

// tasks can be defined to have a "preamble" text that's displayed at the start
// create UI components for the preamble:
function createPreamble() {
    if (settings.preamble) {
	var nextButton = createNextButton();
	nextButton.id = "nextButtonPreamble";
	nextButton.nextPage = function() { return "step0"; }; // default to starting steps next
	nextButton.onclick = function(e) {
	    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#"+this.nextPage());
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
	controls.appendChild(nextButton);
	stepPage.appendChild(controls);
	document.getElementById("body").appendChild(stepPage);
	pages.push(stepPage);
	return "Preamble";
    }
    return null;
}

// tasks can be defined to have a consent form that the user is required to "sign"
// create UI components for the consent form:
function createConsentForm(lastId) {
    // create signature box
    signature = document.createElement("input");
    signature.type = "text";
    signature.placeholder = noTags(settings.resources.pleaseEnterYourNameHere);
    signature.title = noTags(settings.resources.pleaseEnterYourNameHere);
    signature.className = "signature";
    
    if (settings.consent) {
	var nextButton = createNextButton();
	nextButton.id = "nextButtonConsent";
	nextButton.nextPage = function() { return "step0"; }; // default to starting steps next
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
		$( ":mobile-pagecontainer" ).pagecontainer( "change", "#"+this.nextPage());
	    }
	}

	var stepPage = document.createElement("div");
	stepPage.id = "stepConsent";
	// update previous next button to open this page
	if (lastId) document.getElementById("nextButton" + lastId).nextPage = function() { return "stepConsent"; };
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
	controls.appendChild(nextButton);
	stepPage.appendChild(controls);
	document.getElementById("body").appendChild(stepPage);
	pages.push(stepPage);
	return "Consent";
    } else {
	consent = " ";
	signature.value = " ";
	consentSent = true;
	return lastId;
    }    
}

function createFormRow(fieldDiv, element) {
    if (element.type == "hidden") { // hidden fields don't get their own row
	fieldDiv.appendChild(element);
    } else {	
	var row = document.createElement("div");
	row.className = "form_row";
	row.appendChild(element);
	fieldDiv.appendChild(row);
    }
}

function createPromptUI(step, stepPage) {
    var promptDiv = document.createElement("div");
    promptDiv.setAttribute("role", "main");
    promptDiv.classList.add("promptDiv");
    promptDiv.classList.add("ui-content");
    var h1 = null;
    if (step.title.trim()) {
	var stepTitle = document.createElement("div");
	stepTitle.setAttribute("data-role", "header");
	h1 = document.createElement("h1");
	h1.appendChild(document.createTextNode(step.title));
	stepTitle.appendChild(h1);
	stepPage.appendChild(stepTitle);
    }
    var prompt = null;
    if (step.prompt.trim()) {
	prompt = document.createElement("div");
	prompt.id = "prompt" + step.i;
	prompt.className = "prompt";
	prompt.innerHTML = step.prompt;
	promptDiv.appendChild(prompt);
    }
    var transcript = null;
    if (step.transcript.trim() || step.image) {
	transcript = document.createElement("div");
	transcript.id = "transcript" + step.i;
	transcript.className = "transcript";
	if (step.transcript.trim()) {
	    transcript.innerHTML = "<p>"+step.transcript.replace(/\n/g,"<br>")+"</p>";
	}
	if (step.image) {	    
	    var image = document.createElement(step.image.endsWith(".mp4")?"video":"img");
	    image.id = "image" + step.i;
	    if (step.image.endsWith(".mp4")) {
		image.addEventListener("ended", function(e) {
		    // start recording, if appropriate, and enable 'next'
		    startRecording();
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
    
    step.customizePage = function() {
	if (prompt) {
	    prompt.innerHTML = substituteValues(step.prompt);
	}
	if (h1) {
	    h1.replaceChild(document.createTextNode(substituteValues(step.title)), h1.firstChild);
	}
    }
    stepPage.appendChild(promptDiv);
}

function createAttributeUI(step, stepPage) {
    elicitedAttributes.push(step);
    
    var fieldDiv = document.createElement("div");
    fieldDiv.setAttribute("role", "main");
    fieldDiv.classList.add("formDiv");
    fieldDiv.classList.add("ui-content");
    var h1 = null;
    if (step.title.trim()) {
	var stepTitle = document.createElement("div");
	stepTitle.setAttribute("data-role", "header");
	h1 = document.createElement("h1");
	h1.appendChild(document.createTextNode(step.title));
	stepTitle.appendChild(h1);
	stepPage.appendChild(stepTitle);
    }
    var description = null;
    if (step.prompt)
    {
	description = document.createElement("div");
	description.className = "form_description";
	description.innerHTML = step.prompt;
	createFormRow(fieldDiv, description);
    }
    
    var input;
    if (step.type == "select")
    {
	if (step.style.match(/radio/)) {
	    input = document.createElement("input");
	    input.type = "hidden";
	    var optionsDiv = document.createElement("div");
	    optionsDiv.classList.add("form_options");
	    if (step.options.length > 5) {
		optionsDiv.classList.add("many_form_options");
	    }
	    // and add a radio button for each option
	    for (o in step.options)
	    {
		var option = step.options[o];
		var optionLabel = document.createElement("label");
		var radio = document.createElement("input");
		if (step.style.match(/multiple/)) {
		    radio.type = "checkbox";
		} else {
		    radio.type = "radio";
		}
		radio.name = step.attribute + "_options";
		radio.value = option.value;
		if (step.style.match(/multiple/)) {
		    radio.onclick = function(e) {
			var val = this.value + "\n";
			if (this.checked) {
			    // add the value
			    input.value += val;
			} else {
			    // remove the value
			    input.value = input.value.replace(val, "");
			}
		    };
		} else {
		    radio.onclick = function(e) {
			input.value = this.value;
		    };
		}
		optionLabel.appendChild(radio);
		optionLabel.appendChild(document.createTextNode(option.description));
		optionsDiv.appendChild(optionLabel);
	    }	    
	    createFormRow(fieldDiv, optionsDiv);
	} else { // not a radio button, so use the select widget
	    input = document.createElement("select");
	    if (step.style.match(/multiple/)) {
		input.multiple = true;
	    }
	    input.setAttribute("data-native-menu", false);
	    for (o in step.options)
	    {
		var option = step.options[o];
		var selectOption = document.createElement("option");
		selectOption.value = option.value;
		selectOption.appendChild(document.createTextNode(option.description));
		input.appendChild(selectOption);
	    }
	}
    } else {
	input = document.createElement("input");
	input.autofocus = true;
	if (step.type == "integer" || step.type == "number") {
	    input.size = 4;
	    input.type = "number";
	} else if (step.type == "date") {
	    input.type = "date";
	    // default to today
	    var now = new Date();
	    input.value = zeropad(now.getFullYear(),4)
		+ "-" + zeropad(now.getMonth()+1,2) // getMonth() is 0-based
		+ "-" + zeropad(now.getDate(),2);
	} else if (step.type == "time") {
	    input.type = "time";
	} else if (step.type == "datetime") {
	    input.type = "datetime-local";
	} else if (step.type == "boolean") {
	    if (step.style.match(/radio/)) {
		input = document.createElement("input");
		input.type = "hidden";
		// and add a radio button for each option
		var optionsDiv = document.createElement("div");
		optionsDiv.className = "form_options";
		
		var optionLabel = document.createElement("label");
		var radio = document.createElement("input");
		radio.type = "radio";
		radio.name = step.attribute + "_options";
		radio.value = "1";
		radio.onclick = function(e) {
		    input.value = this.value;
		};
		optionLabel.appendChild(radio);
		optionLabel.appendChild(document.createTextNode(noTags(settings.resources.yes)));
		optionsDiv.appendChild(optionLabel);
		    
	    	optionLabel = document.createElement("label");
		radio = document.createElement("input");
		radio.type = "radio";
		radio.name = step.attribute + "_options";
		radio.value = "0";
		radio.onclick = function(e) {
		    input.value = this.value;
		};
		optionLabel.appendChild(radio);
		optionLabel.appendChild(document.createTextNode(noTags(settings.resources.no)));
		optionsDiv.appendChild(optionLabel);
		
		createFormRow(fieldDiv, optionsDiv);
	    } else {
		input.type = "checkbox";
	    }
	}
	else
	{
	    input.type = "text";
	}
	input.placeholder = step.title;
    }
    input.className = "form_value";
    input.title = step.title;
    input.id = step.attribute;
    input.name = step.attribute;
    createFormRow(fieldDiv, input);
    step.input = input;
    
    step.customizePage = function() {
	input.placeholder = substituteValues(step.title);
	input.title = input.placeholder;
	if (h1) {
	    h1.replaceChild(document.createTextNode(substituteValues(step.title)), h1.firstChild);
	}
	if (description) {
	    description.innerHTML = substituteValues(step.prompt);
	}
    }
    stepPage.appendChild(fieldDiv);
}

function transcriptHeader() {
    var aTranscript = [];
    // meta-data
    aTranscript.push("task="+settings.task_name+"\r\n");
    aTranscript.push("app="+appName+"\r\n");
    aTranscript.push("appVersion="+appVersion+"\r\n");
    aTranscript.push("appPlatform="+navigator.platform+"\r\n");
    aTranscript.push("appDevice="+device.platform+" "+device.model+"\r\n");
    aTranscript.push("creation_date="+seriesTime+"\r\n");
    // attributes specified by the participant
    for (f in elicitedAttributes)
    {
	var field = elicitedAttributes[f];
	var input = field.input;
	var name = field.attribute;
	var value = $("#"+field.attribute).val();
	if (value) {
	    console.log(field.attribute+"="+value);
	    values = value.split("\n"); // may be multiple lines - split them...
	    for (v in values) {
		if (values[v]) {
		    aTranscript.push(field.attribute+"="+values[v]+"\r\n");
		}
	    } // next line
	}
    } // next field
    return aTranscript;
}

// tasks always have a number of "steps", each of which displays a prompt to the user
// and may record audio or ask for an attribute value
// create UI components for a step:
function createStepPage(i) {
    var step = steps[i];
    step.i = i;
    if (step.parent_id) {
	step.parent = stepsIndex[step.parent_id];
    }    

    var nextButton = createNextButton();
    nextButton.id = "nextButton" + i;
    nextButton.nextPage = function() { return i+1; }; // default to the next step
    nextButton.onclick = function(e) {
	if (nextButton.style.opacity == "0.25") return; // disabled button
	
	if (!this.validate // either there's no validation
	    || this.validate()) { // or validation succeeds
	    var s = this.nextPage();
	    var nextStep = steps[s];
	    var nextStepAction = function() {
		$( ":mobile-pagecontainer" ).pagecontainer( "change", "#step"+s);
	    }
	    if (nextStep.record == ELICIT_AUDIO) { // next step will record
		// we'll first check microphone permission
		nextStepAction = function() { testForAudioThenGoToPage("step"+s, "step"+i); }
	    }
	    if (step.record != ELICIT_AUDIO) { // this step didn't record audio
		// go immediately to next step		
		nextStepAction();
	    } else { // this step recorded audio
		// go to the next step after a short delay,  so that if the click
		// slightly before finishing the last word, the end of it is recorded
		// this also gives the recording plugin a chance for its buffer to empty.
		window.setTimeout(function() { nextStepAction(); }, 500);
	    } // next step doesn't record
	}
    }
    if (step.suppress_next || i >= steps.length-1) { // no next if suppressed or last step
	nextButton.style.display = "none";
    } else if (!step.suppress_next && step.next_delay_seconds > 0) {
	 // initially disabled, if there's a delay
	nextButton.style.opacity = "0.25";
    }
    
    var previousButton = null;
    if (i > 0) { // not for the first
	// update previous step's next button
	document.getElementById("nextButton" + (i-1)).nextPage = function() {
	    if (document.getElementById("step" + i).canShow()) {
		return i;
	    } else { // not met, so return what our next page would be
		return nextButton.nextPage();
	    }
	};

	// add a back button
	if (steps[i].record != ELICIT_AUDIO // but not for pages doing recordings
	    && steps[i-1].record != ELICIT_AUDIO // and not for pages following recordings
	    && i < steps.length-1) { // and not for the last page
	    previousButton = createPreviousButton();
	    previousButton.id = "previousButton" + i;
	    previousButton.previousPage = function() {
		if (document.getElementById("step" + (i-1)).canShow()) {
		    return i-1;
		} else { // not met, so return what the previous page's previous page would be
		    var penultimateButton = document.getElementById("previousButton" + (i-1));
		    if (penultimateButton) {
			return penultimateButton.previousPage();
		    } else {
			return null;
		    }
		}
	    };
	    previousButton.onclick = function(e) {
		var s = this.previousPage();
		$( ":mobile-pagecontainer" ).pagecontainer( "change", "#step"+s, { reverse: true });
	    }
	} // add back button
    } // not first step

    var stepPage = document.createElement("div");
    stepPage.id = "step"+i;
    if (!step.condition_attribute) { // can always show the page
	stepPage.canShow = function() {
	    if (!step.parent || document.getElementById("step" + step.parent.i).canShow()) {
		step.customizePage();
		return true;
	    } else { // parent invisible, so this one is too
		return false;
	    }
	}; 
    } else { // can only show the page when the condition is met
	stepPage.canShow = function() {
	    if (!step.parent || document.getElementById("step" + step.parent.i).canShow()) {
		// condition_value is a regular expression, so that multiple possible values can be matched
		var pattern = new RegExp("^"+step.condition_value+"$", "m");
		if (pattern.test($("#"+step.condition_attribute).val())) {
		    step.customizePage();
		    return true;
		} else {
		    return false;
		}
	    } else { // parent invisible, so this one is too
		return false;
	    }
	};
    }
    stepPage.className = "step";
    stepPage.stepIndex = i;
    stepPage.setAttribute("data-role", "page");
    if (step.record == ELICIT_ATTRIBUTE && step.attribute) { // field value
	createAttributeUI(step, stepPage);
	maxAttributePageIndex = i;
	if (step.attribute && step.validation_javascript) {	
	    var validationFunction = "validate_"+step.attribute.replace(/[^a-zA-Z0-9_]/g,"_")+" = function(value) {\nvar field = '"+step.attribute.replace(/'/g,"\\'")+"';\n"+step.validation_javascript+"\n return null;\n};";
	    //console.log("custom validation for " + step.attribute + ": " + validationFunction);
	    nextButton.customValidate = eval(validationFunction);
	}
	nextButton.validate = function(e) {
	    var value = $("#"+step.attribute).val();
	    // validate before continuing
	    if (value.length == 0)
	    {
		if (step.title) {
		    alert(noTags(settings.resources.pleaseSupplyAValueFor) + " " + substituteValues(step.title));
		} else {
		    alert(noTags(settings.resources.pleaseSupplyAnAnswer));
		}
		return false;
	    }
	    if (nextButton.customValidate) {
		var error = nextButton.customValidate(value);
		if (error) {
		    alert(error);
		    return false;
		}
	    }
	    return true;
	}
    } else { // recording or instructions
	createPromptUI(step, stepPage);
    } // recording or instructions

    var controls = document.createElement("div");
    controls.className = "controls";
    if (previousButton) {
	controls.appendChild(previousButton);
    }
    controls.appendChild(nextButton);
    stepPage.appendChild(controls);

    pages.push(stepPage);
    document.getElementById("body").appendChild(stepPage);
}

// test recording audio is working
function testForAudioThenGoToPage(nextPageId, previousPageId) {
    console.log("testForAudioThenGoToPage " + nextPageId);
    document.getElementById("testAudioPage").nextPageId = nextPageId;
    document.getElementById("testAudioPage").previousPageId = previousPageId;
    document.getElementById("testAudioPreviousButton").onclick = function () {
	$( ":mobile-pagecontainer" ).pagecontainer( "change", "#" + previousPageId, { reverse: true }); };
    if (!previousPageId) {
	$("#testAudioPreviousButton").hide();
    } else {
	$("#testAudioPreviousButton").show();
    }
    
    if (audioRecorder) {
	hideAudioMessage();
	return;
    }

    if (window.cordova && window.audioinput && device.platform != "browser") {
	// use cordova plugin
	console.log("using cordova plugin for audio capture");
	audioRecorder = new CordovaAudioInput();
	// Subscribe to audioinput events
        window.addEventListener('audioinput', function(e) { audioRecorder.onAudioInputCapture(e); }, false);
        window.addEventListener('audioinputerror', function(e) { audioRecorder.onAudioInputError(e); }, false);
	
	audioRecorder.getUserPermission();
	
    } else {
	
	// use web audio
	window.AudioContext = window.AudioContext || window.webkitAudioContext;
	if (!window.AudioContext) {
	    showAudioMessage(settings.resources.webAudioNotSupported);
	} else {
	    initAudio();
	}
    }
}

function showAudioMessage(message) {
    $("#testAudioTitle").html(noTags(settings.resources.webAudioWarningTitle));
    $("#testAudioPreviousButton").html(noTags(settings.resources.back));
    $("#testAudioMessage").html(message);
    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#testAudioPage"); 
}
function hideAudioMessage() {
    var nextPageId = document.getElementById("testAudioPage").nextPageId;
    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#"+nextPageId);
}

// callback for web audio (browser platform)
function initAudio() {
    console.log("initAudio");
    audioContext = new window.AudioContext();
    showAudioMessage(settings.resources.pleaseEnableMicrophone, 1000);
    if (!navigator.getUserMedia)
        navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (!navigator.cancelAnimationFrame)
        navigator.cancelAnimationFrame = navigator.webkitCancelAnimationFrame || navigator.mozCancelAnimationFrame;
    if (!navigator.requestAnimationFrame)
        navigator.requestAnimationFrame = navigator.webkitRequestAnimationFrame || navigator.mozRequestAnimationFrame;
    
    if (!navigator.getUserMedia) 
    {
	showAudioMessage(settings.resources.webAudioNotSupported);
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
	    showAudioMessage(settings.resources.getUserMediaFailed + "<p>" + e + "</p>");
	    console.log(e);
        });
}

// takes a label template that might contain ${fieldName} fields, and returns the template with
// the named fields substituted for their values
// - e.g. "What did you do ${diary_date}?" might be returned as "What did you do yesterday?"
function substituteValues(template) {
    if (/\$\{.+\}/.test(template)) { // if there are any fields
	for (f in elicitedAttributes) {
	    var step = elicitedAttributes[f];
	    var input = step.input;
	    if (input) {
		var value = $("#"+step.attribute).val();
		// if the value is a date, format it
		if (input.type == "date") {
		    value = friendlyDate(value);
		}
		var patt = new RegExp("\\$\\{"+step.attribute+"\\}", "g");
		template = template.replace(patt, value)
	    }
	} // next transcript field 
    }
    return template;
}
function friendlyDate(isoDate) {
    // is it today?
    var now = new Date();
    var today = zeropad(now.getFullYear(),4)
	+ "-" + zeropad(now.getMonth()+1,2) // getMonth() is 0-based
	+ "-" + zeropad(now.getDate(),2);
    if (isoDate == today) return "today";

    // is it yesterday?
    now.setDate(now.getDate() - 1)
    var yesterday = zeropad(now.getFullYear(),4)
	+ "-" + zeropad(now.getMonth()+1,2) // getMonth() is 0-based
	+ "-" + zeropad(now.getDate(),2);
     if (isoDate == yesterday) return "yesterday";

    // return the date
    var parts = isoDate.split("-");
    var date = new Date(parts[0], parts[1]-1, parts[2]); // month is 0-based
    return "on " + date.toDateString();
}

// determine the participant for the session
// - their participant ID, if they had to log in with one
// - a new ID if not
function newParticipant()
{
    participantAttributes = {};
    participantAttributes["newSpeakerName"] = settings.task_name+"-{0}";
    participantAttributes["content-type"] = "application/json";
    participantAttributes["corpus"] = settings.corpus;
    participantAttributes["transcriptType"] = settings.transcriptType;
    if (username) { // already know the participant ID
	participantAttributes.id = username;
    }
    // save the attributes to a file
    seriesDir.getFile("participant.json", {create: false}, function(fileEntry) {
	console.log("participant file already exists, so we'll use it");
    }, function(e) {
	// file doesn'e exist, so create it
	seriesDir.getFile("participant.json", {create: true}, function(fileEntry) {
	    fileEntry.createWriter(function(fileWriter) {		    
		fileWriter.onwriteend = function(e) {
		    if (username) { // already know the participant ID
			console.log('Wrote ' + fileEntry.fullPath + ' username as ID');
		    } else {
			console.log('Wrote ' + fileEntry.fullPath + ' with ID');
			getNewParticipantId(participantAttributes);
		    }
		};		    
		fileWriter.onerror = function(e) {
		    console.log('Write failed for '+fileEntry.fullPath+': ' + e.toString());
		    fileError(e);
		};		    
		var blob = new Blob([JSON.stringify(participantAttributes)], {type: 'application/json'});
		console.log("about to write: " + JSON.stringify(participantAttributes));
		fileWriter.write(blob);
	    }, function(e) {
		console.log("Could not create writer for " + fileEntry.fullPath);
		fileError(e);
	    }); // createWriter
	}, function(e) {
	    console.log("Could not get participant file for series " + series);
	    fileError(e);
	}); // getFile (create)
    }); // getFile (don't create)

}

// callback once we've written the participant file
function getNewParticipantId(participantAttributes) {
    var query = "";
    for (k in participantAttributes) {
	if (query) query += "&";
	query += encodeURIComponent(k) + "=" + encodeURIComponent(participantAttributes[k]);
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

// start recording
function startRecording() {
    if (steps[iCurrentStep] && steps[iCurrentStep].record == ELICIT_AUDIO) {
	
	// start recording
	if (!audioRecorder) return;
	// only restart the recorder after the last WAV file has been generated
	waitingForWav.then(function() {
	    audioRecorder.clear();
	    audioRecorder.record();
	    
	    // and ensure they don't go over the max time
	    // (plus a little extra, to ensure we get the last audio out of the buffer)
	    startTimer(steps[iCurrentStep].max_seconds + 0.2, timeoutRecording);
	});

    	// reveal that we're recording
	document.getElementById("recording").className = "active";

	// enable next button
	if (!steps[iCurrentStep].suppress_next && !steps[iCurrentStep].next_delay_seconds > 0) {
	    document.getElementById("nextButton" + iCurrentStep).style.opacity = "1";
	}
	
    }
}

function onPageChange( event, ui ) {
    if (ui.toPage["0"] && "stepIndex" in ui.toPage["0"]) {
	if (!participantAttributes) {
	    console.log("newParticipant...");
	    newParticipant();
	}
	
	if (steps[iCurrentStep] && steps[iCurrentStep].record == ELICIT_AUDIO) {
	    console.log("last step " + iCurrentStep + " was recorded");
	    // stop recording and send the last phrase to the server
	    stopRecording();
	}
	
	iCurrentStep = parseInt(ui.toPage["0"].stepIndex);
	var step = steps[iCurrentStep];
	$("#overallProgress").val(iCurrentStep+1);

	if (step.image.endsWith(".mp4")) { // video
	    // disable next button
	    document.getElementById("nextButton" + iCurrentStep).style.opacity = "0.25";
	    // start playing
	    document.getElementById("image" + iCurrentStep).play();
	}
	
	if (steps.length - 1 > iCurrentStep) { // not the last step
	    // delay showing next button?
	    if (step.next_delay_seconds > 0) {
		// disable next button
		document.getElementById("nextButton" + iCurrentStep).style.opacity = "0.25";
		console.log("Next button delay " + step.next_delay_seconds + " step " + iCurrentStep);
		// and enable it again after the delay
		window.setInterval(function() {
		    console.log("Next button delay finished");
		    // enable next button
		    document.getElementById("nextButton" + iCurrentStep).style.opacity = "1";
		}, step.next_delay_seconds * 1000);
	    }
	    
	    // recording?
	    if (step.record == ELICIT_AUDIO) {
		// steps w. video start recording after playback, others start recording immediately
		if (!step.image || !step.image.endsWith(".mp4")) { // not video
		    // start recording straight away
		    startRecording();
		}
	    } // recording

	    if (step.countdown_seconds > 0) { // countdown
		// disable next button
		document.getElementById("nextButton" + iCurrentStep).style.opacity = "0.25";
		// hide prompts
		$("#prompt" + iCurrentStep).hide();
		$("#transcript" + iCurrentStep).hide();
		// hide the fact that we're recording
		document.getElementById("recording").className = "inactive";
		killTimer();
		startTimer(step.countdown_seconds, function() {
		    if (!step.suppress_next && step.next_delay_seconds == 0) {
			// enable next button
			document.getElementById("nextButton" + iCurrentStep).style.opacity = "1";
		    }
		    $("#prompt" + iCurrentStep).show();
		    $("#transcript" + iCurrentStep).show();
		    if (step.record == ELICIT_AUDIO) {
			// reveal that we're recording
			document.getElementById("recording").className = "active";
			// (plus a little extra, to ensure we get the last audio out of the buffer)
			startTimer(step.max_seconds + 0.2, timeoutRecording);
		    }
		}, true);
	    } // countdown
	} else { // the last step
	    finished();
	}

    }
}

function startUI() {    
    $( ":mobile-pagecontainer" ).pagecontainer( "change", "#" + (firstPage||"step0"));
}

// timeout recording
function timeoutRecording() {
    console.log("timeoutRecording");
    // move to the next step
    $("#nextButton" + iCurrentStep).click();
} 

// use a Promise to ensure that recording isn't restarted before the last WAV file is generated (if any)
var waitingForWav = new Promise(function(resolve,reject) { resolveWavPromise = resolve; resolve(); });
var resolveWavPromise = null;

// stop recording
function stopRecording() {
    console.log("stopRecording");
    killTimer();
    if (steps[iCurrentStep]) {
	if (steps[iCurrentStep].record == ELICIT_AUDIO) {
	    iRecordingStep = iCurrentStep;
	    // stop recording
	    waitingForWav = new Promise(function(resolve,reject) {
		resolveWavPromise = resolve;
		audioRecorder.stop();
		audioRecorder.getBuffers( gotBuffers );
	    });
	    document.getElementById("recording").className = "inactive";
	    document.getElementById("nextButton" + iCurrentStep).style.opacity = "0.25";
	} else {
	    document.getElementById("nextButton" + iCurrentStep).style.opacity = "1";
	    // clear timer countdown
	    if (countdownContext) {
		countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height)
	    }
	}
    }
} 

// called when all steps are complete
function finished() {
    console.log("finished");
    if (countdownContext) {
	countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height)
    }

    try {  audioRecorder.stop(); } catch(x) {}

    console.log("recording stopped");

    // if there are attributes that weren't uploaded with a recording
    if (maxAttributePageIndex > maxRecordingPageIndex) {
	// upload a dummy transcript to capture the attributes
	
	var sName = series;
	var aTranscript = transcriptHeader();
	// the transcript
	aTranscript.push("{No recording} -");
	var oTranscript = new Blob(aTranscript, {type : 'text/plain'});

	// save the transcript
	console.log("getting file " + sName);
	seriesDir.getFile(sName + ".txt", {create: true}, function(fileEntry) {
	    console.log("got file " + sName);
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
    } // no recordings

    // save a sentinel file to mark the task as finished
    var now = new Date();
    var finishTime = zeropad(now.getFullYear(),4)
	+ "-" + zeropad(now.getMonth()+1,2) // getMonth() is 0-based
	+ "-" + zeropad(now.getDate(),2)
	+ " " + zeropad(now.getHours(),2)
	+ ":" + zeropad(now.getMinutes(),2);
    var sentinel = {
	task : settings.task_name,
	series : series,
	description : tasks[settings.task_name].description,
	app : appName,
	appVersion : appVersion,
	appPlatform : navigator.platform,
	appDevice : device.platform+" "+device.model,
	creation_date : seriesTime,
	finish_date : finishTime
    }
    var oSentinel = new Blob([JSON.stringify(sentinel)], {type : 'application/json'});
    seriesDir.getFile("series.json", {create: true}, function(fileEntry) {
	console.log("got sentinel file...");
	fileEntry.createWriter(function(fileWriter) {		    
	    console.log("writer created...");
	    fileWriter.onwriteend = function(e) { console.log("series.json completed."); }
	    fileWriter.onerror = function(e) { console.log("series.json failed: " + e.toString()); };
	    fileWriter.write(oSentinel);
	}, function(e) {
	    console.log("Could not create writer for series.log");
	    fileError(e);
	}); // createWriter .log
    }, function(e) {
	console.log("Could not get series.json: " + e.toString());
	fileError(e);
    }); // getFile .log
	
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
    if (!window.cordova || !window.audioinput || device.platform == "browser") {
	waitingForWav.then(function() { // only after final WAV file is generated
	    audioRecorder = null;
	});
    }
    audioStream = null;

    if (participantAttributes.id) {
//TODO	$("#prompt").html("<p>"+steps[iCurrentStep-1].prompt.replace(/\n/g,"<br>")+"</p>"
//			  + settings.resources.yourParticipantIdIs
//			  + "<p id='participantId'>"+participantAttributes.id+"</p>");
    }
//    document.getElementById("nextButton" + iCurrentStep).style.opacity = "1";
//    $("#nextLabel").html(noTags(settings.resources.startAgain));
//    document.getElementById("nextButton" + iCurrentStep).title = noTags(settings.resources.startAgain);
	
}

// a timer are used to count down before a prompt is displayed,
// and to stop recording when the maximum time is reached ...

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
    countdownReverse = false;
    if (countdownContext) {
	countdownContext.clearRect(0, 0, countdownCanvas.width, countdownCanvas.height)
    }
}

// callback that animates the count down
function timerTick() {
    var now = new Date().getTime();

    // paint timer
    var totalDuration = countdownEnd - countdownStart;
    var soFar = (now - countdownStart) / totalDuration;
    if (((soFar > 0.75) || (countdownEnd - now <= 5000))
	&& document.getElementById("recording").className == "active") {
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
// callback from uploader with progress of all uploads
function uploadsProgress(state, message) {
    console.log("uploadsProgress...");
    var uploads = state.uploads;
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
    if (/*iCurrentStep < 0 || */iCurrentStep >= steps.length - 1) {
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

    finishedTasks = state.finishedTasks;
    console.log("finishedTasks...");
    var ul = document.getElementById("finishedTasksList");
    // remove all children
    while (ul.children.length > 0) ul.removeChild(ul.firstChild);
    
    // now add the current ones
    for (s in finishedTasks) {
	var task = finishedTasks[s];
	console.log("uploads " + (task.description||task.task) + " " + task.finish_date + " " + finishedTasks[s].toUpload);
	var id = "finished-" + (task.series||task.finish_date.replace(/[^0-9]/g,"_"));
	// create an entry for it
	var li = document.createElement("li");
	li.id = id;
	li.classList.add("ui-btn");
	li.classList.add("ui-btn-icon-left");
	// add it to the top of the list
	if (task.toUpload > 0) { // uploading
	    li.classList.add("ui-icon-recycle");
	} else { // all uploaded
	    li.classList.add("ui-icon-check");
	}
	// update files remaining indicator
	var finished = new Date(task.finish_date);
	var now = new Date();
	var finishedLabel = zeropad(finished.getMonth()+1,1) // getMonth() is 0-based
	    + "/" + zeropad(finished.getDate(),2)
	    + " " + zeropad(finished.getHours(),2)
	    + ":" + zeropad(finished.getMinutes(),2);
	// if it's today
	if (finished.toDateString() == now.toDateString()) {
	    // just the time is fine
	    finishedLabel = zeropad(finished.getHours(),2)
		+ ":" + zeropad(finished.getMinutes(),2);
	}
	var label = (task.description||task.task) + " " + finishedLabel;
	li.appendChild(document.createTextNode(label));
	if (!ul.firstChild) {
	    ul.appendChild(li);
	} else {
	    ul.insertBefore(li, ul.firstChild);
	}	
    } // next finished tasks

    if (ul.firstChild) { // insert a heading
	var li = document.createElement("li");
	li.id = "history";
	li.classList.add("ui-btn");
	li.classList.add("ui-btn-icon-left");
	li.classList.add("ui-icon-calendar");
	li.appendChild(document.createTextNode(noTags(settings.resources.history)));
	ul.insertBefore(li, ul.firstChild);
    }

}
// Adding a unique query string ensures the worker is loaded each time, ensuring it starts (in Firefox)

// callback from recorder invoked when recordin is finished
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

// callback invoked when audio data has been converted to WAV
function doneEncoding( blob ) {
    wav = blob;
    if (resolveWavPromise) resolveWavPromise(); // got WAV file, so allow next recording to start
    if (steps.length > iCurrentStep) {
	uploadRecording();
    }
}

// WAV data is ready, so save it to a file with a transcript file, so the uploader will find it
function uploadRecording() {
    if (!wav) return;
    // set the max recording index to the index of an actual recording
    // (rather than computing from configuration, as recordings may have been skipped)
    maxRecordingPageIndex = iRecordingStep; 
    var sName = series + "-" + zeropad(++recIndex, transcriptIndexLength);
    var aTranscript = transcriptHeader();
    // step-specific tags
    aTranscript.push(steps[iRecordingStep].tags + "\r\n");    
    // the transcript
    aTranscript.push("{" + noTags(steps[iRecordingStep].prompt).replace(/[\n\r]+/g," ") + "} " + steps[iRecordingStep].transcript);
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
}

// callback by web audio during recording (browser platform)
function convertToMono( input ) {
    var splitter = audioContext.createChannelSplitter(2);
    var merger = audioContext.createChannelMerger(2);

    input.connect( splitter );
    splitter.connect( merger, 0, 0 );
    splitter.connect( merger, 0, 1 );
    return merger;
}

// callback by web audio when access to the microphone is gained (browser platform)
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

    // pump through zero gain so that the microphone input doesn't play out the speakers causing feedback
    zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0.0;
    inputPoint.connect( zeroGain );
    zeroGain.connect( audioContext.destination );

    // hide testAudio dialog
    hideAudioMessage();
    //    startUI();
}


// strips tags from HTML
function noTags(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    return (div.textContent || div.innerText || "").trim();
}

// zero-pads a number to a string with a given length
function zeropad(num, size) {
    var s = "000000000" + num;
    return s.substr(s.length-size);
}

