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
    
    cp www/img/icon.png res/ios/icon-20@.png
    sips -z 20 20 res/ios/icon-20@.png
    cp www/img/icon.png res/ios/icon-20@2x.png
    sips -z 40 40 res/ios/icon-20@2x.png
    cp www/img/icon.png res/ios/icon-20@3x.png
    sips -z 60 60 res/ios/icon-20@3x.png
    cp www/img/icon.png res/ios/icon-29@.png
    sips -z 29 29 res/ios/icon-29@.png
    cp www/img/icon.png res/ios/icon-29@2x.png
    sips -z 58 58 res/ios/icon-29@2x.png
    cp www/img/icon.png res/ios/icon-29@3x.png
    sips -z 87 87 res/ios/icon-29@3x.png
    cp www/img/icon.png res/ios/icon-40@.png
    sips -z 40 40 res/ios/icon-40@.png
    cp www/img/icon.png res/ios/icon-40@2x.png
    sips -z 80 80 res/ios/icon-40@2x.png
    cp www/img/icon.png res/ios/icon-40@3x.png
    sips -z 120 120 res/ios/icon-40@3x.png
    sips -z 50 50 res/ios/icon-50@.png
    cp www/img/icon.png res/ios/icon-50@2x.png
    sips -z 100 100 res/ios/icon-50@2x.png
    cp www/img/icon.png res/ios/icon-50@3x.png
    sips -z 150 150 res/ios/icon-50@3x.png
    cp www/img/icon.png res/ios/icon-57@.png
    sips -z 57 57 res/ios/icon-57@.png
    cp www/img/icon.png res/ios/icon-57@2x.png
    sips -z 114 114 res/ios/icon-57@2x.png
    cp www/img/icon.png res/ios/icon-57@3x.png
    sips -z 171 171 res/ios/icon-57@3x.png
    cp www/img/icon.png res/ios/icon-60@.png
    sips -z 60 60 res/ios/icon-60@.png
    cp www/img/icon.png res/ios/icon-60@2x.png
    sips -z 120 120 res/ios/icon-60@2x.png
    cp www/img/icon.png res/ios/icon-60@3x.png
    sips -z 180 180 res/ios/icon-60@3x.png
    cp www/img/icon.png res/ios/icon-72@.png
    sips -z 72 72 res/ios/icon-72@.png
    cp www/img/icon.png res/ios/icon-72@2x.png
    sips -z 144 144 res/ios/icon-72@2x.png
    cp www/img/icon.png res/ios/icon-72@3x.png
    sips -z 216 216 res/ios/icon-72@3x.png
    cp www/img/icon.png res/ios/icon-76@.png
    sips -z 76 76 res/ios/icon-76@.png
    cp www/img/icon.png res/ios/icon-76@2x.png
    sips -z 152 152 res/ios/icon-72@2x.png
    cp www/img/icon.png res/ios/icon-76@3x.png
    sips -z 228 228 res/ios/icon-76@3x.png
    cp www/img/icon.png res/ios/icon-1024.png
    sips -z 1024 1024 res/ios/icon-1024.png
    cp www/img/icon.png res/ios/icon-small.png
    sips -z 256 256 res/ios/icon-small.png
    cp www/img/icon.png res/ios/icon-small@2x.png
    sips -z 512 512 res/ios/icon-small@2x.png
    cp www/img/icon.png res/ios/icon-small@3x.png
    sips -z 768 768 res/ios/icon-small@3x.png
    cp www/img/splash.png res/ios/Default-667h.png
    sips -z 1334 1334 res/ios/Default-667h.png
    sips -p 1334 750 res/ios/Default-667h.png
    cp www/img/splash.png res/ios/Default-568h@2x~iphone.png
    sips -z 1136 1136 res/ios/Default-568h@2x~iphone.png
    sips -p 1136 640 res/ios/Default-568h@2x~iphone.png
    cp www/img/splash.png res/ios/Default-736h.png
    sips -z 2208 2208 res/ios/Default-736h.png
    sips -p 2208 1242 res/ios/Default-736h.png
    cp www/img/splash.png res/ios/Default-2436h.png
    sips -z 2436 2436 res/ios/Default-2436h.png
    sips -p 2436 1125 res/ios/Default-2436h.png
    cp www/img/splash.png res/ios/Default-Landscape-736h.png
    sips -z 2208 2208 res/ios/Default-Landscape-736h.png
    sips -p 1242 2208 res/ios/Default-Landscape-736h.png
    cp www/img/splash.png res/ios/Default-Landscape-2436h.png
    sips -z 2436 2436 res/ios/Default-Landscape-2436h.png
    sips -p 1125 2436 res/ios/Default-Landscape-2436h.png
    cp www/img/splash.png res/ios/Default-Landscape@2x~ipad.png
    sips -z 2048 2048 res/ios/Default-Landscape@2x~ipad.png
    sips -p 1536 2048 res/ios/Default-Landscape@2x~ipad.png
    cp www/img/splash.png res/ios/Default-Landscape~ipad.png
    sips -z 1024 1024 res/ios/Default-Landscape~ipad.png
    sips -p 768 1024 res/ios/Default-Landscape~ipad.png
    cp www/img/splash.png res/ios/Default-Portrait@2x~ipad.png
    sips -z 2048 2048 res/ios/Default-Portrait@2x~ipad.png
    sips -p 2048 1536 res/ios/Default-Portrait@2x~ipad.png
    cp www/img/splash.png res/ios/Default-Portrait~ipad.png
    sips -z 1024 1024 res/ios/Default-Portrait~ipad.png
    sips -p 1024 768 res/ios/Default-Portrait~ipad.png
    cp www/img/splash.png res/ios/Default@2x~iphone.png
    sips -z 960 960 res/ios/Default@2x~iphone.png
    sips -p 960 640 res/ios/Default@2x~iphone.png
    cp www/img/splash.png res/ios/Default~iphone.png
    sips -z 480 480 res/ios/Default~iphone.png
    sips -p 480 320 res/ios/Default~iphone.png

    echo Icons for $1 generated
    
else
    echo $1 is not a valid project
fi
