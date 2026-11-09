// Reports take longer than a normal function may run. The "-background" name gives this one up to 15 minutes.
// A job only runs while it is queued, so calling this again for the same report does nothing.
import '../env.js';
import { runJob, validId } from '../../server/lib/store.js';

export default async (request) => {
  const { id } = await request.json().catch(() => ({}));
  if (validId(id)) await runJob(id);
};
