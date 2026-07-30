/**
 * Block metadata generated from the app: titles, summaries, icons, doc pages,
 * ports and fields for all 410 block types.
 *
 * This lives apart from `model.ts` so that `blocks.ts` can use it without a
 * circular import — `model.ts` depends on `blocks.ts` for field typing.
 */

import catalogJson from '../data/catalog.json';
import type { Catalog } from './types';

export const catalog = catalogJson as unknown as Catalog;
