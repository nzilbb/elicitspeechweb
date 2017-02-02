if [ -d "projects/$1" ]; then
    cp projects/$1/config.xml .
    cp projects/$1/config.js www/js/
    cp projects/$1/icon.png www/img/
    echo Configuration files for $1 copied
else
    echo $1 is not a valid project
fi
