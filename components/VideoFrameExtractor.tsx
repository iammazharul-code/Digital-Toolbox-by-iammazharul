import React, { useRef, useEffect, useState, useCallback } from 'react';

declare var JSZip: any;

// --- Tool Specific Types ---
type ExtractedFrame = {
  id: string; // Unique ID for each frame
  timestamp: number;
  previewUrl: string;
  processedBlob?: Blob;
  processedWidth?: number;
  processedHeight?: number;
  processedSize?: number;
  displayName: string;
};

export interface VideoFrameExtractorState {
  type: 'video-extractor';
  videoFile?: File;
  videoUrl?: string;
  videoDuration: number;
  markers: number[]; // Store timestamps in seconds
  extractedFrames: ExtractedFrame[];
  newName: string;
  resolution: number;
  outputFormat: 'jpeg' | 'png';
  compression: boolean;
  isProcessing: boolean;
  isPreviewCollapsed: boolean;
}

export const defaultExtractorState: Omit<VideoFrameExtractorState, 'type'> = {
  videoFile: undefined,
  videoUrl: undefined,
  videoDuration: 0,
  markers: [],
  extractedFrames: [],
  newName: '',
  resolution: 720,
  outputFormat: 'jpeg',
  compression: true,
  isProcessing: false,
  isPreviewCollapsed: false,
};

export const VideoFrameExtractor: React.FC<{
  state: Partial<VideoFrameExtractorState> | undefined;
  onChangeState: (newState: Partial<VideoFrameExtractorState>) => void;
  accentColor: string;
  primaryButtonTextColor: string;
}> = ({ state, onChangeState, accentColor, primaryButtonTextColor }) => {
  const currentState = { ...defaultExtractorState, ...state, type: 'video-extractor' as const };
  const { newName, resolution, outputFormat, compression, isProcessing, videoFile, videoUrl, videoDuration, markers, extractedFrames, isPreviewCollapsed } = currentState;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const draggedItemIndex = useRef<number | null>(null);
  const dragOverItemIndex = useRef<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isDraggingPlayheadRef = useRef(false);

  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    return () => {
      // Clean up the object URL when the component unmounts or video changes
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const videoDurationRef = useRef(videoDuration);
  useEffect(() => {
    videoDurationRef.current = videoDuration;
  }, [videoDuration]);

  const handleTimelineUpdate = useCallback((clientX: number) => {
    if (!timelineRef.current || !videoRef.current) return;
    const timeline = timelineRef.current;
    const rect = timeline.getBoundingClientRect();
    const x = clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = videoDurationRef.current * percentage;
    if (isFinite(newTime)) {
        videoRef.current.currentTime = newTime;
        setCurrentTime(newTime);
    }
  }, []);

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (isDraggingPlayheadRef.current) {
              handleTimelineUpdate(e.clientX);
          }
      };
      const handleMouseUp = () => {
          isDraggingPlayheadRef.current = false;
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
      };
  }, [handleTimelineUpdate]);

  const handleTimelineMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      isDraggingPlayheadRef.current = true;
      handleTimelineUpdate(e.clientX);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleReset(); // Reset state for new video
      const url = URL.createObjectURL(file);
      onChangeState({ videoFile: file, videoUrl: url, isPreviewCollapsed: false });
    }
  };
  
  const handleReset = () => {
    extractedFrames.forEach(frame => URL.revokeObjectURL(frame.previewUrl));
    onChangeState({
      ...defaultExtractorState,
    });
    setCurrentTime(0);
    if(videoRef.current) videoRef.current.currentTime = 0;
  };

  const handleVideoMetadata = () => {
    if (videoRef.current) {
      onChangeState({ videoDuration: videoRef.current.duration });
    }
  };
  
  const handleTimeUpdate = () => {
    if (videoRef.current && !isDraggingPlayheadRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleAddMarker = () => {
    if (markers.includes(currentTime)) return; // Avoid duplicate markers
    onChangeState({ markers: [...markers, currentTime].sort((a,b)=>a-b) });
  };

  const handleRemoveMarker = (timestamp: number) => {
    onChangeState({ markers: markers.filter(m => m !== timestamp) });
  };

  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.floor(timeInSeconds % 60);
    const milliseconds = Math.round((timeInSeconds - Math.floor(timeInSeconds)) * 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  };
  
  const extractFrame = (video: HTMLVideoElement, maxHeight: number, format: 'jpeg' | 'png', enableCompression: boolean): Promise<{blob: Blob, width: number, height: number}> => {
    return new Promise((resolve, reject) => {
        let { videoWidth, videoHeight } = video;
        let finalWidth = videoWidth;
        let finalHeight = videoHeight;

        if (finalHeight > maxHeight) {
            const ratio = maxHeight / finalHeight;
            finalWidth = finalWidth * ratio;
            finalHeight = maxHeight;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('Could not get canvas context');
        
        if (format === 'jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, finalWidth, finalHeight);
        }

        ctx.drawImage(video, 0, 0, finalWidth, finalHeight);

        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const quality = mimeType === 'image/jpeg' ? (enableCompression ? 0.7 : 1.0) : undefined;
        
        canvas.toBlob(blob => {
            if (blob) {
                resolve({blob, width: Math.round(finalWidth), height: Math.round(finalHeight)});
            } else {
                reject('Canvas to blob failed');
            }
        }, mimeType, quality);
    });
  };

  const handleProcess = async () => {
    if (!videoRef.current || markers.length === 0) return;
    
    onChangeState({ isProcessing: true });
    
    const video = videoRef.current;
    const newFrames: ExtractedFrame[] = [];
    
    for (const [i, timestamp] of markers.entries()) {
      await new Promise<void>(resolve => {
        const onSeeked = async () => {
          video.removeEventListener('seeked', onSeeked);
          try {
              const { blob, width, height } = await extractFrame(video, resolution, outputFormat, compression);
              
              const newExtension = outputFormat === 'jpeg' ? '.jpg' : '.png';
              let baseName = newName.trim() !== '' ? `${newName.trim()}-${i + 1}` : `frame-${i + 1}`;
              const newDisplayName = `${baseName}${newExtension}`;
              
              const previewUrl = URL.createObjectURL(blob);

              newFrames.push({
                  id: `frame-${timestamp}-${Math.random()}`,
                  timestamp,
                  previewUrl,
                  processedBlob: blob,
                  processedWidth: width,
                  processedHeight: height,
                  processedSize: blob.size,
                  displayName: newDisplayName,
              });
          } catch(e) {
              console.error(`Failed to extract frame at ${timestamp}`, e);
          }
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
        video.currentTime = timestamp;
      });
    }

    // Revoke old blob URLs before setting new state
    extractedFrames.forEach(frame => URL.revokeObjectURL(frame.previewUrl));

    onChangeState({ extractedFrames: newFrames, isProcessing: false, isPreviewCollapsed: true });
  };
  
  const handleDownload = async () => {
    if (extractedFrames.length === 0) return;
    try {
        const zip = new JSZip();
        extractedFrames.forEach(frame => {
            zip.file(frame.displayName, frame.processedBlob as Blob);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        const baseName = newName.trim() !== '' ? newName.trim() : 'extracted-frames';
        const zipFileName = `${baseName}(1-${extractedFrames.length}).zip`;

        const link = document.createElement('a');
        link.href = URL.createObjectURL(zipBlob);
        link.download = zipFileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        console.error("Download failed:", error);
    }
  };

  const handleSingleDownload = (frameToDownload: ExtractedFrame) => {
    if (!frameToDownload.processedBlob) return;
    const link = document.createElement('a');
    link.href = frameToDownload.previewUrl;
    link.download = frameToDownload.displayName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const formatBytes = (bytes?: number) => {
      if (bytes === undefined) return '';
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
  
  const handleDragSort = () => {
    if (draggedItemIndex.current === null || dragOverItemIndex.current === null) return;
    let _frames = [...extractedFrames];
    const draggedItemContent = _frames.splice(draggedItemIndex.current, 1)[0];
    _frames.splice(dragOverItemIndex.current, 0, draggedItemContent);
    draggedItemIndex.current = null;
    dragOverItemIndex.current = null;
    onChangeState({ extractedFrames: _frames });
  };
  
  return (
    <div className="w-full h-full flex flex-col gap-4 text-black overflow-hidden">
      <input type="file" accept="video/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <div className="flex gap-2 w-full">
        <button onClick={() => fileInputRef.current?.click()} className="flex-grow bg-gray-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors text-lg">
          Upload Video
        </button>
        <button onClick={handleReset} className="flex-shrink-0 bg-gray-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors text-lg">
          Reset
        </button>
      </div>
      
      {/* Settings Row */}
      <div className="flex items-center gap-2 flex-wrap">
        {!isPreviewCollapsed && (
          <>
            <input type="text" value={newName} onChange={(e) => onChangeState({ newName: e.target.value })} placeholder="New base name (optional)" className="w-full p-2 rounded-md border border-gray-400 bg-white focus:ring-2 focus:ring-black focus:outline-none" />
            <select value={resolution} onChange={(e) => onChangeState({ resolution: parseInt(e.target.value, 10) })} className="p-2 rounded-md border border-gray-400 bg-white focus:ring-2 focus:ring-black focus:outline-none">
              <option value="1080">1080p</option>
              <option value="720">720p</option>
              <option value="480">480p</option>
              <option value="360">360p</option>
            </select>
            <select value={outputFormat} onChange={(e) => onChangeState({ outputFormat: e.target.value as 'jpeg' | 'png' })} className="p-2 rounded-md border border-gray-400 bg-white focus:ring-2 focus:ring-black focus:outline-none">
              <option value="jpeg">JPG</option>
              <option value="png">PNG</option>
            </select>
            <button onClick={() => onChangeState({ compression: !compression })} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                Compression: {compression ? 'On' : 'Off'}
            </button>
          </>
        )}

        <button 
          onClick={isPreviewCollapsed ? () => onChangeState({ isPreviewCollapsed: false }) : handleProcess} 
          disabled={!isPreviewCollapsed && (!videoFile || markers.length === 0 || isProcessing)} 
          style={{ backgroundColor: accentColor, color: primaryButtonTextColor }} 
          className="flex-grow font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
            {isPreviewCollapsed ? 'Change Settings' : (isProcessing ? 'Processing...' : 'Process')}
        </button>
        <button onClick={handleDownload} disabled={isProcessing || extractedFrames.length === 0} className="flex-grow bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
            Download
        </button>
      </div>
      
      {/* Video Preview and Timeline */}
      {videoUrl && !isPreviewCollapsed && (
        <div className="flex flex-col gap-2">
            <video
                ref={videoRef}
                src={videoUrl}
                onLoadedMetadata={handleVideoMetadata}
                onTimeUpdate={handleTimeUpdate}
                className="w-full aspect-video bg-black rounded-lg"
                controls
            />
            <div className="flex flex-col gap-1 font-mono text-sm">
                <div 
                  ref={timelineRef}
                  onMouseDown={handleTimelineMouseDown}
                  className="w-full h-4 bg-gray-300 rounded-full cursor-pointer relative"
                >
                  <div className="absolute top-0 left-0 h-full bg-blue-500 rounded-full" style={{ width: `${(currentTime / videoDuration) * 100}%` }}></div>
                  {markers.map(markerTime => (
                    <div 
                      key={markerTime}
                      onClick={(e) => { e.stopPropagation(); handleRemoveMarker(markerTime); }}
                      className="absolute top-[-4px] w-1 h-6 bg-red-500 transform -translate-x-1/2 cursor-pointer"
                      style={{ left: `${(markerTime / videoDuration) * 100}%`}}
                      title={`Remove marker at ${formatTime(markerTime)}`}
                    ></div>
                  ))}
                  <div className="absolute top-[-4px] w-1 h-6 bg-black transform -translate-x-1/2" style={{ left: `${(currentTime / videoDuration) * 100}%`}}></div>
                </div>
                <div className="flex justify-between items-center px-1">
                    <span>{formatTime(currentTime)} / {formatTime(videoDuration)}</span>
                    <div className="flex items-center gap-2">
                      <button onClick={handleAddMarker} disabled={!videoFile} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
                        Add Marker
                      </button>
                      <button onClick={() => onChangeState({ isPreviewCollapsed: true })} className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                        Hide Preview
                      </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Extracted Frames List */}
      <div ref={scrollContainerRef} className="flex-grow bg-black/10 rounded-lg p-2 overflow-y-auto min-h-0 hide-scrollbar">
        {extractedFrames.length === 0 ? (
           <div className="flex items-center justify-center h-full text-gray-500">{videoFile ? 'Add markers and process video to see frames.' : 'Upload a video to begin.'}</div>
        ) : (
          <>
            <div className="text-xs text-gray-500 font-mono mb-2 px-1">
              {extractedFrames.length} {extractedFrames.length === 1 ? 'Frame' : 'Frames'}
            </div>
            <ul className="space-y-2">
              {extractedFrames.map((frame, index) => (
                <li 
                  key={frame.id}
                  draggable
                  onDragStart={() => draggedItemIndex.current = index}
                  onDragEnter={() => dragOverItemIndex.current = index}
                  onDragEnd={handleDragSort}
                  onDragOver={(e) => e.preventDefault()}
                  className="flex items-center gap-3 bg-white/50 p-2 rounded-md text-xs font-mono cursor-grab active:cursor-grabbing"
                >
                  <div className="flex-shrink-0 text-gray-500" title="Drag to reorder">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                      </svg>
                  </div>
                  <img src={frame.previewUrl} alt={`Frame at ${frame.timestamp}`} className="w-32 aspect-[16/9] object-cover rounded-md flex-shrink-0 bg-gray-300" />
                  <div className="flex-grow grid grid-cols-2 gap-x-2 items-center">
                      <p className="col-span-2 text-sm truncate font-sans font-bold" title={frame.displayName}>{frame.displayName}</p>
                      <div className="text-gray-600">
                          <p>Timestamp: {formatTime(frame.timestamp)}</p>
                      </div>
                      <div className="text-green-700 font-semibold">
                          {frame.processedWidth && frame.processedHeight && (
                              <p>Output: {frame.processedWidth}x{frame.processedHeight}, {formatBytes(frame.processedSize)}</p>
                          )}
                      </div>
                  </div>
                  {frame.processedBlob && (
                    <button 
                      onClick={() => handleSingleDownload(frame)} 
                      title={`Download ${frame.displayName}`}
                      className="ml-2 flex-shrink-0 bg-gray-700 text-white font-bold p-2 rounded-md hover:bg-gray-600 transition-colors flex items-center justify-center w-8 h-8"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
};
