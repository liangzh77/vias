#!/usr/bin/env bash
# Linux server only. Does not edit/reload Caddy. All inputs are supplied explicitly.
set -Eeuo pipefail
if [[ $# != 7 ]]; then
  echo "Usage: $0 deploy|switch RELEASE_ID MANIFEST CHECKER ARCHIVE ROOT BASE_URL" >&2
  exit 2
fi
mode=$1 id=$2 manifest=$3 checker=$4 archive=${5:-}
root=$6 base_url=$7
[[ "$root" == /* && -d "$root" && ! -L "$root" ]] || exit 2
[[ "$id" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 2
[[ "$mode" == deploy || "$mode" == switch ]] || exit 2
[[ -f "$manifest" && -f "$checker" && -d "$root/releases" && ! -L "$root/releases" ]] || exit 2
# Serialize our own publishers; no Caddy reload or config edits.
exec 9>"$root/.publish.lock"
flock -n 9 || { echo 'Another publisher is running' >&2; exit 2; }
old_target=''
if [[ -L "$root/current" ]]; then
  old_target=$(readlink "$root/current")
  [[ "$old_target" =~ ^releases/[0-9]{8}T[0-9]{6}Z$ && -d "$root/$old_target" && ! -L "$root/$old_target" ]] || exit 2
elif [[ -e "$root/current" ]]; then
  echo 'current must be absent or a validated symlink' >&2; exit 2
fi
release="$root/releases/$id"
staging=''
link_dir=''
switched=0

atomic_switch() {
  local target=$1
  # Same parent/filesystem as current. GNU mv -T replaces the link itself,
  # never follows current and never creates an unlink/relink visibility gap.
  link_dir=$(mktemp -d "$root/.link.XXXXXXXX")
  ln -s "$target" "$link_dir/current"
  mv -Tf -- "$link_dir/current" "$root/current"
  rmdir "$link_dir"
  link_dir=''
}
cleanup() {
  [[ -z "$staging" ]] || rm -rf -- "$staging"
  [[ -z "$link_dir" ]] || rm -rf -- "$link_dir"
  return 0
}
rollback() {
  local status=$?
  trap - ERR
  trap '' HUP INT TERM
  if [[ "$switched" == 1 ]]; then
    echo "Restoring $old_target with mv -T" >&2
    if [[ -n "$old_target" && -L "$root/current" && $(readlink "$root/current") == "$old_target" ]]; then
      exit "$status" # Rename failed before changing current.
    elif [[ -z "$old_target" && ! -e "$root/current" && ! -L "$root/current" ]]; then
      exit "$status"
    fi
    [[ -L "$root/current" && $(readlink "$root/current") == "releases/$id" ]] || { echo 'Concurrent current change: refusing rollback' >&2; exit 1; }
    if [[ -n "$old_target" ]]; then
      atomic_switch "$old_target" || { echo 'ROLLBACK FAILED' >&2; exit 1; }
      [[ $(readlink "$root/current") == "$old_target" ]] || exit 1
    else
      rm -- "$root/current"
      [[ ! -e "$root/current" && ! -L "$root/current" ]] || exit 1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap rollback ERR
trap 'false' HUP INT TERM

if [[ "$mode" == deploy ]]; then
  [[ -f "$archive" && ! -e "$release" && ! -L "$release" ]] || {
    echo 'Archive missing or release already exists; refusing overwrite' >&2; exit 2;
  }
  python3 "$checker" verify-archive "$archive" "$manifest"
  staging=$(mktemp -d "$root/releases/.staging-$id.XXXXXXXX")
  # Only verified regular files, copied explicitly. Never tar extractall / resource forks.
  python3 - "$archive" "$staging" <<'PY'
import pathlib, sys, tarfile
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for member in archive:
        path = pathlib.Path(sys.argv[2]) / member.name
        if member.isdir():
            path.mkdir(parents=True, exist_ok=True)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open('xb') as output:
                output.write(archive.extractfile(member).read())
PY
  python3 "$checker" verify-tree "$staging" "$manifest"
  find "$staging" -type d -exec chmod 755 {} +
  find "$staging" -type f -exec chmod 644 {} +
  mv -T -- "$staging" "$release"
  staging=''
else
  [[ -d "$release" && ! -L "$release" ]] || exit 2
  # Explicit rollback/switch must supply that version's own trusted manifest.
  python3 "$checker" verify-tree "$release" "$manifest"
fi
# Final check of actual published directory, not just build or tar contents.
python3 "$checker" verify-tree "$release" "$manifest"
switched=1
atomic_switch "releases/$id"
[[ $(readlink "$root/current") == "releases/$id" ]]
python3 "$checker" verify-http "$base_url" "$manifest"
trap - ERR HUP INT TERM
printf 'PUBLISH_OK current=%s previous=%s (atomic mv -T)\n' "releases/$id" "$old_target"
