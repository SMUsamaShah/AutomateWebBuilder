/**
 * Builds "Save link to Dynalist.flo".
 *
 *   npx tsx examples/share-to-dynalist.ts "Save link to Dynalist.flo"
 *
 * You are reading something. You tap Share. This flow is in the list. You tap
 * it, the sheet closes, and the link is in your Dynalist inbox. You never leave
 * the app you were in.
 *
 * The `Content shared` block is what puts the flow in the share sheet. It hands
 * over three values, and for a share from a browser they are usually the page
 * title, the URL, and the URL again as a Uri. So the title goes in the item and
 * the URL goes in its note, with no extra request to fetch the title.
 *
 * `Content shared` waits, so the flow has to keep running to catch a share.
 * After it saves one link it loops back and waits for the next.
 *
 * The API token is not stored in this file. On the first run the flow asks for
 * it and writes it to `storage("internal", …)`, a directory private to this
 * flow. That keeps the token out of any copy of the flow you share.
 *
 * When Dynalist refuses an item it still answers HTTP 200 and names the reason
 * in the reply. The flow writes that reply to the flow log, because a toast is
 * gone before you can read it. The request is never logged: it holds the token.
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
import { lintFlow, formatFindings } from '../src/flo/lint';
import { parseExpression } from '../src/flo/exprparse';
import { integerBox, variableRef } from '../src/flo/expr';

const idByName = new Map(Object.entries(catalog).map(([tid, e]) => [e.name, Number(tid)]));
const type = (name: string): number => {
  const id = idByName.get(name);
  if (id === undefined) throw new Error(`no such block type: ${name}`);
  return id;
};

function add(model: FlowModel, name: string, x: number, y: number): Block {
  return createBlock(model, type(name), x, y);
}

/** Every dialog needs this, or it posts a notification and the fiber waits. */
const SHOW_WINDOW = '1';

/**
 * A directory private to this flow, so the token never travels with it.
 *
 * `storage()` returns a path, and says nothing about whether it exists. For a
 * flow that has never written a file, it does not: the first write fails with
 * NoSuchFileException. `File make directory` below creates it, and does nothing
 * when it is already there.
 */
const TOKEN_DIR = 'storage("internal", "")';
const TOKEN_FILE = 'storage("internal", "dynalist-token.txt")';

/** https://apidocs.dynalist.io — the inbox endpoint needs no document id. */
const INBOX_URL = '"https://dynalist.io/api/v1/inbox/add"';

/**
 * A browser shares the page title as the subject and the URL as the text. A
 * plain text share has no subject. So the title becomes the item when there is
 * one, and the URL goes underneath it as a note.
 */
const REQUEST_BODY =
  'jsonEncode({"token": trim(dynalistToken), ' +
  '"content": sharedTitle || sharedText, ' +
  '"note": sharedTitle ? sharedText : "", ' +
  '"index": -1})';

export function buildFlow(): FlowModel {
  const model = emptyModel();

  // ---- first run: ask for the token, then remember it ----------------------

  const begin = model.blocks[0];
  begin.raw.title = 'Save link to Dynalist';

  const tokenPath = add(model, 'VariableAssign', 4, 6);
  tokenPath.raw.variable = variableRef('tokenFile');
  tokenPath.raw.value = parseExpression(TOKEN_FILE);

  // Continuity 0 is "check now". Left unset it defaults to 1, "when changed",
  // and the block waits for the file to appear — which on a first run means
  // waiting for a file that only this flow can create.
  const haveToken = add(model, 'FileExists', 4, 12);
  haveToken.raw.path = parseExpression('tokenFile');
  haveToken.raw.continuity = integerBox(0);

  const readToken = add(model, 'FileRead', 4, 18);
  readToken.raw.sourceFile = parseExpression('tokenFile');
  readToken.raw.varContent = variableRef('dynalistToken');

  const askToken = add(model, 'DialogInput', 14, 12);
  askToken.raw.title = parseExpression('"Dynalist API token"');
  askToken.raw.hint = parseExpression('"Dynalist, Settings, Developer"');
  askToken.raw.varResultText = variableRef('dynalistToken');
  askToken.raw.startActivity = parseExpression(SHOW_WINDOW);

  const makeDir = add(model, 'FileMakeDirectory', 14, 18);
  makeDir.raw.path = parseExpression(TOKEN_DIR);

  const saveToken = add(model, 'FileWrite', 14, 24);
  saveToken.raw.targetFile = parseExpression('tokenFile');
  saveToken.raw.content = parseExpression('trim(dynalistToken)');

  // ---- wait for a share, send it, say what happened, wait again ------------

  const share = add(model, 'ContentShared', 4, 30);
  share.raw.title = parseExpression('"Save link to Dynalist"');
  share.raw.mimeType = parseExpression('"text/*"');
  share.raw.varContentText = variableRef('sharedText');
  share.raw.varContentSubject = variableRef('sharedTitle');

  // The request can fail before it returns a status code: no network, DNS,
  // a timeout. Without this the fiber would stop and the flow would no longer
  // be in the share sheet.
  const guard = add(model, 'FailureCatch', 4, 36);
  guard.raw.retryLimit = parseExpression('1');
  guard.raw.varFailureMessage = variableRef('shareError');

  const post = add(model, 'HttpRequest', 4, 42);
  post.raw.url = parseExpression(INBOX_URL);
  post.raw.method = parseExpression('"POST"');
  post.raw.contentType = parseExpression('"application/json"');
  post.raw.bodyPart = parseExpression(REQUEST_BODY);
  // 1 is "save to variable". The default is 0, which discards the response —
  // and the check below reads the response to find out whether Dynalist
  // accepted the item.
  post.raw.saveResponse = parseExpression('1');
  post.raw.varResponseCode = variableRef('httpCode');
  post.raw.varResponseBody = variableRef('httpBody');

  // Dynalist answers 200 even when it refuses the item, so the body decides.
  const accepted = add(model, 'ExpressionDecision', 4, 48);
  accepted.raw.expression = parseExpression(
    'httpCode = 200 && jsonDecode(httpBody)["_code"] = "OK"',
  );

  const saved = add(model, 'ToastShow', 4, 54);
  saved.raw.message = parseExpression(
    '"Saved to Dynalist:\\n{substr(sharedTitle || sharedText, 0, 60)}"',
  );

  // A toast is gone in a few seconds and it truncates. Dynalist puts the reason
  // in the reply body — "NoInbox" when you have not picked an inbox document,
  // "InvalidToken" for a bad token — so write the whole reply to the flow log,
  // where you can still read it later.
  //
  // Log the reply, never the request. The request body carries the token.
  const logRefused = add(model, 'LogAppend', 24, 48);
  logRefused.raw.message = parseExpression(
    '"Dynalist refused the item. HTTP {httpCode}\\n" ++ trim(httpBody)',
  );
  logRefused.raw.whenLogging = parseExpression('0');

  const refused = add(model, 'ToastShow', 24, 54);
  refused.raw.message = parseExpression(
    '"Dynalist refused it. See the flow log.\\n" ++ substr(trim(httpBody), 0, 100)',
  );

  const logUnreachable = add(model, 'LogAppend', 34, 36);
  logUnreachable.raw.message = parseExpression('"Could not reach Dynalist. {shareError}"');
  logUnreachable.raw.whenLogging = parseExpression('0');

  const unreachable = add(model, 'ToastShow', 34, 42);
  unreachable.raw.message = parseExpression('"Could not reach Dynalist.\\n{shareError}"');

  connect(model, begin.id, 'onComplete', tokenPath.id);
  connect(model, tokenPath.id, 'onComplete', haveToken.id);
  connect(model, haveToken.id, 'onPositive', readToken.id);
  connect(model, haveToken.id, 'onNegative', askToken.id);
  connect(model, readToken.id, 'onComplete', share.id);
  connect(model, askToken.id, 'onPositive', makeDir.id);
  connect(model, makeDir.id, 'onComplete', saveToken.id);
  // Cancelling the token dialog ends the flow. There is nothing it can do.
  connect(model, saveToken.id, 'onComplete', share.id);

  connect(model, share.id, 'onComplete', guard.id);
  connect(model, guard.id, 'onComplete', post.id);
  connect(model, guard.id, 'onFailure', logUnreachable.id);
  connect(model, logUnreachable.id, 'onComplete', unreachable.id);
  connect(model, post.id, 'onComplete', accepted.id);
  connect(model, accepted.id, 'onPositive', saved.id);
  connect(model, accepted.id, 'onNegative', logRefused.id);
  connect(model, logRefused.id, 'onComplete', refused.id);

  // Every path returns to the share block, so the flow catches the next share.
  connect(model, saved.id, 'onComplete', share.id);
  connect(model, refused.id, 'onComplete', share.id);
  connect(model, unreachable.id, 'onComplete', share.id);

  return model;
}

function main(): void {
  const out = process.argv[2] ?? 'Save link to Dynalist.flo';
  const model = buildFlow();

  const problems = validateModel(model);
  if (problems.length) throw new Error(problems.join('\n'));

  const findings = lintFlow(model).filter((f) => f.severity === 'error');
  if (findings.length) throw new Error(formatFindings(findings));

  const bytes = fromModel(model);
  if (toModel(bytes).blocks.length !== model.blocks.length) {
    throw new Error('reload lost blocks');
  }

  writeFileSync(out, bytes);
  console.log(`wrote ${out} — ${model.blocks.length} blocks, ${bytes.length} bytes`);
}

if (process.argv[1]?.endsWith('share-to-dynalist.ts')) main();
