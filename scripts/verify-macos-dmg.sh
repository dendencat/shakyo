#!/bin/bash
# Verify the final distribution without launching the app or changing quarantine.
set -euo pipefail

fail() {
  echo "検証失敗: $*" >&2
  exit 1
}

[[ $(uname -s) == Darwin ]] || fail 'macOSで実行してください。'
[[ $# -eq 2 ]] || fail '使い方: verify-macos-dmg.sh DMGファイル 期待するバージョン'
image=$1
expected_version=$2
[[ -f "$image" ]] || fail 'DMGファイルが見つかりません。'
[[ "$expected_version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail 'バージョンの形式が不正です。'

hdiutil verify "$image"
mount_dir=$(mktemp -d "${TMPDIR:-/tmp}/shakyo-dmg-verify.XXXXXX")
attached=0
cleanup() {
  status=$?
  trap - EXIT
  # The unique mount point belongs only to this invocation. Also try cleanup
  # after a partial attach failure, without detaching any pre-existing volume.
  if ! hdiutil detach "$mount_dir" >/dev/null 2>&1; then
    if [[ $attached -eq 1 ]]; then
      echo "DMGの取り出しに失敗しました: $mount_dir" >&2
      status=1
    fi
  fi
  rmdir "$mount_dir" 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
hdiutil attach "$image" -readonly -nobrowse -mountpoint "$mount_dir"
attached=1

app="$mount_dir/shakyo.app"
plist="$app/Contents/Info.plist"
[[ -d "$app" && ! -L "$app" && -f "$plist" ]] || fail 'shakyo.appが見つかりません。'
[[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$plist") == io.github.dendencat.shakyo ]] || fail 'アプリ識別子が一致しません。'
[[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$plist") == "$expected_version" ]] || fail 'アプリのバージョンが一致しません。'
[[ $(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plist") == shakyo ]] || fail '実行ファイル名が一致しません。'
[[ -f "$app/Contents/_CodeSignature/CodeResources" ]] || fail 'アプリ全体のリソース署名がありません。'
for arch in arm64 x86_64; do
  lipo "$app/Contents/MacOS/shakyo" -verify_arch "$arch"
done
codesign --verify --deep --strict --all-architectures --verbose=2 "$app"
echo "macOS DMG検証成功: shakyo $expected_version (arm64 / x86_64)"
