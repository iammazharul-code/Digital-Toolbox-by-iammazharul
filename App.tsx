import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { BatchImageResizer, BatchImageResizerState } from './components/BatchImageResizer';
import { VideoFrameExtractor, VideoFrameExtractorState } from './components/VideoFrameExtractor';
import { GitManager, GitManagerState } from './components/GitManager';
import { ScreenSizeChecker, ScreenSizeCheckerState } from './components/ScreenSizeChecker';
import { QuickNote } from './components/QuickNote';

// Define types for our data structures
type SmartSwitchItem = {
  key: string;
};

type Column = {
  id: number;
  items: SmartSwitchItem[];
};

// --- Tool Specific Types ---
type NoteState = { title: string; body: string };
type ToolState = BatchImageResizerState | VideoFrameExtractorState | GitManagerState | ScreenSizeCheckerState;

const itemsPerColumn = 3;
const initialColumnsCount = 8; // Start with a reasonable number of columns
const columnsToAdd = 4; // How many columns to add at a time

// Helper to generate a batch of new columns
const generateColumns = (count: number, startIndex: number): Column[] => {
  return Array.from({ length: count }, (_, i) => {
    const id = startIndex + i;
    return {
      id,
      items: Array.from({ length: itemsPerColumn }, (_, itemIndex) => ({
        key: `item-${id}-${itemIndex}`,
      })),
    };
  });
};

const parseKey = (key: string): { col: number; row: number } | null => {
  const parts = key.split('-');
  if (parts.length === 3 && parts[0] === 'item') {
    const col = parseInt(parts[1], 10);
    const row = parseInt(parts[2], 10);
    if (!isNaN(col) && !isNaN(row)) {
      return { col, row };
    }
  }
  return null;
};

// Hook to detect if the screen is in a mobile-like (vertical) orientation
const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return isMobile;
};

// --- Color Theming ---
const colorOptions = [
  { name: 'Yellow', hex: '#FBBF24' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Green', hex: '#22C55E' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Purple', hex: '#8B5CF6' },
];

// Helper to determine if black or white text should be used on a given hex background
const getContrastingTextColor = (hex: string): string => {
  if (!hex.startsWith('#')) return '#000000'; // Default to black
  let color = hex.substring(1);
  if (color.length === 3) {
    color = color.split('').map(char => char + char).join('');
  }
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  // Calculate luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF'; // Use black on light, white on dark
};

// Generates a moderately light shade for active tabs
const generateActiveTabShade = (hex: string): string => {
  if (!hex.startsWith('#')) return '#FFFFFF';
  let color = hex.substring(1);
  if (color.length === 3) {
    color = color.split('').map(char => char + char).join('');
  }
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const add = 80;
  const newR = Math.min(255, r + add).toString(16).padStart(2, '0');
  const newG = Math.min(255, g + add).toString(16).padStart(2, '0');
  const newB = Math.min(255, b + add).toString(16).padStart(2, '0');
  return `#${newR}${newG}${newB}`;
};

// Generates a very light shade for inactive tabs
const generateEvenLighterShade = (hex: string): string => {
  if (!hex.startsWith('#')) return '#FFFFFF';
  let color = hex.substring(1);
  if (color.length === 3) {
    color = color.split('').map(char => char + char).join('');
  }
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  const add = 130;
  const newR = Math.min(255, r + add).toString(16).padStart(2, '0');
  const newG = Math.min(255, g + add).toString(16).padStart(2, '0');
  const newB = Math.min(255, b + add).toString(16).padStart(2, '0');
  return `#${newR}${newG}${newB}`;
};


const App: React.FC = () => {
  const isMobile = useIsMobile();
  const [columns, setColumns] = useState<Column[]>(() => generateColumns(initialColumnsCount, 0));
  const [activeSwitches, setActiveSwitches] = useState<Set<string>>(new Set());
  const [gearRotation, setGearRotation] = useState(0);
  
  const [openTools, setOpenTools] = useState<string[]>([]);
  const [visibleTools, setVisibleTools] = useState<string[]>([]);
  const [closingTools, setClosingTools] = useState<string[]>([]);

  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({});
  const [noteStates, setNoteStates] = useState<Record<string, NoteState>>({});

  const toolInfo: Record<number, { title: string; description: string; }> = {
    1: {
        title: 'Batch Image Resizer',
        description: "Resize, rename, and compress multiple images. Convert to JPG/PNG."
    },
    2: {
        title: 'Video Frame Grabber',
        description: "Quickly extract multiple still frames from video files. Batch rename or resize extracted frames."
    },
    3: {
        title: 'Git Manager',
        description: "Preview files and copy links of any public GitHub Pages repository."
    },
    4: {
        title: 'Screen Size Checker',
        description: "Test website responsiveness across a variety of device screen sizes."
    }
  };

  const [baseColor, setBaseColor] = useState(colorOptions[0].hex);
  const [tabColors, setTabColors] = useState<Record<string, { inactive: string; active: string }>>({});
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);
  const nextColumnIdRef = useRef(initialColumnsCount);
  const itemRefs = useRef(new Map<string, HTMLButtonElement | null>());

  const handleTabClick = (key: string) => {
    const isCurrentlyActive = activeSwitches.has(key);

    const pos = parseKey(key);
    const switchNumber = pos ? (pos.col * itemsPerColumn + pos.row + 1) : 0;
    const currentToolInfo = toolInfo[switchNumber];
    const isNoteTab = !currentToolInfo;

    if (isCurrentlyActive) {
      setActiveSwitches(new Set());
    } else {
       if (isNoteTab) {
          setActiveSwitches(new Set([key]));
       } else {
          setActiveSwitches(new Set([key]));
       }
    }
  };

  const handleOpenTool = (key: string) => {
    if (openTools.includes(key) || closingTools.includes(key)) return;
    setVisibleTools(prev => [...prev, key]);
    setTimeout(() => {
      setOpenTools(prev => [...prev, key]);
    }, 50);
    setActiveSwitches(new Set());
  };

  const handleCloseTool = (keyToClose: string) => {
    setClosingTools(prev => [...prev, keyToClose]);
    setOpenTools(prev => prev.filter(key => key !== keyToClose));
    setActiveSwitches(new Set([keyToClose]));
    setTimeout(() => {
      setVisibleTools(prev => prev.filter(key => key !== keyToClose));
      setClosingTools(prev => prev.filter(key => key !== keyToClose));
    }, 500);
  };
  
  const updateNoteState = (key: string, newNote: NoteState) => {
    setNoteStates(prev => ({
        ...prev,
        [key]: newNote,
    }));
  };
  
  const updateToolState = (key: string, newState: Partial<ToolState>) => {
    setToolStates(prev => {
        const existingState = prev[key] || {};
        return {
            ...prev,
            [key]: {
                ...existingState,
                ...newState,
            } as ToolState
        };
    });
  };

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    setGearRotation((isMobile ? container.scrollTop : container.scrollLeft) / 5);
    if (isLoadingRef.current) return;
    let shouldLoadMore = false;
    if (isMobile) {
      const { scrollHeight, clientHeight, scrollTop } = container;
      const buffer = clientHeight;
      if (scrollHeight > 0 && scrollTop + clientHeight >= scrollHeight - buffer) shouldLoadMore = true;
    } else {
      const { scrollWidth, clientWidth, scrollLeft } = container;
      const buffer = clientWidth;
      if (scrollWidth > 0 && scrollLeft + clientWidth >= scrollWidth - buffer) shouldLoadMore = true;
    }
    if (shouldLoadMore) {
      isLoadingRef.current = true;
      const newColumns = generateColumns(columnsToAdd, nextColumnIdRef.current);
      nextColumnIdRef.current += columnsToAdd;
      setColumns(prev => [...prev, ...newColumns]);
    }
  }, [isMobile]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => {
      container.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);
  
  // Middle-mouse-button panning for desktop
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || isMobile) return;

    const panState = { isPanning: false, startX: 0, scrollLeftStart: 0 };

    const handleMouseDown = (e: MouseEvent) => {
        if (e.button !== 1) return; // Middle mouse button
        e.preventDefault();

        panState.isPanning = true;
        panState.startX = e.pageX;
        panState.scrollLeftStart = container.scrollLeft;
        
        container.style.cursor = 'grabbing';
        container.style.userSelect = 'none';

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!panState.isPanning) return;
        e.preventDefault();
        const walk = e.pageX - panState.startX;
        container.scrollLeft = panState.scrollLeftStart - walk;
    };

    const handleMouseUp = (e: MouseEvent) => {
        if (e.button !== 1 || !panState.isPanning) return;
        e.preventDefault();
        
        panState.isPanning = false;
        container.style.cursor = 'grab';
        container.style.userSelect = 'auto';

        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    container.addEventListener('mousedown', handleMouseDown);

    return () => {
        container.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isMobile]);

  useEffect(() => { isLoadingRef.current = false; }, [columns]);

  const handleStarButtonPress = () => {
    const container = scrollContainerRef.current;
    if (container) container.scrollTo(isMobile ? { top: 0, behavior: 'smooth' } : { left: 0, behavior: 'smooth' });
  };
  
  const isSidebarOn = activeSwitches.has('sidebar');

  // --- Data Preparation for Rendering ---
  const { gridColumns, allItems } = useMemo(() => {
    const allItemsList = columns.flatMap(c => c.items);
    const gridItems: SmartSwitchItem[] = [];
    if (isMobile) {
        gridItems.push(...allItemsList);
    } else {
        gridItems.push(...allItemsList);
    }
    const finalGridColumns: Column[] = [];
    const itemsToGrid = isMobile ? allItemsList : gridItems;
    for (let i = 0; i < itemsToGrid.length; i += itemsPerColumn) {
        finalGridColumns.push({ id: i / itemsPerColumn, items: itemsToGrid.slice(i, i + itemsPerColumn) });
    }
    return { gridColumns: finalGridColumns, allItems: allItemsList };
  }, [columns, isMobile]);
  
  // --- Color Theming Effects ---
  useEffect(() => {
    const newTabColors: Record<string, { inactive: string; active: string }> = {};
    allItems.forEach(item => {
      newTabColors[item.key] = {
        inactive: generateEvenLighterShade(baseColor),
        active: generateActiveTabShade(baseColor)
      };
    });
    setTabColors(newTabColors);
  }, [baseColor, allItems]);

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isSidebarOn) return;
    e.preventDefault();
    setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
  };
  
  const handleColorSelect = (color: string) => {
    setBaseColor(color);
    setContextMenu({ ...contextMenu, visible: false });
  };

  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu.visible) setContextMenu({ ...contextMenu, visible: false });
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('contextmenu', handleClickOutside, true);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('contextmenu', handleClickOutside, true);
    };
  }, [contextMenu]);

  // --- Layout & Sizing Configs ---
  const desktopSizeConfig = { gapClass: 'gap-4', sidebarOff: '18rem', sidebarOn: '50rem', gapValue: '1rem' };
  const mobileSizeConfig = { gapClass: 'gap-4', sidebarOff: '6rem', sidebarOn: '20rem', gapValue: '1rem', itemHeight: '8rem' };
  const gapClass = isMobile ? mobileSizeConfig.gapClass : desktopSizeConfig.gapClass;
  const currentSidebarWidth = isSidebarOn ? desktopSizeConfig.sidebarOn : desktopSizeConfig.sidebarOff;
  const gapRem = parseFloat(desktopSizeConfig.gapValue);
  const columnWidthRem = parseFloat(desktopSizeConfig.sidebarOff) * 2;
  const toolPanelWidthCss = `(100vh - ${gapRem * 2}rem)`;
  
  const openToolsCount = openTools.length;
  const closingToolsCount = closingTools.length;
  const visibleToolsCount = visibleTools.length;

  const openToolsWidth = `calc(${openToolsCount} * (${toolPanelWidthCss} + ${desktopSizeConfig.gapValue}))`;
  const gridContainerWidthRem = gridColumns.length > 0 ? (gridColumns.length * columnWidthRem) + ((gridColumns.length - 1) * gapRem) : 0;
  const totalContentWidth = `calc(${currentSidebarWidth} + ${desktopSizeConfig.gapValue} + ${openToolsWidth} + ${gridContainerWidthRem}rem)`;
  
  const allMobileItems = columns.flatMap(c => c.items);
  const numRows = allMobileItems.length; // Single column layout
  const itemHeightRem = parseFloat(mobileSizeConfig.itemHeight);
  const mobileGapRem = parseFloat(mobileSizeConfig.gapValue);
  const totalGridHeightRem = (numRows * itemHeightRem) + (Math.max(0, numRows - 1) * mobileGapRem);
  const currentSidebarHeight = isSidebarOn ? mobileSizeConfig.sidebarOn : mobileSizeConfig.sidebarOff;
  const totalContentHeight = `calc(${currentSidebarHeight} + ${mobileSizeConfig.gapValue} + ${totalGridHeightRem}rem)`;
  
  const primaryButtonTextColor = getContrastingTextColor(baseColor);
  
  return (
    <div className="h-screen w-screen bg-black text-white overflow-hidden">
      {contextMenu.visible && (
        <div style={{ top: contextMenu.y, left: contextMenu.x }} className="fixed z-50 bg-gray-800 border border-gray-600 rounded-md shadow-lg p-2">
          <ul className="flex flex-col gap-1">
            {colorOptions.map(color => (
              <li key={color.name}>
                <button onClick={() => handleColorSelect(color.hex)} className="w-full text-left px-3 py-1 rounded text-white hover:bg-gray-700 flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full border border-gray-400" style={{ backgroundColor: color.hex }}></span>
                  {color.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button onClick={handleStarButtonPress} className="fixed bottom-4 left-4 sm:bottom-8 sm:left-8 z-50 p-4 bg-black rounded-full text-white hover:bg-gray-800 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-white" aria-label="Scroll to start">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8 sm:h-10 sm:w-10" style={{ transform: `rotate(${gearRotation}deg)` }}>
          <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
        </svg>
      </button>

      <div ref={scrollContainerRef} className={`h-full w-full p-4 hide-scrollbar ${isMobile ? 'overflow-y-auto' : 'overflow-x-auto cursor-grab'}`}>
        <div className={`relative ${isMobile ? 'w-full' : 'h-full'}`} style={isMobile ? { height: totalContentHeight } : { width: totalContentWidth }}>
          <div ref={mainContentRef} className={`relative z-10 w-full h-full ${isMobile ? 'flex flex-col' : 'flex'} ${gapClass}`}>
            <button
              ref={el => { itemRefs.current.set('sidebar', el); }}
              onClick={() => handleTabClick('sidebar')}
              onContextMenu={handleContextMenu}
              style={isMobile ? { height: currentSidebarHeight, flexShrink: 0, ...(!isSidebarOn && { backgroundColor: baseColor }) } : { width: currentSidebarWidth, flexShrink: 0, ...(!isSidebarOn && { backgroundColor: baseColor })}}
              className={`relative flex justify-center p-4 shadow-lg transition-all duration-500 ease-in-out rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 ${isSidebarOn ? 'items-start bg-red-500 focus:ring-red-400' : 'items-center focus:ring-white'}`}
              role="switch"
              aria-checked={isSidebarOn}
              aria-label="Side bar"
            >
              {isSidebarOn ? (
                <>
                  <button onClick={(e) => { e.stopPropagation(); handleTabClick('sidebar'); }} className="absolute top-4 right-4 p-2 rounded-full bg-black text-white hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-white z-20" aria-label="Close Side bar">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </>
              ) : (
                <span className="text-black font-mono text-xl font-bold">Side bar</span>
              )}
            </button>

            {isMobile ? (
              // --- MOBILE LAYOUT ---
              visibleTools.length > 0 ? (
                // --- MOBILE: TOOL VIEW ---
                visibleTools.map(itemKey => {
                  const item = allItems.find(i => i.key === itemKey);
                  if (!item) return null;

                  const isVisible = openTools.includes(itemKey);
                  const pos = parseKey(item.key);
                  const switchNumber = pos ? (pos.col * itemsPerColumn + pos.row + 1) : 0;
                  const currentToolInfo = toolInfo[switchNumber];
                  const isToolTab = !!currentToolInfo;

                  const baseToolTitle = isToolTab ? (currentToolInfo.title) : `Tab ${switchNumber.toString().padStart(2, '0')}`;
                  const prefixedToolTitle = `${switchNumber.toString().padStart(2, '0')}# ${baseToolTitle}`;
                  const toolDescription = isToolTab ? currentToolInfo.description : null;

                  return (
                    <div
                      key={`tool-wrapper-${itemKey}`}
                      style={{
                        height: isVisible ? '80vh' : '0px',
                        transition: 'height 500ms ease-in-out',
                        flexShrink: 0,
                      }}
                      className="w-full overflow-hidden"
                    >
                      <div
                        style={{
                          transform: `translateY(${isVisible ? '0px' : '20px'})`,
                          opacity: isVisible ? 1 : 0,
                          transition: 'transform 500ms ease-in-out, opacity 300ms ease-in-out',
                        }}
                        className="h-full w-full bg-white rounded-xl p-4 flex flex-col items-start gap-4 shadow-2xl"
                      >
                        <div className="flex justify-between items-start w-full flex-shrink-0">
                          <div>
                            <h2 className="text-black font-mono text-xl font-bold">{prefixedToolTitle}</h2>
                            {toolDescription && <p className="text-black/70 text-sm mt-1">{toolDescription}</p>}
                          </div>
                          <button onClick={() => handleCloseTool(item.key)} className="p-1 rounded-full bg-black text-white hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-white flex-shrink-0" aria-label={`Close ${baseToolTitle}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                        <div className="w-full h-[1.5px] bg-black bg-opacity-30 flex-shrink-0"></div>
                        <div className="w-full flex-grow relative min-h-0">
                          {switchNumber === 1 && <BatchImageResizer state={toolStates[item.key] as BatchImageResizerState | undefined} onChangeState={(newState) => updateToolState(item.key, { ...newState, type: 'image-resizer' })} accentColor={baseColor} primaryButtonTextColor={primaryButtonTextColor} />}
                          {switchNumber === 2 && <VideoFrameExtractor state={toolStates[item.key] as VideoFrameExtractorState | undefined} onChangeState={(newState) => updateToolState(item.key, { ...newState, type: 'video-extractor' })} accentColor={baseColor} primaryButtonTextColor={primaryButtonTextColor} />}
                          {switchNumber === 3 && <GitManager state={toolStates[item.key] as GitManagerState | undefined} onChangeState={(newState) => updateToolState(item.key, { ...newState, type: 'git-manager' })} accentColor={baseColor} primaryButtonTextColor={primaryButtonTextColor} />}
                          {switchNumber === 4 && <ScreenSizeChecker state={toolStates[item.key] as ScreenSizeCheckerState | undefined} onChangeState={(newState) => updateToolState(item.key, { ...newState, type: 'screen-size-checker' })} accentColor={baseColor} primaryButtonTextColor={primaryButtonTextColor} />}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                // --- MOBILE: TAB LIST VIEW ---
                <div className={`flex flex-col ${gapClass} flex-grow`}>
                  {allItems.map((item) => {
                    const isCurrentlyActive = activeSwitches.has(item.key);
                    const pos = parseKey(item.key);
                    const switchNumber = pos ? (pos.col * itemsPerColumn + pos.row + 1) : 0;
                    const currentToolInfo = toolInfo[switchNumber];
                    const isToolTab = !!currentToolInfo;
                    
                    const tabTitle = currentToolInfo?.title ?? '';
                    const tabDescription = currentToolInfo?.description ?? null;
                    
                    const colors = tabColors[item.key];
                    
                    let backgroundColor;
                    if (isCurrentlyActive) {
                        backgroundColor = baseColor;
                    } else {
                        backgroundColor = isToolTab ? colors?.inactive : '#FFFFFF';
                    }

                    const baseTextColorStyle = isCurrentlyActive ? { color: getContrastingTextColor(baseColor) } : {};
                    const textColorClass = isToolTab ? (isCurrentlyActive ? '' : 'text-black') : 'text-black/30';
                    const separatorColor = isToolTab && isCurrentlyActive ? (getContrastingTextColor(baseColor) === '#FFFFFF' ? 'bg-white/30' : 'bg-black/20') : isToolTab ? 'bg-black/20' : 'bg-black/10';
                    
                    const contentStyle = isCurrentlyActive ? { ...baseTextColorStyle, paddingBottom: '20%'} : baseTextColorStyle;

                    return (
                      <button
                        key={item.key}
                        ref={el => { itemRefs.current.set(item.key, el); }}
                        onClick={() => handleTabClick(item.key)}
                        style={{ backgroundColor: backgroundColor || '#FFFFFF', minHeight: mobileSizeConfig.itemHeight }}
                        className={`flex justify-center items-center relative z-10 rounded-xl shadow-lg transition-all duration-500 ease-in-out transform hover:scale-105 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 overflow-hidden`}
                        role="switch"
                        aria-checked={isCurrentlyActive}
                        aria-label={isToolTab ? tabTitle : `Note Tab #${switchNumber}`}
                      >
                        <span className="absolute top-2 right-3 text-xs font-mono text-black">{switchNumber.toString().padStart(2, '0')}#</span>
                        {isToolTab ? (
                          <div className={`flex flex-col items-center justify-center px-4 py-4 text-center transition-all duration-500 ${textColorClass}`} style={contentStyle}>
                            <h3 className="font-bold text-2xl">{tabTitle}</h3>
                            <div className={`w-full h-[1.5px] my-2 transition-colors duration-500 ${separatorColor}`}></div>
                            <p className={`text-xl font-mono`}>{tabDescription}</p>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTool(item.key);
                              }}
                              className={`absolute bottom-0 left-0 right-0 h-1/5 bg-white flex items-center justify-center transition-all duration-500 ease-in-out cursor-pointer ${isCurrentlyActive ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
                             >
                                <span className="text-black font-bold text-lg">Open</span>
                            </div>
                          </div>
                        ) : (
                           isCurrentlyActive ? (
                                <QuickNote
                                    value={noteStates[item.key] || { title: '', body: '' }}
                                    onChange={(newNote) => updateNoteState(item.key, newNote)}
                                    textColor={getContrastingTextColor(baseColor)}
                                />
                           ) : (
                                noteStates[item.key] && (noteStates[item.key].title || noteStates[item.key].body) && (
                                    <div className="w-full h-full p-4 overflow-y-auto text-left custom-scrollbar">
                                        {noteStates[item.key].title && <h4 className="text-black font-bold whitespace-pre-wrap break-words text-lg mb-2">{noteStates[item.key].title}</h4>}
                                        {noteStates[item.key].body && <p className="text-black whitespace-pre-wrap break-words text-sm">
                                            {noteStates[item.key].body}
                                        </p>}
                                    </div>
                                )
                           )
                        )}
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              // --- DESKTOP LAYOUT ---
              <>
                {visibleTools.map(itemKey => {
                  const item = allItems.find(i => i.key === itemKey);
                  if (!item) return null;

                  const isVisible = openTools.includes(itemKey);
                  const pos = parseKey(item.key);
                  const switchNumber = pos ? (pos.col * itemsPerColumn + pos.row + 1) : 0;
                  const currentToolInfo = toolInfo[switchNumber];
                  const isToolTab = !!currentToolInfo;

                  const baseToolTitle = isToolTab ? (currentToolInfo.title) : `Tab ${switchNumber.toString().padStart(2, '0')}`;
                  const prefixedToolTitle = `${switchNumber.toString().padStart(2, '0')}# ${baseToolTitle}`;
                  const toolDescription = isToolTab ? currentToolInfo.description : null;

                  return (
                    <div
                      key={`tool-wrapper-${itemKey}`}
                      style={{
                        width: isVisible ? `calc(${toolPanelWidthCss})` : '0px',
                        transition: 'width 500ms ease-in-out',
                        flexShrink: 0,
                      }}
                      className="h-full"
                    >
                      <div
                        style={{
                          transform: `translateY(${isVisible ? '0px' : '20px'})`,
                          opacity: isVisible ? 1 : 0,
                          transition: 'transform 500ms ease-in-out, opacity 300ms ease-in-out',
                        }}
                        className="h-full w-full bg-white rounded-xl p-4 flex flex-col items-start gap-4 shadow-2xl"
                      >
                          <div className="flex justify-between items-start w-full flex-shrink-0">
                            <div>
                                <h2 className="text-black font-mono text-xl font-bold">{prefixedToolTitle}</h2>
                                {toolDescription && <p className="text-black/70 text-sm mt-1">{toolDescription}</p>}
                            </div>
                            <button onClick={() => handleCloseTool(item.key)} className="p-1 rounded-full bg-black text-white hover:bg-gray-700 transition-colors focus:outline-none focus:ring-2 focus:ring-white flex-shrink-0" aria-label={`Close ${baseToolTitle}`}>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                          <div className="w-full h-[1.5px] bg-black bg-opacity-30 flex-shrink-0"></div>
                          <div className="w-full flex-grow relative min-h-0">
                             {switchNumber === 1 && (
                                <BatchImageResizer 
                                    state={toolStates[item.key] as BatchImageResizerState | undefined}
                                    onChangeState={(newState) => updateToolState(item.key, { ...newState, type: 'image-resizer'})}
                                    accentColor={baseColor}
                                    primaryButtonTextColor={primaryButtonTextColor}
                                />
                             )}
                             {switchNumber === 2 && (
                                <VideoFrameExtractor
                                    state={toolStates[item.key] as VideoFrameExtractorState | undefined}
                                    onChangeState={(newState) => updateToolState(item.key, { ...newState, type: 'video-extractor'})}
                                    accentColor={baseColor}
                                    primaryButtonTextColor={primaryButtonTextColor}
                                />
                             )}
                             {switchNumber === 3 && (
                                <GitManager
                                    state={toolStates[item.key] as GitManagerState | undefined}
                                    onChangeState={(newState) => updateToolState(item.key, { ...newState, type: 'git-manager'})}
                                    accentColor={baseColor}
                                    primaryButtonTextColor={primaryButtonTextColor}
                                />
                             )}
                             {switchNumber === 4 && (
                                <ScreenSizeChecker
                                    state={toolStates[item.key] as ScreenSizeCheckerState | undefined}
                                    onChangeState={(newState) => updateToolState(item.key, { ...newState, type: 'screen-size-checker'})}
                                    accentColor={baseColor}
                                    primaryButtonTextColor={primaryButtonTextColor}
                                />
                             )}
                          </div>
                      </div>
                    </div>
                  );
                })}
                {gridColumns.map((column) => {
                  const visibleItemsInColumn = column.items.filter(item => !(visibleTools.includes(item.key) && !closingTools.includes(item.key)));
                  const lastVisibleItemKey = visibleItemsInColumn.length > 0 ? visibleItemsInColumn[visibleItemsInColumn.length - 1].key : null;
                  
                  return (
                  <div key={column.id} className={`flex flex-col h-full`} style={{ width: `${columnWidthRem}rem`, flexShrink: 0 }}>
                    {column.items.map((item) => {
                      const isCurrentlyActive = activeSwitches.has(item.key);
                      const pos = parseKey(item.key);
                      const switchNumber = pos ? (pos.col * itemsPerColumn + pos.row + 1) : 0;
                      const currentToolInfo = toolInfo[switchNumber];
                      const isToolTab = !!currentToolInfo;

                      const isToolOpenOrOpening = visibleTools.includes(item.key) && !closingTools.includes(item.key);
                      const isLastVisible = item.key === lastVisibleItemKey;

                      const tabTitle = currentToolInfo?.title ?? '';
                      const tabDescription = currentToolInfo?.description ?? '';
                      
                      const expandedTabHeightClass = 'flex-[1.5_1_0%]';
                      
                      const colors = tabColors[item.key];
                      let backgroundColor;
                      if (isCurrentlyActive) {
                          backgroundColor = baseColor;
                      } else {
                          backgroundColor = isToolTab ? colors?.inactive : '#FFFFFF';
                      }

                      const baseTextColorStyle = isCurrentlyActive ? { color: getContrastingTextColor(baseColor) } : {};
                      const textColorClass = isToolTab ? (isCurrentlyActive ? '' : 'text-black') : 'text-black/30';
                      const separatorColor = isToolTab && isCurrentlyActive ? (getContrastingTextColor(baseColor) === '#FFFFFF' ? 'bg-white/30' : 'bg-black/20') : isToolTab ? 'bg-black/20' : 'bg-black/10';

                      const contentStyle = isCurrentlyActive ? { ...baseTextColorStyle, paddingBottom: '20%' } : baseTextColorStyle;

                      return (
                        <button
                          key={item.key}
                          ref={el => { itemRefs.current.set(item.key, el); }}
                          onClick={() => handleTabClick(item.key)}
                           style={{
                              backgroundColor: backgroundColor || '#FFFFFF',
                              ...(isToolOpenOrOpening && {
                                  flexBasis: 0,
                                  height: 0,
                                  minHeight: 0,
                                  opacity: 0,
                                  pointerEvents: 'none',
                                  margin: 0,
                                  padding: 0,
                                  border: 0,
                              })
                          }}
                          className={`flex justify-center items-center relative z-10 rounded-xl shadow-lg transition-all duration-500 ease-in-out transform hover:scale-103 hover:shadow-2xl focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-gray-900 overflow-hidden ${
                              isToolOpenOrOpening ? '' : (isCurrentlyActive ? expandedTabHeightClass : 'flex-1')
                          } ${!isToolOpenOrOpening && !isLastVisible ? 'mb-4' : ''}`}
                          role="switch"
                          aria-checked={isCurrentlyActive}
                          aria-label={isToolTab ? tabTitle : `Note Tab #${switchNumber}`}
                        >
                          <span className="absolute top-2 right-3 text-xs font-mono text-black">{switchNumber.toString().padStart(2, '0')}#</span>
                          {isToolTab ? (
                            <div className={`flex flex-col items-center justify-center w-full h-full px-16 py-4 text-center transition-all duration-500 ${textColorClass}`} style={contentStyle}>
                                <h3 className="font-bold text-3xl">{tabTitle}</h3>
                                <div className={`w-full h-[1.5px] my-2 transition-colors duration-500 ${separatorColor}`}></div>
                                <p className="font-mono text-xl">{tabDescription}</p>
                                <div
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenTool(item.key);
                                    }}
                                    className={`absolute bottom-0 left-0 right-0 h-1/5 bg-white flex items-center justify-center transition-all duration-500 ease-in-out cursor-pointer ${isCurrentlyActive ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'}`}
                                >
                                  <span className="text-black font-bold text-lg">Open</span>
                                </div>
                            </div>
                           ) : (
                               isCurrentlyActive ? (
                                    <QuickNote
                                        value={noteStates[item.key] || { title: '', body: '' }}
                                        onChange={(newNote) => updateNoteState(item.key, newNote)}
                                        textColor={getContrastingTextColor(baseColor)}
                                    />
                               ) : (
                                   noteStates[item.key] && (noteStates[item.key].title || noteStates[item.key].body) && (
                                       <div className="w-full h-full p-4 overflow-y-auto text-left custom-scrollbar">
                                           {noteStates[item.key].title && <h4 className="text-black font-bold whitespace-pre-wrap break-words text-xl mb-2">{noteStates[item.key].title}</h4>}
                                           {noteStates[item.key].body && <p className="text-black whitespace-pre-wrap break-words text-base">
                                               {noteStates[item.key].body}
                                           </p>}
                                       </div>
                                   )
                               )
                           )}
                        </button>
                      );
                    })}
                  </div>
                )})}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;