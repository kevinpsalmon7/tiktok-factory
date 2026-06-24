// Netlify Scheduled Function — replaces the Vercel Cron defined in vercel.json.
// Runs every 5 minutes and triggers the existing Next.js route /api/threads/cron,
// which publishes any due scheduled Threads posts. All publishing logic stays in
// the Next.js route; this function is just the scheduler + authenticated trigger.
//
// IMPORTANT — double-publish safety:
// While Vercel is kept as a fallback, its cron is still firing every 5 min. If
// BOTH platforms triggered the cron, due posts could be published twice. So this
// function is a no-op unless THREADS_CRON_ENABLED=true is set in Netlify env.
// Cutover steps:
//   1. Remove the "crons" block from vercel.json (or pause/delete the Vercel project)
//   2. Set THREADS_CRON_ENABLED=true in Netlify > Site settings > Environment variables

export const config = {
  schedule: '*/5 * * * *',
}

export default async () => {
  if (process.env.THREADS_CRON_ENABLED !== 'true') {
    return new Response('threads cron disabled (set THREADS_CRON_ENABLED=true to enable)', { status: 200 })
  }

  // Netlify injects URL (production) / DEPLOY_PRIME_URL (deploy previews) automatically.
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL
  if (!base) {
    return new Response('No site URL available in env', { status: 500 })
  }

  const secret = process.env.CRON_SECRET
  const res = await fetch(`${base}/api/threads/cron`, {
    method: 'GET',
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  })

  const body = await res.text()
  return new Response(body, { status: res.status })
}
