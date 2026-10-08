#!/bin/zsh
# Release IPA check (docs/RELEASE-SMOKE.md, step 6). Proves the signed IPA you
# will upload carries the JS bundle, the right version and profile, App Store
# signing, the production push entitlement, the widget's App Group, and the
# source map and dSYM in Sentry.
#
#   SENTRY_AUTH_TOKEN=<build token> scripts/verify-release-ipa.sh <ipa> <build number>
#
# Run it from the repository root. It ends on PASS, or on FAIL with a count.

IPA=$1
BUILD=$2
[[ -f $IPA && -n $BUILD ]] || { echo "usage: scripts/verify-release-ipa.sh <ipa> <build number>"; exit 2; }
VERSION=$(node -p "require('./app.json').expo.version") || exit 2
BACKEND=$(node -p "require('./eas.json').build.production.env.EXPO_PUBLIC_BACKEND_URL") || exit 2

TMP_DIR=$(mktemp -d)
trap 'rm -rf $TMP_DIR' EXIT
unzip -q $IPA -d $TMP_DIR || { echo "FAIL unzip $IPA"; exit 1; }
APP=$TMP_DIR/Payload/Unfold.app
failures=0

pass() { echo "PASS $1"; }
fail() { echo "FAIL $1"; (( failures += 1 )); }
plist() { /usr/libexec/PlistBuddy -c "Print :$1" $2 2>/dev/null || echo "<absent>"; }
expect() { [[ "$2" == "$3" ]] && pass "$1 $2" || fail "$1 is $2, expected $3"; }

echo "ipa sha256 $(shasum -a 256 $IPA | cut -d' ' -f1)"
[[ -s $APP/main.jsbundle ]] && pass "main.jsbundle sha256 $(shasum -a 256 $APP/main.jsbundle | cut -d' ' -f1)" || fail "main.jsbundle is missing"
grep -a -q -F $BACKEND $APP/main.jsbundle && pass "bundle names $BACKEND" || fail "bundle does not name $BACKEND"
expect version "$(plist CFBundleShortVersionString $APP/Info.plist)" $VERSION
expect build "$(plist CFBundleVersion $APP/Info.plist)" $BUILD
expect UNFOLDBuildProfile "$(plist UNFOLDBuildProfile $APP/Info.plist)" production
expect ITSAppUsesNonExemptEncryption "$(plist ITSAppUsesNonExemptEncryption $APP/Info.plist)" false
echo "toolchain Xcode $(plist DTXcode $APP/Info.plist) ($(plist DTXcodeBuild $APP/Info.plist)), SDK $(plist DTSDKName $APP/Info.plist)"

codesign --verify --deep --strict $APP 2>/dev/null && pass "codesign --verify --deep --strict" || fail "codesign verification"
echo "signer $(codesign -dvv $APP 2>&1 | grep -m1 '^Authority=' | cut -d= -f2)"
codesign -d --entitlements - --xml $APP > $TMP_DIR/app.plist 2>/dev/null
expect aps-environment "$(plist aps-environment $TMP_DIR/app.plist)" production
expect get-task-allow "$(plist get-task-allow $TMP_DIR/app.plist)" false
APP_GROUP=$(plist com.apple.security.application-groups:0 $TMP_DIR/app.plist)
[[ $APP_GROUP == group.* ]] && pass "app group $APP_GROUP" || fail "the app has no App Group"
security cms -D -i $APP/embedded.mobileprovision > $TMP_DIR/profile.plist 2>/dev/null
[[ $(plist ProvisionedDevices $TMP_DIR/profile.plist) == "<absent>" ]] \
  && pass "App Store profile \"$(plist Name $TMP_DIR/profile.plist)\", expires $(plist ExpirationDate $TMP_DIR/profile.plist)" \
  || fail "the provisioning profile lists devices, so it is not an App Store profile"

for EXT in $APP/PlugIns/*.appex(N); do
  NAME=${EXT:t}
  expect "$NAME version" "$(plist CFBundleShortVersionString $EXT/Info.plist)" $VERSION
  expect "$NAME build" "$(plist CFBundleVersion $EXT/Info.plist)" $BUILD
  codesign -d --entitlements - --xml $EXT > $TMP_DIR/ext.plist 2>/dev/null
  expect "$NAME app group" "$(plist com.apple.security.application-groups:0 $TMP_DIR/ext.plist)" $APP_GROUP
done

# The Hermes bundle keeps its JS debug ID in the string table as sentry-dbid-<uuid>.
JS_ID=$(grep -a -o -E 'sentry-dbid-[0-9a-f-]{36}' $APP/main.jsbundle | head -1 | cut -c13-)
NATIVE_ID=$(node_modules/.bin/sentry-cli debug-files check $APP/Unfold 2>/dev/null \
  | grep -o -E '[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}' | head -1)
[[ -n $JS_ID ]] || fail "the bundle has no Sentry debug ID"
[[ -n $NATIVE_ID ]] || fail "the binary has no debug ID"
if [[ -z $SENTRY_AUTH_TOKEN ]]; then
  fail "SENTRY_AUTH_TOKEN is not set, so the Sentry source map and dSYM are unchecked"
elif [[ -n $JS_ID && -n $NATIVE_ID ]]; then
  SENTRY_ORG=$(sed -n 's/^defaults.org=//p' ios/sentry.properties)
  SENTRY_PROJECT=$(sed -n 's/^defaults.project=//p' ios/sentry.properties)
  API=https://sentry.io/api/0/projects/$SENTRY_ORG/$SENTRY_PROJECT
  # An error reply is an object, so only a non-empty list counts as found.
  sentry_count() { curl -s -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" "$API/$1" | jq 'if type == "array" then length else 0 end' 2>/dev/null; }
  (( ${$(sentry_count "artifact-lookup/?debug_id=$JS_ID"):-0} > 0 )) \
    && pass "Sentry source map for $JS_ID" || fail "Sentry has no source map for $JS_ID"
  (( ${$(sentry_count "files/dsyms/?query=$NATIVE_ID"):-0} > 0 )) \
    && pass "Sentry dSYM for $NATIVE_ID" || fail "Sentry has no dSYM for $NATIVE_ID"
fi

(( failures == 0 )) && echo PASS || { echo "FAIL $failures check(s)"; exit 1; }
