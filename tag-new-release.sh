#!/bin/sh

package_version=$(jq '.version' package.json -r -e)

if [ "$(git tag -l "v$package_version")" ]; then
	echo >&2 "Tag v$package_version already exists"
	echo >&2 "Did you forget to bump the version in package.json?"
fi

git checkout --detach
git add -f lib/**
git commit -m "Release v${package_version}"
git tag -s -m "Release v${package_version}" "v${package_version}"
git push origin "v${package_version}"
git checkout master
