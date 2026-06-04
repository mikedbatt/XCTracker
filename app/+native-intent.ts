// Expo Router deep-link interception.
//
// Strava OAuth redirects back to `xctracker://strava-auth?code=...`. Expo Router
// owns deep-link routing and has no `strava-auth` route, so without this it
// renders "Unmatched route. Page could not be found." We rewrite that callback
// to the index route so the router resolves to a real screen; the in-app
// `Linking` 'url' listener in StravaConnect still receives the raw URL and
// completes the token exchange. All other deep links (e.g. push notifications)
// pass through untouched.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (path.includes('strava-auth')) return '/';
    return path;
  } catch {
    return '/';
  }
}
