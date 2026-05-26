// @ts-check
import { withSentryConfig } from '@sentry/nextjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@wholesale-crm/db'],
};

// withSentryConfig is a no-op wrapper when SENTRY_DSN is not set
export default withSentryConfig(nextConfig, {
  // Suppress warnings when SENTRY_DSN is not configured
  silent: true,
  // Disable source map uploads by default (requires SENTRY_AUTH_TOKEN)
  disableServerWebpackPlugin: !process.env.SENTRY_DSN,
  disableClientWebpackPlugin: !process.env.SENTRY_DSN,
  hideSourceMaps: true,
});
