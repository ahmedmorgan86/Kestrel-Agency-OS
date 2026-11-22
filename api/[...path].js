export default function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  response.status(503).json({
    error:
      'MORGAN GROUP operations are not connected on this Vercel deployment. A private, persistent company database must be configured before operational use.',
    status: 'database_not_configured',
  });
}
