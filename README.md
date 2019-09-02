# elicitspeechweb

A cross-platform (iOS, Android, browser) app for speech elicitation tasks. Currenty integrates with LaBB-CAT, where you can define a 'task' as a series of 'steps' that display prompts and text for the participant to read aloud, or ask meta-data questions. 

![Screenshot of Cordova app](https://raw.githubusercontent.com/nzilbb/elicitspeechweb/master/ElicitSpeechWeb.png)

## features

- display paginated textual instructions and prompts
- ask questions; answers can be typed text, numbers, checkboxes, selection from a list, dates/times
- arbitrary validation of input is possible (e.g check that one date is after another, etc.)
- steps can be shown contingent on the answers to previous questions
- record participant's speech
- upload data to a [LaBB-CAT](https://labbcat.canterbury.ac.nz) corpus
- stimuli can be text, images, or video
- stimuli can be randomly sampled from a list

For building Cordova app, see cordova/README.md

(Previously also supported building a Chrome app version, but Chrome apps are now deprecated)

