import { useEffect, useRef } from 'react';

export default function HealthAvatar({ isSpeaking }) {
  const containerRef = useRef(null);
  const iframeRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Clean old iframe
    if (iframeRef.current && containerRef.current.contains(iframeRef.current)) {
      containerRef.current.removeChild(iframeRef.current);
    }

    const iframe = document.createElement('iframe');
    // Correct RPM viewer URL
    iframe.src = 'https://models.readyplayer.me/672a0c6e9b3b5d5d2c7d8e1f.glb?frame';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = '0';
    iframe.style.background = 'transparent';
    iframe.allowFullscreen = true;
    iframe.allow = 'autoplay; fullscreen; xr-spatial-tracking';
    iframe.loading = 'lazy';

    containerRef.current.appendChild(iframe);
    iframeRef.current = iframe;

    const sendSpeak = () => {
      if (!iframe.contentWindow || !isSpeaking) return;
      iframe.contentWindow.postMessage({
        type: 'rpm_speak',
        text: 'I am speaking.',
        voice: 'en_us_001'
      }, '*');
    };

    iframe.onload = () => setTimeout(() => isSpeaking && sendSpeak(), 1500);
    const interval = setInterval(() => isSpeaking && sendSpeak(), 1000);

    return () => {
      clearInterval(interval);
      if (iframeRef.current && containerRef.current.contains(iframeRef.current)) {
        containerRef.current.removeChild(iframeRef.current);
      }
    };
  }, [isSpeaking]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '380px',
        borderRadius: '8px',
        overflow: 'hidden',
        background: '#f0f4f8',
        position: 'relative'
      }}
    >
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        color: '#666',
        fontSize: '14px',
        pointerEvents: 'none'
      }}>
        Loading 3D Doctor...
      </div>
    </div>
  );
}