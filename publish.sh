#!/bin/bash -e
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