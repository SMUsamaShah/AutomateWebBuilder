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
| `usageText` | the same, formatted — `"2h 5m 3s"` |
| `usageError` | `null` on success, otherwise why it failed |

The entry point (`Flow beginning "App usage today"`) fills those three inputs
from its payload and then shows the result, so the flow is runnable on its own:

```
{"package": "com.playdigious.deadcells.mobile", "host": "192.168.0.34"}
```

Anything the payload omits falls back to a default — the Android TV at
`192.168.0.30`, port `5555`.

### Calling it from your own flow

1. Import this flow, open it, and copy the eight blocks in the right-hand
   column (`Failure catch` down to `Destructuring assign`) into your flow.
2. Set `usagePackage`, `usageHost` and `usagePort`.
3. Add a `Subroutine` block, point its `NEW` port at the `Failure catch`, and
   list `usageSeconds`, `usageText`, `usageError` as its returned variables.
4. Continue from its `OK` port — the results are there.

The ADB blocks use keychain alias `adb-400db59ad1d7b389ba138dd73d9bef79`, the
same one the existing TV flows use, so no new device pairing is needed. Change
it in the script if you build this for a different device.

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
`sed` and `head` both succeed on empty input, so the exit code stays `0`, the
split yields one field, and the answer is `0` — which is the truth, not an
error.

### What can go wrong, and what it does about it

- **Device unreachable, key not authorised, TLS mismatch** — the `Failure
  catch` retries once, then sets `usageError` to the failure message.
- **Command ran but failed** — a non-zero exit code sets `usageError` to
  `"ADB exited N: <stderr>"`.
- Either way `usageSeconds` is `0` and `usageText` is `"0h 0m 0s"`, so a caller
  that forgets to check `usageError` still gets defined values rather than
  whatever those variables happened to hold.

### Untested on hardware

The `.flo` is verified — it validates, round-trips, and the pipeline was checked
against real `dumpsys usagestats` output captured from the device. The flow
itself has not been run on a phone; that part is yours.
