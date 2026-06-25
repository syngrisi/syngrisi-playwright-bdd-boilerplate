export const config = {
  baseUrl: process.env.SYNGRISI_BASE_URL || 'http://localhost:5566/',
  apiKey: process.env.SYNGRISI_API_KEY || '',
  project: process.env.SYNGRISI_PROJECT || 'Default',
  branch: process.env.SYNGRISI_BRANCH || 'main',
  runName: process.env.SYNGRISI_RUN_NAME,
  runIdent: process.env.SYNGRISI_RUN_INDENT,
};
