'use client'

import Script from 'next/script'

const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? ''
const NAVER_ID = process.env.NEXT_PUBLIC_NAVER_ANALYTICS_ID ?? ''

export function Analytics() {
  return (
    <>
      {/* Google Analytics 4 */}
      {GA_ID && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_ID}');
            `}
          </Script>
        </>
      )}

      {/* Naver Analytics */}
      {NAVER_ID && (
        <Script id="naver-analytics" strategy="afterInteractive">
          {`
            if(!wcs_add) var wcs_add = {};
            wcs_add["wa"] = "${NAVER_ID}";
            if(window.wcs) { wcs_do(); }
          `}
        </Script>
      )}
      {NAVER_ID && (
        <Script src="https://wcs.naver.net/wcslog.js" strategy="afterInteractive" />
      )}
    </>
  )
}
