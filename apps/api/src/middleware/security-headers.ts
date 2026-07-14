import { secureHeaders } from 'hono/secure-headers';

/** API headers — SAMEORIGIN framing so SCORM iframes on /api/scorm/* work from the web app. */
export const apiSecurityHeaders = secureHeaders({
  xFrameOptions: 'SAMEORIGIN',
  referrerPolicy: 'strict-origin-when-cross-origin',
  crossOriginResourcePolicy: 'same-site',
  strictTransportSecurity: false,
  permissionsPolicy: {
    camera: [],
    microphone: [],
    geolocation: [],
    payment: [],
    usb: [],
  },
});
