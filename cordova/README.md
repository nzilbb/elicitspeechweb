# elicitspeechweb
## Cordova mobile app version

### Prerequisites:

1. Node.js and npm

 https://nodejs.org/en/download/
 
2. Cordova:

 sudo npm install -g cordova
 
3. For Android, JDK and the Android SDK

 https://cordova.apache.org/docs/en/latest/guide/platforms/android/index.html
 
3. For iOS, XCode

 https://cordova.apache.org/docs/en/latest/guide/platforms/ios/index.html

### First time build:

The source code in the repository does not include any platforms or
plugins, and these must be installed via npm after checking out this
code.

The setup.sh script performs all tasks required to install plugins,
and the "browser" and "android" platforms, so for the first-time
build:

1. Change directory to the "cordova" subdirectory, e.g.:

 cd ~/elicitspeechweb/cordova

2. Run the setup script:

 ./setup.sh

### Projects

The downloads speech elicitation task definitions from a LaBB-CAT
server, and then uploads the resulting recordings to that server. The
address of the server, the tasks to run, and the app icon are all
defined by the "project" you have installed before building the app.

Available projects are in the "projects" subdirectory. To create a new
project:

1. Create a new subdirectory in "projects":

 mkdir projects/myproj

2. Copy into it the files from the "default" project:

 cp projects/default/* projects/myproj

3. Edit the files in your new subdirectory to suit your project
configuration.

4. Select your new project for building:

 ./set-project.sh myproj


