import React, { useRef, useLayoutEffect, useState } from 'react';

// --- Helper to calculate aspect ratio ---
const gcd = (a: number, b: number): number => {
  return b === 0 ? a : gcd(b, a % b);
};

// --- Device Presets ---
const devices = [
  // Phones
  { name: 'iPhone SE', width: 375, height: 667, key: 'iPhoneSE' },
  { name: 'iPhone 12/13 Mini', width: 375, height: 812, key: 'iPhone13Mini' },
  { name: 'iPhone 13', width: 390, height: 844, key: 'iPhone13' },
  { name: 'iPhone 13 Pro Max', width: 428, height: 926, key: 'iPhone13ProMax' },
  { name: 'iPhone 14', width: 390, height: 844, key: 'iPhone14' },
  { name: 'iPhone 14 Plus', width: 428, height: 926, key: 'iPhone14Plus' },
  { name: 'iPhone 14 Pro Max', width: 430, height: 932, key: 'iPhone14ProMax' },
  { name: 'Pixel 7', width: 412, height: 915, key: 'Pixel7' },
  { name: 'Galaxy S22', width: 360, height: 780, key: 'GalaxyS22' },
  { name: 'Galaxy Fold (Unfolded)', width: 673, height: 841, key: 'GalaxyFold' },
  // Tablets
  { name: 'iPad Mini', width: 768, height: 1024, key: 'iPadMini' },
  { name: 'iPad Air', width: 820, height: 1180, key: 'iPadAir' },
  { name: 'iPad Pro 11"', width: 834, height: 1194, key: 'iPadPro11' },
  { name: 'iPad Pro 12.9"', width: 1024, height: 1366, key: 'iPadPro12_9' },
  // Laptops & Desktops
  { name: 'Laptop (13")', width: 1280, height: 800, key: 'Laptop13' },
  { name: 'Laptop (15")', width: 1440, height: 900, key: 'Laptop15' },
  { name: 'Desktop (HD)', width: 1366, height: 768, key: 'DesktopHD' },
  { name: 'Desktop (FHD)', width: 1920, height: 1080, key: 'DesktopFHD' },
  { name: 'Desktop (QHD)', width: 2560, height: 1440, key: 'DesktopQHD' },
  { name: 'Desktop (4K)', width: 3840, height: 2160, key: 'Desktop4K' },
];

// --- Tool Specific Types ---
export interface ScreenSizeCheckerState {
  type: 'screen-size-checker';
  url: string;
  displayUrl: string;
  selectedDevice: string;
  orientation: 'portrait' | 'landscape';
  isLoading: boolean;
}

export const defaultScreenSizeCheckerState: Omit<ScreenSizeCheckerState, 'type'> = {
  url: 'https://iammazharul.com',
  displayUrl: 'https://iammazharul.com',
  selectedDevice: 'iPhone13ProMax',
  orientation: 'portrait',
  isLoading: true,
};

// --- Component ---
export const ScreenSizeChecker: React.FC<{
  state: Partial<ScreenSizeCheckerState> | undefined;
  onChangeState: (newState: Partial<ScreenSizeCheckerState>) => void;
  accentColor: string;
  primaryButtonTextColor: string;
}> = ({ state, onChangeState, accentColor, primaryButtonTextColor }) => {
  const currentState = { ...defaultScreenSizeCheckerState, ...state, type: 'screen-size-checker' as const };
  const { url, displayUrl, selectedDevice, orientation, isLoading } = currentState;

  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const selectedDeviceData = devices.find(d => d.key === selectedDevice) || devices[0];
  
  const width = orientation === 'portrait' ? selectedDeviceData.width : selectedDeviceData.height;
  const height = orientation === 'portrait' ? selectedDeviceData.height : selectedDeviceData.width;

  useLayoutEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: containerWidth, height: containerHeight } = entry.contentRect;
        
        const padding = 32; // 16px on each side for breathing room
        const availableWidth = containerWidth - padding;
        const availableHeight = containerHeight - padding;

        if (width > 0 && height > 0) {
            const scaleX = availableWidth / width;
            const scaleY = availableHeight / height;
            
            const newScale = Math.min(scaleX, scaleY, 1); // Cap at 1 to prevent upscaling
            
            setScale(newScale);
        }
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, [width, height]);

  const handleLoad = () => {
    let finalUrl = url;
    if (url.trim() && !url.startsWith('http://') && !url.startsWith('https://')) {
        finalUrl = `https://${url}`;
    }
    onChangeState({ displayUrl: finalUrl, isLoading: true });
  };
  
  const handleIframeLoad = () => {
    onChangeState({ isLoading: false });
  };

  return (
    <div className="w-full h-full flex flex-col gap-4 text-black overflow-hidden">
      <div className="flex items-center gap-2 w-full flex-shrink-0">
        <input
          type="text"
          value={url}
          onChange={(e) => onChangeState({ url: e.target.value })}
          onKeyDown={(e) => { if (e.key === 'Enter') handleLoad(); }}
          placeholder="Enter website URL"
          className="w-full p-2 rounded-md border border-gray-400 bg-white focus:ring-2 focus:ring-black focus:outline-none"
        />
        <button
          onClick={handleLoad}
          style={{ backgroundColor: accentColor, color: primaryButtonTextColor }}
          className="font-bold py-2 px-6 rounded-lg hover:opacity-90 transition-opacity"
          aria-label="Load website in preview"
        >
          Load
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
        <select
          value={selectedDevice}
          onChange={(e) => onChangeState({ selectedDevice: e.target.value })}
          className="flex-grow p-2 rounded-md border border-gray-400 bg-white focus:ring-2 focus:ring-black focus:outline-none"
          aria-label="Select device for preview"
        >
          {devices.map(device => {
            const divisor = gcd(device.width, device.height);
            const aspectWidth = device.width / divisor;
            const aspectHeight = device.height / divisor;
            const aspectString = `${aspectWidth}:${aspectHeight}`;

            return (
                <option key={device.key} value={device.key}>
                {device.name} - {device.width}x{device.height} ({aspectString})
                </option>
            );
          })}
        </select>
        <button
          onClick={() => onChangeState({ orientation: orientation === 'portrait' ? 'landscape' : 'portrait' })}
          className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors flex items-center gap-2"
          title="Toggle Orientation"
          aria-label={`Switch to ${orientation === 'portrait' ? 'landscape' : 'portrait'} view`}
        >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ transform: orientation === 'landscape' ? 'rotate(90deg)' : 'none', transition: 'transform 0.3s' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
           <span>{width} x {height}</span>
        </button>
      </div>

      <div 
        ref={previewContainerRef}
        className="flex-grow bg-black/10 rounded-lg p-4 flex items-center justify-center overflow-hidden min-h-0"
      >
        <div 
          className="relative flex-shrink-0 bg-white shadow-2xl rounded-xl overflow-hidden transition-transform duration-300 ease-in-out"
          style={{ 
            width: `${width}px`, 
            height: `${height}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
          }}
        >
          {isLoading && (
             <div className="absolute inset-0 flex justify-center items-center bg-white z-10" aria-label="Loading website preview">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
             </div>
          )}
          <iframe
            src={displayUrl}
            onLoad={handleIframeLoad}
            className="w-full h-full border-0"
            title="Website Preview"
            sandbox="allow-forms allow-modals allow-pointer-lock allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          ></iframe>
        </div>
      </div>
    </div>
  );
};