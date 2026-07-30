# Examples

Scripts that build a `.flo` from scratch with the model API. Run one and it
writes a flow you can copy to a device and import into Automate.

```bash
npx tsx examples/app-usage-today.ts "App usage today.flo"
npm run explain -- "App usage today.flo"        # read back what it built
```

They double as worked examples of [the agent guide](../docs/LLM-GUIDE.md), and
each is pinned by a test so it cannot rot silently.

---

## `app-usage-today.ts` — how long was an app used today?

Asks an Android device over ADB for one app's foreground time today, and hands
back both a number of seconds and a formatted string.

### Reusable functions in Automate

Automate has no cross-flow "call this flow and give me the answer". What it has
is the **`Subroutine`** block, which runs a branch of the *same* flow in a child
fiber, waits for it to finish, and copies the variables named in
`returnVariables` back into the caller. So a function is:

- **arguments** — variables you set before the block runs. The child fiber
  starts with a clone of every caller variable.
- **body** — whatever hangs off the `NEW` port, ending in a block with nothing
  connected. That is the `return`.
- **results** — the variables listed on the `Subroutine` block.

Reuse therefore means *copying the branch into a flow*, not importing a file.
The alternative — `Flow start` plus `Variables give` / `Variables take?` — does
work across flows, but the callee has to be written to hand the answer back
explicitly, and the caller has to block on a take. This example uses the
subroutine because it stays a single self-contained file.

### The function

Set before calling:

| Variable | Meaning | Default if unset |
| --- | --- | --- |
| `usagePackage` | package name, e.g. `com.google.android.youtube.tvkids` | — |
| `usageHost` | device address | — |
| `usagePort` | ADB port | — |

Returned:

| Variable | Meaning |
| --- | --- |
| `usageSeconds` | today's foreground time in seconds, `0` if the app was not used |
| `usageText` | `"2h 5m 3s"`, `"no usage recorded today"`, or `"unknown"` on failure |
| `usageError` | `null` on success, otherwise why it failed |

### Choosing the app

**Run it and pick from a list.** `Flow beginning "App usage today"` asks the TV
what it has installed (`pm list packages -3`), shows the result as a
multi-select dialog, then reports the time for every app you ticked — one line
each, in one dialog, and in the flow log so it can be copied out.

Nothing is hardcoded. The menu is whatever the device actually has, so there is
no list to keep in step and no package name that can quietly go stale. That
matters more than convenience here: `dumpsys usagestats` answers for a package
that is not installed exactly as it does for one that has not been opened today,
so a typo would report "no usage recorded" — a confident wrong answer.

**Or start it from another flow with a payload**, which skips both the listing
and the dialog:

```
{"package": "com.playdigious.deadcells.mobile", "host": "192.168.0.34"}
```

That path joins the same reporting loop by presenting itself as a one-element
list with that element selected, rather than carrying a second copy of it.
Anything the payload omits falls back to a default — the Android TV at
`192.168.0.30`, port `5555`.

**Or call the subroutine directly** from a flow of your own (below), setting
`usagePackage` yourself.

### Listing the apps on their own

`Flow beginning "List TV apps"` does just the listing, showing it and writing it
to the flow log — useful when you want the package names somewhere you can paste
them.

### How it reads the usage

```
dumpsys usagestats <package>
  | grep -A 5 "In-memory daily stats"
  | grep totalTimeUsed
  | sed 's/.*totalTimeUsed="\([^"]*\)".*/\1/'
  | head -n 1
```

`dumpsys usagestats` prints daily, weekly, monthly and yearly sections; the
first `grep` keeps the daily one. `head` guards against a device with more than
one user printing a section each.

The value comes back as `MM:SS` when it is under an hour and `H:MM:SS`
otherwise — `totalTimeUsed="20:01"` is twenty minutes, not twenty hours. The
flow splits on `:` and counts the fields rather than assuming three:

```
#usageParts = 3 ? usageParts[0] * 3600 + usageParts[1] * 60 + usageParts[2]
                : (#usageParts = 2 ? usageParts[0] * 60 + usageParts[1] : 0)
```

An app that has not been used today produces no `totalTimeUsed` line at all.
`sed` and `head` both succeed on empty input, so the exit code stays `0` and the
split yields one field — reported as `"no usage recorded today"` rather than
`"0h 0m 0s"`, because an absent record is not the same claim as a measured zero.

### What can go wrong, and what it does about it

- **Device unreachable, key not authorised, TLS mismatch** — the `Failure
  catch` retries once, then sets `usageError` to the failure message.
- **Command ran but failed** — a non-zero exit code sets `usageError` to
  `"ADB exited N: <stderr>"`.
- Either way `usageSeconds` is `0` and `usageText` is `"unknown"`, so a caller
  that forgets to check `usageError` still gets defined values rather than
  whatever those variables happened to hold.
- **A package that is not installed** is the one case nothing detects — it
  answers "no usage recorded today", same as an app you did not open. Take
  package names from "List TV apps", not from memory.

### Status

Confirmed working on the device: connects, reads `dumpsys`, parses, and returns.

Two bugs found by running it, both invisible from this side:

- Every variable read back empty. Separately-built `I3.l` nodes sharing a name
  are separate variables to Automate; the encoder now merges them on save.
- The dialogs never appeared and the fiber hung. A `Dialog…` block with
  `startActivity` unset posts a notification instead of a window and waits for a
  tap. Every dialog in every real flow sets it; a freshly created block does not.
