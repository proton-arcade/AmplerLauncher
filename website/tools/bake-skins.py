#!/usr/bin/env python3
"""
Ampler Launcher - write the skins folder listing into website/skins/list.js.

OPTIONAL, and only for one case: opening index.html by double-clicking it.

  * Served by website/tools/serve.py (what start-offline.* runs) the launcher
    already answers website/skins/list.js from the directory listing, so
    dropping a folder into website/skins/ is the whole setup - run nothing.
  * Opened off disk, a browser cannot read a directory listing, so the page
    goes by website/js/skins.js. This tool bakes the folder listing into
    website/skins/list.js so a dropped folder shows up there too, with no
    editing:

        python3 website/tools/bake-skins.py

    Run it again after adding or removing a folder. The page reads the file on
    every load, so a reload is all it takes to see the change.

It writes the same text the server would send, and reuses the server's idea of
"what counts as a skin folder" so the two can never disagree. Deleting
website/skins/list.js is always safe: the launcher falls back to
website/js/skins.js.
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import serve  # noqa: E402  (lives next to this file, stdlib only)


def main():
    parser = argparse.ArgumentParser(
        description="Write the website/skins/ folder listing into website/skins/list.js.")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the listing instead of writing it (used by the checks)")
    args = parser.parse_args()

    folders = serve.skin_folders()
    text = serve.skins_list_js()

    if args.dry_run:
        # Exactly what would be written, so it can be compared with the listing
        # website/tools/serve.py hands out.
        sys.stdout.write(text)
        return 0

    with open(serve.SKINS_LIST_FILE, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)

    print("Ampler Launcher - baked the skins listing")
    print("  folder : %s" % os.path.relpath(serve.SKINS_LIST_FILE, serve.ROOT))
    print("  skins  : %d" % len(folders))
    for name in folders:
        print("           %s" % name)
    print("\nReload index.html to see them. Nothing else to do.")
    print("(The list is only used when the launcher is opened off disk - "
          "served, the folder is read live.)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
