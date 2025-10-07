import React, { useRef, useEffect } from 'react';

declare var JSZip: any;

// --- Tool Specific Types ---
type ResizerFile = {
  id: string; // Use a unique ID for stable drag-and-drop
  originalFile: File;
  previewUrl: string;
  displayName: string;
  originalWidth?: number;
  originalHeight?: number;
  originalSize?: number;
  processedBlob?: Blob;
  processedWidth?: number;
  processedHeight?: number;
  processedSize?: number;
};

export interface BatchImageResizerState {
  type: 'image-resizer';
  files: ResizerFile[];
  newName: string;
  resolution: number;
  outputFormat: 'jpeg' | 'png';
  compression: boolean;
  isProcessing: boolean;
}

export const defaultResizerState: Omit<BatchImageResizerState, 'type'> = {
  files: [],
  newName: '',
  resolution: 720, // 720p max height
  outputFormat: 'jpeg',
  compression: true,
  isProcessing: false,
};

export const BatchImageResizer: React.FC<{
  state: Partial<BatchImageResizerState> | undefined;
  onChangeState: (newState: Partial<BatchImageResizerState>) => void;
  accentColor: string;
  primaryButtonTextColor: string;
}> = ({ state, onChangeState, accentColor, primaryButtonTextColor }) => {
  const currentState = { ...defaultResizerState, ...state, type: 'image-resizer' as const };
  const { files, newName, resolution, outputFormat, compression, isProcessing } = currentState;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draggedItemIndex = useRef<number | null>(null);
  const dragOverItemIndex = useRef<number | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const getFileInfo = (file: File): Promise<ResizerFile> => {
        return new Promise((resolve, reject) => {
          const previewUrl = URL.createObjectURL(file);
          const img = new Image();
          img.onload = () => {
            resolve({
              id: `${file.name}-${file.lastModified}-${Math.random()}`,
              originalFile: file,
              previewUrl,
              displayName: file.name,
              originalWidth: img.width,
              originalHeight: img.height,
              originalSize: file.size,
            });
          };
          img.onerror = (err) => {
            URL.revokeObjectURL(previewUrl);
            reject(err);
          };
          img.src = previewUrl;
        });
      };
      
      const newFiles = Array.from(event.target.files);
      const detailedFiles = await Promise.all(newFiles.map(getFileInfo));
      onChangeState({ files: [...files, ...detailedFiles] });
    }
  };
  
  const handleReset = () => {
    onChangeState({
      ...defaultResizerState,
    });
  };
  
  const resizeImage = (file: File, maxHeight: number, format: 'jpeg' | 'png', enableCompression: boolean): Promise<{blob: Blob, width: number, height: number}> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          
          // Cap the height, maintaining aspect ratio.
          if (height > maxHeight) {
            const ratio = maxHeight / height;
            width = width * ratio;
            height = maxHeight;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return reject(new Error('Could not get canvas context'));
          
          if (format === 'jpeg') {
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);
          }

          ctx.drawImage(img, 0, 0, width, height);
          const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
          // PNG quality is ignored (lossless), so we only apply it for JPEG
          const quality = mimeType === 'image/jpeg' ? (enableCompression ? 0.7 : 1.0) : undefined;
          
          canvas.toBlob(async (blob) => {
            if (blob) {
                resolve({blob: blob, width: Math.round(width), height: Math.round(height)});
            } else {
              reject(new Error('Canvas to Blob conversion failed'));
            }
          }, mimeType, quality);
        };
        img.onerror = reject;
        img.src = event.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    onChangeState({ isProcessing: true });
    
    const updatedFiles = [...files];
    for (let i = 0; i < updatedFiles.length; i++) {
      const file = updatedFiles[i];
      try {
        const { blob, width, height } = await resizeImage(file.originalFile, resolution, outputFormat, compression);
        
        const newExtension = outputFormat === 'jpeg' ? '.jpg' : '.png';
        let baseName;
        if (newName.trim() !== '') {
            baseName = `${newName.trim()}-${i + 1}`;
        } else {
            baseName = file.displayName.replace(/\.[^/.]+$/, "");
        }
        const newDisplayName = `${baseName}${newExtension}`;

        updatedFiles[i] = {
            ...file,
            processedBlob: blob,
            processedWidth: width,
            processedHeight: height,
            processedSize: blob.size,
            displayName: newDisplayName,
        };
        onChangeState({ files: [...updatedFiles] });
      } catch(error) {
        console.error(`Failed to process ${file.displayName}`, error);
      }
    }
    onChangeState({ isProcessing: false });
  };
  
  const handleDownload = async () => {
    const processedFiles = files.filter(f => f.processedBlob);
    if (processedFiles.length === 0) return;

    try {
        const zip = new JSZip();
        processedFiles.forEach(file => {
            zip.file(file.displayName, file.processedBlob as Blob);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        
        const baseName = newName.trim() !== '' ? newName.trim() : 'resized-images';
        const zipFileName = `${baseName}(1-${processedFiles.length}).zip`;

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
  
  const handleSingleDownload = (fileToDownload: ResizerFile) => {
    if (!fileToDownload.processedBlob) return;

    const link = document.createElement('a');
    link.href = URL.createObjectURL(fileToDownload.processedBlob);
    link.download = fileToDownload.displayName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
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
    let _files = [...files];
    const draggedItemContent = _files.splice(draggedItemIndex.current, 1)[0];
    _files.splice(dragOverItemIndex.current, 0, draggedItemContent);
    draggedItemIndex.current = null;
    dragOverItemIndex.current = null;
    onChangeState({ files: _files });
  };

  return (
    <div className="w-full h-full flex flex-col gap-4 text-black overflow-hidden">
      <input type="file" multiple accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
      <div className="flex gap-2 w-full">
        <button onClick={() => fileInputRef.current?.click()} className="flex-grow bg-gray-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors text-lg">
          Upload Images
        </button>
        <button onClick={handleReset} className="flex-shrink-0 bg-gray-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-600 transition-colors text-lg">
          Reset
        </button>
      </div>

      <div className="flex items-center gap-2">
        <input type="text" value={newName} onChange={(e) => onChangeState({ newName: e.target.value })} placeholder="New base name (optional)" className="w-full p-2 rounded-md border border-gray-400 bg-white focus:ring-2 focus:ring-black focus:outline-none" />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
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
        <button onClick={handleProcess} disabled={files.length === 0 || isProcessing} style={{ backgroundColor: accentColor, color: primaryButtonTextColor }} className="flex-grow font-bold py-2 px-4 rounded-lg hover:opacity-90 transition-opacity disabled:bg-gray-400 disabled:cursor-not-allowed">
            {isProcessing ? 'Processing...' : 'Process'}
        </button>
        <button onClick={handleDownload} disabled={isProcessing || !files.some(f => f.processedBlob)} className="flex-grow bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed">
            Download
        </button>
      </div>
      
      <div ref={scrollContainerRef} className="flex-grow bg-black/10 rounded-lg p-2 overflow-y-auto min-h-0 hide-scrollbar">
        {files.length === 0 ? (
           <div className="flex items-center justify-center h-full text-gray-500">Image previews will appear here.</div>
        ) : (
          <>
            <div className="text-xs text-gray-500 font-mono mb-2 px-1">
              {files.length} {files.length === 1 ? 'Image' : 'Images'}
            </div>
            <ul className="space-y-2">
              {files.map((file, index) => (
                <li 
                  key={file.id}
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
                  <img src={file.previewUrl} alt="preview" className="w-32 aspect-[16/9] object-cover rounded-md flex-shrink-0 bg-gray-300" />
                  <div className="flex-grow grid grid-cols-2 gap-x-2 items-center">
                      <p className="col-span-2 text-sm truncate font-sans font-bold" title={file.displayName}>{file.displayName}</p>
                      <div className="text-gray-600">
                          {file.originalWidth && file.originalHeight && (
                              <p>Original: {file.originalWidth}x{file.originalHeight}, {formatBytes(file.originalSize)}</p>
                          )}
                      </div>
                      <div className="text-green-700 font-semibold">
                          {file.processedWidth && file.processedHeight && (
                              <p>Processed: {file.processedWidth}x{file.processedHeight}, {formatBytes(file.processedSize)}</p>
                          )}
                      </div>
                  </div>
                  {file.processedBlob && (
                    <button 
                      onClick={() => handleSingleDownload(file)} 
                      title={`Download ${file.displayName}`}
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
