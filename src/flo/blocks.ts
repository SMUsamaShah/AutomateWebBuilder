/**
 * Presentation rules for blocks: which connectors a block shows, where they
 * sit, and how the block summarises itself.
 *
 * Port placement comes from the block layout each statement class declares in
 * the APK (`block_action`, `block_decision`, …), so the arrangement matches the
 * phone app: input on top, primary continuation on the bottom, secondary
 * branch on the right.
 */

import { catalog } from './catalog';
import { schema } from './codec';
import { renderExpression, isExpression } from './expr';
import type { CatalogEntry, FloObject } from './types';

export type PortSide = 'top' | 'bottom' | 'right';

export interface PortSpec {
  /** Field on the statement holding the successor reference. */
  field: string;
  side: PortSide;
  /** Badge text, e.g. IN / OK / YES / NO. */
  label: string;
  color: string;
}

/** The app's own connector palette, sampled from its rendering. */
export const COLORS = {
  blue: '#218AE6',
  green: '#42A24A',
  red: '#E63931',
  orange: '#EF8A00',
  purple: '#9C27B0',
  blockFill: '#EFEBEF',
  ink: '#211C21',
  grid: 'rgba(0,0,0,0.13)',
} as const;

/** Connector kinds declared by the app's block layouts. */
const CONNECTOR: Record<string, { label: string; color: string; side: PortSide }> = {
  In: { label: 'IN', color: COLORS.blue, side: 'top' },
  Go: { label: 'GO', color: COLORS.blue, side: 'bottom' },
  Ok: { label: 'OK', color: COLORS.blue, side: 'bottom' },
  Yes: { label: 'YES', color: COLORS.green, side: 'bottom' },
  No: { label: 'NO', color: COLORS.red, side: 'right' },
  Fail: { label: 'FAIL', color: COLORS.red, side: 'right' },
  NotAvailable: { label: 'N/A', color: COLORS.red, side: 'right' },
  Do: { label: 'DO', color: COLORS.orange, side: 'right' },
  Set: { label: 'SET', color: COLORS.orange, side: 'right' },
  Up: { label: 'UP', color: COLORS.orange, side: 'right' },
  New: { label: 'NEW', color: COLORS.purple, side: 'right' },
};

/**
 * Output connectors per block layout, in the order the layout declares them.
 * Mirrors `res/layout/block_*.xml`; the input connector is handled separately
 * because every non-beginning block has exactly one.
 */
const LAYOUT_OUTPUTS: Record<string, string[]> = {
  block_action: ['Ok'],
  block_beginning: ['Go'],
  block_decision: ['Yes', 'No'],
  block_try: ['Ok', 'No'],
  block_failure_catch: ['Ok', 'Fail'],
  block_for_each: ['Ok', 'Do'],
  block_fork: ['Ok', 'New'],
  block_goto: ['NotAvailable'],
  block_key_pressed: ['Yes', 'Up'],
  block_process_text: ['Ok', 'Set'],
  block_terminal: [],
};

/** Layouts whose blocks have no input connector. */
const NO_INPUT = new Set(['block_beginning']);

/** Statement-reference fields, in wire order (the layout order matches). */
function statementFields(typeId: number): string[] {
  const rec = schema[String(typeId)];
  if (!rec?.ops) return [];
  return rec.ops
    .filter((op) => op.op === 'obj' && op.cast === 'com.llamalab.automate.InterfaceC1482k2')
    .map((op) => op.f);
}

const portCache = new Map<number, PortSpec[]>();

/** Output ports for a block type, ready to draw. */
export function outputPorts(typeId: number): PortSpec[] {
  const cached = portCache.get(typeId);
  if (cached) return cached;

  const entry = catalog[String(typeId)];
  const layout = entry?.layout ?? 'block_action';
  const kinds = LAYOUT_OUTPUTS[layout] ?? ['Ok'];
  const fields = statementFields(typeId);

  // Decisions serialise onPositive before onNegative, matching YES then NO.
  const ports: PortSpec[] = [];
  for (let i = 0; i < kinds.length && i < fields.length; i++) {
    const c = CONNECTOR[kinds[i]];
    if (!c) continue;
    ports.push({ field: fields[i], side: c.side, label: c.label, color: c.color });
  }
  portCache.set(typeId, ports);
  return ports;
}

export function hasInputPort(typeId: number): boolean {
  const entry = catalog[String(typeId)];
  return !NO_INPUT.has(entry?.layout ?? 'block_action');
}

/** Fields worth offering in the inspector (expressions, text, flags). */
export function editableFields(typeId: number): Array<{ name: string; op: string }> {
  const rec = schema[String(typeId)];
  if (!rec?.ops) return [];
  const ports = new Set(statementFields(typeId));
  const seen = new Set<string>();
  const out: Array<{ name: string; op: string }> = [];
  for (const op of rec.ops) {
    if (ports.has(op.f)) continue;
    if (op.f.startsWith('_anon')) continue;
    if (op.f === 'f15575X' || op.f === 'f15576Y' || op.f === 'f15577Z') continue;
    if (seen.has(op.f)) continue;
    seen.add(op.f);
    out.push({ name: op.f, op: op.op });
  }
  return out;
}

/**
 * What a field will accept.
 *
 * `op: 'obj'` does **not** mean "any expression". The app casts these fields as
 * it reads them, so the wrong node type is a `ClassCastException` when Automate
 * loads the flow — 616 of 2,424 argument fields are strictly typed this way.
 */
export type FieldKind =
  | 'expression' // any expression node
  | 'variable' // must be a variable reference (I3.l)
  | 'variable-array' // { _arr: [...] } of variable references, e.g. destructuring targets
  | 'integer' // must be a boxed java.lang.Integer
  | 'statement' // a port; use connect()/disconnect(), never assign
  | 'text' // plain string
  | 'flag' // 0 or 1
  | 'number'
  | 'bigint'
  | 'array' // { _arr: [...] } or { _kv: [...] }
  | 'opaque'; // round-trips, not meaningfully editable

const CAST_KIND: Record<string, FieldKind> = {
  'com.llamalab.automate.InterfaceC1482k2': 'statement',
  'I3.l': 'variable',
  'java.lang.Integer': 'integer',
};

/** What `field` on this block type accepts, or null if it has no such field. */
export function fieldKind(typeId: number, field: string): FieldKind | null {
  const op = (schema[String(typeId)]?.ops ?? []).find((o) => o.f === field);
  if (!op) return null;
  switch (op.op) {
    case 'obj':
      return (op.cast && CAST_KIND[op.cast]) || 'expression';
    case 'objarray':
    case 'varargs':
      // The cast matters here too: a destructuring block's targets are an array
      // of variable references, not of arbitrary expressions.
      return op.cast === 'I3.l[]' ? 'variable-array' : 'array';
    case 'kvpairs':
      return 'array';
    case 'utf':
    case 'utf_null':
      return 'text';
    case 'u8':
      return 'flag';
    case 'svar64':
    case 'i64':
      return 'bigint';
    case 'parcel':
    case 'convtype':
      return 'opaque';
    default:
      return 'number';
  }
}

/** Human label for an obfuscated field name. */
export function fieldLabel(name: string): string {
  if (/^f\d+[A-Z]\d*$/.test(name)) return name; // unrecovered obfuscated name
  const spaced = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Arguments that describe *what* a block does, most descriptive first. The app
 * hand-writes a caption per block type; ranking the arguments this way gets
 * close enough to be recognisable without 400 bespoke formatters.
 */
const CAPTION_PREFERENCE = [
  'expression',
  'message',
  'text',
  'command',
  'title',
  'name',
  'url',
  'path',
  'sourceFile',
  'targetFile',
  'zipFile',
  'value',
  'content',
  'query',
  'packageName',
  'className',
  'action',
  'uri',
  'duration',
  'variable',
  'key',
];

/** Arguments that are switches or plumbing rather than descriptions. */
const CAPTION_SKIP = new Set([
  'continuity',
  'wakeup',
  'startActivity',
  'notificationChannelId',
  'timeout',
  'charset',
  'recursive',
  'trust',
  'dontRedirect',
  'saveResponse',
  'flags',
  'immediate',
]);

/** Render a field's value as caption text, or null when it has nothing to say. */
function captionValue(raw: FloObject, name: string): string | null {
  const v = raw[name];
  if (v === null || v === undefined) return null;
  if (isExpression(v)) {
    const text = renderExpression(v as never);
    return text && text !== '""' ? text : null;
  }
  if (typeof v === 'string' && v) return `"${v}"`;
  return null;
}

/**
 * One-line description of a block, approximating the app's block captions:
 * the block title plus its most salient argument.
 */
export function describeBlock(raw: FloObject, entry?: CatalogEntry): string {
  const title = entry?.title ?? entry?.name ?? `Type ${raw._type}`;
  const names = editableFields(raw._type)
    .map((f) => f.name)
    .filter((n) => !CAPTION_SKIP.has(n));

  const ranked = [
    ...CAPTION_PREFERENCE.filter((p) => names.includes(p)),
    ...names.filter((n) => !CAPTION_PREFERENCE.includes(n)),
  ];

  for (const name of ranked) {
    const text = captionValue(raw, name);
    if (text) {
      const clipped = text.length > 42 ? text.slice(0, 41) + '…' : text;
      return `${title} ${clipped}`;
    }
  }
  return title;
}

/** Category name derived from the block's documentation page grouping. */
export function blockCategory(entry: CatalogEntry): string {
  return CATEGORY_BY_ID[entry.id] ?? 'Other';
}

/**
 * Block categories, following the grouping used by the app's block picker and
 * the online documentation index.
 */
const CATEGORY_RANGES: Array<[string, RegExp]> = [
  ['Apps', /^(App|Activity|Service|Shortcut|Intent|Resolve|Preferred|Alternative|ProcessText|Assist|GoogleAssistant|Broadcast|Fullscreen|Interact|InspectLayout|InspectTextEdit|FloatingButton|AccessibilityButton|KeyPressed|KeySend|MediaButton|Screenshot|SplitScreen|FeatureUsage|Adb)/],
  ['Battery & power', /^(Battery|Power|Device(Reboot|Shutdown|Restart|IdleMode|KeepAwake)|CpuSpeed|DisplayPowerMode|DisplayOn|ScreenBrightness|ScreenOffTimeout|DeviceInteractive|AttentionLight|Flashlight)/],
  ['Camera & sound', /^(Camera|Capture|TakePicture|Video|Audio|Sound|Speak|Speakerphone|Tone|Dtmf|Vibrate|Microphone|Ringtone|Ringer|Media(Playing|TagsRead|Store)|Image|Barcode|TextRecognition|QrCode|Wallpaper|InfraredTransmit)/],
  ['Concurrency', /^(Atomic|Variables(Give|Take)|Fork|Fiber)/],
  ['Connectivity', /^(Wifi|Bluetooth|Nfc|Usb|Network|MobileData|MobileNetwork|MobileOperator|MobileService|Http|Ftp|Nsd|Ping|WakeOnLan|DataUsage|DataNetwork|Ethernet|Roaming|AirplaneMode|Cell|RestrictBackground|Subscription)/],
  ['Content', /^(Account|Calendar|Contact|Content|Database|ClipboardGet|ClipboardSet|KeyChain)/],
  ['Date & time', /^(Delay|Time|Date|Duration|Alarm|Timer|Clock)/],
  ['File & storage', /^(File|Zip|GDrive|OneDrive|Storage|MediaStoreAdd|MediaStoreRemove)/],
  ['Flow', /^(Flow|Goto|Label|Subroutine|Return|FailureCatch|LogAppend|LogAwait|ForEach)/],
  ['General', /^(Variable|Array|Dictionary|Destructuring|Expression)/],
  ['Interface', /^(Dialog|Toast|Notification|Interface|Icon|Color|Quick|Input|Software|Hardware|Screen|Display|Night|Car|Interruption|Hotword|UserAsleep|Proximity)/],
  ['Location', /^(Location|Geocoding|Weather|Distance)/],
  ['Messaging', /^(Sms|Mms|Email|Gmail|Compose|Cloud)/],
  ['Sensor', /^(Ambient|Atmospheric|Magnetic|Heart|Hinge|Relative|Pedometer|Physical|Significant|DeviceAcceleration|DeviceOrientation|MotionGesture|Fingerprint|SoundLevel)/],
  ['Settings', /^(System|Setting|Language|TimeZone|Profile|CyanogenMod|AppOp)/],
  ['Telephony', /^(Call|Dial|Ussd|Wired|PlugIn)/],
];

const CATEGORY_BY_ID: Record<number, string> = {};
for (const [id, entry] of Object.entries(catalog)) {
  const name = (entry as CatalogEntry).name;
  const hit = CATEGORY_RANGES.find(([, rex]) => rex.test(name));
  CATEGORY_BY_ID[Number(id)] = hit ? hit[0] : 'Other';
}

/** All categories present, ordered for the palette. */
export function categories(): string[] {
  const set = new Set(Object.values(CATEGORY_BY_ID));
  const ordered = CATEGORY_RANGES.map(([c]) => c).filter((c) => set.has(c));
  if (set.has('Other')) ordered.push('Other');
  return ordered;
}
