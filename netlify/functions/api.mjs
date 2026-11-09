import '../env.js';
import { createApi } from '../../server/api.js';

const handle = createApi({
  startJob: async (id, request) => {
    const res = await fetch(new URL('/.netlify/functions/report-background', request.url), { method: 'POST', body: JSON.stringify({ id }) });
    if (!res.ok) throw new Error(`background function returned ${res.status}`);
  },
});

export default (request) => handle(request);

export const config = { path: '/api/*' };
