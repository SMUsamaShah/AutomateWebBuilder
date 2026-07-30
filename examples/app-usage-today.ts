/**
 * Builds "App usage today.flo" — a reusable Automate subroutine that asks an
 * Android device over ADB how long an app has been used today.
 *
 *   npx tsx examples/app-usage-today.ts "App usage today.flo"
 *
 * The interesting part is the subroutine (blocks on the right-hand column).
 * Automate's `Subroutine` block runs a branch of the *same* flow in a child
 * fiber that starts with a clone of the caller's variables, waits for it to
 * stop, then copies the named `returnVariables` back — so it is a function
 * whose arguments are "variables set before the call" and whose results are
 * "variables listed on the block". There is no cross-flow call-with-return in
 * Automate, so reuse means copying this branch into a flow, not importing it.
 *
 * Call it by setting `usagePackage` (and optionally `usageHost` / `usagePort`)
 * and running a Subroutine block whose NEW port enters at the Failure catch.
 * It returns:
 *
 *   usageSeconds  today's foreground time in seconds (0 if unused)
 *   usageText     the same, formatted — "2h 5m 3s", "no usage recorded today",
 *                 or "unknown" when the lookup failed
 *   usageError    null on success, a message otherwise
 *
 * Two beginnings drive it: "App usage today" asks which app (or takes one from
 * a payload) and reports the time, and "List TV apps" prints the packages that
 * are actually installed, so the picker's menu can be extended without guessing.
 *
 * The shell pipeline is the one verified by hand against a real Android TV; the
 * device prints `totalTimeUsed="20:01"` (MM:SS) or `"2:05:03"` (H:MM:SS), which
 * is why the seconds conversion counts fields rather than assuming three.
 */

import { writeFileSync } from 'node:fs';
import {
  catalog,
  connect,
  createBlock,
  emptyModel,
  fromModel,
  toModel,
  validateModel,
} from '../src/flo/model';
import type { Block, FlowModel } from '../src/flo/model';
import { parseExpression } from '../src/flo/exprparse';
import { variableRef } from '../src/flo/expr';

const idByName = new Map(Object.entries(catalog).map(([tid, e]) => [e.name, Number(tid)]));
const type = (name: string): number => {
  const id = idByName.get(name);
  if (id === undefined) throw new Error(`no such block type: ${name}`);
  return id;
};

/** Keychain alias of the ADB key the user's other flows already authorised. */
const ADB_ALIAS = 'adb-400db59ad1d7b389ba138dd73d9bef79';
const DEFAULT_HOST = '192.168.0.30';

/**
 * The picker's menu, package -> label.
 *
 * `Dialog choice?` given a dictionary shows the *values* and assigns the
 * *keys*, so the selection is already a package name and needs no lookup.
 *
 * Only the four packages seen in working flows are listed. A guessed package
 * name is worse than a missing one: `dumpsys` answers for an app that is not
 * installed exactly as it does for one that has not been opened today, so a
 * typo reads as a confident "not used". Run the flow's "List TV apps"
 * beginning to get the real names off the device and add them here.
 */
const APPS: Record<string, string> = {
  'com.google.android.youtube.tvkids': 'YouTube Kids',
  'com.google.android.youtube.tv': 'YouTube',
  'com.retroarch': 'RetroArch',
  'com.playdigious.deadcells.mobile': 'Dead Cells',
};

/**
 * Installed third-party packages, one per line, each prefixed `package:`.
 *
 * No pipeline: every stage is a way for this to come back empty with nothing to
 * show for it, and the tidying is done in the expression below where the result
 * is visible. Same lesson as the usage lookup — send the device the simplest
 * command that answers the question.
 */
const LIST_COMMAND = `"pm list packages -3"`;

/**
 * The package list, or an account of why there isn't one.
 *
 * A blank dialog is the worst possible outcome: the block ran, the fiber
 * continued, and nothing says whether the command failed, returned nothing, or
 * was never really asked. `||` yields its left operand only when that is
 * truthy, and an empty text is false, so the diagnosis appears exactly when
 * there is no list.
 */
const LIST_MESSAGE =
  'replaceAll(trim(usageRaw), "(?m)^package:", "")' +
  ' || "No packages listed.\\nExit code {usageExit}.\\n{trim(usageStderr) || "No error output."}"';

/**
 * "Show window" — every dialog needs it.
 *
 * Left unset, a dialog block posts a *notification* and the fiber pauses until
 * someone taps it; miss the notification and the flow simply hangs. All 298
 * dialog blocks across the real flows tested set this, bar one. It is not a
 * default the app fills in, so a freshly created block has to say so.
 */
const SHOW_WINDOW = '1';

/**
 * `dumpsys usagestats <pkg>` prints four sections (daily, weekly, monthly,
 * yearly); `grep -A 5` narrows to the daily one and `sed` lifts the quoted
 * value out. `head` guards against a device with more than one user printing a
 * daily section each. Neither `sed` nor `head` fails on empty input, so the
 * exit code stays 0 when the app simply has not been used today.
 */
const USAGE_COMMAND =
  '"dumpsys usagestats " ++ cliEncode(usagePackage) ++ ' +
  String.raw`" | grep -A 5 \"In-memory daily stats\" | grep totalTimeUsed` +
  String.raw` | sed 's/.*totalTimeUsed=\"\\([^\"]*\\)\".*/\\1/' | head -n 1"`;

const vars = (...names: string[]) => ({ _arr: names.map(variableRef) });

function add(model: FlowModel, name: string, x: number, y: number): Block {
  return createBlock(model, type(name), x, y);
}

export function buildFlow(): FlowModel {
  const model = emptyModel();

  // ---- caller / demo path -------------------------------------------------

  const begin = model.blocks[0];
  begin.raw.title = 'App usage today';
  begin.raw.varPayload = variableRef('args');

  // A payload supplies the package; without one the picker below asks.
  const defaults = add(model, 'DestructuringAssign', 4, 6);
  defaults.raw.value = parseExpression(
    `[args["package"],
      args["host"] || ${JSON.stringify(DEFAULT_HOST)},
      args["port"] || 5555,
      ${JSON.stringify(APPS)}]`,
  );
  defaults.raw.variables = vars('usagePackage', 'usageHost', 'usagePort', 'usageApps');

  const needsApp = add(model, 'ExpressionDecision', 4, 12);
  needsApp.raw.expression = parseExpression('!usagePackage');

  const pick = add(model, 'DialogChoice', 4, 18);
  pick.raw.title = parseExpression('"Usage on the TV today"');
  pick.raw.choiceTitles = parseExpression('usageApps');
  pick.raw.varSelectedIndices = variableRef('usageChoice');
  pick.raw.startActivity = parseExpression(SHOW_WINDOW);

  // Given a dictionary the dialog shows the values and returns the keys, and
  // the result is always an array even for a single choice.
  const chosen = add(model, 'VariableAssign', 4, 24);
  chosen.raw.variable = variableRef('usagePackage');
  chosen.raw.value = parseExpression('usageChoice[0]');

  const call = add(model, 'Subroutine', 4, 30);
  call.raw.returnVariables = vars('usageSeconds', 'usageText', 'usageError');

  const worked = add(model, 'ExpressionDecision', 4, 36);
  worked.raw.expression = parseExpression('!usageError');

  const log = add(model, 'LogAppend', 4, 42);
  log.raw.message = parseExpression(
    '"{usagePackage} on {usageHost}: {usageText} ({usageSeconds} s)"',
  );
  log.raw.whenLogging = parseExpression('0');

  const report = add(model, 'ToastShow', 4, 48);
  report.raw.message = parseExpression('"{usageApps[usagePackage] || usagePackage}\\n{usageText}"');

  const complain = add(model, 'ToastShow', 12, 36);
  complain.raw.message = parseExpression('"App usage check failed:\\n{usageError}"');

  connect(model, begin.id, 'onComplete', defaults.id);
  connect(model, defaults.id, 'onComplete', needsApp.id);
  connect(model, needsApp.id, 'onPositive', pick.id);
  connect(model, needsApp.id, 'onNegative', call.id); // payload already named one
  connect(model, pick.id, 'onPositive', chosen.id);
  // pick's NO port stays open: cancelling the dialog just ends the fiber.
  connect(model, chosen.id, 'onComplete', call.id);
  connect(model, call.id, 'onComplete', worked.id);
  connect(model, worked.id, 'onPositive', log.id);
  connect(model, worked.id, 'onNegative', complain.id);
  connect(model, log.id, 'onComplete', report.id);

  // ---- the subroutine -----------------------------------------------------

  const guard = add(model, 'FailureCatch', 20, 0);
  guard.raw.retryLimit = parseExpression('1');
  guard.raw.varFailureMessage = variableRef('usageError');

  const clear = add(model, 'VariableAssign', 20, 6);
  clear.raw.variable = variableRef('usageError');
  clear.raw.value = null;

  const adb = add(model, 'AdbShellCommand', 20, 12);
  adb.raw.host = parseExpression('usageHost');
  adb.raw.port = parseExpression('usagePort');
  adb.raw.security = parseExpression('0');
  adb.raw.alias = parseExpression(JSON.stringify(ADB_ALIAS));
  adb.raw.command = parseExpression(USAGE_COMMAND);
  adb.raw.varStdout = variableRef('usageRaw');
  adb.raw.varStderr = variableRef('usageStderr');
  adb.raw.varExitCode = variableRef('usageExit');

  const ranOk = add(model, 'ExpressionDecision', 20, 18);
  ranOk.raw.expression = parseExpression('usageExit = 0');

  const parts = add(model, 'VariableAssign', 20, 24);
  parts.raw.variable = variableRef('usageParts');
  parts.raw.value = parseExpression('split(trim(usageRaw), ":")');

  // Empty output (app unused today) leaves one part and falls through to 0.
  const seconds = add(model, 'VariableAssign', 20, 30);
  seconds.raw.variable = variableRef('usageSeconds');
  seconds.raw.value = parseExpression(
    `#usageParts = 3
       ? usageParts[0] * 3600 + usageParts[1] * 60 + usageParts[2]
       : (#usageParts = 2 ? usageParts[0] * 60 + usageParts[1] : 0)`,
  );

  // "no record" is worth saying out loud: `dumpsys` answers the same way for an
  // app that was not opened today and for a package name that does not exist,
  // and "0h 0m 0s" reads like a measurement rather than an absence.
  const text = add(model, 'VariableAssign', 20, 36);
  text.raw.variable = variableRef('usageText');
  text.raw.value = parseExpression(
    `#usageParts < 2 ? "no usage recorded today" : durationFormat(usageSeconds, "H'h 'm'm 's's'")`,
  );

  const failed = add(model, 'VariableAssign', 28, 18);
  failed.raw.variable = variableRef('usageError');
  failed.raw.value = parseExpression('"ADB exited {usageExit}: " ++ trim(usageStderr)');

  // Both failure routes agree on a defined result before returning.
  const zero = add(model, 'DestructuringAssign', 28, 24);
  zero.raw.value = parseExpression('[0, "unknown"]');
  zero.raw.variables = vars('usageSeconds', 'usageText');

  connect(model, call.id, 'onChildFiber', guard.id);
  connect(model, guard.id, 'onComplete', clear.id);
  connect(model, guard.id, 'onFailure', zero.id);
  connect(model, clear.id, 'onComplete', adb.id);
  connect(model, adb.id, 'onComplete', ranOk.id);
  connect(model, ranOk.id, 'onPositive', parts.id);
  connect(model, ranOk.id, 'onNegative', failed.id);
  connect(model, parts.id, 'onComplete', seconds.id);
  connect(model, seconds.id, 'onComplete', text.id);
  connect(model, failed.id, 'onComplete', zero.id);

  // ---- second beginning: what is actually installed on the TV -------------

  // Guessing a package name produces a confident wrong answer, so the flow
  // carries its own way of reading the real ones off the device.
  const listBegin = add(model, 'FlowBeginning', 36, 0);
  listBegin.raw.title = 'List TV apps';

  const listWhere = add(model, 'DestructuringAssign', 36, 6);
  listWhere.raw.value = parseExpression(`[${JSON.stringify(DEFAULT_HOST)}, 5555]`);
  listWhere.raw.variables = vars('usageHost', 'usagePort');

  const listAdb = add(model, 'AdbShellCommand', 36, 12);
  listAdb.raw.host = parseExpression('usageHost');
  listAdb.raw.port = parseExpression('usagePort');
  listAdb.raw.security = parseExpression('0');
  listAdb.raw.alias = parseExpression(JSON.stringify(ADB_ALIAS));
  listAdb.raw.command = parseExpression(LIST_COMMAND);
  listAdb.raw.varStdout = variableRef('usageRaw');
  listAdb.raw.varStderr = variableRef('usageStderr');
  listAdb.raw.varExitCode = variableRef('usageExit');

  const listShow = add(model, 'DialogMessage', 36, 18);
  listShow.raw.title = parseExpression('"Apps on {usageHost}"');
  listShow.raw.message = parseExpression(LIST_MESSAGE);
  listShow.raw.startActivity = parseExpression(SHOW_WINDOW);

  connect(model, listBegin.id, 'onComplete', listWhere.id);
  connect(model, listWhere.id, 'onComplete', listAdb.id);
  connect(model, listAdb.id, 'onComplete', listShow.id);

  return model;
}

function main(): void {
  const out = process.argv[2] ?? 'App usage today.flo';
  const model = buildFlow();

  const problems = validateModel(model);
  if (problems.length) throw new Error(problems.join('\n'));

  const bytes = fromModel(model);
  const reloaded = toModel(bytes);
  if (reloaded.blocks.length !== model.blocks.length) {
    throw new Error('reload lost blocks');
  }

  writeFileSync(out, bytes);
  console.log(`wrote ${out} — ${model.blocks.length} blocks, ${bytes.length} bytes`);
}

if (process.argv[1]?.endsWith('app-usage-today.ts')) main();
