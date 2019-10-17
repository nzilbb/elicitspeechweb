if [ -d "projects/$1" ]; then
    cp projects/$1/config.xml .
    cp projects/$1/config.js www/js/
    cp projects/$1/icon.png www/img/
    cp projects/$1/splash.png www/img/
    
    echo Configuration files for $1 copied

    cp www/img/icon.png res/android/icon.png
    cp www/img/icon.png res/android/mipmap-ldpi/ic_launcher_foreground.png
    sips -z 36 36 res/android/mipmap-ldpi/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-hdpi/ic_launcher_foreground.png
    sips -z 162 162 res/android/mipmap-hdpi/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-hdpi-v26/ic_launcher_foreground.png
    sips -z 162 162 res/android/mipmap-hdpi-v26/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-ldpi-v26/ic_launcher_foreground.png
    sips -z 36 36 res/android/mipmap-ldpi-v26/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-mdpi/ic_launcher_foreground.png
    sips -z 108 108 res/android/mipmap-mdpi/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-mdpi-v26/ic_launcher_foreground.png
    sips -z 108 108 res/android/mipmap-mdpi-v26/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-xhdpi/ic_launcher_foreground.png
    sips -z 216 216 res/android/mipmap-xhdpi/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-xhdpi-v26/ic_launcher_foreground.png
    sips -z 216 216 res/android/mipmap-xhdpi-v26/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-xxhdpi/ic_launcher_foreground.png
    sips -z 324 324 res/android/mipmap-xxhdpi/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-xxhdpi-v26/ic_launcher_foreground.png
    sips -z 324 324 res/android/mipmap-xxhdpi-v26/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-xxxhdpi/ic_launcher_foreground.png
    sips -z 432 432 res/android/mipmap-xxxhdpi/ic_launcher_foreground.png
    cp www/img/icon.png res/android/mipmap-xxxhdpi-v26/ic_launcher_foreground.png
    sips -z 432 432 res/android/mipmap-xxxhdpi-v26/ic_launcher_foreground.png
    
    echo Icons for $1 generated
    
else
    echo $1 is not a valid project
fi
