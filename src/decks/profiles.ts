// The Sofa's deck: its own database (ADR-0002 upstream: a product opens its
// own, never a sibling's), and tapes long enough for a record — twenty-five
// minutes, a side of vinyl and a half (T-043 upstream; the map holds 93).
import type { DbProfile } from '@sk/storage/db';

export const DECK: DbProfile = { name: 'sofa', tapeSecs: 1500 };
