import React, { useState, useEffect, useCallback, useRef } from 'react';

// --- SVG Icons ---
const FolderIcon: React.FC<{className?: string}> = ({ className = "w-6 h-6 text-yellow-500 flex-shrink-0" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d="M2 6a2 2 0 012-2h5a2 2 0 011.666.903l1.888 2.833A2 2 0 0013.334 10H18a2 2 0 012 2v2a2 2 0 01-2 2H2a2 2 0 01-2-2V8a2 2 0 012-2z"></path>
  </svg>
);
const FileIcon: React.FC<{className?: string}> = ({ className = "w-6 h-6 text-gray-500 flex-shrink-0" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm2 4a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H9a1 1 0 01-1-1zm0 4a1 1 0 011-1h6a1 1 0 110 2H9a1 1 0 01-1-1z"></path>
  </svg>
);
const LoadingSpinner = () => (
  <div className="flex justify-center items-center h-full">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
  </div>
);


// --- Types ---
type GitFile = {
  name: string;
  path: string;
  type: 'file' | 'dir';
  download_url: string | null;
};

type RepoInfo = {
  owner: string;
  repo: string;
};

export interface GitManagerState {
  type: 'git-manager';
  repoUrl: string;
  isLoading: boolean;
  error: string | null;
  files: GitFile[];
  currentPath: string;
  repoInfo: RepoInfo | null;
  baseUrl: string;
  expandedFilePath: string | null;
  closingFilePath: string | null;
}

export const defaultGitManagerState: Omit<GitManagerState, 'type'> = {
  repoUrl: 'https://iammazharul-code.github.io/portfolio-assets/',
  isLoading: false,
  error: null,
  files: [],
  currentPath: '',
  repoInfo: null,
  baseUrl: '',
  expandedFilePath: null,
  closingFilePath: null,
};

// --- In-line File Preview Component ---
const InlineFilePreview: React.FC<{
  file: GitFile;
  baseUrl: string;
}> = ({ file, baseUrl }) => {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
  const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
  const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'ogg'];
  const TEXT_EXTENSIONS = ['txt', 'md', 'html', 'css', 'js', 'json', 'xml', 'yml', 'yaml', 'log'];

  const isImage = IMAGE_EXTENSIONS.includes(fileExtension);
  const isVideo = VIDEO_EXTENSIONS.includes(fileExtension);
  const isText = TEXT_EXTENSIONS.includes(fileExtension);
  
  const fileUrl = `${baseUrl}/${file.path}`;

  useEffect(() => {
    if (isText && file.download_url) {
      setIsLoading(true);
      setTextContent(null);
      setError(null);
      fetch(file.download_url)
        .then(res => {
          if (!res.ok) throw new Error(`Failed to fetch content: ${res.statusText}`);
          return res.text();
        })
        .then(text => {
          setTextContent(text);
          setIsLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setIsLoading(false);
        });
    }
  }, [file.path, file.download_url, isText]);

  const renderContent = () => {
    if (isLoading) return <LoadingSpinner />;
    if (error) return <p className="text-red-500">{error}</p>;

    if (isImage) {
      return <img src={fileUrl} alt={file.name} className="max-w-full max-h-[60vh] rounded-lg shadow-md mx-auto" />;
    }
    if (isVideo) {
      return <video src={fileUrl} controls autoPlay loop className="max-w-full max-h-[60vh] rounded-lg shadow-md mx-auto" />;
    }
    if (isText) {
      return <pre className="w-full h-full bg-gray-800 text-white p-4 rounded-lg text-xs overflow-auto max-h-[60vh]">{textContent}</pre>;
    }
    return <p className="text-gray-600">Preview not available for this file type.</p>;
  };
  
  return (
    <div className="w-full p-2 bg-black/5 rounded-lg mt-2 flex items-center justify-center min-h-[10rem]">
        {renderContent()}
    </div>
  );
};


// --- Main Component ---
export const GitManager: React.FC<{
  state: Partial<GitManagerState> | undefined;
  onChangeState: (newState: Partial<GitManagerState>) => void;
  accentColor: string;
  primaryButtonTextColor: string;
}> = ({ state, onChangeState, accentColor, primaryButtonTextColor }) => {
  const currentState = { ...defaultGitManagerState, ...state, type: 'git-manager' as const };
  const { repoUrl, isLoading, error, files, currentPath, repoInfo, baseUrl, expandedFilePath, closingFilePath } = currentState;
  const initialLoadAttempted = useRef(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  const parseGitHubUrl = (url: string): RepoInfo | null => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);
      const hostname = urlObj.hostname;

      let owner = '', repo = '';

      if (hostname.endsWith('.github.io')) {
        owner = hostname.split('.')[0];
        repo = pathParts[0] || owner; // Handle root repo case like user.github.io
      } else if (hostname === 'github.com' && pathParts.length >= 2) {
        owner = pathParts[0];
        repo = pathParts[1];
      } else {
        return null; // Invalid URL structure
      }
      return { owner, repo };
    } catch (e) {
      return null;
    }
  };
  
  const fetchFiles = useCallback(async (path: string, repoDetails: RepoInfo) => {
    onChangeState({ isLoading: true, error: null, currentPath: path, expandedFilePath: null, closingFilePath: currentState.expandedFilePath });
    const apiUrl = `https://api.github.com/repos/${repoDetails.owner}/${repoDetails.repo}/contents/${path}`;
    
    try {
      const response = await fetch(apiUrl);
      if (!response.ok) {
        if (response.status === 404) throw new Error('Repository not found or path is invalid. Check the URL.');
        if (response.status === 403) throw new Error('API rate limit exceeded or private repository. Please wait and try again.');
        throw new Error(`GitHub API Error: ${response.statusText}`);
      }
      const data = await response.json();
      if (!Array.isArray(data)) {
        throw new Error('Invalid response from GitHub API. Expected an array of files.');
      }
      const sortedData = data.sort((a, b) => {
        if (a.type === 'dir' && b.type !== 'dir') return -1;
        if (a.type !== 'dir' && b.type === 'dir') return 1;
        return a.name.localeCompare(b.name);
      });
      onChangeState({ files: sortedData, isLoading: false });
    } catch (err: any) {
      onChangeState({ error: err.message, isLoading: false, files: [] });
    }
  }, [onChangeState, currentState.expandedFilePath]);

  const handleLoadRepository = useCallback(() => {
    const parsedInfo = parseGitHubUrl(repoUrl);
    if (parsedInfo) {
      const url = repoUrl.endsWith('/') ? repoUrl.slice(0, -1) : repoUrl;
      onChangeState({ repoInfo: parsedInfo, baseUrl: url, expandedFilePath: null, closingFilePath: null });
      fetchFiles('', parsedInfo);
    } else {
      onChangeState({ error: 'Invalid GitHub Pages or repository URL format.', files: [] });
    }
  }, [repoUrl, onChangeState, fetchFiles]);

  useEffect(() => {
    if (!initialLoadAttempted.current && repoUrl) {
      initialLoadAttempted.current = true;
      handleLoadRepository();
    }
  }, [handleLoadRepository, repoUrl]);

  useEffect(() => {
    if (closingFilePath) {
      const timer = setTimeout(() => {
        onChangeState({ closingFilePath: null });
      }, 500); // Animation duration
      return () => clearTimeout(timer);
    }
  }, [closingFilePath, onChangeState]);
  
  const handleItemClick = (item: GitFile) => {
    if (item.type === 'dir') {
      if (repoInfo) fetchFiles(item.path, repoInfo);
    } else {
      if (expandedFilePath === item.path) {
        onChangeState({ expandedFilePath: null, closingFilePath: expandedFilePath });
      } else {
        onChangeState({ expandedFilePath: item.path, closingFilePath: expandedFilePath });
      }
    }
  };
  
  const handleBreadcrumbClick = (path: string) => {
    if (repoInfo) fetchFiles(path, repoInfo);
  }
  
  const copyToClipboard = (text: string, pathIdentifier: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedPath(pathIdentifier);
      setTimeout(() => setCopiedPath(null), 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  };

  const handleCopyAllPaths = () => {
    const filePaths = files
      .filter(file => file.type === 'file')
      .map(file => `${baseUrl}/${file.path}`)
      .join(', ');

    if (filePaths) {
      copyToClipboard(filePaths, 'all');
    }
  };
  
  const Breadcrumbs = () => {
    if (!currentPath) return null;
    const pathParts = currentPath.split('/');
    let pathAccumulator = '';
    return (
        <div className="flex items-center gap-1 text-sm text-gray-600 mb-2 px-1 flex-wrap">
            <button onClick={() => handleBreadcrumbClick('')} className="hover:underline">root</button>
            {pathParts.map((part, index) => {
                pathAccumulator += (index > 0 ? '/' : '') + part;
                const currentPathChunk = pathAccumulator;
                return (
                    <React.Fragment key={index}>
                        <span>/</span>
                        <button onClick={() => handleBreadcrumbClick(currentPathChunk)} className="hover:underline">
                            {part}
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
  };

  const renderThumbnail = (file: GitFile) => {
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
    const VIDEO_EXTENSIONS = ['mp4', 'mov', 'webm', 'ogg'];
    const isImage = IMAGE_EXTENSIONS.includes(fileExtension);
    const isVideo = VIDEO_EXTENSIONS.includes(fileExtension);
    const fileUrl = `${baseUrl}/${file.path}`;

    if (file.type === 'dir') {
        return <FolderIcon className="w-12 h-12 text-yellow-400" />;
    }
    if (isImage) {
        return <img src={fileUrl} alt={file.name} className="w-full h-full object-cover" loading="lazy" />;
    }
    if (isVideo) {
        return <video src={fileUrl} muted autoPlay loop playsInline className="w-full h-full object-cover" />;
    }
    return <FileIcon className="w-12 h-12 text-gray-400" />;
  };
  
  const renderFileContent = () => {
    if (isLoading) return <LoadingSpinner />;
    if (error) return <div className="flex items-center justify-center h-full text-red-500 font-semibold p-4 text-center">{error}</div>;
    if (files.length === 0 && !initialLoadAttempted.current) return <div className="flex items-center justify-center h-full text-gray-500">Loading initial repository...</div>;
    if (files.length === 0) return <div className="flex items-center justify-center h-full text-gray-500">Repository content will appear here.</div>;
    
    return (
      <>
        <Breadcrumbs />
        <ul className="space-y-2">
          {files.map((file) => {
            const isExpanded = expandedFilePath === file.path;
            const isClosing = closingFilePath === file.path;
            const shouldRenderPreview = isExpanded || isClosing;

            return (
              <li
                key={file.path}
                className="flex flex-col bg-white/50 p-2 rounded-md text-sm font-mono transition-all duration-300"
              >
                <div
                  onClick={() => handleItemClick(file)}
                  className="flex items-center gap-3 cursor-pointer"
                >
                  <div className="w-32 aspect-[16/9] flex-shrink-0 bg-black/10 rounded-md overflow-hidden flex items-center justify-center">
                    {renderThumbnail(file)}
                  </div>
                  <span className="flex-grow truncate font-sans font-bold" title={file.name}>
                    {file.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(`${baseUrl}/${file.path}`, file.path);
                    }}
                    className={`flex-shrink-0 font-bold py-2 px-4 rounded-lg transition-all duration-300 ${
                      copiedPath === file.path 
                      ? 'bg-green-500 text-white' 
                      : 'bg-gray-700 hover:bg-gray-600 text-white'
                    }`}
                    title={`Copy path to ${file.name}`}
                  >
                    {copiedPath === file.path ? 'Copied!' : 'Copy Path'}
                  </button>
                </div>
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isExpanded ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'}`}>
                  {shouldRenderPreview && file.type === 'file' && (
                    <InlineFilePreview file={file} baseUrl={baseUrl} />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </>
    );
  };


  return (
    <div className="w-full h-full flex flex-col gap-4 text-black overflow-hidden">
      <div className="flex items-center gap-2 w-full">
        <input 
          type="text" 
          value={repoUrl} 
          onChange={(e) => onChangeState({ repoUrl: e.target.value })} 
          placeholder="GitHub Repository URL" 
          className="w-full p-2 rounded-md border border-gray-400 bg-white focus:ring-2 focus:ring-black focus:outline-none"
        />
        <button 
          onClick={handleLoadRepository} 
          disabled={isLoading}
          style={{ backgroundColor: accentColor, color: primaryButtonTextColor }} 
          className="font-bold py-2 px-6 rounded-lg hover:opacity-90 transition-opacity disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? '...' : 'Load'}
        </button>
      </div>

      <div className="flex-grow bg-black/10 rounded-lg p-2 overflow-y-auto min-h-0 hide-scrollbar">
        {renderFileContent()}
      </div>

      <div className="flex justify-end flex-shrink-0">
        <button
          onClick={handleCopyAllPaths}
          disabled={isLoading || !files.some(f => f.type === 'file')}
          className={`font-bold py-2 px-4 rounded-lg transition-all duration-300 ${
            copiedPath === 'all'
            ? 'bg-green-500 text-white'
            : 'bg-gray-700 hover:bg-gray-600 text-white'
          } disabled:bg-gray-400 disabled:cursor-not-allowed`}
        >
          {copiedPath === 'all' ? 'Copied!' : 'Copy All Paths'}
        </button>
      </div>
    </div>
  );
};