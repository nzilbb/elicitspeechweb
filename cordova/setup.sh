if [ ! -f "config.xml" ]; then
    echo "Using default project..."
    ./set-project.sh default
fi

echo "Installing plugins..."
./install-plugins.sh

echo "Adding browser platform..."
cordova platform add browser

echo "Adding Android platform..."
cordova platform add android

# The local notifications plugin needs to be updated for the latest Cordova API, but the developer
# hasn't made the required changes yet. In the meantime, we get the developer's code, and patch
# it with the required changes.
# https://github.com/katzer/cordova-plugin-local-notifications
echo "Patching notifications plugin..."
cp patch/LocalNotification.java platforms/android/src/de/appplant/cordova/plugin/localnotification/

# The file plugin always requests persistent storage on Chrome, thereby 
# displaying an alert to the user asking for permission at page load time.
# This is alarming for the user, and we don't need persistent storage, so the
# patch removes the persistent storage request.
echo "Patching file plugin..."
cp patch/Preparing.js plugins/cordova-plugin-file/www/browser/

echo "Done."
echo "To list available project configurations:"
echo " ls projects"
echo "To use a specific project configuration:"
echo " ./set-project.sh <project-name>"
echo "To run the app in a browser:"
echo " cordova run browser"
echo "To run the app on Android:"
echo " cordova run android"
