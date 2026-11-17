import { createElement } from 'react';

/**
 * Embeds a PageSignal workspace served under the parent application's origin.
 * Authentication should be supplied by the host application or its proxy.
 */
export function PageSignalWorkspace({
  src = '/pagesignal/',
  title = 'PageSignal document workspace',
  height = '800px',
  className
}) {
  if (typeof src !== 'string' || !src.startsWith('/') ||
      src.startsWith('//') || /[\\\r\n]/.test(src)) {
    throw new TypeError('Use a same-origin workspace path, such as /pagesignal/.');
  }
  return createElement('iframe', {
    src,
    title,
    className,
    style: { width: '100%', height, border: 0 },
    referrerPolicy: 'same-origin'
  });
}
