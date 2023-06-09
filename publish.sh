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
[[ -z $OVSX_TOKEN ]] && { echo "Please define OVSX_TOKEN first to publish also to open-vsx.org!"; exit 1; }
echo
echo "> Run package"
echo
vsce package
echo
echo "Start publishing to marketplace.visualstudio.com? [Enter to continue]"
read
echo
vsce publish
echo
echo "> Publishing done"
echo
echo "Start packaging and publishing to open-vsx.org? [Enter to continue]"
read
echo
npx ovsx publish -p $OVSX_TOKEN
echo
echo "> Publishing done"
echo
