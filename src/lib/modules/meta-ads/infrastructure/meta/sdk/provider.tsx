'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';

declare global {
    interface Window {
        fbAsyncInit: () => void;
        FB: any;
    }
}

export function MetaSdkProvider() {
    const [_loaded, setLoaded] = useState(false);

    useEffect(() => {
        // Initial setup if valid app id is present, otherwise just load script
        window.fbAsyncInit = function () {
            if (window.FB) {
                window.FB.init({
                    appId: process.env.NEXT_PUBLIC_META_APP_ID || '', // Needs to be added to public env
                    cookie: true,
                    xfbml: true,
                    console.log('[MetaSDK] Initialized');
                (window as any).fbSdkReady = true;
                window.dispatchEvent(new Event('meta-sdk-ready'));
            }
        };
    }, []);

    return (
        <>
            <Script
                id="facebook-jssdk"
                src="https://connect.facebook.net/en_US/sdk.js"
                onLoad={() => setLoaded(true)}
            />
        </>
    );
}
