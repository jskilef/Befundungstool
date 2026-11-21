'use strict';
// Navigation and permission rules for the desktop window. Pure functions without an Electron import,
// so tests/engine/desktop-policy.cjs can check them in plain Node.

// Fixed port: localStorage, the encrypted vault, drafts and cached models belong to the origin
// (including the port), so a changing port would hide the user's data. 8788 stays with `npm start`.
const DEFAULT_PORT = 8790;

function appOrigin(port) {
  return `http://127.0.0.1:${port}`;
}

function parse(url) {
  try { return new URL(url); } catch { return null; }
}

function isAppUrl(url, origin) {
  return parse(url)?.origin === origin;
}

// Links that leave the app open in the default browser, but only plain https: (no file:, javascript:,
// custom protocols or credentials in the URL).
function isExternalLink(url) {
  const parsed = parse(url);
  return !!parsed && parsed.protocol === 'https:' && !parsed.username && !parsed.password;
}

// Microphone (audio only) for offline dictation, and write-only clipboard access for "Befund kopieren".
// Everything else is denied, including camera, notifications, geolocation and clipboard reads.
function allowPermission(permission, { origin, requestingUrl, mediaTypes } = {}) {
  if (!isAppUrl(requestingUrl, origin)) return false;
  if (permission === 'clipboard-sanitized-write') return true;
  if (permission !== 'media') return false;
  // A request without media types (device enumeration) or with video is not a microphone request.
  return Array.isArray(mediaTypes) && mediaTypes.length > 0 && mediaTypes.every(type => type === 'audio');
}

// Permission checks (navigator.permissions.query, enumerateDevices) carry one media type.
function allowPermissionCheck(permission, { origin, requestingUrl, mediaType } = {}) {
  if (!isAppUrl(requestingUrl, origin)) return false;
  if (permission === 'clipboard-sanitized-write') return true;
  return permission === 'media' && (mediaType === 'audio' || mediaType === undefined || mediaType === 'unknown');
}

module.exports = { DEFAULT_PORT, appOrigin, isAppUrl, isExternalLink, allowPermission, allowPermissionCheck };
