#!/bin/bash -e
CLEAN_UP_FILES="node_modules out package-lock.json"

printf "> Clean up before build (remove $CLEAN_UP_FILES)? [y/N] "
read -N 1 ans
echo
if [ "$ans" == "y" -o "$ans" == "Y" ]; then
    for d in $CLEAN_UP_FILES; do
        [ -e "$d" ] && {
            echo "  - rm $d"
            rm -rf $d
        }
    done
    echo "  - npm install"
    npm install
    echo
fi

echo "> Check user login"
if [ $(vsce ls-publishers | grep -ce "danielroedl") -ne 1 ]; then
    echo "> User not logged in"
    # login
    vsce login danielroedl
else
    echo "> User logged in"
fi
echo
echo "> Run package"
echo
vsce package
echo
echo "Start publishing? [Enter to continue]"
read
echo
vsce publish
echo
echo "> Publishing done"
echo