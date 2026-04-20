// ── Batched `where-in` fetch ─────────────────────────────────────────────────
// Firestore's `in` operator is capped at 30 values. This helper chunks a list
// of IDs into 30-at-a-time batches, fires all batches in parallel, and returns
// both a flat array and an object keyed by the matching field.
//
// Used by CoachDashboard and ManageGroups to replace per-athlete serial loops.

import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const FIRESTORE_IN_LIMIT = 30;

/**
 * Fetch docs from `collectionName` where `field` is one of `ids`.
 *
 * @param {Object} opts
 * @param {string} opts.collectionName - e.g. 'runs'
 * @param {string} opts.field          - e.g. 'userId'
 * @param {string[]} opts.ids          - list of values to match
 * @returns {Promise<{docs: object[], byField: Record<string, object[]>}>}
 *   - `docs`: flat array of `{ id, ...data }`
 *   - `byField`: object grouping docs by their `field` value
 */
export async function batchDocsByIds({ collectionName, field, ids }) {
  if (!ids || ids.length === 0) {
    return { docs: [], byField: {} };
  }

  const uniqueIds = [...new Set(ids)];

  const batches = [];
  for (let i = 0; i < uniqueIds.length; i += FIRESTORE_IN_LIMIT) {
    batches.push(uniqueIds.slice(i, i + FIRESTORE_IN_LIMIT));
  }

  const snapshots = await Promise.all(
    batches.map(batch =>
      getDocs(query(collection(db, collectionName), where(field, 'in', batch)))
    )
  );

  const docs = [];
  for (const snap of snapshots) {
    snap.docs.forEach(d => docs.push({ id: d.id, ...d.data() }));
  }

  const byField = {};
  for (const d of docs) {
    const key = d[field];
    if (!byField[key]) byField[key] = [];
    byField[key].push(d);
  }

  return { docs, byField };
}
